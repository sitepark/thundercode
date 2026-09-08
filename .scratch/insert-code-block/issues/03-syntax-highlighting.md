# 03: Syntax highlighting

**What to build:** Colour on top of ticket 02's block. Choose a language from a dropdown and the inserted code is syntax highlighted, with every colour written as an inline style attribute so it survives the recipient replying, forwarding, or copying the code elsewhere.

Colours are never transcribed by hand. The theme stylesheet stays the single source of truth: its rules are read at runtime through the browser's own CSS parser and reduced to a flat map from token class to inline declaration, which is then injected into the seam. Swapping themes must remain a one-file change.

**Blocked by:** 02

**Status:** ready-for-human

- [x] The prebuilt common-languages distribution of the highlighter and the GitHub light theme stylesheet are vendored directly, with no bundler and no build step for shipped code
- [x] The theme map is built by reading the stylesheet's own rules, not by regex and not by a hand-written colour table
- [x] Only text colour, font weight and font style are inlined; no other properties are copied
- [ ] A language dropdown lists the bundled languages, and the chosen language is the one used
- [x] Tokens in the inserted block carry inline style attributes derived from the theme map
- [x] A token class absent from the theme map degrades to an unstyled span rather than throwing
- [x] Every colour in use is legible on a white background, since a recipient's client may drop the block's background
- [ ] Verified by replying to a message containing a block: the colours survive in the quoted text
- [x] Tests inject a small fixture theme map rather than loading the shipped stylesheet, so changing theme cannot break the suite
- [x] Tests confirm classes are translated to inline styles and that no class attribute or style element is emitted

## Comments

### Two places where the spec was wrong, and what was done instead

**1. There is no prebuilt browser bundle to vendor.** The spec says to vendor
"highlight.js's prebuilt distribution file", and Thunderbird's own [vendoring
guide](https://webextension-api.thunderbird.net/en/mv3/guides/vendoring.html)
uses this exact package as its worked example and tells you to copy
`node_modules/highlight.js/dist/highlight.min.js`. **That path does not exist** —
there is no `dist/` in the npm tarball, and the corresponding jsdelivr and unpkg
URLs 404 for 11.12.0, 11.9.0 and 10.7.3 alike. The guide is stale on precisely
the package it illustrates itself with.

What the tarball actually ships is a CommonJS engine (`lib/core.js`), genuine
hand-transpiled ESM for each individual language (`es/languages/*.js`), and — as
`es/core.js` and `es/common.js` — four-line Node interop shims that `import` the
CommonJS files. Those shims work under vitest and are useless in a browser,
which has no CJS interop.

So the vendoring is the recipe below rather than one file copied. It is recorded
in full in `vendor/highlight.js/PROVENANCE.md`, which exists so that a version
bump is a mechanical re-apply and not a second round of this investigation:

- `core.js` — `lib/core.js` with **one line** changed, `module.exports =
  highlight;` → `export default highlight;`. Safe only because that file has
  zero internal `require()`s. `diff` against the upstream file must print
  exactly this one hunk; if it ever prints more, the premise has changed.
- `languages/*.js` — the 36 `es/languages/*.js` of the common subset, verbatim.
  (The spec says "~40"; 11.12.0 has 36.)
- `common.js` — hand-authored, because upstream's `lib/common.js` is CommonJS
  and its ESM counterpart is one of the useless shims. It is a transcription,
  not a design: same 36 names, same order as upstream's `registerLanguage`
  calls.
- `LICENSE` — BSD-3-Clause, verbatim.
- `../highlight.js-theme-github.css` — `styles/github.css`, verbatim,
  unminified so a human can read it when the theme is swapped.

Still no bundler and still no build step: the files that ship are the files you
edit, and the same `common.js` is loaded unmodified by both the popup's
`<script type="module">` and the test runner.

`highlight.js` is in **`devDependencies`, pinned exactly** (`pnpm add -D -E`).
It is there for provenance only — the version and integrity hash in
`pnpm-lock.yaml` — and nothing the extension loads resolves through
`node_modules`. A caret range would let an install drift a version away from
what is vendored, which is exactly the state the `diff` checks are meant to
catch.

**2. "hljs themes use flat single-class selectors, so this is a direct lookup"
is not true of the emitted markup.** highlight.js emits multi-class spans:
`class="hljs-title class_"`, `class="hljs-variable language_"`,
`class="hljs-title class_ inherited__"`, `class="hljs-meta prompt_"`.

The choice made: **key the theme map by the exact, space-joined class list**,
derived mechanically from the selector text (drop the leading `.`, every
remaining `.` becomes a space). At lookup, try the full class list first and
fall back to the first class alone.

This is not tidiness. In the GitHub theme `.hljs-variable.language_` is grouped
with the *keyword* colour `#d73a49` while bare `.hljs-variable` is grouped with
the *constant* colour `#005cc5`. A first-class-only lookup would paint every
`this` and `self` blue instead of red — silently, in only some languages, and
invisibly to anyone not comparing against an editor. The fallback still earns
its place: `hljs-meta prompt_` (shell sessions) has no compound rule and lands
on `.hljs-meta` through it.

The map derived from the shipped theme has **38 keys**. Every class string the
highlighter emits across all 36 languages either hits it exactly, falls back to
its first class, or is deliberately unstyled — see below.

### The themeMap contract, which tickets 04 and 06 need

```
key   -> exact space-joined class list, hljs- prefix kept
         "hljs-keyword", "hljs-variable language_", "hljs-title class_"
value -> declaration string in the same shape as a style attribute's contents
         "color: #d73a49", "color: #24292e; font-weight: bold"
```

Built by `loadThemeMap(linkElement)` in `src/popup/theme-map.js`. The seam's
signature is unchanged from ticket 09:

```
buildCodeBlockHtml({ source, language, themeMap, tabWidth, fontSize })
  -> { html, text, detectedLanguage }
```

`themeMap` is optional: omit it and every token comes out as a bare `<span>`.

### What `detectedLanguage` means now

Ticket 02 hardcoded `"plaintext"` and said reversing that was this ticket's job,
and that the test pinning it was meant to fail here. It did, and it has been
replaced rather than patched: `detectedLanguage` is now **the language actually
applied**, never the one requested. The rule ticket 02 was protecting is
unchanged, and ticket 06's preview depends on it — a language claimed but not
applied would be displayed as fact.

It reports `"plaintext"` in three cases, all of which render no spans at all:

- no language given (which is still the auto-detection request the signature has
  always described — ticket 04 turns it into `hljs.highlightAuto`);
- `"plaintext"` chosen explicitly;
- a language the bundle does not have. `hljs.highlight` *throws* on an
  unregistered name, so this is guarded rather than left to chance: a stale
  setting must cost the colour, not the block.

**Auto-detection is deliberately not implemented and deliberately not designed
out.** It is one more branch in `resolveLanguage`, a five-line function whose
whole job is deciding what will actually be applied. Nothing else moves.

`text` is untouched and stays the **unhighlighted** normalised source, per
ticket 09. It is built from the normalised text and not from the HTML, so no
escaping or markup can reach it by accident, and a test pins it.

### Why the class-to-style rewrite is a regular expression

It is a regex over the highlighter's output, which normally deserves suspicion.
Two reasons it is right here:

- The input is not arbitrary HTML. `HTMLRenderer` in `core.js` emits a closed
  grammar — escaped text, `<span class="…">`, `</span>`, nothing else — and no
  attribute can contain a `"`. This was read out of the vendored source rather
  than assumed, and `PROVENANCE.md` lists it as a thing to re-confirm on a
  version bump.
- There is no alternative. The seam is pure and the test runner has no DOM by
  design, which is the constraint that keeps the pipeline testable at all.

The theme map, by contrast, is emphatically **not** built by regex — it walks
the already-parsed CSSOM. Worth knowing why that distinction is real and not
pedantry: a throwaway regex parse of this very stylesheet, written while
verifying the numbers below, silently produced **3 keys instead of 38**. Every
colour declaration in the file is preceded by a `/* prettylights-syntax-* */`
comment, and the naive `(?:^|;)\s*color:` never matched. The CSSOM strips
comments, expands shorthands into longhands, and normalises values for free.

The three whitelisted properties are read through their named longhand
accessors (`style.color`, `style.fontWeight`, `style.fontStyle`) rather than by
iterating the declaration or matching on `cssText`. Iterating only ever surfaces
the literal token the theme's author typed, so a whitelisted property hidden
inside a `font:` shorthand would be silently dropped. This theme uses longhands
throughout; the next one may not.

### Every colour checked against white, arithmetically

The ticket's legibility box is ticked on a calculation, not on a look. Every
`color` value the theme map carries was run through the WCAG relative-luminance
formula against `#ffffff` (the worst case, a client that drops the block's
background) and against `#f6f8fa` (the block's own background):

| colour | used for | vs white | vs block bg |
| --- | --- | --- | --- |
| `#24292e` | subst, emphasis, strong, and the `<pre>`'s own text | 14.67:1 | 13.78:1 |
| `#032f62` | string, regexp | 13.23:1 | 12.43:1 |
| `#b31d28` | deletion | 6.72:1 | 6.32:1 |
| `#6f42c1` | title and its class_/function_ forms | 6.51:1 | 6.12:1 |
| `#735c0f` | bullet | 6.43:1 | 6.04:1 |
| `#005cc5` | number, literal, meta, operator, variable, selectors, section | 6.29:1 | 5.91:1 |
| `#6a737d` | comment, code, formula | 4.82:1 | 4.52:1 |
| `#22863a` | name, quote, selector-tag, addition | 4.63:1 | 4.35:1 |
| `#d73a49` | keyword, type, doctag, variable.language_ | 4.57:1 | 4.30:1 |
| `#e36209` | built_in, symbol | **3.49:1** | **3.28:1** |

Every colour is dark ink on a light ground, so nothing disappears when the
background is dropped — which is the failure mode the light-theme-only decision
exists to prevent. Nine of the ten clear WCAG AA for normal text (4.5:1);
`#e36209` does not, at 3.49:1. It is left as upstream has it, because the whole
point of this ticket is that colours are never transcribed by hand — editing the
vendored theme would make the next version bump a merge. It is recorded here as
a known wart, and the escape hatch is the one the spec already describes: the
theme is one file.

Worth noting what the whitelist does to `diff`: `.hljs-addition` and
`.hljs-deletion` carry a `background-color` as well, which is not whitelisted
and is dropped. Added and removed lines are therefore distinguished by text
colour alone (green `#22863a`, red `#b31d28`), both comfortably legible. That is
the intended trade, not an oversight.

### What the highlighter emits, and what the theme leaves alone

Checked by running all 36 languages over representative snippets and collecting
every emitted class string. Seven kinds resolve to nothing:

- `hljs-link`, `hljs-params`, `hljs-property`, `hljs-punctuation`, `hljs-tag` —
  the theme's own author left these rules **empty on purpose** (the file says
  "purposely ignored"). Unstyled is the intended rendering, not a gap.
- `hljs-class`, `hljs-function` — legacy v10 scope names still emitted by a few
  grammars (php, go). The GitHub theme has no rule for either. Nothing to do
  about it here; it is upstream's inconsistency, and the result is a token in
  the body colour.
- `language-xml`, `language-php`, `language-python`, `language-bash` — the
  wrapper span highlight.js puts around an embedded sublanguage. Never styled by
  any theme.

All of them take the "absent from the map" path, which emits a bare `<span>`.
The span is kept rather than dropped: dropping it would mean working out which
`</span>` to drop with it, and unstyled is the correct rendering for most of
these anyway.

### The two boxes left unticked

**"Verified by replying to a message containing a block."** Not done, and not
doable here — the only Thunderbird on this machine is 115.10.1 and an MV3
MailExtension does not load below 128, the same wall tickets 01, 02 and 09 hit.
Add it to the hands-on pass those tickets already need: insert a highlighted
block, send it to yourself, hit Reply, and confirm the quoted block still has
its colours. It should, because there is nothing to lose — no `class`, no
`<style>`, every colour on the token itself — and a test asserts exactly that
about the markup. But the claim is about a recipient's client, and no unit test
can make it.

**"A language dropdown lists the bundled languages, and the chosen language is
the one used."** Left unticked on the precedent ticket 02 set for a half-true
box, though it is closer to done than that sounds. The list is
`hljs.listLanguages()` read back from the bundle rather than written out by
hand, so it cannot drift from what is registered, and labels come from
`getLanguage(id).name` — "cpp" reads as "C++" with no translation table in this
repo. That the chosen language is the one used is under test. What is *not*
verified is the only part a running popup would show: that the `<select>`
renders and that picking from it works. Same hands-on pass.

### Decisions worth knowing about

- **Plaintext is the absence of highlighting, not a mode of it.** It is a real
  registered language, and running it produces escaped text and not one span, so
  the seam short-circuits instead. That keeps a block with no language escaping
  exactly as it did before there was a highlighter — highlight.js also escapes
  `"`, which would otherwise have changed the output of ticket 02's escaping
  test for no reason anyone would have understood later.
- **`ignoreIllegals: true`.** Picking the wrong language is what the dropdown
  exists for. Without this flag, source that trips the chosen language's
  `illegal` rule comes back as plain escaped text *while the result still names
  the language* — the block would claim a highlighting it does not have, which
  is the one thing `detectedLanguage` exists to prevent. With it, a wrong pick
  degrades to imperfect colour. A test feeds a shell script to the JSON grammar.
- **The dropdown defaults to Plain text**, not to the last language used. The
  spec is explicit that remembering the last choice is how auto-detection stops
  working without anyone noticing. Ticket 04 adds an auto-detect entry at the
  top and makes that the default.
- **The theme `<link>` is loaded before `popup.css`** so popup.css wins any
  overlap. There is none today — every selector in the theme is an `.hljs` one
  and nothing in the popup carries those classes until ticket 06's preview does.
- **The theme map is read asynchronously, started at load and awaited at
  insert.** `document.styleSheets` gains an entry as soon as the `<link>` is
  parsed, but `cssRules` is only populated once the resource has loaded; reading
  through that window yields a silently empty map. The wait is short for a local
  file and has almost always elapsed before Insert is pressed. The `error`
  listener matters as much as the `load` one — without it a failed stylesheet
  would leave the promise pending and take the insert with it.
- **Every failure in the theme read returns an empty map.** An empty map is
  exactly the "class absent" case the seam already handles, so a stylesheet that
  fails to load costs the colour and nothing else.
- **`src/popup/theme-map.js` is not unit tested**, per the spec's own list of
  what is not: it needs a browser to do anything, the runner has no DOM by
  design, and a failure shows up as a monochrome block immediately. The property
  whitelist lives there, so that box is ticked on the code and on the 38-key map
  the calculation above was run against, not on a test.
- **The base `.hljs` rule is excluded explicitly**, by requiring matched
  selectors to start with `.hljs-`. It styles the *container*, never a token, so
  it would never be looked up — but rejecting it by rule is self-documenting and
  stays correct if the `<pre>` ever gains that class. The same rule drops the
  structural `pre code.hljs` and `code.hljs`, which carry nothing whitelisted.
- **The theme's two descendant rules are skipped**, `.hljs-meta .hljs-keyword`
  and `.hljs-meta .hljs-string`. They describe a cascade and a map keyed on one
  element's class list cannot express one. Nothing is lost: highlight.js really
  does emit those as nested spans, but the inner span carries only
  `hljs-keyword`/`hljs-string`, and the bare form of each sits in the same comma
  group with the same colour.
- **`pnpm run package` picks `vendor/` up with no change**, which is what its
  exclusion-based design was for. Verified: 52 files, 152 KB, all 36 language
  files present, and no `node_modules`, `package.json`, `pnpm-lock.yaml`,
  `tests/`, `scripts/` or `.scratch/` in the archive.

### Accepted warts

- **37 module requests per popup open.** The popup loads `core.js` plus 36
  language modules as separate ES modules. A bundler would make it one request
  and a bundler is out of scope; these are local `moz-extension:` reads with no
  network, and the whole vendored tree is 152 KB. If popup-open latency ever
  becomes noticeable, the fix is a smaller language subset, not a build step.
- **The `<pre>`'s own `color: #24292e` is hardcoded and duplicates the theme's
  `.hljs` base colour.** It is not derived from the stylesheet — `.hljs` is
  excluded from the map by design — so swapping the theme changes the tokens and
  leaves the block's body text where it was. Whoever swaps the theme should
  check that one constant in `preStyle()`. The `<pre>`'s background is
  deliberately *not* the theme's `#ffffff`: `#f6f8fa` is what makes the block
  read as a block, and `background` is not whitelisted anyway.
- **`hljs-class` and `hljs-function` render unstyled** in php and go, as
  described above. Upstream's own theme has no rule for these legacy scope
  names.
