import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CODE_BLOCK_DEFAULTS } from "../../src/code-block/build-code-block-html.js";
import {
  SETTING_FIELDS,
  coerceSettings,
  readSettings,
  writeSettings,
} from "../../src/settings/settings.js";
import { installBrowserFake } from "../helpers/browser-fake.js";

/**
 * The options page is verified by hand, like the popup - this tier has no DOM
 * and is meant not to. What is testable, and is the whole of the ticket's
 * "invalid or empty values fall back to the defaults rather than producing a
 * broken block", is the coercion between storage and the seam. It is a pure
 * function precisely so that this file can exist.
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
   * The ticket's own wording. An empty field is the common case - it is what
   * clearing a value to retype it looks like at every keystroke in between -
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
   * times, and a negative count throws. They are still numbers, so they clamp
   * to the minimum like anything else below the range - what matters is that
   * neither reaches the seam.
   */
  it("clamps zero and negative values up to the minimum", () => {
    expect(coerceSettings({ tabWidth: 0 }).tabWidth).toBe(
      SETTING_FIELDS.tabWidth.min,
    );
    expect(coerceSettings({ tabWidth: -4 }).tabWidth).toBe(
      SETTING_FIELDS.tabWidth.min,
    );
    expect(coerceSettings({ fontSize: 0 }).fontSize).toBe(
      SETTING_FIELDS.fontSize.min,
    );
  });

  it("rejects fractions, since neither setting has a meaningful half", () => {
    expect(coerceSettings({ fontSize: 13.5 }).fontSize).toBe(
      CODE_BLOCK_DEFAULTS.fontSize,
    );
  });

  /**
   * Out of range is corrected to the nearest bound rather than sent back to
   * the default, so a request the extension cannot grant is answered with the
   * closest thing it can rather than with an unrelated number. A tab width of
   * a few hundred is the interesting one: it does not throw, it produces a
   * screenful of indentation and no visible code, and 16 is what the user
   * plainly meant by it.
   */
  it("clamps to the nearest bound when a value is out of range", () => {
    for (const [name, { min, max }] of Object.entries(SETTING_FIELDS)) {
      expect(coerceSettings({ [name]: min - 1 })[name], name).toBe(min);
      expect(coerceSettings({ [name]: max + 1 })[name], name).toBe(max);
      expect(coerceSettings({ [name]: 1000 })[name], name).toBe(max);
      expect(coerceSettings({ [name]: min })[name], name).toBe(min);
      expect(coerceSettings({ [name]: max })[name], name).toBe(max);
    }
  });

  /**
   * The line between the two rules, and the reason there are two: a number out
   * of range is a request to honour as closely as possible, while text that is
   * not a number at all names nothing to be close to.
   */
  it("still defaults, rather than clamping, for what is not a number", () => {
    expect(coerceSettings({ tabWidth: "4px" }).tabWidth).toBe(
      CODE_BLOCK_DEFAULTS.tabWidth,
    );
    expect(coerceSettings({ tabWidth: "" }).tabWidth).toBe(
      CODE_BLOCK_DEFAULTS.tabWidth,
    );
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
 * `browser` is a global, not a DOM, so the read and the write are reachable
 * from here after all - which is what makes these assertions about behaviour
 * rather than about the text of the module. An earlier version of this file
 * read its own source and asserted that the string `browser.storage.local`
 * appeared in it; that passes for a mention in a comment and for a call in
 * code nothing reaches, and it pinned nothing.
 *
 * The stub is deliberately thin. It is not a model of `storage.local` - there
 * is no store behind it, and asserting on a store would only be asserting that
 * this file's stub works. What it records is which area was called, with what,
 * and what the caller did with the answer, and each of those is a decision the
 * module actually makes.
 *
 * The stub these tests used to write by hand is now
 * tests/helpers/browser-fake.js, which generalises it: `storage.sync` is still
 * present and still throws, and so does everything else this module has not
 * been given, so a settings module that started calling a second API would
 * fail here rather than quietly work.
 */
describe("the settings store", () => {
  let fake;

  beforeEach(() => {
    fake = installBrowserFake({
      storage: {
        local: {
          get: async () => ({ tabWidth: 8, fontSize: 11 }),
          set: async () => {},
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads both settings out of storage.local", async () => {
    expect(await readSettings()).toEqual({ tabWidth: 8, fontSize: 11 });
    expect(fake.calls("storage.local.get")).toEqual([
      [["tabWidth", "fontSize"]],
    ]);
  });

  /**
   * Storage can hold anything a previous version or a hand-edited profile put
   * there, so what comes back out is coerced rather than trusted.
   */
  it("coerces what storage hands back", async () => {
    browser.storage.local.get = async () => ({ tabWidth: 99, fontSize: "x" });

    expect(await readSettings()).toEqual({
      tabWidth: SETTING_FIELDS.tabWidth.max,
      fontSize: CODE_BLOCK_DEFAULTS.fontSize,
    });
  });

  /**
   * A settings read failing is not a reason to refuse to insert code, so the
   * popup gets working numbers and the console gets the reason.
   */
  it("falls back to the defaults when the read fails", async () => {
    browser.storage.local.get = async () => {
      throw new Error("profile is on fire");
    };

    expect(await readSettings()).toEqual(coerceSettings());
  });

  /**
   * Coerced on the way in as well as on the way out, so the store never holds
   * a value the block would not use - and the caller is told what was stored,
   * which is what lets the options page show the correction.
   */
  it("writes coerced values and reports back what was stored", async () => {
    const stored = await writeSettings({ tabWidth: "2", fontSize: 400 });

    expect(stored).toEqual({
      tabWidth: 2,
      fontSize: SETTING_FIELDS.fontSize.max,
    });
    expect(fake.calls("storage.local.set")).toEqual([[stored]]);
  });

  /**
   * Unlike the read, this one throws: a settings page that says "Saved." when
   * nothing was saved is worse than one that shows the failure.
   */
  it("lets a failed write reach the options page", async () => {
    browser.storage.local.set = async () => {
      throw new Error("disk full");
    };

    await expect(writeSettings({ tabWidth: 2 })).rejects.toThrow("disk full");
  });
});
