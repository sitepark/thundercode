import { describe, expect, it } from "vitest";

import { nextVersion } from "../scripts/bump-version.mjs";

/**
 * The release workflow calls this and pushes the result to `main`, unreviewed.
 * Whatever it produces becomes the version in the next release's update
 * manifest, which every installed copy compares itself against.
 */
describe("nextVersion", () => {
  it("raises each part on its own", () => {
    expect(nextVersion("1.0.0", "patch")).toBe("1.0.1");
    expect(nextVersion("1.0.0", "minor")).toBe("1.1.0");
    expect(nextVersion("1.0.0", "major")).toBe("2.0.0");
  });

  it("zeroes the parts below the one it raises", () => {
    expect(nextVersion("1.4.2", "minor")).toBe("1.5.0");
    expect(nextVersion("1.4.2", "major")).toBe("2.0.0");
  });

  it("does not treat the numbers as decimals", () => {
    // The bug this catches is a bump that produces 1.10.0 as "1.1.0", which
    // Thunderbird would read as older than the version already installed.
    expect(nextVersion("1.9.0", "minor")).toBe("1.10.0");
    expect(nextVersion("1.9.9", "patch")).toBe("1.9.10");
  });

  it("refuses a version shape the project does not use", () => {
    // Anything with a suffix would silently lose it, and a version that goes
    // backwards cannot be recalled from the copies that already installed it.
    expect(() => nextVersion("1.0", "minor")).toThrow();
    expect(() => nextVersion("1.0.0-beta", "minor")).toThrow();
  });

  it("refuses an unknown part rather than guessing", () => {
    expect(() => nextVersion("1.0.0", "")).toThrow();
    expect(() => nextVersion("1.0.0", "MINOR")).toThrow();
  });
});
