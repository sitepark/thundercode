import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  readFileSync(resolve(repoRoot, "manifest.json"), "utf8"),
);

/**
 * The manifest is the one artefact Thunderbird refuses to install if it is
 * wrong, and its failure mode is a dialog rather than a stack trace. These
 * assertions encode the install-time contract from ticket 01.
 */
describe("manifest", () => {
  it("is a Manifest V3 extension named ThunderCode", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.name).toBe("ThunderCode");
  });

  it("declares the Gecko id Thunderbird requires to install at all", () => {
    expect(manifest.browser_specific_settings.gecko.id).toBe(
      "thundercode@sitepark.com",
    );
  });

  it("sets the minimum Thunderbird version to 128", () => {
    expect(manifest.browser_specific_settings.gecko.strict_min_version).toBe(
      "128.0",
    );
  });

  it("puts its button in the compose window's format toolbar with a popup", () => {
    expect(manifest.compose_action.default_area).toBe("formattoolbar");
    expect(manifest.compose_action.default_popup).toBeTruthy();
  });

  it("requests only the permissions the code actually uses", () => {
    // `menus` is mandatory to call `menus.*` at all, and there is no
    // manifest-level menus key to declare items with: the compose_body item is
    // created from the background script, so this permission is the only trace
    // of it the manifest carries.
    expect([...manifest.permissions].sort()).toEqual([
      "compose",
      "menus",
      "scripting",
      "storage",
    ]);
  });

  it("runs its background as an event page rather than a service worker", () => {
    // `background.service_worker` is not implemented in Gecko, and Thunderbird
    // inherits that: declaring one would leave the menu item with nothing
    // listening for its clicks.
    expect(manifest.background.service_worker).toBeUndefined();
    expect(manifest.background.scripts.length).toBeGreaterThan(0);
    expect(manifest.background.type).toBe("module");
  });

  /**
   * Shortcuts Thunderbird itself binds with Ctrl+Shift on Linux and Windows,
   * read out of comm-central rather than remembered: the compose window's
   * `composeKeys` and `editorKeys` keysets, and the main window's
   * `mainKeySet.inc.xhtml`. The main window is in scope because an extension's
   * keyset is appended to *every* window the WebExtension APIs support, not
   * only to the one the command can act on.
   *
   * This list is a snapshot, so it cannot prove the chosen shortcut is free —
   * it pins the collisions that were actually checked, so that changing the
   * binding to one of them fails here instead of in someone's compose window.
   */
  const thunderbirdCtrlShiftShortcuts = [
    "Ctrl+Shift+A", // Select thread (main)
    "Ctrl+Shift+B", // Address book (main)
    "Ctrl+Shift+G", // Find previous (compose and main)
    "Ctrl+Shift+I", // Browser toolbox (main)
    "Ctrl+Shift+J", // Error console (main)
    "Ctrl+Shift+K", // Remove links (compose), quick filter bar (main)
    "Ctrl+Shift+L", // Reply to list (main)
    "Ctrl+Shift+O", // Paste as quotation (compose), open in conversation (main)
    "Ctrl+Shift+P", // Check spelling (compose)
    "Ctrl+Shift+R", // Remove named anchors (compose), reply all (main)
    "Ctrl+Shift+T", // Undo close tab (main)
    "Ctrl+Shift+V", // Paste without formatting (compose)
    "Ctrl+Shift+X", // Reorder attachments (compose)
    "Ctrl+Shift+Y", // Remove styles (compose), get all new messages (main)
    "Ctrl+Shift+Z", // Redo on Unix (compose and main)
  ];

  describe("keyboard shortcut", () => {
    it("opens the popup through Thunderbird's built-in compose-action command", () => {
      // `_execute_compose_action` is handled inside Thunderbird, which calls
      // the compose action directly and never dispatches `commands.onCommand`.
      // Any other command name would need an `onCommand` listener in the
      // background script, which is a listener nothing here registers.
      expect(Object.keys(manifest.commands)).toEqual([
        "_execute_compose_action",
      ]);
    });

    it("declares the shortcut so Thunderbird's own settings can rebind it", () => {
      const command = manifest.commands._execute_compose_action;
      expect(command.suggested_key.default).toBeTruthy();
      // about:addons only knows built-in labels for the browser, page and
      // sidebar actions. Without a description of our own, its shortcut list
      // labels this row with the raw string `_execute_compose_action`.
      expect(command.description).toBeTruthy();
    });

    it("suggests a shortcut Thunderbird does not already bind", () => {
      const suggested = manifest.commands._execute_compose_action.suggested_key;
      expect(thunderbirdCtrlShiftShortcuts).not.toContain(suggested.default);
    });

    it("suggests a shortcut the commands API accepts", () => {
      // Every combination needs a mandatory modifier and a supported main key.
      // Getting this wrong is an install-time manifest error, which is the
      // same failure mode the rest of this file exists to catch.
      expect(
        manifest.commands._execute_compose_action.suggested_key.default,
      ).toMatch(/^(Ctrl|Alt|Command|MacCtrl)\+(Shift\+)?[A-Z0-9]$/);
    });
  });

  /**
   * Without this key the options page exists in the repo and nowhere in the
   * product: there is no other route to it, since the popup deliberately does
   * not link to settings.
   */
  it("offers an options page, which is the only way to reach the settings", () => {
    expect(manifest.options_ui.page).toBeTruthy();
  });

  /**
   * Embedded in the Add-ons Manager rather than opened as a tab. Two numbers
   * do not warrant a tab of their own, and the inline pane is where anyone
   * looking for an add-on's preferences looks first.
   */
  it("embeds that page in the Add-ons Manager rather than opening a tab", () => {
    expect(manifest.options_ui.open_in_tab).toBe(false);
  });

  /**
   * The button shipped blank once, then shipped dark ink on a dark toolbar,
   * and both times the cause was an icon that expected something else to
   * colour it.
   *
   * Nothing will. Thunderbird applies an action icon as a `list-style-image`
   * — `chrome://messenger/content/messenger/webextensions.css` is the whole of
   * the integration — and nothing on that path sets
   * `-moz-context-properties`, so `context-fill`, the idiom Thunderbird's own
   * chrome icons are drawn with, paints nothing at all in an add-on's. The
   * `theme_icons` manifest key does work, but it is resolved once into the
   * WebExtension startup cache under the add-on's id and version, so it goes
   * stale across every reinstall that does not bump the version.
   *
   * So the icon colours itself, and these two assertions are what stop either
   * mechanism from creeping back in.
   */
  describe("the toolbar icon", () => {
    // Comments stripped first: the file that explains why `context-fill`
    // cannot be used here has to be able to name it.
    const svg = readFileSync(
      resolve(repoRoot, manifest.compose_action.default_icon),
      "utf8",
    ).replace(/<!--[\s\S]*?-->/g, "");

    it("states its own colours rather than taking a context paint", () => {
      expect(svg).not.toMatch(/context-(fill|stroke)/);
      expect(svg).toMatch(/(fill|stroke):\s*#[0-9a-f]{3,8}/i);
    });

    /**
     * Which is the whole of the theme handling. An SVG used as an image is
     * its own document, but Gecko propagates the embedding element's used
     * colour scheme into it, so this query reports the toolbar's scheme.
     * Without the rule the icon is dark ink on a dark toolbar, which is the
     * reported bug.
     */
    it("carries a dark-scheme rule instead of a second file", () => {
      expect(svg).toMatch(/@media\s*\(prefers-color-scheme:\s*dark\)/);
      expect(manifest.compose_action.theme_icons).toBeUndefined();
    });
  });

  /**
   * `compose_action.default_icon` dresses the toolbar button and nothing else.
   * Without a top-level `icons` key the add-on itself has no icon, so the
   * Add-ons Manager falls back to the generic puzzle piece — the state
   * Thunderbird's review tooling calls `addon-icon-missing`. The same SVG
   * serves both: it is already scheme-aware, which sized PNGs would not be.
   */
  it("gives the add-on an icon of its own, not just the toolbar button", () => {
    expect(Object.keys(manifest.icons).length).toBeGreaterThan(0);
  });

  it("references only files that exist", () => {
    const referenced = [
      manifest.compose_action.default_popup,
      manifest.compose_action.default_icon,
      ...Object.values(manifest.icons),
      ...manifest.background.scripts,
      manifest.options_ui.page,
    ];
    for (const path of referenced) {
      expect(existsSync(resolve(repoRoot, path)), path).toBe(true);
    }
  });
});
