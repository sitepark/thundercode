import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildCodeBlockHtml } from "../../src/code-block/build-code-block-html.js";
import { TAKE_PENDING_SELECTION } from "../../src/messaging/take-pending-selection.js";
import { startPopup } from "../../src/popup/popup.js";
import { LARGE_SNIPPET_LINES } from "../../src/popup/snippet-size.js";
import { installBrowserFake } from "../helpers/browser-fake.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * The shipped page, read from the file rather than hand-built here. The popup
 * finds its elements by id, so a fixture written in this file would let the two
 * drift and still pass: the ids are the contract between popup.js and
 * popup.html, and this is how the tests below sit on the real one.
 */
const popupPage = readFileSync(
  resolve(repoRoot, "src/popup/popup.html"),
  "utf8",
);

/**
 * The popup's clock, held still.
 *
 * `startPopup` takes the debounce's two timer functions, so nothing below waits
 * out a real 150ms, and the two things the debounce is actually about become
 * observable: how many renders were scheduled, and how many ran. Vitest's own
 * fake timers would have replaced the clock this file also uses to let promises
 * settle, which is the one clock these tests need to keep running.
 */
const createClock = () => {
  let now = 0;
  let nextId = 1;
  const pending = new Map();

  return {
    /** Renders the debounce has actually run. */
    fired: 0,

    setTimeout: (callback, delay) => {
      nextId += 1;
      pending.set(nextId, { callback, due: now + delay });
      return nextId;
    },

    clearTimeout: (id) => void pending.delete(id),

    /** Renders currently waiting, which a burst of typing collapses to one. */
    get scheduled() {
      return pending.size;
    },

    tick(ms) {
      now += ms;
      const due = [...pending].sort(([, a], [, b]) => a.due - b.due);
      for (const [id, timer] of due) {
        if (timer.due <= now) {
          pending.delete(id);
          this.fired += 1;
          timer.callback();
        }
      }
    },
  };
};

/**
 * Lets everything the popup has already started run to completion.
 *
 * One turn of the real clock drains every promise that is already resolved,
 * which is all of them: the settings and the theme are stubbed rather than
 * fetched, and the popup's own waiting goes through the clock above.
 */
const settle = () => new Promise((done) => setTimeout(done, 0));

/** A promise this file resolves by hand, for making two renders overlap. */
const deferred = () => {
  let resolve;
  const promise = new Promise((keep) => {
    resolve = keep;
  });
  return { promise, resolve };
};

const lines = (count) =>
  Array.from({ length: count }, (_, at) => `line ${at}`).join("\n");

/**
 * Two sources the pipeline detects differently. Which languages those are is
 * not this file's business, and every assertion reads them back out of the
 * pipeline rather than naming them; that they differ is what makes "under the
 * detected language rather than the last one displayed" a question with two
 * possible answers.
 *
 * Neither detects as the entry the dropdown opens on, and an earlier draft had
 * one that did: the assertion it was the subject of then passed for a source it
 * had never rendered. The guard in `overlap` below is there because of it.
 */
const python = "def greet(name):\n    print(f'hello {name}')\n";
const markup = "<note>\n  <to>you</to>\n  <body>hello</body>\n</note>\n";

describe("the popup", () => {
  /**
   * What the stubbed storage hands back. Not the defaults, so that a render
   * built with the popup's settings is distinguishable from one built without
   * them.
   */
  const stored = { tabWidth: 8, fontSize: 11 };

  const composeTab = { id: 7, windowId: 3, type: "messageCompose" };

  let frame;
  let clock;
  let fake;
  let closed;

  /**
   * The popup's own document, in a frame of its own per test.
   *
   * A frame rather than this tier's own document, because the popup binds its
   * keyboard shortcut to the document: a shared one would keep every earlier
   * popup in this file listening, and confirming once would confirm as many
   * times as there had been tests. A document per popup is also what the add-on
   * has - the page is built fresh every time the button is clicked and dies
   * when it closes - so the isolation is the faithful arrangement rather than a
   * concession to the runner.
   */
  let popup;

  /**
   * The block the pipeline makes of a source, which is what the popup shows and
   * what it inserts: both are the same string from the same call, so the
   * expectations below are read from the pipeline rather than written out.
   *
   * The theme map is empty because jsdom fetches no stylesheet. That is the
   * degradation the pipeline already has a name for - a block that comes out in
   * its own unthemed colours - and the colours themselves are pinned in the
   * pure tier, so nothing here depends on the theme having loaded.
   */
  const rendering = (source, language) =>
    buildCodeBlockHtml({ source, language, themeMap: {}, ...stored });

  /**
   * The pipeline's own output, parsed and serialised by this document, so that
   * comparing it against the preview compares two blocks rather than two
   * spellings of one.
   */
  const asRendered = (html) =>
    new DOMParser().parseFromString(html, "text/html").body.firstElementChild
      .outerHTML;

  const element = (id) => popup.getElementById(id);

  beforeEach(() => {
    clock = createClock();
    closed = 0;

    fake = installBrowserFake({
      storage: { local: { get: async () => stored } },
      tabs: { query: async () => [composeTab] },
      compose: {
        getComposeDetails: async () => ({ isPlainText: false }),
        setComposeDetails: async () => {},
      },
      scripting: {
        executeScript: async () => [{ result: { mechanism: "execCommand" } }],
      },
      // Nothing parked, which is what a toolbar or shortcut open gets.
      runtime: { sendMessage: async () => "" },
    });

    frame = document.createElement("iframe");
    document.body.append(frame);
    popup = frame.contentDocument;
    popup.open();
    popup.write(popupPage);
    popup.close();

    // Closing is what a successful insert ends with, and it is worth asserting
    // rather than performing: jsdom's own `close` would take the document the
    // assertions still have to read.
    frame.contentWindow.close = () => {
      closed += 1;
    };
  });

  afterEach(() => {
    frame.remove();
    vi.unstubAllGlobals();
  });

  /**
   * Opens the popup the way the page does, against this document and the clock
   * above.
   *
   * The theme link is answered by hand because jsdom fetches no stylesheet, so
   * it would otherwise report neither success nor failure and the theme map
   * would never resolve. An `error` is the honest event for a stylesheet that
   * was never loaded, and it is the one the module is built to survive.
   */
  const open = () => {
    startPopup({
      document: popup,
      setTimeout: clock.setTimeout,
      clearTimeout: clock.clearTimeout,
    });
    element("theme").dispatchEvent(new Event("error"));
  };

  /** Content arriving all at once: a paste, a drop, a middle-click yank. */
  const paste = (source) => {
    element("source").value = source;
    element("source").dispatchEvent(
      new InputEvent("input", { inputType: "insertFromPaste" }),
    );
  };

  /** Content being edited where it already is, which asks for no new guess. */
  const type = (source) => {
    element("source").value = source;
    element("source").dispatchEvent(
      new InputEvent("input", { inputType: "insertText" }),
    );
  };

  /** The dropdown being used, which is the gesture that takes the language. */
  const choose = (language) => {
    element("language").value = language;
    element("language").dispatchEvent(new Event("change"));
  };

  /**
   * Waits the debounce out, generously. The popup keeps its own constant to
   * itself, and a number copied in here would be pinning a threshold nothing
   * measured; what the tests below assert about the wait is how many renders it
   * cost, which does not depend on how long it is.
   */
  const debounce = async () => {
    clock.tick(1000);
    await settle();
  };

  describe("the preview", () => {
    /**
     * The popup opens on an empty textarea, and an empty textarea shows
     * nothing: not the bordered empty box the pipeline returns for empty
     * source, and not an error either. A box appearing the moment the popup
     * opens would read as the block already existing.
     */
    it("shows nothing at all before anything has been pasted", async () => {
      open();
      await settle();

      expect(element("preview").hidden).toBe(true);
      expect(element("preview").children).toHaveLength(0);
      expect(element("warning").hidden).toBe(true);
    });

    /**
     * The preview is not a rendering like the one that gets inserted, it is the
     * one that will be: one pipeline call produces both, which is what makes
     * the dropdown and the preview incapable of disagreeing.
     */
    it("shows the block the pipeline would insert", async () => {
      open();
      await settle();

      paste(python);
      await debounce();

      expect(element("preview").hidden).toBe(false);
      expect(element("preview").firstElementChild.outerHTML).toBe(
        asRendered(rendering(python).html),
      );
    });

    /**
     * Literally empty, not whitespace-only: source that is all spaces does
     * insert an empty bordered box, and a preview that hid it would be lying
     * about the one thing this element exists to tell the truth about.
     */
    it("hides the preview again when the source is emptied", async () => {
      open();
      await settle();
      paste(python);
      await debounce();

      type("");
      await debounce();

      expect(element("preview").hidden).toBe(true);
      expect(element("preview").children).toHaveLength(0);
    });

    /**
     * A burst of typing costs one render rather than one per keystroke, and the
     * render it costs is the last one: highlighting is a scan over the whole
     * snippet and detection scores it against every grammar the bundle carries,
     * so rendering per character would do all of that once per character and
     * throw all but the last result away.
     */
    it("collapses a burst of changes into a single render", async () => {
      open();
      await settle();

      paste("print(1)");
      paste("print(2)");
      paste(python);
      expect(clock.scheduled).toBe(1);

      await debounce();

      expect(clock.fired).toBe(1);
      expect(element("preview").firstElementChild.outerHTML).toBe(
        asRendered(rendering(python).html),
      );
    });
  });

  describe("the language", () => {
    it("moves the dropdown to the language it detected", async () => {
      open();
      await settle();

      paste(python);
      await debounce();

      expect(element("language").value).toBe(
        rendering(python).detectedLanguage,
      );
    });

    /**
     * An override is an instruction, and a dropdown that re-guesses over the
     * top of a deliberate choice is worse than one that never guessed. Two
     * pastes afterwards rather than one, and the second is the source whose
     * detection would disagree loudest.
     */
    it("never guesses again once the language has been chosen", async () => {
      open();
      await settle();
      paste(python);
      await debounce();

      choose("ruby");
      await debounce();
      paste(markup);
      await debounce();
      paste(python);
      await debounce();

      expect(element("language").value).toBe("ruby");
      expect(element("preview").firstElementChild.outerHTML).toBe(
        asRendered(rendering(python, "ruby").html),
      );
    });

    /**
     * Re-rendering on `change` is what makes a corrected language confirmable
     * by eye without touching the source again.
     */
    it("renders again when the language is corrected", async () => {
      open();
      await settle();
      paste(python);
      await debounce();

      choose("ruby");
      await debounce();

      expect(element("preview").firstElementChild.outerHTML).toBe(
        asRendered(rendering(python, "ruby").html),
      );
    });

    /**
     * Two wholesale changes inside one debounce window, which is one render:
     * the guess is owed by the change and spent by the render that honours it,
     * so the one render that happens is the one that detects, and it detects
     * the content that is actually there.
     */
    it("detects once for two pastes inside one window", async () => {
      open();
      await settle();
      paste("print(1)");
      await debounce();

      paste(markup);
      paste(python);
      await debounce();

      expect(clock.fired).toBe(2);
      expect(element("language").value).toBe(
        rendering(python).detectedLanguage,
      );
    });

    /**
     * Editing content that is already there does not ask for a fresh guess: the
     * trigger is the arrival of new content and not every edit of it, which is
     * what keeps the dropdown from re-guessing under someone's fingers while
     * they fix a typo.
     */
    it("leaves the language alone while the snippet is edited", async () => {
      open();
      await settle();
      paste(python);
      await debounce();
      const detected = element("language").value;

      type(`${python}${markup}`);
      await debounce();

      expect(element("language").value).toBe(detected);
    });
  });

  /**
   * Two renders in flight at once, which is the only way the guard against an
   * older render can be asserted at all. The settings read is left pending
   * until three renders are waiting on it - the load-time one and two pastes -
   * so that two of them are already stale by the time any of them can continue.
   */
  describe("when two renders overlap", () => {
    let writes;

    const overlap = async () => {
      const settings = deferred();
      browser.storage.local.get = () => settings.promise;
      open();

      writes = [];
      new MutationObserver((records) => writes.push(...records)).observe(
        element("preview"),
        { childList: true },
      );

      paste(python);
      await debounce();
      paste(markup);
      await debounce();

      // Nothing has rendered yet, so the dropdown is still on the entry the
      // alphabetical list opened on. That this is not the answer the
      // assertions expect is what lets them fail.
      expect(element("language").value).not.toBe(
        rendering(markup).detectedLanguage,
      );

      settings.resolve(stored);
      await settle();
    };

    /**
     * Stale is the one failure mode the preview must not have: a block showing
     * the previous source beside a dropdown showing the new one is worse than
     * no preview at all. The older renders do not merely lose the race, they
     * never write - so there is no moment at which the wrong block is on
     * screen.
     */
    it("leaves the newest render on screen, and only that one", async () => {
      await overlap();

      expect(element("preview").firstElementChild.outerHTML).toBe(
        asRendered(rendering(markup).html),
      );
      expect(writes).toHaveLength(1);
    });

    /**
     * The guess is spent by the render that honours it, and a render that turns
     * out to be stale honours nothing. If a stale one spent it, the newest
     * render would find the request already gone and would take the dropdown's
     * value - which is whatever the alphabetical list opened on, since nothing
     * has detected yet.
     */
    it("does not let a stale render swallow the newer guess", async () => {
      await overlap();

      expect(element("language").value).toBe(
        rendering(markup).detectedLanguage,
      );
    });
  });

  describe("inserting", () => {
    const confirm = async () => {
      element("insert").dispatchEvent(new MouseEvent("click"));
      await settle();
    };

    const inserted = () => {
      const calls = fake.calls("scripting.executeScript");
      expect(calls).toHaveLength(1);
      return calls[0][0].args[0];
    };

    /**
     * Paste and confirm inside the debounce window, which is close to the
     * fastest way to use this popup, and the path that was getting the language
     * wrong: reading the dropdown here would insert the block under whatever
     * language was last shown. Both the render and the insert ask the latch, so
     * they cannot arrive at different answers.
     */
    it("inserts under the detected language, not the one shown", async () => {
      open();
      await settle();
      paste(python);
      await debounce();
      const displayed = element("language").value;
      expect(displayed).not.toBe(rendering(markup).detectedLanguage);

      paste(markup);
      await confirm();

      expect(inserted().content).toBe(rendering(markup).html);
      expect(inserted().content).not.toBe(rendering(markup, displayed).html);
      expect(closed).toBe(1);
    });

    /**
     * A failure has to leave the popup usable: the error where it can be read,
     * and the button able to try again. The insert is the only thing that ever
     * disables it, and re-enabling it here is what stops one rejected call
     * turning into a popup that can only be closed.
     */
    it("re-enables confirmation and shows the error on failure", async () => {
      open();
      await settle();
      paste(python);
      await debounce();
      browser.scripting.executeScript = async () => [
        { error: new Error("the tab went away") },
      ];

      await confirm();

      expect(element("error").hidden).toBe(false);
      expect(element("error").textContent).toBe("the tab went away");
      expect(element("insert").disabled).toBe(false);
      expect(closed).toBe(0);
    });

    /**
     * A shortcut that silently does nothing is worse than one that does not
     * exist, so it is the same path as the button and not a second copy of it.
     * `preventDefault` is load-bearing rather than tidiness: the compose window
     * binds Ctrl+Enter to Send, and a chrome key still fires for a press that
     * started inside an extension popup unless the popup consumes the event.
     */
    it("confirms from the keyboard, and consumes the key", async () => {
      open();
      await settle();
      paste(python);
      await debounce();

      const press = new KeyboardEvent("keydown", {
        key: "Enter",
        ctrlKey: true,
        cancelable: true,
      });
      popup.dispatchEvent(press);
      await settle();

      expect(press.defaultPrevented).toBe(true);
      expect(inserted().content).toBe(rendering(python).html);
      expect(closed).toBe(1);
    });

    /**
     * A popup anchored in a compose window resolves the current window to that
     * window, so the active tab is the composer the button was clicked in -
     * which is what keeps a snippet out of the wrong email when several
     * composers are open. A tab that is not a composer is refused rather than
     * swapped for a guess at another one.
     */
    it("refuses to insert when the active tab is not a composer", async () => {
      open();
      await settle();
      paste(python);
      await debounce();
      browser.tabs.query = async () => [{ id: 9, windowId: 3, type: "mail" }];

      await confirm();

      expect(fake.calls("scripting.executeScript")).toEqual([]);
      expect(element("error").hidden).toBe(false);
      expect(element("error").textContent).not.toBe("");
      expect(element("insert").disabled).toBe(false);
      expect(closed).toBe(0);
    });

    /**
     * A second Ctrl+Enter while the first insert is still in flight is a no-op,
     * not a second block: the button is disabled for the length of the call and
     * that is what both entry points read.
     */
    it("ignores a second confirmation while one is in flight", async () => {
      const injection = deferred();
      open();
      await settle();
      paste(python);
      await debounce();
      browser.scripting.executeScript = () => injection.promise;

      await confirm();
      expect(element("insert").disabled).toBe(true);
      await confirm();
      injection.resolve([{ result: { mechanism: "execCommand" } }]);
      await settle();

      expect(fake.calls("scripting.executeScript")).toHaveLength(1);
      expect(closed).toBe(1);
    });

    /**
     * Enter on its own belongs to the textarea, where it types a newline. Only
     * the modified press confirms, and only that press is consumed.
     */
    it("leaves an unmodified Enter to the textarea", async () => {
      open();
      await settle();
      paste(python);
      await debounce();

      const press = new KeyboardEvent("keydown", {
        key: "Enter",
        cancelable: true,
      });
      popup.dispatchEvent(press);
      await settle();

      expect(press.defaultPrevented).toBe(false);
      expect(fake.calls("scripting.executeScript")).toEqual([]);
    });

    /**
     * A plain-text composer is a different editor rather than the same one with
     * the styling switched off, and `deliveryFormat` describes how an HTML
     * message is put on the wire. Making that call here was predicted to be
     * rejected and surfaced as an error while inserting nothing, so not making
     * it is both the fix and the honest description.
     */
    it("skips the delivery format for a plain-text composer", async () => {
      browser.compose.getComposeDetails = async () => ({ isPlainText: true });
      open();
      await settle();
      paste(python);
      await debounce();

      await confirm();

      expect(inserted()).toEqual({
        content: rendering(python).text,
        isPlainText: true,
      });
      expect(fake.calls("compose.setComposeDetails")).toEqual([]);
    });
  });

  describe("the size warning", () => {
    /**
     * Recomputed from scratch on every source change, which is also what clears
     * it again when the content drops back under the threshold: there is no
     * separate hide path to forget to call. It is not debounced either -
     * nothing below waits out the clock - because counting lines is a scan
     * rather than a highlight, and a warning appearing a fifth of a second
     * after the paste would read as a reaction to whatever the user did next.
     *
     * The threshold is read from the module that owns it, because moving it is
     * a tuning decision and not a behaviour change.
     */
    it("appears past the threshold and clears again below it", async () => {
      open();
      await settle();

      paste(lines(LARGE_SNIPPET_LINES + 1));

      expect(element("warning").hidden).toBe(false);
      expect(element("warning").textContent).toContain(
        String(LARGE_SNIPPET_LINES + 1),
      );

      type(lines(LARGE_SNIPPET_LINES));

      expect(element("warning").hidden).toBe(true);
      expect(element("warning").textContent).toBe("");
    });

    /**
     * Advisory, and structurally so. Ticket 02 removed the last thing that
     * gated Insert on the textarea's contents, and there is no size at which
     * one comes back: emailing three thousand lines of code is a mistake worth
     * mentioning and not one worth preventing.
     */
    it("never disables the button it warns next to", async () => {
      open();
      await settle();

      paste(lines(LARGE_SNIPPET_LINES * 2));

      expect(element("warning").hidden).toBe(false);
      expect(element("insert").disabled).toBe(false);
    });
  });

  describe("the right-click prefill", () => {
    const parked = lines(LARGE_SNIPPET_LINES + 1);

    /**
     * The shape of the bug this ticket exists for. There were three `input`
     * listeners on the textarea, registered by three tickets that could not see
     * each other, and the prefill had to replay each of them by hand: the
     * warning, the detection and the preview are asserted together here because
     * forgetting one of them is exactly how that broke, and one of the three
     * passing on its own proves nothing.
     *
     * It also renders without waiting out the debounce - the clock never moves
     * below - because content that is already here has no burst to collapse,
     * and a debounce would only mean the dropdown visibly correcting itself a
     * moment after the popup appeared.
     */
    it("announces the parked selection like any other change", async () => {
      browser.runtime.sendMessage = async () => parked;

      open();
      await settle();

      expect(element("source").value).toBe(parked);
      expect(element("warning").hidden).toBe(false);
      expect(element("language").value).toBe(
        rendering(parked).detectedLanguage,
      );
      expect(element("preview").hidden).toBe(false);
      expect(element("preview").firstElementChild.outerHTML).toBe(
        asRendered(rendering(parked).html),
      );
      expect(clock.fired).toBe(0);
    });

    /**
     * Claimed for the tab this popup resolved for itself, which is what keeps a
     * snippet out of the wrong email when several composers are open. The
     * message type is imported rather than written out, because a name made up
     * here would pass while the background answered something else.
     */
    it("claims the selection of the tab it resolved for itself", async () => {
      open();
      await settle();

      expect(fake.calls("runtime.sendMessage")).toEqual([
        [{ type: TAKE_PENDING_SELECTION, tabId: composeTab.id }],
      ]);
    });

    /**
     * A prefill that does not arrive leaves an empty textarea, which is exactly
     * what the toolbar button opens anyway. An error line here would report a
     * broken convenience as a broken popup.
     */
    it("opens empty and quiet when the claim fails", async () => {
      browser.runtime.sendMessage = async () => {
        throw new Error("no background");
      };

      open();
      await settle();

      expect(element("source").value).toBe("");
      expect(element("preview").hidden).toBe(true);
      expect(element("error").hidden).toBe(true);
    });
  });
});
