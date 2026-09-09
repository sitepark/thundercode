import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { THUNDERBIRD_VERSION, repoRoot } from "./harness/pins.js";
import { createProfile } from "./harness/profile.js";
import { provision, resolveThunderbirdBinary } from "./harness/provision.js";

/**
 * The half of this tier that needs no Thunderbird running: what it pins, and
 * how the environment override is read.
 *
 * These are in the Thunderbird tier rather than in the node tier even though
 * they would pass there, because they are claims about the harness rather than
 * about the add-on, and splitting them would mean someone changing the pin
 * gets a failure from a directory they were not working in.
 */

const THUNDERBIRD_ENV = "THUNDERBIRD_BINARY";

// The manifest, read rather than imported, following the node tier's habit of
// taking the expected value from the file that owns it.
const manifest = JSON.parse(
  readFileSync(path.join(repoRoot, "manifest.json"), "utf8"),
);

describe("the pinned Thunderbird", () => {
  it("is the floor the manifest promises", () => {
    const floor = manifest.browser_specific_settings.gecko.strict_min_version;
    const [floorMajor] = floor.split(".");
    const [pinMajor] = THUNDERBIRD_VERSION.split(".");

    // The same train, and at or above the exact version promised. Raising the
    // manifest's floor without repinning the harness lands here rather than in
    // a run that quietly tests a version the add-on no longer supports.
    expect(pinMajor).toBe(floorMajor);
    expect(Number.parseInt(THUNDERBIRD_VERSION, 10)).toBeGreaterThanOrEqual(
      Number.parseInt(floor, 10),
    );
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
      const { rm } = await import("node:fs/promises");
      await rm(first, { recursive: true, force: true });
      await rm(second, { recursive: true, force: true });
    }
  });
});

describe(`the ${THUNDERBIRD_ENV} override`, () => {
  /**
   * The override's plumbing, not its outcome. Whether a given install can be
   * driven is a property of that install - this machine's is 115, below the
   * manifest floor, so it cannot load a Manifest V3 MailExtension at all and
   * pointing the harness at it fails for a real reason. What is asserted here
   * is the part that is this repo's to get right: the variable is read, it
   * wins over the pin, and the download is not attempted when it is set.
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

  it("skips the download and provisions only the driver", async () => {
    // `process.execPath` stands in for an installed Thunderbird: the point is
    // that provisioning returns the path it was given rather than fetching 84
    // MiB to ignore it, and any existing file proves that.
    await withOverride(process.execPath, async () => {
      const { thunderbird, geckodriver } = await provision();
      expect(thunderbird.binary).toBe(process.execPath);
      expect(thunderbird.source).toBe(THUNDERBIRD_ENV);
      // The driver is still fetched: the only geckodriver on a typical Linux
      // box is the Firefox snap's, which cannot launch anything outside its
      // sandbox.
      expect(existsSync(geckodriver)).toBe(true);
    });
  });

  it("says which variable and which path when the path is wrong", async () => {
    await withOverride("/nonexistent/thunderbird", async () => {
      await expect(provision()).rejects.toThrow(
        /THUNDERBIRD_BINARY.*\/nonexistent\/thunderbird/,
      );
    });
  });
});
