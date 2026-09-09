import { describe, expect, it } from "vitest";

import {
  CONTAINER_CLASS,
  buildCodeBlockHtml,
} from "../src/code-block/build-code-block-html.js";
// The one import here that is not the seam, and only ever read from: the
// bundle's own language list is what "detection can only return a language
// present in the bundle" is a claim about, and it is also what the popup fills
// its dropdown from. Asserting against it keeps that one list one list.
import hljs from "../vendor/highlight.js/common.js";

/**
 * Read the block back without pinning its markup shape. Asserting on the
 * literal start tag would make adding any second attribute to the `<pre>` a
 * suite-wide failure for no change in behaviour, and the same goes for the
 * wrapper around it: only the tests below that are *about* the wrapper look
 * for it.
 */
const preStyle = (html) => html.match(/<pre\b[^>]*\bstyle="([^"]*)"/)?.[1];
const preContent = (html) =>
  html.replace(/^[\s\S]*?<pre\b[^>]*>/, "").replace(/<\/pre>[\s\S]*$/, "");

/**
 * The block's text, read straight off the markup with no spans to see through.
 *
 * `plaintext` is named rather than left out, and that is the point of the
 * helper: since ticket 04, *not* naming a language asks for auto-detection, so
 * a test about tab stops or common indent would otherwise be reading whatever
 * spans the highlighter's guess happened to wrap the text in. These assertions
 * are about the text and nothing else, so they pin the one rendering that has
 * no colour in it. Callers can still override it.
 */
const blockText = (source, options) =>
  preContent(
    buildCodeBlockHtml({ source, language: "plaintext", ...options }).html,
  );

/**
 * What a recipient sees: the block's content with the token spans taken back
 * off and the escaping undone. Highlighting must be the only thing that
 * changes between a highlighted block and an unhighlighted one, so the tests
 * that care about the *code* rather than the colour go through this and stay
 * indifferent to which tokens the highlighter happened to find.
 */
const visibleText = (html) =>
  preContent(html)
    .replace(/<\/?span[^>]*>/g, "")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    // Last, so that an `&amp;lt;` in the output — the double-escaping this is
    // partly here to catch — still comes back as a visible `&lt;`.
    .replaceAll("&amp;", "&");

/**
 * Deliberately not the shipped theme, and deliberately incomplete.
 *
 * Tests inject this so that swapping the theme stylesheet — which is not a
 * behaviour change — cannot fail the suite. The gaps are load-bearing too:
 * `hljs-property` and `hljs-number` are absent so that the "unstyled span"
 * degradation is exercised by real highlighter output rather than by a
 * hand-made class name. Real themes have such gaps as well; the GitHub theme
 * leaves six token classes empty on purpose.
 */
const themeMap = {
  // The container rather than a token: the colour of the text no token claims,
  // keyed by the class highlight.js puts on the element that wraps the code.
  // Nothing like the shipped theme's, so a test reading it back cannot pass
  // against a colour written into the seam by hand. Text colour only — the
  // block's fill is its own chrome, chosen with the border, and a theme's
  // `.hljs` background is the page colour it assumes rather than a fill.
  [CONTAINER_CLASS]: "color: #112233",
  "hljs-keyword": "color: #aa0000",
  "hljs-string": "color: #00aa00; font-style: italic",
  "hljs-comment": "color: #777777; font-style: italic",
  "hljs-title": "color: #6f42c1; font-weight: bold",
  // The pair that makes the key format worth having. A lookup on the first
  // class alone would give both of these the same colour.
  "hljs-variable": "color: #0000aa",
  "hljs-variable language_": "color: #aa0000",
};

/**
 * The attributes of the first span wrapping exactly `token`, or `undefined` if
 * the highlighter did not wrap that text in a span at all. The two are kept
 * apart on purpose: "no span" and "a span with no style" are different
 * outcomes, and the degradation case asserts on the second.
 */
const spanFor = (html, token) =>
  html.match(new RegExp(`<span([^>]*)>${token}</span>`))?.[1];

/** The `style` attribute of that span, or `undefined` if it carries none. */
const styleOf = (html, token) =>
  spanFor(html, token)?.match(/style="([^"]*)"/)?.[1];

describe("buildCodeBlockHtml", () => {
  it("wraps the source in a single pre element", () => {
    const { html } = buildCodeBlockHtml({
      source: "hello",
      language: "plaintext",
    });

    expect(preContent(html)).toBe("hello");
    expect(html.match(/<pre\b/g)).toHaveLength(1);
  });

  it("escapes HTML metacharacters, so source cannot inject elements", () => {
    const { html } = buildCodeBlockHtml({
      source: '<img src=x onerror="alert(1)"> a && b',
      // The unhighlighted path, which is the one with its own escaping. The
      // highlighter escapes its own output and has its own test below; asking
      // for detection here would silently swap which of the two is under test,
      // and this source detects as XML.
      language: "plaintext",
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

  /**
   * A plain-text compose window has no markup to take, so the seam returns the
   * same block a second way: the normalised source itself. It is returned
   * rather than recomputed by the caller because the alternative is a second
   * copy of the four transforms, and two copies of that drift.
   */
  describe("the plain-text rendering it returns alongside the html", () => {
    it("is the normalised source, not the raw paste", () => {
      const { text } = buildCodeBlockHtml({
        source: "\n\tif x:\n\t\treturn 1  \n\n",
      });

      expect(text).toBe("if x:\n    return 1");
    });

    /**
     * The whole point of the plain-text path: what a mailing list has done
     * with code for decades only works if the indentation is still there.
     */
    it("keeps relative indentation", () => {
      const { text } = buildCodeBlockHtml({
        source: "    def f():\n        if x:\n            return 1",
      });

      expect(text).toBe("def f():\n    if x:\n        return 1");
    });

    /**
     * The two renderings are the same code, escaped and not. Escaping the
     * plain-text one would put a literal `&lt;` in the message, which is the
     * failure this pins.
     */
    it("carries the source's real characters, with no escaping", () => {
      const source = "if (a < b && c > d) return '<x>';";

      const { html, text } = buildCodeBlockHtml({
        source,
        language: "plaintext",
      });

      expect(text).toBe(source);
      expect(preContent(html)).toBe(
        "if (a &lt; b &amp;&amp; c &gt; d) return '&lt;x&gt;';",
      );
    });

    it("carries no markup, styling or wrapper of its own", () => {
      const { text } = buildCodeBlockHtml({ source: "print(1)" });

      expect(text).toBe("print(1)");
    });

    it("is empty when the source normalises away to nothing", () => {
      expect(buildCodeBlockHtml({ source: "" }).text).toBe("");
      expect(buildCodeBlockHtml({ source: "\n \n\t\n" }).text).toBe("");
    });
  });

  /**
   * The colour, and the one rule that carries it anywhere: a `class` survives
   * only as long as the stylesheet that explains it, and the recipient's
   * client drops that stylesheet the first time anyone in the thread replies.
   *
   * Every assertion here injects the fixture map above. None of them loads the
   * shipped theme, so changing theme — which is not a behaviour change — can
   * never fail the suite.
   */
  describe("syntax highlighting", () => {
    const javascript = "class Foo { m() { return this.x } }";

    it("writes the injected map's declarations onto the tokens as styles", () => {
      const { html } = buildCodeBlockHtml({
        source: "const a = 1;",
        language: "javascript",
        themeMap,
      });

      expect(styleOf(html, "const")).toBe("color: #aa0000");
    });

    /**
     * highlight.js does not emit one class per span: a tiered scope such as
     * `variable.language` arrives as `class="hljs-variable language_"`. The
     * exact list has to win, because in a real theme it is a *different*
     * colour from the bare class — `this` and `self` are keyword-coloured
     * while an ordinary variable is not. Getting this wrong is silent.
     */
    it("prefers the exact class list over the first class alone", () => {
      const { html } = buildCodeBlockHtml({
        source: javascript,
        language: "javascript",
        themeMap,
      });

      expect(styleOf(html, "this")).toBe(themeMap["hljs-variable language_"]);
      expect(styleOf(html, "this")).not.toBe(themeMap["hljs-variable"]);
    });

    /**
     * The fallback is what renders a modifier the theme has no rule for.
     * `Foo` arrives as `hljs-title class_`, which this map does not carry —
     * the bare `hljs-title` entry is what it should land on.
     */
    it("falls back to the first class when the exact list is absent", () => {
      const { html } = buildCodeBlockHtml({
        source: javascript,
        language: "javascript",
        themeMap,
      });

      expect(styleOf(html, "Foo")).toBe(themeMap["hljs-title"]);
    });

    /**
     * The map is always incomplete — themes leave token classes unstyled on
     * purpose — so an unknown class is a normal input, not an error.
     */
    it("leaves a class absent from the map as an unstyled span", () => {
      const { html } = buildCodeBlockHtml({
        source: javascript,
        language: "javascript",
        themeMap,
      });

      // `x` is `hljs-property`, which the fixture has no entry for. The span
      // is still emitted: dropping it would mean working out which `</span>`
      // to drop with it, and unstyled is what the theme's author intends for
      // the classes they left empty.
      expect(spanFor(html, "x")).toBe("");
      expect(styleOf(html, "x")).toBeUndefined();
    });

    it("highlights without a theme map at all rather than throwing", () => {
      const { html } = buildCodeBlockHtml({
        source: javascript,
        language: "javascript",
      });

      expect(visibleText(html)).toBe(javascript);
      // One `style` attribute in the whole block, and it is the `<pre>`'s.
      // Every token span came out bare.
      expect(html.match(/style=/g)).toHaveLength(1);
    });

    it("rewrites every highlighter class into a style", () => {
      const { html } = buildCodeBlockHtml({
        source: javascript,
        language: "javascript",
        themeMap,
      });

      expect(html).toContain("<span");
      // Read off the content, so the wrapper's marker class — the one class in
      // the block, and not a highlighting one — is out of the question here.
      expect(preContent(html)).not.toMatch(/\bclass=/);
      expect(html).not.toMatch(/<style\b/i);
    });

    /**
     * Set once on the `<pre>` and inherited. Repeating it on every token would
     * multiply the size of a message that is already several times its source.
     */
    it("puts no font size on the tokens", () => {
      const { html } = buildCodeBlockHtml({
        source: javascript,
        language: "javascript",
        themeMap,
        fontSize: 16,
      });

      expect(html.match(/font-size/g)).toHaveLength(1);
    });

    /**
     * The highlighter escapes its own output. Escaping it a second time would
     * put the entities themselves in the message — a recipient reading
     * `&amp;lt;` where the code says `<`.
     */
    it("escapes the source exactly once", () => {
      const source = 'if (a < b && c > d) return "<x>";';

      const { html } = buildCodeBlockHtml({
        source,
        language: "javascript",
        themeMap,
      });

      expect(html).toContain("&lt;");
      expect(html).not.toContain("&amp;lt;");
      expect(visibleText(html)).toBe(source);
    });

    /**
     * The order the whole pipeline depends on. Tokenising the raw paste would
     * wrap spans around indentation that is about to be sliced off, and the
     * slice would then be cutting inside markup.
     */
    it("normalises before it highlights", () => {
      const { html } = buildCodeBlockHtml({
        source: "\n    def f():\n\t\treturn 1  \n",
        language: "python",
        themeMap,
      });

      expect(visibleText(html)).toBe("def f():\n    return 1");
    });

    /**
     * Ticket 09's obligation, restated as a test. There is no such thing as a
     * highlighted plain-text mail, and markup in `text` would be markup in the
     * message.
     */
    it("leaves the plain-text rendering unhighlighted", () => {
      const { text } = buildCodeBlockHtml({
        source: javascript,
        language: "javascript",
        themeMap,
      });

      expect(text).toBe(javascript);
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

    /**
     * Stated separately from the border because a client may take one and not
     * the other: Outlook's Word renderer draws the border and ignores the
     * radius, which leaves the square-cornered block and is why this is a
     * rounding of the chrome rather than a replacement for it.
     */
    it("rounds the block's corners", () => {
      const style = preStyle(buildCodeBlockHtml({ source: "x" }).html);

      expect(style).toMatch(/border-radius:\s*\S+/);
    });

    /**
     * The block's own text colour was the last one still written out inside
     * the seam. It arrives as data like every token colour now, which is what
     * makes swapping the theme stylesheet a one-file change rather than a
     * one-file change plus a hex code nobody remembers is there.
     */
    it("takes its own text colour from the theme", () => {
      const style = preStyle(
        buildCodeBlockHtml({ source: "x", themeMap }).html,
      );

      expect(style).toContain(themeMap[CONTAINER_CLASS]);
    });

    /**
     * A caller with no theme — or a popup whose stylesheet failed to load —
     * still gets a block that reads as one, in the seam's own colours. The
     * fill is stated either way, since it never came from the theme.
     */
    it("still states both colours when no theme is injected", () => {
      const style = preStyle(buildCodeBlockHtml({ source: "x" }).html);

      expect(style).toMatch(/(^|;\s*)color:\s*\S+/);
      expect(style).toMatch(/background(-color)?:\s*\S+/);
      expect(style).not.toContain(themeMap[CONTAINER_CLASS]);
    });

    /**
     * The container entry shares the map with the token entries, so the one
     * thing worth pinning is that it cannot leak onto a token. The background
     * count goes with it: one for the whole block, never one per span, which
     * would both paint a stripe behind every keyword and multiply the size of
     * the message.
     */
    it("never puts the container's colour on a token", () => {
      const { html } = buildCodeBlockHtml({
        source: "const a = 1;",
        language: "javascript",
        themeMap,
      });

      expect(preContent(html)).not.toContain(themeMap[CONTAINER_CLASS]);
      expect(html.match(/background-color/g)).toHaveLength(1);
    });
  });

  /**
   * The block is inserted into a spell-checked contenteditable, and code is
   * not prose.
   */
  describe("how an editor should treat it", () => {
    it("opts the block out of spell checking", () => {
      const { html } = buildCodeBlockHtml({ source: "const usr = getEnv();" });

      expect(html).toMatch(/<pre\b[^>]*\bspellcheck="false"/);
    });

    /**
     * The attribute above is the standard's answer and Thunderbird's compose
     * editor is the one reader that ignores it: Gecko's inline spell checker
     * takes a different branch for mail editors, one that consults three
     * classes of its own and never the attribute. So the block is wrapped in
     * the only one of the three that is inert everywhere else — a signature
     * would be rewritten when the identity's signature changes, and a
     * `blockquote type="cite"` would render as quoted text on the recipient's
     * screen.
     *
     * Pinned as an exact string because it is not ours to spell differently.
     */
    it("wraps the block in the container that mail editor skips", () => {
      const { html } = buildCodeBlockHtml({ source: "const usr = getEnv();" });

      expect(html).toMatch(/^<div class="moz-forward-container"><pre\b/);
      expect(html).toMatch(/<\/pre><\/div>$/);
    });

    /**
     * A marker and not a styling hook. Anything else on it — a style, a second
     * class — would make the wrapper part of how the block looks, and the
     * block's appearance is the `<pre>`'s business alone.
     */
    it("puts nothing but that class on the wrapper", () => {
      const { html } = buildCodeBlockHtml({ source: "x" });

      const [, attributes] = html.match(/^<div\b([^>]*)>/);
      expect(attributes.match(/\b[\w-]+=/g)).toEqual(["class="]);
      expect(html.match(/<div\b/g)).toHaveLength(1);
    });

    /**
     * Nothing else may join it. The attribute is the one exception to a
     * `<pre>` that carries styling and nothing besides, so the exception is
     * pinned rather than left to be widened by the next thing that seems
     * harmless.
     */
    it("adds nothing else to the start tag", () => {
      const [, attributes] = buildCodeBlockHtml({ source: "x" }).html.match(
        /<pre\b([^>]*)>/,
      );

      expect(attributes.match(/\b[\w-]+=/g)).toEqual(["spellcheck=", "style="]);
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

    /**
     * A class is meaningless without the stylesheet that defines it, and no
     * stylesheet reaches the recipient. The one exception is the wrapper's
     * marker class, which asks nothing of any stylesheet: a client that keeps
     * it renders the block the same as a client that strips it. Everything
     * inside the wrapper — the `<pre>` and every token span — stays
     * class-free, so what the block *looks like* survives on its own.
     */
    it("carries no class attribute inside the wrapper", () => {
      expect(html.match(/\bclass=/g)).toHaveLength(1);
      expect(html.replace(/^<div[^>]*>/, "")).not.toMatch(/\bclass=/);
    });

    it("carries no style element, which reply-quoting would discard", () => {
      expect(html).not.toMatch(/<style\b/i);
    });

    it("uses no table wrapper", () => {
      expect(html).not.toMatch(/<table\b/i);
    });

    it("is one preformatted element in one wrapper and nothing else", () => {
      expect(html.match(/<pre\b/g)).toHaveLength(1);
      expect(html.match(/<div\b/g)).toHaveLength(1);
      expect(html).toMatch(/<\/pre><\/div>$/);
    });
  });

  describe("the language it used", () => {
    /**
     * Detected as bash by a wide margin, and not remotely json — which is what
     * makes it usable both as the detection fixture and as the source fed to
     * the wrong grammar on purpose.
     */
    const shellScript = "#!/bin/sh\nfor f in *; do echo $f; done";

    /**
     * The report is of what was applied, never of what was asked for. Ticket
     * 02 hardcoded `plaintext` here because nothing could be highlighted; the
     * rule it was protecting is the same one now, and ticket 06's preview
     * depends on it — a claimed language the block does not carry would be
     * displayed as fact.
     */
    it("reports the language it actually applied", () => {
      expect(
        buildCodeBlockHtml({ source: "const a = 1;", language: "javascript" })
          .detectedLanguage,
      ).toBe("javascript");
    });

    /**
     * Naming no language asks for detection, and the guess is applied as well
     * as reported — the block is highlighted as the language the dropdown will
     * be showing, which is the whole of "the common case needs no input".
     *
     * A shell script is the fixture because it scores far above everything
     * else in the bundle, so this pins the behaviour rather than the
     * highlighter's opinion on a marginal case.
     */
    it("detects the language when none is chosen, and applies it", () => {
      const { html, detectedLanguage } = buildCodeBlockHtml({
        source: shellScript,
        themeMap,
      });

      expect(detectedLanguage).toBe("bash");
      expect(html).toContain("<span");
      expect(visibleText(html)).toBe(shellScript);
    });

    /**
     * An override is an instruction, not a hint: the requested language is
     * used even where detection would have said something else, and the report
     * says so. The pair matters more than either half — the same source is
     * detected as bash one line up and rendered as json here.
     */
    it("uses the requested language instead of detecting", () => {
      const { detectedLanguage } = buildCodeBlockHtml({
        source: shellScript,
        language: "json",
        themeMap,
      });

      expect(detectedLanguage).toBe("json");
    });

    /**
     * `highlightAuto` reports no language at all when nothing scores, which an
     * empty paste guarantees. The caller must get a block and a straight
     * answer rather than `undefined` leaking out into the dropdown.
     */
    it("reports plaintext when detection finds nothing", () => {
      const { html, detectedLanguage } = buildCodeBlockHtml({ source: "" });

      expect(detectedLanguage).toBe("plaintext");
      expect(html).not.toContain("<span");
    });

    /**
     * The popup builds its dropdown from `hljs.listLanguages()` and then
     * assigns `detectedLanguage` to it, so a detected name the bundle does not
     * carry would be a dropdown that silently shows the wrong entry. The
     * bundle is imported here for exactly that reason: this asserts the two
     * lists are the same list, which is the guarantee, and a hand-written copy
     * of the names would be a third list to keep in step.
     */
    it("only ever reports a language the bundle carries", () => {
      const registered = hljs.listLanguages();

      for (const source of [
        shellScript,
        "def f(name):\n    print(name)\n",
        '{"a": 1, "b": [true, null]}',
        "SELECT * FROM t WHERE a = 1;",
        "not code at all, just a sentence",
        "",
      ]) {
        expect(registered).toContain(
          buildCodeBlockHtml({ source }).detectedLanguage,
        );
      }
    });

    /**
     * `hljs.highlight` throws on a language it was never given. A stale
     * setting or a caller guessing at an alias the bundle does not carry must
     * cost the colour, not the block.
     */
    it("degrades to plaintext for a language the bundle does not have", () => {
      const { html, detectedLanguage } = buildCodeBlockHtml({
        source: "const a = 1;",
        language: "klingon",
        themeMap,
      });

      expect(detectedLanguage).toBe("plaintext");
      expect(html).not.toContain("<span");
    });

    /**
     * Picking the wrong language from the dropdown is a normal thing to do —
     * it is what the dropdown is for. Source that trips the chosen language's
     * `illegal` rule must still produce a block.
     */
    it("survives source that is not the language it was told", () => {
      const { html } = buildCodeBlockHtml({
        source: shellScript,
        language: "json",
        themeMap,
      });

      expect(visibleText(html)).toBe(shellScript);
    });

    it("puts no language label in the block", () => {
      const source = "print(1)";

      const { html } = buildCodeBlockHtml({ source, language: "python" });

      expect(visibleText(html)).toBe(source);
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

      const { html } = buildCodeBlockHtml({ source, language: "plaintext" });

      expect(preContent(html)).toBe(source);
    });
  });

  describe("edge inputs", () => {
    it("handles empty source without throwing", () => {
      const { html } = buildCodeBlockHtml({ source: "" });

      expect(preContent(html)).toBe("");
    });

    it("handles a single line with no trailing newline", () => {
      const { html } = buildCodeBlockHtml({
        source: "const a = 1;",
        language: "plaintext",
      });

      expect(preContent(html)).toBe("const a = 1;");
    });

    /**
     * Nothing but whitespace normalises away entirely: an empty block rather
     * than a block of dead space.
     */
    it("handles source that is entirely blank lines", () => {
      const { html } = buildCodeBlockHtml({ source: "\n \n\t\n" });

      expect(preContent(html)).toBe("");
      expect(html).toMatch(/<pre[^>]*>/);
      expect(html).toMatch(/<\/pre><\/div>$/);
    });

    /**
     * The one thing that would corrupt the code: hard-wrapping it. A long line
     * has to come out as one line, however wide, and wrap only at render time.
     */
    it("never hard-wraps a single very long line", () => {
      const source = "x".repeat(5000);

      const { html } = buildCodeBlockHtml({ source, language: "plaintext" });

      expect(preContent(html)).toBe(source);
    });
  });
});
