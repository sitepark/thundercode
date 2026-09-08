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
const previewPane = document.getElementById("preview");

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

/**
 * How long the popup waits for typing to stop before re-rendering, in
 * milliseconds.
 *
 * The seam is not free: highlighting is a scan over the whole snippet, and the
 * snippet may be hundreds of lines. Rendering on every keystroke would do that
 * work once per character and throw all but the last result away.
 *
 * A trailing debounce is the simplest thing that fixes it, and the only thing
 * tried. `requestIdleCallback` would schedule better and would also mean a
 * preview that never appears at all while someone keeps typing; re-highlighting
 * only the changed region is not something highlight.js offers. 150ms is longer
 * than the gap between keystrokes of anyone typing fast, so a burst collapses
 * into one render, and short enough that the preview still reads as immediate
 * after a pause. Nothing measured it — it is a threshold, not a boundary, and
 * the dominant path is a single paste, where the cost is one render either way.
 */
const PREVIEW_DEBOUNCE_MS = 150;

let previewTimer;

/**
 * Guards against an older render finishing after a newer one. Incremented by
 * every call to `renderPreview` and compared across its awaits.
 */
let previewGeneration = 0;

/**
 * Renders the preview from the same call the insert makes.
 *
 * This is the whole of the ticket: `html` here is not a rendering *like* the
 * one that gets inserted, it is the string that will be. The seam is pure, so
 * the same source, language, theme map and settings cannot produce two
 * different blocks — which is why the preview can be trusted, and why there is
 * deliberately no preview stylesheet and no simplified preview markup anywhere
 * in this popup. A second rendering path would be a second thing to keep
 * correct, and its drift would show up as a preview that was accurate right up
 * until the day it mattered.
 *
 * The obvious tension is that this puts a built HTML string into a live
 * document, which is the shape of an injection bug. Three things make it not
 * one, and it is worth saying which of them is the real defence:
 *
 * - The string is not user HTML. It is the seam's output, and the seam escapes
 *   every `&`, `<` and `>` in the source before it becomes markup — a test
 *   pins that — so pasted markup arrives as text. This is the guarantee that
 *   matters, and it is the same one the message body already relies on.
 * - It is parsed inertly, by `DOMParser` into a detached document, and only
 *   the resulting `<pre>` is adopted. A parse is not an execution: no script
 *   runs, no `src` is fetched, no handler attribute is honoured, and that holds
 *   whatever the string turns out to contain. `innerHTML` on the live document
 *   would be one line shorter and would also fetch an `<img src>` if the seam
 *   ever emitted one.
 * - The popup is an extension page under the default MV3 CSP, so inline script
 *   could not run here even if something managed to write it in.
 */
async function renderPreview() {
  // An empty textarea shows nothing — not the bordered empty box the seam
  // returns for empty source, and not an error either. There is nothing to
  // preview before anything has been pasted, and a box appearing the moment
  // the popup opens would read as the block already existing.
  //
  // Literally empty, not whitespace-only. Source that is all spaces *does*
  // insert an empty bordered box, and a preview that hid it would be lying
  // about the one thing this element exists to tell the truth about.
  if (sourceField.value === "") {
    hidePreview();
    return;
  }

  // Both promises were started at load and are long resolved by the time
  // anyone has pasted anything. They are awaited here rather than kept in a
  // variable for the same reason the insert awaits them: there is then no
  // state where this has to decide what a not-yet-loaded theme means.
  const generation = ++previewGeneration;
  const { tabWidth, fontSize } = await settings;
  const resolvedThemeMap = await themeMap;
  // A newer render was scheduled while this one waited. Dropping the stale one
  // keeps an older render from being the one left on screen: with a debounce in
  // front this is close to unreachable, but "close to" is not a property worth
  // relying on for the element whose whole job is to be accurate.
  if (generation !== previewGeneration) {
    return;
  }

  const { html } = buildCodeBlockHtml({
    source: sourceField.value,
    // Read here rather than passed in, so whatever last set the dropdown wins —
    // including ticket 04's detection, which assigns to it from script and so
    // fires no `change`. The debounce covers that ordering for free: detection
    // runs on the same `input` event this render was scheduled from, and has
    // long finished by the time the timer fires.
    language: languageField.value,
    themeMap: resolvedThemeMap,
    tabWidth,
    fontSize,
  });

  const parsed = new DOMParser().parseFromString(html, "text/html");
  previewPane.replaceChildren(
    document.importNode(parsed.body.firstElementChild, true),
  );
  previewPane.hidden = false;
}

function hidePreview() {
  previewPane.replaceChildren();
  previewPane.hidden = true;
}

function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    // A render that fails clears the preview rather than leaving the last good
    // one up. Stale is the one failure mode this element must not have: a
    // preview showing the previous language beside a dropdown showing the new
    // one is worse than no preview at all. The error itself is not surfaced
    // here — the insert makes the identical call and reports it properly on the
    // error line, and a preview failure is not an insert failure until someone
    // presses Insert.
    renderPreview().catch(hidePreview);
  }, PREVIEW_DEBOUNCE_MS);
}

// The two inputs the block is built from. `input` covers typing, paste, cut and
// undo alike; `change` is what a dropdown fires, and it is what makes a
// corrected language confirmable by eye without touching the source again.
sourceField.addEventListener("input", schedulePreview);
languageField.addEventListener("change", schedulePreview);
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
  // Assigning `value` from script fires neither `input` nor `change`, so both
  // of the things that watch the textarea have to be told by hand.
  refreshSizeWarning();
  schedulePreview();
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
