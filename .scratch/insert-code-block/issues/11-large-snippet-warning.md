# 11: Large-snippet warning

**What to build:** A heads-up, not a gate. Because most tokens gain a style attribute, the inserted HTML is several times the size of the source, so a large paste can add a lot of weight to a message. Say so, then get out of the way — emailing three thousand lines of code is a mistake the extension should mention but never prevent.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] Pasting more than roughly five hundred lines shows an advisory warning about message size
- [ ] The warning never blocks the insert
- [ ] The warning clears when the content drops back below the threshold
- [ ] No hard cap exists at any size
