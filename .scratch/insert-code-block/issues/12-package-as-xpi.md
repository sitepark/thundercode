# 12: Package as an installable extension

**What to build:** A repeatable way to turn the project into an installable archive and keep it installed, rather than reloading it as a temporary add-on every session. Plus the short instructions needed to install it and to iterate on it.

Self-distributed only. Thunderbird does not sign add-ons, so an archive with an extension id installs directly. Publishing to the add-ons site is out of scope.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] A repeatable command produces the installable archive
- [ ] The archive installs permanently in Thunderbird and the button appears in the compose window
- [ ] The archive excludes dev dependencies, tests, and repo scratch files
- [ ] Install instructions are documented
- [ ] The development loop is documented: load as a temporary add-on, edit, reload, and where to find the console output
