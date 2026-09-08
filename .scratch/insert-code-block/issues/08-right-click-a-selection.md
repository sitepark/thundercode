# 08: Right-click a selection to convert it

**What to build:** Act on code that is already in the message. Right-click in the compose body and the same popup opens, prefilled from the selected text; inserting replaces that selection instead of leaving you with the snippet twice.

Treat pasting into the popup as the reliable path and this as the convenient one. The selected text arrives as plain text extracted from HTML, so its indentation may already be damaged before normalisation ever runs. If that damage turns out to be severe in practice, drop the prefill rather than working around it — the menu item still earns its place by opening an empty popup.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] A menu item appears when right-clicking inside the compose body
- [ ] It opens the same popup as the toolbar button
- [ ] With text selected, the popup's textarea is prefilled with it
- [ ] Inserting replaces the selection, leaving no duplicate of the original text
- [ ] With nothing selected, the popup opens empty
- [ ] **Finding recorded:** how badly the extracted selection text damages indentation in practice. If it is severe, the prefill is removed and the menu item opens an empty popup instead
