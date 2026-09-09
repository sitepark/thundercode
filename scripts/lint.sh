#!/usr/bin/env bash
#
# Builds the archive and lints it: pnpm run lint
#
# The linter is Thunderbird's own webext-linter. It matches every `browser.*`
# call against Thunderbird's annotated API schemas and applies the
# addons.thunderbird.net review policies.
#
# It replaced addons-linter, which is Mozilla's and knows Firefox. To that one
# the `compose` permission and every compose, composeAction, menus and
# scripting call read as an unsupported API, so its warning list was this
# add-on's entire reason for existing and could never be made fatal. This one
# recognises all of it, which is what makes an exit code worth failing a build
# on.
#
# Exit codes are the linter's own: 0 = no error-severity findings, 1 = one or
# more, 2 = the tool itself failed. Info-severity findings are printed and do
# not fail. Read them anyway; there are few and they are all real.
#
# It lints the built .xpi rather than the working tree, unchanged from before:
# a source-folder run would need its own ignore list, which is
# scripts/package.sh's exclusion list written a second time and drifting from
# it, while the archive is the bytes that actually ship.

set -euo pipefail

cd "$(dirname "$0")/.."

# Pinned to a commit, not a tag, because upstream has none: `git tag` and the
# releases list on the repository are both empty, and the project versions by
# commit message and package.json instead. This is the commit whose
# package.json reads 1.9.0. It is not on npm either - the @thunderbirdops
# scope exists but this package is not in it yet - which is why the tool is
# fetched here at all. The day it publishes, everything below collapses into
# an ordinary devDependency and a version range.
linter_repo="thunderbird/webext-linter"
linter_commit="fb6bc3f387d99d693a9c15dd618b29de3dd2289d"

# Both are gitignored and excluded from the archive. The caches sit outside the
# tool directory so that bumping the pin above does not throw the fetched
# schemas away with it, and so CI can cache the expensive one without the one
# that is immutable anyway.
linter_dir=".webext-linter"
cache_dir=".webext-linter-cache"

# The stamp is written last on purpose: an interrupted fetch then refetches
# rather than leaving a half-installed tool that looks present.
stamp="$linter_dir/.pinned-commit"
if [ "$(cat "$stamp" 2>/dev/null || true)" != "$linter_commit" ]; then
  echo "Fetching $linter_repo@${linter_commit:0:12}" >&2
  rm -rf "$linter_dir"
  mkdir -p "$linter_dir"

  # A codeload tarball rather than a clone: `git clone --depth 1` cannot be
  # given a commit, and a full clone to reach one is the entire history for a
  # single tree.
  curl --fail --silent --show-error --location \
    "https://codeload.github.com/$linter_repo/tar.gz/$linter_commit" |
    tar --extract --gzip --strip-components=1 --directory "$linter_dir"

  # pnpm is this repo's package manager and this is not this repo's dependency
  # tree. The linter has sixteen runtime dependencies and ships its own
  # package-lock.json, so it bootstraps with its own npm inside this ignored
  # directory; nothing here reaches pnpm-lock.yaml or node_modules/. --omit=dev
  # skips its prettier, which only its own contributors need.
  (cd "$linter_dir" && npm ci --omit=dev --no-audit --no-fund >&2)

  echo "$linter_commit" >"$stamp"
fi

xpi="$(bash scripts/package.sh)"
echo "Linting $xpi" >&2

# --checks-skip carries the two findings this add-on answers for deliberately,
# and nothing else is suppressed. The list is meant to stay this short.
#
# update-url is the direct replacement for addons-linter's --self-hosted. The
# check is right that an add-on serving its own updates cannot be listed on
# ATN, and staying off ATN is precisely why this one serves its own updates.
# See "Installing" in README.md.
#
# unused-files is an upstream bug rather than a finding. The check exempts
# licence and readme files, but it decides whether a file is documentation from
# the last dot in the whole path instead of in the file name, so for
# `vendor/highlight.js/LICENSE` it reads the extension as `.js/license`, misses
# the exemption and reports the vendored BSD-3-Clause notice as dead weight.
# That notice has to ship and the directory is named after the library, so
# there is nothing here to fix. The cost is real: this check is what found
# cliff.toml sitting unreferenced in the archive, so scripts/package.sh's
# exclusion list is once again the only thing keeping the archive clean.
#
# --cdn-lib-lookup false turns off identifying an unrecognised bundled library
# by content-hash lookup against jsDelivr and friends. The only bundled library
# here is the vendored highlight.js, which is hand-modified (see
# vendor/highlight.js/PROVENANCE.md), so a content hash cannot match it by
# construction. Checked both ways: with the lookup on, four third-party hosts
# are asked and nothing is found. Off, the run learns the same thing without
# depending on them being up.
#
# The cache directories are named rather than left to default because the
# default is relative to the working directory, and CI caches a fixed path.
exec node "$linter_dir/verify.js" "$xpi" \
  --cache-schema-dir "$cache_dir/schema" \
  --cache-hash-db-dir "$cache_dir/lib-hash-db" \
  --cache-experiments-dir "$cache_dir/experiments" \
  --cdn-lib-lookup false \
  --checks-skip update-url,unused-files
