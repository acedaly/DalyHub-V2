/**
 * PWA-04 / PWA-05 — the synchronisation engine.
 *
 * Two jobs, deliberately in one place so they cannot disagree about connection or
 * authentication state:
 *
 *   1. **Refresh the snapshot** — fetch `/offline/snapshot` and store it.
 *   2. **Replay the capture queue** — POST each queued capture to the module's
 *      OWN canonical create route, with its idempotency key.
 *
 * ── Replay goes through the real create routes ───────────────────────────────
 * There is no `/offline/sync` endpoint and no second creation authority. A queued
 * task is created by `POST /tasks/new`, a note by `POST /notes/new`, a diary entry
 * by `POST /diary/new` — the same routes the online quick-capture sheet posts to,
 * with the same validation, the same Activity events and the same workspace
 * scoping (`AGENTS.md §9.8`). The only thing offline replay adds is an
 * idempotency key, which those routes honour.
 *
 * ── The order of the checks matters ──────────────────────────────────────────
 * Before ANY replay: is the backend reachable, is the session valid, and does the
 * queued record's namespace match the identity + workspace signed in right now?
 * The namespace check is not defensive programming — it is the mechanism that
 * stops one identity's offline capture being created in another identity's
 * workspace on a shared browser profile.
 *
 * ── Sync is never a stampede ─────────────────────────────────────────────────
 * Records are replayed one at a time, in queue order, with a bounded batch per
 * pass and an exponential backoff per record. An expired Access session stops the
 * pass immediately rather than generating one identity-provider redirect per
 * queued record.
 */

import {
  applyReplayOutcome,
  canReachBackend,
  isReplayable,
  offlineWindow,
  shouldPauseSync,
  type OfflineConnectionState,
  type OfflineQueueRecord,
  type OfflineReplayOutcome,
  type OfflineSnapshot,
} from "~/kernel/offline";
import { ownerCalendarIso } from "~/shared/datetime";

import {
  pruneRetention,
  putQueueRecord,
  readQueue,
  saveSnapshot,
  type OfflineMetaRecord,
} from "./offline-store";
import { probeConnection } from "./probe";

/** How many captures one pass replays. Bounded so a pass always terminates. */
export const REPLAY_BATCH_SIZE = 10;

/** The canonical create endpoint for each supported capture kind. */
const CREATE_ENDPOINTS = {
  task: "/tasks/new",
  note: "/notes/new",
  diary: "/diary/new",
} as const;

/** The result of a snapshot refresh. */
export type SnapshotSyncResult =
  | { readonly kind: "updated"; readonly meta: OfflineMetaRecord }
  | { readonly kind: "skipped"; readonly connection: OfflineConnectionState }
  | { readonly kind: "failed"; readonly reason: string };

/**
 * Turn a create route's response into a replay outcome.
 *
 * The routes answer with a JSON body on success AND on validation failure, so the
 * classification reads the body, not just the status. Anything that is not a
 * recognisable DalyHub answer is treated as RETRYABLE rather than as a rejection:
 * discarding an owner's capture because a proxy returned an HTML error page would
 * be the worst possible failure mode.
 */
export async function classifyCreateResponse(
  response: Response,
): Promise<OfflineReplayOutcome> {
  if (response.type === "opaqueredirect" || response.status === 0) {
    return { kind: "blocked", reason: "Your DalyHub sign-in has expired." };
  }
  if (response.status === 401 || response.status === 403) {
    return { kind: "blocked", reason: "Your DalyHub sign-in has expired." };
  }
  if (response.status >= 500) {
    return { kind: "retryable", reason: "DalyHub is temporarily unavailable." };
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return {
      kind: "retryable",
      reason: "DalyHub did not answer in a way this device understood.",
    };
  }
  const payload = body as {
    ok?: boolean;
    taskId?: string;
    noteId?: string;
    entryId?: string;
    formError?: string;
    fieldErrors?: Record<string, string>;
  };
  const recordId = payload.taskId ?? payload.noteId ?? payload.entryId;
  if (payload.ok === true && typeof recordId === "string") {
    return { kind: "created", recordId };
  }
  const fieldError = payload.fieldErrors
    ? Object.values(payload.fieldErrors)[0]
    : undefined;
  return {
    kind: "rejected",
    reason:
      payload.formError ??
      fieldError ??
      "DalyHub could not accept this capture.",
  };
}

/** Build the form body for one queued capture. */
export function captureFormData(record: OfflineQueueRecord): FormData {
  const form = new FormData();
  form.set("idempotencyKey", record.id);
  switch (record.payload.kind) {
    case "task":
      form.set("title", record.payload.title);
      if (record.payload.dueDate) form.set("dueDate", record.payload.dueDate);
      break;
    case "note":
      form.set("title", record.payload.title);
      break;
    case "diary":
      form.set("title", record.payload.title);
      form.set("entryType", record.payload.entryType);
      break;
  }
  return form;
}

/** Replay ONE capture. Exported so a failed item can be retried on demand. */
export async function replayCapture(
  record: OfflineQueueRecord,
  fetchImpl: typeof fetch = fetch,
): Promise<OfflineReplayOutcome> {
  try {
    const response = await fetchImpl(CREATE_ENDPOINTS[record.kind], {
      method: "POST",
      body: captureFormData(record),
      credentials: "same-origin",
      redirect: "manual",
      headers: { Accept: "application/json" },
    });
    return await classifyCreateResponse(response);
  } catch {
    return {
      kind: "retryable",
      reason: "This device could not reach DalyHub.",
    };
  }
}

/** What one replay pass did. */
export interface ReplayPassResult {
  readonly attempted: number;
  readonly synced: number;
  readonly failed: number;
  readonly blocked: number;
  readonly connection: OfflineConnectionState;
}

/**
 * Replay the queue for ONE namespace.
 *
 * Every record is checked against `namespace` before it is sent, so a capture
 * queued under a different identity or workspace is never replayed by this
 * session — it simply stays queued until that identity signs in again.
 */
export async function replayQueue(options: {
  readonly namespace: string;
  readonly now?: Date;
  readonly fetchImpl?: typeof fetch;
  readonly batchSize?: number;
}): Promise<ReplayPassResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const connection = await probeConnection(fetchImpl);
  const empty: ReplayPassResult = {
    attempted: 0,
    synced: 0,
    failed: 0,
    blocked: 0,
    connection,
  };
  if (!canReachBackend(connection)) return empty;

  const queue = await readQueue(options.namespace);
  if (!queue.ok) return empty;

  const now = options.now ?? new Date();
  const due = queue.value
    .filter((record) => isReplayable(record, options.namespace, now))
    .slice(0, options.batchSize ?? REPLAY_BATCH_SIZE);

  let synced = 0;
  let failed = 0;
  let blocked = 0;

  for (const record of due) {
    await putQueueRecord({ ...record, status: "syncing" });
    const outcome = await replayCapture(record, fetchImpl);
    const updated = applyReplayOutcome(record, outcome, new Date());
    await putQueueRecord(updated);
    if (updated.status === "synced") synced += 1;
    if (updated.status === "failed") failed += 1;
    if (updated.status === "blocked") {
      blocked += 1;
      // Stop the pass immediately. Continuing would send one Access redirect per
      // queued record — the "do not hammer the backend" rule, enforced rather
      // than documented.
      break;
    }
  }

  return {
    attempted: due.length,
    synced,
    failed,
    blocked,
    connection: blocked > 0 ? "authRequired" : connection,
  };
}

/** Fetch and store a fresh snapshot. */
export async function syncSnapshot(options?: {
  readonly fetchImpl?: typeof fetch;
  readonly now?: Date;
}): Promise<SnapshotSyncResult> {
  const fetchImpl = options?.fetchImpl ?? fetch;
  const connection = await probeConnection(fetchImpl);
  if (shouldPauseSync(connection) || !canReachBackend(connection)) {
    return { kind: "skipped", connection };
  }

  let snapshot: OfflineSnapshot;
  try {
    const response = await fetchImpl("/offline/snapshot", {
      method: "GET",
      credentials: "same-origin",
      redirect: "manual",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (response.headers.get("X-DalyHub-Authenticated") !== "1") {
      // Something other than DalyHub's authenticated Worker answered. Storing
      // that body would be storing an unknown document as the owner's data.
      return { kind: "skipped", connection: "authRequired" };
    }
    snapshot = (await response.json()) as OfflineSnapshot;
  } catch {
    return { kind: "failed", reason: "The snapshot could not be downloaded." };
  }

  if (typeof snapshot?.namespace !== "string" || !snapshot.window) {
    return {
      kind: "failed",
      reason: "The snapshot was not in a usable shape.",
    };
  }

  const saved = await saveSnapshot(snapshot);
  if (!saved.ok) return { kind: "failed", reason: saved.failure.message };

  // Retention runs immediately after a successful sync (one of the four points
  // the policy names), against the window resolved for THIS device's clock in the
  // owner's timezone — so a device whose snapshot predates a date rollover prunes
  // to today, not to the day the snapshot was built.
  const now = options?.now ?? new Date();
  await pruneRetention(
    snapshot.namespace,
    offlineWindow(
      ownerCalendarIso(now, snapshot.window.timezone),
      snapshot.window.timezone,
    ),
  );

  return { kind: "updated", meta: saved.value };
}
