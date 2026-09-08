# 05: Normalise the pasted source

**What to build:** Clean up what actually comes out of an editor. Copy a method from the middle of a class and it should arrive flush left, with no dead space inside the block's border and no tabs left to be mangled by inconsistent tab-stop handling in mail clients.

Tab width is fixed at the default of four spaces here; making it configurable is ticket 10.

**Blocked by:** 02

**Status:** ready-for-human

- [x] Tabs are expanded to spaces at a width of four
- [x] Trailing whitespace is stripped per line, so soft-wrapping is never triggered by invisible characters
- [x] Leading and trailing blank lines are stripped
- [x] The indentation shared by every non-blank line is removed
- [x] Interspersed blank lines do not defeat the shared-indent calculation
- [x] A line at zero indentation means nothing is removed
- [x] Normalisation is idempotent: feeding already-normalised source through again changes nothing
- [x] Normalisation runs before highlighting
- [x] Tests cover each transform, the idempotence property, and the shared-indent edge cases above

## Comments

### Every box is ticked, which is new for this feature

Unlike tickets 01 and 02, nothing here needs a running Thunderbird: the whole
ticket lives behind the pure seam, so `pnpm test` is the whole verification.
The status is `ready-for-human` only in the sense that what remains is review
and merge.

The one box worth a word is **"normalisation runs before highlighting"**. There
is no highlighter yet, so no test can observe the order; it is ticked because
the code has it — `normaliseSource` runs first, then escaping, then the
wrapper. Ticket 03 must insert highlighting *after* normalisation and not
around it. Tokenising the raw paste would attach spans to indentation that is
about to be sliced off, and stripping a common indent out of finished markup
means editing inside `<span>`s.

### Two of ticket 02's tests were changed, deliberately

Ticket 02's contract was that "indentation is reproduced exactly", meaning the
source went through untouched. This ticket is the one that revokes that, so
both tests that pinned untouched source are rewritten rather than worked
around:

- **"reproduces indentation exactly"** is now "reproduces *relative*
  indentation exactly", and its fixture lost the trailing newline it used to
  assert on. Normalisation strips trailing blank lines, so a snippet no longer
  ends in a newline. That is the intended reading of ticket 02's contract from
  here on: the structure the author sees in their editor survives, the
  clipboard's exact bytes do not.
- **"survives the parser eating the newline after the start tag"** is gone,
  and so is the `restoreLeadingNewline` helper it covered. Stripping leading
  blank lines means the block's text can no longer begin with a newline, so the
  compensation was unreachable code. The knowledge is not lost: a replacement
  test asserts the block never opens with a newline, and its comment says why
  that matters. **If a later ticket ever makes the block's first character a
  newline again, the compensation has to come back** — an HTML parser will
  otherwise eat it.

### Tab stops, not four spaces per tab

A tab advances to the next multiple of the tab width rather than expanding to a
fixed run of spaces. For leading indentation the two agree; they diverge the
moment a tab appears after other characters, which is exactly the case where
the author was lining something up and the fixed-run reading would skew it.
Ticket 10 should keep this when it makes the width configurable — it changes
the stop spacing, not the rule.

The column is counted in code points, so a line with double-width or combining
characters before a tab can still drift by a column. Editors disagree about
that case too, and indentation is unaffected, so it is left alone.

### The order of the four transforms is load-bearing

Trailing whitespace is stripped before anything looks for a blank line. That is
what lets both the edge trim and the shared-indent calculation test a line
against the empty string instead of carrying a whitespace predicate around, and
it is why a line of three spaces counts as blank in both.

A useful side effect: `\r` is trailing whitespace, so a CRLF paste normalises
to LF with no separate step. That is asserted, because it is a claim the code
comment makes.

Blank lines are skipped when computing the shared indent but still sliced —
slicing the empty string is a no-op. Counting them as zero indent is the
silent failure this guards against: most real snippets contain a blank line,
so it would have turned the whole transform off without ever throwing.

### The `tabWidth` guard, which ticket 10 inherits

The seam honours `tabWidth` and defaults to 4, but it also treats anything that
is not a positive whole number — `NaN`, `0`, `undefined` — as 4. Ticket 10
feeds this from a settings field, where a half-typed or cleared value is
exactly that, and `" ".repeat(negative)` throws. A block indented at four is a
much better failure than no block at all. **Ticket 10 does not need to
re-validate before calling the seam**, though it may still want to for the
settings UI's own sake.

### Deliberately not done

- **Nothing new is exported.** Normalisation is internal, the tests drive
  `buildCodeBlockHtml` only, and `src/popup/popup.js` is untouched — it passes
  no `tabWidth` and therefore gets 4.
- **The plain-text path (ticket 09) has no way in yet.** The spec says a
  plain-text composer inserts "the normalised source verbatim", but the seam
  returns HTML and normalisation is not exported. Ticket 09 has to widen the
  seam's return value with the normalised text rather than re-implement the
  four transforms next to it; two copies of this logic would drift.
- **No line-ending normalisation step, no whitespace-only-line policy beyond
  the edges, and no cap on consecutive blank lines inside the snippet.** Blank
  lines in the middle are the author's paragraphing and are kept as they are.
- **The visual result in a real compose window is not checked here.** It rides
  along with the hands-on pass tickets 01 and 02 already need: paste something
  indented out of the middle of a file and confirm the inserted block sits
  flush left.
