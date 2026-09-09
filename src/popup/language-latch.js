/**
 * The override rule: what the pipeline should be told about the language.
 *
 * Two pieces of state and three rules. They were two plain module variables in
 * the popup, read and written by four places that each knew one of the rules,
 * so the rule as a whole was only ever stated in a comment. Here it is one
 * question with one answer, and the question is the only thing anything outside
 * ever needed to ask.
 *
 * A closure rather than a reducer. What the popup does with the answer is two
 * DOM writes and a timer rather than data, so an action-and-effect vocabulary
 * would be a second thing to keep correct for no gain. This follows the
 * precedent of ./snippet-size.js, which is a pure module for the same reason
 * and stops at the same edge: the wording of the warning is deliberately not in
 * there, and the dropdown is deliberately not in here.
 *
 * The dropdown's value is passed in rather than read, which is the whole of why
 * this file needs no document. What is on screen is the caller's business; this
 * only decides whether it is what the pipeline gets told.
 *
 * @returns {{
 *   takeOver: () => void,
 *   sourceChanged: (change: { wholesale: boolean }) => void,
 *   requestedLanguage: (shown: string) => string | undefined,
 *   honourRequest: (shown: string) => string | undefined,
 * }}
 */
export function createLanguageLatch() {
  /**
   * Whether the user has taken the language over.
   *
   * Once they have, detection stops for the life of this latch: an override is
   * an instruction, and a dropdown that re-guesses over the top of a deliberate
   * choice is worse than one that never guessed.
   *
   * One latch per popup is what keeps "for the life of this latch" from meaning
   * for ever. The popup document is built fresh every time the button is
   * clicked, so a latch built with it resets itself, and there is deliberately
   * nothing anywhere that writes the chosen language to storage - remembering it
   * across opens is exactly how auto-detection stops working without anyone
   * noticing.
   */
  let overridden = false;

  /**
   * Whether a fresh guess is owed.
   *
   * Detection and the preview are one pipeline call - a source change costs one
   * highlight pass, not two - so this flag is the whole of the difference
   * between the two kinds of edit: every change re-renders, and only a
   * wholesale one asks for a fresh guess.
   *
   * It starts `true` so that the popup's load-time render derives the
   * dropdown's opening value from the (empty) textarea like every other value
   * it takes, rather than leaving it on the first entry of an alphabetical
   * list.
   */
  let detectionDue = true;

  const requestedLanguage = (shown) =>
    detectionDue && !overridden ? undefined : shown;

  return {
    /**
     * The user chose a language. The first rule, and it is permanent: nothing
     * here ever puts this back, because there is no gesture that means "go back
     * to guessing" - reopening the popup is that gesture.
     */
    takeOver() {
      overridden = true;
    },

    /**
     * The second rule: content that arrived wholesale asks for a fresh guess,
     * and editing content that is already there does not.
     *
     * The trigger is the arrival of new content and not every edit of it, which
     * is the honest reading of the story - a snippet being tweaked afterwards
     * has already got a language - and is what keeps the dropdown from
     * re-guessing under someone's fingers while they fix a typo. Which edits
     * count as wholesale is the caller's judgement, because it is the caller
     * that can see the event.
     */
    sourceChanged({ wholesale }) {
      if (wholesale) {
        detectionDue = true;
      }
    },

    /**
     * What the pipeline should be told about the language, given what the
     * dropdown shows: nothing at all - which is how any caller asks it to
     * detect - while a wholesale change is still waiting to be rendered, and
     * the dropdown's value otherwise.
     *
     * Asked rather than worked out by each caller, because the insert needs the
     * same answer as the render. Paste and Ctrl+Enter inside the debounce window
     * is a real path - it is close to the fastest way to use the popup - and
     * reading the dropdown there would insert the block under whatever language
     * was last shown. Both callers ask here and both detect over the same
     * source, so they cannot arrive at different answers.
     */
    requestedLanguage,

    /**
     * The same answer, for the render that is about to act on it, and the
     * request is spent by the asking.
     *
     * The third rule: the render that honours a guess is what clears it, so two
     * pastes in quick succession still detect once, and asking without
     * honouring - which is what an insert does - leaves the guess the render
     * still owes.
     */
    honourRequest(shown) {
      const language = requestedLanguage(shown);
      detectionDue = false;
      return language;
    },
  };
}
