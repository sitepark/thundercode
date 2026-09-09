# ThunderCode

<img src="docs/logo.png" alt="ThunderCode logo" width="160">

A Thunderbird MailExtension that inserts syntax-highlighted code blocks into
HTML messages.

Built at [Sitepark](https://www.sitepark.com) for our own use and published
because there is no reason not to. It is MIT licensed and bug reports are
welcome, but it carries no support commitment.

Requires **Thunderbird 128 or newer**. Manifest V3 MailExtensions do not load on
older versions - they cannot be installed at all, temporarily or otherwise.

## Installing

Download the latest `thundercode-<version>.xpi` from the
[releases page](https://github.com/sitepark/thundercode/releases), then:

1. **Tools ▸ Add-ons and Themes**
2. Gear icon ▸ **Install Add-on From File…**
3. Pick the downloaded `.xpi`

Thunderbird does not sign add-ons, so the archive installs directly. It is not
listed on addons.thunderbird.net, which is a deliberate choice rather than an
oversight - staying off the site is what allows the add-on to serve its own
updates.

Once installed it updates itself. Thunderbird fetches the `updates.json`
attached to the most recent release about once a day and upgrades in place;
there is nothing to re-download by hand. Open a compose window and the button
appears in the format toolbar.

## Building the archive

You do not need this to use the add-on - releases are built by CI from a tag.
It is here so that anyone can check the published `.xpi` against the source it
claims to come from.

```sh
pnpm install          # dev dependencies only; nothing shipped needs them
pnpm run package
```

This writes `dist/thundercode-<version>.xpi`, taking the version from
`manifest.json`. There is no build step - the archive is the repo directory
zipped, minus tests, docs and tooling.

## Linting the archive

```sh
pnpm run lint
```

Builds the archive and runs [addons-linter](https://github.com/mozilla/addons-linter)
over it - the engine behind `web-ext lint`, and the nearest thing to a review
Thunderbird add-ons have. It lints the built `.xpi` rather than the checkout, so
what it reads is what ships.

Zero errors is the bar. Warnings are not, and cannot be: the linter knows
Firefox, so the MailExtension APIs this add-on exists to call - the `compose`
permission, `compose.{get,set}ComposeDetails`, `composeAction.openPopup` - all
read to it as unsupported. Skim the list rather than trusting the exit code; it
is short enough to know by heart, and a new entry is worth a look.

## Developing

Install-from-file is for using it. For iterating, load the checkout directly:

1. **Tools ▸ Developer Tools ▸ Debug Add-ons** (this is `about:debugging`)
2. **Load Temporary Add-on…**
3. Pick `manifest.json` at the root of this checkout

A temporary add-on is gone on the next restart, and while it is loaded it takes
over from any permanently installed copy with the same id.

The loop is then: edit a file, press **Reload** on the debugging page, reopen the
popup. Compose scripts are injected per compose window, so changes under
`src/compose/` need the compose window reopened as well - reloading the add-on
does not reach one that is already open.

### Running the tests

```sh
pnpm test        # both automated tiers
pnpm test:node   # the pure tier alone, for a fast edit loop
pnpm coverage    # a report; nothing is gated on it
```

The suite is split into tiers, and which one a test belongs in is decided by
where it can be written rather than by what it is about:

| Tier | Directory | Environment |
| --- | --- | --- |
| `node` | `tests/node/` | no DOM at all |
| `dom` | `tests/dom/` | a simulated document, via jsdom |
| `thunderbird` | `tests/thunderbird/` | a real Thunderbird, driven headless |

`pnpm test` runs the first two. The third needs a Thunderbird to drive, so it
is a local command run while working the checklist, not part of the default run
and not part of CI.

The `node` tier has no document on purpose: a test that reaches for one there
fails rather than passing, which is what has kept the code-block pipeline from
quietly growing a dependency on a DOM. Wanting a document means moving the file
into `tests/dom/`, which is a change someone can see. Anything dropped straight
into `tests/` without picking a tier runs in `node`, so the strict tier is the
default rather than something to remember.

Coverage is reported and never gated - there is no threshold and there will not
be one. The reasoning behind all of this, including the alternatives that were
turned down, is in
[docs/adr/0001-three-test-tiers.md](docs/adr/0001-three-test-tiers.md).

What is still checked by hand is anything that is a claim about Thunderbird
rather than about this project's own logic; that list is
`docs/release-checklist.md`.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):
`type(scope): subject`. There is no `CHANGELOG.md`; the changelog is the body
of the GitHub release, generated from these subjects by git-cliff
(`cliff.toml`) when the release is published. So a subject is not a note to
the next reader of `git log` - it is the sentence a user reads about the
release, and the only one there is.

Two types reach the notes:

- `feat` - an **Added** entry.
- `fix` - a **Fixed** entry.

`perf` becomes **Changed** and `revert` becomes **Removed**. `refactor`,
`docs`, `test`, `chore`, `ci`, `build` and `style` are required on the commit
but deliberately absent from the notes: someone reading them wants to know
what the add-on now does, not how the repo is maintained.

`refactor` is on that list rather than beside `perf` for the same reason. A
refactor changes nothing anyone using the add-on can observe, so an entry for
one tells a reader waiting to hear what the add-on now does about a file move
instead. `perf` stays because a faster add-on is something a user experiences.

Scopes in use: `compose`, `code-block`, `popup`, `options`, `ui`, `release`.

A commit with no type is dropped entirely rather than guessed at. That is
meant to be caught in review - silently listing it under the wrong heading
would be worse. Merge commits are skipped for the same reason and keep their
default subjects.

Run `pnpm changelog` at any point to see what the next release will say. A
cycle whose every commit was an internal type produces nothing at all, which
is an ordinary outcome rather than a rare one - a cycle spent on tests and an
extraction committed as `refactor` is exactly that. What happens next is
under Releasing.

Because the notes are written at publish time from the commits themselves,
there is nothing to prepare and nothing that can go stale. Fixing a bad
changelog line means amending the commit, not editing a file.

## Releasing

The version in `manifest.json` is what gets released; the workflow never
chooses it. Releasing is running an action, not pushing a tag.

1. `pnpm changelog` and read it. This is the release body, and the last
   chance to fix a vague line by amending the commit it came from.
2. Run `docs/release-checklist.md` - the action publishes immediately, so this
   is the last point at which nothing has shipped.
3. **Actions ▸ Release ▸ Run workflow**, on `main`. Leave the bump at `minor`
   unless the next cycle is a patch or a major.

The workflow refuses to start unless it is on `main` and the version is not
already tagged. It then runs the tests, builds the archive, generates `updates.json` from the manifest and the
archive's digest, publishes both under a tag it creates itself with the notes
as the release body, and finally raises `manifest.json` to the next version
and pushes that to `main`.

Empty notes do not stop it. They mean every commit in the cycle was an
internal type, and the workflow prints why the body is blank and publishes
anyway. That call is step 1's, not the job's: read `pnpm changelog` and decide
there, because a release with nothing to say about it is usually one worth
skipping, and if something user-facing did land it was committed under the
wrong type.

So `main` always sits on an unreleased version, and every tag names a commit
where the manifest agreed with it. The bump comes last on purpose: if anything
fails, the manifest still holds the version that failed to release, so a fixed
re-run releases it rather than skipping it.

Two things the workflow depends on and cannot recover from:

- **The release must not be a draft or a prerelease.** The workflow sets both
  to false; do not edit a published release to change that. Thunderbird polls
  `releases/latest/download/updates.json`, and that permalink skips both - a
  prerelease would publish the archive while leaving every installed copy
  pointed at the version before it.
- **`update_url` is baked into every installed copy.** A copy installed today
  polls that exact URL forever, so moving it would strand existing installs
  rather than migrate them. That is why it names no version and no tag.

## Where the console output goes

**Tools ▸ Developer Tools ▸ Error Console** (`Ctrl+Shift+J`) collects logging
from the background and from compose scripts - this is where `ThunderCode:`
lines show up. Compose-script entries are printed twice; that is a known
Thunderbird logging quirk, not a duplicated action.

The popup has a separate console: use **Inspect** next to the add-on on the
debugging page. Note that the popup closes on insert and takes its console with
it, which is why insertion logs from the compose script instead.

Update checks are silent by default. To see why an update did or did not
happen, set `extensions.logging.enabled` to `true` in the config editor and
force a check from the Add-ons Manager gear menu.

## License

MIT - see [License.md](License.md). The vendored copy of highlight.js keeps its
own BSD-3-Clause licence and its provenance is recorded in
`vendor/highlight.js/PROVENANCE.md`.
