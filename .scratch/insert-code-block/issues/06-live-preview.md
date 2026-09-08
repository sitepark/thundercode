# 06: Live preview in the popup

**What to build:** Show the highlighted result before it reaches the email. A wrong language guess should be caught by looking at the popup, not by inserting, noticing, undoing, reopening and correcting.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] A rendered preview of the highlighted result appears below the textarea
- [ ] The preview updates as the textarea content changes
- [ ] The preview updates as the language dropdown changes, so a corrected language can be confirmed by eye
- [ ] The preview looks like what actually gets inserted, so it can be trusted rather than treated as indicative
- [ ] An empty textarea shows no preview and no error
