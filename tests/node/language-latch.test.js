import { describe, expect, it } from "vitest";

import { createLanguageLatch } from "../../src/popup/language-latch.js";

/**
 * The override rule, driven without a document at all. It is the half of the
 * popup that is a decision rather than a wiring - two pieces of state and three
 * rules - and the reason it is a module is that the rules are worth asserting
 * one at a time, which is not something the popup's tests can do while a render
 * and a debounce are in the way.
 *
 * The dropdown's value is this file's fixture rather than its subject: the
 * language names below could be any strings, and the one thing that must never
 * be asserted here is what the pipeline detects for a given source. That
 * belongs to the pipeline's own tests, and a latch that only passes the shown
 * value through cannot get it wrong.
 */
describe("createLanguageLatch", () => {
  const chosen = "ruby";
  const shown = "python";

  /**
   * The opening state, and the reason it is `true` rather than `false`: the
   * popup's load-time render derives the dropdown's opening value from the
   * empty textarea like every other value it takes, rather than leaving it on
   * the first entry of an alphabetical list.
   */
  it("asks for a guess before anything has been rendered", () => {
    expect(createLanguageLatch().requestedLanguage(shown)).toBeUndefined();
  });

  it("answers with the dropdown once a render has taken the guess", () => {
    const latch = createLanguageLatch();
    latch.honourRequest("plaintext");

    expect(latch.requestedLanguage(shown)).toBe(shown);
  });

  it("asks for a fresh guess when content arrives wholesale", () => {
    const latch = createLanguageLatch();
    latch.honourRequest("plaintext");
    latch.sourceChanged({ wholesale: true });

    expect(latch.requestedLanguage(shown)).toBeUndefined();
  });

  /**
   * The other half of the same rule. A snippet being tweaked has already got a
   * language, and re-guessing under someone's fingers while they fix a typo is
   * the failure this half prevents.
   */
  it("leaves the language alone when content already there is edited", () => {
    const latch = createLanguageLatch();
    latch.honourRequest("plaintext");
    latch.sourceChanged({ wholesale: false });

    expect(latch.requestedLanguage(shown)).toBe(shown);
  });

  /**
   * Two pastes in quick succession, which the popup's debounce collapses into
   * one render. The guess is owed once and spent once: a second render with
   * nothing new to look at takes the dropdown, so the pipeline is not asked to
   * score all thirty-six grammars again for a source it just scored.
   */
  it("owes one guess for any number of wholesale changes in a row", () => {
    const latch = createLanguageLatch();
    latch.sourceChanged({ wholesale: true });
    latch.sourceChanged({ wholesale: true });
    latch.sourceChanged({ wholesale: true });

    expect(latch.honourRequest(shown)).toBeUndefined();
    expect(latch.honourRequest(shown)).toBe(shown);
  });

  /**
   * Paste and Ctrl+Enter inside the debounce window, which is close to the
   * fastest way to use the popup. The insert asks the same question the render
   * would have asked and gets the same answer, and because it only asks, the
   * render that has not run yet still owes its guess.
   *
   * This is also what keeps a render that turns out to be stale from swallowing
   * a detection the newer one still owes: a caller that asks changes nothing,
   * and only the render that acts on the answer spends it.
   */
  it("keeps owing the guess to a caller that only asks", () => {
    const latch = createLanguageLatch();
    latch.sourceChanged({ wholesale: true });

    expect(latch.requestedLanguage(shown)).toBeUndefined();
    expect(latch.requestedLanguage(shown)).toBeUndefined();
    expect(latch.honourRequest(shown)).toBeUndefined();
  });

  /**
   * An override is an instruction, so it outlives every later paste rather than
   * the next one. Ten pastes here rather than one, because "permanent" is the
   * claim and a rule that survived exactly one change would pass a weaker test.
   */
  it("keeps an override through any number of later wholesale changes", () => {
    const latch = createLanguageLatch();
    latch.takeOver();

    for (let paste = 0; paste < 10; paste += 1) {
      latch.sourceChanged({ wholesale: true });
      expect(latch.requestedLanguage(chosen), `paste ${paste}`).toBe(chosen);
      expect(latch.honourRequest(chosen), `render ${paste}`).toBe(chosen);
    }
  });

  it("takes an override over a guess that is already owed", () => {
    const latch = createLanguageLatch();
    latch.sourceChanged({ wholesale: true });
    latch.takeOver();

    expect(latch.honourRequest(chosen)).toBe(chosen);
  });

  /**
   * One latch per popup is what keeps "permanent" from meaning "for ever". The
   * popup document is built fresh every time the button is clicked, so a latch
   * built with it starts guessing again - which is the behaviour, and it is why
   * nothing here is module state and nothing is written to storage.
   */
  it("gives every popup a latch of its own", () => {
    const overridden = createLanguageLatch();
    overridden.takeOver();
    const opened = createLanguageLatch();

    expect(overridden.requestedLanguage(chosen)).toBe(chosen);
    expect(opened.requestedLanguage(chosen)).toBeUndefined();
  });
});
