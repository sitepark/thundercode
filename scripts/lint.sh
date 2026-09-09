#!/usr/bin/env bash
#
# Builds the archive and lints it: pnpm run lint
#
# The linter is addons-linter, the engine behind `web-ext lint` and the same
# one Mozilla runs on submissions. Thunderbird has no linter of its own, so
# this is as close as an add-on here can get to a machine-checked review.
#
# It lints the built .xpi rather than the working tree. web-ext's --source-dir
# mode would need its own ignore list, which is scripts/package.sh's exclusion
# list written a second time and drifting from it; running the archive instead
# checks the bytes that actually ship, tests and docs already absent.

set -euo pipefail

cd "$(dirname "$0")/.."

xpi="$(bash scripts/package.sh)"
echo "Linting $xpi" >&2

# --self-hosted turns off the checks that only apply to add-ons distributed
# through addons.mozilla.org. Without it the manifest's `update_url` is a hard
# error ("not allowed for Mozilla-hosted add-ons") - but self-serving updates
# is precisely why this add-on is not listed. See "Installing" in README.md.
#
# Warnings are not failures, and cannot be: addons-linter knows Firefox, so
# every MailExtension point this add-on exists to use - the `compose`
# permission, `compose.{get,set}ComposeDetails`, `composeAction.openPopup` -
# reads to it as an unsupported API. Making warnings fatal would mean silencing
# them one by one and losing the ones worth reading. Read the list; it should
# stay short.
exec pnpm exec addons-linter --self-hosted "$xpi"
