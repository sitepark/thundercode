import { describe, expect, it } from "vitest";

import { buildCodeBlockHtml } from "../src/code-block/build-code-block-html.js";

/**
 * Read the block back without pinning its markup shape. Asserting on the
 * literal start tag would make adding any second attribute to the `<pre>` a
 * suite-wide failure for no change in behaviour.
 */
const preStyle = (html) => html.match(/^<pre\b[^>]*\bstyle="([^"]*)"/)?.[1];
const preContent = (html) =>
  html.replace(/^<pre\b[^>]*>/, "").replace(/<\/pre>$/, "");

describe("buildCodeBlockHtml", () => {
  it("wraps the source in a single pre element", () => {
    const { html } = buildCodeBlockHtml({ source: "hello" });

    expect(preContent(html)).toBe("hello");
    expect(html.match(/<pre\b/g)).toHaveLength(1);
  });

  it("escapes HTML metacharacters, so source cannot inject elements", () => {
    const { html } = buildCodeBlockHtml({
      source: '<img src=x onerror="alert(1)"> a && b',
    });

    expect(html).not.toContain("<img");
    expect(html).toContain(
      "&lt;img src=x onerror=\"alert(1)\"&gt; a &amp;&amp; b",
    );
  });

  it("reproduces indentation exactly", () => {
    const source = "def f():\n    if x:\n        return 1\n";

    const { html } = buildCodeBlockHtml({ source });

    expect(html).toContain("def f():\n    if x:\n        return 1\n");
  });

  /**
   * The HTML parser drops a newline immediately after the `<pre>` start tag,
   * so a source that opens with a blank line would silently lose it. The rule
   * is in the HTML spec, not in this code: the only way to emit a leading
   * newline is to write two.
   */
  it("survives the parser eating the newline after the start tag", () => {
    const { html } = buildCodeBlockHtml({ source: "\n\nx" });

    expect(preContent(html)).toBe("\n\n\nx");
  });

  describe("the block's own styling", () => {
    it("uses a monospace stack ending in the generic keyword", () => {
      const style = preStyle(buildCodeBlockHtml({ source: "x" }).html);

      expect(style).toMatch(/font-family:[^;]*,\s*monospace(;|$)/);
    });

    it("sets the font size in px, since em and rem are unreliable in mail", () => {
      const style = preStyle(buildCodeBlockHtml({ source: "x" }).html);

      expect(style).toMatch(/font-size:\s*\d+px/);
    });

    it("takes the font size from the caller", () => {
      const style = preStyle(
        buildCodeBlockHtml({ source: "x", fontSize: 16 }).html,
      );

      expect(style).toContain("font-size: 16px");
    });

    /**
     * Set once and inherited. Repeating it per token would multiply the
     * message size for no visual difference.
     */
    it("states the font size exactly once in the whole block", () => {
      const { html } = buildCodeBlockHtml({
        source: "one\ntwo\nthree",
        fontSize: 16,
      });

      expect(html.match(/font-size/g)).toHaveLength(1);
    });

    it("sets an explicit line height", () => {
      const style = preStyle(buildCodeBlockHtml({ source: "x" }).html);

      expect(style).toMatch(/line-height:\s*\S+/);
    });

    it("soft-wraps long lines rather than clipping them", () => {
      const style = preStyle(buildCodeBlockHtml({ source: "x" }).html);

      expect(style).toMatch(/white-space:\s*pre-wrap/);
    });

    it("reads as code at a glance: border, background, padding, margins", () => {
      const style = preStyle(buildCodeBlockHtml({ source: "x" }).html);

      expect(style).toMatch(/border:\s*\d+px solid/);
      expect(style).toMatch(/background(-color)?:\s*\S+/);
      expect(style).toMatch(/padding:\s*\S+/);
      expect(style).toMatch(/margin:\s*\S+/);
    });
  });

  /**
   * Everything a recipient's client is entitled to strip, rewrite or ignore.
   * Each of these is a way the block silently stops being a code block on
   * someone else's screen.
   */
  describe("what the markup must never contain", () => {
    const { html } = buildCodeBlockHtml({
      source: "const a = 1;\nconst b = 2;",
    });

    it("carries no class attribute for a client to rewrite", () => {
      expect(html).not.toMatch(/\bclass=/);
    });

    it("carries no style element, which reply-quoting would discard", () => {
      expect(html).not.toMatch(/<style\b/i);
    });

    it("uses no table wrapper", () => {
      expect(html).not.toMatch(/<table\b/i);
    });

    it("is one preformatted element and nothing else", () => {
      expect(html.match(/<pre\b/g)).toHaveLength(1);
      expect(html).toMatch(/<\/pre>$/);
    });
  });

  describe("the language it used", () => {
    /**
     * Ticket 02 has no highlighter, so nothing is coloured whatever the caller
     * asks for. Reporting back the requested language would be a lie the
     * popup would then display; plaintext is what actually rendered.
     */
    it("reports plaintext, because nothing is highlighted yet", () => {
      expect(buildCodeBlockHtml({ source: "x" }).detectedLanguage).toBe(
        "plaintext",
      );
      expect(
        buildCodeBlockHtml({ source: "x", language: "python" })
          .detectedLanguage,
      ).toBe("plaintext");
    });

    it("puts no language label in the block", () => {
      const source = "print(1)";

      const { html } = buildCodeBlockHtml({ source, language: "python" });

      expect(preContent(html)).toBe(source);
    });

    /**
     * Numbers baked into the text would be copied along with the code and
     * produce something that cannot run. Asserted as "the text is the source
     * and nothing else" so that a numbered line 10 cannot slip past a test
     * whose fixture happens to be nine lines long.
     */
    it("glues no line numbers to the lines", () => {
      const source = Array.from({ length: 12 }, (_, i) => `line ${i}`).join(
        "\n",
      );

      const { html } = buildCodeBlockHtml({ source });

      expect(preContent(html)).toBe(source);
    });
  });

  describe("edge inputs", () => {
    it("handles empty source without throwing", () => {
      const { html } = buildCodeBlockHtml({ source: "" });

      expect(preContent(html)).toBe("");
    });

    it("handles a single line with no trailing newline", () => {
      const { html } = buildCodeBlockHtml({ source: "const a = 1;" });

      expect(preContent(html)).toBe("const a = 1;");
    });

    it("handles source that is entirely blank lines", () => {
      const { html } = buildCodeBlockHtml({ source: "\n \n\t\n" });

      expect(html).toMatch(/^<pre[^>]*>/);
      expect(html).toMatch(/<\/pre>$/);
    });

    /**
     * The one thing that would corrupt the code: hard-wrapping it. A long line
     * has to come out as one line, however wide, and wrap only at render time.
     */
    it("never hard-wraps a single very long line", () => {
      const source = "x".repeat(5000);

      const { html } = buildCodeBlockHtml({ source });

      expect(preContent(html)).toBe(source);
    });
  });
});
