# 04: Auto-detect the language

**What to build:** Stop asking. When code is pasted, the language is detected automatically and the dropdown arrives pre-set to the guess, so the common case needs no input at all. A wrong guess costs one click to correct rather than an undo.

Detection must run fresh every time. Remembering the last-used language would quietly override the detection and turn the override control into the thing that lies to you.

**Blocked by:** 03

**Status:** ready-for-human

- [ ] Pasting code sets the dropdown to the detected language
- [ ] The language actually used is reported back out of the seam and is what the dropdown shows
- [x] Overriding the dropdown is respected and the block is highlighted as the chosen language
- [x] Detection re-runs on the next insert; the previous choice is never persisted or pre-selected
- [x] Detection can only ever return a language present in the bundle
- [x] Tests cover both an explicitly requested language and a detection request, including that the language used is reported correctly in each case

## Comments

### The branch ticket 03 promised, and the one thing that did have to move

`resolveLanguage()` is where detection went, exactly as ticket 03 said it would
be. `undefined` no longer falls through to `plaintext`; it calls
`hljs.highlightAuto` and the answer lands in the *same* guard an explicitly
named language goes through:

```js
const candidate = language === undefined ? detectLanguage(text) : language;
return candidate && hljs.getLanguage(candidate) ? candidate : PLAINTEXT;
```

One gate rather than two, so a detected name and a chosen name cannot start
being treated differently by accident, and `highlightAuto`'s "no language at
all" answer needs no special case of its own — it is falsy, and the guard
already knows what to do with a name the bundle cannot highlight.

The one thing ticket 03 did not foresee: `resolveLanguage` now takes the text as
well as the language. Detection deliberately runs on the **normalised** text and
not on the paste, so a method copied out of the middle of a class is detected as
the code it is rather than as the code plus eight columns of indentation and
whatever its editor left on the ends of the lines. That ordering was already
load-bearing for highlighting; it is now load-bearing for detection too, and the
call site says so.

Nothing else in the seam moved. The signature is still the one the spec settled
on, `detectedLanguage` still means "the language actually applied", and the
popup still reads it back the same way.

### How "only a language present in the bundle" is guaranteed

Not by a check, by construction, and this was read out of the vendored
`core.js` rather than assumed:

- `highlightAuto` defaults its candidate set to `Object.keys(languages)`, which
  is character for character what `listLanguages()` returns.
- Aliases live in a *separate* `aliases` object, so `languages` only ever holds
  canonical registered names and detection cannot come back with `js` where the
  dropdown has `javascript`.
- Each candidate's result carries the name it was highlighted under, so the
  winner's `language` is one of those keys and nothing else.

The popup fills its dropdown from that same `listLanguages()` on the same module
instance, so there is no third list to keep in step: assigning
`detectedLanguage` to `languageField.value` always hits an option that exists. A
test pins the consequence rather than the mechanism, over a spread of real
snippets plus prose plus the empty string — whatever comes back is in
`hljs.listLanguages()`. It is the one test that imports the bundle, and only to
avoid writing the 36 names down a second time.

(Detection can also return *fewer* languages than the bundle has: grammars
marked `disableAutodetect` are filtered out of the candidate set. That is a
subset of the dropdown, so the claim holds either way.)

**`highlightAuto` returning no language at all** is a real case, not a
theoretical one. It is not "nothing scored high enough" — there is no threshold.
`highlightAuto` unshifts a synthetic plain-text result of relevance 0 onto the
front of the list, and that result has no `language` property, so any grammar
that scores zero loses the tie to it and the winner comes back nameless. An
empty textarea guarantees it and a one-word paste often produces it. It is
reported as `plaintext`, which is also the answer for "you chose plaintext" and
for "the bundle has never heard of that language" — all three render no spans,
which is what makes one answer honest for all three.

### The dropdown follows the content, and stops when told to

The popup asks for detection the way any caller does — by naming no language —
and points the dropdown at what comes back. It never learns that
`hljs.highlightAuto` exists.

Two rules, and the second is the one worth arguing about:

- **Re-derived from the current content, never left where it was.** The starting
  value is not hardcoded to `plaintext` any more — ticket 03's line is gone. It
  is `refreshDetectedLanguage()` run once at load against an empty textarea,
  which comes out at Plain text because that is what an empty document detects
  as. The right-click prefill calls it as well, since assigning `value` from
  script fires no `input` event for the listener to see.
- **A user override is sticky for the life of the popup.** Changing the dropdown
  sets a flag and detection stops. Re-guessing over a deliberate choice on the
  next paste would be the tool arguing with the user about their own snippet,
  and the ticket's own framing — the override control must not become the thing
  that lies to you — cuts both ways.

**Nothing is persisted, and that is structural rather than a promise.**
`writeSettings` writes `coerceSettings(values)`, whose keys are exactly the ones
in `SETTING_FIELDS`: `tabWidth` and `fontSize`. No code path in this repo could
write a language to `storage.local` without someone adding a third field to that
table first. The override flag is a plain module variable in a document
Thunderbird destroys when the popup closes, so "detection re-runs on the next
insert" is not a reset anybody has to remember to perform — there is nothing to
reset.

### Detection is not free, which is why the trigger is a paste and not a keystroke

Measured against the vendored bundle under Node:

| source | `highlightAuto` | re-highlighting the winner |
| --- | --- | --- |
| 50 lines | 85 ms | 0.7 ms |
| 500 lines | 107 ms | 4 ms |
| 3000 lines | 573 ms | 20 ms |

Thirty-six grammars per call. Hanging that off every `input` event would make
the textarea stutter on precisely the pastes this feature exists for — ticket
11's warning fires at 500 lines, so those are expected inputs and not
pathological ones.

So the listener gates on `event.inputType`: `insertFrom*` (paste, drop, yank)
re-detects, `insertText` and the delete types do not. That is also the honest
reading of the story — "when code is pasted, the language is detected" — and it
means editing a snippet after pasting it never moves the dropdown under the
user's hands. An event with no `inputType` at all counts as a paste: a browser
that will not say what happened should cost one redundant detection, not a
dropdown that silently stops updating.

The price is that a snippet *typed* in from scratch stays at Plain text until
the dropdown is used. That is the same one click a wrong guess costs, and the
paste path is the one the whole feature is built around.

### Two boxes left unticked, and why the other four are ticked

**"Pasting code sets the dropdown to the detected language"** and **"the
language actually used ... is what the dropdown shows"** are unticked. Every
half of them that is testable here is tested — the seam detects, applies and
reports — but the half those boxes are actually about is a `<select>` changing
in a running popup, and the only Thunderbird on this machine is 115.10.1, where
an MV3 MailExtension does not load at all. Same wall as tickets 01, 02, 03
and 09.

Add this to the hands-on pass those tickets already need. It is four steps:
paste a Python function and confirm the dropdown reads Python rather than Plain
text; change it to Ruby and paste something else, and confirm it stays Ruby;
close the popup and reopen it; paste the Python again and confirm it reads
Python and not Ruby. That last step is the one this ticket is really about.

**"Overriding the dropdown is respected"** is ticked on the seam test that pins
it: the same shell script is detected as bash when nothing is asked for, and is
rendered and reported as json when json is asked for. The part that is *not*
observed here — that clicking the `<select>` works at all — is ticket 03's
already-unticked dropdown box, not a second copy of it.

### The 17 tests that broke, which is the ticket working

Ticket 02 wrote that its `detectedLanguage` test "is meant to fail" in 03. The
same thing happened here, an order of magnitude wider: `language: undefined`
stopped meaning "render unhighlighted" and started meaning "detect", so every
test that had been using "no language" as shorthand for "no colour" began
reading `<span>line</span> <span>0</span>` where it expected `line 0`. Every
trivial fixture in the suite detects as something — `x` is CSS, `a\nb\nc` is
CSS, `const a = 1;` is C++.

None of them was patched around. The tests that are about the *text* — tab
stops, common indent, blank-line stripping, escaping, no line numbers, the very
long line — now name `plaintext` explicitly, because that is what they always
meant and the shorthand had simply stopped being true. It is one line in the
`blockText` helper plus five call sites. The tests that read through
`visibleText` needed nothing at all, which is the argument for that helper
existing.

Left deliberately unpinned: the "what the markup must never contain" block still
passes no language, so it now runs over genuinely highlighted output. That is
strictly better — "no `class` attribute survives" is a claim worth making about
markup that actually has spans in it.

### Decisions worth knowing about

- **No auto-detect entry in the dropdown.** Ticket 03's comment predicted one at
  the top of the list, as the default. It is not there, because this ticket's
  own checklist asks for the opposite: the dropdown *shows the detected
  language*. An "Auto" entry would hide the guess behind a word that names no
  language, and the point of showing the guess is that a wrong one is visible
  before the block reaches the message. The comment in `popup.html` has been
  corrected rather than left to mislead the next reader.
- **No relevance floor.** `highlightAuto` returns its best scorer however weakly
  it scored, so a two-word paste can come back as something surprising. A
  minimum relevance was considered and rejected: highlight.js does not document
  its relevance numbers as comparable across grammars, so any threshold would be
  a magic number pretending to be a judgement, and the failure it introduces — a
  correctly detected language thrown away as "not confident enough" — is the
  silent kind. A wrong guess costs one click, which is the trade the ticket
  already makes.
- **`secondBest` is not read.** Offering a runner-up means ranking two guesses in
  a UI whose entire premise is that the common case needs no input.
- **Detection stays behind the seam even though the popup is its only caller.**
  The popup could have imported `hljs` and called `highlightAuto` itself — it
  already imports the bundle for the dropdown list. It does not, because then
  the language shown and the language applied would be two decisions instead of
  one, and the whole reason `detectedLanguage` reports what was *applied* is to
  stop those two from ever drifting.

### Accepted warts

- **The detection path highlights twice.** `highlightAuto` tokenises with the
  winning grammar and then `renderContent` runs `hljs.highlight` again with the
  name it returned. Threading the first result out would mean `resolveLanguage`
  returning markup as well as a name, and ticket 03 was explicit that nothing
  else should move. The table above is the cost: 4 ms on top of 107 ms at 500
  lines, and it is the cheap call of the two.
- **The popup builds a whole block to read one field off it.**
  `refreshDetectedLanguage` calls the seam and discards `html` and `text`. The
  seam is the only entry point by design and detection is not separately
  exported, so this is the shape the design asks for. Ticket 06's preview calls
  the seam on the same event for the same content, and merging the two calls is
  worth doing once both have landed — one call producing the preview *and* the
  detected language is strictly less work than two, and it is literally the same
  call.
- **Prose detects as VB.NET.** There is no "this is not code" answer:
  `highlightAuto` scores every grammar and something always wins on an English
  sentence. Only genuinely unscoreable input — an empty textarea, a single word
  — comes back as nothing. Harmless here, since the textarea is for code and the
  dropdown is one click away, but worth knowing before someone reads a
  surprising guess as a bug.

### Review fixes: the two seam calls are one

The accepted wart above — the popup building a whole block to read one field off
it, on the same event ticket 06's preview renders from — is fixed, and fixed in
the direction this ticket predicted: one call producing the preview *and* the
detected language is strictly less work than two, and it is literally the same
call.

In `popup.js`:

- `refreshDetectedLanguage` is gone. `renderFromSource` (ticket 06's
  `renderPreview`) asks the seam for detection when it is due and assigns
  `detectedLanguage` to the dropdown itself. The preview and the dropdown now
  come out of one call over one source, so they are incapable of disagreeing —
  which was already the intent, but was previously two calls that happened to
  agree.
- Detection therefore rides the 150ms debounce instead of running undebounced on
  every wholesale input. That is the behaviour change: the dropdown updates when
  the render does rather than synchronously on the paste. It is also the whole
  point — the reasoning written at `PREVIEW_DEBOUNCE_MS` ("half a second for the
  3000-line one") was being contradicted by a second, undebounced pass over the
  same source.
- Detection still only fires on a wholesale change. The trigger is now a
  `detectionDue` flag that the change sets and the render clears, so two pastes
  in quick succession detect once, on the render that follows the last of them.
- `requestedLanguage()` is read by the insert as well, so paste followed by
  Ctrl+Enter inside the debounce window detects rather than shipping the block
  under whatever the dropdown last showed. Same pure seam over the same source,
  so the insert and the pending render cannot reach different answers.
- The three `input` listeners — detection, size warning, preview — are one
  `handleSourceChanged({ wholesale, immediate })`, and `claimSelectionPrefill`
  announces its change through it instead of replaying each listener by hand
  under three copies of the same comment. The load-time call goes through it
  too, which is what still derives the dropdown's opening value from the empty
  textarea rather than hardcoding Plain text.

Load and the right-click prefill pass `immediate`: content that arrives all at
once has no burst to collapse, and a debounce there would only mean the dropdown
visibly correcting itself a moment after the popup appeared.
