import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { buildUpdatesManifest } from "../../scripts/build-updates-json.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const manifest = JSON.parse(
  readFileSync(resolve(repoRoot, "manifest.json"), "utf8"),
);

const gecko = manifest.browser_specific_settings.gecko;
const sha256 = "a".repeat(64);
const updates = buildUpdatesManifest({
  manifest,
  xpiFileName: `thundercode-${manifest.version}.xpi`,
  sha256,
});
const entry = updates.addons[gecko.id].updates[0];

/**
 * `updates.json` is what Thunderbird fetches once a day to decide whether an
 * installed copy is out of date. Nothing validates it, and almost every way of
 * getting it wrong is silent: the entry is skipped, or the manifest fails to
 * parse, and Thunderbird ships `extensions.logging.enabled = false` so not even
 * the Error Console says so.
 *
 * The file is generated at release time, so these assertions are on the
 * generator rather than on a committed artefact - which is the point of
 * generating it, but only if the generator itself is pinned.
 */
describe("update manifest", () => {
  it("is keyed by the add-on id the manifest declares", () => {
    // Thunderbird looks the id up verbatim. A mismatch logs "Update manifest
    // did not contain an entry for <id>" and is otherwise indistinguishable
    // from being up to date.
    expect(Object.keys(updates.addons)).toEqual([gecko.id]);
  });

  it("offers exactly one version, the one the manifest is at", () => {
    // One entry because the compatibility floor never varies between releases,
    // so older entries could only ever be stale duplicates.
    expect(updates.addons[gecko.id].updates).toHaveLength(1);
    expect(entry.version).toBe(manifest.version);
  });

  it("gates on `applications`, the only spelling the parser accepts", () => {
    // The add-on's own manifest.json uses `browser_specific_settings`, but the
    // update manifest parser predates that rename and never learned it. Worse,
    // an `applications` object without a `gecko` child is not an error: the
    // entry is skipped without a word.
    expect(entry.browser_specific_settings).toBeUndefined();
    expect(entry.applications.gecko).toBeDefined();
    expect(entry.applications.gecko.strict_min_version).toBe(
      gecko.strict_min_version,
    );
  });

  it("leaves the maximum version open", () => {
    // Thunderbird sets `extensions.strictCompatibility = true` on release
    // builds, so unlike Firefox it enforces `strict_max_version` here. Naming
    // any value would stop the update reaching every Thunderbird newer than
    // it, which is the opposite of what shipping an update is for.
    expect(entry.applications.gecko.strict_max_version).toBeUndefined();
  });

  it("links to the archive of that exact version over HTTPS", () => {
    // Pinned rather than a `latest` permalink: a moving link would hand an old
    // client the bytes of a release it did not match, and would contradict the
    // hash below the moment anything shipped.
    expect(entry.update_link).toMatch(/^https:/);
    expect(entry.update_link).toContain(
      `/releases/download/${manifest.version}/`,
    );
    expect(
      entry.update_link.endsWith(`thundercode-${manifest.version}.xpi`),
    ).toBe(true);
    expect(entry.update_link).not.toContain("/releases/latest/");
  });

  it("carries a sha256 of the archive it links to", () => {
    // Only sha256 and sha512 are accepted - the JSON parser's pattern is
    // /^sha(256|512):/, and an unrecognised algorithm string fails the
    // download with ERROR_INCORRECT_HASH rather than being ignored.
    expect(entry.update_hash).toBe(`sha256:${sha256}`);
    expect(entry.update_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("points release notes at the tag", () => {
    expect(entry.update_info_url).toContain(
      `/releases/tag/${manifest.version}`,
    );
  });

  /**
   * The one URL that can never change. It is baked into every installed copy,
   * so a copy installed today polls this exact string forever - moving it
   * would strand every existing install, not migrate it.
   *
   * Which is why it has to be the `latest` permalink and not a per-tag asset
   * URL: a per-tag URL would pin each client to the manifest of the version it
   * already has, and nothing would ever update.
   */
  it("is polled at a permalink that outlives any single release", () => {
    expect(gecko.update_url).toMatch(/^https:/);
    expect(
      gecko.update_url.endsWith("/releases/latest/download/updates.json"),
    ).toBe(true);
    expect(gecko.update_url).not.toContain(manifest.version);
  });
});
