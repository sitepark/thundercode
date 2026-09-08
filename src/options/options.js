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
    show(
      await writeSettings({
        tabWidth: fields.tabWidth.value,
        fontSize: fields.fontSize.value,
      }),
    );
    setStatus("Saved. Applies to the next code block you insert.");
  } catch (error) {
    setStatus(`Could not save: ${String(error?.message ?? error)}`, true);
  }
}

function setStatus(text, failed = false) {
  statusLine.textContent = text;
  statusLine.classList.toggle("failed", failed);
}
