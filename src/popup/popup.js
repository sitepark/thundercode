import { buildCodeBlockHtml } from "../code-block/build-code-block-html.js";
import { insertIntoBody } from "../compose/insert-into-body.js";

const sourceField = document.getElementById("source");
const insertButton = document.getElementById("insert");
const errorLine = document.getElementById("error");

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
  const { html } = buildCodeBlockHtml({ source: sourceField.value });

  // Set before the block goes in, never after. The default `"auto"` sends an
  // HTML message as plain text when it sees no formatting, which would drop
  // the block entirely; `"both"` also guarantees the plain-text alternative
  // part. Doing it first means a failure here costs an insert rather than
  // leaving an already-inserted block on a message that will downgrade it.
  //
  // Only `deliveryFormat` is passed: `setComposeDetails` rewrites the whole
  // body when handed one, which would move the caret and destroy undo.
  await browser.compose.setComposeDetails(tab.id, { deliveryFormat: "both" });

  const [injection] = await browser.scripting.executeScript({
    target: { tabId: tab.id },
    func: insertIntoBody,
    args: [html],
  });
  if (injection.error) {
    throw injection.error;
  }
}

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
