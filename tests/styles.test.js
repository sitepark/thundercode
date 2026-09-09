import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The extension's two visible surfaces both rendered light inside a dark
 * Thunderbird, and neither JavaScript test nor a running suite could have
 * noticed: nothing was thrown, nothing was wrong with the markup, and the only
 * symptom was a white rectangle in a dark window. So the rule that fixes it is
 * pinned here as a property of the stylesheets themselves.
 *
 * The rule has two halves, and the second is the one that rots. Declaring
 * `color-scheme` is a single line nobody deletes; remembering that every
 * colour written after it needs a second value is a habit, and the day someone
 * adds `color: #333` to a hint the page is half-broken again on one appearance
 * only.
 */
const themedStylesheets = ["src/popup/popup.css", "src/options/options.css"];

describe.each(themedStylesheets)("%s", (path) => {
  const css = readFileSync(resolve(repoRoot, path), "utf8");

  it("accepts both of Thunderbird's appearances", () => {
    expect(css).toMatch(/:root\s*\{[^}]*color-scheme:\s*light dark/);
  });

  /**
   * `color-scheme` alone only rescues what the platform paints - the canvas,
   * the form controls, the scrollbars. A colour stated in the file is stated
   * against one background, so it has to be stated against both.
   *
   * Backgrounds are deliberately not covered: the popup's preview states one
   * flat `#ffffff` on purpose, because it is showing the block on the white
   * message body it will arrive on rather than on the popup, and it declares
   * its own `color-scheme: light` to say so.
   */
  it("states every text colour for both of them", () => {
    const colours = css.match(/(?<![\w-])color:\s*[^;}]+/g) ?? [];

    expect(colours.length).toBeGreaterThan(0);
    for (const declaration of colours) {
      expect(declaration).toContain("light-dark(");
    }
  });
});
