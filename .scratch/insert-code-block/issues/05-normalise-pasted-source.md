# 05: Normalise the pasted source

**What to build:** Clean up what actually comes out of an editor. Copy a method from the middle of a class and it should arrive flush left, with no dead space inside the block's border and no tabs left to be mangled by inconsistent tab-stop handling in mail clients.

Tab width is fixed at the default of four spaces here; making it configurable is ticket 10.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] Tabs are expanded to spaces at a width of four
- [ ] Trailing whitespace is stripped per line, so soft-wrapping is never triggered by invisible characters
- [ ] Leading and trailing blank lines are stripped
- [ ] The indentation shared by every non-blank line is removed
- [ ] Interspersed blank lines do not defeat the shared-indent calculation
- [ ] A line at zero indentation means nothing is removed
- [ ] Normalisation is idempotent: feeding already-normalised source through again changes nothing
- [ ] Normalisation runs before highlighting
- [ ] Tests cover each transform, the idempotence property, and the shared-indent edge cases above
