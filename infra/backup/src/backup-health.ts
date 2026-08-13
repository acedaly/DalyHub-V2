/**
 * BACKUP-02 — the ONE place backup health is decided.
 *
 * ── Why this is a single pure function ────────────────────────────────────────
 * "Are my backups working?" is the entire point of the Backups screen, and it is
 * exactly the kind of question that rots if each surface answers it for itself. A
 * React component that checks `latestRun.status === "success"` and a server that
 * checks "is there an object in the bucket?" will eventually disagree, and the one
 * the owner happens to be looking at will be the wrong one. So the decision is
 * made here, from the run log, once, and everything else renders the answer.
 *
 * ── The rule that shapes every branch ────────────────────────────────────────
 * **Never say `healthy` because a call succeeded.** `unknown` is a first-class
 * outcome, not an error path: if the run log cannot be read, the honest answer is
 * "status unavailable", which is a different statement from both "working" and
 * "broken". Silence is not evidence of health.
 *
 * ── The thresholds are named, not scattered ──────────────────────────────────
 * A late Workflow must not raise a false alarm, and a genuinely missed night must
 * not be hidden. Both bounds are explicit constants below with the reasoning
 * beside them, so the tolerance is a reviewable decision rather than a magic
 * number someone tuned once.
 *
 * PURE: takes records and an instant, returns a verdict. No I/O, no Workers API.
 */

import type { BackupRunRecord } from "./run-records";
import { sortRunsNewestFirst } from "./run-records";

/** The four states the surface can be in. */
export type BackupHealth = "healthy" | "running" | "attention" | "unknown";

/** Why the verdict is what it is. The UI turns this into a sentence. */
export type BackupHealthReason =
  /** State could not be read at all. */
  | "unavailable"
  /** State was readable and there has never been a run. */
  | "no_runs"
  /** A run is in progress right now. */
  | "running"
  /** A run has claimed to be in progress for implausibly long. */
  | "stalled"
  /** The most recent completed attempt failed. */
  | "latest_failed"
  /** There are runs, but none has ever succeeded. */
  | "never_succeeded"
  /** The last success is older than a nightly schedule should allow. */
  | "stale"
  /** A recent success. */
  | "recent_success";

/**
 * The nightly schedule, in UTC.
 *
 * Declared here rather than beside the service entrypoint so it stays reachable
 * from a pure module: the health window is derived from it, and a constant that
 * can only be imported by pulling in `cloudflare:workers` cannot be asserted in a
 * plain unit test.
 */
export const BACKUP_SCHEDULE_CRON = "0 16 * * *";

/**
 * How often the backup is expected to run, in hours.
 *
 * Matches {@link BACKUP_SCHEDULE_CRON}. If the schedule changes, this changes with
 * it — `test/unit/backup/backup-health.test.ts` pins them together.
 */
export const BACKUP_INTERVAL_HOURS = 24;

/**
 * How late a nightly backup may be before the surface says something.
 *
 * Six hours, and the number is a judgement rather than a guess. A backup that
 * fires at 02:00 and retries through transient Cloudflare trouble can legitimately
 * land a few hours late, and waking the owner for that would train them to ignore
 * the indicator — which is the real failure mode of a health light. Six hours also
 * means a night genuinely missed is reported by mid-morning rather than a full day
 * later. Total tolerance is therefore 30 hours since the last success.
 */
export const BACKUP_GRACE_HOURS = 6;

/**
 * How long a run may claim to be "running" before it is treated as stalled.
 *
 * A real backup of this database takes about ten seconds; the Workflow's own retry
 * budget could stretch a bad night to a few minutes. Thirty minutes is far beyond
 * both, so a record still saying `running` after it is not a slow backup — it is a
 * run that died without writing its outcome, and reporting that as "in progress"
 * forever would be the most misleading thing this screen could do.
 */
export const BACKUP_STALLED_MINUTES = 30;

/** Total age, in hours, past which a successful backup is considered stale. */
export const BACKUP_STALE_AFTER_HOURS =
  BACKUP_INTERVAL_HOURS + BACKUP_GRACE_HOURS;

export interface BackupHealthInput {
  /**
   * The known runs, in any order. Empty is meaningful and different from
   * unreadable — see `available`.
   */
  readonly runs: readonly BackupRunRecord[];
  /**
   * Whether backup state could be read at all. `false` produces `unknown`
   * regardless of `runs`, because a stale cached list must not be reported as
   * current truth.
   */
  readonly available: boolean;
  readonly now: Date;
}

export interface BackupHealthResult {
  readonly health: BackupHealth;
  readonly reason: BackupHealthReason;
  /** The most recent run of any status. */
  readonly latestAttempt: BackupRunRecord | null;
  /** The most recent SUCCESSFUL run, which may be older than the attempt. */
  readonly lastSuccess: BackupRunRecord | null;
}

function ageMs(iso: string, now: Date): number | null {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return null;
  return now.getTime() - at;
}

/** Decide backup health. See the file header for the rules this encodes. */
export function calculateBackupHealth(
  input: BackupHealthInput,
): BackupHealthResult {
  if (!input.available) {
    return {
      health: "unknown",
      reason: "unavailable",
      latestAttempt: null,
      lastSuccess: null,
    };
  }

  const runs = sortRunsNewestFirst(input.runs);
  const latestAttempt = runs[0] ?? null;
  const lastSuccess = runs.find((run) => run.status === "success") ?? null;

  if (latestAttempt === null) {
    // Readable, and empty. Distinct from `unavailable`: the surface can honestly
    // say "no backups yet" and offer to take one.
    return {
      health: "unknown",
      reason: "no_runs",
      latestAttempt: null,
      lastSuccess: null,
    };
  }

  if (latestAttempt.status === "running" || latestAttempt.status === "queued") {
    const age = ageMs(latestAttempt.startedAt, input.now);
    const stalled = age === null || age > BACKUP_STALLED_MINUTES * 60 * 1000;
    return {
      health: stalled ? "attention" : "running",
      reason: stalled ? "stalled" : "running",
      latestAttempt,
      lastSuccess,
    };
  }

  if (latestAttempt.status === "failed") {
    // `attention` whether or not an older success exists. The surface shows both
    // facts — the failure AND the last good backup — because they are both true
    // and the owner needs each of them.
    return {
      health: "attention",
      reason: "latest_failed",
      latestAttempt,
      lastSuccess,
    };
  }

  // The latest attempt succeeded.
  if (lastSuccess === null) {
    // Unreachable in practice (the latest IS a success), but the type allows it
    // and guessing would be worse than admitting it.
    return {
      health: "unknown",
      reason: "never_succeeded",
      latestAttempt,
      lastSuccess: null,
    };
  }

  const successAge = ageMs(
    lastSuccess.completedAt ?? lastSuccess.startedAt,
    input.now,
  );
  if (successAge === null) {
    return {
      health: "unknown",
      reason: "unavailable",
      latestAttempt,
      lastSuccess,
    };
  }
  if (successAge > BACKUP_STALE_AFTER_HOURS * 60 * 60 * 1000) {
    return { health: "attention", reason: "stale", latestAttempt, lastSuccess };
  }

  return {
    health: "healthy",
    reason: "recent_success",
    latestAttempt,
    lastSuccess,
  };
}

/**
 * Whether a run should block a new manual trigger.
 *
 * Used by the trigger endpoint so pressing "Back up now" twice cannot start two
 * exports. A STALLED run deliberately does not block: if it did, one run that
 * died without writing its outcome would lock the owner out of taking a backup
 * for good — the opposite of what a backup button is for.
 */
export function runBlocksNewBackup(run: BackupRunRecord, now: Date): boolean {
  if (run.status !== "running" && run.status !== "queued") return false;
  const age = ageMs(run.startedAt, now);
  if (age === null) return false;
  return age <= BACKUP_STALLED_MINUTES * 60 * 1000;
}
