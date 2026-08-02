/**
 * PWA-05 — server-side idempotency for replayed offline captures.
 *
 * ── The problem this solves ──────────────────────────────────────────────────
 * An offline capture is replayed over a network that has just proven unreliable,
 * so the client will sometimes retry a request whose response it never saw.
 * Without a server-side guarantee that produces a duplicate task, note or diary
 * entry — silently, in the modules the owner trusts most. A client-side "check
 * whether it already exists" is not a guarantee: two retries can both pass the
 * check before either commits.
 *
 * ── The guarantee ────────────────────────────────────────────────────────────
 * The client generates one idempotency key when the capture is QUEUED (not when
 * it is sent), so every retry of the same capture carries the same key. The
 * server claims the key with an `INSERT` before it creates anything:
 *
 *   - the insert succeeds → this request owns the creation; create the record,
 *     then record the resulting id against the claimed key;
 *   - the insert conflicts → some other attempt already owns it; read the receipt
 *     back and return the id it recorded, creating nothing.
 *
 * The primary key `(workspace_id, idempotency_key)` is what makes this safe under
 * concurrency: the DATABASE arbitrates, not application code.
 *
 * ── Two-phase, and what happens if phase two never runs ──────────────────────
 * The claim is written before the record exists, so a crash between the two
 * leaves a claimed key with no record id. That case is handled explicitly rather
 * than left as a silent hole: a receipt with an empty `record_id` is treated as
 * UNFINISHED, and the next attempt is allowed to take it over and complete it.
 * The alternative — creating first, claiming second — is worse: it can duplicate,
 * which is the exact failure this exists to prevent.
 *
 * ── Isolation ────────────────────────────────────────────────────────────────
 * Every statement is scoped to the workspace, and reconciliation additionally
 * requires the receipt's `owner_subject` and `record_kind` to match the current
 * request. A replayed capture therefore cannot cross a workspace boundary, be
 * attributed to a different identity, or have a note's receipt satisfied by the
 * task endpoint.
 */

import type { OfflineCaptureKind } from "~/kernel/offline";

/** The sentinel stored while a claim is held but the record does not exist yet. */
const UNFINISHED = "";

/** How long an unfinished claim may be held before another attempt takes it. */
const UNFINISHED_CLAIM_TAKEOVER_MS = 60_000;

/** Idempotency keys are client-generated UUIDs; the shape is enforced here too. */
const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{7,127}$/;

/** True for a syntactically acceptable idempotency key. */
export function isIdempotencyKey(value: unknown): value is string {
  return typeof value === "string" && KEY_PATTERN.test(value);
}

/** What a claim attempt concluded. */
export type CaptureClaim =
  /** This request owns creation. Call `completeClaim` with the created id. */
  | { readonly kind: "claimed" }
  /** Another attempt already created the record. Return this id; create nothing. */
  | { readonly kind: "alreadyCreated"; readonly recordId: string }
  /**
   * The key exists but belongs to a different identity, workspace-scoped kind, or
   * is still being completed by a concurrent attempt. The caller must NOT create.
   */
  | { readonly kind: "conflict"; readonly reason: string };

export interface CaptureReceiptContext {
  readonly db: D1Database;
  readonly workspaceId: string;
  readonly ownerSubject: string;
  readonly kind: OfflineCaptureKind;
  readonly now: Date;
}

/**
 * Claim an idempotency key, or discover that it is already spoken for.
 *
 * Returns `claimed` at most once per key per workspace under any amount of
 * concurrency, because the claim is an `INSERT` against a primary key.
 */
export async function claimCapture(
  context: CaptureReceiptContext,
  idempotencyKey: string,
): Promise<CaptureClaim> {
  if (!isIdempotencyKey(idempotencyKey)) {
    return { kind: "conflict", reason: "Malformed idempotency key." };
  }
  const nowIso = context.now.toISOString();

  // `ON CONFLICT DO NOTHING` + `RETURNING` gives us "did I win?" in one
  // statement, with no read-then-write race.
  const claimed = await context.db
    .prepare(
      `INSERT INTO offline_capture_receipts
         (workspace_id, idempotency_key, owner_subject, record_kind, record_id, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT (workspace_id, idempotency_key) DO NOTHING
       RETURNING idempotency_key`,
    )
    .bind(
      context.workspaceId,
      idempotencyKey,
      context.ownerSubject,
      context.kind,
      UNFINISHED,
      nowIso,
    )
    .first<{ idempotency_key: string }>();

  if (claimed) return { kind: "claimed" };

  const existing = await context.db
    .prepare(
      `SELECT owner_subject, record_kind, record_id, created_at
         FROM offline_capture_receipts
        WHERE workspace_id = ?1 AND idempotency_key = ?2`,
    )
    .bind(context.workspaceId, idempotencyKey)
    .first<{
      owner_subject: string;
      record_kind: string;
      record_id: string;
      created_at: string;
    }>();

  if (!existing) {
    // The row vanished between the two statements — only possible if something
    // deleted it. Refuse rather than guess; the client retries.
    return { kind: "conflict", reason: "The capture receipt is unavailable." };
  }
  if (
    existing.owner_subject !== context.ownerSubject ||
    existing.record_kind !== context.kind
  ) {
    // Never disclose WHICH check failed, and never reconcile across identities.
    return {
      kind: "conflict",
      reason: "That capture belongs to a different sign-in.",
    };
  }
  if (existing.record_id !== UNFINISHED) {
    return { kind: "alreadyCreated", recordId: existing.record_id };
  }

  // An unfinished claim. A concurrent attempt is probably mid-flight, so the
  // default is to wait; but a claim abandoned by a crashed request must not
  // strand the owner's capture forever, so after the takeover window this
  // request adopts it.
  const claimedAt = Date.parse(existing.created_at);
  const abandoned =
    Number.isFinite(claimedAt) &&
    context.now.getTime() - claimedAt >= UNFINISHED_CLAIM_TAKEOVER_MS;
  return abandoned
    ? { kind: "claimed" }
    : {
        kind: "conflict",
        reason: "That capture is already being created. Try again shortly.",
      };
}

/**
 * Record the created record's id against a claimed key. Scoped so it can only
 * complete a receipt this identity claimed, for this record kind, that is not
 * already completed.
 */
export async function completeClaim(
  context: CaptureReceiptContext,
  idempotencyKey: string,
  recordId: string,
): Promise<void> {
  await context.db
    .prepare(
      `UPDATE offline_capture_receipts
          SET record_id = ?1
        WHERE workspace_id = ?2
          AND idempotency_key = ?3
          AND owner_subject = ?4
          AND record_kind = ?5
          AND record_id = ''`,
    )
    .bind(
      recordId,
      context.workspaceId,
      idempotencyKey,
      context.ownerSubject,
      context.kind,
    )
    .run();
}

/**
 * Release a claim whose creation FAILED, so the owner's retry is not permanently
 * blocked by a receipt for a record that does not exist. Only ever deletes an
 * unfinished receipt owned by this identity — a completed receipt is immutable.
 */
export async function releaseClaim(
  context: CaptureReceiptContext,
  idempotencyKey: string,
): Promise<void> {
  await context.db
    .prepare(
      `DELETE FROM offline_capture_receipts
        WHERE workspace_id = ?1
          AND idempotency_key = ?2
          AND owner_subject = ?3
          AND record_id = ''`,
    )
    .bind(context.workspaceId, idempotencyKey, context.ownerSubject)
    .run();
}

/**
 * Read the offline replay key off a create submission, if there is one.
 *
 * Returns null when the field is absent (every ONLINE capture and every full
 * form), so the create routes keep their existing behaviour untouched: the
 * idempotency machinery engages only for a replayed offline capture.
 */
export function readIdempotencyKey(form: FormData): string | null {
  const raw = form.get("idempotencyKey");
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * The guard the three create routes wrap their existing handler in.
 *
 * It exists so `/tasks/new`, `/notes/new` and `/diary/new` each gain replay
 * safety with FIVE lines and no change to how they create anything: the module's
 * own handler, validation, Activity and workspace scoping are untouched, and
 * there is no second create path (`AGENTS.md §9.8`).
 *
 * The callbacks keep the guard result-shape-agnostic — each route's result type
 * is its own contract, and this must not flatten them into a shared one.
 *
 * @param createdIdOf   the created record's id from a successful result, else null
 * @param replayResult  build the route's success result for an already-created id
 * @param conflictResult build the route's failure result for a claim conflict
 */
export async function withReplayGuard<TResult>(
  context: CaptureReceiptContext,
  idempotencyKey: string | null,
  create: () => Promise<TResult>,
  createdIdOf: (result: TResult) => string | null,
  replayResult: (recordId: string) => TResult,
  conflictResult: (reason: string) => TResult,
): Promise<TResult> {
  if (idempotencyKey === null) return create();

  const claim = await claimCapture(context, idempotencyKey);
  if (claim.kind === "alreadyCreated") {
    // The record already exists from an earlier attempt. Report ITS id — this is
    // what makes a retry a no-op instead of a duplicate.
    return replayResult(claim.recordId);
  }
  if (claim.kind === "conflict") {
    return conflictResult(claim.reason);
  }

  let result: TResult;
  try {
    result = await create();
  } catch (cause) {
    // The claim must not outlive a creation that never happened, or the owner's
    // retry would be permanently answered with a conflict.
    await releaseClaim(context, idempotencyKey);
    throw cause;
  }
  const recordId = createdIdOf(result);
  if (recordId === null) {
    await releaseClaim(context, idempotencyKey);
    return result;
  }
  await completeClaim(context, idempotencyKey, recordId);
  return result;
}

/**
 * Run a creation idempotently. The single entry point the create routes use, so
 * no route re-implements the claim/complete/release dance.
 *
 * `create` is invoked AT MOST ONCE per key per workspace. When a previous attempt
 * already created the record, `create` is not invoked at all and the earlier id is
 * returned with `replayed: true`.
 */
export async function withCaptureIdempotency(
  context: CaptureReceiptContext,
  idempotencyKey: string,
  create: () => Promise<{ readonly recordId: string }>,
): Promise<
  | { readonly ok: true; readonly recordId: string; readonly replayed: boolean }
  | { readonly ok: false; readonly reason: string }
> {
  const claim = await claimCapture(context, idempotencyKey);
  if (claim.kind === "alreadyCreated") {
    return { ok: true, recordId: claim.recordId, replayed: true };
  }
  if (claim.kind === "conflict") {
    return { ok: false, reason: claim.reason };
  }
  try {
    const created = await create();
    await completeClaim(context, idempotencyKey, created.recordId);
    return { ok: true, recordId: created.recordId, replayed: false };
  } catch (cause) {
    await releaseClaim(context, idempotencyKey);
    throw cause;
  }
}
