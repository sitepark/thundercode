# ThunderCode

A Thunderbird MailExtension that inserts syntax-highlighted code blocks into
HTML messages.

Requires **Thunderbird 128 or newer**. Manifest V3 MailExtensions do not load on
older versions — they cannot be installed at all, temporarily or otherwise.

## Building the archive

```sh
pnpm install          # dev dependencies only; nothing shipped needs them
pnpm run package
```

This writes `dist/thundercode-<version>.xpi`, taking the version from
`manifest.json`. There is no build step — the archive is the repo directory
zipped, minus tests, docs and tooling.

## Installing

Thunderbird does not sign add-ons, so the archive installs directly. There is no
add-ons-site listing.

1. **Tools ▸ Add-ons and Themes**
2. Gear icon ▸ **Install Add-on From File…**
3. Pick `dist/thundercode-<version>.xpi`

The add-on survives restarts. Open a compose window and the button appears in
the format toolbar.

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

Run the tests with `pnpm test`. They cover the manifest and the HTML builder;
everything that needs a running compose window is checked by hand.

## Where the console output goes

**Tools ▸ Developer Tools ▸ Error Console** (`Ctrl+Shift+J`) collects logging
from the background and from compose scripts — this is where `ThunderCode:`
lines show up. Compose-script entries are printed twice; that is a known
Thunderbird logging quirk, not a duplicated action.

The popup has a separate console: use **Inspect** next to the add-on on the
debugging page. Note that the popup closes on insert and takes its console with
it, which is why insertion logs from the compose script instead.
