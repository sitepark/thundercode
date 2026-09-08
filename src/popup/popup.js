import hljs from "../../vendor/highlight.js/common.js";
import { buildCodeBlockHtml } from "../code-block/build-code-block-html.js";
import { insertIntoBody } from "../compose/insert-into-body.js";
import { readSettings } from "../settings/settings.js";
import { measureSnippet } from "./snippet-size.js";
import { loadThemeMap } from "./theme-map.js";

const sourceField = document.getElementById("source");
const languageField = document.getElementById("language");
const insertButton = document.getElementById("insert");
const errorLine = document.getElementById("error");
const warningLine = document.getElementById("warning");

/**
 * Tab width and font size, read once as the popup opens.
 *
 * Kept as the promise rather than awaited into a variable: the read starts
 * immediately, so it is long finished by the time anyone has pasted anything,
 * and awaiting it inside the insert removes the window where a fast Insert
 * would find it not yet loaded. Re-reading per insert would buy freshness
 * nobody can use — the popup is closed while the options page is open.
 */
const settings = readSettings();

/**
 * Started at load, awaited at insert. Reading the theme is asynchronous — the
 * stylesheet has to have finished parsing — but it does not depend on anything
 * the user does, so kicking it off now means the wait has almost always
 * already elapsed by the time Insert is pressed.
 *
 * Held as the promise rather than resolved into a variable so there is no
 * moment where the map is "not ready yet" and something has to decide what to
 * do about it.
 */
const themeMap = loadThemeMap(document.getElementById("theme"));

/**
 * The dropdown is the bundle's own language list, read back from it rather
 * than written out here. A hand-kept list would drift from what is actually
 * registered the first time the vendored bundle is bumped, and the failure
 * would be an entry that throws or a language quietly missing from the menu.
 *
 * Labels come from the same place. `getLanguage(id).name` is the display name
 * upstream ships for each language, so "cpp" reads as "C++" without this file
 * owning a translation table.
 */
function fillLanguageDropdown() {
  const options = hljs
    .listLanguages()
    .map((id) => ({ id, label: hljs.getLanguage(id).name ?? id }))
    .sort((a, b) => a.label.localeCompare(b.label));

  for (const { id, label } of options) {
    languageField.add(new Option(label, id));
  }

  // Plain text, deliberately, and not the last language used. Nothing detects
  // yet, so any other default would be a guess presented as an answer — and
  // the spec is explicit that the dropdown must never remember a previous
  // choice, because that is how auto-detection stops working without anyone
  // noticing. Ticket 04 replaces this default with the detected language.
  languageField.value = "plaintext";
}

fillLanguageDropdown();

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

  // Both settings arrive resolved — `readSettings` falls back to the seam's
  // defaults for anything unset or unusable — so there is nothing to check
  // here, and no branch for "settings never configured".
  const { tabWidth, fontSize } = await settings;

  // The theme is passed in as data, always, even for the plain-text composer
  // that will not use it. Branching on `isPlainText` here would put a second
  // reason to know about the composer's format into the one call that should
  // not care: the seam already renders both and the caller picks.
  const { html, text } = buildCodeBlockHtml({
    source: sourceField.value,
    language: languageField.value,
    themeMap: await themeMap,
    tabWidth,
    fontSize,
  });

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
// Once at load as well, so the warning line starts in a state this function
// owns rather than one the markup guessed at. The right-click prefill lands
// later and calls it again for itself: assigning `value` from script does not
// fire `input`.
refreshSizeWarning();

/**
 * Right-click path: the menu handler parks the selected text against the
 * compose tab and opens this popup, which claims it here. The background drops
 * the text as it hands it over, so a toolbar or shortcut open — which parks
 * nothing — gets an empty string and the popup opens empty.
 *
 * The prefill is the convenient path, not the reliable one. `selectionText` is
 * plain text extracted from HTML, so whatever indentation it arrives with is
 * whatever survived that extraction. Pasting over it is still the path that
 * gives the block its indentation back.
 */
async function claimSelectionPrefill() {
  const tab = await findComposeTab();
  const selectionText = await browser.runtime.sendMessage({
    type: "thundercode:take-pending-selection",
    tabId: tab.id,
  });
  if (typeof selectionText !== "string" || selectionText === "") {
    return;
  }
  sourceField.value = selectionText;
  refreshSizeWarning();
}

// Deliberately silent on failure. A prefill that does not arrive leaves an
// empty textarea, which is exactly what the toolbar button opens anyway; an
// error line here would report a broken convenience as a broken popup.
claimSelectionPrefill().catch(() => {});

/**
 * The one path from "confirm" to a closed popup, shared by the button and the
 * keyboard. Both entry points have to behave identically, including the error
 * branch — a shortcut that silently does nothing is worse than one that does
 * not exist.
 */
async function confirmInsert() {
  if (insertButton.disabled) {
    return; // An insert is already in flight; a second Ctrl+Enter is a no-op.
  }
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
}

insertButton.addEventListener("click", confirmInsert);

// Ctrl+Enter confirms, so paste-and-insert never needs the mouse. Bound on the
// document rather than the textarea so it also works once focus has moved to
// the button.
//
// `preventDefault` is load-bearing, not tidiness: the compose window binds
// Ctrl+Enter to Send, and a chrome `<key>` still fires for a key press that
// started inside an extension popup unless the popup consumes the event. Miss
// this and the shortcut sends the message.
//
// `metaKey` is accepted alongside `ctrlKey` because on macOS the same gesture
// is Cmd+Enter — the manifest's `Ctrl` is likewise read as Command there.
document.addEventListener("keydown", event => {
  if (event.key !== "Enter" || !(event.ctrlKey || event.metaKey)) {
    return;
  }
  event.preventDefault();
  void confirmInsert();
});
