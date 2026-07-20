import { describe, expect, it } from "vitest";

import {
  advanceOperation,
  emptyOperations,
  findOperation,
  isOperationActive,
  removeOperation,
  retryOperation,
  startOperation,
} from "~/shared/feedback/operations";
import type { OperationRecord } from "~/shared/feedback/types";

function op(overrides: Partial<OperationRecord> = {}): OperationRecord {
  return {
    id: overrides.id ?? "op1",
    label: overrides.label ?? "Importing",
    description: overrides.description,
    status: overrides.status ?? "pending",
    error: overrides.error,
    cancellable: overrides.cancellable ?? false,
    retryable: overrides.retryable ?? false,
    attempt: overrides.attempt ?? 1,
    createdAt: overrides.createdAt ?? 0,
    updatedAt: overrides.updatedAt ?? 0,
  };
}

describe("DS-10 operation lifecycle", () => {
  it("starts an operation newest-first", () => {
    let state = emptyOperations();
    state = startOperation(state, op({ id: "a" }));
    state = startOperation(state, op({ id: "b" }));
    expect(state.operations.map((o) => o.id)).toEqual(["b", "a"]);
  });

  it("advances pending → running → success", () => {
    let state = startOperation(emptyOperations(), op({ id: "a" }));
    state = advanceOperation(state, "a", "running", 10);
    expect(findOperation(state, "a")?.status).toBe("running");
    state = advanceOperation(state, "a", "success", 20);
    const done = findOperation(state, "a");
    expect(done?.status).toBe("success");
    expect(done?.updatedAt).toBe(20);
    expect(done?.error).toBeUndefined();
  });

  it("records an error only on failure", () => {
    let state = startOperation(emptyOperations(), op({ id: "a" }));
    state = advanceOperation(state, "a", "failure", 30, "Network error");
    expect(findOperation(state, "a")?.error).toBe("Network error");
    // Advancing away from failure clears the error.
    state = advanceOperation(state, "a", "running", 40);
    expect(findOperation(state, "a")?.error).toBeUndefined();
  });

  it("retries only a failed operation, incrementing the attempt", () => {
    let state = startOperation(
      emptyOperations(),
      op({ id: "a", status: "failure", error: "boom", attempt: 1 }),
    );
    state = retryOperation(state, "a", 50);
    const retried = findOperation(state, "a");
    expect(retried?.status).toBe("running");
    expect(retried?.attempt).toBe(2);
    expect(retried?.error).toBeUndefined();
  });

  it("does not retry a non-failed operation", () => {
    const state = startOperation(
      emptyOperations(),
      op({ id: "a", status: "running" }),
    );
    expect(retryOperation(state, "a", 60)).toBe(state);
  });

  it("removes an operation (cancel / dismiss / auto-clear)", () => {
    let state = startOperation(emptyOperations(), op({ id: "a" }));
    state = removeOperation(state, "a");
    expect(state.operations).toHaveLength(0);
    expect(removeOperation(state, "a")).toBe(state);
  });

  it("reports active status for pending/running only", () => {
    expect(isOperationActive(op({ status: "pending" }))).toBe(true);
    expect(isOperationActive(op({ status: "running" }))).toBe(true);
    expect(isOperationActive(op({ status: "success" }))).toBe(false);
    expect(isOperationActive(op({ status: "failure" }))).toBe(false);
  });

  it("is a no-op advancing an unknown id", () => {
    const state = startOperation(emptyOperations(), op({ id: "a" }));
    expect(advanceOperation(state, "missing", "success", 70)).toBe(state);
  });
});
