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

/**
 * NOTES-05 §18 — the reconciliation contract (closing [DEBT-47]).
 *
 * The rule under test is one sentence: an external change is adopted only when
 * there is nothing the user could lose, and otherwise it is OFFERED, never
 * applied and never dropped.
 */
describe("autosave reconciliation with server-side change", () => {
  it("adopts an external value silently while the field is clean", () => {
    const s = apply(initAutosave("a"), { type: "external", value: "server" });
    expect(s.state.current).toBe("server");
    expect(s.state.committed).toBe("server");
    expect(s.state.status).toBe("idle");
    expect(s.state.remote).toBeNull();
    expect(s.effect).toBeNull(); // adopting is not an edit — it saves nothing
  });

  it("adopts silently after a settled save, because there is still no draft", () => {
    let s = initAutosave("a");
    s = apply(s, { type: "edit", value: "mine", valid: true }).state;
    s = apply(s, { type: "requestSave" }).state;
    s = apply(s, { type: "resolved", seq: 1 }).state;
    expect(s.status).toBe("saved");
    const external = apply(s, { type: "external", value: "server" });
    expect(external.state.current).toBe("server");
    expect(external.state.remote).toBeNull();
  });

  it("NEVER overwrites an unsaved draft — it parks the newer version instead", () => {
    let s = initAutosave("a");
    s = apply(s, { type: "edit", value: "my draft", valid: true }).state;
    const external = apply(s, { type: "external", value: "server" });
    expect(external.state.current).toBe("my draft"); // the draft is untouched
    expect(external.state.committed).toBe("a");
    expect(external.state.status).toBe("unsaved");
    expect(external.state.remote).toBe("server");
  });

  it("parks rather than adopts while a save is in flight", () => {
    let s = initAutosave("a");
    s = apply(s, { type: "edit", value: "mine", valid: true }).state;
    s = apply(s, { type: "requestSave" }).state;
    const external = apply(s, { type: "external", value: "server" });
    expect(external.state.status).toBe("saving");
    expect(external.state.current).toBe("mine");
    expect(external.state.remote).toBe("server");
  });

  it("parks rather than adopts while a save has FAILED — the draft is the only copy", () => {
    let s = initAutosave("a");
    s = apply(s, { type: "edit", value: "mine", valid: true }).state;
    s = apply(s, { type: "requestSave" }).state;
    s = apply(s, { type: "rejected", seq: 1, message: "nope" }).state;
    const external = apply(s, { type: "external", value: "server" });
    expect(external.state.current).toBe("mine");
    expect(external.state.remote).toBe("server");
  });

  it("treats an external value equal to the committed one as agreement, not a conflict", () => {
    let s = initAutosave("a");
    s = apply(s, { type: "edit", value: "mine", valid: true }).state;
    const external = apply(s, { type: "external", value: "a" });
    expect(external.state.remote).toBeNull();
    expect(external.state.current).toBe("mine");
  });

  it("clears a parked version once our own save becomes the server's value", () => {
    let s = initAutosave("a");
    s = apply(s, { type: "edit", value: "mine", valid: true }).state;
    s = apply(s, { type: "requestSave" }).state;
    s = apply(s, { type: "external", value: "server" }).state;
    expect(s.remote).toBe("server");
    s = apply(s, { type: "resolved", seq: 1 }).state;
    // Offering "server" now would offer content that no longer exists anywhere.
    expect(s.remote).toBeNull();
    expect(s.committed).toBe("mine");
  });

  it("adopts the parked version on an explicit choice, discarding the draft", () => {
    let s = initAutosave("a");
    s = apply(s, { type: "edit", value: "mine", valid: true }).state;
    s = apply(s, { type: "external", value: "server" }).state;
    const adopted = apply(s, { type: "adoptRemote" });
    expect(adopted.state.current).toBe("server");
    expect(adopted.state.committed).toBe("server");
    expect(adopted.state.status).toBe("idle");
    expect(adopted.state.remote).toBeNull();
    // Adopting the server's value must not then save it back.
    expect(adopted.effect).toBeNull();
    expect(isPersisted(adopted.state)).toBe(true);
  });

  it("refuses to adopt mid-save, where the in-flight save would land afterwards", () => {
    let s = initAutosave("a");
    s = apply(s, { type: "edit", value: "mine", valid: true }).state;
    s = apply(s, { type: "requestSave" }).state;
    s = apply(s, { type: "external", value: "server" }).state;
    const adopted = apply(s, { type: "adoptRemote" });
    expect(adopted.state.current).toBe("mine");
    expect(adopted.state.remote).toBe("server");
  });

  it("keeps the draft and stops offering on dismiss", () => {
    let s = initAutosave("a");
    s = apply(s, { type: "edit", value: "mine", valid: true }).state;
    s = apply(s, { type: "external", value: "server" }).state;
    const dismissed = apply(s, { type: "dismissRemote" });
    expect(dismissed.state.current).toBe("mine");
    expect(dismissed.state.remote).toBeNull();
    // The draft still saves normally afterwards — deliberately last-write-wins.
    expect(apply(dismissed.state, { type: "requestSave" }).effect).toEqual({
      type: "save",
      seq: 1,
      value: "mine",
    });
  });

  it("is a no-op to adopt or dismiss when nothing is parked", () => {
    const s = initAutosave("a");
    expect(apply(s, { type: "adoptRemote" }).state).toBe(s);
    expect(apply(s, { type: "dismissRemote" }).state).toBe(s);
  });

  it("keeps the parked version across further editing — the conflict is unresolved until answered", () => {
    let s = initAutosave("a");
    s = apply(s, { type: "edit", value: "mine", valid: true }).state;
    s = apply(s, { type: "external", value: "server" }).state;
    s = apply(s, { type: "edit", value: "mine more", valid: true }).state;
    expect(s.remote).toBe("server");
    expect(s.current).toBe("mine more");
  });
});
