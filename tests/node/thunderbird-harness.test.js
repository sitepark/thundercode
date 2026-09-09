import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { THUNDERBIRD_VERSION, repoRoot } from "../thunderbird/harness/pins.js";
import { createProfile } from "../thunderbird/harness/profile.js";
import {
  THUNDERBIRD_ENV,
  provision,
  resolveThunderbirdBinary,
} from "../thunderbird/harness/provision.js";

/**
 * The Thunderbird tier's harness, in the tier its own assertions can be
 * written in.
 *
 * Which tier a test belongs in is answered by where it can be written, and
 * nothing else - docs/adr/0001-three-test-tiers.md. None of this needs a
 * document, let alone a running Thunderbird: what the harness pins, how the
 * environment override is resolved, and that a profile is a new directory
 * every time are all claims about this repo's own code. Filing them next to
 * the tier they describe would have been filing them by topic, and the cost
 * was concrete - `pnpm test` and CI run this tier and not that one, so the
 * guard below that fails when `manifest.json`'s floor outgrows the pin ran in
 * no pipeline at all.
 *
 * The three harness modules are imported directly rather than through
 * `harness/index.js`, which is the tier's own interface: the barrel re-exports
 * the WebDriver session, and pulling selenium into the tier that must not need
 * it would be paying for a Thunderbird this file never starts.
 *
 * One assertion about the harness does not belong here and stays where it is:
 * that the override skips the download needs the download, which is a run with
 * the network and ninety megabytes in it. That is
 * tests/thunderbird/provision.test.js.
 */

// The manifest, read rather than imported, following this tier's habit of
// taking the expected value from the file that owns it.
const manifest = JSON.parse(
  readFileSync(path.join(repoRoot, "manifest.json"), "utf8"),
);

/**
 * `128.0` and `128.14.0esr` as one comparable number, so that "at or above"
 * below means all three components rather than the major alone. A floor of
 * `128.15` is above this pin and no such build exists, which is exactly the
 * kind of raise the assertion has to catch.
 */
const ordinal = (version) => {
  const [major, minor = 0, patch = 0] = version
    .replace("esr", "")
    .split(".")
    .map(Number);
  return major * 1_000_000 + minor * 1_000 + patch;
};

describe("the pinned Thunderbird", () => {
  it("is the floor the manifest promises", () => {
    const floor = manifest.browser_specific_settings.gecko.strict_min_version;
    const [floorMajor] = floor.split(".");
    const [pinMajor] = THUNDERBIRD_VERSION.split(".");

    // The same train, and at or above the exact version promised. Raising the
    // manifest's floor without repinning the harness lands here rather than in
    // a run that quietly tests a version the add-on no longer supports. The
    // major is asserted on its own first because it is the raise that happens,
    // and a mismatch there reads better than a mismatch of two large numbers.
    expect(pinMajor).toBe(floorMajor);
    expect(ordinal(THUNDERBIRD_VERSION)).toBeGreaterThanOrEqual(ordinal(floor));
  });

  it("is an esr build, because the floor is one", () => {
    expect(THUNDERBIRD_VERSION.endsWith("esr")).toBe(true);
  });
});

describe("the profile", () => {
  it("is a new directory every time, not a cleaned-out one", async () => {
    const first = await createProfile();
    const second = await createProfile();
    try {
      expect(first).not.toBe(second);
      expect(existsSync(first)).toBe(true);
      expect(existsSync(second)).toBe(true);
    } finally {
      rmSync(first, { recursive: true, force: true });
      rmSync(second, { recursive: true, force: true });
    }
  });
});

describe(`the ${THUNDERBIRD_ENV} override`, () => {
  /**
   * The override's plumbing, not its outcome. Whether a given install can be
   * driven is a property of that install, and finding out costs a Thunderbird.
   * What is asserted here is the part that is this repo's to get right: the
   * variable is read, it wins over the pin, and a path that is not there is
   * reported as that rather than as a launch failure.
   */
  const withOverride = async (value, body) => {
    const before = process.env[THUNDERBIRD_ENV];
    if (value === undefined) delete process.env[THUNDERBIRD_ENV];
    else process.env[THUNDERBIRD_ENV] = value;
    try {
      return await body();
    } finally {
      if (before === undefined) delete process.env[THUNDERBIRD_ENV];
      else process.env[THUNDERBIRD_ENV] = before;
    }
  };

  it("takes the binary from the environment when it is set", async () => {
    await withOverride("/opt/thunderbird/thunderbird", () => {
      const resolved = resolveThunderbirdBinary();
      expect(resolved.binary).toBe("/opt/thunderbird/thunderbird");
      expect(resolved.source).toBe(THUNDERBIRD_ENV);
      // No version is claimed for an install the harness did not fetch.
      expect(resolved.version).toBeNull();
    });
  });

  it("falls back to the pinned build when it is not", async () => {
    await withOverride(undefined, () => {
      const resolved = resolveThunderbirdBinary();
      expect(resolved.source).toBe("pinned");
      expect(resolved.version).toBe(THUNDERBIRD_VERSION);
      expect(resolved.binary).toContain(THUNDERBIRD_VERSION);
    });
  });

  it("says which variable and which path when the path is wrong", async () => {
    // Nothing is fetched on the way to this failure: the override's path is
    // checked before either binary is provisioned, which is what lets this
    // assertion live in a tier that must not reach the network.
    await withOverride("/nonexistent/thunderbird", async () => {
      await expect(provision()).rejects.toThrow(
        new RegExp(`${THUNDERBIRD_ENV}.*/nonexistent/thunderbird`),
      );
    });
  });
});
