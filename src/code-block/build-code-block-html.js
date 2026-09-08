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
 * Turns pasted source into the HTML that gets inserted into the message.
 *
 * This is the seam the whole feature is tested through. Everything behind it
 * is an internal: no step of the pipeline is exported — the only other export
 * is the defaults it falls back to, which is data rather than a step — and
 * tests drive only this function.
 *
 * It is pure by construction — no DOM, no `browser.*`, no I/O — which is why
 * the test runner needs no DOM environment.
 *
 * The signature is the one the spec settles on, and it is complete from the
 * start so that later tickets change internals rather than callers:
 * `language` and `themeMap` are inert until highlighting arrives in ticket 03.
 *
 * @param {object} options
 * @param {string} options.source Raw source text, as pasted.
 * @param {string} [options.language] Language to render as, or `undefined` to
 *   ask for auto-detection.
 * @param {Record<string, string>} [options.themeMap] Token class to inline
 *   declaration string. Injected as data so the seam never reads a stylesheet
 *   itself.
 * @param {number} [options.tabWidth] Spaces a tab expands to. Falls back to
 *   `CODE_BLOCK_DEFAULTS.tabWidth`, as does anything that is not a positive
 *   whole number.
 * @param {number} [options.fontSize] Block font size in px. Falls back to
 *   `CODE_BLOCK_DEFAULTS.fontSize` when omitted. Unlike `tabWidth` it is not
 *   otherwise guarded: a bad number here makes one CSS declaration the client
 *   drops, not an exception, and the settings module resolves it before the
 *   popup ever gets this far.
 * @returns {{ html: string, detectedLanguage: string }} `detectedLanguage` is
 *   the language the block was actually rendered with, which the popup shows
 *   back to the user.
 */
export function buildCodeBlockHtml({
  source,
  language,
  themeMap,
  tabWidth,
  fontSize = CODE_BLOCK_DEFAULTS.fontSize,
}) {
  // Normalisation is the first thing in the pipeline, before escaping and —
  // from ticket 03 — before highlighting. A highlighter tokenising the raw
  // paste would attach spans to whitespace that is about to be removed, so
  // the order is load-bearing rather than incidental.
  const text = escapeHtml(normaliseSource(source, resolveTabWidth(tabWidth)));

  return {
    html: `<pre style="${preStyle(fontSize)}">${text}</pre>`,
    // No highlighter yet, so plaintext is what rendered regardless of what was
    // asked for. Reporting back the requested language would be a claim the
    // output does not support. Ticket 03 makes this the language applied.
    detectedLanguage: "plaintext",
  };
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
 */
function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
