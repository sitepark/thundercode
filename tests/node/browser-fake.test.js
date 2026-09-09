import { afterEach, describe, expect, it, vi } from "vitest";

import { event, installBrowserFake } from "../helpers/browser-fake.js";

/**
 * The one file in the suite whose subject is a test helper, and it is here for
 * the same reason tests/node/tier.test.js is: the property this fake exists
 * for is one no other test would notice breaking.
 *
 * Every test that uses the fake asserts what a module does. If the fake
 * quietly stopped being strict - answering `undefined` for an unstubbed
 * namespace instead of throwing - all of those would still pass, and the
 * guarantee that the extension's API surface cannot widen without somebody
 * being told would be gone. So the strictness gets a test of its own.
 */
describe("the strict browser fake", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("answers the members a test stubbed", async () => {
    installBrowserFake({
      storage: { local: { get: async () => ({ tabWidth: 8 }) } },
    });

    expect(await browser.storage.local.get(["tabWidth"])).toEqual({
      tabWidth: 8,
    });
  });

  /**
   * The whole point of the file. The message has to name the property that was
   * reached, because the failure it reports is "this code calls something new"
   * and the useful half of that is what.
   */
  it("throws and names the namespace when code reaches one nobody stubbed", () => {
    installBrowserFake({ runtime: { onMessage: event() } });

    expect(() => browser.notifications.create({})).toThrow(
      /browser\.notifications/,
    );
  });

  it("names the whole path when the namespace is stubbed and the member is not", () => {
    installBrowserFake({ tabs: { query: async () => [] } });

    expect(() => browser.tabs.create({})).toThrow(/browser\.tabs\.create/);
  });

  /**
   * Reaching for something is not the only way to widen the surface: a test
   * that invents a member by assigning to it would be writing its own API.
   */
  it("throws for an assignment to a member nobody stubbed", () => {
    installBrowserFake({ runtime: { lastError: undefined } });

    expect(() => {
      browser.runtime.id = "thundercode@sitepark.com";
    }).toThrow(/browser\.runtime\.id/);
  });

  /**
   * The area the spec rules out, and the case this fake generalised from.
   * Present rather than absent, so that reaching it is a failure that names
   * the rule rather than a member somebody assumes has not been needed yet.
   */
  it("keeps the ruled-out storage area present, and throwing", () => {
    installBrowserFake({ storage: { local: { get: async () => ({}) } } });

    expect(() => browser.storage.sync.get(["tabWidth"])).toThrow(
      /browser\.storage\.sync\.get was reached, and storage\.sync is ruled out/,
    );
  });

  it("refuses to let a test stub the ruled-out area either", () => {
    expect(() =>
      installBrowserFake({ storage: { sync: { get: async () => ({}) } } }),
    ).toThrow(/browser\.storage\.sync cannot be stubbed/);
  });

  it("records each call as the arguments it was made with", async () => {
    const fake = installBrowserFake({
      compose: { setComposeDetails: async () => {} },
    });

    await browser.compose.setComposeDetails(7, { deliveryFormat: "both" });

    expect(fake.calls("compose.setComposeDetails")).toEqual([
      [7, { deliveryFormat: "both" }],
    ]);
  });

  /**
   * Overriding one member inside one test, against the object the fake
   * installed, is the idiom the settings tests use rather than installing a
   * second fake. The override has to stay recorded, or an assertion about what
   * the module asked for would silently start passing vacuously.
   */
  it("records calls to a member a test overrode by assignment", async () => {
    const fake = installBrowserFake({ tabs: { query: async () => [] } });
    browser.tabs.query = async () => [{ id: 3, type: "messageCompose" }];

    expect(await browser.tabs.query({ active: true })).toEqual([
      { id: 3, type: "messageCompose" },
    ]);
    expect(fake.calls("tabs.query")).toEqual([[{ active: true }]]);
  });

  it("counts the reads of a member whose purpose is being looked at", () => {
    const fake = installBrowserFake({ runtime: { lastError: undefined } });

    expect(fake.reads("runtime.lastError")).toBe(0);
    void browser.runtime.lastError;
    void browser.runtime.lastError;
    expect(fake.reads("runtime.lastError")).toBe(2);
  });

  /**
   * The seam for every module that does its work at module scope: there is
   * nothing to call, so the fake captures what the import registered and the
   * test fires it.
   */
  it("captures listeners and answers with what each of them returned", () => {
    const fake = installBrowserFake({ runtime: { onMessage: event() } });
    browser.runtime.onMessage.addListener((message) =>
      message.type === "mine" ? "answered" : undefined,
    );

    expect(fake.fire("runtime.onMessage", { type: "mine" })).toEqual([
      "answered",
    ]);
    expect(fake.fire("runtime.onMessage", { type: "someone else's" })).toEqual([
      undefined,
    ]);
  });

  it("throws rather than pass quietly when an event has no listener", () => {
    const fake = installBrowserFake({ runtime: { onStartup: event() } });

    expect(() => fake.fire("runtime.onStartup")).toThrow(
      /browser\.runtime\.onStartup has no listener/,
    );
    expect(() => fake.fire("runtime.onInstalled")).toThrow(
      /browser\.runtime\.onInstalled was not stubbed as an event/,
    );
  });

  /**
   * What a suspended event page looks like from outside: the scope is gone and
   * so are its listeners, while everything it did before that is still on the
   * record.
   */
  it("forgets listeners without forgetting the calls that were made", () => {
    const fake = installBrowserFake({
      menus: { create: () => {}, onClicked: event() },
    });
    browser.menus.onClicked.addListener(() => "still here");
    browser.menus.create({ id: "an-id" });

    fake.forgetListeners();

    expect(() => fake.fire("menus.onClicked", {})).toThrow(/no listener/);
    expect(fake.calls("menus.create")).toEqual([[{ id: "an-id" }]]);
  });
});
