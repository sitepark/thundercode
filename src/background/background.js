import { TAKE_PENDING_SELECTION } from "../messaging/take-pending-selection.js";

/**
 * The extension's background, and the first one it has had: ticket 01 left it
 * out deliberately because a `compose_action` with a `default_popup` opens
 * without any background code. A `menus` entry is the first thing that cannot,
 * since menu items exist only as API calls and `menus.onClicked` has to be
 * listening somewhere.
 *
 * This is an **event page**, not a service worker (`background.service_worker`
 * is not implemented in Gecko). Two consequences shape everything below:
 *
 * 1. This file's scope is re-executed every time an event wakes the page, so
 *    top-level work must be safe to repeat.
 * 2. Anything held in module scope is lost when the page is suspended. Both
 *    pieces of state here - the parked selection and the menu that is open -
 *    are written and read within a single user gesture, which is the only
 *    lifetime either can rely on.
 */

/**
 * Mandatory on an event page: `menus.create` requires an explicit id there,
 * and the `onclick` property is unavailable, so `menus.onClicked` below is the
 * only way to hear about a click.
 */
const MENU_ID = "thundercode-insert-code-block";

/**
 * Text a right-click parked for the popup that is about to open, keyed by the
 * compose tab it came from.
 *
 * Keyed rather than a single slot so that a snippet cannot cross windows: with
 * two composers open, the popup only ever claims the selection from its own
 * tab. Entries are removed as they are handed over, so a later toolbar click -
 * which parks nothing - opens an empty popup instead of replaying an old
 * selection.
 */
const pendingSelections = new Map();

/**
 * How many menus have opened since this page was woken, which is only ever
 * read as a way of telling one of them from the next.
 */
let menusOpened = 0;

/**
 * Which of those menus is on screen, and zero when none is.
 *
 * Deciding whether the item belongs in a menu means asking the composer what
 * format it is in, and the menu is already drawn by the time the answer comes
 * back. Without this, an answer that arrives late would set the item's
 * visibility for whichever menu is open by then - so a menu the add-on has
 * nothing to say about would be handed the previous one's answer.
 *
 * Module scope, so both of these are lost when the event page is suspended.
 * That costs nothing: a menu cannot outlive the page that is being woken to
 * answer it.
 */
let menuOnScreen = 0;

/**
 * Creating the item at file scope means it exists as soon as the page runs,
 * which on an event page is also every time it is woken. The duplicate-id error
 * that follows a second creation is expected and is the only error swallowed
 * here; reading `lastError` is what stops it being reported as unhandled.
 */
function createMenu() {
  browser.menus.create(
    {
      id: MENU_ID,
      title: "Insert as code block",
      // `compose_body` matches a right-click anywhere in the message body,
      // with or without a selection - the empty-popup case is the same code
      // path as the prefilled one. `selection` is deliberately not listed: it
      // would also match selections in the message reader and put the item in
      // menus that have no composer to insert into.
      contexts: ["compose_body"],

      // Hidden until a composer has been asked what format it is in, which is
      // what `menus.onShown` below does. Created visible instead, the item
      // would be in the menu for as long as that answer takes to arrive - and
      // the composer where a false offer costs something is precisely the one
      // where the answer is "plain text".
      visible: false,
    },
    () => void browser.runtime.lastError,
  );
}

createMenu();

// An event page only runs at startup if it has a listener that fires there.
// Re-creating the menu is what that listener is for, so the item is present
// before the user opens their first composer.
browser.runtime.onStartup.addListener(createMenu);

/**
 * Whether this composer is one the add-on can put a code block into.
 *
 * The block goes in as markup, and the popup is reached through a button in
 * the format toolbar - which Thunderbird hides in a plain-text composer, there
 * being no formatting to offer. So a plain-text composer is a composer this
 * add-on has nothing to do in, and the honest thing is to offer it nothing.
 *
 * A tab that cannot be asked - it has closed, or was never a composer -
 * answers the same way. An offer this add-on could not check is one it cannot
 * promise to keep.
 */
async function canTakeACodeBlock(tabId) {
  try {
    const { isPlainText } = await browser.compose.getComposeDetails(tabId);
    return !isPlainText;
  } catch {
    return false;
  }
}

/**
 * The item's visibility, decided per menu rather than once at creation.
 *
 * `onShown` fires for every menu this add-on could have an item in, including
 * menus it has nothing in, so the context is checked before anything is
 * touched: the item is one piece of state shared by every window, and an
 * update made on behalf of a menu it is not in would be waiting in the next
 * menu it is.
 *
 * `refresh` is the half without which none of this is visible. The menu is
 * already on screen when this runs, so an item whose visibility has just
 * changed keeps being drawn the old way until the menu is rebuilt.
 */
browser.menus.onShown.addListener(async (info, tab) => {
  if (!info.contexts.includes("compose_body") || !tab) {
    return;
  }

  const menu = ++menusOpened;
  menuOnScreen = menu;

  const visible = await canTakeACodeBlock(tab.id);
  if (menuOnScreen !== menu) {
    return;
  }

  await browser.menus.update(MENU_ID, { visible });
  await browser.menus.refresh();
});

browser.menus.onHidden.addListener(() => {
  menuOnScreen = 0;
});

browser.menus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab) {
    return;
  }

  // Asked again rather than taken on trust from the item being visible: that
  // visibility is state Thunderbird holds between one menu and the next, so a
  // click can come from a menu drawn before `onShown` above had its say.
  // Returning before anything is parked is the whole of what this has to get
  // right - a selection left behind here would surface in the next popup this
  // tab opens by some other route.
  if (!(await canTakeACodeBlock(tab.id))) {
    pendingSelections.delete(tab.id);
    return;
  }

  // Plain text extracted from HTML by Thunderbird, so its indentation may
  // already be damaged before this extension sees it - the popup treats it as
  // a convenience, not as the source of truth. It is present only because the
  // extension holds the `compose` permission; context properties for compose
  // tabs are gated on it. Undefined when nothing was selected, which parks
  // nothing and opens the popup empty.
  const selectionText = info.selectionText;
  if (selectionText) {
    pendingSelections.set(tab.id, selectionText);
  } else {
    pendingSelections.delete(tab.id);
  }

  // Anchored to the window that was clicked rather than "the current window",
  // so the popup opens over the composer the user right-clicked in.
  const opened = await browser.composeAction.openPopup({
    windowId: tab.windowId,
  });
  if (!opened) {
    // No popup to claim it. Dropping it now keeps a stale selection from
    // surfacing the next time this tab's popup opens by some other route.
    pendingSelections.delete(tab.id);
  }
});

/**
 * The popup claims its prefill through here rather than reading a global,
 * because the popup is a separate document with no access to this scope.
 *
 * Take-once: the entry is deleted as it is handed over. The popup asks on every
 * open, including the toolbar and shortcut opens that parked nothing, and gets
 * an empty string for those.
 */
browser.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== TAKE_PENDING_SELECTION) {
    // Undefined, not false: this listener declines the message rather than
    // answering it, leaving any other listener free to.
    return undefined;
  }
  // The popup passes the tab it resolved for itself; a popup document has no
  // tab of its own, so `sender.tab` cannot answer this.
  const selectionText = pendingSelections.get(message.tabId) ?? "";
  pendingSelections.delete(message.tabId);
  return Promise.resolve(selectionText);
});
