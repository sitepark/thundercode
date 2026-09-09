# Three test tiers, split by directory, with coverage never gated

## Status

Accepted.

## Context

The suite began as one run with no DOM, and that was a decision rather than a
default: the code-block pipeline must stay pure, so a test that reaches for a
document should fail loudly instead of quietly working in tests and nowhere
else. The constraint held. It also meant that four modules - the background,
the compose-sandbox insertion function, the popup and the options page - could
not be tested at all, because the only way to reach any of them is through a
document. Three of those four are where the add-on's observable behaviour
actually lives, and the release checklist was covering all of it by hand.

So the constraint was global when it only needed to be local. It protected one
module at the cost of four.

## Decision

Three tiers, declared as named runner projects in `vitest.config.js`.

**`node`** - no DOM. The pure pipeline, the settings coercion, the snippet
measurement, and the static files: the manifest, the update manifest, the
stylesheets, the version arithmetic. Lives in `tests/node/`, and also claims
any test file dropped straight into `tests/` that no other tier has taken, so
the strict tier is what an unfiled test gets.

**`dom`** - a simulated document, for modules that need one to do anything but
do not need Thunderbird. Lives in `tests/dom/`. jsdom, chosen on ecosystem
grounds rather than capability: the candidates are equivalent on the thing that
matters here, since both implement Range and Selection well enough to drive
caret insertion and neither implements the editor command at all.

**`thunderbird`** - a real Thunderbird, driven headless over WebDriver, in
`tests/thunderbird/`. It is the only tier that can exercise the editor command
path that actually runs in production, and the only one that can retire a
checklist item honestly. It is kept out of the default test command so the
suite stays green on a machine with no Thunderbird installed, and it is run
locally while working the checklist rather than in CI.

`pnpm test` runs `node` and `dom`. `pnpm test:node` runs the strict tier alone,
because the cost of running tests while editing should never be the reason not
to run them.

Which tier a test belongs in is answered by where it can be written: no
document, a simulated one, or a real Thunderbird. Nothing else.

## Considered options

**One DOM environment for everything.** Rejected. It costs exactly the property
that has kept the pipeline pure. Nothing would ever have reported that the
pipeline had started reading a document, because in the suite there would
always have been one.

**Per-file environment pragmas.** Rejected, and this is the closer call, so it
is the one worth recording. The original constraint was never "no DOM
anywhere"; it was "reaching for a DOM should fail loudly". A pragma at the top
of a pipeline test satisfies the letter of the configuration while losing
precisely that: the test still passes, the file still looks ordinary, and the
line that gave the pipeline a document is one line in a header nobody reads
twice. Putting the boundary in the directory layout means asking for a document
is moving a file, which is visible in a diff and visible in a listing, and
means the tier a test runs in is a fact about the repository rather than a fact
about that file's first line.

## Coverage

Reported, never gated. There is no threshold configured and there is not meant
to be one.

The report's value here is narrow and real: after logic is pulled out of a
large module, it is the cheapest way to see whether the new module took that
logic or only holds a copy of it. What it is not is a summary of how well this
project is tested, because this project leaves whole modules uncovered on
purpose - the theme reduction because a simulated CSS object model is least
faithful exactly where that module's claim lives, and everything the third tier
covers because CI does not run it. A threshold over a codebase like that is a
number somebody tunes down until it agrees with whatever the last commit did,
and a number that always agrees is not a check.

The vendored highlight.js is excluded. It is a third party's code at a pinned
revision, and the pipeline's tests import it directly, so it would otherwise
bury this project's own numbers under several hundred files nobody here is
going to write a test for.

## Consequences

The third tier is undocumented and unsupported by Thunderbird. WebDriver
accepting the Thunderbird binary, switching into a privileged context and
temp-installing an unsigned checkout is all behaviour nobody has promised to
keep working, and a Thunderbird update may break it with no warning and no
recourse. That breakage is a cost this project owns and accepts: it is one
afternoon when it happens, against a harness that can block nothing because it
runs in no pipeline. It was verified end to end before being committed to, and
it is worth the exposure because it is the only place the production insertion
path can be exercised at all.

The checklist keeps every item that is a claim about Thunderbird rather than
about this project's own logic - the button on a dark appearance, the icon
rather than a puzzle piece, where cloud attachment links land, the absence of
spell-check underlines, installing the built archive into a clean profile. None
of those should ever be retired because a fake agreed with them.
