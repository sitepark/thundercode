# 09: Plain-text composers

**What to build:** The button should never appear broken. In a plain-text compose window there is no HTML to insert, so insert the normalised source verbatim with no markup. Verbatim code in a plain-text mail is a perfectly good outcome — it is what mailing lists have done for decades.

The compose format of an open window cannot be changed, so do not offer to switch it.

**Blocked by:** 02, 05

**Status:** ready-for-human

- [ ] In a plain-text compose window the button is enabled and inserting works
- [x] The inserted text is the normalised source with no markup, styling or wrapper
- [x] Indentation is preserved
- [x] No attempt is made to change the message's compose format, and no error is shown for being in plain-text mode
- [ ] The insert lands at the cursor, consistent with the HTML path

## Comments

### The seam's return value changed, and every later ticket inherits it

`buildCodeBlockHtml` now returns a third field:

```
buildCodeBlockHtml({ source, language, themeMap, tabWidth, fontSize })
  -> { html, text, detectedLanguage }
```

`text` is the normalised source: the same code as `html`, without the `<pre>`,
without the inline styles and without the HTML escaping. The parameters are
untouched, and `html` and `detectedLanguage` mean exactly what they meant
before, so nothing that already destructures the result breaks.

This is the shape ticket 05 asked for in as many words, and for its reason: the
plain-text composer needs the normalised source, normalisation is internal, and
re-running the four transforms next to the popup would be a second copy that
drifts from the first the moment either changes. The seam stays pure and stays
the only export.

**Ticket 03 has one obligation here:** `text` must remain the *unhighlighted*
normalised source. Highlighting is a property of the HTML rendering only —
there is no such thing as a highlighted plain-text mail, and putting escapes or
markers in `text` would put them in the message. The comment at the return
statement says so too.

Ticket 06's preview can also use `text` for free if it ever wants to show what a
plain-text composer would receive, though nothing asks for that today.

### One insert function, two modes, rather than two functions

`insertIntoBody` now takes `{ content, isPlainText }` instead of a bare `html`
string, and picks `execCommand("insertText")` and a plain text node where it
used to always pick `execCommand("insertHTML")` and a parsed fragment.

A plain-text composer is a different editor, not the same one with the styling
switched off: Gecko backs it with a plaintext editor, which rejects
`insertHTML`. Feeding it markup would either fail or put literal angle brackets
in the message.

The choice of one function over two is about what cannot be shared. The
function crosses into the compose sandbox as serialised source, so it can close
over nothing — two functions would be two copies of the caret resolution, the
end-of-body fallback and the mechanism reporting, all of which are identical in
both modes. Only two lines actually differ. Both of ticket 01's properties
therefore survive unchanged and in one place: the `append` fallback when no
usable caret is in the body, and the `execCommand` / `range` / `append`
reporting through `console.info("ThunderCode: inserted via", …)`.

The log line's wording is deliberately unchanged, so ticket 01's hands-on pass
still looks for the same string. Which command ran is implied by the composer
it ran in.

### Ticket 02's predicted symptom, and why the fix is a call not made

Ticket 02 expected `setComposeDetails({ deliveryFormat: "both" })` to be
rejected on a plain-text composer, leaving the popup showing an error and
inserting nothing. The popup now reads `isPlainText` from
`compose.getComposeDetails` and skips that call entirely for a plain-text
message.

Skipping it is not a workaround for an API that says no. `deliveryFormat`
describes how an *HTML* message is put on the wire — `"auto"`'s failure mode is
downgrading HTML to plain text, and `"both"` buys the plain-text alternative
part. A plain-text message has no HTML part to downgrade and no alternative to
gain, so there is nothing the setting could be protecting. Whether the API
would actually have rejected it is now moot and stays unverified.

No format switch is offered anywhere, per the spec: it cannot be done on an
open window, and `setComposeDetails` ignores `isPlainText`.

### What is verified, and the boxes only a running composer can tick

`pnpm test` covers the seam's new `text`: that it is the normalised source and
not the raw paste, that relative indentation survives, that it carries the
source's real characters with no escaping (a literal `&lt;` arriving in a
plain-text mail is the failure that test exists for), that it has no markup or
wrapper,
and that it is empty when the source normalises away. As everywhere else in
this feature, the tests drive `buildCodeBlockHtml` only.

Two boxes are unticked — **the button working in a plain-text compose window**
and **the insert landing at the cursor** — for the same reason as tickets 01
and 02: the only Thunderbird on this machine is 115.10.1, and an MV3
MailExtension does not load below 128, so the extension cannot be installed
here at all. Both are implemented; neither is observable outside a running
composer.

Add them to the hands-on pass tickets 01 and 02 already need. Open a plain-text
composer (Write with Shift held, or an account set to plain text), paste
something indented, insert, and check three things: the block lands at the
caret rather than at the end, it arrives as bare text with no angle brackets,
and no error line appears in the popup. The Error Console shows which path ran.

### Accepted wart: Thunderbird's own line wrapping on send

A plain-text message is wrapped on send at `mailnews.wraplength` (72 by
default), which can hard-wrap a code line longer than that. Nothing per-message
can turn it off — it is a global pref, and the alternative would be to ask the
user to change one. Indentation itself is unaffected, since the wrap inserts a
break rather than moving the line's start, and the HTML path is the one that
guarantees long lines survive intact. Worth a look during the hands-on pass on
a snippet with a long line, because it is the one thing that could make the
plain-text output differ from what the popup was given.

### Deliberately not done

- **No separator on the append fallback.** When no caret is usable the block is
  appended verbatim, with nothing added to hold it off what precedes it. In
  HTML the `<pre>` separates itself; in plain text a leading newline would put
  dead space at the top of the commonest case that reaches this path, a
  composer whose body has never been clicked into.
- **No plain-text branch in the popup's UI.** The textarea, the size warning
  and the error line are the same in both modes. The composer's format is not
  the user's choice at this point, so telling them about it would be noise.
- **No test of the insert path.** It touches the DOM and `browser.*`, which is
  exactly what the runner has no environment for, and the spec puts compose
  insertion in "what is not unit tested".
