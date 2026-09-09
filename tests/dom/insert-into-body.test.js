import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildCodeBlockHtml } from "../../src/code-block/build-code-block-html.js";
import { insertIntoBody } from "../../src/compose/insert-into-body.js";

/**
 * The insertion function's two DOM paths, driven against a simulated compose
 * body.
 *
 * The function is handed to `scripting.executeScript({ func })` and re-evaluated
 * inside the compose editor's sandbox, so it is self-contained by requirement
 * and takes only its argument object. That is what makes it callable from here
 * with no seam to build: a document and a selection are the whole of its
 * environment. What it reports back - which of its three paths ran - is the
 * interface these tests assert through, and until this file existed nothing
 * read it.
 *
 * **The gap here is deliberate.** Its preferred path is an editor command, and
 * no simulated DOM implements one: `tests/dom/tier.test.js` pins that
 * `document.execCommand` is undefined in this tier, and the ADR records that
 * neither jsdom nor its alternative has it. So every test below says out loud
 * what the command answered, and the two fallbacks are covered with it
 * reporting failure. The claim the preferred path is chosen for - that a real
 * editor action joins the undo stack and marks the message modified - is a
 * claim about Gecko's editor and cannot be made here at all. It belongs to the
 * real-Thunderbird tier, and the one thing this tier can say about that path is
 * the one asserted below: when the command answers yes, neither fallback
 * touches the document.
 *
 * Nothing in here writes out markup. The content is what the popup would hand
 * over - `buildCodeBlockHtml`'s `html` for an HTML composer and its `text` for
 * a plain-text one - so retuning the block cannot fail these tests, and the
 * document is read back as visible text rather than as a shape.
 */

/**
 * The source a user pasted. Indented, and carrying angle brackets that look
 * like markup, because both are what the plain-text assertions are about: the
 * indentation is what this whole feature exists to protect, and a `<b>` that
 * arrives as an element rather than as two characters is the bug a plain-text
 * composer is a different editor in order to avoid.
 */
const snippet = 'function shout(word) {\n\treturn "<b>" + word + "</b>";\n}\n';

/**
 * A real block from the pipeline rather than a hand-written string, because
 * this is exactly what the popup passes: `html` for an HTML composer, and
 * `text` - the normalised source, tabs expanded - for a plain-text one. The
 * language is named so nothing here depends on what detection makes of the
 * fixture.
 */
const block = buildCodeBlockHtml({ source: snippet, language: "plaintext" });

/**
 * The editor command this tier does not have, taught to the document for the
 * length of one test, answering what the test tells it to and recording what
 * it was asked for.
 *
 * Stated per test rather than left to jsdom's absence. An absent command
 * throws and the function falls through to the DOM path, so the fallbacks
 * would be reached either way - but then the test would be silent about which
 * of "the command said no" and "there was no command" it was covering, and the
 * day a simulated DOM grows an `execCommand` that answers `true` the whole
 * file would go green while asserting nothing.
 */
const editorCommand = (answer) => {
  const asked = [];
  document.execCommand = (command, showUi, value) => {
    asked.push({ command, showUi, value });
    return answer;
  };
  return asked;
};

/**
 * Drops a caret into a text node, the way clicking into a message does.
 */
const caretAt = (node, offset) => {
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  const selection = document.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
};

/**
 * What the user types next, put in wherever the caret now is.
 *
 * This is how "the caret is left after the block" is asserted: the property
 * that matters is that carrying on typing continues after the block rather
 * than inside or before it, and reading it back this way says that without
 * pinning which node and offset the implementation chose to express it as.
 */
const typeAtCaret = (text) => {
  document
    .getSelection()
    .getRangeAt(0)
    .insertNode(document.createTextNode(text));
};

/**
 * Whether these read in this order in the body's visible text.
 *
 * The body is read as text and not as markup on purpose: the block wraps
 * itself and the composer's own paragraphs are the composer's business, so
 * asserting on either would fail the day something gains an attribute without
 * changing what anyone reads. Every assertion below passes the text itself as
 * the label, so a failure reports what the body actually said.
 */
const readsInOrder = (...parts) => {
  const text = document.body.textContent;
  let from = 0;
  return parts.every((part) => {
    const at = text.indexOf(part, from);
    from = at + part.length;
    return at !== -1;
  });
};

/** Elements in the body, for asserting that content did or did not parse. */
const elementCount = () => document.body.querySelectorAll("*").length;

describe("insertIntoBody", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.getSelection().removeAllRanges();
  });

  afterEach(() => {
    // Put back the way this tier found it - absent - so that no test can pass
    // because an earlier one taught the document a command of its own.
    delete document.execCommand;
  });

  describe("with the editor command reporting failure", () => {
    /**
     * The caret is where the user put it, so the block goes in there and not
     * at either end, and what was on both sides of it stays on both sides of
     * it. Splicing into the middle of a paragraph is the case that would
     * quietly lose the tail of it.
     */
    it("splices the block in at the caret and leaves the caret after it", () => {
      document.body.innerHTML = "<p>Here it is: and that is all.</p>";
      const paragraph = document.querySelector("p").firstChild;
      caretAt(paragraph, "Here it is: ".length);
      editorCommand(false);

      expect(
        insertIntoBody({ content: block.html, isPlainText: false }),
      ).toEqual({ mechanism: "range" });

      typeAtCaret("Thanks!");
      expect(
        readsInOrder("Here it is: ", block.text, "Thanks!", "and that is all."),
        document.body.textContent,
      ).toBe(true);
    });

    /**
     * The commonest way to reach this: a composer whose body has never been
     * clicked into has no selection at all. Appending rather than failing is
     * what keeps the button from appearing to do nothing, and the reported
     * mechanism is how the popup - which closes on insert and takes its
     * console with it - could ever tell the two apart.
     */
    it("appends when the body has no caret in it, and reports that it did", () => {
      document.body.innerHTML = "<p>Morning,</p>";
      editorCommand(false);

      expect(
        insertIntoBody({ content: block.html, isPlainText: false }),
      ).toEqual({ mechanism: "append" });

      expect(
        readsInOrder("Morning,", block.text),
        document.body.textContent,
      ).toBe(true);
    });

    /**
     * A caret that is somewhere other than the message body is not a caret
     * this function may insert at, so it appends as if there were none. The
     * failure this rules out is a block spliced into whatever else on the page
     * happened to hold the selection.
     */
    it("appends when the caret is outside the message body", () => {
      document.body.innerHTML = "<p>Morning,</p>";
      const elsewhere = document.createElement("title");
      elsewhere.textContent = "not the message";
      document.head.append(elsewhere);
      caretAt(elsewhere.firstChild, 0);
      editorCommand(false);

      const inserted = insertIntoBody({
        content: block.html,
        isPlainText: false,
      });
      elsewhere.remove();

      expect(inserted).toEqual({ mechanism: "append" });
      expect(
        readsInOrder("Morning,", block.text),
        document.body.textContent,
      ).toBe(true);
    });

    /**
     * A plain-text composer is a different editor rather than the same one
     * with the styling switched off, so what goes in is the source itself:
     * text, with the angle brackets in it staying two characters rather than
     * becoming an element, and with the indentation the block exists to
     * preserve arriving as it left.
     *
     * The same claim is made against a real plain-text composer by the
     * real-Thunderbird tier, where the editor doing the accepting is Gecko's
     * plaintext editor. What is asserted here is the fallback path: the source
     * reaching the body as a text node and nothing being parsed out of it.
     */
    it("puts a plain-text composer's source in as text, indentation and all", () => {
      document.body.innerHTML = "<pre>Morning,\n</pre>";
      const body = document.querySelector("pre").firstChild;
      caretAt(body, body.length);
      editorCommand(false);

      const before = elementCount();
      expect(
        insertIntoBody({ content: block.text, isPlainText: true }),
      ).toEqual({ mechanism: "range" });

      // The fixture has to be indented for this test to mean anything, so it
      // says so rather than trusting itself.
      expect(block.text).toMatch(/\n +return/);
      expect(document.body.textContent).toContain(block.text);
      expect(document.body.textContent).toContain('"<b>"');
      expect(elementCount()).toBe(before);
    });

    /**
     * The two properties are independent - which path ran, and what that path
     * puts in the document - so the plain-text case is covered on both. A
     * composer never clicked into is where the append path is commonest, and
     * it is the one where markup arriving instead of text would be least
     * likely to be noticed before the message went out.
     */
    it("appends a plain-text composer's source as text as well", () => {
      document.body.innerHTML = "<pre>Morning,\n</pre>";
      editorCommand(false);

      const before = elementCount();
      expect(
        insertIntoBody({ content: block.text, isPlainText: true }),
      ).toEqual({ mechanism: "append" });

      expect(document.body.textContent).toContain(block.text);
      expect(elementCount()).toBe(before);
    });

    /**
     * Content that parses to nothing is inserted, and then there is nothing to
     * put the caret after: a fragment that turned out empty was never inserted
     * and so has no parent, and repositioning relative to it would throw. The
     * user-visible cost of that throw would be an insert reported as failed
     * for a document that is exactly as they left it.
     */
    it("does not throw when the content turns out to produce an empty fragment", () => {
      document.body.innerHTML = "<p>Morning,</p>";
      caretAt(document.querySelector("p").firstChild, "Morning".length);
      editorCommand(false);

      let inserted;
      expect(() => {
        inserted = insertIntoBody({ content: "", isPlainText: false });
      }).not.toThrow();

      expect(inserted).toEqual({ mechanism: "range" });
      expect(document.body.textContent).toBe("Morning,");

      // And the caret is still somewhere usable rather than dropped, which is
      // the other half of "the document is as the user left it".
      typeAtCaret("!");
      expect(document.body.textContent).toBe("Morning!,");
    });
  });

  describe("when the editor command succeeds", () => {
    /**
     * The one thing this tier can say about the path it cannot run: that a
     * command which answers yes is the end of it. Neither fallback may touch
     * the document afterwards, or an insert that the editor already made would
     * be made a second time by hand - two blocks, and the second one outside
     * the undo step the first one created.
     *
     * The command here inserts nothing, so a document that is unchanged is the
     * whole assertion. What it actually does to a real body, and whether that
     * lands in the undo stack, is the real-Thunderbird tier's to say.
     */
    it("reports the editor command and leaves the document to it", () => {
      document.body.innerHTML = "<p>Here it is: and that is all.</p>";
      caretAt(document.querySelector("p").firstChild, "Here it is: ".length);
      const asked = editorCommand(true);
      const untouched = document.body.innerHTML;
      const caret = document.getSelection().getRangeAt(0);

      expect(
        insertIntoBody({ content: block.html, isPlainText: false }),
      ).toEqual({ mechanism: "execCommand" });

      expect(document.body.innerHTML).toBe(untouched);
      expect(asked).toEqual([
        { command: "insertHTML", showUi: false, value: block.html },
      ]);

      // The caret is the editor's to move on this path, so the function leaves
      // it exactly where it found it rather than repositioning a block it did
      // not place.
      const after = document.getSelection().getRangeAt(0);
      expect(after.startContainer).toBe(caret.startContainer);
      expect(after.startOffset).toBe(caret.startOffset);
    });

    /**
     * Which command is asked for is the whole of the difference between the
     * two composers on this path: the plaintext editor rejects an HTML insert,
     * and its own insert is what maps the source's newlines onto whatever that
     * editor represents a line break with instead of this function guessing.
     */
    it("asks the plain-text editor for its own insert, not an HTML one", () => {
      document.body.innerHTML = "<pre>Morning,\n</pre>";
      const body = document.querySelector("pre").firstChild;
      caretAt(body, body.length);
      const asked = editorCommand(true);

      expect(
        insertIntoBody({ content: block.text, isPlainText: true }),
      ).toEqual({ mechanism: "execCommand" });

      expect(asked).toEqual([
        { command: "insertText", showUi: false, value: block.text },
      ]);
    });
  });
});
