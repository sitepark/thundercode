import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { Builder, By, Key } from "selenium-webdriver";
import firefox, { Context } from "selenium-webdriver/firefox.js";

import { repoRoot } from "./pins.js";
import { UPDATE_PREF_NAMES, createProfile } from "./profile.js";
import { provision } from "./provision.js";

const run = promisify(execFile);
const require = createRequire(import.meta.url);

/**
 * The harness. One call starts a Thunderbird, temp-installs this checkout into
 * it and hands back something that can open compose windows; one call stops
 * it and takes the profile with it.
 *
 * None of this is supported by Thunderbird - see the Consequences section of
 * docs/adr/0001-three-test-tiers.md. What makes it work is that geckodriver
 * cares only that the binary is Gecko, and that Marionette's chrome context is
 * the whole application rather than a web page.
 */

const manifest = require(path.join(repoRoot, "manifest.json"));

/**
 * The button's id is derived rather than written down, from the same two
 * manifest keys Thunderbird derives it from: the extension id, lowercased with
 * everything outside `[a-z0-9_-]` replaced by an underscore, and the module
 * name of the action. Written out as a literal it would be a copy of a value
 * this repo already owns, and changing the id in the manifest would leave a
 * test looking for a button that no longer exists while claiming the button is
 * missing.
 */
const ADDON_ID = manifest.browser_specific_settings.gecko.id;
const widgetId = ADDON_ID.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
export const ACTION_BUTTON_ID = `${widgetId}-composeAction-toolbarbutton`;

/**
 * Where Thunderbird puts a `compose_action` button, by its own rule: the
 * format toolbar when the manifest asks for `formattoolbar`, and the compose
 * toolbar otherwise. Both ids come from Thunderbird's `ext-composeAction.js`.
 */
export const ACTION_TOOLBAR_ID =
  manifest.compose_action.default_area === "formattoolbar"
    ? "FormatToolbar"
    : "composeToolbar2";

/**
 * The two other places Thunderbird files this add-on under, derived from the
 * same widget id as the button and for the same reason.
 *
 * `SHORTCUT_KEYSET_ID` is the `keyset` the extension framework appends to
 * every window it registers the manifest's `commands` in, holding one `key`
 * element per shortcut. `MENU_ITEM_ID_PREFIX` is what an item created through
 * the `menus` API is given, followed by an underscore and the id the extension
 * chose - so the prefix finds this add-on's items in a menu without this file
 * knowing that id, which lives in the background and is not exported.
 */
const SHORTCUT_KEYSET_ID = `ext-keyset-id-${widgetId}`;
const MENU_ITEM_ID_PREFIX = `${widgetId}-menuitem-`;

/**
 * Thunderbird's own context menu for the message body, by its id in
 * `messengercompose.xhtml`. The `menus` API's `compose_body` context is this
 * menu, so an item registered for that context is an item in here.
 */
const COMPOSE_CONTEXT_MENU_ID = "msgComposeContext";

const COMPOSE_WINDOW_URL =
  "chrome://messenger/content/messengercompose/messengercompose.xhtml";

const DEFAULT_TIMEOUT = 30_000;

async function waitFor(describe, predicate, timeout = DEFAULT_TIMEOUT) {
  const deadline = Date.now() + timeout;
  let last;
  for (;;) {
    try {
      const value = await predicate();
      if (value) return value;
      last = undefined;
    } catch (error) {
      last = error;
    }
    if (Date.now() > deadline) {
      throw new Error(
        `timed out after ${timeout}ms waiting for ${describe}${last ? `: ${last.message}` : ""}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/**
 * The archive the release ships, built by the same script the release uses.
 *
 * `installAddon` takes a directory too and zips it for us, but it zips *all*
 * of it - `node_modules/`, `.git/` and the 84 MiB build this tier just
 * downloaded included. Reusing `scripts/package.sh` avoids both that and a
 * second copy of its exclusion list, which would be the more expensive
 * mistake: a list that drifts installs an add-on nobody ships.
 *
 * This is still a temporary install of an unsigned archive, which is a
 * different code path from the Add-ons Manager install the release checklist
 * keeps by hand, so that item stays where it is.
 */
async function buildArchive() {
  const { stdout } = await run("bash", [path.join(repoRoot, "scripts/package.sh")], {
    cwd: repoRoot,
  });
  const xpi = stdout.trim();
  return path.isAbsolute(xpi) ? xpi : path.join(repoRoot, xpi);
}

/**
 * A compose window, addressed by its WebDriver window handle.
 *
 * Every method here switches to that handle first, so two open composers can
 * be driven in any order - which is the case the add-on's own rule about a
 * snippet never crossing windows needs, and the reason this is an object per
 * window rather than methods on the harness.
 */
class ComposeWindow {
  constructor(session, handle) {
    this.session = session;
    this.handle = handle;
  }

  get driver() {
    return this.session.driver;
  }

  async focus() {
    await this.driver.switchTo().window(this.handle);
    return this;
  }

  /**
   * Run privileged code with this window as `window`. The script's return
   * value comes back over the wire, so it has to be JSON-shaped or a DOM
   * element - the same rule as any `executeScript`.
   */
  async chrome(script, ...args) {
    await this.focus();
    return this.driver.executeScript(script, ...args);
  }

  /** The add-on's button, as an element that can be clicked. */
  async actionButton() {
    await this.focus();
    return waitFor(`the ${ACTION_BUTTON_ID} button`, () =>
      this.driver.findElement(By.id(ACTION_BUTTON_ID)),
    );
  }

  /**
   * The ids of everything in the toolbar the manifest asks for, in order.
   * A test asserting the button is *in the format toolbar* wants this rather
   * than `actionButton()`: an element found by id says nothing about where it
   * ended up, and "somewhere in the compose window" is not the claim.
   */
  async toolbarButtonIds() {
    return this.chrome(
      `const toolbar = document.getElementById(arguments[0]);
       return toolbar ? Array.from(toolbar.children).map((child) => child.id) : null;`,
      ACTION_TOOLBAR_ID,
    );
  }

  /** The editor's body, both ways round: markup for HTML, text for either. */
  async bodyHtml() {
    return this.chrome("return GetCurrentEditor().rootElement.innerHTML;");
  }

  async bodyText() {
    return this.chrome("return GetCurrentEditor().rootElement.textContent;");
  }

  /**
   * The body as the message would carry it, through the editor's own
   * serialiser.
   *
   * This exists for the plain-text composer, where `bodyText()` is not enough:
   * that editor represents a line break as a `br` element, which
   * `textContent` drops silently, so a snippet's indentation survives the
   * insert and then disappears on the way into the assertion. `OutputRaw`
   * keeps the serialiser from re-wrapping the result to the composer's line
   * width, which is a thing it does by default and which would rewrite the
   * very lines this is being read to check.
   */
  async bodyPlainText() {
    return this.chrome(`
      const encoder = Ci.nsIDocumentEncoder;
      return GetCurrentEditor().outputToString(
        "text/plain",
        encoder.OutputLFLineBreak | encoder.OutputRaw
      );
    `);
  }

  /** Puts the caret in the message body, which is where an insert lands. */
  async focusBody() {
    await this.chrome(`
      const editor = GetCurrentEditor();
      editor.selection.collapse(editor.rootElement, 0);
      document.getElementById("messageEditor").focus();
    `);
    return this;
  }

  /**
   * Types into the message body, which is how a test gets text for a caret to
   * sit in the middle of. Real keys rather than an assignment to `innerHTML`,
   * so what an insert then has to leave intact is text the editor itself put
   * there, wrapped in whatever the editor decided to wrap it in.
   */
  async typeIntoBody(...keys) {
    await this.focusBody();
    return this.sendKeys(...keys);
  }

  /**
   * Types into the focused element of this window. Real key events: text typed
   * this way lands in the message body, which is what makes an insert
   * assertable against something a person could have typed.
   */
  async sendKeys(...keys) {
    await this.focus();
    await this.driver.actions({ async: false }).sendKeys(...keys).perform();
    return this;
  }

  /**
   * A modified key press - `pressChord(Key.CONTROL, "b")`.
   *
   * Written out as held modifiers rather than with `Key.chord`, which is the
   * obvious call and the wrong one: through this driver `Key.chord` loses the
   * modifiers silently, so `Key.chord(Key.CONTROL, "b")` types a literal `b`
   * and the test that was checking for bold text reports that the feature is
   * broken. Held down explicitly, the same press bolds.
   *
   * What it cannot do, on 128 at least, is fire the add-on's own
   * `Ctrl+Shift+C`. Thunderbird registers an extension shortcut as a XUL `key`
   * element, and for a letter key that element matches on **keypress** - it
   * only gets `event="keydown"` for keycode shortcuts like the function keys.
   * A synthesised `Ctrl+Shift+C` here produces keydown and keyup and no
   * keypress at all, while `Ctrl+Shift+Q` produces all three; a `key` element
   * added by hand with the same modifiers and a different letter does fire,
   * and dispatching a command event at the extension's own `key` element does
   * open the popup. So the add-on's wiring is intact and it is the key event
   * that never arrives, which means a test of that shortcut needs a route
   * other than this one. Untried for lack of the tools here: a real X server
   * under `xvfb-run` with native key events pushed into it.
   */
  async pressChord(...keys) {
    const modifiers = keys.slice(0, -1);
    const key = keys.at(-1);
    await this.focus();
    let actions = this.driver.actions({ async: false });
    for (const modifier of modifiers) actions = actions.keyDown(modifier);
    actions = actions.sendKeys(key);
    for (const modifier of modifiers.toReversed()) actions = actions.keyUp(modifier);
    await actions.perform();
    return this;
  }

  /**
   * The pages of any open action popups, as URLs.
   *
   * A popup is a `browser` inside a panel rather than a window, so it has no
   * WebDriver window handle and nothing addresses it directly. Its URL is
   * enough to assert that the add-on's popup is the thing that opened - which
   * is as far as this goes: see `openActionPopup()`.
   */
  async actionPopupUrls() {
    return this.chrome(`
      return Array.from(
        document.querySelectorAll('browser[webextension-view-type="popup"]')
      ).map((browser) => browser.currentURI?.spec ?? browser.getAttribute("src"));
    `);
  }

  /**
   * Clicks the add-on's button and waits for its popup to load, returning the
   * popup's URL.
   *
   * What this cannot do is reach inside the popup. Its browser is remote, so
   * chrome script sees no `contentDocument`; Marionette's frame switching
   * refuses the element ("Unable to locate frame for element") because the
   * popup's browsing context is top-level rather than a child of this window;
   * and in content context there are no window handles at all here, not even
   * for the message body. Bringing extension pages in-process to get around it
   * stops the popup loading entirely (see profile.js). So a test about what is
   * *in* the popup needs a different route, and this is the honest limit of
   * what the button click can assert.
   */
  async openActionPopup() {
    const before = (await this.actionPopupUrls()).length;
    const button = await this.actionButton();
    await button.click();
    return this.waitForActionPopup(before);
  }

  /**
   * Waits for one more action popup than there was, and for the panel around
   * it to finish opening. Shared by the two ways the popup is opened here, the
   * button and the shortcut, because "the popup appeared" is the same wait
   * either way and the panel's state is the readiness signal both need: a
   * popup focused while its panel is still `showing` is dismissed rather than
   * focused.
   */
  async waitForActionPopup(before = 0) {
    const urls = await waitFor("the action popup to load", async () => {
      const open = await this.actionPopupUrls();
      return open.length > before && open.at(-1)?.startsWith("moz-extension://")
        ? open
        : null;
    });
    await waitFor("the action popup's panel to finish opening", () =>
      this.chrome(`
        const browser = document.querySelector('browser[webextension-view-type="popup"]');
        if (!browser) throw new Error("the action popup closed again");
        return browser.closest("panel")?.state === "open";
      `),
    );
    return urls.at(-1);
  }

  /**
   * Gives the open popup the keyboard, which is the difference between a test
   * that drives the add-on and a test that types into the message body.
   *
   * Opening the popup does not move the chrome window's focus, so keys
   * synthesised into this window still go to the message editor. That failure
   * is silent and it looks like a passing test: the snippet turns up in the
   * body as typed text, `Ctrl+Enter` reaches the compose window's own Send
   * binding rather than the popup's confirm, and in a plain-text composer the
   * result is indistinguishable from a successful insert. Every test here
   * therefore reads the body once before confirming and expects it empty.
   *
   * Focusing the `browser` element is what moves the focus.
   * `Services.focus.setFocus(browser, FLAG_BYKEY)` does the same thing;
   * `panel.focus()` and `browsingContext.focus()` were both tried and neither
   * moves it at all.
   *
   * None of this reads the popup's document, which is still out of reach - see
   * `openActionPopup()`. It puts the keyboard where a person's click already
   * put it.
   */
  async focusActionPopup() {
    await waitFor("the action popup to take the keyboard", () =>
      this.chrome(`
        const browser = document.querySelector('browser[webextension-view-type="popup"]');
        if (!browser) throw new Error("the action popup closed");
        browser.focus();
        return document.activeElement === browser;
      `),
    );
    return this;
  }

  /** Types into the open popup rather than into the message body. */
  async typeIntoActionPopup(...keys) {
    await this.focusActionPopup();
    return this.sendKeys(...keys);
  }

  /**
   * Confirms the popup from the keyboard and waits for it to close.
   *
   * `Ctrl+Enter` rather than the Insert button because the button is inside
   * the popup's document and unreachable, and because the popup deliberately
   * runs both through one function: a keyboard confirm that behaves
   * differently from the button is the bug that function exists to prevent.
   *
   * The popup closing is the signal that the insert succeeded - it closes
   * itself on success and stays open with an error line on failure, and that
   * line cannot be read from out here. So the timeout says which of the two
   * happened, because "no block in the body" on its own does not.
   */
  async confirmActionPopup() {
    await this.pressChord(Key.CONTROL, Key.ENTER);
    await waitFor(
      "the popup to close, which is how a successful insert ends - a failed " +
        "one leaves it open showing an error line this harness cannot read",
      async () => (await this.actionPopupUrls()).length === 0,
    );
    return this;
  }

  /**
   * The `key` elements Thunderbird derived from the manifest's `commands`, as
   * their attributes.
   *
   * Read out of the keyset the extension framework appended to this window, so
   * what comes back is Thunderbird's own translation of the manifest rather
   * than this repo's restatement of it: `Ctrl+Shift+C` arrives as
   * `modifiers="accel,shift"` with `key="C"`, and `accel` is the part that
   * makes the same manifest entry read as Command on macOS.
   */
  async actionShortcutKeys() {
    return this.chrome(
      `const [keysetId] = arguments;
       const keyset = document.getElementById(keysetId);
       return Array.from(keyset?.children ?? []).map((key) => ({
         key: key.getAttribute("key"),
         keycode: key.getAttribute("keycode"),
         modifiers: key.getAttribute("modifiers"),
       }));`,
      SHORTCUT_KEYSET_ID,
    );
  }

  /**
   * Fires the add-on's shortcut the way a key press does, minus the key press
   * itself, and waits for the popup.
   *
   * This is the honest half of that shortcut, and the half that is this
   * add-on's. A synthesised `Ctrl+Shift+C` never reaches the key element at
   * all: for a letter key the element matches on keypress, and synthesised
   * input produces keydown and keyup and no keypress - `Ctrl+Shift+Q`, which
   * Thunderbird binds to nothing, produces all three. What is left on this
   * side of that event is the manifest's `commands` entry having become a key
   * element with the right modifiers, and that element's command opening this
   * add-on's popup over this window, and that is what this drives. Delivering
   * the key press is Thunderbird's side of the bargain and stays on the
   * release checklist.
   */
  async pressActionShortcut() {
    const before = (await this.actionPopupUrls()).length;
    await this.chrome(
      `const [keysetId] = arguments;
       const [key] = document.getElementById(keysetId)?.children ?? [];
       if (!key) {
         throw new Error(keysetId + " holds no key element for this add-on");
       }
       key.dispatchEvent(new window.Event("command", { bubbles: true, cancelable: true }));`,
      SHORTCUT_KEYSET_ID,
    );
    return this.waitForActionPopup(before);
  }

  /**
   * Finds the first occurrence of some text in the message body and puts the
   * selection over it, or the caret after it.
   *
   * One walk with two endings, because the two callers want the same search:
   * a right-click needs a selection to carry, and an insert mid-paragraph
   * needs a caret with text on both sides of it. Written as a walk over text
   * nodes rather than a `Range` search because there is no such search, and
   * because the body a test seeds is one paragraph deep anyway.
   */
  async findInBody(text, { collapseAfter = false } = {}) {
    const selected = await this.chrome(
      `const [needle, collapseAfter] = arguments;
       const editor = GetCurrentEditor();
       const bodyDocument = editor.document;
       const walker = bodyDocument.createTreeWalker(
         editor.rootElement,
         bodyDocument.defaultView.NodeFilter.SHOW_TEXT
       );
       for (let node = walker.nextNode(); node; node = walker.nextNode()) {
         const at = node.data.indexOf(needle);
         if (at === -1) continue;
         const range = bodyDocument.createRange();
         range.setStart(node, collapseAfter ? at + needle.length : at);
         range.setEnd(node, at + needle.length);
         if (collapseAfter) range.collapse(true);
         editor.selection.removeAllRanges();
         editor.selection.addRange(range);
         return collapseAfter ? "" : editor.selection.toString();
       }
       return null;`,
      text,
      collapseAfter,
    );
    const wanted = collapseAfter ? "" : text;
    if (selected !== wanted) {
      throw new Error(
        `wanted ${JSON.stringify(text)} in the message body, found ${JSON.stringify(selected)}`,
      );
    }
    return this;
  }

  /** Selects some text in the body - something for a right-click to carry. */
  async selectInBody(text) {
    return this.findInBody(text);
  }

  /** Puts the caret straight after some text in the body, selecting nothing. */
  async placeCaretAfter(text) {
    return this.findInBody(text, { collapseAfter: true });
  }

  /** True while Thunderbird's compose context menu is on screen. */
  async bodyContextMenuIsOpen() {
    return this.chrome(
      `const [menuId] = arguments;
       return document.getElementById(menuId)?.state === "open";`,
      COMPOSE_CONTEXT_MENU_ID,
    );
  }

  /**
   * This add-on's items in the compose context menu as it is drawn right now,
   * found by the prefix the extension framework gives them.
   *
   * Hidden items are left out, because "in the menu" here means what a person
   * would see: an item the add-on has asked to hide is still an element in the
   * popup, and counting it would make withholding the item look the same as
   * offering it.
   */
  async addonMenuItems() {
    return this.chrome(
      `const [menuId, prefix] = arguments;
       return Array.from(document.getElementById(menuId).querySelectorAll("menuitem"))
         .filter((item) => item.id.startsWith(prefix) && !item.hidden)
         .map((item) => ({ id: item.id, label: item.getAttribute("label") }));`,
      COMPOSE_CONTEXT_MENU_ID,
      MENU_ITEM_ID_PREFIX,
    );
  }

  /**
   * Right-clicks the current selection in the message body, waits for
   * Thunderbird's compose context menu, and answers with this add-on's items
   * in it once there are `expecting` of them.
   *
   * The count is not a convenience. Whether this add-on's item belongs in this
   * menu is decided after the menu is already on screen - `menus.onShown` asks
   * the composer what format it is in and calls `menus.refresh()` with the
   * answer - so a menu read the moment it opens still shows what the last one
   * left behind. Saying how many items are expected is what makes that a wait
   * rather than a race, and a count that never arrives fails as a timeout
   * naming the number it wanted.
   *
   * A real widget-level event, synthesised into the editor's own window at the
   * selection's coordinates. Not a `dispatchEvent`: the menu is built from
   * `nsContextMenu.contentData`, which the context-menu actor fills in from a
   * trusted event, so an untrusted one opens no menu at all. And on the
   * selection rather than at the middle of the editor, because Gecko collapses
   * a selection that a right-click misses, and the selection is the whole
   * subject here.
   */
  async openBodyContextMenu({ expecting }) {
    await this.chrome(`
      const editor = GetCurrentEditor();
      const view = editor.document.defaultView;
      const rect = editor.selection.getRangeAt(0).getBoundingClientRect();
      view.windowUtils.sendMouseEvent(
        "contextmenu",
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
        2,
        1,
        0
      );
    `);
    await waitFor(`the ${COMPOSE_CONTEXT_MENU_ID} menu to open`, () =>
      this.bodyContextMenuIsOpen(),
    );

    let items;
    await waitFor(
      `${expecting} of the add-on's items in the ${COMPOSE_CONTEXT_MENU_ID} menu`,
      async () => {
        items = await this.addonMenuItems();
        return items.length === expecting;
      },
    );
    return items;
  }

  /**
   * Dismisses the menu without activating anything - the ending
   * `activateMenuItem` provides for the tests that do activate something. A
   * test that only looked at the menu still has to close it: a context menu
   * left open is a popup that whatever comes next has to open behind.
   */
  async closeBodyContextMenu() {
    await this.chrome(
      `const [menuId] = arguments;
       document.getElementById(menuId).hidePopup();`,
      COMPOSE_CONTEXT_MENU_ID,
    );
    await waitFor(
      `the ${COMPOSE_CONTEXT_MENU_ID} menu to close`,
      async () => !(await this.bodyContextMenuIsOpen()),
    );
    return this;
  }

  /**
   * Activates a context menu item by id, and closes the menu as a click would.
   *
   * `doCommand()` rather than a synthesised click: a menu popup is its own
   * widget, and aiming a click at a platform menu is a different problem from
   * the one this is about. Hiding the menu afterwards is the other half of
   * what the click does - the extension framework's own handler for a
   * modified click does exactly this pair - and it matters here because a
   * context menu left open is a popup that the action popup would have to open
   * behind.
   */
  async activateMenuItem(id) {
    await this.chrome(
      `const [menuId, itemId] = arguments;
       const item = document.getElementById(itemId);
       if (!item) throw new Error("no " + itemId + " in " + menuId);
       item.doCommand();
       document.getElementById(menuId).hidePopup();`,
      COMPOSE_CONTEXT_MENU_ID,
      id,
    );
    await waitFor(
      `the ${COMPOSE_CONTEXT_MENU_ID} menu to close`,
      async () => !(await this.bodyContextMenuIsOpen()),
    );
    return this;
  }

  /**
   * What the editor thinks was done to it. This is how an editor action is
   * told apart from a DOM mutation from the platform's side: only a real
   * editor command leaves a transaction on the undo stack, so a block that can
   * be taken out again with one undo did not arrive by having its nodes
   * appended.
   *
   * `canUndo` is a property here and not a method, which is worth writing down
   * because it was a method for years and still reads like one.
   */
  async editorState() {
    return this.chrome(`
      const editor = GetCurrentEditor();
      return {
        canUndo: editor.canUndo,
        canRedo: editor.canRedo,
        modificationCount: editor.getModificationCount(),
      };
    `);
  }

  /** Undo, as `Ctrl+Z` would - one step unless asked for more. */
  async undo(steps = 1) {
    await this.chrome(`GetCurrentEditor().undo(arguments[0]);`, steps);
    return this;
  }

  /** True while the window is still open. */
  async isOpen() {
    const handles = await this.driver.getAllWindowHandles();
    return handles.includes(this.handle);
  }

  async close() {
    if (!(await this.isOpen())) return;
    await this.focus();
    // The window is asked to close from inside rather than through
    // `driver.close()`, because a composer with a dirty body puts up a
    // save-changes prompt that a driven run has no way past. Resetting the
    // change state first is the difference between a clean teardown and a
    // modal that outlives the test.
    await this.driver.executeScript(`
      gMsgCompose?.compFields && (gMsgCompose.bodyModified = false);
      GetCurrentEditor()?.resetModificationCount();
      window.close();
    `);
    await waitFor("the compose window to close", async () => !(await this.isOpen()));
    await this.session.focusMainWindow();
  }
}

class Session {
  constructor(driver, { profileDir, addonId, archive, mainWindow }) {
    this.driver = driver;
    this.profileDir = profileDir;
    this.addonId = addonId;
    // The archive this run installed, so a test can assert what the release
    // script produced rather than running it a second time to look.
    this.archive = archive;
    this.mainWindow = mainWindow;
  }

  /** Privileged code in the main mail window. */
  async chrome(script, ...args) {
    await this.focusMainWindow();
    return this.driver.executeScript(script, ...args);
  }

  /**
   * Every `console` call this process has cached, oldest first, as a level and
   * the arguments joined into one line.
   *
   * This is how the insertion function's report of which path it took becomes
   * observable from outside its sandbox, which is the one thing that report
   * exists for: the popup throws the return value away as it closes, and the
   * function logs the mechanism precisely because of that. The compose editor
   * runs in the parent process, so the sandbox injected into it logs here
   * rather than in a content process.
   *
   * `nsIConsoleAPIStorage` rather than an observer, and that is not a
   * preference: the `console-api-log-event` topic these events used to be
   * notified on was replaced by an explicit listener list, so a registered
   * observer is never called and reads as the add-on having logged nothing.
   * Reading the cache after the fact needs no registration at all.
   *
   * The cache is per inner window and is cleared when that window is
   * destroyed, so a test reads it before closing the compose window it is
   * asking about - which also means one test cannot see another's reports.
   */
  async consoleMessages() {
    return this.chrome(`
      const storage = Cc["@mozilla.org/consoleAPI-storage;1"].getService(
        Ci.nsIConsoleAPIStorage
      );
      return storage.getEvents().map((event) => ({
        level: event.level,
        text: Array.from(event.arguments ?? []).map(String).join(" "),
      }));
    `);
  }

  async focusMainWindow() {
    await this.driver.switchTo().window(this.mainWindow);
  }

  /**
   * Opens a composer through `nsIMsgComposeService` rather than through the UI.
   *
   * `MsgNewMessage` depends on the 3-pane window's tabmail and on a folder
   * being selected; the service takes the identity and the format directly,
   * which is also the only way to ask for a plain-text composer without going
   * through a menu - and a plain-text composer is a different editor rather
   * than the same one with the styling switched off.
   */
  async openCompose({ format = "html" } = {}) {
    const before = await this.driver.getAllWindowHandles();
    await this.chrome(
      `const [format] = arguments;
       const { MailServices } = ChromeUtils.importESModule(
         "resource:///modules/MailServices.sys.mjs"
       );
       const identity = MailServices.accounts.defaultAccount?.defaultIdentity;
       if (!identity) {
         throw new Error("no default identity: the profile has no usable account");
       }
       const params = Cc["@mozilla.org/messengercompose/composeparams;1"].createInstance(
         Ci.nsIMsgComposeParams
       );
       params.composeFields = Cc[
         "@mozilla.org/messengercompose/composefields;1"
       ].createInstance(Ci.nsIMsgCompFields);
       params.identity = identity;
       params.type = Ci.nsIMsgCompType.New;
       params.format =
         format === "plaintext"
           ? Ci.nsIMsgCompFormat.PlainText
           : Ci.nsIMsgCompFormat.HTML;
       MailServices.compose.OpenComposeWindowWithParams(null, params);`,
      format,
    );

    const handle = await waitFor("a new compose window handle", async () => {
      const after = await this.driver.getAllWindowHandles();
      const fresh = after.filter((candidate) => !before.includes(candidate));
      for (const candidate of fresh) {
        await this.driver.switchTo().window(candidate);
        const url = await this.driver.executeScript("return window.location.href;");
        if (url === COMPOSE_WINDOW_URL) return candidate;
      }
      return null;
    });

    const composeWindow = new ComposeWindow(this, handle);
    // The editor is built asynchronously after the window loads, and every
    // useful thing a test does with a composer goes through it, so waiting for
    // it here is the difference between one wait and one in every test.
    await waitFor("the compose editor", () =>
      composeWindow.chrome(
        `return !!(typeof GetCurrentEditor === "function" && GetCurrentEditor());`,
      ),
    );
    return composeWindow;
  }

  /**
   * What Thunderbird thinks it is running: the version, and the name, since
   * "firefox" appears in enough of this harness to be worth disproving once.
   */
  async appInfo() {
    return this.chrome(`
      return {
        name: Services.appinfo.name,
        version: Services.appinfo.version,
        profileDir: Services.dirsvc.get("ProfD", Ci.nsIFile).path,
      };
    `);
  }

  /**
   * How the installed add-on got there, read back from the add-on manager
   * rather than assumed from the call that installed it. `temporarilyInstalled`
   * and `signedState` are the two claims worth checking: a permanent install or
   * a signature requirement would both be a different mechanism than the one
   * this tier is built on.
   */
  async addonInfo() {
    await this.focusMainWindow();
    return this.driver.executeAsyncScript(
      `const [id, done] = arguments;
       const { AddonManager } = ChromeUtils.importESModule(
         "resource://gre/modules/AddonManager.sys.mjs"
       );
       AddonManager.getAddonByID(id).then(
         (addon) =>
           done(
             addon
               ? {
                   id: addon.id,
                   version: addon.version,
                   type: addon.type,
                   isActive: addon.isActive,
                   temporarilyInstalled: addon.temporarilyInstalled,
                   signedState: addon.signedState,
                 }
               : null
           ),
         (error) => done({ error: String(error) })
       );`,
      this.addonId,
    );
  }

  /**
   * Both halves of "cannot update itself", read from the running application:
   * the policy, which applies whether or not anything is automating, and the
   * prefs, which are what a run without the policy would be relying on.
   */
  async updateGuards() {
    return this.chrome(
      `const [names] = arguments;
       const prefs = {};
       for (const name of names) {
         prefs[name] = Services.prefs.getBoolPref(name, null);
       }
       return {
         policyAllowsAppUpdate: Services.policies.isAllowed("appUpdate"),
         signaturesRequired: Services.prefs.getBoolPref(
           "xpinstall.signatures.required",
           null
         ),
         prefs,
       };`,
      UPDATE_PREF_NAMES,
    );
  }

  async stop() {
    try {
      await this.driver.quit();
    } finally {
      // The profile is the run, so it goes with it. Keeping it would make the
      // next run's "fresh profile" claim depend on nobody having pointed a
      // second run at the same directory.
      await fs.rm(this.profileDir, { recursive: true, force: true });
    }
  }
}

/**
 * The one entry point. Provisions if it has to, starts Thunderbird on a new
 * profile, waits for the main window, installs this checkout and returns the
 * session.
 */
export async function startThunderbird({ log = () => {}, prefs = {} } = {}) {
  const { thunderbird, geckodriver } = await provision({ log });
  const profileDir = await createProfile({ prefs });

  const options = new firefox.Options()
    .setBinary(thunderbird.binary)
    .addArguments("-profile", profileDir);

  // Headless by default; `THUNDERBIRD_HEADLESS=0` gives it a display, which is
  // the documented escape hatch for the things headless Thunderbird has been
  // known to get wrong - run the command under `xvfb-run` and the run is still
  // unattended. `-headless` is handled in toolkit rather than in Firefox's own
  // code, which is why it reaches Thunderbird at all.
  if (process.env.THUNDERBIRD_HEADLESS !== "0") {
    options.addArguments("-headless");
  }

  const service = new firefox.ServiceBuilder(geckodriver)
    // Switching Marionette into the privileged context needs the application
    // started with system access from Firefox 138 on. 128 does not ask for it,
    // so this is for the environment override rather than for the pin - and it
    // has to go on the service rather than through `moz:firefoxOptions.args`,
    // which geckodriver dropped as a route for it in 0.37.1.
    .addArguments("--allow-system-access");
  if (process.env.THUNDERBIRD_TIER_DEBUG) {
    service.addArguments("--log", "trace").setStdio("inherit");
  }

  log(`[thunderbird tier] launching ${thunderbird.binary}`);
  const driver = await new Builder()
    // Not a typo and not aspirational: geckodriver matches on this name and
    // nothing else. What it launches is whatever `binary` points at.
    .forBrowser("firefox")
    .setFirefoxOptions(options)
    .setFirefoxService(service)
    .build();

  try {
    await driver.setContext(Context.CHROME);
    const mainWindow = await waitFor("the main mail window", async () => {
      for (const handle of await driver.getAllWindowHandles()) {
        await driver.switchTo().window(handle);
        const type = await driver.executeScript(
          "return document.documentElement.getAttribute('windowtype');",
        );
        if (type === "mail:3pane") return handle;
      }
      return null;
    });
    await driver.switchTo().window(mainWindow);

    const xpi = await buildArchive();
    log(`[thunderbird tier] installing ${path.relative(repoRoot, xpi)}`);
    const addonId = await driver.installAddon(xpi, true);

    return new Session(driver, {
      profileDir,
      addonId,
      archive: xpi,
      mainWindow,
    });
  } catch (error) {
    await driver.quit().catch(() => {});
    await fs.rm(profileDir, { recursive: true, force: true });
    throw error;
  }
}
