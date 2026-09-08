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
    expect([...manifest.permissions].sort()).toEqual(["compose", "scripting"]);
  });

  it("references only files that exist", () => {
    const referenced = [
      manifest.compose_action.default_popup,
      manifest.compose_action.default_icon,
    ];
    for (const path of referenced) {
      expect(existsSync(resolve(repoRoot, path)), path).toBe(true);
    }
  });
});
