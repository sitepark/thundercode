# 10: Options page

**What to build:** Somewhere to set tab width and font size, so the output can be adjusted without editing code. These live on a separate options page rather than in the popup, because they are set roughly once a year and the popup is used daily.

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] An options page exposes tab width and font size
- [ ] Values are stored in extension-local storage, not synced storage, and persist across a Thunderbird restart
- [ ] Settings are read when the popup opens and are honoured by the inserted block
- [ ] Sensible defaults apply when nothing has been set
- [ ] The settings do not appear in the popup
- [ ] Invalid or empty values fall back to the defaults rather than producing a broken block
