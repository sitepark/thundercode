import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { CODE_BLOCK_DEFAULTS } from "../src/code-block/build-code-block-html.js";
import { SETTING_FIELDS, coerceSettings } from "../src/settings/settings.js";

/**
 * The options page is verified by hand, like the popup — the runner has no DOM
 * and is meant not to. What is testable, and is the whole of the ticket's
 * "invalid or empty values fall back to the defaults rather than producing a
 * broken block", is the coercion between storage and the seam. It is a pure
 * function precisely so that this file can exist.
 *
 * `storage.local` itself is not exercised anywhere here. There is no storage in
 * Node, and a mock of it would only assert that this file's mock works.
 *
 * The expected numbers are read from `CODE_BLOCK_DEFAULTS` and `SETTING_FIELDS`
 * rather than written out, so that retuning a default stays a one-line change
 * instead of a red suite. What the literals below would pin is not behaviour.
 */
describe("coerceSettings", () => {
  it("falls back to the block's own defaults when nothing has been set", () => {
    expect(coerceSettings({})).toEqual({
      tabWidth: CODE_BLOCK_DEFAULTS.tabWidth,
      fontSize: CODE_BLOCK_DEFAULTS.fontSize,
    });
  });

  /**
   * `storage.local.get` on a fresh profile resolves to `{}`, but a caller with
   * nothing at all to offer should get the same answer rather than a crash.
   */
  it("survives being handed nothing at all", () => {
    expect(coerceSettings()).toEqual(coerceSettings({}));
    expect(coerceSettings(undefined)).toEqual(coerceSettings({}));
  });

  it("keeps values that are in range", () => {
    expect(coerceSettings({ tabWidth: 2, fontSize: 16 })).toEqual({
      tabWidth: 2,
      fontSize: 16,
    });
  });

  /**
   * A number field's `.value` is a string, and the options page hands it over
   * unparsed on purpose: parsing in two places is two places for the rules to
   * differ.
   */
  it("accepts the strings a number field actually produces", () => {
    expect(coerceSettings({ tabWidth: "8", fontSize: "11" })).toEqual({
      tabWidth: 8,
      fontSize: 11,
    });
  });

  /**
   * The ticket's own wording. An empty field is the common case — it is what
   * clearing a value to retype it looks like at every keystroke in between —
   * and it must mean "the default", never "zero".
   */
  it("treats an empty or blank field as unset", () => {
    expect(coerceSettings({ tabWidth: "", fontSize: "  " })).toEqual({
      tabWidth: CODE_BLOCK_DEFAULTS.tabWidth,
      fontSize: CODE_BLOCK_DEFAULTS.fontSize,
    });
  });

  it("rejects anything that is not a number", () => {
    for (const value of ["abc", "4px", null, {}, [], true, Number.NaN]) {
      expect(coerceSettings({ tabWidth: value }).tabWidth, String(value)).toBe(
        CODE_BLOCK_DEFAULTS.tabWidth,
      );
    }
  });

  /**
   * Zero and negatives are the two that would actually break the block rather
   * than merely look odd: the seam expands a tab by repeating a space that many
   * times, and a negative count throws.
   */
  it("rejects zero and negative values", () => {
    expect(coerceSettings({ tabWidth: 0 }).tabWidth).toBe(
      CODE_BLOCK_DEFAULTS.tabWidth,
    );
    expect(coerceSettings({ tabWidth: -4 }).tabWidth).toBe(
      CODE_BLOCK_DEFAULTS.tabWidth,
    );
    expect(coerceSettings({ fontSize: 0 }).fontSize).toBe(
      CODE_BLOCK_DEFAULTS.fontSize,
    );
  });

  it("rejects fractions, since neither setting has a meaningful half", () => {
    expect(coerceSettings({ fontSize: 13.5 }).fontSize).toBe(
      CODE_BLOCK_DEFAULTS.fontSize,
    );
  });

  /**
   * Out of range goes back to the default rather than being clamped, so the
   * field never shows a third number the user did not type. A tab width of a
   * few hundred is the interesting one: it does not throw, it produces a
   * screenful of indentation and no visible code.
   */
  it("defaults rather than clamps when a value is out of range", () => {
    for (const [name, { min, max, fallback }] of Object.entries(
      SETTING_FIELDS,
    )) {
      expect(coerceSettings({ [name]: min - 1 })[name], name).toBe(fallback);
      expect(coerceSettings({ [name]: max + 1 })[name], name).toBe(fallback);
      expect(coerceSettings({ [name]: min })[name], name).toBe(min);
      expect(coerceSettings({ [name]: max })[name], name).toBe(max);
    }
  });

  it("resolves each setting on its own, so one bad value costs one", () => {
    expect(coerceSettings({ tabWidth: "nonsense", fontSize: 16 })).toEqual({
      tabWidth: CODE_BLOCK_DEFAULTS.tabWidth,
      fontSize: 16,
    });
  });

  it("always answers with both settings as usable numbers", () => {
    for (const stored of [{}, { tabWidth: "" }, { fontSize: "x" }]) {
      const settings = coerceSettings(stored);

      expect(Object.keys(settings).sort()).toEqual(["fontSize", "tabWidth"]);
      for (const value of Object.values(settings)) {
        expect(Number.isInteger(value) && value > 0).toBe(true);
      }
    }
  });

  /**
   * The defaults are the seam's, imported rather than restated. Two copies of
   * a default is the failure this guards: the options page would show one
   * number and the inserted block would use the other, and only a screenshot
   * comparison would ever catch it.
   */
  it("takes its fallbacks from the seam rather than keeping its own", () => {
    expect(SETTING_FIELDS.tabWidth.fallback).toBe(CODE_BLOCK_DEFAULTS.tabWidth);
    expect(SETTING_FIELDS.fontSize.fallback).toBe(CODE_BLOCK_DEFAULTS.fontSize);
  });
});

/**
 * A source-level check, because the choice it pins has no runtime here: Node
 * has no `browser.storage` to observe, and by the time it could be observed the
 * add-on is installed. The spec rules out `storage.sync` outright, so the cheap
 * guard against someone "fixing" settings to follow the profile around is to
 * assert the string never appears.
 */
describe("the settings store", () => {
  const source = readFileSync(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../src/settings/settings.js",
    ),
    "utf8",
  );

  it("is storage.local and never storage.sync", () => {
    // The qualified name, so that prose about the decision does not count as a
    // use of it. A real call site can only be written `browser.storage.<area>`.
    expect(source).toContain("browser.storage.local");
    expect(source).not.toMatch(/browser\.storage\.sync/);
  });
});
