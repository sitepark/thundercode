import { describe, expect, it } from "vitest";

/**
 * This tier's defining property, asserted rather than left to the config.
 *
 * The pipeline is pure because nothing it depends on has ever been allowed to
 * be a document, and what has kept it that way is that reaching for one here
 * throws. That is a claim about the runner, not about any module, so no other
 * test in this directory would notice it breaking: switch the whole suite to
 * jsdom and everything below still passes while the property is gone. Hence a
 * test whose only subject is the tier.
 *
 * See docs/adr/0001-three-test-tiers.md for why the boundary is this
 * directory rather than a pragma at the top of each file.
 */
describe("the node tier", () => {
  it("has no document, so a test that reaches for one fails", () => {
    expect(globalThis.document).toBeUndefined();
    expect(() => document.createElement("pre")).toThrow(ReferenceError);
  });

  it("has no window either", () => {
    expect(globalThis.window).toBeUndefined();
  });
});
