# 04: Auto-detect the language

**What to build:** Stop asking. When code is pasted, the language is detected automatically and the dropdown arrives pre-set to the guess, so the common case needs no input at all. A wrong guess costs one click to correct rather than an undo.

Detection must run fresh every time. Remembering the last-used language would quietly override the detection and turn the override control into the thing that lies to you.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Pasting code sets the dropdown to the detected language
- [ ] The language actually used is reported back out of the seam and is what the dropdown shows
- [ ] Overriding the dropdown is respected and the block is highlighted as the chosen language
- [ ] Detection re-runs on the next insert; the previous choice is never persisted or pre-selected
- [ ] Detection can only ever return a language present in the bundle
- [ ] Tests cover both an explicitly requested language and a detection request, including that the language used is reported correctly in each case
