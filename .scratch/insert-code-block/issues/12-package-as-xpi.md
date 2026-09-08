# 12: Package as an installable extension

**What to build:** A repeatable way to turn the project into an installable archive and keep it installed, rather than reloading it as a temporary add-on every session. Plus the short instructions needed to install it and to iterate on it.

Self-distributed only. Thunderbird does not sign add-ons, so an archive with an extension id installs directly. Publishing to the add-ons site is out of scope.

**Blocked by:** 01

**Status:** ready-for-human

- [x] A repeatable command produces the installable archive
- [ ] The archive installs permanently in Thunderbird and the button appears in the compose window
- [x] The archive excludes dev dependencies, tests, and repo scratch files
- [x] Install instructions are documented
- [x] The development loop is documented: load as a temporary add-on, edit, reload, and where to find the console output

## Comments

### The one unticked box, and why

**"The archive installs permanently in Thunderbird and the button appears in
the compose window"** is unticked for the same reason tickets 01 and 02 have
unticked boxes: the only Thunderbird on this machine is 115.10.1, and an MV3
MailExtension does not load below 128. The archive cannot be installed here,
permanently or temporarily, so the claim would be unfounded.

What *was* verified is everything up to the install dialog. `pnpm run package`
runs, and `unzip -l` on its output shows `manifest.json` at the archive root
with no containing folder — the single most common way a hand-rolled XPI fails,
since Thunderbird reads the manifest from the root or rejects the file. The
listing is otherwise `src/`, `icons/` and `README.md`, and nothing else.

Add it to the hands-on pass tickets 01 and 02 already need. It is the first
step of that pass rather than an extra one: install the archive, then the
button, the popup and the round-trip send are all checked against the thing
that will actually be running day to day.

### The exclusion list is the design

The packaging command is exclusion-based on purpose, and that is the only
interesting decision here. Later tickets add files — highlight.js and a theme
under `vendor/` for ticket 03, an options page for ticket 10 — and an allowlist
would have shipped an archive silently missing them, which surfaces as a broken
add-on rather than a failed build. So the default is "ships", and
`scripts/package.sh` names only what must not.

This was checked rather than assumed: a run with `vendor/hljs/*`,
`src/options/options.html`, a `.DS_Store` and an editor swap file dropped into
the tree put the first two in the archive and left the last two out, with no
edit to the script.

Two exclusions are worth calling out because they are not obvious:

- **`.claude/*`** holds agent worktrees, i.e. entire further checkouts of this
  repo. Including it by accident recurses the whole tree into the archive.
- **`.git`** is matched both as a directory and as a plain file, because in a
  git worktree it is a file.

### Decisions worth knowing about

- **A shell script rather than a one-liner in `package.json`.** The ticket's
  substance is *why* each thing is excluded, and JSON has nowhere to put a
  comment. `pnpm run package` is a two-word wrapper over `scripts/package.sh`.
- **`rm -f` before zipping.** `zip` adds to an existing archive instead of
  replacing it, so without this a file deleted from the repo lives on in every
  subsequent build.
- **The version comes from `manifest.json`, not `package.json`.** Those two
  numbers are unrelated — the extension is not an npm package, and
  `package.json` is still at `0.0.0` — so the output is
  `dist/thundercode-0.1.0.xpi` today and tracks the manifest from here on.
- **`package.json` itself is excluded.** Shipping it would put a second,
  contradictory version number inside the add-on.
- **`README.md` ships.** It is not dev-only in the way tests and specs are, it
  costs two kilobytes, and leaving it in keeps the rule simple: if it is not
  named in the exclusion list, it is in the archive.
- **No `dist/` cleaning and no versioned-archive pruning.** Old builds
  accumulate; `dist/` is gitignored and `rm -rf dist` is not a workflow worth
  scripting.
