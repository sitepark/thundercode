# 02: Insert an unhighlighted code block from pasted source

**What to build:** Paste real code into the popup and insert it as a properly formatted code block: monospaced, bordered, exactly indented, soft-wrapping, and intact when the message is sent. No syntax colouring yet.

This is deliberately the graceful-degradation baseline. Colour is a bonus that arrives in ticket 03; monospace rendering with faithful whitespace is the contract that must hold in every mail client, including the ones that strip styling. If this slice is right, the worst any recipient ever sees is this.

It also introduces the single seam the whole feature is tested through: one pure function that takes the source text, a language, a theme map and options, and returns the HTML plus the language it used. Normalisation, highlighting, style inlining and the wrapper all live behind it as internals and are never tested directly.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] The popup has an autofocused textarea, so pasting is a single keystroke
- [ ] The clipboard is never read automatically, and no clipboard permission is requested
- [ ] Indentation in the pasted source is reproduced exactly in the inserted block
- [ ] The inserted block is a single preformatted element using inline styles only: no class attributes, no style element, no table wrapper
- [ ] An explicit monospace font stack ending in the generic `monospace` keyword
- [ ] Font size specified in pixels, not em or rem, set once on the block and inherited rather than repeated per token
- [ ] An explicit line height
- [ ] Long lines soft-wrap; the source text is never hard-wrapped, as that would corrupt the code
- [ ] Border, background, padding and vertical margins present, so the block reads as code at a glance
- [ ] No line numbers and no language label
- [ ] HTML metacharacters in the source are escaped: source containing markup cannot inject elements into the message
- [ ] The delivery format is set explicitly on insert, so the message is not silently downgraded to plain text on send
- [ ] Verified by sending a message to yourself and reading it back: the block arrives intact as HTML, with a plain-text alternative part present
- [ ] The seam is a pure function with no DOM access and no extension API access inside it, taking the theme map as injected data
- [ ] A test runner is added as a dev-only dependency using pnpm, running under Node with no DOM environment
- [ ] Tests drive the seam only, never its internals, and assert on the contract items above rather than on incidental markup shape such as attribute ordering
- [ ] Tests cover empty source, a single line with no trailing newline, source that is entirely blank lines, and a single very long line
