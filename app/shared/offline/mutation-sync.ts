/**
 * PWA-12 — the Task mutation replay engine.
 *
 * The mirror of `sync.ts`'s capture replay, for intents over existing records.
 * Same shape by design: read the queue first (an empty queue costs zero
 * requests), select a bounded batch, lease each record before it is sent, apply
 * the outcome, stop the pass the moment authentication is the problem.
 *
 * ── Replay goes through the real protected route ─────────────────────────────
 * There is no `/offline/mutate` endpoint and no second Task authority. Every
 * queued intent is POSTed to `/tasks/:taskId` — the canonical record route the
 * Drawer, the row and the quick-edit panel all post to — with the same
 * credentials, the same session cookie, the same Cloudflare Access posture and
 * the same server-side workspace resolution. The only fields replay adds are the
 * idempotency key, the declared operation and the base value. CAPTURE-01's
 * limited `dhcap_` credential is NOT used and must never be: it exists to bring
 * thoughts in, not to edit Tasks.
 *
 * ── The order of the checks matters ──────────────────────────────────────────
 * Before ANY replay: is there work, is the backend reachable, is the session
 * valid, and does the queued record's namespace match the identity + workspace
 * signed in right now? The namespace check is not defensive programming — it is
 * the mechanism that stops one identity's offline edit being applied in another
 * identity's workspace on a shared browser profile.
 */

import {
  OFFLINE_MUTATION_IN_PROGRESS,
  applyMutationOutcome,
  beginMutationAttempt,
  canReachBackend,
  isStalledMutation,
  reclaimStalledMutation,
  selectReplayBatch,
  type OfflineConnectionState,
  type OfflineMutationConflict,
  type OfflineMutationOutcome,
  type OfflineMutationRecord,
  type OfflineReplayReport,
} from "~/kernel/offline";

import { notifyMutationQueueChanged } from "./mutation-queue";
import { putMutationRecord, readMutations } from "./offline-store";
import { probeConnection } from "./probe";

/** How many mutations one pass replays. Bounded so a pass always terminates. */
export const MUTATION_REPLAY_BATCH_SIZE = 12;

/**
 * The canonical `intent` and form key each operation is carried by.
 *
 * The client half of the mapping the route enforces. An exhaustive switch, so a
 * new operation cannot be added to the kernel without this failing to compile —
 * which is the only reliable way to keep what is SENT and what is ACCEPTED from
 * drifting apart.
 */
function submissionFor(record: OfflineMutationRecord): {
  readonly intent: string;
  readonly field: string | null;
} {
  switch (record.operation) {
    case "complete":
      return { intent: "complete", field: null };
    case "reopen":
      return { intent: "reopen", field: null };
    case "set_title":
      return { intent: "rename", field: "title" };
    case "set_priority":
      return { intent: "update", field: "priority" };
    case "set_due":
      return { intent: "update", field: "dueDate" };
    case "set_planned":
      // The PLANNED date has its own domain authority, and CLEARING it is a
      // different canonical operation from setting it (ADR-043 §3). Replay uses
      // the same two intents the online control does rather than a generic field
      // write, because a queued intent must reach the same domain path.
      return record.value === null || record.value.length === 0
        ? { intent: "clear_plan", field: null }
        : { intent: "plan", field: "scheduledDate" };
  }
}

/** Build the form body for one queued mutation. Pure, so a test can read it. */
export function mutationFormData(record: OfflineMutationRecord): FormData {
  const submission = submissionFor(record);
  const form = new FormData();
  form.set("intent", submission.intent);
  if (submission.field !== null) {
    // An empty string is how every DalyHub form says "cleared", and the route's
    // `nullable()` reads it back as null. A queued clear therefore travels as the
    // same submission the online control produces.
    form.set(submission.field, record.value ?? "");
  }
  form.set("offlineKey", record.id);
  form.set("offlineOperation", record.operation);
  form.set("offlineBase", record.baseValue ?? "");
  return form;
}

/**
 * Turn a Task route response into a replay outcome.
 *
 * The route answers with JSON on success AND on refusal, so the classification
 * reads the body, not just the status. Anything that is not a recognisable
 * DalyHub answer is treated as RETRYABLE rather than as a rejection: discarding
 * an owner's change because a proxy returned an HTML error page would be the
 * worst possible failure mode.
 */
export async function classifyMutationResponse(
  response: Response,
): Promise<OfflineMutationOutcome> {
  if (response.type === "opaqueredirect" || response.status === 0) {
    return { kind: "blocked", reason: "Your DalyHub sign-in has expired." };
  }
  if (response.status === 401 || response.status === 403) {
    return { kind: "blocked", reason: "Your DalyHub sign-in has expired." };
  }
  if (response.status >= 500) {
    return {
      kind: "retryable",
      category: "server",
      reason: "DalyHub is temporarily unavailable.",
    };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return {
      kind: "retryable",
      category: "server",
      reason: "DalyHub did not answer in a way this device understood.",
    };
  }

  const payload = body as {
    offline?: OfflineReplayReport;
    kind?: string;
    ok?: boolean;
    status?: string;
    message?: string;
    formError?: string;
    fieldErrors?: Record<string, string>;
  };

  // The envelope is authoritative when present: it is the server's own statement
  // about THIS replay, made by the code that arbitrated it.
  const report = payload.offline;
  if (report) {
    switch (report.kind) {
      case "applied":
        return { kind: "applied" };
      case "conflict":
        return { kind: "conflict", conflict: report.conflict };
      case "busy":
        return {
          kind: "retryable",
          category: "interrupted",
          reason: report.message,
        };
      case "gone":
        return { kind: "rejected", category: "gone", reason: report.message };
      case "invalid":
        return {
          kind: "rejected",
          category: "invalid",
          reason: report.message,
        };
    }
  }

  // No envelope. Either an older deployment answered (a rolling deploy during an
  // outage is exactly when this happens) or something else did. Fall back to the
  // route's own result shape, and treat anything unrecognisable as retryable.
  if (payload.kind === "completion" && payload.ok === true) {
    return { kind: "applied" };
  }
  if (payload.status === "success") return { kind: "applied" };
  const message =
    payload.formError ??
    payload.message ??
    (payload.fieldErrors ? Object.values(payload.fieldErrors)[0] : undefined);
  if (message === OFFLINE_MUTATION_IN_PROGRESS) {
    return { kind: "retryable", category: "interrupted", reason: message };
  }
  if (message !== undefined) {
    return { kind: "rejected", category: "invalid", reason: message };
  }
  return {
    kind: "retryable",
    category: "server",
    reason: "DalyHub did not answer in a way this device understood.",
  };
}

/** Replay ONE mutation. Exported so a failed record can be retried on demand. */
export async function replayMutation(
  record: OfflineMutationRecord,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<OfflineMutationOutcome> {
  try {
    const response = await fetchImpl(
      `/tasks/${encodeURIComponent(record.entityId)}`,
      {
        method: "POST",
        body: mutationFormData(record),
        credentials: "same-origin",
        redirect: "manual",
        headers: { Accept: "application/json" },
        ...(signal ? { signal } : {}),
      },
    );
    return await classifyMutationResponse(response);
  } catch {
    return {
      kind: "retryable",
      category: "network",
      reason: "This device could not reach DalyHub.",
    };
  }
}

/**
 * Return this namespace's mutations with any abandoned attempt returned to the
 * queue, persisting each recovery.
 *
 * Run when the application starts as well as inside a pass, so a change stranded
 * by a tab closed mid-request stops claiming to be "Synchronising…" the moment
 * DalyHub comes back rather than whenever the next pass happens to run.
 */
export async function reclaimStalledMutations(
  records: readonly OfflineMutationRecord[],
  namespace: string,
  now: Date,
): Promise<readonly OfflineMutationRecord[]> {
  const recovered: OfflineMutationRecord[] = [];
  for (const record of records) {
    if (record.namespace !== namespace || !isStalledMutation(record, now)) {
      recovered.push(record);
      continue;
    }
    const reclaimed = reclaimStalledMutation(record, now);
    await putMutationRecord(reclaimed);
    recovered.push(reclaimed);
  }
  return recovered;
}

/** What one mutation replay pass did. */
export interface MutationPassResult {
  readonly attempted: number;
  readonly synced: number;
  readonly conflicts: number;
  readonly failed: number;
  readonly blocked: number;
  readonly connection: OfflineConnectionState;
  /** The conflicts raised by THIS pass, for a one-time announcement. */
  readonly raised: readonly OfflineMutationConflict[];
}

const EMPTY_PASS = {
  attempted: 0,
  synced: 0,
  conflicts: 0,
  failed: 0,
  blocked: 0,
  raised: [] as readonly OfflineMutationConflict[],
};

/**
 * Replay the mutation queue for ONE namespace.
 *
 * Every record is checked against `namespace` before it is sent, so a change
 * queued under a different identity or workspace is never replayed by this
 * session — it simply stays queued until that identity signs in again.
 *
 * Records are sent ONE AT A TIME, in the order `selectReplayBatch` chose. That
 * order is per-entity serial and cross-entity independent, and sending serially
 * is what preserves it: two concurrent requests to the same Task would arrive in
 * whatever order the network chose, which is precisely the reordering §7 exists
 * to prevent.
 */
export async function replayMutations(options: {
  readonly namespace: string;
  readonly now?: Date;
  readonly fetchImpl?: typeof fetch;
  readonly batchSize?: number;
  readonly signal?: AbortSignal;
  /** The connection state the caller already established, if it has one. */
  readonly connection?: OfflineConnectionState;
}): Promise<MutationPassResult> {
  const fetchImpl = options.fetchImpl ?? fetch;

  // Read the queue FIRST. The overwhelmingly common case is an empty queue, and
  // in that case this pass costs zero requests — no probe, nothing. That is what
  // keeps offline support off the online hot path (§40).
  const stored = await readMutations(options.namespace);
  const now = options.now ?? new Date();
  const records = await reclaimStalledMutations(
    stored.ok ? stored.value : [],
    options.namespace,
    now,
  );

  const due = selectReplayBatch(
    records,
    options.namespace,
    now,
    options.batchSize ?? MUTATION_REPLAY_BATCH_SIZE,
  );
  if (due.length === 0) {
    return { ...EMPTY_PASS, connection: options.connection ?? "online" };
  }

  // There IS work, so the connection now has to be established — unless the
  // caller already knows it (the sync pass has just fetched a snapshot).
  const connection =
    options.connection ??
    (await probeConnection(fetchImpl, undefined, options.signal));
  if (!canReachBackend(connection)) return { ...EMPTY_PASS, connection };

  let synced = 0;
  let conflicts = 0;
  let failed = 0;
  let blocked = 0;
  const raised: OfflineMutationConflict[] = [];
  // Entities whose earlier mutation did not succeed. Their LATER mutations are
  // abandoned for this pass, because applying a change on top of a base its
  // predecessor never established is the reordering the ordering rules forbid —
  // and the batch was selected before any of them ran, so this is the only place
  // that fact can be honoured.
  const stalledEntities = new Set<string>();

  for (const record of due) {
    if (stalledEntities.has(record.entityId)) continue;
    // The lease is stamped BEFORE the request, so an interruption anywhere in the
    // next few lines is recoverable rather than terminal.
    await putMutationRecord(beginMutationAttempt(record, new Date()));
    const outcome = await replayMutation(record, fetchImpl, options.signal);
    const updated = applyMutationOutcome(record, outcome, new Date());
    await putMutationRecord(updated);

    if (updated.status === "synced") {
      synced += 1;
      continue;
    }
    stalledEntities.add(record.entityId);
    if (updated.status === "conflict") {
      conflicts += 1;
      if (updated.conflict) raised.push(updated.conflict);
    } else if (updated.status === "failed") {
      failed += 1;
    } else if (updated.status === "blocked") {
      blocked += 1;
      // Stop the whole pass immediately. Continuing would send one Access
      // redirect per queued record — the "do not hammer the backend" rule,
      // enforced rather than documented.
      break;
    }
  }

  notifyMutationQueueChanged();
  return {
    attempted: due.length,
    synced,
    conflicts,
    failed,
    blocked,
    raised,
    connection: blocked > 0 ? "authRequired" : connection,
  };
}
