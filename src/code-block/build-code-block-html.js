import hljs from "../../vendor/highlight.js/common.js";

/**
 * The values the seam falls back to, and the only place either number is
 * written.
 *
 * They live here rather than in the settings module because they are
 * properties of the block, not of the settings UI: `buildCodeBlockHtml` has to
 * produce a sane block for any caller, including one that never reads storage.
 * Exporting them lets the settings module fill an empty field from the same
 * constant instead of restating it — the same number written twice is the
 * failure this avoids, and an options page that displays a different default
 * from the one the block uses would be a lie that nothing catches.
 *
 * Frozen because it is shared across modules and nothing should be able to
 * change what "default" means at runtime.
 */
export const CODE_BLOCK_DEFAULTS = Object.freeze({
  tabWidth: 4,
  fontSize: 13,
});

/**
 * The key the block's own text colour is looked up under in the `themeMap`.
 *
 * `hljs` is the class highlight.js puts on the element *containing* the code,
 * and it is where a theme states the colour of the text that no token claims —
 * everything between the highlighted spans. Nothing emitted here
 * carries the class, since the markup contract forbids class attributes
 * outright; the class name is only the key the theme files themselves use, so
 * the map stays one flat table of "what the theme says about this class"
 * instead of growing a second shape for the container.
 *
 * Exported because the module that reduces a stylesheet to a `themeMap` has to
 * write the same key, and a string that two modules must agree on is a string
 * that belongs to one of them.
 */
export const CONTAINER_CLASS = "hljs";

/**
 * The block's colours when no theme data reaches the seam at all — a caller
 * that passes no `themeMap`, or a popup whose stylesheet failed to load.
 *
 * These are the seam's own unthemed rendering and not a transcription of the
 * shipped theme: the shipped block takes both colours from the stylesheet via
 * `CONTAINER_CLASS`, so swapping the theme stays a one-file change and nothing
 * here has to be kept in step with it. What they have to be is legible and
 * obviously a code block, since a block that reaches a recipient with no
 * colour at all still has to read as one.
 */
const UNTHEMED_CONTAINER = "color: #24292e";

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
 * is an internal: no step of the pipeline is exported — the only other export
 * is the defaults it falls back to, which is data rather than a step — and
 * tests drive only this function.
 *
 * It is pure by construction — no DOM, no `browser.*`, no I/O — which is why
 * the test runner needs no DOM environment. The highlighter is a plain
 * function dependency and stays inside that rule: it is arithmetic over a
 * string, and the vendored bundle imports as ordinary ESM under both the popup
 * and the test runner.
 *
 * The signature is the one the spec settles on. Its parameters have not
 * changed since ticket 02; the return value widened once, when ticket 09 added
 * `text` beside `html` for plain-text composers.
 *
 * @param {object} options
 * @param {string} options.source Raw source text, as pasted.
 * @param {string} [options.language] Language to render as. `undefined` asks
 *   for auto-detection, and the language detection settled on comes back as
 *   `detectedLanguage`. Naming a language skips detection entirely: an
 *   override is an instruction, not a hint.
 * @param {Record<string, string>} [options.themeMap] Highlight.js class list
 *   to inline declaration string, keyed exactly as the class attribute is
 *   emitted (`"hljs-keyword"`, `"hljs-variable language_"`), plus the
 *   `CONTAINER_CLASS` entry carrying the block's own text colour. Injected as
 *   data so the seam never reads a stylesheet itself. Omitting it renders
 *   every token unstyled and the block in its unthemed text colour rather
 *   than failing.
 * @param {number} [options.tabWidth] Spaces a tab expands to. Falls back to
 *   `CODE_BLOCK_DEFAULTS.tabWidth`, as does anything that is not a positive
 *   whole number.
 * @param {number} [options.fontSize] Block font size in px. Falls back to
 *   `CODE_BLOCK_DEFAULTS.fontSize` when omitted. Unlike `tabWidth` it is not
 *   otherwise guarded: a bad number here makes one CSS declaration the client
 *   drops, not an exception, and the settings module resolves it before the
 *   popup ever gets this far.
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
  fontSize = CODE_BLOCK_DEFAULTS.fontSize,
}) {
  // Normalisation is the first thing in the pipeline, before highlighting and
  // before escaping. A highlighter tokenising the raw paste would attach spans
  // to whitespace that is about to be removed, and stripping a common indent
  // out of finished markup means editing inside `<span>`s. The order is
  // load-bearing rather than incidental.
  const text = normaliseSource(source, resolveTabWidth(tabWidth));
  // Resolved once and used for both the rendering and the report, so the two
  // cannot disagree: what comes back is always the language that was applied.
  // Detection runs on the normalised text and not on the paste, so a snippet
  // is detected as the code it is rather than as the code plus whatever
  // indentation and trailing whitespace its editor left on it.
  const appliedLanguage = resolveLanguage(language, text);

  return {
    html:
      // `spellcheck="false"` because the block lands in a spell-checked
      // contenteditable and code is not prose. Every identifier, keyword and
      // path in it is a misspelling to a dictionary, so without this the
      // block arrives under a wall of red that flags nothing worth reading
      // and buries the one squiggle in the sentence above it that was worth
      // reading. It is the only attribute besides `style` the block carries:
      // it is not styling, so it cannot go in the style attribute, and it is
      // inert everywhere except an editor — a recipient reading the message
      // renders it identically, and a recipient quoting it in a reply is
      // exactly who else wants it.
      `<pre spellcheck="false" style="${preStyle(fontSize, themeMap)}">` +
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
 * unregistered name — a stale setting, or a caller guessing at an alias the
 * bundle does not carry — must be caught here. It degrades to no
 * highlighting, because a monochrome block is a far better outcome than an
 * exception where a code block should be.
 *
 * `undefined` is the auto-detection request the signature has always
 * described, and this is where it stops meaning "no highlighting". It is the
 * one branch ticket 03 said it would be, and detection lands in the same guard
 * as an explicitly named language rather than beside it — one gate, so a
 * detected name and a chosen name cannot be treated differently by accident.
 */
function resolveLanguage(language, text) {
  const candidate = language === undefined ? detectLanguage(text) : language;

  return candidate && hljs.getLanguage(candidate) ? candidate : PLAINTEXT;
}

/**
 * The highlighter's own guess, or nothing.
 *
 * "Detection can only ever return a language present in the bundle" is
 * guaranteed by construction rather than by a check here: `highlightAuto`
 * scores the source against the languages `registerLanguage` was called with
 * and reports the winner's registered name, so the result is by definition an
 * entry of `listLanguages()` — which is the same list the popup builds its
 * dropdown from, off the same module instance. There is no third list to keep
 * in step with the other two.
 *
 * `language` comes back `undefined` when nothing beat plain text: the sort
 * starts with a synthetic zero-relevance result that carries no language at
 * all, and any grammar that also scores zero loses the tie to it. An empty
 * paste guarantees it and a single word often produces it. The caller's
 * `getLanguage` guard turns it into `plaintext` without having to know it can
 * happen, which is why this function may return nothing rather than choosing a
 * fallback of its own.
 *
 * There is no relevance floor above that. `highlightAuto` returns its best
 * scorer however weakly it scored, so a two-word paste can come back as
 * something surprising; a threshold was considered and rejected because
 * highlight.js does not document its relevance numbers as comparable across
 * grammars, so any floor would be a magic number pretending to be a judgement.
 * A wrong guess costs one click at the dropdown, which is what it is for.
 *
 * `secondBest` is deliberately unread. Showing a runner-up would mean ranking
 * two guesses in a UI whose whole point is that the common case needs no
 * input.
 */
function detectLanguage(text) {
  return hljs.highlightAuto(text).language;
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
 * out of a settings field, which is `NaN` while the field is empty and could
 * be `0`. Either would make tab expansion throw, so anything that is not a
 * positive whole number becomes the default — a block indented at four is a
 * far better failure than no block at all.
 *
 * Ticket 10's settings module coerces the same value before it arrives, so in
 * the popup's path this guard never fires. It stays because it belongs to the
 * seam rather than to the settings UI: the seam is callable by anyone, and
 * every other caller would otherwise have to know this.
 */
function resolveTabWidth(tabWidth) {
  return Number.isInteger(tabWidth) && tabWidth > 0
    ? tabWidth
    : CODE_BLOCK_DEFAULTS.tabWidth;
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
 * This is also what makes a compensation ticket 02 needed unnecessary, and the
 * reason is worth keeping: an HTML parser discards a newline immediately after
 * a `<pre>` start tag, so a snippet beginning with a blank line used to lose
 * it on the way into the message, and the builder wrote a second newline to
 * put it back. Nothing does that any more because nothing can: the leading
 * trim here guarantees the content never starts with a newline, so there is
 * never one for the parser to eat. Loosen this trim and that compensation has
 * to come back with it.
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
 *
 * The text colour comes from the theme rather than from this file, for the
 * same reason every token colour does: hardcoding it is what makes a theme
 * swap stop being a one-file change, and it is the colour that shows up as
 * unreadable text the day someone swaps in a theme with a different container
 * colour. The border and the background are not among them — no hljs theme
 * states a code-block fill, so both are this block's own decision rather than
 * colours transcribed from anywhere.
 */
function preStyle(fontSize, themeMap) {
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
    // Border and fill together are the block's own chrome, not theme colours.
    // No hljs theme states a code-block fill: its `.hljs` background is the
    // page colour the theme assumes it is read on, which for a light theme is
    // white and would leave the block invisible against a white message. The
    // spec asks for the block to be delimited by "a border, padding and a
    // background", so these two are chosen here, together, and stay put when
    // the theme is swapped.
    "border: 1px solid #d0d7de",
    // Rounded with the border, not instead of it. The radius is what makes
    // the block read as a panel set into the message rather than as a
    // paragraph someone drew a frame around, and it is the one part of the
    // chrome a client is likely to drop: Outlook's Word renderer ignores
    // `border-radius` outright. Dropping it leaves the same square-cornered
    // block this had before, which is why it is stated here rather than
    // approximated with anything a renderer would take more literally.
    "border-radius: 6px",
    "background-color: #f6f8fa",
    // Last, so that a theme stating something this list already covers wins,
    // and so the whole of what the theme contributes reads as one run.
    themeMap?.[CONTAINER_CLASS] ?? UNTHEMED_CONTAINER,
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
