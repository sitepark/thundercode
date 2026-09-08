import { CODE_BLOCK_DEFAULTS } from "../code-block/build-code-block-html.js";

/**
 * The two settings, each with the range it will accept.
 *
 * One table rather than a pair of hand-written branches, because both the
 * options page and the coercion below need the same three numbers per field.
 * The page reads `min` and `max` straight onto its `<input type="number">`, so
 * the spinner arrows stop exactly where the coercion starts rejecting; writing
 * them into `options.html` instead would put the range in two places and let
 * the field offer a value that silently becomes the default on save.
 *
 * The fallbacks are not stated here at all — they come from the seam, which is
 * what actually renders the block.
 *
 * The bounds themselves are judgement, not physics. They are wide enough that
 * nobody sane hits them and narrow enough that a fat-fingered `44` for a tab
 * width cannot produce a block of pure indentation. Out of range is treated as
 * invalid rather than clamped: one rule for every bad input is easier to
 * explain, and it means the field always shows either what the user typed or
 * the default, never a third number nobody asked for.
 */
export const SETTING_FIELDS = Object.freeze({
  tabWidth: Object.freeze({
    fallback: CODE_BLOCK_DEFAULTS.tabWidth,
    min: 1,
    max: 16,
  }),
  fontSize: Object.freeze({
    fallback: CODE_BLOCK_DEFAULTS.fontSize,
    min: 6,
    max: 32,
  }),
});

const SETTING_NAMES = Object.keys(SETTING_FIELDS);

/**
 * Turns whatever storage happens to hold into a settings object the seam can
 * be called with unconditionally.
 *
 * This is the part of settings handling worth testing, and the reason it is a
 * function of its own: `storage.local` is unreachable from a Node test, but the
 * decision that matters — what an empty, half-typed, absent or nonsensical
 * value means — is arithmetic and needs no browser. Reading and writing are the
 * thin parts wrapped around it.
 *
 * Every path returns both settings as usable numbers, so no caller ever has to
 * ask whether a setting was set. The failure mode the ticket rules out — a
 * broken block — is ruled out here rather than downstream.
 *
 * @param {Record<string, unknown>} [stored] Raw object as `storage.local`
 *   returns it, or as an options field hands it over.
 * @returns {{ tabWidth: number, fontSize: number }}
 */
export function coerceSettings(stored) {
  return Object.fromEntries(
    SETTING_NAMES.map((name) => [
      name,
      coerceField(stored?.[name], SETTING_FIELDS[name]),
    ]),
  );
}

function coerceField(value, { fallback, min, max }) {
  // Numbers and numeric strings only. A number field hands over a string, and
  // an empty field hands over `""` — everything else in here got into storage
  // through some other version of this extension or a hand-edited profile, and
  // guessing at it is worse than defaulting.
  if (typeof value !== "number" && typeof value !== "string") return fallback;

  // `Number("")` and `Number(" ")` are 0, which is out of range for both
  // fields, so a cleared field lands on the default without a case of its own.
  const number = Number(value);

  // Whole numbers: fractional tab stops do not exist, and the spinner steps by
  // one, so a `13.5` in here came from somewhere the user cannot see.
  return Number.isInteger(number) && number >= min && number <= max
    ? number
    : fallback;
}

/**
 * The settings as the popup and the options page should use them.
 *
 * `storage.local`, never `storage.sync`: Thunderbird's sync support has
 * historically been thin, and two numbers are trivial to re-enter on another
 * machine. Local storage is also what makes "persists across a restart" free —
 * it is on disk in the profile, not in memory.
 *
 * Never rejects. A settings read failing is not a reason to refuse to insert
 * code, and the fallback for an unreadable store is the same as for an empty
 * one, so the popup gets a working block and the console gets the reason.
 */
export async function readSettings() {
  try {
    return coerceSettings(await browser.storage.local.get(SETTING_NAMES));
  } catch (error) {
    console.warn("ThunderCode: could not read settings, using defaults", error);
    return coerceSettings();
  }
}

/**
 * Stores what the options page collected, and reports back what was actually
 * stored.
 *
 * Coerced on the way in as well as on the way out, so the store never holds a
 * value the block would not use. The return value is what lets the page put
 * the resolved number back in the field: type something impossible, and the
 * field shows you the default it fell back to rather than leaving you to
 * discover it in an email.
 *
 * Unlike the read, this one throws. A failed write is a settings page that
 * lies about having saved, which is worth a visible message.
 */
export async function writeSettings(values) {
  const settings = coerceSettings(values);
  await browser.storage.local.set(settings);
  return settings;
}
