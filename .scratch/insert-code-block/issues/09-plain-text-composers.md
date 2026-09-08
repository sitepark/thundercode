# 09: Plain-text composers

**What to build:** The button should never appear broken. In a plain-text compose window there is no HTML to insert, so insert the normalised source verbatim with no markup. Verbatim code in a plain-text mail is a perfectly good outcome — it is what mailing lists have done for decades.

The compose format of an open window cannot be changed, so do not offer to switch it.

**Blocked by:** 02, 05

**Status:** ready-for-agent

- [ ] In a plain-text compose window the button is enabled and inserting works
- [ ] The inserted text is the normalised source with no markup, styling or wrapper
- [ ] Indentation is preserved
- [ ] No attempt is made to change the message's compose format, and no error is shown for being in plain-text mode
- [ ] The insert lands at the cursor, consistent with the HTML path
