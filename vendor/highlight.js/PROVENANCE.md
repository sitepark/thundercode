# Provenance: highlight.js

**Upstream:** [highlight.js](https://github.com/highlightjs/highlight.js), npm package `highlight.js`
**Version vendored:** 11.12.0
**Licence:** BSD-3-Clause (`LICENSE`, copied byte-for-byte)

The npm package is a **dev** dependency of this repo, pinned to an exact version
(`pnpm add -D -E highlight.js`) purely for provenance: it records the version and
integrity hash in `pnpm-lock.yaml`, and the files below are then copied out of
`node_modules/highlight.js/` by hand.

It is a dev dependency and not a runtime one because nothing the extension loads
ever resolves through `node_modules`. The shipped code imports `vendor/` and only
`vendor/`; `node_modules/` is excluded from the XPI, as is `package.json` itself.
The exact pin matters for the same reason: a caret range would let an install
quietly move `node_modules` a version away from what is vendored, and the
`diff`-based checks below would then be comparing against the wrong file.

## File-by-file origin

| Vendored file | Upstream file | Modified? |
| --- | --- | --- |
| `LICENSE` | `LICENSE` | verbatim |
| `core.js` | `lib/core.js` | **one line**, see below |
| `languages/<name>.js` (36 files) | `es/languages/<name>.js` | verbatim |
| `common.js` | — | **hand-authored**, see below |
| `../highlight.js-theme-github.css` | `styles/github.css` | verbatim |

## The one-line patch to `core.js`

Line 2601, the last statement of the file:

```diff
-module.exports = highlight;
+export default highlight;
```

Nothing else changes. This is safe only because `lib/core.js` is entirely
self-contained: it contains zero `require()` calls, so no other line needs
rewriting to become a module. The two lines after it
(`highlight.HighlightJS = highlight; highlight.default = highlight;`) are
upstream's and are left alone — they assign properties to the exported object
and work unchanged under ESM.

Verify a version bump with:

```
diff node_modules/highlight.js/lib/core.js vendor/highlight.js/core.js
```

It must print exactly this one hunk and nothing else. If it prints more, the
upstream file gained internal `require()`s or a second `module.exports`, and the
"one-line patch" premise has to be re-examined rather than re-applied.

## Why `core.js` needs patching at all

The npm tarball has **no `dist/` directory and no browser bundle**. There is no
`highlight.js/dist/highlight.min.js` in any recent release — that path 404s on
both jsdelivr and unpkg, and Thunderbird's own "Vendoring 3rd party libraries"
guide, which uses highlight.js as its worked example, is stale on exactly this
point. Do not follow it literally for this package.

What the tarball does ship:

- `lib/*.js` — CommonJS, the real implementation.
- `es/languages/*.js` — genuine hand-transpiled ESM, no `import` statements of
  their own. Usable in a browser unmodified, which is why all 36 are copied
  verbatim.
- `es/core.js`, `es/common.js`, `es/index.js` — **not** real ESM. Each is a
  four-line shim that `import`s the CommonJS `lib/` file, relying on Node's
  CJS/ESM interop. A browser `<script type="module">` has no such interop, so
  these are useless here.

So the engine is only shipped as CommonJS, and the smallest honest fix is the
one-line patch above rather than a bundler.

## Why `common.js` is hand-authored

Upstream's `lib/common.js` is the file that defines the "common" subset, but it
is CommonJS and its ESM counterpart is one of the useless shims. The vendored
`common.js` is therefore written here — but it is a *transcription*, not a
design decision: the 36 language names and their order are exactly upstream's
36 `registerLanguage` calls, in upstream's order.

Re-derive the list on a version bump with:

```
grep -oP "registerLanguage\('\K[^']+" node_modules/highlight.js/lib/common.js
```

(The spec's text says "~40 languages"; the actual count in 11.12.0 is 36.)

## Re-vendoring checklist

1. `pnpm add -D -E highlight.js@<new version>`
2. `cp node_modules/highlight.js/LICENSE vendor/highlight.js/LICENSE`
3. `cp node_modules/highlight.js/styles/github.css vendor/highlight.js-theme-github.css`
4. Re-run the `grep` above; copy each `es/languages/<name>.js` into
   `vendor/highlight.js/languages/`, and **delete any file no longer on the
   list** — a removed language would otherwise linger, unimported and shipped.
5. `sed 's/^module\.exports = highlight;$/export default highlight;/' \
   node_modules/highlight.js/lib/core.js > vendor/highlight.js/core.js`, then
   run the `diff` above to confirm the patch is still a single line.
6. If the language list changed, update `common.js` to match. It is the only
   file where a change is not mechanical, because it is the only one this repo
   wrote.
7. Update the version at the top of this file.
8. `pnpm test`. The seam's tests import `common.js` directly, so a broken
   vendoring fails the suite rather than only the popup.

## Things downstream code relies on

Both were confirmed by running the vendored bundle, not read off the docs. A
version bump should re-confirm them, because the theme-map lookup in
`src/popup/theme-map.js` is built on the second.

- `hljs.highlight(code, …).value` is **already HTML-escaped**: `&`, `<`, `>` and
  `"` in the source are escaped before tokens are wrapped. The seam therefore
  does not escape the highlighted path a second time.
- The emitted markup is a closed grammar — escaped text, `<span class="…">` and
  `</span>`, nothing else (`HTMLRenderer` in `core.js` has no other output).
  Class strings are either `hljs-<scope>` with `_`-suffixed modifier classes
  appended (`hljs-title class_`, `hljs-variable language_`) or `language-<name>`
  for an embedded sublanguage.
