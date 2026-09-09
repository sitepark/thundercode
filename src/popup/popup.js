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
}

fillLanguageDropdown();

/**
 * Whether the user has taken the language over.
 *
 * Once they have, detection stops for the rest of this popup: an override is
 * an instruction, and a dropdown that re-guesses over the top of a deliberate
 * choice is worse than one that never guessed. It is a plain module variable
 * on purpose — the popup document is built fresh every time the button is
 * clicked, so this resets itself, and there is deliberately nothing anywhere
 * that writes the chosen language to `storage`. Remembering it across opens is
 * exactly how auto-detection stops working without anyone noticing.
 */
let languageOverridden = false;

/**
 * Whether the language the next render applies should be detected rather than
 * taken from the dropdown.
 *
 * Detection and the preview are one seam call — a source change costs one
 * highlight pass, not two — so this flag is the whole of the difference
 * between the two kinds of edit: every change re-renders, and only a wholesale
 * one asks for a fresh guess. It is set by the change and cleared by the
 * render that honours it, so two pastes in quick succession still detect once.
 *
 * It starts `true` so that the load-time render derives the dropdown's opening
 * value from the (empty) textarea like every other value it takes, rather than
 * leaving it on the first entry of an alphabetical list.
 */
let detectionDue = true;

languageField.addEventListener("change", () => {
  languageOverridden = true;
  // `change` is what a dropdown fires, and re-rendering on it is what makes a
  // corrected language confirmable by eye without touching the source again.
  schedulePreview();
});

/**
 * What the seam should be told about the language: nothing at all — which is
 * how any caller asks it to detect — while a wholesale change is still waiting
 * to be rendered, and the dropdown's value otherwise.
 *
 * A function rather than a branch inside the render, because the insert needs
 * the same answer. Paste and Ctrl+Enter inside the debounce window is a real
 * path — it is close to the fastest way to use this popup — and reading the
 * dropdown there would insert the block under whatever language was last
 * shown. Both callers detect through the same pure seam over the same source,
 * so they cannot arrive at different answers.
 */
function requestedLanguage() {
  return detectionDue && !languageOverridden ? undefined : languageField.value;
}

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
    // Not the dropdown directly: an insert can outrun the debounced render
    // that would have filled it in, and this asks for detection in that window
    // rather than shipping a block under a language nobody chose.
    language: requestedLanguage(),
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
    // Which is only safe because a body-less call leaves the document alone,
    // and that is worth citing rather than assuming: the spec's blanket "every
    // call replaces the whole document, moves the caret to the top and
    // destroys the undo history" is true only of a call that carries a body.
    // `ext-compose.js` hands the details to `SetComposeDetails` in
    // `MsgComposeCommands.js`, where the `innerHTML` assignment,
    // `editor.beginningOfDocument()` and `editor.clearUndoRedo()` all sit
    // inside `if (typeof newValues.body == "string")`. `deliveryFormat` is
    // handled separately, and only sets `compFields.deliveryFormat` and
    // refreshes the send-format menu. So passing `deliveryFormat` alone cannot
    // touch the caret this insert is about to read — the only marks it leaves
    // are `gContentChanged = true`, on a message we are about to change
    // anyway, and a `focus()` back onto whatever was focused.
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
 * Recomputed from scratch on every source change, which covers paste, typing,
 * cut and undo alike. That is also what clears the warning again when the
 * content drops back under the threshold: there is no separate hide path to
 * forget to call.
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

/**
 * How long the popup waits for typing to stop before re-rendering, in
 * milliseconds.
 *
 * The seam is not free: highlighting is a scan over the whole snippet, and
 * detection scores it against all 36 grammars — around 100ms for a 500-line
 * paste and half a second for the 3000-line one ticket 11's warning exists
 * for. The snippet may be hundreds of lines, and rendering on every keystroke
 * would do all of that once per character and throw all but the last result
 * away. This is the same debounce the detection rides on, which is the point:
 * one source change, one pass.
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
 * every call to `renderFromSource` and compared across its awaits.
 */
let previewGeneration = 0;

/**
 * Renders the preview, and settles the language, from one call to the seam.
 *
 * One call rather than two is not an optimisation bolted on afterwards: it is
 * what makes the dropdown and the preview incapable of disagreeing. Ticket 04
 * detected on its own pass and ticket 06 rendered on another, and neither
 * could see the other; a snippet that detects as `x` cannot now be previewed
 * as `y`, because there is one `detectedLanguage` and one `html` and they came
 * out of the same call over the same source.
 *
 * The popup asks for detection the way any caller does — by naming no
 * language — and reads back `detectedLanguage`, which is the language that was
 * applied and not the one that was requested. Detection itself lives behind
 * the seam, and this file neither knows nor can tell that `hljs.highlightAuto`
 * is involved.
 *
 * The rest is the preview: `html` here is not a rendering *like* the
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
 *   the resulting block element is adopted. A parse is not an execution: no script
 *   runs, no `src` is fetched, no handler attribute is honoured, and that holds
 *   whatever the string turns out to contain. `innerHTML` on the live document
 *   would be one line shorter and would also fetch an `<img src>` if the seam
 *   ever emitted one.
 * - The popup is an extension page under the default MV3 CSP, so inline script
 *   could not run here even if something managed to write it in.
 */
async function renderFromSource() {
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

  const source = sourceField.value;
  // Read and cleared after the staleness check, so a render that turns out to
  // be stale cannot swallow a detection the newer one still owes.
  const language = requestedLanguage();
  detectionDue = false;

  const { html, detectedLanguage } = buildCodeBlockHtml({
    source,
    language,
    themeMap: resolvedThemeMap,
    tabWidth,
    fontSize,
  });

  // Assigning `value` is safe for any result: detection can only return a name
  // `hljs.listLanguages()` carries, and that is the same list the dropdown was
  // filled from. It fires no `change`, so writing it here cannot be mistaken
  // for the user taking the language over.
  if (language === undefined) {
    languageField.value = detectedLanguage;
  }

  // An empty textarea shows nothing — not the bordered empty box the seam
  // returns for empty source, and not an error either. There is nothing to
  // preview before anything has been pasted, and a box appearing the moment
  // the popup opens would read as the block already existing. The call above
  // still happened, and cost nothing: it is what puts the dropdown on Plain
  // text for an empty document.
  //
  // Literally empty, not whitespace-only. Source that is all spaces *does*
  // insert an empty bordered box, and a preview that hid it would be lying
  // about the one thing this element exists to tell the truth about.
  if (source === "") {
    hidePreview();
    return;
  }

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
  previewTimer = setTimeout(renderNow, PREVIEW_DEBOUNCE_MS);
}

/**
 * Renders without waiting, and cancels any render that was waiting.
 *
 * Used for the two ways content arrives that are not typing — the popup
 * opening, and the right-click prefill — where a debounce would only mean the
 * dropdown visibly correcting itself a moment after the popup appeared.
 */
function renderNow() {
  clearTimeout(previewTimer);
  // A render that fails clears the preview rather than leaving the last good
  // one up. Stale is the one failure mode this element must not have: a
  // preview showing the previous language beside a dropdown showing the new
  // one is worse than no preview at all. The error itself is not surfaced
  // here — the insert makes the identical call and reports it properly on the
  // error line, and a preview failure is not an insert failure until someone
  // presses Insert.
  renderFromSource().catch(hidePreview);
}

/**
 * Everything that happens when the source changes, in one place and in one
 * order.
 *
 * There were three `input` listeners here — detection, the size warning, the
 * preview — registered by three tickets that could not see each other, and the
 * prefill below had to replay each of them by hand. One entry point means the
 * prefill announces a change instead of re-enacting one, and means the
 * difference between the paths is stated as data rather than as which
 * listeners a caller remembered to call.
 *
 * @param {object} change
 * @param {boolean} change.wholesale Whether the content was replaced rather
 *   than edited, which is the only thing detection keys on.
 * @param {boolean} [change.immediate] Render now rather than after the
 *   debounce. Typing is the debounced case and everything else is not: content
 *   that arrives all at once has no burst to collapse.
 */
function handleSourceChanged({ wholesale, immediate = false }) {
  // Not debounced, and cheap enough not to be: counting lines is a scan, not a
  // highlight, and a warning that appeared a fifth of a second after the paste
  // would read as a reaction to whatever the user did next.
  refreshSizeWarning();
  if (wholesale) detectionDue = true;

  if (immediate) {
    renderNow();
    return;
  }
  schedulePreview();
}

sourceField.addEventListener("input", (event) => {
  handleSourceChanged({ wholesale: isWholesaleChange(event) });
});

/**
 * Whether this edit replaced the content wholesale — a paste, a drop, a
 * middle-click yank — rather than moving it along by a character.
 *
 * Detection is not cheap, and it is not wanted per keystroke even if it were:
 * the trigger is the arrival of new content and not every edit of it. That is
 * also the honest reading of the story — the language is detected when code is
 * pasted, and a snippet being tweaked afterwards has already got one — and it
 * is what keeps the dropdown from re-guessing under someone's fingers while
 * they fix a typo.
 *
 * An event with no `inputType` at all counts as wholesale. A browser that will
 * not say what happened should cost a redundant detection, not a dropdown that
 * silently never updates again.
 */
function isWholesaleChange(event) {
  return !event.inputType || event.inputType.startsWith("insertFrom");
}

// Once at load, so the warning line and the dropdown start in a state this
// file owns rather than one the markup guessed at. It comes out at no warning
// and Plain text, which is what an empty document should say.
handleSourceChanged({ wholesale: true, immediate: true });

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
  // Assigning `value` from script fires no `input` event, so the change has to
  // be announced by hand — once, to the one thing that watches the textarea.
  // Content that arrived from outside is as wholesale as a paste, and it is
  // already here rather than being typed, so there is no burst to wait out.
  handleSourceChanged({ wholesale: true, immediate: true });
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
document.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || !(event.ctrlKey || event.metaKey)) {
    return;
  }
  event.preventDefault();
  void confirmInsert();
});
