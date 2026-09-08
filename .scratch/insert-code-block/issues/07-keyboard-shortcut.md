# 07: Keyboard shortcut

**What to build:** The whole interaction without the mouse. A shortcut opens the inserter from the compose window, and a second one confirms the insert from inside the popup, so you never reach for the mouse mid-sentence.

**Blocked by:** 01

**Status:** ready-for-human

- [ ] A keyboard shortcut opens the popup from a compose window, using Thunderbird's built-in command for triggering the compose action
- [ ] Ctrl+Enter inside the popup confirms the insert
- [x] The shortcut is declared in the manifest so the user can rebind it through Thunderbird's own shortcut settings
- [ ] A full paste-and-insert round trip is possible from the keyboard alone
- [x] The chosen combination does not collide with an existing Thunderbird compose shortcut

## Comments

### The shortcut is Ctrl+Shift+C, and here is every collision that was checked

Both keys are wired up; three of the five boxes stay unticked for the reason
tickets 01 and 02 give — the only Thunderbird on this machine is 115.10.1 and an
MV3 MailExtension does not load below 128, so nothing that requires a running
compose window could be observed. The collision box is ticked because it was
answered by reading Thunderbird's source rather than by pressing keys, and the
declaration box because that is a fact about the manifest.

Collisions were checked by reading the keysets out of comm-central, not from the
support-site shortcut page (which failed to render) or from memory:

- `mail/components/compose/content/messengercompose.xhtml` — the `composeKeys`
  and `editorKeys` keysets, resolved against
  `messengercompose.dtd` and `editorOverlay.dtd` for the actual letters.
- `mail/base/content/mainKeySet.inc.xhtml`, resolved against `messenger.dtd` and
  `messenger.ftl`.
- `calendar/base/content/calendar-keys.inc.xhtml`, and the chat and menubar
  includes, which define no accelerators of their own.

The Ctrl+Shift combinations Thunderbird already takes on Linux and Windows are
listed with their commands in `tests/manifest.test.js`, and the chosen shortcut
is asserted not to be one of them. That list is a snapshot of what was read; it
cannot prove `Ctrl+Shift+C` is free, but it does mean that rebinding to a
combination someone else's muscle memory owns fails in the test run.

**The main window is in scope even though the command only acts on composers.**
`ExtensionShortcuts.registerKeys` appends the extension's keyset to every window
`windowTracker.browserWindows()` yields, and Thunderbird's `isBrowserWindow`
accepts the 3-pane, message and compose windows alike. So a combination that is
free in the compose window but taken in the 3-pane — `Ctrl+Shift+B` for the
address book, `Ctrl+Shift+K` for the quick filter bar — would still be a
conflict. `Ctrl+Shift+K` is doubly disqualified: it is Remove Links in the
compose window's own editor keyset.

Two families were rejected before letters were even considered:

- **`Ctrl+Alt+…`** is legal in the manifest but is AltGr on Windows and on most
  European keyboard layouts, so it collides with typing `@`, `\` or `[`.
- **`Ctrl+Shift+Z`** looks free in a naive reading of the compose keyset, but
  `key_redo` is `accel,shift` on Unix. Platform `#ifdef`s are exactly where a
  from-memory answer goes wrong.

`Ctrl+Shift+C` is declared once as `default`, with no per-platform overrides:
the commands API reads `Ctrl` as `Command` on macOS, which is the right gesture
there. On macOS that lands on Cmd+Shift+C, which Thunderbird's compose window
does not bind either.

### No background script, still

`_execute_compose_action` is handled entirely in the parent process:
`MailExtensionShortcuts.buildKey` recognises the name and calls
`composeActionFor(extension).triggerAction(win)` directly. Nothing dispatches
`commands.onCommand` for it, so there is nothing to listen to and no event page
to add. Ticket 01 said the background script arrives with whichever of this
ticket or ticket 08 first needs one; this one does not, so **ticket 08's menu
entry now owns that job**.

The test pins the command name as the *only* key in `commands`, since adding a
second, ordinary command is the change that would quietly require a background
script.

### Ctrl+Enter has to be swallowed, or it sends the message

The compose window binds Ctrl+Enter to Send (`key_send`, `accel` +
`VK_RETURN`). The popup is a `<browser>` inside a panel in that same window, and
a chrome `<key>` still fires for a keypress that started inside it unless the
page consumes the event. The popup's handler therefore calls `preventDefault()`
before doing anything else, and that call is the whole reason the shortcut is
safe rather than a way to send a half-written email.

**This is the one thing to watch during the hands-on pass ticket 01 already
needs.** Open the popup, type something, press Ctrl+Enter. Expected: the block
is inserted and the popup closes. If instead the message is sent, `preventDefault`
did not reach the chrome key and the popup shortcut has to move off Ctrl+Enter —
which would contradict the spec, so it is worth knowing early.

`metaKey` is accepted alongside `ctrlKey` so the same handler covers Cmd+Enter
on macOS.

### Decisions worth knowing about

- **The description on the command is not decoration.** `about:addons`'s
  shortcut list maps only `_execute_action`, `_execute_browser_action`,
  `_execute_page_action` and `_execute_sidebar_action` to built-in labels, and
  falls back to `command.description || command.name`. Without a description,
  the row a user rebinds is labelled `_execute_compose_action`.
- **The Ctrl+Enter listener is on `document`, not on the textarea**, so it still
  works after Tab has moved focus to the Insert button.
- **Button and shortcut share one `confirmInsert()`**, error branch included. A
  second path that skipped the error line would produce a shortcut that appears
  to do nothing when an insert fails, which is worse than having no shortcut.
- **A second Ctrl+Enter while an insert is in flight is a no-op**, guarded by the
  button's own disabled state rather than a new flag — holding the combination
  down would otherwise queue inserts.
- **The shortcut is named in the Insert button's tooltip.** Thunderbird's
  shortcut settings list the binding that opens the popup and can say nothing
  about a binding inside it, so the popup is the only place it is discoverable.
- **Nothing in the popup announces the opening shortcut.** It is rebindable, so
  any string stating it would be a lie the moment someone changes it.

### Review fixes

The `keydown` handler was the one place in the repo written `event =>` rather
than `(event) =>`. Now it matches everything around it.
