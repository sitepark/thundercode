/**
 * The Thunderbird tier's harness, in one import.
 *
 * ```js
 * import { startThunderbird } from "./harness/index.js";
 *
 * const session = await startThunderbird();          // ~15s, or ~2min the
 * try {                                              // first time (downloads)
 *   const compose = await session.openCompose();      // { format: "plaintext" }
 *   await compose.focusBody();                        // caret in the body
 *   await compose.sendKeys("text");                   // real key events
 *   await compose.pressChord(Key.CONTROL, "b");       // never Key.chord
 *   const button = await compose.actionButton();      // a clickable element
 *   await compose.toolbarButtonIds();                 // where it sits
 *   await compose.openActionPopup();                  // click, wait, URL
 *   await compose.bodyHtml();                         // and bodyText()
 *   await compose.chrome("return 1 + 1;");            // privileged, this window
 *   await compose.close();
 * } finally {
 *   await session.stop();                             // takes the profile too
 * }
 * ```
 *
 * `session` also has `chrome()` on the main window, `appInfo()`, `addonInfo()`,
 * `updateGuards()`, `composeWindows()` and `openCompose()`. Everything runs in
 * Marionette's chrome context, so a script sees `Services`, `ChromeUtils`, `Cc`
 * and `Ci`, and `window` is the window it was called on.
 *
 * Two limits worth knowing before writing a test against this, both found the
 * hard way and both explained where they bite - in session.js:
 * `openActionPopup()` cannot see inside the popup, and a letter-key extension
 * shortcut cannot be fired by synthesised input on Thunderbird 128.
 */
export {
  ACTION_BUTTON_ID,
  ACTION_TOOLBAR_ID,
  ADDON_ID,
  startThunderbird,
} from "./session.js";
export { PROFILE_PREFS, UPDATE_PREF_NAMES } from "./profile.js";
export { resolveThunderbirdBinary } from "./provision.js";
export { THUNDERBIRD_VERSION } from "./pins.js";
