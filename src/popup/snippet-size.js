/**
 * Where "very large" starts, in lines.
 *
 * Roughly five hundred, and the "roughly" is the honest part: there is no size
 * at which a snippet becomes wrong to send, so this number does not mark a
 * boundary between right and wrong. It only has to land somewhere in the region
 * where a paste stops reading as a snippet and starts reading as a file. 400 or
 * 800 would do the same job; nothing was measured to arrive at 500, and nothing
 * downstream depends on it.
 *
 * Lines rather than bytes or characters. Bytes would describe the message
 * weight more accurately, but the warning exists to be acted on, and lines are
 * the unit the user can check against what they just pasted.
 */
export const LARGE_SNIPPET_LINES = 500;

/**
 * How many lines the pasted source has, and whether that is enough to warn
 * about.
 *
 * Pure and DOM-free so the threshold decision can be driven from a Node test —
 * the popup around it cannot be, since the runner has no DOM. The wording of
 * the warning is deliberately *not* here: pinning a sentence in a test makes
 * rephrasing it a test failure, and the sentence is the part of this most
 * likely to be reworded.
 *
 * @param {string} source
 * @returns {{ lineCount: number, isLarge: boolean }}
 */
export function measureSnippet(source) {
  const lineCount = countLines(source);
  // Strictly greater: at exactly the threshold there is nothing to say yet.
  return { lineCount, isLarge: lineCount > LARGE_SNIPPET_LINES };
}

function countLines(source) {
  // Empty is zero lines, not one. An untouched textarea has not got "a line" in
  // it, and reporting 1 would read as a miscount to anyone who checked.
  if (source === "") {
    return 0;
  }
  // A trailing newline terminates the last line rather than starting another,
  // which is how editors count and how a paste will have been produced. Without
  // this, copying 501 lines out of an editor reports 502 — close enough not to
  // matter to the warning, but wrong in a way that invites a bug report.
  const body = source.endsWith("\n") ? source.slice(0, -1) : source;
  return body.split("\n").length;
}
