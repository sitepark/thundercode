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

  it("references only files that exist", () => {
    const referenced = [
      manifest.compose_action.default_popup,
      manifest.compose_action.default_icon,
      ...manifest.background.scripts,
      manifest.options_ui.page,
    ];
    for (const path of referenced) {
      expect(existsSync(resolve(repoRoot, path)), path).toBe(true);
    }
  });
});
