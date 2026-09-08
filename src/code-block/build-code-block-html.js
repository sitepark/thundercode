const DEFAULT_FONT_SIZE = 13;

/**
 * Turns pasted source into the HTML that gets inserted into the message.
 *
 * This is the seam the whole feature is tested through. Everything behind it
 * is an internal: nothing else in this module is exported, and tests drive
 * only this function.
 *
 * It is pure by construction — no DOM, no `browser.*`, no I/O — which is why
 * the test runner needs no DOM environment.
 *
 * The signature is the one the spec settles on, and it is complete from the
 * start so that later tickets change internals rather than callers:
 * `language` and `themeMap` are inert until highlighting arrives in ticket 03,
 * and `tabWidth` until normalisation arrives in ticket 05.
 *
 * @param {object} options
 * @param {string} options.source Raw source text, as pasted.
 * @param {string} [options.language] Language to render as, or `undefined` to
 *   ask for auto-detection.
 * @param {Record<string, string>} [options.themeMap] Token class to inline
 *   declaration string. Injected as data so the seam never reads a stylesheet
 *   itself.
 * @param {number} [options.tabWidth] Spaces a tab expands to.
 * @param {number} [options.fontSize] Block font size in px.
 * @returns {{ html: string, detectedLanguage: string }} `detectedLanguage` is
 *   the language the block was actually rendered with, which the popup shows
 *   back to the user.
 */
export function buildCodeBlockHtml({
  source,
  language,
  themeMap,
  tabWidth,
  fontSize = DEFAULT_FONT_SIZE,
}) {
  const text = escapeHtml(source);

  return {
    html: `<pre style="${preStyle(fontSize)}">${restoreLeadingNewline(text)}</pre>`,
    // No highlighter yet, so plaintext is what rendered regardless of what was
    // asked for. Reporting back the requested language would be a claim the
    // output does not support. Ticket 03 makes this the language applied.
    detectedLanguage: "plaintext",
  };
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
 * An HTML parser discards a newline directly after the `<pre>` start tag, so
 * a source opening with a blank line would lose it. Writing a second newline
 * is the only way to get the first one through.
 */
function restoreLeadingNewline(text) {
  return text.startsWith("\n") ? `\n${text}` : text;
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
