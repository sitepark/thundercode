import { describe, expect, it } from "vitest";

import { HARDCODED_BLOCK_HTML } from "../src/code-block/hardcoded-block.js";

/**
 * A guard on the one way the hardcoded block can fail silently: every
 * declaration lives inside a double-quoted `style` attribute, so a nested
 * double quote ends the attribute early and an HTML parser drops every
 * property after it. The block still renders, just with none of its styling,
 * which looks like the insertion having worked.
 *
 * Ticket 02 replaces this constant with `buildCodeBlockHtml`, and this file
 * gives way to that seam's tests.
 */
describe("the hardcoded block", () => {
  const preStyle = HARDCODED_BLOCK_HTML.match(/^<pre style="([^"]*)">/)?.[1];

  it("is a single pre element carrying one intact style attribute", () => {
    expect(preStyle).toBeDefined();
    expect(HARDCODED_BLOCK_HTML).toMatch(/<\/pre>$/);
  });

  it("keeps every declaration inside that attribute", () => {
    expect(preStyle).toMatch(/font-family:[^;]*\bmonospace\b/);
    expect(preStyle).toContain("white-space: pre-wrap");
    expect(preStyle).toMatch(/font-size: \d+px/);
  });

  it("styles its spans inline, with no classes to be stripped", () => {
    expect(HARDCODED_BLOCK_HTML).toContain('<span style="');
    expect(HARDCODED_BLOCK_HTML).not.toContain("class=");
  });
});
