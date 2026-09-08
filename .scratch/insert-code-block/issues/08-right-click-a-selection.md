# 08: Right-click a selection to convert it

**What to build:** Act on code that is already in the message. Right-click in the compose body and the same popup opens, prefilled from the selected text; inserting replaces that selection instead of leaving you with the snippet twice.

Treat pasting into the popup as the reliable path and this as the convenient one. The selected text arrives as plain text extracted from HTML, so its indentation may already be damaged before normalisation ever runs. If that damage turns out to be severe in practice, drop the prefill rather than working around it — the menu item still earns its place by opening an empty popup.

**Blocked by:** 02

**Status:** ready-for-human

- [ ] A menu item appears when right-clicking inside the compose body
- [x] It opens the same popup as the toolbar button
- [ ] With text selected, the popup's textarea is prefilled with it
- [ ] Inserting replaces the selection, leaving no duplicate of the original text
- [ ] With nothing selected, the popup opens empty
- [ ] **Finding recorded:** how badly the extracted selection text damages indentation in practice. If it is severe, the prefill is removed and the menu item opens an empty popup instead

## Comments

### Everything is built; the boxes that need a running Thunderbird are unticked

Same wall as tickets 01 and 02: the only Thunderbird on this machine is
115.10.1, and an MV3 MailExtension does not load below 128, so nothing that
only exists inside a compose window could be observed. The menu item, the
prefill and the empty-popup case are all implemented and all unticked for that
reason alone.

The one ticked box is ticked on structure rather than on a sighting: the menu
handler calls `composeAction.openPopup()`, which by definition opens the
action's own popup, and `compose_action.default_popup` names the single popup
document in the repo. There is no second popup for it to open.

The hands-on pass is short. Open a composer, type two indented lines,
right-click in the body with nothing selected: the item **Insert as code
block** should be in the menu and should open an empty popup. Select the two
lines, right-click, and the popup should open with them already in the
textarea. Insert, and there should be one code block and no leftover copy of
the selected lines.

### This ticket added the background script

Ticket 01 deliberately shipped without one and named this ticket as one of the
two that would need it. Nothing else in the extension has grown one since, so
`src/background/background.js` is new here. It is an **event page**
(`background.scripts`, `type: "module"`), because `background.service_worker`
is not implemented in Gecko. Ticket 07 adds a `commands` entry and no
background code of its own, so the two changes to `manifest.json` are separate
keys.

Two event-page constraints are visible in the code. `menus.create` needs an
explicit `id` there and cannot take an `onclick`, so clicks arrive through
`menus.onClicked`. And the file scope is re-executed on every wake, so the
`create` call swallows exactly one error — the duplicate id from the second and
later runs — by reading `runtime.lastError` in its callback. A
`runtime.onStartup` listener re-creates the item; that listener also exists
because an event page with no startup listener does not run at startup.

### How the popup learns what was selected

`menus.onClicked` parks `info.selectionText` in a `Map` keyed by the compose
tab, then opens the popup. The popup resolves its own compose tab the way it
already did for inserting, and asks the background for that tab's parked text
over `runtime.sendMessage`.

- **Keyed by tab** for the same reason the insert path refuses a non-compose
  tab: with two composers open, a selection from one must not surface in the
  other's popup.
- **Take-once.** The background deletes the entry as it hands it over, and
  deletes it again if `openPopup()` returns false. Otherwise the next toolbar
  click on that tab would open prefilled with a selection the user made
  minutes ago and has since moved on from.
- **`openPopup({ windowId: tab.windowId })`**, not the default current window,
  so the popup opens over the composer that was actually right-clicked.
- **Message-passing rather than `storage.local`**, which would mean requesting
  the `storage` permission before ticket 10 needs it, and would persist a
  fragment of the user's message to disk to move it between two windows that
  are both already open. Rather than a query string on the popup URL, too:
  that means `composeAction.setPopup()` before and after every open, and a
  crash between the two leaves the popup permanently pointed at a stale URL.
- **A failed claim is silent.** No prefill leaves an empty textarea, which is
  what the toolbar button opens anyway; surfacing it on the error line would
  report a broken convenience as a broken popup.

### Replacing the selection: no new code, and one honest caveat

`insertIntoBody` already deletes the selection on both of its real paths — the
`execCommand("insertHTML")` path does it as part of the editor action, and the
Range path calls `deleteContents()` before inserting. So no code was added for
"leaving no duplicate", and the box is unticked rather than because something
is missing.

It is unticked because it rests entirely on **ticket 01's finding 1, which is
still unverified**: whether the compose editor's `Selection` survives the popup
taking focus. If it does, both paths replace the selection and the box is true.
If it does not, this is precisely the ticket that shows it, and the symptom is
the one the ticket is named after:

- If the selection collapses but a range remains in the body, the block is
  inserted at that point and the original text stays — **the snippet appears
  twice**, which is the failure this ticket exists to prevent.
- If no range survives at all, `insertIntoBody` falls through to its `append`
  path and the block lands at the end of the message, again alongside the
  original.

Either way the hedge is the one ticket 01 already specified and assigned to
itself: a registered compose script tracking the last valid Range via
`selectionchange`, messaged at insert time. Nothing here works around it,
because a workaround in this file would be the wrong place for it — every
insertion path needs the fix, not just the right-click one. The
`ThunderCode: inserted via …` line in the Error Console distinguishes the
cases: `execCommand` or `range` means a live selection was found, `append`
means there was none.

### The indentation finding is not recorded, and could not be

The last box stays unticked. Answering "how badly in practice" needs a
right-click on real HTML in a real compose window, and that cannot be done on
115.10.1. Nothing was invented to fill the gap.

What the documentation does establish:

- `info.selectionText` is documented as "the text for the context selection",
  i.e. the plain-text extraction of the selected HTML, not its markup. Leading
  whitespace in the message body survives only insofar as it is in the DOM's
  text nodes.
- It is populated for compose tabs only because the extension holds the
  `compose` permission; those context properties are gated on host permission.
  If the prefill ever arrives empty while a selection was plainly made, that
  permission is the first thing to check, not the extraction.
- The blast radius is bounded downstream. A code block previously inserted by
  this extension is a `<pre>`, whose whitespace is real text, so re-selecting
  one should extract cleanly. The damage case is code pasted into the body as
  ordinary text, where the indentation may have been collapsed by the editor
  long before any selection was made — which is exactly the material this
  ticket is for.
- Ticket 05's normalisation cannot recover it. It removes indentation
  (tabs, common prefix, trailing space); it never restores indentation that is
  no longer in the string.

**The check, which takes about a minute.** In a composer, paste a nested
snippet — something with at least three indent levels, ideally mixing tabs and
spaces. Select it, right-click, choose **Insert as code block**, and read the
textarea *before* pressing Insert. Compare it against the source you pasted:

1. Leading whitespace present on every line, at the right depth: prefill keeps
   its place as-is.
2. Relative depth preserved but tabs turned into single spaces or into a fixed
   width: still fine, ticket 05 expands tabs anyway.
3. Leading whitespace flattened or gone on some lines: **the prefill is worse
   than useless**, because it looks like working code until the block is
   already in the message. Drop the prefill per the ticket's own instruction —
   which means deleting `claimSelectionPrefill` from `src/popup/popup.js` and
   the parking half of `src/background/background.js`, and keeping the menu
   item, which still earns its place by opening an empty popup next to the code
   the user wants to convert.

### Notes for whoever merges this

`manifest.json` gains two things: `menus` in `permissions`, and the
`background` key. Both sit above `compose_action`, so ticket 07's `commands`
key at the end of the file does not overlap. `src/popup/popup.js` gains one
appended block plus a reworded comment on the existing load-time
`refreshSizeWarning()` call — that call now initialises the warning line, and
the prefill path calls the function again for itself, because assigning
`value` from script does not fire `input`.

There is no manifest-level `menus` key in MV3; menu items exist only as
`menus.create` calls. The `menus` permission is mandatory to make those calls
at all, and it is the only trace of the menu item the manifest carries, which
is what `tests/manifest.test.js` now asserts alongside the event-page shape.

The shared research notes at `~/.cache/thundercode-notes/thunderbird-apis.md`
were not there — the directory exists and is empty. The API facts above were
taken from the Thunderbird MV3 `menus` and `composeAction` references instead:
`menus` permission mandatory, `id` mandatory and `onclick` unavailable on event
pages, context properties gated on host permission, and
`composeAction.openPopup()` present since TB 113, comfortably below the 128
floor.
