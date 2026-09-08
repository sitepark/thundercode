/**
 * Inserts `html` into the compose editor's body at the caret.
 *
 * This function is not called here — it is handed to
 * `scripting.executeScript({ func })`, which serialises it by source and
 * re-evaluates it inside the compose editor's sandbox. It must therefore be
 * entirely self-contained: no imports, no closure variables, no reliance on
 * anything in this module. Only the `html` argument crosses over.
 *
 * The returned `mechanism` says which of the three paths ran, which is how the
 * insertion mechanism is observable from outside the sandbox.
 *
 * @param {string} html
 * @returns {{ mechanism: "execCommand" | "range" | "append" }}
 */
export function insertIntoBody(html) {
  const body = document.body;

  const parseHtml = (source) => {
    const template = document.createElement("template");
    template.innerHTML = source;
    return template.content;
  };

  const selection = document.getSelection();

  const caretRange = (() => {
    if (!selection || selection.rangeCount === 0) {
      return null;
    }
    const range = selection.getRangeAt(0);
    return body.contains(range.commonAncestorContainer) ? range : null;
  })();

  // Reported from in here rather than from the popup, because the popup closes
  // on insert and takes its console with it. This line is the whole
  // observation for findings 2 and 3 on ticket 01.
  const report = (mechanism) => {
    console.info("ThunderCode: inserted via", mechanism);
    return { mechanism };
  };

  if (caretRange) {
    // Preferred path: a real editor action, so it joins the undo stack and
    // marks the message modified. It runs unsanitised, so inline styles
    // survive, and it deletes any selection as part of the insert.
    try {
      if (document.execCommand("insertHTML", false, html)) {
        return report("execCommand");
      }
    } catch {
      // Not reachable from this sandbox; fall through to the DOM path.
    }

    const fragment = parseHtml(html);
    const lastInserted = fragment.lastChild;
    caretRange.deleteContents();
    caretRange.insertNode(fragment);
    if (lastInserted) {
      const afterBlock = document.createRange();
      afterBlock.setStartAfter(lastInserted);
      afterBlock.collapse(true);
      selection.removeAllRanges();
      selection.addRange(afterBlock);
    }
    return report("range");
  }

  // No caret anywhere in the body: append rather than fail, so the button
  // never appears to do nothing.
  body.appendChild(parseHtml(html));
  return report("append");
}
