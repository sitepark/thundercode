/**
 * The block ticket 01 inserts. A constant on purpose: this slice proves the
 * path from toolbar button to caret works, and nothing about the content is
 * decided yet. Ticket 02 replaces this with `buildCodeBlockHtml`, the seam
 * that turns pasted source into the same shape of markup.
 *
 * The shape already follows the output contract from the spec — a single
 * `<pre>`, inline styles only, `font-size` in px set once and inherited,
 * `white-space: pre-wrap` — so that what ticket 02 changes is where the HTML
 * comes from, not what it looks like.
 */
export const HARDCODED_BLOCK_HTML =
  '<pre style="' +
  [
    // Single-quoted font names: the whole declaration lives inside a
    // double-quoted `style` attribute, and a nested double quote would
    // terminate it and drop every property after it.
    "font-family: 'SFMono-Regular', 'Menlo', 'Consolas', 'Liberation Mono', monospace",
    "font-size: 13px",
    "line-height: 1.45",
    "white-space: pre-wrap",
    "margin: 12px 0",
    "padding: 12px",
    "border: 1px solid #d0d7de",
    "background: #f6f8fa",
    "color: #24292e",
  ].join("; ") +
  '">' +
  '<span style="color: #d73a49">function</span> ' +
  '<span style="color: #6f42c1">greet</span>(name) {\n' +
  '    <span style="color: #005cc5">console</span>.log(' +
  '<span style="color: #032f62">`Hello, ${name}!`</span>);\n' +
  "}" +
  "</pre>";
