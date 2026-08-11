/**
 * PWA-12 — the conflict contract, as one pure decision both ends share.
 *
 * The server DECIDES here (inside the authenticated Task route, over the record it
 * just read from D1) and the client WORDS the result here. Neither imports the
 * other; the rule lives in the kernel so there is exactly one definition of "did
 * this change conflict?" and it can be tested without a database or a browser.
 *
 * ── Conflicts are ordinary, not exceptional ──────────────────────────────────
 * Two devices, one Task, one network partition: this is a normal distributed
 * outcome, not a mystery. PWA-12's rule is that DalyHub never guesses. It does not
 * silently overwrite the other device's change, and it does not silently discard
 * the owner's. It states what happened and offers the choice.
 *
 * ── Field-focused, deliberately ──────────────────────────────────────────────
 * The comparison is made on ONE field: the one the queued operation writes. Using
 * the Task's `updatedAt` instead would be simpler and would be wrong — `updatedAt`
 * moves for every field, so an offline priority change would be reported as
 * conflicting with an unrelated server title change. Those two are safely
 * mergeable, and §18 requires that they merge. The mutation endpoints are already
 * field-focused (`UpdateTaskInput` treats an omitted key as unchanged), so the
 * merge is a property of the existing architecture rather than something new.
 *
 * ── Three outcomes, and the middle one matters most ──────────────────────────
 *   applied    the field still holds the base value; write it
 *   satisfied  the field ALREADY holds the intended value; write nothing and
 *              report success, because the owner's intent is the current state
 *   conflict   the field holds a third value; the owner decides
 *
 * `satisfied` is what makes replay safe to repeat. A retry whose first attempt
 * succeeded but whose response was lost finds the field already carrying the
 * value it wanted, and is a truthful no-op rather than a conflict against itself.
 */

import {
  fieldFor,
  isReplaceOperation,
  type OfflineMutationConflict,
  type OfflineMutationOperation,
  type OfflineMutationValue,
} from "./offline-mutation";

/** What the conflict rule decided. */
export type OfflineConflictDecision =
  /** Apply the mutation: the field is where this device left it. */
  | { readonly kind: "applied" }
  /** Do nothing and report success: the field already holds the intent. */
  | { readonly kind: "satisfied" }
  /** Refuse and report: the field moved to a third value. */
  | { readonly kind: "conflict"; readonly conflict: OfflineMutationConflict };

/**
 * Normalise a stored value for comparison.
 *
 * `null` and the empty string are the SAME absence throughout DalyHub's task
 * fields — a cleared priority is null in the domain and "" on a form — so
 * comparing them raw would report a phantom conflict every time a value was
 * cleared. Titles are compared after trimming for the same reason: the domain
 * trims on write, so an untrimmed base could never match its own stored form.
 */
function normalise(value: OfflineMutationValue): string {
  return (value ?? "").trim();
}

/** True when two values mean the same thing to the Task domain. */
export function sameValue(
  a: OfflineMutationValue,
  b: OfflineMutationValue,
): boolean {
  return normalise(a) === normalise(b);
}

/**
 * The plain-language sentence a conflict is reported with.
 *
 * Product wording, never a status code: no "409", no "sync failed", no "record
 * version mismatch" (§19). The owner is told what happened in the terms they
 * think in — a Task changed somewhere else while they were offline.
 */
export function conflictMessage(operation: OfflineMutationOperation): string {
  switch (operation) {
    case "set_title":
      return "This task was renamed on another device while you were offline.";
    case "set_priority":
      return "This task's priority changed on another device while you were offline.";
    case "set_due":
      return "This task's due date changed on another device while you were offline.";
    case "set_planned":
      return "This task's planned date changed on another device while you were offline.";
    case "complete":
    case "reopen":
      return "This task changed on another device while you were offline.";
  }
}

/**
 * Decide whether a queued REPLACE-style mutation may be applied.
 *
 * @param operation the queued operation
 * @param base      the value this device believed the field held
 * @param current   the value the server holds now
 * @param intended  the value the owner wants
 */
export function decideReplaceConflict(input: {
  readonly operation: OfflineMutationOperation;
  readonly base: OfflineMutationValue;
  readonly current: OfflineMutationValue;
  readonly intended: OfflineMutationValue;
}): OfflineConflictDecision {
  // Checked FIRST, before the base comparison. A replay whose earlier attempt
  // reached the server sees `current === intended` while `base` is the old value,
  // and calling that a conflict would make every lost response into a question
  // for the owner.
  if (sameValue(input.current, input.intended)) return { kind: "satisfied" };
  if (sameValue(input.current, input.base)) return { kind: "applied" };
  return {
    kind: "conflict",
    conflict: {
      field: fieldFor(input.operation),
      serverValue: input.current,
      message: conflictMessage(input.operation),
    },
  };
}

/**
 * Decide whether a queued COMPLETION or REOPEN may be applied.
 *
 * Completion is not a text field and must not be reconciled like one (§20). The
 * only question that matters is whether the Task is already in the terminal state
 * the owner asked for:
 *
 *   - **complete, and it is already completed** → `satisfied`. The intended
 *     terminal state holds. This is the case that makes duplicate replay safe,
 *     and it is safe all the way down: `completeTask` is itself idempotent, so
 *     even a mutation that slipped past this check creates no second recurrence
 *     successor. The exactly-one-successor invariant is protected twice.
 *   - **complete, and it is open** → `applied`. Whether it was never completed or
 *     was completed and reopened elsewhere, the owner's intent is achievable and
 *     the canonical completion — including its recurrence consequence — decides
 *     what happens.
 *   - **reopen** is the mirror image.
 *
 * Note what this deliberately does NOT do: it never calls a state mismatch a
 * success just because something changed. "Already completed" is a success only
 * because it IS the state that was intended, not because completion is special.
 */
export function decideCompletionConflict(input: {
  readonly operation: Extract<OfflineMutationOperation, "complete" | "reopen">;
  readonly completedAt: string | null;
}): OfflineConflictDecision {
  const isCompleted = input.completedAt !== null;
  const wantsCompleted = input.operation === "complete";
  return isCompleted === wantsCompleted
    ? { kind: "satisfied" }
    : { kind: "applied" };
}

/** The one entry point: decide any supported operation. Pure and total. */
export function decideConflict(input: {
  readonly operation: OfflineMutationOperation;
  readonly base: OfflineMutationValue;
  readonly current: OfflineMutationValue;
  readonly intended: OfflineMutationValue;
}): OfflineConflictDecision {
  if (isReplaceOperation(input.operation)) {
    return decideReplaceConflict(input);
  }
  return decideCompletionConflict({
    operation: input.operation,
    // For a lifecycle operation the "current" value IS `completedAt`.
    completedAt: normalise(input.current).length === 0 ? null : input.current,
  });
}

/* -------------------------------------------------------------------------- */
/* The replay envelope                                                        */
/* -------------------------------------------------------------------------- */

/**
 * What a replayed mutation's response carries IN ADDITION to the route's own
 * result.
 *
 * An additive field, present only when a request supplied an idempotency key —
 * so the ordinary online path's response shape, and every consumer of it, is
 * untouched. The replay engine reads this; the interface never sees it.
 */
export type OfflineReplayReport =
  /** Applied now, or confirmed as already applied by an earlier attempt. */
  | { readonly kind: "applied"; readonly replayed: boolean }
  | { readonly kind: "conflict"; readonly conflict: OfflineMutationConflict }
  /**
   * An EARLIER attempt at this same mutation may still be in flight. Retryable,
   * and distinguished from a rejection because it is the commonest outcome there
   * is on a bad connection: the request was sent, the answer never arrived, and
   * the client asked again. Reporting it as permanent would present the owner's
   * change as lost when the right response is to wait a moment.
   */
  | { readonly kind: "busy"; readonly message: string }
  /** The target no longer exists. Permanent; never retried. */
  | { readonly kind: "gone"; readonly message: string }
  /** The domain refused the value. Permanent; never retried. */
  | { readonly kind: "invalid"; readonly message: string };

/** The envelope a replayed mutation's JSON response carries. */
export interface OfflineReplayEnvelope {
  readonly offline: OfflineReplayReport;
}

/** The wording for a mutation whose Task no longer exists. */
export const OFFLINE_TARGET_GONE =
  "This task was deleted on another device, so this change could not be applied.";

/**
 * The wording for a replay that arrives while an earlier attempt at the SAME
 * mutation may still be in flight.
 *
 * Shared with the client so the replay engine can tell it apart from a real
 * rejection: it is the commonest failure there is (the request was sent, the
 * answer never arrived, the client asked again), and reporting it as permanent
 * would present the owner's change as lost when the right response is to wait a
 * moment and ask again.
 */
export const OFFLINE_MUTATION_IN_PROGRESS =
  "That change is already being applied. Try again shortly.";
