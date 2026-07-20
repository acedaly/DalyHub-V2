/**
 * DS-10 Feedback platform — the pure background-operation lifecycle (React-free).
 *
 * ONE shared execution model for every long-running operation (AI, imports,
 * exports, sync, future integrations). The reducer here owns the state machine —
 * pending → running → success | failure, plus retry (a new attempt) — as pure,
 * deterministic transitions over immutable state. The provider owns the actual
 * `AbortController`, promise and timers; cancellation is realised by the provider
 * aborting and removing the row. Keeping the machine pure lets the whole lifecycle
 * be unit-tested with no DOM and no fake async.
 */

import type {
  OperationRecord,
  OperationStatus,
  OperationsState,
} from "./types";

/** The empty operations state. */
export function emptyOperations(): OperationsState {
  return { operations: Object.freeze([]) };
}

/** Begin tracking an operation (newest-first). */
export function startOperation(
  state: OperationsState,
  record: OperationRecord,
): OperationsState {
  return {
    operations: Object.freeze([
      record,
      ...state.operations.filter((o) => o.id !== record.id),
    ]),
  };
}

/**
 * Advance an operation to a new status. `updatedAt` is the injected clock time;
 * `error` is only meaningful for a failure. Unknown ids are a no-op.
 */
export function advanceOperation(
  state: OperationsState,
  id: string,
  status: OperationStatus,
  updatedAt: number,
  error?: string,
): OperationsState {
  let changed = false;
  const operations = state.operations.map((op) => {
    if (op.id !== id) {
      return op;
    }
    changed = true;
    return {
      ...op,
      status,
      updatedAt,
      error: status === "failure" ? error : undefined,
    };
  });
  return changed ? { operations: Object.freeze(operations) } : state;
}

/**
 * Retry a failed operation: increment the attempt, clear the error and return it
 * to `running`. Only a failed operation can be retried; other states are a no-op.
 */
export function retryOperation(
  state: OperationsState,
  id: string,
  updatedAt: number,
): OperationsState {
  let changed = false;
  const operations = state.operations.map((op) => {
    if (op.id !== id || op.status !== "failure") {
      return op;
    }
    changed = true;
    return {
      ...op,
      status: "running" as OperationStatus,
      error: undefined,
      attempt: op.attempt + 1,
      updatedAt,
    };
  });
  return changed ? { operations: Object.freeze(operations) } : state;
}

/** Remove an operation by id (used on success auto-clear, dismissal, cancel). */
export function removeOperation(
  state: OperationsState,
  id: string,
): OperationsState {
  const operations = state.operations.filter((o) => o.id !== id);
  if (operations.length === state.operations.length) {
    return state;
  }
  return { operations: Object.freeze(operations) };
}

/** Look up an operation by id (or `undefined`). */
export function findOperation(
  state: OperationsState,
  id: string,
): OperationRecord | undefined {
  return state.operations.find((o) => o.id === id);
}

/** Whether an operation is still in flight (pending or running). */
export function isOperationActive(record: OperationRecord): boolean {
  return record.status === "pending" || record.status === "running";
}
