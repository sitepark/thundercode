import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ACTION_BUTTON_ID, ACTION_TOOLBAR_ID } from "./harness/session.js";
import { PROFILE_PREFS, UPDATE_PREF_NAMES } from "./harness/profile.js";
import { THUNDERBIRD_VERSION, repoRoot } from "./harness/pins.js";
import { resolveThunderbirdBinary } from "./harness/provision.js";
import { startThunderbird } from "./harness/session.js";

/**
 * The third tier, and the only one that can see the add-on as a user does.
 *
 * What it proves is the mechanism: a pinned Thunderbird, fetched and started
 * headless on a profile that cannot update itself, with this checkout
 * temp-installed into it, opening a compose window and finding the add-on's
 * button in the format toolbar. Everything the add-on *does* with that button
 * is asserted in the tests that build on this - the mechanism is the subject
 * here, because a suite built on an unproven mechanism reports the mechanism's
 * failures as the add-on's.
 *
 * None of this is supported by Thunderbird. See the Consequences section of
 * docs/adr/0001-three-test-tiers.md for what that costs and who pays it, and
 * tests/thunderbird/harness/index.js for the harness's own interface.
 */

const manifest = JSON.parse(
  readFileSync(path.join(repoRoot, "manifest.json"), "utf8"),
);

let session;

beforeAll(async () => {
  // The first run downloads about 90 MiB, which is why the hook timeout in
  // vitest.config.js is minutes rather than seconds.
  session = await startThunderbird({ log: console.log });
}, 600_000);

afterAll(async () => {
  await session?.stop();
});

describe("the driven Thunderbird", () => {
  it("is Thunderbird, and the version the manifest's floor promises", async () => {
    const info = await session.appInfo();
    expect(info.name).toBe("Thunderbird");

    // Only when the harness chose the build. Under the environment override
    // the version is whatever the maintainer installed, which is the point of
    // the override; asserting the pin there would make the override unusable.
    if (resolveThunderbirdBinary().source === "pinned") {
      expect(info.version).toBe(THUNDERBIRD_VERSION.replace("esr", ""));
    }
  });

  it("runs on the profile this run created", async () => {
    const info = await session.appInfo();
    // Resolved on both sides: the profile lives under a temporary directory,
    // and macOS hands back a symlinked path for those.
    expect(path.resolve(info.profileDir)).toBe(path.resolve(session.profileDir));
  });

  it("cannot update itself", async () => {
    const guards = await session.updateGuards();

    // The policy is the one that does not care whether anything is
    // automating: it is read straight from `Services.policies`, so it holds
    // for a build a person launches by hand as well.
    expect(guards.policyAllowsAppUpdate).toBe(false);

    // And the prefs, compared against the harness's own list rather than
    // written out again, so adding one there is not a second edit here.
    expect(Object.keys(guards.prefs).sort()).toEqual([...UPDATE_PREF_NAMES].sort());
    for (const name of UPDATE_PREF_NAMES) {
      expect(guards.prefs[name], name).toBe(PROFILE_PREFS[name]);
    }
  });
});

describe("the installed add-on", () => {
  it("is this checkout, installed temporarily and unsigned", async () => {
    const info = await session.addonInfo();

    expect(info.id).toBe(manifest.browser_specific_settings.gecko.id);
    expect(info.version).toBe(manifest.version);
    expect(info.isActive).toBe(true);

    // Temporary is the whole mechanism: a permanent install of an unsigned
    // archive is a different code path, and it is the one the release
    // checklist still walks by hand.
    expect(info.temporarilyInstalled).toBe(true);

    // Unsigned, and accepted anyway. Thunderbird does not sign add-ons -
    // comm-central builds with signing off - so this is a property of the
    // application rather than of the install: nothing here had to be relaxed
    // for an unsigned add-on to load.
    expect(info.signedState).toBeLessThanOrEqual(0);
    expect((await session.updateGuards()).signaturesRequired).toBe(false);
  });
});

describe("a compose window", () => {
  it("opens, and carries the add-on's button in the format toolbar", async () => {
    const compose = await session.openCompose();
    try {
      // In the toolbar, not merely somewhere in the window: an element found
      // by id says nothing about where it ended up, and where it ends up is
      // what `default_area` in the manifest asks for.
      expect(await compose.toolbarButtonIds()).toContain(ACTION_BUTTON_ID);
      expect(ACTION_TOOLBAR_ID).toBe("FormatToolbar");

      // And it is the add-on's button rather than an element that happens to
      // share the id, read back through the manifest that named it.
      const button = await compose.actionButton();
      expect(await button.getAttribute("tooltiptext")).toBe(
        manifest.compose_action.default_title,
      );
      expect(await button.getTagName()).toBe("toolbarbutton");
    } finally {
      await compose.close();
    }
  });

  it("comes up empty, so an insertion test starts from nothing", async () => {
    const compose = await session.openCompose();
    try {
      expect(await compose.bodyText()).toBe("");
    } finally {
      await compose.close();
    }
  });
});
