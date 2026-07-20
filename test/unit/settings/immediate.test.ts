import { describe, expect, it } from "vitest";

import {
  initImmediate,
  reduceImmediate,
  type ImmediateState,
} from "~/shared/settings/model";

describe("DS-10b immediate-setting coordinator", () => {
  it("starts idle with the committed value shown", () => {
    const state = initImmediate(false);
    expect(state.status).toBe("idle");
    expect(state.optimistic).toBe(false);
    expect(state.committed).toBe(false);
  });

  it("shows the requested value optimistically and asks the host to apply it", () => {
    const { state, effect } = reduceImmediate(initImmediate(false), {
      type: "apply",
      value: true,
    });
    expect(state.status).toBe("saving");
    expect(state.optimistic).toBe(true);
    expect(state.committed).toBe(false); // not committed until resolve
    expect(effect).toEqual({ type: "apply", seq: 1, value: true });
  });

  it("commits the applied value on resolve", () => {
    const applied = reduceImmediate(initImmediate(false), {
      type: "apply",
      value: true,
    });
    const resolved = reduceImmediate(applied.state, {
      type: "resolved",
      seq: applied.effect!.seq,
    });
    expect(resolved.state.status).toBe("idle");
    expect(resolved.state.committed).toBe(true);
    expect(resolved.state.optimistic).toBe(true);
    expect(resolved.effect).toBeNull();
  });

  it("reverts to the committed value on failure", () => {
    const applied = reduceImmediate(initImmediate(false), {
      type: "apply",
      value: true,
    });
    const rejected = reduceImmediate(applied.state, {
      type: "rejected",
      seq: applied.effect!.seq,
    });
    expect(rejected.state.status).toBe("idle");
    expect(rejected.state.optimistic).toBe(false); // reverted
    expect(rejected.state.committed).toBe(false);
  });

  it("coalesces to the latest request and ignores a superseded response", () => {
    // Apply A (seq 1), then apply B (seq 2) before A resolves.
    const first = reduceImmediate(initImmediate<"a" | "b" | "c">("a"), {
      type: "apply",
      value: "b",
    });
    const second = reduceImmediate(first.state, { type: "apply", value: "c" });
    expect(second.state.optimistic).toBe("c");
    expect(second.effect).toEqual({ type: "apply", seq: 2, value: "c" });

    // A's late resolve (seq 1) must be ignored — it cannot commit the stale "b".
    const staleResolve = reduceImmediate(second.state, {
      type: "resolved",
      seq: first.effect!.seq,
    });
    expect(staleResolve.state).toBe(second.state);
    expect(staleResolve.state.optimistic).toBe("c");
    expect(staleResolve.state.status).toBe("saving");

    // B's resolve (seq 2) commits "c".
    const fresh = reduceImmediate(second.state, {
      type: "resolved",
      seq: second.effect!.seq,
    });
    expect(fresh.state.committed).toBe("c");
    expect(fresh.state.status).toBe("idle");
  });

  it("ignores a superseded rejection so a newer request stays authoritative", () => {
    const first = reduceImmediate(initImmediate("a"), {
      type: "apply",
      value: "b",
    });
    const second = reduceImmediate(first.state, { type: "apply", value: "c" });
    const staleReject = reduceImmediate(second.state, {
      type: "rejected",
      seq: first.effect!.seq,
    });
    // The newer optimistic value is preserved; no revert to committed.
    expect(staleReject.state.optimistic).toBe("c");
    expect(staleReject.state.status).toBe("saving");
  });

  it("assigns monotonic sequence numbers across applies", () => {
    let state: ImmediateState<number> = initImmediate(0);
    const a = reduceImmediate(state, { type: "apply", value: 1 });
    state = a.state;
    const b = reduceImmediate(state, { type: "apply", value: 2 });
    expect(a.effect!.seq).toBe(1);
    expect(b.effect!.seq).toBe(2);
  });
});
