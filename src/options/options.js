import {
  SETTING_FIELDS,
  readSettings,
  writeSettings,
} from "../settings/settings.js";

const fields = {
  tabWidth: document.getElementById("tab-width"),
  fontSize: document.getElementById("font-size"),
};
const statusLine = document.getElementById("status");

for (const [name, input] of Object.entries(fields)) {
  // The spinner's limits come from the same table the coercion uses, so the
  // arrows stop where a typed value would start being rejected.
  input.min = SETTING_FIELDS[name].min;
  input.max = SETTING_FIELDS[name].max;

  // `change` rather than `input`: it fires on blur and on Enter, once the user
  // has finished typing. Saving per keystroke would write `1` on the way to
  // `12` and, worse, bounce the field back to the default the moment it is
  // briefly empty.
  input.addEventListener("change", save);

  // Anything typed makes "Saved." untrue until the next change event, and a
  // stale confirmation next to an edited field is the kind of small lie that
  // makes someone close the page believing a value took.
  input.addEventListener("input", () => setStatus(""));
}

show(await readSettings());

/**
 * Fills both fields from a settings object.
 *
 * Also the only place the fields are ever written, which is what keeps them
 * showing the value the block will actually use rather than the text that was
 * typed at them.
 */
function show(settings) {
  for (const [name, input] of Object.entries(fields)) {
    input.value = String(settings[name]);
  }
}

async function save() {
  try {
    // Field values are strings, and an empty field is `""`; the settings module
    // is where that becomes a number, so nothing is parsed here.
    const stored = await writeSettings({
      tabWidth: fields.tabWidth.value,
      fontSize: fields.fontSize.value,
    });
    // Said out loud, and not only shown. `show` puts the corrected number in
    // the field either way, but a field quietly changing under a "Saved."
    // reads as a save that worked; a value that was out of range or empty was
    // not saved as typed, and the one sentence is what stops the correction
    // being something the user finds out about in an email.
    const corrected = wasCorrected(stored);
    show(stored);
    setStatus(
      corrected
        ? "Saved, adjusted to what the block can use. The fields show the " +
            "values that will apply."
        : "Saved. Applies to the next code block you insert.",
    );
  } catch (error) {
    setStatus(`Could not save: ${String(error?.message ?? error)}`, true);
  }
}

/**
 * Whether what came back differs from what was typed — which is the question,
 * rather than whether it differs from what is in the field, because `show` is
 * about to overwrite that.
 *
 * Compared as numbers so that `08` and `8` are the same answer: a leading zero
 * is the field's own formatting and not a correction anyone needs telling
 * about. An emptied field comes out as `0` and an unparseable one as `NaN`,
 * and neither can equal a setting, so both are reported as the corrections
 * they are.
 */
function wasCorrected(stored) {
  return Object.entries(fields).some(
    ([name, input]) => Number(input.value) !== stored[name],
  );
}

function setStatus(text, failed = false) {
  statusLine.textContent = text;
  statusLine.classList.toggle("failed", failed);
}
