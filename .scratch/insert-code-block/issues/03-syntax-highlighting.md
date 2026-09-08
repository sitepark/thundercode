# 03: Syntax highlighting

**What to build:** Colour on top of ticket 02's block. Choose a language from a dropdown and the inserted code is syntax highlighted, with every colour written as an inline style attribute so it survives the recipient replying, forwarding, or copying the code elsewhere.

Colours are never transcribed by hand. The theme stylesheet stays the single source of truth: its rules are read at runtime through the browser's own CSS parser and reduced to a flat map from token class to inline declaration, which is then injected into the seam. Swapping themes must remain a one-file change.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] The prebuilt common-languages distribution of the highlighter and the GitHub light theme stylesheet are vendored directly, with no bundler and no build step for shipped code
- [ ] The theme map is built by reading the stylesheet's own rules, not by regex and not by a hand-written colour table
- [ ] Only text colour, font weight and font style are inlined; no other properties are copied
- [ ] A language dropdown lists the bundled languages, and the chosen language is the one used
- [ ] Tokens in the inserted block carry inline style attributes derived from the theme map
- [ ] A token class absent from the theme map degrades to an unstyled span rather than throwing
- [ ] Every colour in use is legible on a white background, since a recipient's client may drop the block's background
- [ ] Verified by replying to a message containing a block: the colours survive in the quoted text
- [ ] Tests inject a small fixture theme map rather than loading the shipped stylesheet, so changing theme cannot break the suite
- [ ] Tests confirm classes are translated to inline styles and that no class attribute or style element is emitted
