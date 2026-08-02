/**
 * PWA-05 — the append-only offline capture queue model.
 *
 * Pure data and pure transitions: no IndexedDB, no `fetch`, no React. The browser
 * store and the sync engine are thin shells around the decisions made here, so
 * every state change is unit-testable without a DOM or a network.
 *
 * ── Deliberately narrow ──────────────────────────────────────────────────────
 * This milestone supports creating exactly three things offline: an Inbox task, a
 * quick note and a diary entry. All three are APPEND-ONLY — a brand-new record
 * with no relationships, no parent and no dependency on server state — which is
 * why they can be replayed without conflict analysis. Everything else (editing,
 * completing, deleting, re-parenting, bulk actions, attachments) is NOT
 * supported, is disabled in the UI while offline, and must not be added here
 * without the conflict design this milestone deliberately did not do.
 */

/** The record kinds that may be captured offline. A closed set, by design. */
export const OFFLINE_CAPTURE_KINDS = ["task", "note", "diary"] as const;

export type OfflineCaptureKind = (typeof OFFLINE_CAPTURE_KINDS)[number];

/** True when a value names a supported offline capture kind. */
export function isOfflineCaptureKind(
  value: unknown,
): value is OfflineCaptureKind {
  return (
    typeof value === "string" &&
    (OFFLINE_CAPTURE_KINDS as readonly string[]).includes(value)
  );
}

/** The version of the queued PAYLOAD shape, stored on every record. */
export const OFFLINE_CAPTURE_PAYLOAD_VERSION = 1;

/**
 * The lifecycle of a queued capture.
 *
 *   pending  → queued locally, waiting for a reachable, authenticated backend
 *   syncing  → a replay attempt is in flight
 *   synced   → the server confirmed a record id (terminal; pruned after display)
 *   failed   → the server rejected it in a way retrying will not fix
 *   blocked  → cannot be replayed by THIS session (authentication expired, or the
 *              signed-in identity/workspace no longer matches the queued record)
 *
 * `blocked` is separate from `failed` on purpose: a blocked record is not the
 * owner's mistake and must not be presented as an error to fix, only as work
 * waiting for a valid session.
 */
export const OFFLINE_QUEUE_STATUSES = [
  "pending",
  "syncing",
  "synced",
  "failed",
  "blocked",
] as const;

export type OfflineQueueStatus = (typeof OFFLINE_QUEUE_STATUSES)[number];

/** The captured fields for a new Inbox task. No parent: Inbox is the point. */
export interface OfflineTaskCapture {
  readonly kind: "task";
  readonly title: string;
  /** An optional owner-calendar due date, if the capture form offered one. */
  readonly dueDate: string | null;
}

/** The captured fields for a new quick note. */
export interface OfflineNoteCapture {
  readonly kind: "note";
  readonly title: string;
}

/** The captured fields for a new diary entry. */
export interface OfflineDiaryCapture {
  readonly kind: "diary";
  readonly title: string;
  readonly entryType: string;
}

export type OfflineCapturePayload =
  OfflineTaskCapture | OfflineNoteCapture | OfflineDiaryCapture;

/** One queued capture, exactly as it is stored in IndexedDB. */
export interface OfflineQueueRecord {
  /** The collision-safe client identifier; also the server idempotency key. */
  readonly id: string;
  /** The identity + workspace + schema digest this record belongs to. */
  readonly namespace: string;
  readonly kind: OfflineCaptureKind;
  readonly payload: OfflineCapturePayload;
  readonly payloadVersion: number;
  /** When the owner captured it (ISO-8601 UTC, from the device clock). */
  readonly createdAt: string;
  /** When it entered the queue (ISO-8601 UTC). Equal to `createdAt` today. */
  readonly queuedAt: string;
  readonly status: OfflineQueueStatus;
  readonly attempts: number;
  /** The last attempt's instant, for the retry backoff. */
  readonly lastAttemptAt: string | null;
  /** A short, owner-readable explanation of the last failure. Never a stack. */
  readonly lastError: string | null;
  /** The server record id, once creation is confirmed. */
  readonly serverId: string | null;
  readonly syncedAt: string | null;
}

/**
 * Generate a collision-safe capture identifier.
 *
 * `crypto.randomUUID()` where available (every browser DalyHub targets), with a
 * `crypto.getRandomValues` fallback for the one case it is missing: a non-secure
 * context. There is deliberately NO `Math.random()` path — a weak identifier here
 * becomes a cross-record collision in the idempotency table.
 */
export function newCaptureId(
  cryptoApi: Pick<Crypto, "getRandomValues"> & {
    randomUUID?: () => string;
  } = globalThis.crypto,
): string {
  if (typeof cryptoApi?.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }
  if (typeof cryptoApi?.getRandomValues !== "function") {
    throw new Error(
      "A secure random source is required to queue an offline capture.",
    );
  }
  const bytes = new Uint8Array(16);
  cryptoApi.getRandomValues(bytes);
  // RFC 4122 version 4 / variant bits, so the value is a well-formed UUID.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return (
    `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-` +
    `${hex.slice(16, 20)}-${hex.slice(20)}`
  );
}

/** Build a fresh queue record. Pure: the clock and id source are injected. */
export function createQueueRecord(input: {
  readonly namespace: string;
  readonly payload: OfflineCapturePayload;
  readonly now: Date;
  readonly id?: string;
}): OfflineQueueRecord {
  const at = input.now.toISOString();
  return {
    id: input.id ?? newCaptureId(),
    namespace: input.namespace,
    kind: input.payload.kind,
    payload: input.payload,
    payloadVersion: OFFLINE_CAPTURE_PAYLOAD_VERSION,
    createdAt: at,
    queuedAt: at,
    status: "pending",
    attempts: 0,
    lastAttemptAt: null,
    lastError: null,
    serverId: null,
    syncedAt: null,
  };
}

/** The outcome of one replay attempt, as the sync engine classifies it. */
export type OfflineReplayOutcome =
  /** The server confirmed a record (created now, or already created earlier). */
  | { readonly kind: "created"; readonly recordId: string }
  /** Authentication is required, or the identity/workspace no longer matches. */
  | { readonly kind: "blocked"; readonly reason: string }
  /** The server rejected the payload; retrying will not change the answer. */
  | { readonly kind: "rejected"; readonly reason: string }
  /** The attempt could not complete (offline, timeout, 5xx). Retry later. */
  | { readonly kind: "retryable"; readonly reason: string };

/**
 * The maximum number of attempts before a record stops retrying automatically.
 * It is never discarded — it moves to `failed` with its reason, and the owner can
 * retry it by hand from the sync panel.
 */
export const OFFLINE_MAX_AUTOMATIC_ATTEMPTS = 5;

/** Apply a replay outcome to a queue record. Pure and total. */
export function applyReplayOutcome(
  record: OfflineQueueRecord,
  outcome: OfflineReplayOutcome,
  now: Date,
): OfflineQueueRecord {
  const attempts = record.attempts + 1;
  const lastAttemptAt = now.toISOString();
  switch (outcome.kind) {
    case "created":
      return {
        ...record,
        status: "synced",
        attempts,
        lastAttemptAt,
        lastError: null,
        serverId: outcome.recordId,
        syncedAt: lastAttemptAt,
      };
    case "blocked":
      return {
        ...record,
        // A blocked attempt does NOT consume a retry budget: the owner has not
        // done anything wrong, and burning attempts on an expired session would
        // eventually present valid work as failed.
        status: "blocked",
        lastAttemptAt,
        lastError: outcome.reason,
      };
    case "rejected":
      return {
        ...record,
        status: "failed",
        attempts,
        lastAttemptAt,
        lastError: outcome.reason,
      };
    case "retryable":
      return {
        ...record,
        status:
          attempts >= OFFLINE_MAX_AUTOMATIC_ATTEMPTS ? "failed" : "pending",
        attempts,
        lastAttemptAt,
        lastError: outcome.reason,
      };
  }
}

/**
 * Exponential backoff before the next automatic attempt, in milliseconds.
 * Capped so a long-offline device does not end up waiting hours after it
 * reconnects.
 */
export function retryDelayMs(attempts: number): number {
  return Math.min(30_000, 1_000 * 2 ** Math.max(0, attempts - 1));
}

/** True when a record is eligible for an automatic replay attempt now. */
export function isReplayable(
  record: OfflineQueueRecord,
  namespace: string,
  now: Date,
): boolean {
  if (record.namespace !== namespace) return false;
  if (record.status !== "pending") return false;
  if (record.lastAttemptAt === null) return true;
  return (
    now.getTime() - Date.parse(record.lastAttemptAt) >=
    retryDelayMs(record.attempts)
  );
}

/** A compact tally of the queue, for the status surfaces. */
export interface OfflineQueueSummary {
  readonly pending: number;
  readonly syncing: number;
  readonly synced: number;
  readonly failed: number;
  readonly blocked: number;
  readonly total: number;
}

/** Tally a queue. Pure. */
export function summariseQueue(
  records: readonly OfflineQueueRecord[],
): OfflineQueueSummary {
  const summary = {
    pending: 0,
    syncing: 0,
    synced: 0,
    failed: 0,
    blocked: 0,
    total: records.length,
  };
  for (const record of records) {
    summary[record.status] += 1;
  }
  return summary;
}
