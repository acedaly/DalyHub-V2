/**
 * BACKUP-02 — the sanitised record of one backup run.
 *
 * ── Why a record at all ───────────────────────────────────────────────────────
 * BACKUP-01 stored the dump and nothing else, which answers "is there a backup?"
 * only by listing a bucket the application must not be allowed to read. A run
 * record is the small, non-sensitive fact DalyHub needs in order to answer the
 * one question the owner actually asks — *are my backups working?* — without the
 * application Worker ever touching a `.sql` object.
 *
 * ── The failure message is CHOSEN, never captured ─────────────────────────────
 * This is the load-bearing decision in this file. A record's `message` is never
 * derived from a thrown error, a Cloudflare API response body or a stack trace.
 * It is looked up from {@link STAGE_FAILURE_MESSAGES} by the STAGE that failed.
 *
 * Sanitising captured error text is the obvious alternative and it is a trap: it
 * is a deny-list, it has to be right forever, and the day it is wrong the thing
 * that leaks is a signed URL or a token in an error string — displayed in the UI
 * and screenshotted into a support thread. Choosing from a fixed set of sentences
 * cannot leak, because there is no path from an error object to the text. The
 * real diagnostics stay in Workflow logs, where they belong.
 *
 * Everything here is PURE: no Workers API, no I/O.
 */

import { backupTimestamp, type BackupTrigger } from "./object-key";

/** Where a backup run got to. */
export type BackupRunStatus = "queued" | "running" | "success" | "failed";

/**
 * The pipeline stage a failure happened in.
 *
 * These are the stages the owner could plausibly act on, plus `unknown` for
 * anything unclassified. They deliberately do not mirror the Workflow's internal
 * step names one-to-one: this is a vocabulary for a person, not a trace.
 */
export type BackupFailureStage =
  | "configuration"
  | "export-start"
  | "export-wait"
  | "export-download"
  | "dump-validation"
  | "r2-write"
  | "verification"
  | "unknown";

/**
 * The ONE sentence the UI may show for each failing stage.
 *
 * Each says what did not work and, where the owner can do something, what. None
 * quotes Cloudflare, names an internal component, or contains a URL, an
 * identifier or anything derived from an error object.
 */
export const STAGE_FAILURE_MESSAGES: Readonly<
  Record<BackupFailureStage, string>
> = {
  configuration:
    "The backup service is not fully configured, so no backup was taken.",
  "export-start":
    "DalyHub could not start a database export. This usually means the backup service's access has expired.",
  "export-wait": "The database export did not finish in time.",
  "export-download": "The completed export could not be downloaded.",
  "dump-validation":
    "The export did not look like a complete database, so it was not stored.",
  "r2-write": "The backup could not be saved to storage.",
  verification:
    "The backup was written but could not be verified afterwards, so it is not being counted.",
  unknown: "The backup did not complete.",
};

/** One backup run, as everything outside the Workflow is allowed to see it. */
export interface BackupRunRecord {
  /** The Workflow instance id. An opaque identifier; grants nothing. */
  readonly id: string;
  readonly trigger: BackupTrigger;
  readonly status: BackupRunStatus;
  /** ISO 8601, UTC. */
  readonly startedAt: string;
  /** ISO 8601, UTC. `null` while the run is still going. */
  readonly completedAt: string | null;
  /** The R2 key of the stored dump. Never shown by default (BACKUP-02 §12). */
  readonly objectKey: string | null;
  readonly sizeBytes: number | null;
  readonly retentionDays: number | null;
  /** Set only on failure. */
  readonly stage: BackupFailureStage | null;
  /** Set only on failure, and only ever from STAGE_FAILURE_MESSAGES. */
  readonly message: string | null;
}

/** Build a failed record, with the message chosen by stage. */
export function failedRun(
  base: Omit<BackupRunRecord, "status" | "stage" | "message" | "completedAt">,
  stage: BackupFailureStage,
  completedAt: string,
): BackupRunRecord {
  return {
    ...base,
    status: "failed",
    completedAt,
    stage,
    message: STAGE_FAILURE_MESSAGES[stage],
  };
}

/** Where the durable per-run record lives. */
export const RUNS_PREFIX = "status/runs/";

/** Where the rolling log the status API reads lives. */
export const RUN_LOG_KEY = "status/latest.json";

/** How many runs the rolling log keeps. */
export const RUN_LOG_LIMIT = 30;

/**
 * The object key for a run record.
 *
 * The START INSTANT leads the key so a prefix listing comes back in
 * chronological order — an instance id alone is random, so `list()` would return
 * runs in an order with no meaning. The instance id is appended so two runs that
 * started in the same second cannot collide.
 */
export function runRecordKey(record: {
  readonly startedAt: string;
  readonly id: string;
}): string {
  const at = new Date(record.startedAt);
  const stamp = Number.isFinite(at.getTime())
    ? backupTimestamp(at)
    : "0000-00-00T000000Z";
  // Only the leading segment of the id: enough to disambiguate, and it keeps the
  // key short enough to read in a bucket listing.
  const suffix = record.id.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 12);
  return `${RUNS_PREFIX}${stamp}-${suffix}.json`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const STATUSES = new Set<BackupRunStatus>([
  "queued",
  "running",
  "success",
  "failed",
]);
const TRIGGERS = new Set<BackupTrigger>(["daily", "manual"]);
const STAGES = new Set(Object.keys(STAGE_FAILURE_MESSAGES));

function isoOrNull(value: unknown): string | null {
  if (typeof value !== "string" || value === "") return null;
  const at = new Date(value);
  return Number.isFinite(at.getTime()) ? at.toISOString() : null;
}

/**
 * Parse an untrusted run record — from R2, so from storage this code wrote, but
 * validated anyway because a partial write or a hand-edited object must not
 * become a confident-looking claim about the owner's backups.
 *
 * Returns `null` for anything that is not a complete, coherent record. A record
 * that cannot be trusted is better absent than approximated: absent shows as
 * "status unavailable", approximated shows as "healthy".
 */
export function parseRunRecord(value: unknown): BackupRunRecord | null {
  if (!isRecord(value)) return null;

  const id = typeof value.id === "string" ? value.id : "";
  if (id === "") return null;

  const status = value.status;
  if (typeof status !== "string" || !STATUSES.has(status as BackupRunStatus)) {
    return null;
  }
  const trigger = value.trigger;
  if (typeof trigger !== "string" || !TRIGGERS.has(trigger as BackupTrigger)) {
    return null;
  }
  const startedAt = isoOrNull(value.startedAt);
  if (startedAt === null) return null;

  const stage =
    typeof value.stage === "string" && STAGES.has(value.stage)
      ? (value.stage as BackupFailureStage)
      : null;

  const size =
    typeof value.sizeBytes === "number" &&
    Number.isFinite(value.sizeBytes) &&
    value.sizeBytes >= 0
      ? Math.trunc(value.sizeBytes)
      : null;

  const retention =
    typeof value.retentionDays === "number" &&
    Number.isFinite(value.retentionDays) &&
    value.retentionDays > 0
      ? Math.trunc(value.retentionDays)
      : null;

  return {
    id,
    trigger: trigger as BackupTrigger,
    status: status as BackupRunStatus,
    startedAt,
    completedAt: isoOrNull(value.completedAt),
    objectKey: typeof value.objectKey === "string" ? value.objectKey : null,
    sizeBytes: size,
    retentionDays: retention,
    stage,
    // The message is RE-DERIVED from the stage rather than read from storage, so
    // a stored record cannot smuggle arbitrary text into the UI even if
    // something wrote one.
    message: stage === null ? null : STAGE_FAILURE_MESSAGES[stage],
  };
}

/** Newest first. Ties broken by id so the order is total and stable. */
export function sortRunsNewestFirst(
  runs: readonly BackupRunRecord[],
): BackupRunRecord[] {
  return [...runs].sort((a, b) => {
    const delta = Date.parse(b.startedAt) - Date.parse(a.startedAt);
    return delta !== 0 ? delta : a.id.localeCompare(b.id);
  });
}

/**
 * Fold a run into the rolling log: replace any earlier record for the same
 * instance, sort newest-first, and cap the length.
 *
 * Replacing by id is what makes the log correct across a run's lifecycle — the
 * same instance appears once, as `running` and then as `success` or `failed`,
 * never twice.
 */
export function upsertRun(
  log: readonly BackupRunRecord[],
  record: BackupRunRecord,
  limit = RUN_LOG_LIMIT,
): BackupRunRecord[] {
  const others = log.filter((entry) => entry.id !== record.id);
  return sortRunsNewestFirst([record, ...others]).slice(0, limit);
}
