/**
 * DS-06 — the pure autosave coordinator: sequencing, staleness, failure.
 *
 * These prove the correctness invariants without any timers or React: only one
 * save in flight, coalesce to the latest value, ignore stale responses, preserve
 * input on failure, and never save an invalid value.
 */

import { describe, expect, it } from "vitest";

import {
  initAutosave,
  isPersisted,
  reduceAutosave,
  type AutosaveAction,
  type AutosaveState,
} from "~/shared/forms/model";

function apply(state: AutosaveState<string>, action: AutosaveAction<string>) {
  return reduceAutosave(state, action);
}

describe("autosave coordinator", () => {
  it("marks unsaved on a valid edit but does not save until triggered", () => {
    const s0 = initAutosave("a");
    const { state, effect } = apply(s0, {
      type: "edit",
      value: "ab",
      valid: true,
    });
    expect(state.status).toBe("unsaved");
    expect(effect).toBeNull();
  });

  it("dispatches one save on requestSave and reaches saved on resolve", () => {
    let s = initAutosave("a");
    s = apply(s, { type: "edit", value: "ab", valid: true }).state;
    const req = apply(s, { type: "requestSave" });
    expect(req.effect).toEqual({ type: "save", seq: 1, value: "ab" });
    expect(req.state.status).toBe("saving");

    const done = apply(req.state, { type: "resolved", seq: 1 });
    expect(done.state.status).toBe("saved");
    expect(done.state.committed).toBe("ab");
    expect(isPersisted(done.state)).toBe(true);
  });

  it("does not save an invalid value", () => {
    let s = initAutosave("a");
    s = apply(s, { type: "edit", value: "", valid: false }).state;
    const req = apply(s, { type: "requestSave" });
    expect(req.effect).toBeNull();
    expect(req.state.status).toBe("unsaved");
  });

  it("does not start a parallel save while one is in flight", () => {
    let s = initAutosave("a");
    s = apply(s, { type: "edit", value: "ab", valid: true }).state;
    s = apply(s, { type: "requestSave" }).state; // seq 1 in flight
    s = apply(s, { type: "edit", value: "abc", valid: true }).state;
    const second = apply(s, { type: "requestSave" });
    expect(second.effect).toBeNull(); // no parallel dispatch
    expect(second.state.status).toBe("saving");
  });

  it("coalesces to the latest value after the in-flight save resolves", () => {
    let s = initAutosave("a");
    s = apply(s, { type: "edit", value: "ab", valid: true }).state;
    s = apply(s, { type: "requestSave" }).state; // seq 1 (value ab)
    s = apply(s, { type: "edit", value: "abc", valid: true }).state;
    const resolved = apply(s, { type: "resolved", seq: 1 });
    // committed advances to the saved value, then a NEW save of "abc" starts.
    expect(resolved.state.committed).toBe("ab");
    expect(resolved.effect).toEqual({ type: "save", seq: 2, value: "abc" });
    const done = apply(resolved.state, { type: "resolved", seq: 2 });
    expect(done.state.committed).toBe("abc");
    expect(done.state.status).toBe("saved");
  });

  it("ignores a stale response that is not the in-flight sequence", () => {
    let s = initAutosave("a");
    s = apply(s, { type: "edit", value: "ab", valid: true }).state;
    s = apply(s, { type: "requestSave" }).state; // seq 1
    const stale = apply(s, { type: "resolved", seq: 99 });
    expect(stale.state).toEqual(s); // unchanged
    expect(stale.effect).toBeNull();
  });

  it("preserves input and offers retry on failure", () => {
    let s = initAutosave("a");
    s = apply(s, { type: "edit", value: "ab", valid: true }).state;
    s = apply(s, { type: "requestSave" }).state; // seq 1
    const failed = apply(s, {
      type: "rejected",
      seq: 1,
      message: "Couldn’t save.",
    });
    expect(failed.state.status).toBe("error");
    expect(failed.state.error).toBe("Couldn’t save.");
    expect(failed.state.committed).toBe("a"); // NOT advanced
    expect(failed.state.current).toBe("ab"); // input preserved

    const retry = apply(failed.state, { type: "retry" });
    expect(retry.effect).toEqual({ type: "save", seq: 2, value: "ab" });
  });

  it("ignores a stale rejection", () => {
    let s = initAutosave("a");
    s = apply(s, { type: "edit", value: "ab", valid: true }).state;
    s = apply(s, { type: "requestSave" }).state; // seq 1
    const stale = apply(s, { type: "rejected", seq: 42, message: "x" });
    expect(stale.state.status).toBe("saving");
  });

  it("treats editing back to the committed value as nothing to save", () => {
    let s = initAutosave("a");
    s = apply(s, { type: "edit", value: "ab", valid: true }).state;
    s = apply(s, { type: "edit", value: "a", valid: true }).state;
    expect(s.status).toBe("idle");
    const req = apply(s, { type: "requestSave" });
    expect(req.effect).toBeNull();
  });
});
