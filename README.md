# ThunderCode

A Thunderbird MailExtension that inserts syntax-highlighted code blocks into
HTML messages.

Built at [Sitepark](https://www.sitepark.com) for our own use and published
because there is no reason not to. It is MIT licensed and bug reports are
welcome, but it carries no support commitment.

Requires **Thunderbird 128 or newer**. Manifest V3 MailExtensions do not load on
older versions — they cannot be installed at all, temporarily or otherwise.

## Installing

Download the latest `thundercode-<version>.xpi` from the
[releases page](https://github.com/sitepark/thundercode/releases), then:

1. **Tools ▸ Add-ons and Themes**
2. Gear icon ▸ **Install Add-on From File…**
3. Pick the downloaded `.xpi`

Thunderbird does not sign add-ons, so the archive installs directly. It is not
listed on addons.thunderbird.net, which is a deliberate choice rather than an
oversight — staying off the site is what allows the add-on to serve its own
updates.

Once installed it updates itself. Thunderbird fetches the `updates.json`
attached to the most recent release about once a day and upgrades in place;
there is nothing to re-download by hand. Open a compose window and the button
appears in the format toolbar.

## Building the archive

You do not need this to use the add-on — releases are built by CI from a tag.
It is here so that anyone can check the published `.xpi` against the source it
claims to come from.

```sh
pnpm install          # dev dependencies only; nothing shipped needs them
pnpm run package
```

This writes `dist/thundercode-<version>.xpi`, taking the version from
`manifest.json`. There is no build step — the archive is the repo directory
zipped, minus tests, docs and tooling.

## Developing

Install-from-file is for using it. For iterating, load the checkout directly:

1. **Tools ▸ Developer Tools ▸ Debug Add-ons** (this is `about:debugging`)
2. **Load Temporary Add-on…**
3. Pick `manifest.json` at the root of this checkout

A temporary add-on is gone on the next restart, and while it is loaded it takes
over from any permanently installed copy with the same id.

The loop is then: edit a file, press **Reload** on the debugging page, reopen the
popup. Compose scripts are injected per compose window, so changes under
`src/compose/` need the compose window reopened as well — reloading the add-on
does not reach one that is already open.

Run the tests with `pnpm test`. They cover the manifest, the update manifest,
the version arithmetic and the HTML builder; everything that needs a running
compose window is checked by hand against `docs/release-checklist.md`.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):
`type(scope): subject`. `CHANGELOG.md` is generated from these by git-cliff
(`cliff.toml`), so the subject is not a note to the next reader of `git log` —
it is the sentence a user reads about the release.

Two types reach the changelog:

- `feat` — an **Added** entry.
- `fix` — a **Fixed** entry.

`refactor` and `perf` become **Changed**, `revert` becomes **Removed**, and
`docs`, `test`, `chore`, `ci`, `build` and `style` are required on the commit
but deliberately absent from the file: someone reading it wants to know what
the add-on now does, not how the repo is maintained.

Scopes in use: `compose`, `code-block`, `popup`, `options`, `ui`, `release`.

A commit with no type is dropped from the changelog entirely rather than
guessed at. That is meant to be caught in review — silently listing it under
the wrong heading would be worse. Merge commits are skipped for the same
reason and keep their default subjects.

Run `pnpm changelog` at any point to see what the next release will say.

## Releasing

The version in `manifest.json` is what gets released; the workflow never
chooses it. Releasing is running an action, not pushing a tag.

1. `pnpm changelog:release`. This stamps the unreleased commits with the
   version in `manifest.json` and today's date, and rebuilds the compare links
   at the bottom. Read what came out: git-cliff writes the entries from commit
   subjects, so a vague subject is a vague changelog line, and the fix is to
   amend the commit rather than to edit `CHANGELOG.md` — the next regeneration
   discards anything typed in by hand.
2. Commit that to `main`, and run `docs/release-checklist.md` — the action
   publishes immediately, so this is the last point at which nothing has
   shipped.
3. **Actions ▸ Release ▸ Run workflow**, on `main`. Leave the bump at `minor`
   unless the next cycle is a patch or a major.

The workflow refuses to start unless it is on `main`, the version is not
already tagged, and `CHANGELOG.md` has a section for it. It then runs the
tests, builds the archive, generates `updates.json` from the manifest and the
archive's digest, publishes both under a tag it creates itself, and finally
raises `manifest.json` to the next version and pushes that to `main`.

So `main` always sits on an unreleased version, and every tag names a commit
where the manifest agreed with it. The bump comes last on purpose: if anything
fails, the manifest still holds the version that failed to release, so a fixed
re-run releases it rather than skipping it.

Two things the workflow depends on and cannot recover from:

- **The release must not be a draft or a prerelease.** The workflow sets both
  to false; do not edit a published release to change that. Thunderbird polls
  `releases/latest/download/updates.json`, and that permalink skips both — a
  prerelease would publish the archive while leaving every installed copy
  pointed at the version before it.
- **`update_url` is baked into every installed copy.** A copy installed today
  polls that exact URL forever, so moving it would strand existing installs
  rather than migrate them. That is why it names no version and no tag.

## Where the console output goes

**Tools ▸ Developer Tools ▸ Error Console** (`Ctrl+Shift+J`) collects logging
from the background and from compose scripts — this is where `ThunderCode:`
lines show up. Compose-script entries are printed twice; that is a known
Thunderbird logging quirk, not a duplicated action.

The popup has a separate console: use **Inspect** next to the add-on on the
debugging page. Note that the popup closes on insert and takes its console with
it, which is why insertion logs from the compose script instead.

Update checks are silent by default. To see why an update did or did not
happen, set `extensions.logging.enabled` to `true` in the config editor and
force a check from the Add-ons Manager gear menu.

## License

MIT — see [License.md](License.md). The vendored copy of highlight.js keeps its
own BSD-3-Clause licence and its provenance is recorded in
`vendor/highlight.js/PROVENANCE.md`.
