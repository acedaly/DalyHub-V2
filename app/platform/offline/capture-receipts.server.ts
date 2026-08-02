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
 * leaves a claimed key with no record id. The alternative — creating first,
 * claiming second — is worse: it can duplicate, which is the exact failure this
 * exists to prevent.
 *
 * D1 has no interactive transaction that can span the module's own creation code,
 * so an unfinished receipt is genuinely ambiguous: the Worker may have died
 * BEFORE the create committed (nothing exists) or AFTER it committed but before
 * the receipt was finished (the record exists). Nothing on the server can tell
 * those apart after the fact.
 *
 * An earlier revision of this file resolved that ambiguity by letting the next
 * attempt take the claim over and create. That is the wrong trade: half the time
 * it silently writes a second task, note or diary entry — the precise failure the
 * table exists to prevent — and the owner has no way to know it happened.
 *
 * So an abandoned claim is resolved the honest way instead. It is finalised as
 * UNRESOLVED, which is terminal: no attempt ever creates under that key again,
 * and every later replay of it receives the same stable answer telling the owner
 * to check whether the capture arrived. That converts a rare invisible duplicate
 * into a rare visible question, which is the trade DalyHub wants. The capture
 * itself is never lost — it stays on the device, in the sync panel, with its text
 * intact. `PWA_AND_OFFLINE.md` records this as a known limitation rather than
 * implying the two-phase write is atomic.
 *
 * ── Isolation ────────────────────────────────────────────────────────────────
 * Every statement is scoped to the workspace, and reconciliation additionally
 * requires the receipt's `owner_subject` and `record_kind` to match the current
 * request. A replayed capture therefore cannot cross a workspace boundary, be
 * attributed to a different identity, or have a note's receipt satisfied by the
 * task endpoint.
 */

import {
  OFFLINE_CAPTURE_IN_PROGRESS,
  type OfflineCaptureKind,
} from "~/kernel/offline";

/** The sentinel stored while a claim is held but the record does not exist yet. */
const UNFINISHED = "";

/**
 * The sentinel that retires a key whose outcome can no longer be determined.
 *
 * Deliberately not a valid record id: it can never be mistaken for one, and every
 * read path checks for it before it checks for "already created".
 */
const UNRESOLVED = "unresolved";

/**
 * How long an unfinished claim is assumed to still be in flight.
 *
 * Below this a concurrent attempt is asked to try again shortly; above it the
 * claim is treated as abandoned and retired. Five minutes is far longer than any
 * Cloudflare Worker request can survive, so a claim that has passed it is not a
 * slow request — it is a request that will never come back.
 */
const UNFINISHED_CLAIM_ABANDONED_MS = 300_000;

/** What the owner is told when a capture's fate cannot be determined. */
const UNRESOLVED_REASON =
  "DalyHub could not confirm whether this capture was saved. " +
  "Check whether it is already there before capturing it again.";

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
   * The key exists but belongs to a different identity or record kind, is still
   * being completed by a concurrent attempt, or was retired as unresolved. The
   * caller must NOT create; `reason` is owner-readable and says which it is
   * without disclosing anything about another identity's data.
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
  if (existing.record_id === UNRESOLVED) {
    // Checked BEFORE "already created", so the sentinel can never be handed back
    // as though it were a record id.
    return { kind: "conflict", reason: UNRESOLVED_REASON };
  }
  if (existing.record_id !== UNFINISHED) {
    return { kind: "alreadyCreated", recordId: existing.record_id };
  }

  // An unfinished claim. Below the abandonment window a concurrent attempt is
  // probably still mid-flight, so this one waits rather than racing it.
  const claimedAt = Date.parse(existing.created_at);
  const abandoned =
    Number.isFinite(claimedAt) &&
    context.now.getTime() - claimedAt >= UNFINISHED_CLAIM_ABANDONED_MS;
  if (!abandoned) {
    return { kind: "conflict", reason: OFFLINE_CAPTURE_IN_PROGRESS };
  }

  // Abandoned. Retire the key rather than adopt it: whether the crashed attempt
  // committed its record is unknowable, and creating anyway is how duplicates
  // are made. The `record_id = ''` predicate is the compare-and-swap — any
  // number of concurrent attempts may run this statement, at most one changes
  // the row, and all of them return the same terminal answer, so none creates.
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
      UNRESOLVED,
      context.workspaceId,
      idempotencyKey,
      context.ownerSubject,
      context.kind,
    )
    .run();
  return { kind: "conflict", reason: UNRESOLVED_REASON };
}

/**
 * Record the created record's id against a claimed key. Scoped so it can only
 * complete a receipt this identity claimed, for this record kind, that is not
 * already completed.
 *
 * A receipt retired as UNRESOLVED is also completable, because the only caller
 * that reaches here is the attempt that actually created the record: it knows
 * the answer the retirement had to guess at. Correcting the receipt turns a
 * pessimistic "check whether this arrived" into the truth for every later
 * replay. A receipt already carrying a real id is never overwritten.
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
          AND record_id IN ('', 'unresolved')`,
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
