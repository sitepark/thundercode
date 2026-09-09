# Release checklist

The suite can open a compose window now. What it cannot do is look at one, so
this file is what is left: claims about Thunderbird, claims about what
something looks like, and one section of claims about the release itself that
only exist after it has been published. Everything that was a claim about this
add-on's own logic has moved into the tests, and the first section lists what
that took with it - not as items to work through, but so that a failure there
is recognisable as a checklist item failing rather than as a test being
fussy.

Run it before every tag, on **both** supported Thunderbird versions:

- **128 ESR** - the floor `strict_min_version` promises. Untested claims here
  are worse than an honest higher floor; if something fails, either fix it or
  raise the floor.
- **The current release** - what most people are actually on.

Record the result in the GitHub release description, or in the pull request if
the release is being prepared on a branch.

## What the tests cover

- [ ] `pnpm test` passes.
- [ ] `pnpm test:thunderbird` passes. It drives the pinned 128 ESR, which it
      fetches itself, so this is the floor version of the two runs above.
- [ ] `THUNDERBIRD_BINARY=/path/to/thunderbird pnpm test:thunderbird` passes
      against the current release. Same suite, the maintainer's own install;
      the README says what the variable does.

Three commands, and they stand in for the following, each of which was an item
on this list and is now an assertion in `tests/thunderbird/insertion.test.js`
unless another file is named:

- A block landing at the caret in an empty HTML composer, through the toolbar
  button.
- The same insert with the caret mid-paragraph, leaving the text on both sides
  of it intact - and source with nothing to highlight not throwing on the way.
- A selection right-clicked, arriving in the popup, and replaced rather than
  duplicated.
- The insert going through the editor command rather than a DOM fallback, which
  is the path that runs in production, and one `Ctrl+Z` taking it out again.
- `&`, `<`, `>` and `"` in the source reaching the message as those characters.
- The popup closing when the insert lands.
- A plain-text composer receiving the source as text with no markup in it.
  The test unhides the format toolbar to get there, because the add-on offers a
  plain-text composer no route to the popup and is not meant to: it inserts into
  HTML mail. What is covered is the insert; reaching it is not something a user
  can do.
- The context-menu item being in an HTML composer's body menu and not in a
  plain-text composer's, which is the one route that could have offered an
  insert nothing could carry out.
- The shortcut inserting exactly what the button inserts, and the manifest's
  `Ctrl+Shift+C` having become the key element Thunderbird derives from it.
  **Delivering that key press is not covered** - see the first item under
  Insertion.
- `pnpm run package` producing `dist/thundercode-<version>.xpi` with the
  manifest's version in its name, in `compose-window.test.js`: the tier
  installs that archive, so every run builds it.
- The live preview updating as the source changes, and the large-snippet
  warning appearing past the threshold and not below it, in
  `tests/dom/popup.test.js` and `tests/node/snippet-size.test.js`. Both are
  claims about this add-on's own arithmetic rather than about Thunderbird,
  which is what made them safe to stop looking at.
- Correcting the detected language and the preview following it, in
  `tests/dom/popup.test.js`.
- The update manifest being keyed by the id this add-on's manifest declares,
  in `tests/node/updates.test.js`. That was the "Update manifest did not
  contain an entry for …" line to look for in the Error Console after an
  update check, which is the only symptom a mismatch has - and it is a claim
  about a file this repo generates rather than about Thunderbird reading it.

## Insertion

- [ ] `Ctrl+Shift+C` opens the popup, pressed on a real keyboard in an HTML
      composer. The tier drives the `key` element Thunderbird built from the
      manifest and asserts that opening the popup that way inserts identically
      to the button, but it cannot press the key: a letter-key shortcut is
      matched on keypress, and synthesised input produces none. So what is left
      here is exactly the delivery, which is Thunderbird's half of that
      shortcut.
- [ ] No red spell-check underlines anywhere in an inserted block, and prose
      typed above and below it is still checked. The block relies on the
      `moz-forward-container` wrapper for this, which is Thunderbird's own
      marker and not a promise it makes to add-ons - a Thunderbird upgrade
      could drop it, and only this check would notice.
- [ ] Attaching a file with Filelink while a block sits above a forwarded
      message still puts the cloud links in a sensible place. This is the known
      cost of that wrapper; it is a nuisance, not a failure.
- [ ] The message is marked modified after an insert, so closing the composer
      prompts to save. The tier reads the editor's modification count; that
      Thunderbird then puts up the prompt is the part with a dialog in it.

## Appearance

- [ ] The toolbar button is visible in the format toolbar on a light theme.
- [ ] The toolbar button is visible on a dark theme (not dark ink on dark).
- [ ] An inserted block reads correctly in both themes.
- [ ] Paste source in a language with a distinctive shape (Python, SQL), then
      paste plain prose: the code is coloured in the composer and the prose is
      not. That the right language is detected, and that the colours are in the
      markup at all, is `tests/node/code-block.test.js`. That they survive into
      a message body and read as code is this.

## Options

- [ ] Open the options pane from the Add-ons Manager; it is embedded, not a tab.
- [ ] Change the theme; a newly inserted block uses it. The theme is read out of
      the stylesheet through Thunderbird's own CSS parser, which is the one
      thing a simulated document is least faithful about - see the comment at
      the top of `src/popup/theme-map.js`.
- [ ] Settings survive a Thunderbird restart.

## Packaging

- [ ] Install `dist/thundercode-<version>.xpi` from file into a clean profile
      and repeat one insertion - this is the path users take, and it is not the
      path a temporary install exercises.
- [ ] The Add-ons Manager shows the ThunderCode icon, not a puzzle piece.

## After publishing

The one section here that is not about Thunderbird, said out loud rather than
filed as though it were. These are claims about GitHub and about this repo's
own release workflow, and the reason they survive the split is not that a test
could not make them - it is that there is nothing to make them against until
the workflow has run and published something. A person looking at the release
that just went out is the only thing that can see them.

- [ ] The published release is **not** a draft and **not** a prerelease. The
      workflow sets both false, so this is a check that nobody edited the
      release afterwards: `releases/latest` skips both, and either one leaves
      every installed copy pointed at the previous version while the archive
      sits there looking published.
- [ ] `main` holds the released version, in a `Release <version>` commit
      pushed by the workflow, and the tag names that commit. If `main` still
      holds the previous version, the release was published from a commit that
      never reached it and the next release will refuse to start.
- [ ] <https://github.com/sitepark/thundercode/releases/latest/download/updates.json>
      returns the new version. What that URL *says* is pinned by
      `tests/node/updates.test.js`, and that the file builds at all is checked
      on every push by the test workflow; what neither can see is whether the
      release carries it. That URL is baked into every installed copy, so a
      release published without the asset leaves all of them polling a 404 and
      never hearing about the update.

## Updating an installed copy

Thunderbird's half of an update - the daily check, the download and the
install - against a real one. Only meaningful once a previous release exists.

- [ ] Set `extensions.logging.enabled` to `true` in the config editor first;
      update failures are otherwise completely silent.
- [ ] With the previous version installed, force a check from the Add-ons
      Manager gear menu and confirm it upgrades to the new one.
