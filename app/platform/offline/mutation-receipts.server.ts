/**
 * PWA-12 — server-side idempotency and conflict arbitration for replayed offline
 * Task mutations.
 *
 * The PWA-05 capture protocol (`capture-receipts.server.ts`), applied to intents
 * over EXISTING records rather than to creations. Same shape, same reasoning,
 * same sentinels — deliberately, because inventing a second idempotency system
 * for offline Tasks is exactly what §6 forbids:
 *
 *   - the client generates one key when the mutation is QUEUED, so every retry of
 *     the same intent carries the same key;
 *   - the server claims the key with an `INSERT` before it applies anything;
 *   - the insert succeeds → this request owns the application;
 *   - the insert conflicts → some other attempt already owns it; the receipt is
 *     read back and its recorded outcome is reported, applying nothing.
 *
 * The primary key `(workspace_id, idempotency_key)` is what makes this safe under
 * concurrency: the DATABASE arbitrates, not application code.
 *
 * ── This is the SECOND protection, not the only one ──────────────────────────
 * `TaskRepository.completeTask` is already an idempotent no-op on an
 * already-completed Task: no batch, no Activity, and — crucially — no second
 * recurrence successor. The receipt layer sits above that, so the
 * exactly-one-successor invariant survives even a replay that somehow bypassed
 * the receipt. Neither protection is load-bearing alone, and that is the point.
 *
 * ── A conflict RELEASES the claim; an application retires it ─────────────────
 * The one place this protocol departs from the capture one, and it is
 * load-bearing. A conflict is not an outcome — it is a question for the owner,
 * who may answer it by choosing "keep my change" and sending the SAME mutation
 * again under the SAME key. If a conflict finalised the receipt, that answer
 * would be permanently unanswerable: every retry would be told "conflict" by a
 * row rather than by the record. So a conflict deletes its own unfinished claim
 * and the next attempt starts cleanly.
 *
 * ── Isolation ────────────────────────────────────────────────────────────────
 * Every statement is scoped to the workspace, and reconciliation additionally
 * requires the receipt's `owner_subject`, `entity_id` and `operation` to match
 * the current request. A replayed mutation therefore cannot cross a workspace
 * boundary, be attributed to a different identity, or have one Task's receipt
 * satisfied by a request naming another. There is no unauthenticated replay
 * endpoint: this runs inside the same authenticated, CSRF-protected route the
 * online controls post to.
 */

import {
  OFFLINE_MUTATION_IN_PROGRESS,
  OFFLINE_TARGET_GONE,
  decideConflict,
  isOfflineMutationOperation,
  isReplaceOperation,
  type OfflineMutationOperation,
  type OfflineMutationValue,
  type OfflineReplayReport,
} from "~/kernel/offline";

/** The sentinel stored while a claim is held but the intent is not applied yet. */
const UNFINISHED = "";

/**
 * The sentinel that retires a key whose outcome can no longer be determined.
 * Deliberately not a real outcome, and checked before every other read path.
 */
const UNRESOLVED = "unresolved";

/** The terminal outcomes a completed receipt can record. */
const OUTCOME_APPLIED = "applied";
const OUTCOME_SATISFIED = "satisfied";
const OUTCOME_GONE = "gone";

/**
 * How long an unfinished claim is assumed to still be in flight. Five minutes is
 * far longer than any Cloudflare Worker request can survive, so a claim past it
 * is not a slow request — it is a request that will never come back.
 */
const UNFINISHED_CLAIM_ABANDONED_MS = 300_000;

/** What the owner is told when a change's fate cannot be determined. */
const UNRESOLVED_REASON =
  "DalyHub could not confirm whether this change was applied. " +
  "Check the task before making the change again.";

/** Idempotency keys are client-generated UUIDs; the shape is enforced here too. */
const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{7,127}$/;

/** The largest queued value the server will accept from a replay. */
const MAX_BASE_LENGTH = 1_024;

/** True for a syntactically acceptable idempotency key. */
export function isMutationKey(value: unknown): value is string {
  return typeof value === "string" && KEY_PATTERN.test(value);
}

/* -------------------------------------------------------------------------- */
/* Reading the request                                                        */
/* -------------------------------------------------------------------------- */

/** The offline-replay fields a queued mutation adds to an ordinary submission. */
export interface TaskReplayRequest {
  readonly idempotencyKey: string;
  readonly operation: OfflineMutationOperation;
  /** The value this device believed the field held when the owner acted. */
  readonly baseValue: OfflineMutationValue;
  /** The value the owner intends. Null for `complete`/`reopen`. */
  readonly intendedValue: OfflineMutationValue;
}

/** The form field names the replay contract adds. One place, so both ends agree. */
export const OFFLINE_REPLAY_FIELDS = {
  key: "offlineKey",
  operation: "offlineOperation",
  base: "offlineBase",
} as const;

/**
 * Read the offline replay fields off a Task submission, if there are any.
 *
 * Returns `null` when the key is absent — which is EVERY online mutation. That is
 * what keeps the ordinary path exactly as fast and exactly as it was: no claim,
 * no receipt, no extra statement, and a response shape with no additional field.
 * The idempotency machinery engages only for a replayed offline mutation.
 *
 * Returns `"malformed"` when the fields are present but unusable, so the caller
 * refuses rather than silently applying an unguarded write under an intent it
 * could not verify.
 */
export function readTaskReplayRequest(
  form: FormData,
  intendedValue: OfflineMutationValue,
): TaskReplayRequest | null | "malformed" {
  const raw = form.get(OFFLINE_REPLAY_FIELDS.key);
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  const idempotencyKey = raw.trim();
  const operation = form.get(OFFLINE_REPLAY_FIELDS.operation);
  if (!isMutationKey(idempotencyKey)) return "malformed";
  if (!isOfflineMutationOperation(operation)) return "malformed";
  const baseRaw = form.get(OFFLINE_REPLAY_FIELDS.base);
  const baseValue = typeof baseRaw === "string" ? baseRaw : null;
  if ((baseValue?.length ?? 0) > MAX_BASE_LENGTH) return "malformed";
  return {
    idempotencyKey,
    operation,
    baseValue,
    intendedValue: isReplaceOperation(operation) ? intendedValue : null,
  };
}

/* -------------------------------------------------------------------------- */
/* The claim protocol                                                         */
/* -------------------------------------------------------------------------- */

export interface MutationReceiptContext {
  readonly db: D1Database;
  readonly workspaceId: string;
  readonly ownerSubject: string;
  readonly entityId: string;
  readonly operation: OfflineMutationOperation;
  readonly now: Date;
}

/** What a claim attempt concluded. */
export type MutationClaim =
  /** This request owns the application. */
  | { readonly kind: "claimed" }
  /** An earlier attempt already settled it. Report this; apply nothing. */
  | { readonly kind: "settled"; readonly outcome: string }
  /**
   * The key exists but belongs to a different identity, entity or operation, is
   * still being completed by a concurrent attempt, or was retired as unresolved.
   * `retryable` separates "ask again shortly" from "this is terminal".
   */
  | {
      readonly kind: "conflict";
      readonly reason: string;
      readonly retryable: boolean;
    };

/** Claim an idempotency key, or discover that it is already spoken for. */
export async function claimMutation(
  context: MutationReceiptContext,
  idempotencyKey: string,
): Promise<MutationClaim> {
  if (!isMutationKey(idempotencyKey)) {
    return {
      kind: "conflict",
      reason: "Malformed idempotency key.",
      retryable: false,
    };
  }
  const nowIso = context.now.toISOString();

  // `ON CONFLICT DO NOTHING` + `RETURNING` answers "did I win?" in one statement,
  // with no read-then-write race.
  const claimed = await context.db
    .prepare(
      `INSERT INTO offline_mutation_receipts
         (workspace_id, idempotency_key, owner_subject, entity_id, operation, outcome, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
       ON CONFLICT (workspace_id, idempotency_key) DO NOTHING
       RETURNING idempotency_key`,
    )
    .bind(
      context.workspaceId,
      idempotencyKey,
      context.ownerSubject,
      context.entityId,
      context.operation,
      UNFINISHED,
      nowIso,
    )
    .first<{ idempotency_key: string }>();

  if (claimed) return { kind: "claimed" };

  const existing = await context.db
    .prepare(
      `SELECT owner_subject, entity_id, operation, outcome, created_at
         FROM offline_mutation_receipts
        WHERE workspace_id = ?1 AND idempotency_key = ?2`,
    )
    .bind(context.workspaceId, idempotencyKey)
    .first<{
      owner_subject: string;
      entity_id: string;
      operation: string;
      outcome: string;
      created_at: string;
    }>();

  if (!existing) {
    // The row vanished between the two statements — only possible if something
    // deleted it. Refuse rather than guess; the client retries.
    return {
      kind: "conflict",
      reason: "The change receipt is unavailable.",
      retryable: true,
    };
  }
  if (
    existing.owner_subject !== context.ownerSubject ||
    existing.entity_id !== context.entityId ||
    existing.operation !== context.operation
  ) {
    // Never disclose WHICH check failed, and never reconcile across identities or
    // records.
    return {
      kind: "conflict",
      reason: "That change belongs to a different sign-in.",
      retryable: false,
    };
  }
  if (existing.outcome === UNRESOLVED) {
    // Checked BEFORE "already settled", so the sentinel can never be handed back
    // as though it were an outcome.
    return { kind: "conflict", reason: UNRESOLVED_REASON, retryable: false };
  }
  if (existing.outcome !== UNFINISHED) {
    return { kind: "settled", outcome: existing.outcome };
  }

  // An unfinished claim. Below the abandonment window a concurrent attempt is
  // probably still mid-flight, so this one waits rather than racing it.
  const claimedAt = Date.parse(existing.created_at);
  const abandoned =
    Number.isFinite(claimedAt) &&
    context.now.getTime() - claimedAt >= UNFINISHED_CLAIM_ABANDONED_MS;
  if (!abandoned) {
    return {
      kind: "conflict",
      reason: OFFLINE_MUTATION_IN_PROGRESS,
      retryable: true,
    };
  }

  // Abandoned. Retire the key rather than adopt it: whether the crashed attempt
  // applied its intent is unknowable, and applying anyway is how a duplicate is
  // made. The `outcome = ''` predicate is the compare-and-swap — any number of
  // concurrent attempts may run this statement, at most one changes the row, and
  // all of them return the same terminal answer, so none applies.
  await context.db
    .prepare(
      `UPDATE offline_mutation_receipts
          SET outcome = ?1
        WHERE workspace_id = ?2
          AND idempotency_key = ?3
          AND owner_subject = ?4
          AND outcome = ''`,
    )
    .bind(UNRESOLVED, context.workspaceId, idempotencyKey, context.ownerSubject)
    .run();
  return { kind: "conflict", reason: UNRESOLVED_REASON, retryable: false };
}

/** Record a terminal outcome against a claimed key. Never overwrites a real one. */
export async function settleMutation(
  context: MutationReceiptContext,
  idempotencyKey: string,
  outcome: string,
): Promise<void> {
  await context.db
    .prepare(
      `UPDATE offline_mutation_receipts
          SET outcome = ?1
        WHERE workspace_id = ?2
          AND idempotency_key = ?3
          AND owner_subject = ?4
          AND entity_id = ?5
          AND operation = ?6
          AND outcome IN ('', 'unresolved')`,
    )
    .bind(
      outcome,
      context.workspaceId,
      idempotencyKey,
      context.ownerSubject,
      context.entityId,
      context.operation,
    )
    .run();
}

/**
 * Release a claim whose application did NOT happen, so the owner's retry is not
 * permanently blocked by a receipt for a change that was never made.
 *
 * Used for two things: a thrown application (nothing was written), and a CONFLICT
 * (nothing was written, and the owner may yet choose to send the same intent
 * again under the same key). Only ever deletes an unfinished receipt owned by
 * this identity — a settled receipt is immutable.
 */
export async function releaseMutation(
  context: MutationReceiptContext,
  idempotencyKey: string,
): Promise<void> {
  await context.db
    .prepare(
      `DELETE FROM offline_mutation_receipts
        WHERE workspace_id = ?1
          AND idempotency_key = ?2
          AND owner_subject = ?3
          AND outcome = ''`,
    )
    .bind(context.workspaceId, idempotencyKey, context.ownerSubject)
    .run();
}

/* -------------------------------------------------------------------------- */
/* The guard the Task route wraps its dispatch in                             */
/* -------------------------------------------------------------------------- */

/** What the guard concluded, and the route's own result when it applied. */
export type TaskReplayOutcome<TResult> =
  | {
      readonly applied: true;
      readonly result: TResult;
      readonly report: OfflineReplayReport;
    }
  | { readonly applied: false; readonly report: OfflineReplayReport };

/**
 * Run one replayed Task mutation idempotently, arbitrating conflict first.
 *
 * `currentValue` is the value the CURRENT server record holds for the field this
 * operation writes, or `undefined` when the Task no longer exists. `apply` is the
 * route's ordinary handler for the intent — the same one an online submission
 * runs — and it is invoked AT MOST ONCE per key per workspace.
 *
 * The order is deliberate. The claim comes first (so two concurrent replays
 * cannot both proceed), the conflict decision second (so a contended field is
 * never written), and the application last.
 */
export async function withTaskMutationReplay<TResult>(
  context: MutationReceiptContext,
  replay: TaskReplayRequest,
  currentValue: OfflineMutationValue | undefined,
  apply: () => Promise<TResult>,
): Promise<TaskReplayOutcome<TResult>> {
  const claim = await claimMutation(context, replay.idempotencyKey);
  if (claim.kind === "settled") {
    // An earlier attempt already settled this exact intent. Report ITS outcome —
    // this is what makes a retry a no-op instead of a second application.
    return {
      applied: false,
      report:
        claim.outcome === OUTCOME_GONE
          ? { kind: "gone", message: OFFLINE_TARGET_GONE }
          : { kind: "applied", replayed: true },
    };
  }
  if (claim.kind === "conflict") {
    // `busy` and `invalid` are the same HTTP response and a different instruction
    // to the replay engine: one says "ask again shortly", the other says "stop".
    // Collapsing them would either strand a recoverable change or retry an
    // unrecoverable one forever.
    return {
      applied: false,
      report: claim.retryable
        ? { kind: "busy", message: claim.reason }
        : { kind: "invalid", message: claim.reason },
    };
  }

  if (currentValue === undefined) {
    // The Task is gone. Settle terminally: no later replay of this key should
    // reach the domain, and the owner is told plainly rather than watching a
    // change retry against a record that no longer exists.
    await settleMutation(context, replay.idempotencyKey, OUTCOME_GONE);
    return {
      applied: false,
      report: { kind: "gone", message: OFFLINE_TARGET_GONE },
    };
  }

  const decision = decideConflict({
    operation: replay.operation,
    base: replay.baseValue,
    current: currentValue,
    intended: replay.intendedValue,
  });

  if (decision.kind === "conflict") {
    // Nothing was written, and the owner may yet answer this by choosing to send
    // the same intent again. The claim must not outlive a question.
    await releaseMutation(context, replay.idempotencyKey);
    return {
      applied: false,
      report: { kind: "conflict", conflict: decision.conflict },
    };
  }

  if (decision.kind === "satisfied") {
    // The record already holds the intended state — because an earlier attempt
    // applied it and its response was lost, or because another device made the
    // same change. Either way the owner's intent IS the current state, so this
    // is a truthful success with nothing written.
    await settleMutation(context, replay.idempotencyKey, OUTCOME_SATISFIED);
    return { applied: false, report: { kind: "applied", replayed: true } };
  }

  let result: TResult;
  try {
    result = await apply();
  } catch (cause) {
    // The claim must not outlive an application that never happened, or the
    // owner's retry would be permanently answered with a conflict.
    await releaseMutation(context, replay.idempotencyKey);
    throw cause;
  }
  await settleMutation(context, replay.idempotencyKey, OUTCOME_APPLIED);
  return {
    applied: true,
    result,
    report: { kind: "applied", replayed: false },
  };
}
