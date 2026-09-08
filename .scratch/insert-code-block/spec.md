# ThunderCode: insert syntax-highlighted code blocks in Thunderbird compose

## Problem Statement

When I write an email containing source code, I have no good way to make it
readable. Pasting code into Thunderbird's compose window gives me proportional
body text where indentation collapses, whitespace is unreliable, and there is no
visual distinction between the code and my prose. The recipient gets a wall of
undifferentiated text.

The workarounds are all bad. Manually switching to a monospace font and adding a
border is tedious and I won't do it consistently. Taking a screenshot of my
editor produces something nobody can copy, search, or read with a screen reader.
Attaching a file means the recipient has to leave the email to see three lines of
code. Linking to a repository doesn't work when the code isn't committed, when
the recipient has no access, or when the whole point is to discuss the snippet
inline.

Worse, whatever I manage to build in the compose window is not what the recipient
sees. Their mail client re-renders it, and mail clients disagree wildly about CSS.
Something that looks correct in Thunderbird can arrive in Outlook with the
indentation gone.

## Solution

A Thunderbird MailExtension that adds a button to the compose window's format
toolbar. I click it (or press a keyboard shortcut, or right-click in the message
body), a popup appears, I paste my code in, and it shows me a live preview of the
highlighted result with the language it guessed. If the guess is wrong I correct
it from a dropdown. I hit Insert and a syntax-highlighted code block lands at my
cursor.

The inserted block is built to survive the trip. Every colour is written as an
inline `style` attribute rather than relying on a stylesheet, so it keeps working
after the recipient replies, forwards, or copies it into a wiki. Indentation is
normalised so it cannot collapse. The design target is graceful degradation:
colour is a bonus, but monospace rendering with faithful whitespace is a contract
that holds in every mail client, including Outlook's Word-based renderer. In the
worst case the recipient sees a bordered, monospaced, correctly-indented block
with no colour, and the code is still perfectly usable.

The code arrives as real text, so the recipient can select it, copy it, and run it.

## User Stories

### Invoking the feature

1. As someone writing an email about code, I want a button in the compose
   window's format toolbar, so that the control is where my hand already is when
   I'm formatting a message.
2. As a frequent user, I want a keyboard shortcut that opens the inserter, so
   that I never have to reach for the mouse mid-sentence.
3. As someone who has already pasted code into the body, I want a right-click
   item in the message body, so that I can act on text that is already there.
4. As someone who right-clicks on a selection, I want the popup to be prefilled
   with the selected text, so that I don't have to re-copy code I can already see.
5. As someone who inserts from a selection, I want the original selected text to
   be replaced by the code block, so that I don't end up with the snippet twice.
6. As someone composing in plain-text mode, I want the button to still work and
   insert my code verbatim, so that the feature never silently does nothing.
7. As someone with several compose windows open, I want the code to land in the
   window I invoked it from, so that a snippet never appears in the wrong email.

### Getting code in

8. As someone pasting from an IDE, I want an autofocused textarea when the popup
   opens, so that paste is a single keystroke with no clicking first.
9. As someone who paste-and-inserts repeatedly, I want a keyboard shortcut to
   confirm the insert, so that the whole interaction never needs the mouse.
10. As a privacy-conscious user, I want the popup NOT to read my clipboard
    automatically, so that sensitive clipboard contents are never surfaced or
    inserted without my action.
11. As someone who just inserted a block, I want the popup to close afterwards,
    so that I'm returned to writing my email.
12. As someone pasting a large file, I want a warning when the snippet is very
    large, so that I don't unknowingly add a megabyte to my message.
13. As someone who genuinely needs to send a large snippet, I want that warning
    to be advisory rather than a hard block, so that the tool doesn't override my
    judgement.

### Choosing a language

14. As someone pasting code, I want the language detected automatically, so that
    the common case needs no input from me at all.
15. As someone whose snippet was misidentified, I want a dropdown to override the
    detected language, so that a bad guess costs me one click rather than an
    undo.
16. As someone who overrides the language, I want the detection to still run
    fresh on my next insert rather than remembering my last choice, so that
    auto-detection never quietly stops working.
17. As someone working across many languages, I want coverage of the languages I
    actually paste into email, so that I'm not choosing between "plain text" and
    something wrong.

### Seeing what I'll get

18. As someone about to insert, I want a live preview of the highlighted result,
    so that I catch a wrong language guess before it reaches my email.
19. As someone tuning the language, I want the preview to update as I change the
    dropdown, so that I can confirm the correct choice by looking at it.
20. As someone comparing preview to result, I want the preview to look like what
    gets inserted, so that the preview is trustworthy rather than indicative.

### The inserted block

21. As a recipient, I want the code in a monospaced font, so that columns line up
    and the code is legible as code.
22. As a recipient, I want indentation preserved exactly, so that I can read
    nested structure and paste the code somewhere it will run.
23. As a recipient, I want the block visually delimited by a border, padding and
    a background, so that I can see at a glance where the code starts and ends.
24. As a recipient, I want syntax colouring, so that I can scan the code the way
    I would in an editor.
25. As a recipient on any mail client, I want the colours to survive, so that I
    get the same reading experience regardless of what I read mail in.
26. As a recipient whose client strips stylesheets, I want the block to still be
    monospaced and correctly indented, so that the failure mode is "no colour"
    rather than "unreadable".
27. As a recipient who replies to the thread, I want the code block in the quoted
    text to keep its formatting, so that later readers of the thread can still
    read the code.
28. As a recipient, I want to select and copy the code as text, so that I can run
    it, diff it, or paste it into my editor.
29. As a recipient using a screen reader, I want the code to be real text, so
    that it is accessible at all.
30. As a recipient with a narrow window, I want long lines to soft-wrap, so that
    I can read the whole line instead of having it clipped or being forced to
    scroll the entire email sideways.
31. As a recipient who wants to copy the code, I want no line numbers glued to
    the lines, so that pasting produces runnable code.
32. As a recipient on a light background, I want every colour chosen to be
    legible on white, so that stripped background colours never make text
    invisible.
33. As a reader of code, I want a familiar colour palette, so that the
    highlighting matches what my eye is trained on.

### Normalising the source

34. As someone who copied a method out of a class, I want the shared leading
    indentation removed, so that the block isn't pointlessly indented as a whole.
35. As someone whose paste included blank lines at the start or end, I want them
    stripped, so that the block doesn't have dead space inside its border.
36. As someone whose source uses tabs, I want tabs expanded to spaces, so that
    inconsistent tab-stop handling across mail clients can't collapse my
    indentation.
37. As someone with an opinion about tab width, I want to configure how many
    spaces a tab becomes, so that the block matches my project's conventions.
38. As someone whose editor left trailing whitespace, I want it stripped, so that
    soft-wrapping isn't triggered by invisible characters.

### Sending

39. As a sender, I want the HTML formatting to actually be transmitted, so that
    my carefully formatted block doesn't get silently downgraded to plain text on
    send.
40. As a sender writing to someone who prefers plain text, I want a plain-text
    alternative part included, so that the message is readable either way.
41. As a sender, I want the code's whitespace to survive Thunderbird's own
    serialisation on send, so that what I saw is what goes on the wire.

### Editing after insert

42. As someone who inserted the wrong thing, I want Ctrl+Z to undo the
    insertion, so that mistakes cost nothing.
43. As someone who inserted a block, I want my cursor left somewhere sensible
    afterwards, so that I can keep typing prose without repositioning.
44. As someone who inserted a block, I want the rest of my draft untouched, so
    that inserting code can never damage text I already wrote.
45. As someone who inserted a block, I want Thunderbird to know the message
    changed, so that I'm warned about unsaved changes if I close the window.

### Configuring

46. As a user with preferences, I want a settings page for tab width and font
    size, so that I can adjust the output without editing code.
47. As a daily user, I want those settings out of the popup, so that the thing I
    use constantly stays uncluttered.
48. As a user, I want my settings to persist across restarts, so that I configure
    them once.

### Installing and developing

49. As the author, I want to install the extension from a zipped XPI, so that I
    can use it without publishing it anywhere.
50. As the author, I want to load it as a temporary add-on during development, so
    that I can iterate without restarting Thunderbird.
51. As the author, I want no build step for shipping code, so that "edit file,
    click reload" is the entire loop.
52. As the author, I want it to work on both current ESR and current release
    Thunderbird, so that one build covers every machine I use.

## Implementation Decisions

### Extension shape

- Manifest V3, `strict_min_version: "128.0"`. 128 is the first Thunderbird
  release with official MV3 support and covers 128 ESR, 140 ESR, 153 ESR and
  release channel with a single build.
- Background is an **event page** (`background.scripts`, `type: "module"`), not a
  service worker. `background.service_worker` is not implemented in Gecko and
  Thunderbird inherits that. The background script must register a
  `runtime.onStartup` listener to run on startup, and must tolerate its file
  scope being re-executed whenever an event fires.
- `browser_specific_settings.gecko.id` is mandatory in Thunderbird (unlike
  Firefox) — the add-on will not install without it. The extension is named **ThunderCode**; id: `thundercode@sitepark.com`.
- Distribution is self-hosted: zip the project folder, use the `.xpi` extension.
  Thunderbird does not sign add-ons. Not published to ATN.
- Permissions kept minimal: `compose` and `scripting` (both required for compose
  scripts), `menus`, `storage`. No `tabs`, no `activeTab`, no clipboard
  permission.
- No bundler. Plain ES modules loaded directly, plus highlight.js's prebuilt
  distribution file, which already is the ~40-language `common` subset. `pnpm`
  is used only for dev dependencies (test runner).

### Entry points

- `compose_action` with `default_area: "formattoolbar"` and a `default_popup`.
  `compose_action` keeps its name in MV3 (it is not folded under `action`).
  `"formattoolbar"` and `"maintoolbar"` are the only available areas.
- A `commands` entry using the built-in `_execute_compose_action` name. Commands
  are confirmed to fire in compose windows; the `tab` argument to `onCommand`
  identifies the active compose tab.
- A `menus` entry with the `compose_body` context, which opens the same popup via
  `composeAction.openPopup()`. When a selection exists, the `selection` context
  fires alongside `compose_body`, and `info.selectionText` carries the text.
- There is deliberately no Insert-menubar entry. No API exists to add items to the
  compose window's menubar; the only menubar context in the schema is the main
  window's Tools menu. Doing it would require an Experiment API.

### The core seam

One module exposes the entire text-to-HTML pipeline as a single pure function,
roughly:

```
buildCodeBlockHtml({ source, language, themeMap, tabWidth, fontSize })
  -> { html, detectedLanguage }
```

`language` may be `undefined` to request auto-detection, in which case the
language actually used is reported back as `detectedLanguage`. Normalisation,
highlighting, class-to-inline-style conversion and the `<pre>` wrapper are all
internal to this module and are not exported.

The function is pure: no DOM access, no `browser.*` access, no I/O. The theme is
injected as data (`themeMap`), and the highlighter is a plain function
dependency. This is the only seam in the codebase.

### Theme handling

- The theme is highlight.js's GitHub light theme, shipped as a CSS file. Light
  only: every colour must be legible on white, because on some recipient's screen
  it will be on white. This rules out dark themes, which degrade to pale-grey-on-
  white when a client drops the background colour.
- Colours are never transcribed by hand. At runtime the popup reads the theme's
  rules through `document.styleSheets[…].cssRules` — the browser's own CSS parser
  — and reduces them to a flat `themeMap` of highlight.js class name to inline
  declaration string. hljs themes use flat single-class selectors, so this is a
  direct lookup with no cascade to resolve.
- **Revision to an earlier decision:** an earlier plan resolved colours with
  `getComputedStyle` against the live preview DOM. That was rejected because it
  makes the core pipeline untestable outside a browser — jsdom's computed-style
  cascade does not reliably resolve inherited properties such as `color` from a
  stylesheet, so tests would be exercising jsdom's CSS engine rather than this
  code. Reading `cssRules` preserves the property that mattered (the stylesheet
  remains the single source of truth, swapping themes is one file) while keeping
  the pipeline pure.
- Only a whitelisted set of properties is inlined: `color`, `font-weight`,
  `font-style`. Copying everything a computed style reports would produce
  enormous HTML.

### Output markup contract

- A single `<pre>` containing `<span style="…">` per token. All styling is inline.
  No `class` attributes, no `<style>` block, no `<table>` wrapper.
- The inline-only rule is the central decision and is driven by reply-quoting:
  when a recipient replies, their client copies the message **body** into the
  quote and discards the `<head>`. A `<style>`-based block therefore loses all
  colour the first time anyone replies in the thread. Inline styles ride inside
  the `<pre>` and survive quoting, forwarding, and copy-paste into other tools.
  Class-based styling additionally exposes the block to Outlook.com's class
  rewriting and Gmail's clipping behaviour.
- `<pre>` properties: an explicit monospace font stack ending in `monospace`;
  `font-size` in **px** (not em/rem, which are unreliable in mail clients);
  an explicit `line-height`; `white-space: pre-wrap`; padding; a 1px solid
  border; a light background; vertical margins.
- `font-size` is set once on the `<pre>` and inherited by the spans. It is not
  repeated per span, which would multiply message size.
- `white-space: pre-wrap` is chosen over `pre` because email bodies have no
  horizontal scrollbar: a soft-wrapped line is briefly confusing, whereas a
  clipped line has silently lost information. The source text is never hard-
  wrapped, as that would corrupt the code.
- No line numbers. Numbers baked into the text would be copied along with the
  code, producing something that cannot run. If line references are ever needed,
  the only mail-safe implementation is a two-column table, not text prefixes.
- No language label. It requires either a table or an extra block element whose
  alignment drifts between clients, and the snippet is normally introduced in the
  prose above it.
- No background-preserving `<table>` wrapper. A visible border alone still reads
  unmistakably as a code block when Outlook drops the background, so the table
  earns very little.

### Source normalisation

Applied in order, before highlighting:

1. Expand tabs to spaces (configurable width, default 4). Inconsistent tab-stop
   rendering across clients is the most likely cause of collapsed indentation.
2. Strip trailing whitespace per line, so `pre-wrap` is not triggered by
   invisible characters.
3. Strip leading and trailing blank lines.
4. Remove the common leading indentation across all non-blank lines. This cannot
   lose meaningful information, since by definition the removed prefix is present
   on every line.

### Insertion mechanism

- `compose.setComposeDetails({ body })` is explicitly **not** used. Its
  implementation assigns to `editor.document.documentElement.innerHTML`, then
  calls `editor.beginningOfDocument()` and `editor.clearUndoRedo()`. Every call
  therefore replaces the whole document including `<head>`, moves the caret to the
  top of the message, and destroys the undo history. It is unusable for a
  caret-relative insert.
- Instead, at insert time the extension calls `scripting.executeScript()` against
  the target `messageCompose` tab. Compose scripts have access to the real DOM of
  the compose editor (true even for plain-text composers, which are still HTML
  documents underneath).
- On-demand injection is preferred over `scripting.compose.registerScripts()`
  because registered compose scripts "will only be applied to newly opened
  message compose tabs", so already-open composers would need `executeScript`
  anyway. The declarative `compose_scripts` manifest key is not used because it
  requires Thunderbird 151, above the 128 floor.
- The injected script attempts `document.execCommand("insertHTML")` first. This
  routes to `HTMLEditor::InsertHTMLAsAction`, which is a real editor action, so it
  participates in undo/redo and marks the body modified. It runs with
  `SafeToInsertData::Yes`, meaning no tree sanitiser runs and inline `style`
  attributes survive. Note that inline styles active at the insertion point are
  cleared, so the inserted block does not inherit surrounding bold or italic.
- If `execCommand` is unavailable, the script falls back to Selection/Range DOM
  insertion, following the pattern in Thunderbird's own `composeScript` sample
  (insert node, then reposition the caret with `getSelection()` +
  `createRange()` + `setStartBefore`).
- If no usable range is found inside the body, the block is appended at the end
  of the body rather than failing.
- When invoked from a selection, the selection is deleted as part of the insert.
- `deliveryFormat` is set to `"both"` on insert. The default `"auto"` "will send
  html messages as plain text, if they do not include any formatting", which is a
  silent path to losing the entire block. `"both"` also guarantees the plain-text
  alternative that the plain-text story depends on. Note the documented side
  effect: modified settings are treated as user-initiated and disable further
  automatic changes to them.

### Plain-text composers

- The compose format of an existing compose window cannot be changed, and
  `setComposeDetails` ignores `isPlainText`. So the extension does not offer to
  switch formats.
- In a plain-text composer the button still works and inserts the normalised
  source verbatim with no markup. This keeps the button from ever appearing
  broken, and verbatim code in a plain-text mail is a perfectly good outcome.
- For HTML messages, Thunderbird's auto-generated `text/plain` alternative is
  accepted as-is. Controlling it is a rabbit hole with no visible payoff.

### Popup behaviour

- Autofocused textarea, language dropdown, live preview, Insert button.
- `Ctrl+Enter` inserts. The popup closes after inserting.
- The clipboard is **not** read automatically. Auto-pasting into a visible field
  risks surfacing unintended clipboard contents, and reading the clipboard would
  require a permission that is otherwise unnecessary.
- The dropdown always defaults to the auto-detected language and never to the
  last-used one. Remembering the last choice would silently override the
  detection, turning the override control into the thing that lies to you.
- Above roughly 500 lines the popup shows an advisory warning about message size.
  Expect the HTML to be several times the size of the source, since most tokens
  gain a `style` attribute. The warning never blocks the insert.
- The preview is rendered with the theme stylesheet applied, which is also where
  the `themeMap` is read from.

### Settings

- An `options_ui` page backed by `storage.local`, exposing tab width and font
  size. Settings are read at popup-open time and passed into the seam.
- `storage.local` rather than `storage.sync`: Thunderbird's sync support has
  historically been thin, and the settings are trivial to re-enter.
- No localisation. The UI surface is a handful of labels; `_locales` would triple
  the friction of changing any string without paying for itself.

### Deliberately unverified, to be resolved by a spike

Two behaviours could not be confirmed from documentation or source and are
resolved by a throwaway spike loaded via "Load Temporary Add-on" as the first
implementation step:

1. Whether the compose editor's `Selection` survives the popup taking focus. If
   it does not, the fallback is a registered compose script that tracks the last
   valid Range via `selectionchange` and is messaged at insert time.
2. Whether `document.execCommand("insertHTML")` is reachable from the compose-
   script sandbox. The code path exists and is unsanitised, but no official
   sample or test exercises it. If it is not reachable, native undo is lost and
   the Range path becomes the only path.

Relatedly, it is unverified whether direct DOM mutation from a compose script
registers with the editor's transaction manager or flips `bodyModified`. This is
the reason `execCommand` is attempted first.

## Testing Decisions

### What makes a good test here

Tests drive the single seam (`buildCodeBlockHtml`) and assert on its returned
HTML and reported language. They do not import or assert on the normalisation
steps, the style-inlining walker, or the wrapper builder individually — those are
implementation details behind the seam, and testing them directly would freeze
the internal decomposition.

Tests inject a small fixture `themeMap` rather than loading the real theme CSS.
This keeps them independent of the shipped stylesheet: a theme swap must not
break the test suite, because a theme swap is not a behaviour change.

Assertions target the parts of the output that constitute the contract described
above — that indentation is preserved exactly, that colours appear as inline
`style` attributes rather than classes, that no `class` attribute or `<style>`
block is emitted, that `font-size` appears once on the `<pre>` and not per span.
They avoid asserting on incidental markup shape such as attribute ordering or
whitespace between tags.

### What is tested

The seam, covering:

- Tab expansion at the default width and at a configured width.
- Common-indent removal, including the case where one line is at zero indent
  (nothing should be removed) and the case where blank lines are interspersed
  (blank lines must not defeat the calculation).
- Leading and trailing blank-line stripping, and per-line trailing whitespace
  stripping.
- Idempotence of normalisation: feeding already-normalised source through again
  changes nothing.
- Explicit language selection versus auto-detection, and that the language
  actually used is reported back.
- That highlight.js classes are translated to inline styles from the injected
  map, and that a class absent from the map degrades to an unstyled span rather
  than throwing.
- That HTML metacharacters in the source are escaped, so source containing
  markup cannot inject elements into the message.
- The output markup contract items listed above.
- Edge inputs: empty source, single line with no trailing newline, source that is
  entirely blank lines, and source consisting of a single very long line.

### What is not unit tested

- Reading `cssRules` to build the `themeMap`. Browser-only, and thin enough that
  a failure is immediately visible in the preview.
- The popup UI and the options page. Verified by hand.
- The compose-script insertion. Verified by hand and by the spike; this is where
  the genuine unknowns live, and no unit test could have answered them.

### Prior art

None — this is a greenfield repository with no existing tests, no domain glossary
and no ADRs. The conventions above are therefore established by this work rather
than inherited, and future specs in this repo should follow them.

### Tooling

`vitest`, run under Node with no DOM environment, installed with `pnpm` as a dev
dependency only. The absence of a DOM environment is a deliberate constraint: it
is what forces the seam to stay pure.

## Out of Scope

- Dark themes and user-selectable themes. Ruled out for now because every colour
  must be legible on white; the theme is one file, so this is cheap to revisit.
- Line numbers. If ever added, they must be a two-column table, never text
  prefixes.
- Language labels or captions on the block.
- A background-preserving `<table>` wrapper for Outlook.
- Re-editing a previously inserted code block. The extension inserts; it does not
  recognise or round-trip its own output.
- Adding an entry to the compose window's Insert menubar menu. Not possible
  without an Experiment API.
- Publishing to addons.thunderbird.net, and everything that entails (source-code
  submission, `VENDOR.md`, reproducible builds, review).
- Localisation.
- `storage.sync` and cross-profile settings.
- Rendering code as an image. Rejected: unselectable, uncopyable, inaccessible,
  and useless in plain-text views.
- Controlling the auto-generated `text/plain` alternative part.
- End-to-end tests driving Thunderbird.
- Any bundler, transpiler or minifier.

## Further Notes

### Accepted warts

- On send, `mozITXTToHTMLConv.scanHTML` runs with the `kURLs` flag and
  auto-linkifies bare URLs in text nodes. A URL inside a code comment may
  therefore arrive as an `<a>`. Accepted; there is no per-message way to disable
  it. The `mail.send_struct` pref, which would additionally convert `*bold*`,
  `/italic/` and `|code|` into markup, is off by default.
- Outlook's Word-based renderer may drop the block's background colour. Accepted:
  the block still reads as code because of the border, and this is exactly the
  degradation the design targets.
- `info.selectionText` is plain text extracted from HTML, so indentation may
  already be damaged before normalisation runs. The paste-into-popup path is the
  reliable one; the selection path is the convenient one. If `selectionText`
  proves to mangle indentation badly in practice, the prefill should be dropped
  rather than worked around.
- Compose script console entries appear twice; this is a known Thunderbird
  logging issue, not a bug in this extension.

### Useful upstream references

Thunderbird's own MV3 samples include `composeScript` (caret insertion via
Selection/Range) and `composeBody`, and are the closest prior art for the
insertion mechanism. The generated Sphinx API reference is authoritative; the
hand-maintained supported-manifest-keys table on developer.thunderbird.net is
known to be stale and should not be trusted for MV3 questions.

### Things on send that work in our favour

Thunderbird applies no sanitiser on send, and serialises with
`OutputNoFormattingInPre`, which specifically protects whitespace inside `<pre>`.
Inline styles and indentation both survive Thunderbird's own serialisation
intact. The risks to this feature are all downstream, in the recipient's client.
