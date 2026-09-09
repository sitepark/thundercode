import { defineConfig } from "vitest/config";

// Why the tiers are directories rather than per-file environment pragmas, and
// why coverage is never gated: docs/adr/0001-three-test-tiers.md.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",

          // Stated rather than left to the default. The seam must stay pure,
          // and a runner with no DOM is what makes reaching for one fail
          // loudly instead of quietly working in tests and nowhere else.
          environment: "node",

          // This tier is the default one, so it claims every test that has not
          // been filed under a tier of its own. A file dropped straight into
          // `tests/` therefore runs without a document rather than silently
          // not running at all, and the only way to get a DOM is to ask for
          // one by putting the test where the DOM lives.
          //
          // Naming `tests/` at all is the other half of this line: vitest's
          // default glob is the entire tree, which in a checkout that has
          // agent worktrees under `.claude/` means running dozens of stale
          // copies of this suite and reporting their failures as this one's.
          include: ["tests/**/*.test.js"],
          exclude: ["tests/dom/**", "tests/thunderbird/**"],
        },
      },
      {
        test: {
          name: "dom",

          // For the modules that need a document to do anything but do not
          // need Thunderbird. jsdom rather than the alternatives on ecosystem
          // grounds, not capability ones: they are equivalent on the thing
          // that matters here, since both implement Range and Selection well
          // enough to drive caret insertion and neither implements the editor
          // command at all.
          environment: "jsdom",
          include: ["tests/dom/**/*.test.js"],
        },
      },
      {
        test: {
          name: "thunderbird",

          // A real Thunderbird, fetched and driven headless. No DOM from the
          // runner: the document this tier works with is the one inside the
          // application, reached over WebDriver, and a jsdom sitting in the
          // test process would only be something to confuse it with.
          environment: "node",
          include: ["tests/thunderbird/**/*.test.js"],

          // Kept out of `pnpm test`, which names its projects. Not because it
          // would fail on a machine with no Thunderbird - it fetches its own,
          // so it passes from a clean checkout - but because the default run
          // must not need the network, 90 MiB of disk or two minutes, and
          // because an unsupported harness should never be the reason a
          // change cannot be tested. `pnpm test:thunderbird` runs it.

          // One Thunderbird at a time. Two files starting one each would race
          // over the download on a cold cache and then compete for the same
          // driver port, and the failure would look like the harness rather
          // than like the arrangement.
          fileParallelism: false,

          // Minutes, not seconds, and the two differ for a reason: the hook is
          // where a cold cache downloads Thunderbird and geckodriver, while a
          // test only drives an application that is already up. A test that
          // takes a minute is a hung window, not a slow one.
          hookTimeout: 600_000,
          testTimeout: 120_000,
        },
      },
    ],

    coverage: {
      // Reported, never gated. There is no `thresholds` key here and there is
      // not meant to be one: this project leaves whole modules uncovered on
      // purpose, so a number set here would be one somebody tunes down until
      // it means nothing. What the report is for is narrower - seeing whether
      // logic pulled out of a large module came with it or was copied.
      // `skipFull` is spelled out because vitest turns it on by itself when it
      // thinks an agent is reading the output, and a fully covered file is
      // exactly the row this report exists to show: a module that took the
      // logic reads 100%, and hiding it leaves nothing to look at.
      reporter: [["text", { skipFull: false }], "html"],

      // This project's own code, the release scripts included: the node tier
      // covers those, and they are the two files whose output every installed
      // copy compares itself against.
      include: ["src/**/*.js", "scripts/**/*.mjs"],

      // The vendored highlight.js is a third party's code at a pinned
      // revision, and the seam's tests import it directly, so it would
      // otherwise turn up in the report and bury this project's own numbers
      // under several hundred files nobody here is going to write a test for.
      // The include above already leaves it out; this says so out loud, so
      // that widening that line one day does not quietly drag it back in.
      exclude: ["vendor/**"],
    },
  },
});
