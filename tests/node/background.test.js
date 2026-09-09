import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { event, installBrowserFake } from "../helpers/browser-fake.js";

/**
 * The background exports nothing and takes no arguments: it registers
 * listeners at module scope and that is all it is. So the fake browser is the
 * seam - import the module with one in place, then fire what the import
 * registered - and no handler is extracted to be called directly, because
 * that would be adding an interface in order to test what the fake already
 * exposes.
 *
 * What is asserted below is the handover rules rather than the presence of
 * listeners. They are the whole of this file's correctness and they are the
 * one property the release checklist cannot see: a person with two compose
 * windows open can check that a snippet arrived in the right one, but not that
 * it could never arrive in the wrong one.
 */

/**
 * The message the popup claims its prefill with. A literal in both modules and
 * exported by neither, which makes this the third copy: the background gets no
 * new interface for the sake of a test, and the popup is not this ticket's to
 * change. A test that made up its own name here would pass while the popup
 * asked for something else, so the two literals staying in step is on whoever
 * changes one of them.
 */
const TAKE_PENDING_SELECTION = "thundercode:take-pending-selection";

const composeTab = (id, windowId) => ({ id, windowId, type: "messageCompose" });

describe("the background", () => {
  let fake;

  /**
   * Errors the platform would have reported as unhandled. `menus.create`
   * answers through a callback and `runtime.lastError` rather than by
   * throwing, and an error no callback reads is what Gecko surfaces; the stub
   * below reproduces that, since otherwise "the error is swallowed" would be
   * indistinguishable from "there was never an error".
   */
  let unhandled;

  /** The ids the menu already holds, which outlive any one wake of the page. */
  let created;

  beforeEach(() => {
    unhandled = [];
    created = new Set();

    fake = installBrowserFake({
      menus: {
        create: (properties, callback) => {
          const duplicate = created.has(properties.id);
          created.add(properties.id);

          browser.runtime.lastError = duplicate
            ? { message: `ID already exists: ${properties.id}` }
            : undefined;
          const readBefore = fake.reads("runtime.lastError");
          callback();
          if (duplicate && fake.reads("runtime.lastError") === readBefore) {
            unhandled.push(`menus.create: ID already exists: ${properties.id}`);
          }
          browser.runtime.lastError = undefined;
        },
        onClicked: event(),
      },
      runtime: {
        lastError: undefined,
        onStartup: event(),
        onMessage: event(),
      },
      composeAction: {
        openPopup: async () => true,
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * A genuinely fresh instance of the background scope, which every test needs
   * because the module does its work at module scope: a cached one would carry
   * the previous test's parked selections and every take-once assertion below
   * would depend on the order the file happens to run in.
   *
   * Calling it twice in one test is the honest way to write "the event page
   * was suspended and woken again", which is a thing that happens between any
   * two user gestures. The listeners of the instance that went away are
   * dropped with it, so a dispatch reaches one background rather than two.
   */
  const wake = async () => {
    fake.forgetListeners();
    vi.resetModules();
    await import("../../src/background/background.js");
  };

  /**
   * The menu id is read off the creation the fake recorded rather than written
   * out here. It is not exported, and a test that hardcoded it would keep
   * passing after a rename while every real click stopped matching.
   */
  const menuProperties = () => fake.calls("menus.create").at(-1)[0];

  const rightClick = async (tab, selectionText) => {
    const [handled] = fake.fire(
      "menus.onClicked",
      { menuItemId: menuProperties().id, selectionText },
      tab,
    );
    await handled;
  };

  /**
   * What the popup does when it opens: asks for the selection parked for the
   * tab it resolved for itself. The sender is empty because the background
   * deliberately does not read it - a popup document has no tab of its own, so
   * `sender.tab` could not answer this.
   */
  const claim = async (tabId) => {
    const [answer] = fake.fire(
      "runtime.onMessage",
      { type: TAKE_PENDING_SELECTION, tabId },
      {},
    );
    return await answer;
  };

  describe("the menu it registers", () => {
    /**
     * `compose_body` matches a right-click anywhere in the message body, with
     * or without a selection, so the empty popup and the prefilled one are one
     * code path. `selection` is the context that must stay off the list: it
     * would also match a selection in the message reader and put the item in
     * menus with no composer to insert into.
     */
    it("offers itself in the compose body and nowhere else", async () => {
      await wake();

      expect(menuProperties().contexts).toEqual(["compose_body"]);
    });

    /**
     * An event page creates the item every time it is woken, so the second
     * creation onwards always fails with a duplicate id. That error is
     * expected and is the only one this module swallows; reading `lastError`
     * inside the callback is what stops the platform reporting it as
     * unhandled.
     */
    it("swallows the duplicate-id error a second creation produces", async () => {
      await wake();
      await wake();
      fake.fire("runtime.onStartup");

      expect(fake.calls("menus.create")).toHaveLength(3);
      expect(unhandled).toEqual([]);
    });

    /**
     * The listener exists so that the page runs at startup at all, and
     * re-creating the item is the work it does there: the item is then present
     * before the user opens their first composer.
     */
    it("puts the item back at startup", async () => {
      await wake();
      fake.fire("runtime.onStartup");

      const [first, second] = fake.calls("menus.create");
      expect(second[0]).toEqual(first[0]);
    });
  });

  describe("the selection handover", () => {
    /**
     * The property no checklist can see. Two composers, a right-click in each,
     * and each popup claims its own: a snippet parked in one window is not
     * something the other window can be handed, whichever order they ask in.
     */
    it("parks a selection against the tab it came from", async () => {
      await wake();
      await rightClick(composeTab(1, 11), "SELECT 1;");
      await rightClick(composeTab(2, 22), "print('two')");

      expect(await claim(2)).toBe("print('two')");
      expect(await claim(1)).toBe("SELECT 1;");
    });

    /**
     * Anchored to the window that was clicked rather than to the current one,
     * so the popup opens over the composer the user right-clicked in.
     */
    it("opens the popup over the window that was clicked", async () => {
      await wake();
      await rightClick(composeTab(2, 22), "print('two')");

      expect(fake.calls("composeAction.openPopup")).toEqual([
        [{ windowId: 22 }],
      ]);
    });

    /**
     * A right-click that carries nothing is a request for an empty popup, not
     * a request for whatever was parked last time. Clearing here rather than
     * leaving the entry is what stops an old snippet being replayed into a
     * later popup that the user opened to type something else.
     */
    it("clears a stale park when the next right-click carries nothing", async () => {
      for (const nothing of [undefined, ""]) {
        await wake();
        await rightClick(composeTab(1, 11), "SELECT 1;");
        await rightClick(composeTab(1, 11), nothing);

        expect(await claim(1), String(nothing)).toBe("");
      }
    });

    /**
     * Take-once: the entry is removed as it is handed over. The popup asks on
     * every open, including the toolbar and shortcut opens that parked
     * nothing, so an entry that survived being claimed would surface in the
     * next popup the user opened by any other route.
     */
    it("hands a selection over once and then has nothing", async () => {
      await wake();
      await rightClick(composeTab(1, 11), "SELECT 1;");

      expect(await claim(1)).toBe("SELECT 1;");
      expect(await claim(1)).toBe("");
    });

    /**
     * There is no popup to claim it, so holding it would mean handing it to
     * whatever opened this tab's popup next.
     */
    it("drops the park when the popup does not open", async () => {
      await wake();
      browser.composeAction.openPopup = async () => false;
      await rightClick(composeTab(1, 11), "SELECT 1;");

      expect(await claim(1)).toBe("");
    });

    /**
     * A tab that parked nothing is answered rather than left waiting: the
     * popup opened from the toolbar or the keyboard shortcut asks the same
     * question and needs the same kind of answer.
     */
    it("answers a tab that parked nothing with an empty selection", async () => {
      await wake();

      expect(await claim(1)).toBe("");
    });

    /**
     * Module scope does not survive the page being suspended, and the parked
     * selection is written and read inside one user gesture precisely because
     * that is the only lifetime it can rely on. A test that found a selection
     * still parked after a wake would be pinning a lifetime the platform does
     * not offer.
     */
    it("keeps nothing across a wake of the event page", async () => {
      await wake();
      await rightClick(composeTab(1, 11), "SELECT 1;");

      await wake();

      expect(await claim(1)).toBe("");
    });
  });

  describe("the clicks and messages it does not own", () => {
    it("ignores a click on a menu item it did not create", async () => {
      await wake();
      const [handled] = fake.fire(
        "menus.onClicked",
        { menuItemId: "some-other-extension-item", selectionText: "SELECT 1;" },
        composeTab(1, 11),
      );
      await handled;

      expect(fake.calls("composeAction.openPopup")).toEqual([]);
      expect(await claim(1)).toBe("");
    });

    /**
     * `menus.onClicked` carries no tab for contexts outside a tab, and there
     * is nothing to insert into without one.
     */
    it("ignores a click that arrives without a tab", async () => {
      await wake();
      const [handled] = fake.fire(
        "menus.onClicked",
        { menuItemId: menuProperties().id, selectionText: "SELECT 1;" },
        undefined,
      );
      await handled;

      expect(fake.calls("composeAction.openPopup")).toEqual([]);
    });

    /**
     * Undefined, not false and not a promise: this listener declines a message
     * it does not own rather than answering it, which is what leaves any other
     * listener in the extension free to take it. Answering would make the
     * background the one that handled it.
     */
    it("declines a message it does not own rather than answering it", async () => {
      await wake();

      for (const message of [
        { type: "someone-else:do-a-thing" },
        { tabId: 1 },
        "not an object at all",
        undefined,
      ]) {
        const [answer] = fake.fire("runtime.onMessage", message, {});
        expect(answer, JSON.stringify(message) ?? "undefined").toBeUndefined();
      }
    });

    /**
     * The other half of declining: a message the background did not answer has
     * not consumed anything either, so the popup's own claim still finds its
     * selection.
     */
    it("leaves a parked selection alone when it declines a message", async () => {
      await wake();
      await rightClick(composeTab(1, 11), "SELECT 1;");

      fake.fire(
        "runtime.onMessage",
        { type: "someone-else:take", tabId: 1 },
        {},
      );

      expect(await claim(1)).toBe("SELECT 1;");
    });
  });
});
