# 11: Large-snippet warning

**What to build:** A heads-up, not a gate. Because most tokens gain a style attribute, the inserted HTML is several times the size of the source, so a large paste can add a lot of weight to a message. Say so, then get out of the way — emailing three thousand lines of code is a mistake the extension should mention but never prevent.

**Blocked by:** 02

**Status:** ready-for-human

- [ ] Pasting more than roughly five hundred lines shows an advisory warning about message size
- [x] The warning never blocks the insert
- [ ] The warning clears when the content drops back below the threshold
- [x] No hard cap exists at any size

## Comments

### Which two boxes are ticked, and why the other two are not

The two unticked boxes are both claims about what appears on screen: that the
warning shows past the threshold, and that it goes away again below it. Both
are implemented and both are one line of `refreshSizeWarning`, but neither can
be checked here. As with tickets 01 and 02, the only Thunderbird on this
machine is 115.10.1 and an MV3 MailExtension does not load below 128, so the
popup has never been opened. The spec also rules out testing it another way:
the runner has no DOM, deliberately, and adding one would buy a test of jsdom's
rendering rather than of this.

The hands-on check is thirty seconds and settles both at once. Open the popup,
paste a file of a few thousand lines, see the amber line appear with a
plausible count; select all and delete a chunk until the count drops under 500,
see it disappear. The count itself does not need checking — that arithmetic is
the tested part.

The two ticked boxes are ticked because they are properties of the shape of the
code rather than of the running popup, and reading the diff establishes them.
Nothing anywhere writes `insertButton.disabled` outside the click handler's own
in-flight guard, the insert path never reads the warning, and there is no
second, larger threshold to find.

### The threshold is a pure function, and that was worth the extra file

`measureSnippet` in `src/popup/snippet-size.js` returns
`{ lineCount, isLarge }` and knows nothing about the DOM, so `pnpm test` can
drive it. This is a second tested module in a repo whose spec says
`buildCodeBlockHtml` is "the only seam", which is worth being explicit about:
that sentence is about the text-to-HTML pipeline, and this is not part of it.
The pipeline stays single-seamed.

It earns the file on one detail. A snippet copied out of an editor normally
ends in a newline, and `"a\nb\n".split("\n").length` is 3. Left alone, every
count in the warning would have been one too high — harmless to the advice, and
exactly the kind of thing someone eventually files a bug about. That off-by-one
is a fact about strings, testable in Node, and invisible in a UI where the
number is approximate anyway. The rest of the helper is small enough that it
would have been ceremony on its own.

What deliberately did *not* move into the helper is the wording of the warning.
A test that pins a sentence turns rephrasing into a failure, and the sentence
is the part of this most likely to be rephrased. The tests also avoid the
literal `500` wherever they can and derive their fixtures from
`LARGE_SNIPPET_LINES`, so retuning the threshold stays a one-line change.

### Decisions worth knowing about

- **Lines, not bytes.** Bytes would describe the message weight more
  accurately, but the warning exists to be acted on, and a line count is
  something the user can check against what they just pasted. The threshold is
  approximate on purpose and the constant's comment says so: nothing was
  measured to arrive at 500, and 400 or 800 would do the same job.
- **`input`, not `paste`.** The ticket says "pasting", but `paste` alone would
  miss typing, cut, drag and undo, and would fire before the textarea's value
  has updated. `input` covers all of them, which is also what makes the warning
  clear itself: there is no separate hide path that could be forgotten.
- **It also runs once at load.** `input` does not fire for a textarea that
  arrives already filled, and ticket 08 opens the popup prefilled from a
  right-click on a selection. One call at startup means that path is covered
  before it exists rather than after someone notices.
- **Amber, and phrased as a heads-up.** It sits above the Insert button in the
  spot the error line already uses, but in `.warning` rather than `.error`,
  because red would read as "something went wrong" for what is a normal thing
  to do. The text ends with "This is a heads-up, not a limit" for the same
  reason.
- **The message says the block "carries all its formatting inline"** rather
  than naming syntax highlighting. Both explain the size multiplier, but inline
  styling is a permanent design decision, whereas highlighting arrives in
  ticket 03 — the wording is true before and after that lands.
- **Nothing gates Insert, still.** Ticket 02 recorded removing an empty-textarea
  guard on the grounds that no ticket asked for one. This ticket asks for the
  opposite of a guard, and the code reflects that: the advisory and the insert
  path share no state in either direction.
