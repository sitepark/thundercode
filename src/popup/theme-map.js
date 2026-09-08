import { CONTAINER_CLASS } from "../code-block/build-code-block-html.js";

/**
 * Reduces the vendored theme stylesheet to the flat `themeMap` the seam takes.
 *
 * Colours are never transcribed by hand — the block's own text colour
 * included, which is why the theme's `.hljs` base rule is read here alongside
 * every token rule. The stylesheet stays the single source of truth and
 * swapping themes stays a one-file change, because the thing that reads it is
 * the browser's own CSS parser: this module only walks the already-parsed
 * CSSOM. No regex over the file, no colour table.
 *
 * This is popup-side code and is deliberately not unit tested. It needs a
 * browser to do anything at all, the test runner has no DOM by design, and its
 * failure mode is visible the instant a block comes out monochrome. That
 * division is the point of the seam: the pipeline is pure and tested, and the
 * one thing that cannot be is this file.
 */

/**
 * The whitelist for a token, and the whole of it. A computed or
 * fully-populated style reports dozens of properties; copying them all would
 * put a paragraph of CSS on every token and multiply the message size for no
 * visual gain.
 *
 * Read through the named longhand accessors rather than by iterating the
 * declaration or matching on `cssText`. Gecko expands a shorthand such as
 * `font: italic bold 12px/1 monospace` into its longhands when parsing into
 * the CSSOM, so the accessors see the value either way, whereas iterating only
 * ever surfaces the literal token the theme's author typed — which would
 * silently miss a whitelisted property hidden inside a shorthand. Today's
 * theme happens to use longhands throughout; the next one may not.
 */
const TOKEN_PROPERTIES = [
  ["color", "color"],
  ["font-weight", "fontWeight"],
  ["font-style", "fontStyle"],
];

/**
 * The whitelist for the block itself, which is a different list because the
 * container is a different thing: a background on a token would paint a stripe
 * behind one word, and a weight or style there would be the theme deciding
 * that all code is bold.
 *
 * Text colour only, and deliberately not the background. A theme's `.hljs`
 * background is the *page* colour it assumes it is being read on — the GitHub
 * light theme says `#ffffff` — not a fill for a code block. Taking it would
 * paint the block white on a white message and leave the border doing all the
 * work, when the spec asks for the block to be delimited by "a border, padding
 * and a background". The fill is the block's own chrome, chosen with the
 * border, and lives in the seam next to it.
 */
const CONTAINER_PROPERTIES = [["color", "color"]];

/**
 * The theme's base rule: the block's own text colour, which belongs to no
 * token and was the last colour still written out by hand.
 *
 * Exactly `.hljs` and nothing more. The structural `pre code.hljs` and
 * `code.hljs` rules describe how a theme lays a block out on a web page —
 * padding, `overflow-x` — and carry nothing whitelisted here; the block's own
 * padding and border are this extension's decisions and are stated in the
 * seam.
 */
const CONTAINER_SELECTOR = /^\.hljs$/;

/**
 * Token selectors only, and single-element ones at that.
 *
 * Requiring `.hljs-` excludes the theme's `.hljs` base rule, which styles the
 * *container* rather than any token and is matched by `CONTAINER_SELECTOR`
 * above instead — under its own whitelist and its own key. It also excludes
 * the structural `pre code.hljs` and `code.hljs` rules.
 *
 * Allowing no whitespace excludes the theme's two descendant rules,
 * `.hljs-meta .hljs-keyword` and `.hljs-meta .hljs-string`. Those describe a
 * cascade, and a map keyed on one element's class list cannot express one.
 * Nothing is lost: highlight.js really does emit those as nested spans, but
 * the inner span carries only `hljs-keyword` / `hljs-string`, and the bare
 * form of each selector sits in the same comma group with the same colour.
 */
const TOKEN_SELECTOR = /^\.hljs-[\w-]+(?:\.[\w-]+)*$/;

/**
 * Waits for the theme `<link>` to be parsed, then reads it.
 *
 * The wait is not superstition. `document.styleSheets` gains an entry as soon
 * as the `<link>` element is parsed, but its `cssRules` are only populated
 * once the resource has actually loaded. For a local vendored file that window
 * is short — a disk read, no network — but it is not zero, and reading through
 * it yields a silently empty map and a monochrome block.
 *
 * Every failure here returns an empty map rather than throwing. An empty map
 * is exactly the "class absent from the map" case the seam already degrades
 * to, so a stylesheet that fails to load costs the colour and nothing else.
 */
export async function loadThemeMap(link) {
  if (!link) return {};

  await whenParsed(link);

  try {
    return buildThemeMap(link.sheet);
  } catch {
    // `.cssRules` throws a SecurityError for a cross-origin stylesheet. That
    // cannot happen for a vendored file loaded from the extension's own
    // origin, which is one more reason the theme is vendored rather than
    // linked from a CDN — but the block should lose its colour rather than the
    // popup its insert if it ever does.
    return {};
  }
}

/**
 * `link.sheet` is non-null once the stylesheet has been parsed. The `error`
 * listener matters as much as the `load` one: without it a 404 or a parse
 * failure would leave this promise pending forever and take the insert with
 * it.
 */
function whenParsed(link) {
  if (link.sheet) return Promise.resolve();

  return new Promise((resolve) => {
    link.addEventListener("load", resolve, { once: true });
    link.addEventListener("error", resolve, { once: true });
  });
}

function buildThemeMap(sheet) {
  const themeMap = {};
  if (!sheet) return themeMap;

  for (const rule of sheet.cssRules) {
    // Anything that is not a plain style rule — `@media`, `@import`, a
    // comment-only rule — has no `selectorText` and is skipped. A theme with
    // an `@media` block would need its contents walked too; none of hljs's do.
    if (typeof rule.selectorText !== "string") continue;

    // A comma group is one rule with several selectors. Each gets its own
    // entry, so `.hljs-variable` and `.hljs-variable.language_` can be grouped
    // together in the source and still be distinguishable — which in this
    // theme they are not, and in the keyword group they are. The whitelist is
    // picked per selector rather than per rule, because a theme is free to
    // group `.hljs` with a token selector and the two take different
    // properties.
    for (const selector of rule.selectorText.split(",")) {
      addEntry(themeMap, selector.trim(), rule.style);
    }
  }

  return themeMap;
}

/**
 * Files one selector of one rule under the key the seam will look it up by, or
 * drops it.
 */
function addEntry(themeMap, selector, style) {
  const [classList, properties] = CONTAINER_SELECTOR.test(selector)
    ? [CONTAINER_CLASS, CONTAINER_PROPERTIES]
    : [toClassList(selector), TOKEN_PROPERTIES];

  if (!classList) return;

  const declarations = readWhitelistedDeclarations(style, properties);
  // Several of the theme's own token rules are empty on purpose
  // (`.hljs-tag`, `.hljs-params`, `.hljs-punctuation`). Leaving them out of
  // the map is what makes them render unstyled, which is what their author
  // intended. A `.hljs` rule stating neither colour drops out the same way,
  // and the seam's own unthemed colours stand in.
  if (declarations === "") return;

  themeMap[classList] = declarations;
}

/**
 * Turns one CSS selector into the exact string that will appear in the
 * emitted `class` attribute: drop the leading `.`, and every remaining `.`
 * becomes a space.
 *
 *     .hljs-keyword            -> "hljs-keyword"
 *     .hljs-variable.language_ -> "hljs-variable language_"
 *
 * That the two orders agree is not luck. highlight.js builds a tiered scope's
 * class list as `hljs-<first>` followed by the `_`-suffixed remainder in
 * source order, and the theme's compound selectors are written in the same
 * order for the same scopes. Keying on the whole list rather than on one class
 * is what lets `.hljs-variable.language_` keep its own colour.
 *
 * The `hljs-` prefix is kept rather than stripped. Stripping would buy
 * nothing — the modifier classes never carry the prefix, so it would be a
 * mixed convention — and this way the key falls out of the selector text with
 * no step of its own.
 */
function toClassList(selector) {
  if (!TOKEN_SELECTOR.test(selector)) return null;

  return selector.slice(1).replaceAll(".", " ");
}

/**
 * Joined in the same `a: b; c: d` shape the `<pre>`'s own style attribute
 * uses, so the seam can interpolate it without knowing where it came from.
 */
function readWhitelistedDeclarations(style, properties) {
  return properties
    .filter(([, accessor]) => style[accessor] !== "")
    .map(([property, accessor]) => `${property}: ${style[accessor]}`)
    .join("; ");
}
