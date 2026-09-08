# 01: Insert a hardcoded block at the caret

**What to build:** An installable extension that puts a button in the compose window's format toolbar. Clicking it opens a popup; pressing Insert drops a fixed, hardcoded code block at the cursor in the message body. Nothing is configurable and the content is a constant — the point is to prove the whole path works end to end before any real behaviour is built on it.

This ticket also settles the three behaviours that could not be verified from Thunderbird's documentation or source. Record the findings in a `## Comments` section on this file, because later tickets depend on them.

**Blocked by:** None (can start immediately)

**Status:** ready-for-human

- [x] Manifest V3, minimum Thunderbird 128, named ThunderCode, with the Gecko extension id `thundercode@sitepark.com` set (Thunderbird refuses to install without an id)
- [x] Installs as a temporary add-on with no manifest or console errors
- [x] A button appears in the compose window's format toolbar and opens a popup
- [ ] Pressing Insert places the hardcoded block at the cursor position, leaving the rest of the draft untouched
- [ ] The popup closes after inserting
- [ ] With several compose windows open, the block lands in the one the button was invoked from
- [ ] When no usable cursor position exists in the body, the block is appended at the end of the body rather than failing
- [x] Requested permissions are limited to what is actually used
- [x] **Finding recorded:** whether the compose editor's selection survives the popup taking focus. If it does not, a compose script that tracks the last valid range is implemented instead, and the popup messages it at insert time
- [x] **Finding recorded:** whether inserting HTML through the editor's own insert action is reachable from the compose script sandbox. If it is, use it; if not, fall back to direct Selection/Range DOM insertion
- [ ] **Finding recorded:** whether the insertion is undoable with Ctrl+Z, and whether Thunderbird considers the message modified afterwards (so closing the window warns about unsaved changes)

## Comments

### The three findings are not settled, and could not be settled here

The only Thunderbird on this machine is 115.10.1. MailExtensions with
`manifest_version: 3` do not load below 128, so the temporary-add-on spike this
ticket asks for could not be run at all — not "was inconvenient", but "the
add-on cannot be installed". Everything below is therefore either code that
handles both outcomes, or a reading of Gecko behaviour that still needs one
hands-on pass on Thunderbird ≥ 128 before later tickets lean on it.

The code is written so that pass takes about a minute and yields all three
answers at once. `insertIntoBody` reports which of its three paths ran, logging
it from inside the compose window rather than from the popup, which closes on
insert and takes its console with it. Look in the Error Console (Tools ▸
Developer Tools ▸ Error Console) for:

```
ThunderCode: inserted via execCommand
```

Per the spec's accepted warts, compose-script entries appear twice; that is
Thunderbird's logging, not a double insert.

**Finding 1 — does the compose editor's selection survive the popup taking
focus?** Unverified. Expected to survive: a `Selection` belongs to its
document, and Gecko does not collapse or discard it when focus moves to an
extension panel — the caret merely stops blinking. The compose-script path in
Thunderbird's own `composeScript` sample depends on the same property.
`insertIntoBody` reads the selection at insert time and checks the range is
inside `document.body`, so if this expectation is wrong the block lands at the
end of the body instead of at the caret. **If the log says `append`, or the
block lands at the end while the caret was mid-message, this finding is
negative** and the hedge this ticket describes — a compose script tracking the
last valid range via `selectionchange`, messaged at insert time — is ticket 01
work and has to be built before this ticket closes. Everything after it leans
on caret-relative insertion, ticket 08 most directly.

**Finding 2 — is `execCommand("insertHTML")` reachable from the compose-script
sandbox?** Unverified. It is attempted first and the DOM Range path is the
fallback, so both outcomes work. **The log distinguishes them: `execCommand`
means yes, `range` means no.**

**Finding 3 — is the insertion undoable, and is the message marked modified?**
Unverified, and it depends on finding 2. If the mechanism is `execCommand` the
answer should be yes to both, because that call routes to
`HTMLEditor::InsertHTMLAsAction`, a real editor action that goes through the
transaction manager. If the mechanism is `range`, direct DOM mutation is
expected to bypass the transaction manager, in which case Ctrl+Z will not undo
the insert and closing the window may not warn about unsaved changes. Check
both by hand: press Ctrl+Z after inserting, then close the window.

### What was verified, and how

`pnpm test` covers the manifest install contract: MV3, the `128.0` floor, the
`thundercode@sitepark.com` id, the `formattoolbar` placement with a popup,
`compose` and `scripting` as the only permissions, and that every file the
manifest names exists — that last one being the cheap way to not discover a
path typo through an install dialog.

The remaining unticked boxes above are all implemented but observable only
inside a running compose window: the button appearing, the popup opening and
closing, the caret-relative placement, the draft being otherwise untouched,
the correct window being targeted with several composers open, and the
end-of-body fallback.

### Decisions worth knowing about

- **No background script.** Nothing in this ticket needs one: a
  `compose_action` with a `default_popup` opens without background code. The
  event page the spec describes arrives with ticket 07's command or ticket 08's
  menu entry, whichever lands first.
- **Targeting the right composer** uses `tabs.query({ active: true,
  currentWindow: true })` and then *refuses* if the resolved tab is not a
  `messageCompose` tab. Falling back to "any open composer" would have been the
  one behaviour worse than an error message, since it can silently put a
  snippet in the wrong email. `tabs.query` needs no `tabs` permission, but the
  refusal branch does rely on `tab.type` being readable without one — worth a
  glance during the same hands-on pass, since the symptom would be the popup
  refusing to insert at all.
- **`deliveryFormat` is deliberately not set** here. It belongs to ticket 02,
  which is where sending is first in scope.
- **The hardcoded HTML already follows the output contract** from the spec —
  one `<pre>`, inline styles only, `font-size` in px set once and inherited,
  `pre-wrap`. Ticket 02 then changes where the HTML comes from rather than what
  it looks like.
- **The injected function is serialised by source** by
  `scripting.executeScript({ func })`, so it cannot close over anything in its
  module. That constraint is load-bearing and is documented at the function.

### Superseded: the toolbar button's icon

The icon this ticket shipped was blank in a running Thunderbird — `context-fill` is not painted in an add-on's action icon. Fixed under ticket 13, which also carries the hands-on check that the checkbox above ("A button appears in the compose window's format toolbar") was going to be ticked by.

### Findings 1 and 2 are settled: `execCommand`

The Error Console on a running Thunderbird reported:

```
ThunderCode: inserted via execCommand
```

That one line answers both, because of where in `insertIntoBody` it can be printed from.

**Finding 1 — positive. The selection survives the popup taking focus.** `execCommand` is only attempted inside the `if (caretRange)` branch, and `caretRange` is non-null only when the document had a selection with at least one range *and* that range's `commonAncestorContainer` was inside `document.body`. So a usable caret was still there at insert time, after the popup had taken focus and been dismissed. The hedge this ticket described — a compose script tracking the last valid range over `selectionchange`, messaged at insert time — is not needed and should not be built. Ticket 08's caret-relative insertion rests on this.

**Finding 2 — positive. `execCommand("insertHTML")` is reachable from the compose-script sandbox**, and returned true. The block therefore goes in through `HTMLEditor::InsertHTMLAsAction` rather than through the Selection/Range fallback. Both paths stay, since the fallback is what catches a composer with no caret at all, but the preferred one is the one that runs.

**Finding 3 — half settled, positively.** Closing the compose window after an insert warns about unsaved changes, so Thunderbird does consider the message modified by it: the block is a real edit and cannot be lost by closing a window that looks untouched. Whether Ctrl+Z removes it is not yet observed.

The original note on finding 3 follows.

**Finding 3 was open, and is now the only one still partly so.** `execCommand` routing to a real editor action is the reason to *expect* the insert to be undoable and the message to be marked modified, but neither has been observed. Two keystrokes settle it: press Ctrl+Z after inserting, then close the window and see whether it warns about unsaved changes.
