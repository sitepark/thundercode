import { describe, expect, it } from "vitest";

import {
  LARGE_SNIPPET_LINES,
  measureSnippet,
} from "../src/popup/snippet-size.js";

const lines = (count) => Array.from({ length: count }, (_, i) => `${i}`);

/**
 * The popup itself is verified by hand — the runner has no DOM, deliberately.
 * What is worth pinning is the one decision inside it that is arithmetic rather
 * than presentation: how many lines were pasted, and whether that is over the
 * line. The off-by-one around a trailing newline is the reason this is a
 * separate function at all.
 *
 * These tests avoid the literal 500 wherever they can, because the threshold is
 * explicitly approximate. Moving it is a tuning decision, not a behaviour
 * change, and should not turn the suite red.
 */
describe("measureSnippet", () => {
  it("counts an empty textarea as no lines at all", () => {
    expect(measureSnippet("")).toEqual({ lineCount: 0, isLarge: false });
  });

  it("counts a single line with no trailing newline", () => {
    expect(measureSnippet("print(1)").lineCount).toBe(1);
  });

  it("does not let a trailing newline invent an extra line", () => {
    expect(measureSnippet("a\nb\nc").lineCount).toBe(3);
    expect(measureSnippet("a\nb\nc\n").lineCount).toBe(3);
  });

  it("counts blank lines, which still cost message weight", () => {
    expect(measureSnippet("\n\n\n").lineCount).toBe(3);
  });

  it("says nothing about a snippet at or below the threshold", () => {
    const atThreshold = lines(LARGE_SNIPPET_LINES).join("\n");

    expect(measureSnippet(atThreshold)).toEqual({
      lineCount: LARGE_SNIPPET_LINES,
      isLarge: false,
    });
  });

  it("warns once past the threshold", () => {
    const overThreshold = lines(LARGE_SNIPPET_LINES + 1).join("\n");

    expect(measureSnippet(overThreshold)).toEqual({
      lineCount: LARGE_SNIPPET_LINES + 1,
      isLarge: true,
    });
  });

  /**
   * No hard cap at any size: the warning is the whole of the response to a
   * large paste, and it does not escalate. Three thousand lines reports the
   * same `isLarge` as five hundred and one.
   */
  it("keeps saying the same thing however large the paste gets", () => {
    const enormous = lines(LARGE_SNIPPET_LINES * 20).join("\n");

    expect(measureSnippet(enormous).isLarge).toBe(true);
  });

  it("is roughly five hundred lines, in one place", () => {
    expect(LARGE_SNIPPET_LINES).toBe(500);
  });
});
