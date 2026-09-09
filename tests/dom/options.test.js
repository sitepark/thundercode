import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { SETTING_FIELDS } from "../../src/settings/settings.js";
import { installBrowserFake } from "../helpers/browser-fake.js";

/**
 * The options page's correction notice.
 *
 * The page has no exported entry point and is not getting one: four
 * assertions do not justify a second initialiser, and what it does at module
 * scope is what it does when Thunderbird opens it. So the shipped HTML is
 * loaded into this tier's document and the module is imported on top of it,
 * which is as close to how it runs as anything short of a real Thunderbird.
 * Loading the real file rather than a fixture is also what makes a renamed
 * field fail here instead of in someone's settings page.
 *
 * What is worth pinning is only the correction notice. A value the block
 * cannot use is not saved as typed, and the page says so out loud rather than
 * letting the field change quietly under a "Saved." - a correction nobody is
 * told about is one they find out about in an email they have already sent.
 * The rest of the page is attribute plumbing, which the hand-run checklist
 * covers better than a fake will.
 *
 * The numbers come from `SETTING_FIELDS`, and the wording is read back off the
 * page itself rather than written out here: the bounds and the two sentences
 * both belong to modules that own them, and retuning either should stay a
 * one-line change rather than turning this file red.
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const optionsPage = readFileSync(
  resolve(repoRoot, "src/options/options.html"),
  "utf8",
);

let fake;

/**
 * Puts the shipped page in the document and runs its script over it, with
 * `stored` as what `storage.local` already holds.
 *
 * The module does its work at module scope and ends in a top-level `await` on
 * the settings read, so the import has to happen with the fake already
 * installed, and the registry has to be reset per test or the second test gets
 * the first test's page. The `<script>` in the markup does not run - assigning
 * it through `innerHTML` never does - so the import below is the only copy.
 */
const openOptionsPage = async (stored) => {
  fake = installBrowserFake({
    storage: {
      local: {
        get: async () => stored,
        set: async () => {},
      },
    },
  });

  document.body.innerHTML = new DOMParser().parseFromString(
    optionsPage,
    "text/html",
  ).body.innerHTML;

  vi.resetModules();
  await import("../../src/options/options.js");

  // The ids are the contract between the page and its script, so this is the
  // one place the test has to know them - and it knows them against the file
  // that ships rather than against a copy.
  return {
    tabWidth: document.getElementById("tab-width"),
    fontSize: document.getElementById("font-size"),
  };
};

/** What the page is currently saying about the last save. */
const status = () => document.getElementById("status").textContent;

/** The settings object the page last put in storage. */
const stored = () => fake.calls("storage.local.set").at(-1)?.[0];

/**
 * Types a value into a field and lets the save it triggers settle.
 *
 * `change` and not a call into the module: the page's only way in is the event
 * a blur or an Enter sends, which is also why saving is not per keystroke.
 * The handler is async and the listener does not await it, so the test does.
 */
const typeAndSave = async (input, value) => {
  input.value = value;
  input.dispatchEvent(new Event("change"));
  await new Promise((settled) => setTimeout(settled, 0));
};

/**
 * The page's own wording for a save that needed no correction.
 *
 * Read back off the page rather than written out, because the sentence is
 * options.js's to word. Saving the values already on show is a save with
 * nothing to correct whatever the bounds happen to be, since the fields only
 * ever hold what came back from a write.
 */
const confirmationWithoutCorrection = async (fields) => {
  await typeAndSave(fields.tabWidth, fields.tabWidth.value);
  return status();
};

describe("the options page", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * A number out of range is a request the extension cannot grant, answered
   * with the closest thing it can. All three halves of answering it are the
   * assertion: the store never holds a value the block would not use, the
   * field shows what will actually apply rather than what was typed, and the
   * page says the value was adjusted rather than reporting a plain save.
   */
  it("stores an out-of-range value clamped, shows it, and says it adjusted", async () => {
    const fields = await openOptionsPage({ tabWidth: 4, fontSize: 12 });
    const uncorrected = await confirmationWithoutCorrection(fields);

    for (const [name, { min, max }] of Object.entries(SETTING_FIELDS)) {
      for (const [typed, applies] of [
        [max + 1, max],
        [min - 1, min],
      ]) {
        const label = `${name}: ${typed}`;
        await typeAndSave(fields[name], String(typed));

        expect(stored()[name], label).toBe(applies);
        expect(fields[name].value, label).toBe(String(applies));
        expect(status(), label).not.toBe(uncorrected);
        expect(status(), label).toMatch(/adjust/i);
      }
    }
  });

  /**
   * An emptied field is the ticket's own case. It means "the default", never
   * zero, and it is a correction like any other: the number that will apply is
   * not the nothing that was typed. It is also the only shape a nonsense value
   * can reach the page in - a number field hands `4px` over as an empty string
   * rather than as itself - so this covers both.
   */
  it("reports an emptied field as a correction", async () => {
    const fields = await openOptionsPage({ tabWidth: 4, fontSize: 12 });
    const uncorrected = await confirmationWithoutCorrection(fields);

    await typeAndSave(fields.fontSize, "");

    expect(stored().fontSize).toBe(SETTING_FIELDS.fontSize.fallback);
    expect(fields.fontSize.value).toBe(
      String(SETTING_FIELDS.fontSize.fallback),
    );
    expect(status()).not.toBe(uncorrected);
    expect(status()).toMatch(/adjust/i);
  });

  /**
   * The other side of that line. A leading zero is the field's own formatting
   * and not a correction anyone needs telling about: the value that will apply
   * is the value that was typed, and saying it was adjusted would teach the
   * user to stop believing the notice on the saves where it matters.
   */
  it("does not report a leading zero over the same number as a correction", async () => {
    const fields = await openOptionsPage({
      tabWidth: 8,
      fontSize: SETTING_FIELDS.fontSize.fallback,
    });
    const uncorrected = await confirmationWithoutCorrection(fields);

    await typeAndSave(fields.tabWidth, "08");

    expect(stored().tabWidth).toBe(8);
    expect(status()).toBe(uncorrected);
  });
});
