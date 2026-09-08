# 02: Insert an unhighlighted code block from pasted source

**What to build:** Paste real code into the popup and insert it as a properly formatted code block: monospaced, bordered, exactly indented, soft-wrapping, and intact when the message is sent. No syntax colouring yet.

This is deliberately the graceful-degradation baseline. Colour is a bonus that arrives in ticket 03; monospace rendering with faithful whitespace is the contract that must hold in every mail client, including the ones that strip styling. If this slice is right, the worst any recipient ever sees is this.

It also introduces the single seam the whole feature is tested through: one pure function that takes the source text, a language, a theme map and options, and returns the HTML plus the language it used. Normalisation, highlighting, style inlining and the wrapper all live behind it as internals and are never tested directly.

**Blocked by:** 01

**Status:** ready-for-human

- [x] The popup has an autofocused textarea, so pasting is a single keystroke
- [x] The clipboard is never read automatically, and no clipboard permission is requested
- [x] Indentation in the pasted source is reproduced exactly in the inserted block
- [x] The inserted block is a single preformatted element using inline styles only: no class attributes, no style element, no table wrapper
- [x] An explicit monospace font stack ending in the generic `monospace` keyword
- [x] Font size specified in pixels, not em or rem, set once on the block and inherited rather than repeated per token
- [x] An explicit line height
- [x] Long lines soft-wrap; the source text is never hard-wrapped, as that would corrupt the code
- [x] Border, background, padding and vertical margins present, so the block reads as code at a glance
- [x] No line numbers and no language label
- [x] HTML metacharacters in the source are escaped: source containing markup cannot inject elements into the message
- [x] The delivery format is set explicitly on insert, so the message is not silently downgraded to plain text on send
- [ ] Verified by sending a message to yourself and reading it back: the block arrives intact as HTML, with a plain-text alternative part present
- [ ] The seam is a pure function with no DOM access and no extension API access inside it, taking the theme map as injected data
- [x] A test runner is added as a dev-only dependency using pnpm, running under Node with no DOM environment
- [x] Tests drive the seam only, never its internals, and assert on the contract items above rather than on incidental markup shape such as attribute ordering
- [x] Tests cover empty source, a single line with no trailing newline, source that is entirely blank lines, and a single very long line

## Comments

### What is done, and the one box only a human can tick

Everything on the list is implemented and covered by `pnpm test` except
**"Verified by sending a message to yourself and reading it back"**, which is
unticked for the same reason ticket 01's boxes are: the only Thunderbird on
this machine is 115.10.1, and an MV3 MailExtension does not load below 128, so
the add-on cannot be installed here at all.

That one check is worth doing in the same hands-on pass ticket 01 already
needs. Paste something indented, insert, send it to yourself, then read the
message back with **View ▸ Message Source**. Three things to look for:

1. A `multipart/alternative` with both a `text/html` and a `text/plain` part.
   Its absence means `deliveryFormat: "both"` did not take.
2. The `<pre>` in the HTML part still carrying its whole `style` attribute.
3. Leading spaces inside the `<pre>` intact and not collapsed or
   quoted-printable-mangled beyond recognition.

### The seam, and the half-ticked box

`buildCodeBlockHtml({ source, language, themeMap, tabWidth, fontSize })` is the
only export of `src/code-block/build-code-block-html.js`, and the only thing
the tests import. Escaping and the `<pre>` wrapper are internals; normalisation
(ticket 05) and highlighting (ticket 03) join them behind the same signature
without changing it.

The signature is complete from the start, exactly as the spec spells it out,
so that later tickets change internals rather than every caller. Three of its
five parameters therefore do nothing yet: `language` and `themeMap` until
ticket 03, `tabWidth` until ticket 05.

That is why **"taking the theme map as injected data" is left unticked**. The
purity half of that box holds and is enforced by the runner having no DOM. The
theme-map half is true of the signature and of nothing else: no test injects a
fixture map, because there is nothing yet for a map to change. Ticket 03 ticks
it for real, with the fixture map the spec's testing decisions call for.

Because nothing is highlighted yet, `detectedLanguage` always reports
`"plaintext"` rather than echoing back the requested language. Echoing it would
be a claim the output does not support, and ticket 06's preview would then
display that claim. Ticket 03 reverses this, and the test that pins it is meant
to fail there — that is a behaviour change, not a broken test.

Nothing is normalised here either. Ticket 02's contract is that indentation is
reproduced *exactly*, so the source goes through untouched apart from escaping.
Ticket 05 then makes it flush-left and tab-free.

### One non-obvious thing the tests pin down

An HTML parser discards a newline immediately after a `<pre>` start tag. A
snippet beginning with a blank line therefore loses it on the way into the
message, so the builder writes a second newline to compensate. This is a
property of the HTML spec rather than of this code, which is why it is worth a
named test — nothing about reading the builder would suggest it.

*(Superseded by ticket 05: stripping leading blank lines removed the hazard
rather than compensating for it, so the compensation is gone. The test remains,
now pinning the guarantee that replaced it. See the review-fixes section at the
end of this file.)*

### Decisions worth knowing about

- **`deliveryFormat` is set before the block is inserted, not after.** If the
  insert fails, the cost is a changed delivery format on an unchanged message;
  the other order risks a correctly inserted block on a message that then
  downgrades it to plain text on send. Only `deliveryFormat` is passed to
  `setComposeDetails`, never `body` — handing it a body rewrites the whole
  document, moves the caret to the top and clears undo.
- **Plain-text composers are untested here.** If `setComposeDetails` rejects
  `deliveryFormat` on a plain-text composer, the popup surfaces the error and
  inserts nothing. That path is ticket 09's, and this is the symptom to expect
  until then.
- **The textarea is a paste target, not a preview.** It is monospaced and
  soft-wrapping so pasted indentation is readable while it sits there, but it
  deliberately does not restate the block's font size or line height. Ticket 06
  brings the preview; ticket 10 makes the font size configurable, and two
  copies of it is two things to keep in step.
- **Nothing guards against inserting an empty block.** The seam handles empty
  source, so the result is a bordered empty box rather than an error. Gating
  the button on an empty textarea was written and then removed: ticket 02 does
  not ask for it and ticket 06 covers the empty-textarea case.
- **`vitest.config.js` now states `environment: "node"`** rather than relying
  on the default. The absence of a DOM is what keeps the seam pure, so it is
  worth saying out loud.
- **The hardcoded block is gone**, along with its test, as ticket 01 said it
  would be.

### Review findings acted on

Both axes of `/code-review` landed on the same three things, and all three are
fixed above rather than argued with:

- **The seam's signature was inconsistent with its own justification.**
  `tabWidth` had been left out as "an accepted-but-ignored setting looks like a
  working one" while `language` and `themeMap` were kept on the opposite
  reasoning. The spec spells out all five, so all five are there now, with one
  reason given once.
- **The tests pinned `style` as the `<pre>`'s first and only attribute**, so any
  second attribute would have failed ten tests without a behaviour change. They
  now read the block back through one tolerant parser.
- **Two tests asserted nothing.** "No line numbers" passed only because its
  fixture contained no digits, and "no language label" only because `print(1)`
  does not contain the word `python`. Both now assert that the block's text is
  the source and nothing else.

### Review fixes: `setComposeDetails` verified, and two comments made true again

**The current order is right, and here is the evidence rather than the
inference.** This ticket narrowed the spec's *"every call therefore replaces the
whole document including `<head>`, moves the caret to the top of the message,
and destroys the undo history"* to "every call that passes a body", and nothing
re-checked it. If the spec's sentence were literally true, the caret would be at
the top of the message before `insertIntoBody` reads the selection, and
caret-relative insertion, selection replacement and "cursor left somewhere
sensible" would all be broken on every insert.

It is not literally true. `browser.compose.setComposeDetails` in
`mail/components/extensions/parent/ext-compose.js` hands the details to
`SetComposeDetails` in `mail/components/compose/content/MsgComposeCommands.js`,
where the entire document rewrite sits inside one guard:

```js
const editor = GetCurrentEditor();
if (typeof newValues.body == "string") {
  // eslint-disable-next-line no-unsanitized/property
  editor.document.documentElement.innerHTML = newValues.body;
  editor.beginningOfDocument(); // Move caret to the first editable point.
  editor.clearUndoRedo();
  gMsgCompose.bodyModified = true;
}
```

`typeof … == "string"` and not a truthiness test, so even `body: ""` rebuilds —
but an absent `body` does not enter the branch at all. `deliveryFormat` is
handled separately in `ext-compose.js`, where it sets
`compFields.deliveryFormat` and calls `initSendFormatMenu()`, which only
re-checks four menu items. So the call as written cannot move the caret, drop
the selection or clear undo. The two marks it does leave are unconditional and
harmless here: `gContentChanged = true`, on a message this insert is about to
change anyway, and a `focus()` restoring whatever was focused on entry. Read at
comm-central tip in September 2026; not re-checked against an older ESR.

The code is therefore unchanged, and the comment above the call cites the
implementation instead of restating the spec's sentence, so the next reader does
not have to redo this. The spec's own wording in "Insertion mechanism"
overstates it and is left standing as the historical record it is.

**The leading-newline reason is back.** Ticket 05 made `restoreLeadingNewline`
unreachable and removed it, and the recorded *why* went with it. It is now a
comment on `stripBlankEdgeLines`, which is where the guarantee that replaced it
lives: an HTML parser eats a newline directly after `<pre>`, and nothing has to
compensate for that only because the leading trim means the content can never
start with one. Loosen the trim and the compensation has to come back.

**`vitest.config.js` now states `include: ["tests/**/*.test.js"]`.** Vitest's
default glob is the whole tree, so `pnpm test` in a checkout with agent
worktrees under `.claude/` ran dozens of stale duplicates of this suite and
reported their failures as this one's. Tests live in `tests/`; the config says
so now, next to the `environment: "node"` line and for the same reason — stating
the convention rather than leaving it to a default.
