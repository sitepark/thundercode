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
 * Driving the add-on rather than only finding it, which is what the insertion
 * tests are made of:
 *
 * ```js
 * await compose.pressActionShortcut();       // the manifest's shortcut, at
 *                                            // the key element it became
 * await compose.typeIntoActionPopup(source); // into the popup, not the body
 * await compose.confirmActionPopup();        // Ctrl+Enter, then wait for the
 *                                            // popup to close
 * await compose.selectInBody("text");        // something to right-click
 * const items = await compose.openBodyContextMenu();  // the add-on's items
 * await compose.activateMenuItem(items[0].id);
 * await compose.editorState();               // { canUndo, modificationCount }
 * await compose.undo();
 * await session.consoleMessages();           // which path the insert took
 * ```
 *
 * `session` also has `chrome()` on the main window, `appInfo()`, `addonInfo()`,
 * `updateGuards()`, `composeWindows()`, `openCompose()` and `archive` - the
 * path of the `.xpi` this run built and installed. Everything runs in
 * Marionette's chrome context, so a script sees `Services`, `ChromeUtils`, `Cc`
 * and `Ci`, and `window` is the window it was called on.
 *
 * Four limits worth knowing before writing a test against this. Each was found
 * the hard way and each is explained where it bites, in session.js:
 *
 * - `openActionPopup()` cannot see *inside* the popup. What it can do is hand
 *   the popup the keyboard and read the result out of the message body, which
 *   is how every insertion test here works.
 * - Opening the popup does not move the focus, so keys reach the message body
 *   unless `focusActionPopup()` has run. A test that forgets can pass while
 *   asserting nothing: type a snippet, press `Ctrl+Enter`, and a plain-text
 *   composer ends up holding exactly what an insert would have put there.
 * - A letter-key extension shortcut cannot be fired by synthesised input on
 *   Thunderbird 128. `pressActionShortcut()` drives the key element instead,
 *   and says what that does and does not cover.
 * - The popup cannot be opened in a plain-text composer at all, because
 *   Thunderbird hides the toolbar this add-on's button sits in and the popup
 *   is anchored to that button. That is a defect in the add-on rather than a
 *   limit of the harness - issue #12, with the details in insertion.test.js.
 */
export {
  ACTION_BUTTON_ID,
  ACTION_TOOLBAR_ID,
  ADDON_ID,
  MENU_ITEM_ID_PREFIX,
  SHORTCUT_KEYSET_ID,
  startThunderbird,
} from "./session.js";
export { PROFILE_PREFS, UPDATE_PREF_NAMES } from "./profile.js";
export { resolveThunderbirdBinary } from "./provision.js";
export { THUNDERBIRD_VERSION } from "./pins.js";
