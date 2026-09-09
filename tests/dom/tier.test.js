import { describe, expect, it } from "vitest";

/**
 * The other side of tests/node/tier.test.js: this directory is the one place a
 * document is allowed, and this file is what says so.
 *
 * It is also where the two capabilities the later tiers were chosen for get
 * pinned, and where the one gap in this tier is recorded as deliberate rather
 * than discovered. Range and Selection exist here, which is what makes caret
 * insertion drivable without Thunderbird. The editor command does not exist
 * here and no simulated DOM implements it, which is why the insertion
 * function's preferred path can only be exercised against a real Thunderbird.
 *
 * See docs/adr/0001-three-test-tiers.md.
 */
describe("the dom tier", () => {
  it("can build a document and query it back", () => {
    document.body.innerHTML = "";
    const pre = document.createElement("pre");
    pre.className = "thundercode-block";
    pre.textContent = "const answer = 42;";
    document.body.append(pre);

    const found = document.querySelector("pre.thundercode-block");
    expect(found).toBe(pre);
    expect(found.textContent).toBe("const answer = 42;");
  });

  it("has Range and Selection, which is what caret insertion needs", () => {
    document.body.innerHTML = "<p>before</p>";
    const range = document.createRange();
    range.selectNodeContents(document.querySelector("p"));

    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    expect(selection.rangeCount).toBe(1);
    expect(selection.getRangeAt(0).toString()).toBe("before");
  });

  it("has no editor command, which is what the third tier is for", () => {
    expect(document.execCommand).toBeUndefined();
  });
});
