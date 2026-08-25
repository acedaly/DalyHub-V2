/**
 * DEBT-202 — text typed before the editor enhances is not discarded.
 *
 * The race this asserts is one render wide and cannot be reliably interleaved
 * with a keystroke from a component test, which is exactly why the decision was
 * extracted as a pure function. What is asserted here is the decision itself, at
 * the instant it is made: **given a fallback holding newer text than the prop,
 * which document does the enhanced editor start from?**
 *
 * Against the previous implementation the answer was "the prop", every case
 * below returns the stored value, and the author's words were gone — silently,
 * with the subsequent save reporting success.
 */

import { describe, expect, it } from "vitest";

import { resolveEnhancementHandoff } from "~/shared/markdown-editor/enhancement-handoff";

const STORED = "Draft the **proposal** document.";
const TYPED = "Draft the **proposal** document. And the covering note.";

describe("the enhancement handoff", () => {
  it("takes the FALLBACK's value when the host has not committed it yet", () => {
    /*
     * The defect, stated as data. `propValue` is what the form holds;
     * `fallback.value` is what the author has actually typed into the DOM. The
     * old handoff used the first and threw the second away.
     */
    const handoff = resolveEnhancementHandoff(STORED, {
      value: TYPED,
      selectionStart: TYPED.length,
      selectionEnd: TYPED.length,
    });
    expect(handoff.doc).toBe(TYPED);
    expect(handoff.adopted).toBe(true);
  });

  it("REPORTS the adoption, so the form cannot save over the top of it", () => {
    /*
     * The half that makes the loss silent rather than merely visible: showing
     * the author's words in the enhanced editor while the FORM still holds the
     * old ones is the same defect wearing a different hat. `adopted` is what the
     * component uses to push the value upward.
     */
    expect(
      resolveEnhancementHandoff(STORED, {
        value: TYPED,
        selectionStart: 0,
        selectionEnd: 0,
      }).adopted,
    ).toBe(true);
    expect(
      resolveEnhancementHandoff(STORED, {
        value: STORED,
        selectionStart: 0,
        selectionEnd: 0,
      }).adopted,
    ).toBe(false);
  });

  it("carries the caret across, so a sentence in progress survives", () => {
    const caret = "Draft the ".length;
    const handoff = resolveEnhancementHandoff(STORED, {
      value: TYPED,
      selectionStart: caret,
      selectionEnd: caret,
    });
    expect(handoff.selectionStart).toBe(caret);
    expect(handoff.selectionEnd).toBe(caret);
  });

  it("carries a real SELECTION across, not only a collapsed caret", () => {
    const handoff = resolveEnhancementHandoff(STORED, {
      value: TYPED,
      selectionStart: 6,
      selectionEnd: 9,
    });
    expect([handoff.selectionStart, handoff.selectionEnd]).toEqual([6, 9]);
  });

  it("clamps a selection the new document cannot hold", () => {
    // A fallback whose reported selection outruns its own value would make
    // CodeMirror throw at creation, which would leave the field un-editable —
    // a worse outcome than the bug being fixed.
    const handoff = resolveEnhancementHandoff(STORED, {
      value: "ab",
      selectionStart: 99,
      selectionEnd: 120,
    });
    expect(handoff.doc).toBe("ab");
    expect([handoff.selectionStart, handoff.selectionEnd]).toEqual([2, 2]);
    const negative = resolveEnhancementHandoff(STORED, {
      value: "ab",
      selectionStart: -5,
      selectionEnd: -1,
    });
    expect([negative.selectionStart, negative.selectionEnd]).toEqual([0, 0]);
  });

  it("uses the prop when there is no fallback to read", () => {
    // An editor mounted straight into Write mode, or a fallback already torn
    // down: there is nothing newer, so the prop is the authority and the caret
    // lands at the end.
    const handoff = resolveEnhancementHandoff(STORED, null);
    expect(handoff.doc).toBe(STORED);
    expect(handoff.selectionStart).toBe(STORED.length);
    expect(handoff.adopted).toBe(false);
  });

  it("adopts an EMPTY fallback over a non-empty prop", () => {
    // The author selected everything and deleted it. That is a real edit, and
    // treating "empty" as "nothing to adopt" would resurrect the old text.
    const handoff = resolveEnhancementHandoff(STORED, {
      value: "",
      selectionStart: 0,
      selectionEnd: 0,
    });
    expect(handoff.doc).toBe("");
    expect(handoff.adopted).toBe(true);
  });
});
