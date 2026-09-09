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
export const ADDON_ID = manifest.browser_specific_settings.gecko.id;
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
  constructor(session, handle, format) {
    this.session = session;
    this.handle = handle;
    this.format = format;
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
    const urls = await waitFor("the action popup to load", async () => {
      const open = await this.actionPopupUrls();
      return open.length > before && open.at(-1)?.startsWith("moz-extension://")
        ? open
        : null;
    });
    return urls.at(-1);
  }

  /** Dismisses an open popup, which is what a person's Escape key does. */
  async closeActionPopup() {
    await this.sendKeys(Key.ESCAPE);
    await waitFor(
      "the action popup to close",
      async () => (await this.actionPopupUrls()).length === 0,
    );
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
  constructor(driver, { thunderbird, geckodriver, profileDir, addonId, mainWindow }) {
    this.driver = driver;
    this.thunderbird = thunderbird;
    this.geckodriver = geckodriver;
    this.profileDir = profileDir;
    this.addonId = addonId;
    this.mainWindow = mainWindow;
    this.actionButtonId = ACTION_BUTTON_ID;
    this.actionToolbarId = ACTION_TOOLBAR_ID;
  }

  /** Privileged code in the main mail window. */
  async chrome(script, ...args) {
    await this.focusMainWindow();
    return this.driver.executeScript(script, ...args);
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

    const composeWindow = new ComposeWindow(this, handle, format);
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

  /** Every open compose window, oldest first. */
  async composeWindows() {
    const handles = await this.driver.getAllWindowHandles();
    const found = [];
    for (const handle of handles) {
      await this.driver.switchTo().window(handle);
      const url = await this.driver.executeScript("return window.location.href;");
      if (url === COMPOSE_WINDOW_URL) found.push(new ComposeWindow(this, handle, null));
    }
    return found;
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
      thunderbird,
      geckodriver,
      profileDir,
      addonId,
      mainWindow,
    });
  } catch (error) {
    await driver.quit().catch(() => {});
    await fs.rm(profileDir, { recursive: true, force: true });
    throw error;
  }
}
