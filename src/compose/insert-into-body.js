/**
 * Inserts a code block into the compose editor's body at the caret.
 *
 * This function is not called here - it is handed to
 * `scripting.executeScript({ func })`, which serialises it by source and
 * re-evaluates it inside the compose editor's sandbox. It must therefore be
 * entirely self-contained: no imports, no closure variables, no reliance on
 * anything in this module. Only the argument object crosses over.
 *
 * A plain-text composer is a different editor rather than the same one with
 * the styling switched off: Gecko backs it with a plaintext editor, which
 * rejects `insertHTML` and would show markup as literal angle brackets if it
 * did not. So `isPlainText` switches the editor command and what the DOM
 * fallback puts in the document. Everything around that - resolving the caret,
 * appending when there is none, and reporting which path ran - is identical in
 * both modes, which is why this stays one function: nothing can be shared
 * between two of them, since each crosses the sandbox boundary as its own
 * source text.
 *
 * The returned `mechanism` says which of the three paths ran, which is how the
 * insertion mechanism is observable from outside the sandbox.
 *
 * @param {object} block
 * @param {string} block.content The block as this composer takes it: HTML for
 *   an HTML composer, the normalised source verbatim for a plain-text one.
 * @param {boolean} block.isPlainText
 * @returns {{ mechanism: "execCommand" | "range" | "append" }}
 */
export function insertIntoBody({ content, isPlainText }) {
  const body = document.body;

  // What the two DOM paths put in the document. A plain-text composer's body
  // is laid out as preformatted text, so the newlines of a plain text node are
  // real line breaks there and go out on the wire as themselves; parsing the
  // same string as HTML would instead collapse the indentation this whole
  // feature exists to protect, and turn a `<` in the code into an element.
  const buildContent = () => {
    if (isPlainText) {
      return document.createTextNode(content);
    }
    const template = document.createElement("template");
    template.innerHTML = content;
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
    // Preferred path in both modes: a real editor action, so it joins the undo
    // stack and marks the message modified, and it deletes any selection as
    // part of the insert. `insertHTML` runs unsanitised, so inline styles
    // survive; `insertText` is the plaintext editor's own insert, so it maps
    // the newlines onto whatever that editor represents a line break with
    // instead of us guessing.
    try {
      const command = isPlainText ? "insertText" : "insertHTML";
      if (document.execCommand(command, false, content)) {
        return report("execCommand");
      }
    } catch {
      // Not reachable from this sandbox; fall through to the DOM path.
    }

    const inserted = buildContent();
    // `insertNode` empties a fragment, so the node to put the caret after has
    // to be picked out first. A text node is its own last node.
    const lastInserted = inserted.lastChild ?? inserted;
    caretRange.deleteContents();
    caretRange.insertNode(inserted);
    // A fragment that turned out to be empty was never inserted and so has no
    // parent; `setStartAfter` on it would throw.
    if (lastInserted.parentNode) {
      const afterBlock = document.createRange();
      afterBlock.setStartAfter(lastInserted);
      afterBlock.collapse(true);
      selection.removeAllRanges();
      selection.addRange(afterBlock);
    }
    return report("range");
  }

  // No caret anywhere in the body: append rather than fail, so the button
  // never appears to do nothing. Nothing is added to separate the block from
  // what precedes it - in HTML the block separates itself, and in plain text a
  // leading newline would put dead space at the top of the commonest case
  // reaching here, a composer whose body has never been clicked into at all.
  body.appendChild(buildContent());
  return report("append");
}
