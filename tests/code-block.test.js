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

/** The block's text, which for unhighlighted source is the whole content. */
const blockText = (source, options) =>
  preContent(buildCodeBlockHtml({ source, ...options }).html);

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

  it("reproduces relative indentation exactly", () => {
    expect(blockText("def f():\n    if x:\n        return 1")).toBe(
      "def f():\n    if x:\n        return 1",
    );
  });

  /**
   * Ticket 05 changes what the source is: everything below is asserted on the
   * cleaned-up text, not on the paste. Ticket 02's "reproduced exactly" now
   * means the structure the author sees in their editor, not the bytes on the
   * clipboard.
   */
  describe("normalising the pasted source", () => {
    it("expands tabs to spaces at a width of four", () => {
      expect(blockText("if x:\n\treturn 1")).toBe("if x:\n    return 1");
    });

    it("expands tabs at the width the caller asks for", () => {
      expect(blockText("if x:\n\treturn 1", { tabWidth: 2 })).toBe(
        "if x:\n  return 1",
      );
    });

    /**
     * A tab advances to the next tab stop rather than becoming a fixed run of
     * spaces. Substituting four spaces for every tab would skew any line that
     * uses a tab to line something up after other characters, which is exactly
     * where the difference is visible.
     */
    it("advances a tab to the next tab stop, not by a fixed run of spaces", () => {
      expect(blockText("a\tb")).toBe("a   b");
      expect(blockText("abcd\te")).toBe("abcd    e");
    });

    /**
     * Ticket 10 feeds this from a settings field, where a half-typed value is
     * `NaN` and a cleared one may be `0`. Neither may take the block down.
     */
    it("falls back to four when the caller has no usable tab width", () => {
      expect(blockText("if x:\n\treturn 1", { tabWidth: Number.NaN })).toBe(
        "if x:\n    return 1",
      );
      expect(blockText("if x:\n\treturn 1", { tabWidth: 0 })).toBe(
        "if x:\n    return 1",
      );
    });

    /**
     * Invisible characters at the end of a line are the one thing that makes
     * `pre-wrap` wrap a line that plainly fits. The `\r` of a CRLF paste is
     * caught by the same strip, which is how Windows source arrives as LF.
     */
    it("strips trailing whitespace from every line", () => {
      expect(blockText("a   \nb\t\nc")).toBe("a\nb\nc");
      expect(blockText("a\r\nb\r\n")).toBe("a\nb");
    });

    it("strips leading and trailing blank lines", () => {
      expect(blockText("\n\n   \nx\ny\n  \n\n")).toBe("x\ny");
    });

    it("keeps blank lines inside the snippet, which are the author's", () => {
      expect(blockText("a\n\nb")).toBe("a\n\nb");
    });

    it("removes the indentation shared by every line", () => {
      expect(blockText("    def f():\n        return 1")).toBe(
        "def f():\n    return 1",
      );
    });

    /**
     * The failure this guards against is silent: a blank line has no
     * indentation, so counting it as zero would make the shared indent zero
     * for most real snippets and quietly turn the transform off.
     */
    it("is not defeated by interspersed blank lines", () => {
      expect(blockText("    a\n\n    b")).toBe("a\n\nb");
      expect(blockText("    a\n  \n    b")).toBe("a\n\nb");
    });

    it("removes nothing when one line is already at zero indent", () => {
      expect(blockText("def f():\n    return 1")).toBe(
        "def f():\n    return 1",
      );
    });

    /**
     * The property that makes normalisation safe to apply without asking:
     * running it over its own output is a no-op, so nothing erodes if a
     * snippet makes the round trip twice.
     */
    it("is idempotent", () => {
      const once = blockText("\n\t\tdef f():\n\n\t\t\treturn 1   \n\n");

      expect(once).toBe("def f():\n\n    return 1");
      expect(blockText(once)).toBe(once);
    });

    /**
     * An HTML parser discards a newline directly after the `<pre>` start tag,
     * which used to cost a snippet its leading blank line. Stripping leading
     * blank lines removes the hazard rather than compensating for it — but
     * only for as long as the block's text cannot begin with a newline, which
     * is what this pins.
     */
    it("never opens with a newline for the parser to eat", () => {
      expect(blockText("\n\n\nx")).not.toMatch(/^\n/);
    });
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

    /**
     * Nothing but whitespace normalises away entirely: an empty block rather
     * than a block of dead space.
     */
    it("handles source that is entirely blank lines", () => {
      const { html } = buildCodeBlockHtml({ source: "\n \n\t\n" });

      expect(preContent(html)).toBe("");
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
