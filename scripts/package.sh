#!/usr/bin/env bash
#
# Builds the installable archive: dist/thundercode-<manifest version>.xpi
#
# There is no build step. Thunderbird does not sign add-ons and the project has
# no bundler, so "packaging" is literally the repo directory zipped under an
# .xpi name — the files that ship are the files you edit.
#
# This is a script rather than a one-liner in package.json only because the
# exclusion list below needs its reasons written next to it, and JSON has
# nowhere to put them.

set -euo pipefail

# Run from the repo root whatever the caller's cwd is: every path below, and
# zip's own idea of the archive root, depends on it.
cd "$(dirname "$0")/.."

# The manifest is the single source of truth for the version. package.json has
# its own, unrelated one (the extension is not an npm package), so reading it
# from there would eventually ship an archive labelled with the wrong version.
version="$(node -p "require('./manifest.json').version")"
out="dist/thundercode-${version}.xpi"

mkdir -p dist

# zip *adds to* an existing archive instead of replacing it, so a file deleted
# from the repo would quietly live on in the previous build. Start from nothing.
rm -f "$out"

# Exclusions, deliberately never an allowlist. Everything in the working tree
# ships unless it is named here, so a new module under src/, a vendored
# highlight.js, an options page or a second icon lands in the archive without
# anyone remembering this file exists. The failure mode of an allowlist is a
# silently incomplete add-on; the failure mode of this list is at worst a few
# stray kilobytes.
exclusions=(
  # Dev dependencies. Nothing the extension loads at runtime imports them.
  'node_modules/*'
  'pnpm-lock.yaml'
  'package.json'
  # The test suite and its runner config are dev-only.
  'tests/*'
  'vitest.config.js'
  # This script and anything else that builds rather than ships.
  'scripts/*'
  # Its own output, and any archive left at the root by an earlier convention.
  'dist/*'
  '*.xpi'
  # Issue tracker, specs and repo documentation. `.git` is matched both as a
  # directory (main checkout) and as a plain file (git worktrees).
  '.scratch/*'
  'docs/*'
  '.git'
  '.git/*'
  '.gitignore'
  '.gitattributes'
  # Agent tooling. `.claude/worktrees/` holds entire checkouts of this repo, so
  # including it by accident would recurse the whole tree into the archive.
  '.claude/*'
  'CLAUDE.md'
  'AGENTS.md'
  # Editor and OS cruft.
  '.DS_Store'
  '*/.DS_Store'
  '.vscode/*'
  '.idea/*'
  '*.swp'
  '*~'
)

# --recurse-paths over `.` puts manifest.json at the archive root, which is what
# Thunderbird requires — an archive containing a single top-level folder is not
# an add-on, it is a zip of one. --no-dir-entries keeps directory records out;
# they carry local permissions and nothing needs them.
zip --recurse-paths --no-dir-entries --quiet "$out" . --exclude "${exclusions[@]}"

echo "$out"
