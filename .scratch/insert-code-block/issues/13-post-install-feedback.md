# 13: Post-install feedback

**What to build:** Three fixes reported after the first hands-on install of the packaged extension. None of them is a spec requirement — the spec says nothing about the icon, spell checking or corner radius — so this file, rather than an amendment to `spec.md`, is where they live.

**Blocked by:** None (all of 01–12 are merged)

**Status:** ready-for-human

- [x] The toolbar button paints an icon
- [x] The inserted block is not spell-checked
- [x] The block has rounded corners
- [ ] **Hands-on:** the button shows the `< >` glyph in the compose window's format toolbar, on the default theme
- [ ] **Hands-on:** the same, with a dark theme applied — the glyph should be light ink, as legible as Thunderbird's own buttons beside it
- [ ] **Hands-on:** insert a block containing identifiers a dictionary would reject (`getEnv`, `usr`, `strlen`) and confirm no red underlines appear inside it, while a misspelling in the surrounding prose still gets one
- [ ] **Hands-on:** the block's corners are rounded in the compose window and in the message as received
- [x] The popup follows Thunderbird's light or dark appearance
- [ ] **Hands-on:** with a dark theme, the popup's canvas, textarea, dropdown and button are dark, and the warning and error lines are legible
- [ ] **Hands-on:** the preview still shows a light block on white paper under a dark theme, since that is what the recipient will see
- [ ] **Hands-on:** the same for the options page in the Add-ons Manager

## Comments

### The icon (`icons/thundercode.svg`, `manifest.json`)

Fixed twice. The first attempt was right about the cause and wrong about the remedy, and the second round of feedback — "other icons are displayed white, the icon of this extension is dark and hard to see" — is what exposed that.

**Why the button was blank.** The icon painted itself with `stroke="context-fill, currentColor"` and nothing was ever going to paint it. Two faults, and the second is the one that matters: the value is not valid paint syntax, `context-fill` taking no comma-separated fallback list — but even written correctly it would not have worked. Read out of the installed build rather than assumed, `chrome://messenger/content/messenger/webextensions.css` is the whole of the integration for an action button and sets only `list-style-image` from the `--webextension-toolbar-image*` variables, and `-moz-context-properties` appears nowhere in the messenger chrome. So `context-fill` and `context-stroke` — the idiom Thunderbird's *own* icons are drawn with, and the reason it looks like the right thing to copy — resolve to no paint at all in an add-on's icon.

**Why the first fix then went dark-on-dark.** It replaced the context paint with a literal colour and handled the theme with `theme_icons`, two files, one drawing per polarity. `theme_icons` is genuinely supported here — `ExtensionToolbarButtons.jsm` passes `theme_icons` into `IconDetails.normalize` and `webextensions.css` selects the light variant under `@media (prefers-color-scheme: dark)` — but it never got read, because the button's icon data is resolved once through `StartupCache.get`, whose key is `[extension.id, extension.version, ...]`. The version was still `0.1.0` across the reinstall, so the cache served the entry computed by the previous install, from a manifest that had no `theme_icons` in it. All three CSS variables kept pointing at the one dark-ink file.

**The fix.** The icon recolours itself, and depends on nothing outside its own file:

```
path { stroke: #2b2a33; }
@media (prefers-color-scheme: dark) { path { stroke: #fbfbfe; } }
```

An SVG used as an image is its own document, but Gecko propagates the embedding element's used colour scheme into it — bug 1782595, landed in Firefox 105, so comfortably below the 128 floor — which makes `prefers-color-scheme` inside the file report the toolbar's scheme rather than the system's. Verified here rather than taken on trust: rendered through `list-style-image` specifically, the property Thunderbird actually uses, inside `color-scheme: light` and `color-scheme: dark` containers. Light gives `#2b2a33` strokes, dark gives `#fbfbfe`.

So `theme_icons` and the second file are gone. One drawing, one file, and no way for it to be stale — which is the property the startup cache took away.

The version is bumped to `0.1.1` regardless. It invalidates the cache entry that hid the last fix, and the artefact did change.

`tests/manifest.test.js` pins both halves: no context paint, and a dark-scheme rule rather than a second file. It is the regression guard for a bug whose only symptom is a button nobody can see.

### Spell checking (`src/code-block/build-code-block-html.js`)

`spellcheck="false"` on the `<pre>`. The compose body is a spell-checked contenteditable and code is not prose: every identifier, keyword and path in the block is a misspelling to a dictionary, so the block arrived under a wall of red that flagged nothing worth reading and made the one real squiggle in the sentence above it invisible.

It is the only attribute on the block besides `style`, and a test pins that, because the attribute is an exception to a markup contract that is otherwise "styling and nothing else". It is not styling, so it cannot go in the style attribute. It rides into the sent message, where it is inert for a reader and useful for the one recipient who quotes the block in a reply — their editor gets the same opt-out.

Not reachable in the plain-text rendering, which has no markup to carry an attribute. Nothing can be done about that and nothing should be: the same paste in a plain-text composer will be spell-checked.

### Rounded corners (`src/code-block/build-code-block-html.js`)

`border-radius: 6px`, stated next to the border and the fill, which are already this block's own chrome rather than theme colours.

Kept as a separate declaration from the border rather than folded into a shorthand, because a mail client may take one and not the other — Outlook's Word renderer ignores `border-radius` outright. That degradation is the square-cornered block this had yesterday, so nothing is lost where it is dropped.

### Dark mode (`src/popup/popup.css`, `src/options/options.css`)

Reported for the popup; the options page had the identical defect one click away, so it is fixed in the same change. Say if that should be split back out.

Almost nothing in either file states a colour — that is deliberate, and it is why the textarea, the dropdown and the button look native rather than approximately native. What it needs is permission. A document silent about `color-scheme` is a light-only document, so Gecko keeps handing it the light `Canvas`, `CanvasText` and widget colours however dark the window around it is, which is the white rectangle that was reported. One declaration on `:root` fixes the whole of the borrowed part, scrollbars and form controls included:

```
:root { color-scheme: light dark; }
```

The colours the files do state cannot come along for free, so each is stated twice with `light-dark()` — the warning amber, the error red, and the options page's hint grey. Each pair is one hue at two lightnesses, picked so the dark value sits about as far off the dark canvas as the light value does off white (5.5:1 and 6.6:1 for the warning, 6.6:1 and 6.2:1 for the error). Picking the second value by eye is how a warning ends up shouting on one appearance and invisible on the other.

**The preview is the one surface that does not follow.** It is now explicitly white, with its own `color-scheme: light`. The block carries its own light fill and text colour inline because it is going into a message and a message body is white; a preview that went dark with the popup would be showing the user something no recipient will ever see. Making it a light-scheme surface also puts its scrollbar on the paper rather than in the popup.

The block itself stays light for the same reason, on every theme. A dark code block is a dark code block in the recipient's inbox too, and the seam has no idea what colour that inbox is.

Verified by rendering both stylesheets headlessly under a forced dark scheme rather than by reasoning about them — canvas `#1c1b22`, controls dark, both message lines legible, the preview still white paper. `tests/styles.test.js` pins the rule going forward: `color-scheme` declared, and every `color:` in either file written as a `light-dark()` pair.
