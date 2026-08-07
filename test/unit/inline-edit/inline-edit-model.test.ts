/**
 * DS-16 — the inline-edit state machine.
 *
 * The reducer is the whole reason this is one shared module rather than five
 * module-local `useState` pairs, so the assertions here are the promises the
 * product makes about an inline edit: a refusal never costs the user their
 * words, and a late reply from a superseded request never overwrites newer ones.
 */

import { describe, expect, it } from "vitest";

import {
  inlineEditReducer,
  initialInlineEditState,
  inlineEditDraft,
  isInlineEditing,
  type InlineEditState,
} from "~/shared/inline-edit/inline-edit-model";

type S = InlineEditState<string>;

const start: S = initialInlineEditState<string>();

function run(
  state: S,
  ...actions: Parameters<typeof inlineEditReducer<string>>[1][]
): S {
  return actions.reduce<S>(
    (acc, action) => inlineEditReducer(acc, action),
    state,
  );
}

describe("inlineEditReducer", () => {
  it("starts in view with no draft", () => {
    expect(start.status).toBe("view");
    expect(inlineEditDraft(start)).toBeNull();
    expect(isInlineEditing(start)).toBe(false);
  });

  it("seeds the draft from the stored value when editing begins", () => {
    const state = run(start, { type: "begin", draft: "Health" });
    expect(state.status).toBe("edit");
    expect(inlineEditDraft(state)).toBe("Health");
  });

  it("does NOT reseed a field that is already open", () => {
    // A second click on a field someone is halfway through typing into is a
    // misclick, not a request to discard their words.
    const state = run(
      start,
      { type: "begin", draft: "Health" },
      { type: "change", draft: "Health and fit" },
      { type: "begin", draft: "Health" },
    );
    expect(inlineEditDraft(state)).toBe("Health and fit");
  });

  it("closes on cancel", () => {
    const state = run(
      start,
      { type: "begin", draft: "a" },
      { type: "change", draft: "b" },
      { type: "cancel" },
    );
    expect(state.status).toBe("view");
  });

  it("keeps the draft while saving", () => {
    const state = run(
      start,
      { type: "begin", draft: "a" },
      { type: "change", draft: "b" },
      { type: "submit", attempt: 1 },
    );
    expect(state.status).toBe("saving");
    expect(inlineEditDraft(state)).toBe("b");
  });

  it("closes only when the CURRENT attempt resolves", () => {
    const state = run(
      start,
      { type: "begin", draft: "a" },
      { type: "change", draft: "b" },
      { type: "submit", attempt: 1 },
    );
    expect(
      inlineEditReducer(state, { type: "resolved", attempt: 1 }).status,
    ).toBe("view");
    // A ghost reply from an earlier request must not close the field — the user
    // has typed on since, and closing here would discard it.
    expect(inlineEditReducer(state, { type: "resolved", attempt: 0 })).toBe(
      state,
    );
  });

  it("PRESERVES the attempted value when the save is refused", () => {
    const state = run(
      start,
      { type: "begin", draft: "Health" },
      { type: "change", draft: "" },
      { type: "submit", attempt: 1 },
      { type: "rejected", attempt: 1, message: "Give this Area a name." },
    );
    expect(state.status).toBe("failed");
    // The draft is STILL HERE. This single assertion is the module's reason to
    // exist: the previous per-module implementations closed and discarded.
    expect(inlineEditDraft(state)).toBe("");
    expect(state.status === "failed" ? state.message : null).toBe(
      "Give this Area a name.",
    );
  });

  it("clears the message when the user types on, without resetting the attempt", () => {
    const failed = run(
      start,
      { type: "begin", draft: "a" },
      { type: "change", draft: "b" },
      { type: "submit", attempt: 1 },
      { type: "rejected", attempt: 1, message: "no" },
    );
    const typed = inlineEditReducer(failed, { type: "change", draft: "bc" });
    expect(typed.status).toBe("edit");
    // The counter survives, so a LATE reply from the failed attempt 1 is still
    // recognisable as superseded rather than being mistaken for the next one.
    expect(typed.status === "edit" ? typed.attempt : -1).toBe(1);
  });

  it("drops a rejection belonging to a superseded attempt", () => {
    const saving = run(
      start,
      { type: "begin", draft: "a" },
      { type: "change", draft: "b" },
      { type: "submit", attempt: 2 },
    );
    expect(
      inlineEditReducer(saving, { type: "rejected", attempt: 1, message: "x" }),
    ).toBe(saving);
  });

  it("ignores every action while in view except begin", () => {
    expect(inlineEditReducer(start, { type: "change", draft: "x" })).toBe(
      start,
    );
    expect(inlineEditReducer(start, { type: "submit", attempt: 1 })).toBe(
      start,
    );
  });
});
