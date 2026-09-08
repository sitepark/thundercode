import hljs from "../../vendor/highlight.js/common.js";

const DEFAULT_FONT_SIZE = 13;
const DEFAULT_TAB_WIDTH = 4;

/**
 * The absence of highlighting rather than a way of highlighting. It is a real
 * registered language — running it produces escaped text and not one span — so
 * the seam short-circuits it instead, which keeps the escaping of a block with
 * no language identical to what it was before there was a highlighter.
 */
const PLAINTEXT = "plaintext";

/**
 * Turns pasted source into the code block that gets inserted into the
 * message, in both the renderings a compose window can take.
 *
 * This is the seam the whole feature is tested through. Everything behind it
 * is an internal: nothing else in this module is exported, and tests drive
 * only this function.
 *
 * It is pure by construction — no DOM, no `browser.*`, no I/O — which is why
 * the test runner needs no DOM environment. The highlighter is a plain
 * function dependency and stays inside that rule: it is arithmetic over a
 * string, and the vendored bundle imports as ordinary ESM under both the popup
 * and the test runner.
 *
 * The signature is the one the spec settles on and has not changed since
 * ticket 02.
 *
 * @param {object} options
 * @param {string} options.source Raw source text, as pasted.
 * @param {string} [options.language] Language to render as. `undefined` asks
 *   for auto-detection, which ticket 04 brings; until then it renders
 *   unhighlighted, and says so through `detectedLanguage`.
 * @param {Record<string, string>} [options.themeMap] Token class list to
 *   inline declaration string, keyed exactly as the class attribute is emitted
 *   (`"hljs-keyword"`, `"hljs-variable language_"`). Injected as data so the
 *   seam never reads a stylesheet itself. Omitting it renders every token
 *   unstyled rather than failing.
 * @param {number} [options.tabWidth] Spaces a tab expands to. Defaults to 4;
 *   ticket 10 makes it a setting.
 * @param {number} [options.fontSize] Block font size in px.
 * @returns {{ html: string, text: string, detectedLanguage: string }} The same
 *   block in the two renderings a composer can take — `html` for an HTML
 *   compose window, `text` for a plain-text one (ticket 09) — plus
 *   `detectedLanguage`, the language the block was actually rendered with,
 *   which the popup shows back to the user.
 */
export function buildCodeBlockHtml({
  source,
  language,
  themeMap,
  tabWidth,
  fontSize = DEFAULT_FONT_SIZE,
}) {
  // Normalisation is the first thing in the pipeline, before highlighting and
  // before escaping. A highlighter tokenising the raw paste would attach spans
  // to whitespace that is about to be removed, and stripping a common indent
  // out of finished markup means editing inside `<span>`s. The order is
  // load-bearing rather than incidental.
  const text = normaliseSource(source, resolveTabWidth(tabWidth));
  // Resolved once and used for both the rendering and the report, so the two
  // cannot disagree: what comes back is always the language that was applied.
  const appliedLanguage = resolveLanguage(language);

  return {
    html:
      `<pre style="${preStyle(fontSize)}">` +
      `${renderContent(text, appliedLanguage, themeMap)}</pre>`,
    // The normalised source itself, for the plain-text composer that has no
    // markup to take. It is returned rather than left internal because the
    // alternative is a second copy of the four transforms outside this module,
    // and two copies drift. It stays the *unhighlighted* text now that there
    // is a highlighter: highlighting is a property of the HTML rendering only,
    // and there is no such thing as a highlighted plain-text mail. Note it is
    // built from `text` and not from `html`, so no escaping or markup can
    // reach it by accident.
    text,
    // The language actually applied, never the one requested. Ticket 02
    // hardcoded `plaintext` here because nothing was highlighted; now the two
    // coincide only when nothing was highlighted, which is still the honest
    // answer for a caller that named a language the bundle does not have.
    detectedLanguage: appliedLanguage,
  };
}

/**
 * What the block will actually be rendered as, which is not always what was
 * asked for.
 *
 * `hljs.highlight` throws on a language it has never been given, so an
 * unregistered name — a stale setting, a caller guessing at an alias the
 * bundle does not carry, ticket 04 one day handing back something odd — must
 * be caught here. It degrades to no highlighting, because a monochrome block
 * is a far better outcome than an exception where a code block should be.
 *
 * `undefined` lands in the same place today. That is the auto-detection
 * request the signature has always described, and ticket 04 is where it stops
 * meaning "no highlighting" and starts meaning `hljs.highlightAuto`. Nothing
 * here has to move for that: it is one more branch in this function.
 */
function resolveLanguage(language) {
  return language && hljs.getLanguage(language) ? language : PLAINTEXT;
}

/**
 * The `<pre>`'s content: the code, escaped, with a `style` attribute on every
 * token the theme has an opinion about.
 *
 * The highlighter escapes its own output, so the two paths escape exactly
 * once each and never both.
 */
function renderContent(text, language, themeMap) {
  if (language === PLAINTEXT) return escapeHtml(text);

  // `ignoreIllegals` so a wrong pick from the dropdown degrades to imperfect
  // colour rather than to none. Without it, source that trips the language's
  // `illegal` rule comes back as plain escaped text while the result still
  // names the language — the block would then silently claim a highlighting it
  // does not have, which is the one thing `detectedLanguage` exists to prevent.
  const highlighted = hljs.highlight(text, { language, ignoreIllegals: true });

  return inlineTokenStyles(highlighted.value, themeMap);
}

/**
 * Rewrites highlight.js's `class` attributes into inline `style` attributes,
 * which is the whole of the reply-quoting contract: a class survives only as
 * long as the stylesheet that explains it, and the recipient's client drops
 * that stylesheet the first time anyone replies.
 *
 * Done with a regular expression, which is worth defending. The input is not
 * arbitrary HTML: highlight.js's `HTMLRenderer` emits a closed grammar of
 * escaped text, `<span class="…">` and `</span>` and nothing else, with no
 * attribute able to contain a `"`. It also could not be done with a parser
 * here even if that were preferable — the seam is pure and the test runner has
 * no DOM, which is exactly the constraint that keeps this module testable.
 */
function inlineTokenStyles(highlighted, themeMap) {
  return highlighted.replace(/<span class="([^"]*)">/g, (_tag, classList) => {
    const declarations = lookUpDeclarations(classList, themeMap);

    // A class the theme says nothing about leaves a bare `<span>` rather than
    // no span at all. Dropping it would mean tracking which `</span>` to drop
    // with it, and the theme's own author leaves several token classes
    // (`hljs-tag`, `hljs-params`, `hljs-punctuation`) deliberately unstyled —
    // an unstyled span is the intended rendering there, not a gap.
    return declarations ? `<span style="${declarations}">` : "<span>";
  });
}

/**
 * highlight.js does not emit one class per span. A tiered scope such as
 * `title.class` becomes `class="hljs-title class_"`, and the theme has
 * selectors to match: `.hljs-title.class_`, `.hljs-variable.language_`.
 *
 * So the exact class list is tried first and the first class only as a
 * fallback. The order is not cosmetic. In the GitHub theme
 * `.hljs-variable.language_` is grouped with the keyword colour while bare
 * `.hljs-variable` is grouped with the constant colour, so looking up only the
 * first class would paint every `this` and `self` the wrong colour — silently,
 * and only in the languages that have them.
 *
 * The fallback still earns its place: it is what renders `hljs-title class_
 * inherited__` when a theme styles only `.hljs-title`, and it is where an
 * unknown modifier goes rather than off a cliff.
 */
function lookUpDeclarations(classList, themeMap = {}) {
  return themeMap[classList] ?? themeMap[classList.split(" ")[0]];
}

/**
 * The seam is handed whatever the caller has: from ticket 10 that is a number
 * parsed out of a settings field, which is `NaN` while the field is empty and
 * could be `0`. Either would make tab expansion throw, so anything that is not
 * a positive whole number becomes the default — a block indented at four is a
 * far better failure than no block at all.
 */
function resolveTabWidth(tabWidth) {
  return Number.isInteger(tabWidth) && tabWidth > 0
    ? tabWidth
    : DEFAULT_TAB_WIDTH;
}

/**
 * Cleans up what an editor actually puts on the clipboard, in the order the
 * spec fixes:
 *
 * 1. tabs to spaces, so no mail client's tab stops can collapse indentation;
 * 2. trailing whitespace off each line, so `pre-wrap` never wraps on
 *    characters nobody can see;
 * 3. blank lines off the top and bottom, so the border has no dead space
 *    inside it;
 * 4. the indentation every non-blank line shares, so a method copied out of
 *    the middle of a class arrives flush left.
 *
 * The order is what makes the last two simple. Once trailing whitespace is
 * gone, a "blank" line is exactly the empty string, so both the edge trim and
 * the shared-indent calculation can test for it directly instead of carrying
 * a whitespace predicate around.
 *
 * Nothing here can lose information: the removed prefix is by definition
 * present on every line, and the removed whitespace is invisible.
 *
 * The result is a fixed point — no tabs, no trailing whitespace, no blank
 * edges, at least one line flush left — so running it again changes nothing.
 */
function normaliseSource(source, tabWidth) {
  // Splitting on \n leaves the \r of a CRLF paste at the end of each line,
  // where the trailing-whitespace strip removes it. Windows sources therefore
  // normalise to LF without needing a step of their own.
  const lines = source
    .split("\n")
    .map((line) => stripTrailingWhitespace(expandTabs(line, tabWidth)));

  return stripCommonIndent(stripBlankEdgeLines(lines)).join("\n");
}

/**
 * Advances to the next tab stop rather than substituting a fixed run of
 * spaces. Only the tab-stop reading reproduces what the author saw in their
 * editor: source that mixes tabs with spaces to line up a continuation, or
 * uses a tab mid-line as a column separator, comes out aligned instead of
 * skewed by however many characters preceded the tab.
 *
 * The column is counted in code points, so a line with double-width or
 * combining characters ahead of a tab can still drift. Editors disagree about
 * that case too, and indentation — which is what this is for — is unaffected.
 */
function expandTabs(line, tabWidth) {
  if (!line.includes("\t")) return line;

  let expanded = "";
  let column = 0;

  for (const character of line) {
    if (character !== "\t") {
      expanded += character;
      column += 1;
      continue;
    }

    const distanceToNextStop = tabWidth - (column % tabWidth);
    expanded += " ".repeat(distanceToNextStop);
    column += distanceToNextStop;
  }

  return expanded;
}

/**
 * `\s` rather than a space-and-tab class: the line may still end in the `\r`
 * of a CRLF paste, or in a non-breaking space that an editor or a web page
 * left behind. Any of them can push `pre-wrap` into wrapping a line that looks
 * short enough to fit.
 */
function stripTrailingWhitespace(line) {
  return line.replace(/\s+$/, "");
}

/**
 * Drops blank lines from the top and the bottom only. Blank lines inside the
 * snippet are the author's paragraphing and stay.
 *
 * Source that is entirely blank leaves no lines at all, and so joins back to
 * the empty string.
 */
function stripBlankEdgeLines(lines) {
  let first = 0;
  let last = lines.length - 1;

  while (first <= last && lines[first] === "") first += 1;
  while (last >= first && lines[last] === "") last -= 1;

  return lines.slice(first, last + 1);
}

/**
 * Removes the indentation shared by every non-blank line.
 *
 * Blank lines are skipped in the calculation rather than counted as zero
 * indent — an empty line between two indented ones is no evidence that the
 * block starts at the left margin, and counting it would silently disable the
 * whole transform. They are still sliced, which is a no-op on the empty
 * string, so the way out needs no branch.
 */
function stripCommonIndent(lines) {
  const indents = lines
    .filter((line) => line !== "")
    .map((line) => line.match(/^ */)[0].length);

  if (indents.length === 0) return lines;

  const common = Math.min(...indents);

  return common === 0 ? lines : lines.map((line) => line.slice(common));
}

/**
 * The block's own styling, and the whole of the graceful-degradation
 * contract: every recipient who sees no colour at all still sees this.
 *
 * All of it is inline, because a recipient's client copies the message *body*
 * into a reply quote and discards the `<head>` — a stylesheet would lose the
 * block the first time anyone replies. The font size is set here and
 * inherited, never repeated per token.
 */
function preStyle(fontSize) {
  return [
    // Single-quoted font names: the declaration ends up inside a
    // double-quoted `style` attribute, and a nested double quote would
    // terminate it and drop every property after it.
    "font-family: 'SFMono-Regular', 'Menlo', 'Consolas', 'Liberation Mono', monospace",
    `font-size: ${fontSize}px`,
    "line-height: 1.45",
    // `pre-wrap`, not `pre`: an email body has no horizontal scrollbar, so a
    // clipped line silently loses information whereas a wrapped one only
    // reads oddly. The source itself is never hard-wrapped.
    "white-space: pre-wrap",
    "margin: 12px 0",
    "padding: 12px",
    "border: 1px solid #d0d7de",
    "background: #f6f8fa",
    "color: #24292e",
  ].join("; ");
}

/**
 * The three characters that can end text content and start markup. Quotes are
 * left alone: the source only ever lands in text content, never in an
 * attribute value.
 *
 * The unhighlighted path only. highlight.js escapes its own output, so running
 * this over it as well would turn every `&lt;` into `&amp;lt;` and put the
 * entities themselves in the message.
 */
function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
