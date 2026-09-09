import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { THUNDERBIRD_ENV, provision } from "./harness/index.js";

/**
 * The one claim about the harness that cannot be made without the download,
 * which is what keeps it in this tier: everything else the harness pins and
 * resolves is asserted in tests/node/thunderbird-harness.test.js, where
 * `pnpm test` and CI can see it.
 *
 * See docs/adr/0001-three-test-tiers.md for the rule that split them.
 */
describe(`the ${THUNDERBIRD_ENV} override`, () => {
  const withOverride = async (value, body) => {
    const before = process.env[THUNDERBIRD_ENV];
    process.env[THUNDERBIRD_ENV] = value;
    try {
      return await body();
    } finally {
      if (before === undefined) delete process.env[THUNDERBIRD_ENV];
      else process.env[THUNDERBIRD_ENV] = before;
    }
  };

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
});
