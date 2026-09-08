# 10: Options page

**What to build:** Somewhere to set tab width and font size, so the output can be adjusted without editing code. These live on a separate options page rather than in the popup, because they are set roughly once a year and the popup is used daily.

**Blocked by:** 05

**Status:** ready-for-human

- [x] An options page exposes tab width and font size
- [ ] Values are stored in extension-local storage, not synced storage, and persist across a Thunderbird restart
- [x] Settings are read when the popup opens and are honoured by the inserted block
- [x] Sensible defaults apply when nothing has been set
- [x] The settings do not appear in the popup
- [x] Invalid or empty values fall back to the defaults rather than producing a broken block

## Comments

### The one unticked box, and the half of it that is done

"Stored in extension-local storage, not synced storage" is done and pinned by a
test. **"Persist across a Thunderbird restart" cannot be checked here** — same
reason as tickets 01 and 02: the only Thunderbird on this machine is 115.10.1
and an MV3 MailExtension does not load below 128, so the add-on cannot be
installed at all, let alone restarted. The box is compound, so it stays
unticked until someone does it.

It is one minute of the hands-on pass tickets 01 and 02 already need. Open
**Tools ▸ Add-ons and Themes**, pick ThunderCode, set both fields on its
preferences pane, restart, and reopen the pane. There is nothing clever to go
wrong: `storage.local` is on disk in the profile, and nothing here caches
across the popup's lifetime.

The rest of the checklist is either covered by `pnpm test` or readable off the
source. What no test here can see is the pane rendering — that it looks like
two labelled fields and not two fields stacked on their labels. Worth a glance
during the same pass, along with typing rubbish into a field and tabbing out:
the field should snap back to `4` or `13` rather than accepting it.

### Where the defaults live, and why not in the settings module

The ticket's real trap is ending up with `4` written in the seam and `4`
written again next to the options page. Then the page shows one number, the
block uses the other, and only a screenshot comparison ever notices.

So the two numbers stay where they already were — in
`src/code-block/build-code-block-html.js` — and are now exported as
`CODE_BLOCK_DEFAULTS`. The settings module imports them; the options page has
no defaults of its own and no `value` attributes in its HTML, it just renders
whatever the settings module resolved.

Two things pushed the direction of that dependency:

- **They are properties of the block, not of the settings UI.** The seam has to
  produce a sane block for any caller, including ticket 09's plain-text path
  and any test that passes neither option. A seam that cannot render without a
  settings module would be the wrong shape.
- **Purity.** The settings module touches `browser.storage`. If the constants
  lived there, the seam would import a module that reaches for `browser.*`,
  which is exactly what the no-DOM runner exists to prevent. The arrow points
  the only way it can.

This does mean the seam now has a second export, against ticket 02's "the only
export". A frozen data constant is not a pipeline step, no test drives the
pipeline through it, and the alternative was the duplication above. Named
`CODE_BLOCK_DEFAULTS` rather than `SETTINGS_DEFAULTS` to keep whose defaults
they are obvious at the import site.

### The coercion is the whole testable surface

`coerceSettings(stored)` is pure, so it runs in Node, and every interesting
decision is inside it: empty field, half-typed number, string from a number
input, fraction, zero, negative, absent key, garbage left by a hand-edited
profile. It always returns both settings as usable numbers, which is why
nothing downstream has a "not configured yet" branch — the popup destructures
it and calls the seam.

`storage.local` is not mocked. There is no storage in Node, and a mock would
only assert that the mock works. The read and write around the coercion are
four lines each and fail visibly.

The one exception is a source-level assertion that the module says
`browser.storage.local` and never `browser.storage.sync`. The spec rules sync
out explicitly, nothing at runtime here can observe the difference, and it is
the kind of decision someone later "fixes" in good faith.

### Range, and why out of range is a default rather than a clamp

Tab width accepts 1–16, font size 6–32; the ranges live in one table
(`SETTING_FIELDS`) which also feeds the `min`/`max` on the inputs, so the
spinner stops exactly where the coercion starts rejecting. Putting them in the
HTML would have been the same duplication as the defaults, one layer down.

Out of range falls back to the default instead of being clamped. One rule for
every bad input is easier to state — "anything that is not a whole number in
range means the default" — and it keeps the field showing either what was
typed or the default, never a third number nobody chose. The bounds are
judgement, not physics: they exist so that a fat-fingered `44` cannot produce a
screenful of indentation with the code pushed off the side.

Ticket 05 said this ticket need not re-validate before calling the seam, and
that is still true — the seam's own `tabWidth` guard is untouched and remains
the safety net for every other caller. The coercion is not there for the seam's
benefit but for the page's: something has to decide what an empty field means
before it can be shown back, and font size has no guard in the seam at all
(a bad one costs a dropped CSS declaration rather than an exception, so it
never needed one).

### Read once, at popup-open, held as a promise

`readSettings()` is called at the top of `popup.js` and the *promise* is kept;
the insert awaits it. Starting the read at open is what the ticket asks for,
and awaiting it late removes the window where a very fast paste-and-Insert
would find nothing loaded yet. There is no refresh: the popup is closed while
anyone is on the options page, so a stale read is not reachable.

`readSettings()` never rejects — an unreadable store logs and yields the
defaults. A settings read failing is not a reason to refuse to insert code, and
the fallback is the same one an empty store gets. Writes do throw, because a
settings page that silently fails to save is worse than one showing an error.

### Deliberately not done

- **The popup gains one import, one module-level read and two arguments.** It
  is otherwise unchanged: no settings link, no
  settings summary, nothing that would need re-reading daily — the whole point
  of the separate page. Anyone looking for preferences looks in the Add-ons
  Manager, which is why `open_in_tab` is `false` and the pane is embedded.
- **The textarea still does not restate the font size.** Ticket 02 left it
  monospace-and-nothing-else specifically so this ticket would not create two
  copies of the size to keep in step, and the textarea is a paste target rather
  than a preview. Ticket 06's preview is the thing that should honour the
  setting, and it can read it from the same `readSettings()`.
- **No Save button.** Saved on `change`, which fires on blur and Enter; the
  status line says so. A Save button on two fields is a thing to forget to
  press.
- **No Reset-to-defaults button.** Clearing a field is already exactly that,
  and it is the behaviour the tests pin.
- **Nothing else became configurable.** Line height, colours, the border, the
  monospace stack and the size threshold are all still constants. Each would
  need a way to be shown and validated, and none of them was asked for.
- **No `_locales`.** The spec rules out localisation; the page has five strings.
- **README untouched.** Add-on preferences live where every add-on's
  preferences live, and the README is being edited by other tickets.

### Review fixes: out-of-range values clamp, and the storage test is a real test

**Clamping.** `coerceSettings` sent anything outside the bounds back to the
default. That is a defensible reading of "invalid or empty values fall back to
the defaults", and it is also how a font size of 40 silently became 13 — the one
number the user certainly did not ask for. Out of range now clamps to the
nearest bound; what is not a number at all still defaults, because there is no
nearest bound to a value that is not on the line. The rule is therefore two
rules, split on whether there was a number to honour:

- `40` for a font size is a legible request for the largest size on offer, and
  gets 32.
- `"4px"`, `13.5`, `null`, an empty field: nothing to be close to, so the
  default.

The comment on `SETTING_FIELDS` argued explicitly for the old behaviour ("out of
range is treated as invalid rather than clamped: one rule for every bad input is
easier to explain"). It has been rewritten to argue for the new one rather than
left contradicting the code.

The empty field needed a guard of its own as a consequence, and it is worth
knowing why: `Number("")` is `0`, which used to be out of range and now clamps
to the minimum, so blank strings are caught before the arithmetic. That is this
ticket's own case — clearing a value to retype it looks exactly like an empty
field at every keystroke in between, and it has to mean the default, never 1.

**The page says so out loud.** `show()` already put the resolved value back in
the field, so the correction was visible; it was not, however, announced.
`save()` now compares what was typed against what came back and reports "Saved,
adjusted to what the block can use" when they differ, so a corrected value is
something the user is told about rather than something they might notice.

**The storage test.** `tests/settings.test.js` read its own source and asserted
that the string `browser.storage.local` appeared in it — which passes for a
mention in a comment or a call in unreachable code, and pins nothing. The
premise behind it was wrong: `browser` is a global, not a DOM, so the read and
the write are reachable from a Node test after all. The file now stubs
`browser.storage` and asserts what the module does with it — that it asks
`local` for both names, that it coerces whatever comes back, that a failed read
falls back to the defaults while a failed write throws, and that a write stores
the coerced values and reports them. `storage.sync` sits in the stub as a pair
of throwing functions, so "improving" settings to follow the profile around
fails the suite instead of passing it.
