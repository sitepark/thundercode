# 06: Live preview in the popup

**What to build:** Show the highlighted result before it reaches the email. A wrong language guess should be caught by looking at the popup, not by inserting, noticing, undoing, reopening and correcting.

**Blocked by:** 03

**Status:** ready-for-human

- [ ] A rendered preview of the highlighted result appears below the textarea
- [ ] The preview updates as the textarea content changes
- [ ] The preview updates as the language dropdown changes, so a corrected language can be confirmed by eye
- [ ] The preview looks like what actually gets inserted, so it can be trusted rather than treated as indicative
- [ ] An empty textarea shows no preview and no error

## Comments

### Every box is implemented and every box is unticked

Not a half-done ticket. All five items are written and none of them is a claim
this machine can make: every one is a statement about what a running popup
does, the popup is the one part of this codebase the spec deliberately does not
unit test, and the only Thunderbird here is 115.10.1 — an MV3 MailExtension
does not load below 128, the same wall tickets 01, 02, 03 and 09 hit. Ticking a
box on "I wrote the listener" would make these boxes mean something different
from what they say.

So they go on the hands-on pass those tickets already need. What to look for,
in order, and what each one is testing:

1. **A preview appears below the textarea.** Paste anything. A bordered block
   in the block's own type should appear between the dropdown and the Insert
   button.
2. **It updates as the textarea changes.** Type into it. The block should
   follow, about a sixth of a second behind the last keystroke, not per
   character.
3. **It updates as the dropdown changes.** With a Python snippet in the
   textarea, walk the dropdown from Plain text to Python: no colour, then
   colour. This is the whole point of the feature — a wrong guess should cost a
   look, not an insert-undo-reopen cycle.
4. **It looks like what gets inserted.** Insert it, then compare the block in
   the compose window against the popup you just closed. They are built by the
   same call and should differ only in width (see the warts below).
5. **An empty textarea shows no preview and no error.** Open the popup and
   read it: nothing between the dropdown and the button, no empty bordered box,
   no error line. Then select-all-delete a pasted snippet and confirm the
   preview goes away again rather than freezing on the last render.

### The preview is the insert's own output, not a second rendering of it

The central requirement is that the preview can be trusted rather than read as
indicative, and the only way to get that is to have one renderer. So the
preview is not styled to resemble the block: it *is* the block. The popup calls
`buildCodeBlockHtml` with the same source, the same dropdown value, the same
theme map and the same settings the insert will use, and puts the `html` it
gets back on screen. The seam is pure, so the two calls cannot disagree — that
purity, which existed for testability, turns out to be what makes a trustworthy
preview cheap.

The alternative — a `.preview` block in `popup.css` mirroring `preStyle()`, and
the theme stylesheet doing the colours through the `hljs-` classes — was
rejected. It would have worked on the day it was written and drifted the first
time anyone changed the block: a preview that is accurate until the moment it
matters is worse than no preview, because it will have been believed. The same
argument is why `popup.css` styles the preview *container* only and touches
nothing inside it, and why there is still no font size in `popup.css` — the
size comes from the settings the seam was called with, so ticket 02's warning
about keeping two copies of the font size in step stays unearned.

`html` is not recomputed and handed to the insert, though. The insert calls the
seam again. Caching the previewed string and inserting that would tie the
insert to whether a debounced render had finished, which is a way of inserting
something stale — and the purity that makes the preview trustworthy is exactly
what makes recomputing it free of risk.

### Putting a built HTML string into the popup's own DOM

That is the obvious tension in the paragraph above, and it is the shape of an
injection bug, so it is worth being explicit about what is actually holding.
Three things, in order of how much weight they carry:

- **The string is not user HTML.** It is the seam's output, and the seam
  escapes `&`, `<` and `>` in the source before any of it becomes markup —
  there is a test for that, because the same property is what stops pasted
  markup injecting elements into the *message*. This is the real defence, and
  the preview relies on nothing the message body does not already rely on.
- **It is parsed inertly.** `DOMParser.parseFromString` builds a detached
  document with no browsing context: no script runs, no `src` is fetched, no
  handler attribute is honoured. Only the parsed `<pre>` is then imported. This
  holds regardless of what the string contains, which is why it is here rather
  than `innerHTML` — `innerHTML` is one line shorter and would fetch an
  `<img src>` if the seam ever emitted one.
- **The popup is an extension page under the default MV3 CSP**, so inline
  script could not run in it even if something wrote some in.

### Why it is debounced, at 150ms

The seam runs a full highlight over the whole snippet, and the whole snippet
may be the several hundred lines ticket 11 warns about. Per keystroke that is
the same scan once per character with every result but the last thrown away.

A trailing debounce is the simplest thing that fixes it and the only thing
tried. `requestIdleCallback` schedules better and would also mean a preview
that never appears while someone keeps typing. Incremental re-highlighting of
just the changed region is not something highlight.js offers.

150ms is a threshold and not a boundary: longer than the gap between keystrokes
of anyone typing quickly, so a burst collapses to one render, and short enough
that the preview reads as immediate after a pause. Nothing was measured, and
nothing downstream depends on the number — the dominant path is a single paste,
where the cost is one render whatever the delay is. It also buys an ordering
property for free, which the note to ticket 04 below depends on.

### Decisions worth knowing about

- **Empty means empty, not blank.** The preview hides when the textarea is the
  empty string. Whitespace-only source is previewed, and previews as the
  bordered empty box the seam returns for it — because that is what pressing
  Insert would put in the message, and hiding it would be the preview lying
  about the one thing it exists to be honest about. "No preview" is reserved
  for "nothing has been pasted yet".
- **A failed render clears the preview rather than leaving the last good one
  up.** Stale is the one failure mode this element must not have: a preview
  showing the previous language beside a dropdown showing the new one is worse
  than showing nothing. The error is not written to the error line either — the
  insert makes the identical call and reports it there properly, and a preview
  failure is not an insert failure until someone presses Insert.
- **A generation counter guards the two awaits** on the settings and theme-map
  promises, so an older render cannot land after a newer one. With the debounce
  in front this is close to unreachable, and both promises resolve within
  milliseconds of the popup opening. It stays because "close to unreachable" is
  not a property worth resting the accuracy of this element on, and it costs
  three lines.
- **`change`, not `input`, on the dropdown.** `input` on a `<select>` fires for
  the same interactions in Gecko and would add nothing but a second name for
  when the value changed.
- **The preview sits after the dropdown**, not directly under the textarea. The
  ticket says "below the textarea" and this is; it is placed where it is
  because the question it answers is the dropdown's, and the eye should be able
  to go straight from the language it just picked to the colour that resulted.
- **The right-click prefill re-renders by hand.** Assigning `value` from script
  fires neither `input` nor `change`, so `claimSelectionPrefill` now calls the
  preview as well as the size warning — the same reason ticket 11's warning is
  called there.
- **Nothing new is unit tested, and nothing was extracted to make it
  testable.** There is no pure logic in here to extract: what was added is a
  listener, a timer and a DOM write around a function that is already tested
  through the seam. The one candidate, "is the textarea empty", is `value ===
  ""`. Wrapping it in a module to give the runner something to call would be
  test theatre.

### Accepted warts

- **The preview wraps at the popup's width, which is not the recipient's.**
  `white-space: pre-wrap` wraps to whatever box it is in; the popup is 32em and
  a mail window is whatever the reader made it. So a long line may wrap in the
  preview and not in the message, or the reverse. Unfixable in principle rather
  than unfixed — there is no width to be faithful to. The preview is exact
  about colour, type, indentation and escaping, which is what a wrong-language
  guess is caught by.
- **`max-height: 18em; overflow: auto` on the container.** A five-hundred-line
  paste would otherwise make the popup taller than the screen and push the
  Insert button off it. This changes how much of the block is visible at once
  and nothing about how it renders, and it is the only rule in `popup.css` that
  affects what the preview looks like at all. It also gives the container a
  block formatting context, which keeps the `<pre>`'s own 12px margins inside
  the box where they can be seen, as they will be in the message.
- **The popup resizes as the preview appears and grows.** Expected rather than
  liked: the block is a block, and the alternative is reserving space for a
  preview that is not there yet.

### For whoever merges ticket 04

The preview reads `languageField.value` at render time rather than being handed
a language, so detection setting the dropdown from script does the right thing
with no coordination — provided detection is synchronous on the same `input`
event. It is: the debounce means the render happens 150ms after the event that
scheduled it, by which time any synchronous listener on that event has long
finished, whatever order the two listeners were registered in. If ticket 04's
detection ends up asynchronous, it must call `schedulePreview()` itself after
it assigns to the dropdown, the same way `claimSelectionPrefill` does.

### Review fixes: one seam call, and comments that had gone stale

`renderPreview` is now `renderFromSource`: it settles the language as well as
rendering the preview, from a single call to the seam. Ticket 04's comments
carry the whole of it. The short version is that **"For whoever merges ticket
04" above is now moot** — the preview no longer reads a dropdown that something
else filled in, because the call that renders the preview is the call that fills
the dropdown in. The ordering hazard that section was written to head off cannot
occur.

`schedulePreview` gained a sibling, `renderNow`, for the two places content
arrives all at once rather than being typed: the popup opening and the
right-click prefill.

Two comments referred to this ticket and ticket 10 as future work, and both have
landed:

- `popup.css` said the textarea "is a paste target, not a preview of the block —
  ticket 06 brings the preview, and duplicating the block's exact type here
  would only give ticket 10 two font sizes to keep in step". It now names
  `#preview` and the configurable font size directly.
- `popup.html` said nothing in the document carries the theme's `.hljs` classes
  "until ticket 06's preview does". The preview adopts the seam's output, which
  carries no class attribute at all, so the claim still holds — the comment now
  says why instead of promising it will stop being true.
