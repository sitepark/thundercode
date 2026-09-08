import { buildCodeBlockHtml } from "../code-block/build-code-block-html.js";
import { insertIntoBody } from "../compose/insert-into-body.js";
import { measureSnippet } from "./snippet-size.js";

const sourceField = document.getElementById("source");
const insertButton = document.getElementById("insert");
const errorLine = document.getElementById("error");
const warningLine = document.getElementById("warning");

/**
 * The compose window this popup was opened from.
 *
 * A popup anchored in a compose window resolves `currentWindow` to that
 * window, so the active tab is the composer the button was clicked in — which
 * is what keeps a snippet out of the wrong email when several composers are
 * open. If the resolved tab is not a composer, we refuse rather than guess at
 * another one.
 */
async function findComposeTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.type !== "messageCompose") {
    throw new Error("No compose window found for this popup.");
  }
  return tab;
}

async function insert() {
  const tab = await findComposeTab();
  // Which of the two blocks this composer can take is a property of the
  // window, not a choice: the compose format of an open window cannot be
  // changed, and `setComposeDetails` ignores `isPlainText`. So we ask and
  // adapt rather than offering to switch, and the button works either way.
  const { isPlainText } = await browser.compose.getComposeDetails(tab.id);
  const { html, text } = buildCodeBlockHtml({ source: sourceField.value });

  if (!isPlainText) {
    // Set before the block goes in, never after. The default `"auto"` sends an
    // HTML message as plain text when it sees no formatting, which would drop
    // the block entirely; `"both"` also guarantees the plain-text alternative
    // part. Doing it first means a failure here costs an insert rather than
    // leaving an already-inserted block on a message that will downgrade it.
    //
    // Only `deliveryFormat` is passed: `setComposeDetails` rewrites the whole
    // body when handed one, which would move the caret and destroy undo.
    await browser.compose.setComposeDetails(tab.id, { deliveryFormat: "both" });
  }
  // A plain-text message is skipped deliberately: `deliveryFormat` describes
  // how an HTML message is put on the wire, and there is no HTML part here to
  // downgrade. Ticket 02 predicted this call would be rejected on a plain-text
  // composer, which the popup would then surface as an error while inserting
  // nothing — the button looking broken in exactly the window this ticket is
  // about. Not making the call is both the fix and the honest description.

  const [injection] = await browser.scripting.executeScript({
    target: { tabId: tab.id },
    func: insertIntoBody,
    args: [{ content: isPlainText ? text : html, isPlainText }],
  });
  if (injection.error) {
    throw injection.error;
  }
}

/**
 * Advisory, and structurally so: this function writes to the warning line and
 * to nothing else. It never touches `insertButton.disabled`, and neither does
 * the insert path read the warning — emailing three thousand lines of code is a
 * mistake worth mentioning and not one worth preventing. Ticket 02 removed the
 * last thing that gated Insert on the textarea's contents; this is not quietly
 * putting one back, and there is no size at which it starts to.
 *
 * Recomputed from scratch on every `input`, which covers paste, typing, cut and
 * undo alike. That is also what clears the warning again when the content drops
 * back under the threshold: there is no separate hide path to forget to call.
 */
function refreshSizeWarning() {
  const { lineCount, isLarge } = measureSnippet(sourceField.value);
  warningLine.textContent = isLarge
    ? `${lineCount} lines. The block carries all its formatting inline, so ` +
      `the inserted HTML will be several times the size of the source. ` +
      `This is a heads-up, not a limit.`
    : "";
  warningLine.hidden = !isLarge;
}

sourceField.addEventListener("input", refreshSizeWarning);
// Once at load as well: `input` does not fire for a textarea that arrives
// already filled, which is how the popup opens from a right-click on a
// selection.
refreshSizeWarning();

insertButton.addEventListener("click", async () => {
  insertButton.disabled = true;
  errorLine.hidden = true;
  try {
    await insert();
    window.close();
  } catch (error) {
    errorLine.textContent = String(error?.message ?? error);
    errorLine.hidden = false;
    insertButton.disabled = false;
  }
});
