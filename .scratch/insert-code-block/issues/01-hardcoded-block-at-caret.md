# 01: Insert a hardcoded block at the caret

**What to build:** An installable extension that puts a button in the compose window's format toolbar. Clicking it opens a popup; pressing Insert drops a fixed, hardcoded code block at the cursor in the message body. Nothing is configurable and the content is a constant — the point is to prove the whole path works end to end before any real behaviour is built on it.

This ticket also settles the three behaviours that could not be verified from Thunderbird's documentation or source. Record the findings in a `## Comments` section on this file, because later tickets depend on them.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Manifest V3, minimum Thunderbird 128, named ThunderCode, with the Gecko extension id `thundercode@sitepark.com` set (Thunderbird refuses to install without an id)
- [ ] Installs as a temporary add-on with no manifest or console errors
- [ ] A button appears in the compose window's format toolbar and opens a popup
- [ ] Pressing Insert places the hardcoded block at the cursor position, leaving the rest of the draft untouched
- [ ] The popup closes after inserting
- [ ] With several compose windows open, the block lands in the one the button was invoked from
- [ ] When no usable cursor position exists in the body, the block is appended at the end of the body rather than failing
- [ ] Requested permissions are limited to what is actually used
- [ ] **Finding recorded:** whether the compose editor's selection survives the popup taking focus. If it does not, a compose script that tracks the last valid range is implemented instead, and the popup messages it at insert time
- [ ] **Finding recorded:** whether inserting HTML through the editor's own insert action is reachable from the compose script sandbox. If it is, use it; if not, fall back to direct Selection/Range DOM insertion
- [ ] **Finding recorded:** whether the insertion is undoable with Ctrl+Z, and whether Thunderbird considers the message modified afterwards (so closing the window warns about unsaved changes)
