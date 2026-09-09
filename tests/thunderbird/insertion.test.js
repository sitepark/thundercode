import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildCodeBlockHtml } from "../../src/code-block/build-code-block-html.js";
import { repoRoot } from "./harness/pins.js";
import { ACTION_TOOLBAR_ID, startThunderbird } from "./harness/session.js";

/**
 * What the add-on does, asserted instead of performed.
 *
 * compose-window.test.js proves the mechanism - a pinned Thunderbird with this
 * checkout installed, opening a compose window and carrying the add-on's
 * button. This file uses it: a snippet goes into the popup and a block comes
 * out in the message body, through the toolbar button, through the shortcut,
 * through a right-click, and into a plain-text composer. Every item these
 * assertions cover has come off docs/release-checklist.md, so a failure here
 * is a claim that used to be checked by hand and now is not checked at all.
 *
 * The popup is driven from outside, because its document cannot be read from
 * anywhere (see `openActionPopup()` in harness/session.js). Two consequences
 * shape every test below:
 *
 * 1. What is asserted is the message body, which is the right thing to assert
 *    anyway - it is what a recipient gets and the only thing a user asked for.
 * 2. A focus failure would look exactly like a passing test, because the
 *    snippet would be typed into the body instead. So `insertThroughPopup`
 *    reads the body once before confirming and expects it unchanged, and
 *    every test goes through it.
 */

const manifest = JSON.parse(
  readFileSync(path.join(repoRoot, "manifest.json"), "utf8"),
);

/**
 * A snippet with all four characters that would turn into markup or entities
 * if anything on the way handed the source to an HTML parser. The block's text
 * coming back equal to this is the assertion the checklist used to make by eye.
 */
const CODE = 'if (a < b && c > "d") { alert(\'hi\'); }';

/**
 * The class on the wrapper the block puts itself in, by the name Thunderbird
 * knows it by.
 *
 * Written out rather than read from the seam, which keeps it private, and the
 * same way tests/node/code-block.test.js writes it out in the one assertion
 * there that is about the wrapper. These tests are about the wrapper: it is
 * what keeps the spell checker out of the block, so "a block inside the
 * wrapper" is the claim rather than "a block somewhere in the body".
 */
const WRAPPER_CLASS = "moz-forward-container";

/** Prose, for the two claims that are about content nobody would highlight. */
const PROSE = "just a sentence, no code in it at all";

/**
 * The line the insertion function logs to say which of its three paths ran.
 * It is a literal in src/compose/insert-into-body.js rather than an export,
 * because the only thing that reads it is a person watching the console - the
 * popup closes before it could read the return value. This tier is the second
 * reader.
 */
const MECHANISM_REPORT = "ThunderCode: inserted via";
const EDITOR_COMMAND = `${MECHANISM_REPORT} execCommand`;

let session;

beforeAll(async () => {
  session = await startThunderbird({ log: console.log });
}, 600_000);

afterAll(async () => {
  await session?.stop();
});

/**
 * The blocks in the message body, read back by the wrapper they sit in rather
 * than by matching markup.
 *
 * Asserting on the literal HTML would fail the day the seam adds an attribute,
 * and here it would fail sooner than that: the editor normalises what it takes
 * in, so `#24292e` comes back as `rgb(36, 41, 46)` and a string comparison
 * against the seam's own output fails while nothing at all is wrong.
 */
const blocksIn = (compose) =>
  compose.chrome(
    `const [wrapperClass] = arguments;
     return Array.from(
       GetCurrentEditor().rootElement.getElementsByClassName(wrapperClass)
     ).map((wrapper) => ({
       children: Array.from(wrapper.children).map((child) => child.localName),
       text: wrapper.textContent,
     }));`,
    WRAPPER_CLASS,
  );

/**
 * The body's top-level nodes, as names and text, with the block marked.
 * Enough to say what ended up on either side of an insert without saying
 * anything about how the editor chose to divide it up.
 *
 * `childNodes` rather than `children`, and that is the whole reason this is a
 * helper: text typed into an empty composer is a bare text node, so an element
 * walk reports the words on either side of the block as absent and the test
 * passes for the wrong reason.
 */
const outlineOf = (compose) =>
  compose.chrome(
    `const [wrapperClass] = arguments;
     return Array.from(GetCurrentEditor().rootElement.childNodes).map((child) => ({
       name: child.nodeName.toLowerCase(),
       isBlock: child.classList?.contains(wrapperClass) ?? false,
       text: child.textContent,
     }));`,
    WRAPPER_CLASS,
  );

/** Every mechanism report the insertion function has made, oldest first. */
const mechanismReports = async () =>
  (await session.consoleMessages())
    .map(({ text }) => text)
    .filter((text) => text.startsWith(MECHANISM_REPORT));

/**
 * The path a person takes: open the popup the way the caller says, type a
 * snippet into it, confirm.
 *
 * The assertion in the middle is not a spare one. Opening the popup does not
 * move the keyboard focus, so if `typeIntoActionPopup` ever stopped moving it,
 * the snippet would be typed into the message body and `Ctrl+Enter` would
 * reach the compose window's Send binding - and in a plain-text composer the
 * body would then hold exactly what a successful insert puts there. This is
 * what stops that from reading as a pass.
 */
const insertThroughPopup = async (
  compose,
  source,
  open = (composer) => composer.openActionPopup(),
) => {
  const untouched = await compose.bodyText();
  await open(compose);
  await compose.typeIntoActionPopup(source);
  expect(
    await compose.bodyText(),
    "the snippet was typed into the message body instead of the popup",
  ).toBe(untouched);
  await compose.confirmActionPopup();
};

describe("inserting through the toolbar button", () => {
  it("lands one block, inside the wrapper, in the message body", async () => {
    const compose = await session.openCompose();
    try {
      await compose.focusBody();
      await insertThroughPopup(compose, CODE);

      // One wrapper, holding one `pre`, holding the source as it was typed.
      // The wrapper is the whole reason the block is not spell-checked, and
      // the `pre` inside it is what carries the indentation, so "a block
      // inside the wrapper" is two claims and both are here.
      expect(await blocksIn(compose)).toEqual([
        { children: ["pre"], text: CODE },
      ]);

      // And the four characters arrived as characters. The block's text above
      // already says so - a `<b>` read as markup would not be in the text at
      // all - and this says the other half: they are escaped in the markup
      // rather than sitting in it raw.
      const html = await compose.bodyHtml();
      expect(html).toContain("a &lt; b &amp;&amp; c &gt;");
    } finally {
      await compose.close();
    }
  });

  it("goes in through the editor command rather than a fallback", async () => {
    const compose = await session.openCompose();
    try {
      await compose.focusBody();
      await insertThroughPopup(compose, CODE);

      // The insertion function's own report, which is the only place the
      // mechanism is stated: the popup discards the return value as it closes.
      // `execCommand` is the preferred path and the one no simulated DOM
      // implements, which is what this whole tier exists for.
      expect((await mechanismReports()).at(-1)).toBe(EDITOR_COMMAND);

      // And the same claim from the editor's side, which does not take the
      // add-on's word for it: an editor command leaves a transaction behind
      // and counts as a modification, while the fallbacks move nodes about
      // without the editor knowing either happened. The modification is what
      // makes closing the composer prompt to save, which is the half of that
      // checklist item without a dialog in it.
      const state = await compose.editorState();
      expect(state.canUndo).toBe(true);
      expect(state.modificationCount).toBeGreaterThan(0);
    } finally {
      await compose.close();
    }
  });

  it("comes out again in one undo", async () => {
    const compose = await session.openCompose();
    try {
      await compose.focusBody();
      await insertThroughPopup(compose, CODE);
      expect(await blocksIn(compose)).toHaveLength(1);

      await compose.undo();

      expect(await blocksIn(compose)).toEqual([]);
      expect(await compose.bodyText()).toBe("");
    } finally {
      await compose.close();
    }
  });

  it("leaves the text on either side of the caret alone", async () => {
    const compose = await session.openCompose();
    try {
      // Prose rather than code, for the second claim this makes: the popup
      // renders and inserts whatever is pasted into it, and source with
      // nothing to highlight is the case that used to be checked by hand for
      // not throwing. A throw would leave the popup open with an error line,
      // and `confirmActionPopup` would time out saying so.
      await compose.typeIntoBody("one two");
      await compose.placeCaretAfter("one ");
      await insertThroughPopup(compose, PROSE);

      const outline = await outlineOf(compose);
      const at = outline.findIndex((node) => node.isBlock);
      expect(at, "no block in the body").toBeGreaterThan(-1);
      expect(outline.filter((node) => node.isBlock)).toHaveLength(1);
      expect(
        outline
          .slice(0, at)
          .map((node) => node.text)
          .join("")
          .trim(),
      ).toBe("one");
      expect(
        outline
          .slice(at + 1)
          .map((node) => node.text)
          .join("")
          .trim(),
      ).toBe("two");
    } finally {
      await compose.close();
    }
  });

  it("closes the popup, so a second snippet starts from an empty one", async () => {
    const compose = await session.openCompose();
    try {
      await compose.focusBody();
      await insertThroughPopup(compose, CODE);

      // `insertThroughPopup` already waits for this - a popup that stayed open
      // is a failed insert - so what this test adds is the claim stated as
      // itself rather than as a precondition of everything else.
      expect(await compose.actionPopupUrls()).toEqual([]);
    } finally {
      await compose.close();
    }
  });
});

describe("the keyboard shortcut", () => {
  /**
   * Thunderbird's translation of a manifest shortcut into a `key` element's
   * `modifiers` attribute, which is the form the assertion below has to be in.
   * `Ctrl` becomes `accel`, and that is the interesting one: `accel` is
   * Control on Linux and Windows and Command on macOS, which is how one
   * manifest entry is the right shortcut on all three.
   */
  const MODIFIER_ATTRIBUTES = {
    Ctrl: "accel",
    Command: "accel",
    MacCtrl: "control",
    Alt: "alt",
    Shift: "shift",
  };

  const suggested = manifest.commands._execute_compose_action.suggested_key.default;
  const parts = suggested.split("+");
  const shortcut = {
    key: parts.at(-1),
    keycode: null,
    modifiers: parts
      .slice(0, -1)
      .map((part) => MODIFIER_ATTRIBUTES[part])
      .join(","),
  };

  it("is registered as the shortcut the manifest asks for", async () => {
    const compose = await session.openCompose();
    try {
      // One key element, and the one the manifest describes. Read from the
      // keyset Thunderbird built rather than from the add-on, so a manifest
      // entry that Thunderbird silently declined - a taken shortcut, a
      // spelling it does not accept - fails here rather than being reported as
      // a shortcut that does nothing.
      expect(await compose.actionShortcutKeys()).toEqual([shortcut]);
    } finally {
      await compose.close();
    }
  });

  it("inserts exactly what the button inserts", async () => {
    const byButton = await session.openCompose();
    const byShortcut = await session.openCompose();
    try {
      for (const [compose, open] of [
        [byButton, (composer) => composer.openActionPopup()],
        [byShortcut, (composer) => composer.pressActionShortcut()],
      ]) {
        await compose.focusBody();
        await insertThroughPopup(compose, CODE, open);
      }

      // Identical, and compared against the other path rather than against a
      // description of it: a shortcut that inserts something subtly different
      // from the button is the failure this is about, and no expected value
      // written out here would catch it.
      expect(await blocksIn(byShortcut)).toEqual(await blocksIn(byButton));
      expect(await byShortcut.bodyText()).toBe(await byButton.bodyText());
      expect(await byShortcut.editorState()).toMatchObject({ canUndo: true });
    } finally {
      await byShortcut.close();
      await byButton.close();
    }
  });
});

describe("a right-click carrying a selection", () => {
  it("opens the popup with the selected text already in it", async () => {
    const compose = await session.openCompose();
    try {
      await compose.typeIntoBody("before SELECTED after");
      await compose.selectInBody("SELECTED");

      // The add-on's item, in Thunderbird's own context menu for the message
      // body, found by the prefix the extension framework gives it. Its id is
      // the background's and is not exported, so the prefix is what there is;
      // one item is what this add-on creates.
      const [item, ...rest] = await compose.openBodyContextMenu();
      expect(rest).toEqual([]);
      expect(item.label).toBeTruthy();

      await compose.activateMenuItem(item.id);
      await compose.waitForActionPopup();

      // Nothing is typed here. The popup is confirmed as it was opened, so the
      // only way the block below can carry the selected text is that the
      // right-click parked it and the popup claimed it - which is the prefill,
      // observed through the one thing the prefill is for.
      //
      // What this does not see is the textarea itself, because nothing can:
      // that the text is *visible* in the popup rather than merely held by it
      // is the part a person still confirms, and it is the same claim as the
      // popup being legible at all.
      await compose.focusActionPopup();
      await compose.confirmActionPopup();

      expect(await blocksIn(compose)).toEqual([
        { children: ["pre"], text: "SELECTED" },
      ]);

      // Replaced, not duplicated: the word appears once, and it appears inside
      // the block.
      expect((await compose.bodyText()).match(/SELECTED/g)).toHaveLength(1);
      const outline = await outlineOf(compose);
      expect(outline.filter((node) => node.isBlock)).toHaveLength(1);
      expect(
        outline
          .filter((node) => !node.isBlock)
          .map((node) => node.text)
          .join("")
          .replace(/\s+/g, " ")
          .trim(),
      ).toBe("before after");
    } finally {
      await compose.close();
    }
  });
});

describe("a plain-text composer", () => {
  /**
   * A plain-text composer cannot open this add-on's popup at all, and that is
   * a defect in the add-on rather than a limit of this harness. It is filed as
   * issue #12.
   *
   * `compose_action.default_area` is `formattoolbar`, and Thunderbird hides
   * the format toolbar in a plain-text composer - there is no formatting to
   * offer. The popup is anchored to that button (`triggerAction` in
   * `ExtensionToolbarButtons.sys.mjs` calls
   * `openPopup(button, "bottomleft topleft")`), so with the button in a hidden
   * toolbar the panel opens and rolls straight back up. Every route in goes
   * through that same call, so the button, `Ctrl+Shift+C` and the right-click
   * item all fail the same way. Confirmed on a real X server as well as
   * headless, so it is not a headless artefact.
   *
   * What is broken is reaching the popup, and what this test is about is what
   * happens after that - a different editor receiving text rather than markup.
   * So the toolbar is unhidden for the length of the test, which changes
   * nothing about the insert: the same button, the same popup, the same
   * `scripting.executeScript` into the same composer. When the add-on is fixed
   * this call comes out and nothing else here changes.
   */
  const revealTheButton = (compose) =>
    compose.chrome(
      `const [toolbarId] = arguments;
       document.getElementById(toolbarId).hidden = false;`,
      // The toolbar the manifest asks for, not the literal, so that moving the
      // button to the compose toolbar - which is one of the ways issue #12
      // could be fixed - makes this a harmless no-op instead of a lie.
      ACTION_TOOLBAR_ID,
    );

  const source = "def greet(name):\n    return f'hi <{name}>'";

  it("receives the source as text, with no markup in the body", async () => {
    const compose = await session.openCompose({ format: "plaintext" });
    try {
      await compose.focusBody();
      await revealTheButton(compose);
      await insertThroughPopup(compose, source);

      // What the message would carry, compared against what the seam says a
      // plain-text composer gets. Read from the seam rather than written out
      // so that a change to how the source is normalised stays one change.
      const { text } = buildCodeBlockHtml({ source });
      expect(await compose.bodyPlainText()).toContain(text);

      // No markup, said three ways, because "no markup" is the whole claim:
      // no block wrapper, nothing the highlighter would have wrapped a token
      // in, and the source's own angle brackets sitting in the document as
      // escaped text rather than as an element.
      expect(await blocksIn(compose)).toEqual([]);
      const html = await compose.bodyHtml();
      expect(html).not.toContain("<pre");
      expect(html).not.toContain("<span");
      expect(html).toContain("&lt;{name}&gt;");

      // And it went in through the plain-text editor's own insert rather than
      // through a DOM fallback, which is the same claim as for the HTML
      // composer and a different command underneath.
      expect((await mechanismReports()).at(-1)).toBe(EDITOR_COMMAND);
    } finally {
      await compose.close();
    }
  });
});
