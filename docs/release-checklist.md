# Release checklist

`pnpm test` covers the manifest, the update manifest, the HTML builder and the
settings. It cannot open a compose window, so everything the add-on actually
*does* is unverified until someone does it. This file is that someone's list.

Run it before every tag, on **both** supported Thunderbird versions:

- **128 ESR** — the floor `strict_min_version` promises. Untested claims here
  are worse than an honest higher floor; if something fails, either fix it or
  raise the floor.
- **The current release** — what most people are actually on.

Record the result in the GitHub release description, or in the pull request if
the release is being prepared on a branch.

## Insertion

- [ ] Insert a block at the caret in an empty HTML compose window.
- [ ] Insert a block with the caret mid-paragraph; surrounding text is intact.
- [ ] Select existing text in the compose window, right-click, insert as a code
      block; the selection is replaced, not duplicated.
- [ ] `Ctrl+Shift+C` opens the popup.
- [ ] Undo (`Ctrl+Z`) reverses the insert in one step.
- [ ] The message is marked modified after an insert (closing prompts to save).

## Highlighting

- [ ] Paste source in a language with a distinctive shape (Python, SQL); the
      detected language is right and the block is coloured.
- [ ] Override the detected language in the popup; the preview follows.
- [ ] Paste plain prose; the plaintext fallback does not throw.
- [ ] Source containing `&`, `<`, `>` and `"` renders as those characters
      rather than as entities or markup.

## Popup

- [ ] The live preview updates as the source changes.
- [ ] The large-snippet warning appears above the threshold and not below it.
- [ ] Inserting closes the popup.

## Options

- [ ] Open the options pane from the Add-ons Manager; it is embedded, not a tab.
- [ ] Change the theme; a newly inserted block uses it.
- [ ] Settings survive a Thunderbird restart.

## Appearance

- [ ] The toolbar button is visible in the format toolbar on a light theme.
- [ ] The toolbar button is visible on a dark theme (not dark ink on dark).
- [ ] An inserted block reads correctly in both themes.

## Plain-text composers

- [ ] Open a plain-text compose window; the add-on degrades as intended rather
      than inserting broken markup.

## Packaging

- [ ] `pnpm run package` succeeds and `dist/thundercode-<version>.xpi` has the
      version from `manifest.json` in its name.
- [ ] Install that archive from file into a clean profile and repeat one
      insertion — this is the path users take, and it is not the path
      `about:debugging` exercises.
- [ ] The Add-ons Manager shows the ThunderCode icon, not a puzzle piece.
- [ ] Run Thunderbird's reviewer linter once against the archive:
      clone <https://github.com/thunderbird/webext-linter> and
      `node verify.js dist/thundercode-<version>.xpi`. Warnings about unknown
      `messenger.*` APIs and mail permissions are expected noise — the linter
      does not know Thunderbird's own surface. Anything else is worth reading.

## Updates

- [ ] The published release is **not** a draft and **not** a prerelease.
      `releases/latest` skips both, so either one leaves every installed copy
      pointed at the previous version while the archive sits there looking
      published.
- [ ] `updates.json` is attached to the release alongside the `.xpi`, and
      <https://github.com/sitepark/thundercode/releases/latest/download/updates.json>
      returns it.

The rest is only meaningful once a previous release exists.

- [ ] Set `extensions.logging.enabled` to `true` in the config editor first;
      update failures are otherwise completely silent.
- [ ] With the previous version installed, force a check from the Add-ons
      Manager gear menu and confirm it upgrades to the new one.
- [ ] The Error Console shows no "Update manifest did not contain an entry for
      …" line.
