/**
 * BACKUP-02 — what DalyHub knows about its own backups, and the words it uses.
 *
 * ── Two jobs, both deliberately here ─────────────────────────────────────────
 *
 *  1. **The boundary validator.** The backup status arrives from another Worker
 *     over a service binding. That Worker is ours, and it is still validated
 *     here, because AGENTS.md §17 says input is validated at the boundary and
 *     "we wrote the other end" is not a validation strategy. A partially-written
 *     status object or a shape change after a backup-Worker deploy must surface
 *     as "status unavailable", never as a confident "Healthy".
 *
 *  2. **The words.** Every sentence the Backups screen can say is written once,
 *     here, for the same reason `calendar-messages.ts` exists: so the surface,
 *     the tests and any future surface cannot each invent their own phrasing, and
 *     so each sentence can be checked against what the state actually proves.
 *
 * ── The truthfulness rule ────────────────────────────────────────────────────
 * `Healthy` is never said because a call succeeded. `unknown` is a real answer
 * with its own words — "Backup status is temporarily unavailable" — and it never
 * implies the backups have failed. A failed latest attempt shows BOTH the failure
 * and the last good backup, because both are true and the owner needs each.
 *
 * ── PURE ─────────────────────────────────────────────────────────────────────
 * No React, no DOM, no Workers API, no `env`. Timezone handling uses `Intl`,
 * which is a platform primitive rather than an application dependency, so the
 * whole module is directly testable — and it is (`test/unit/backup/`).
 */

/* -------------------------------------------------------------------------- */
/* The shapes                                                                 */
/* -------------------------------------------------------------------------- */

export type BackupHealth = "healthy" | "running" | "attention" | "unknown";

export type BackupHealthReason =
  | "unavailable"
  | "no_runs"
  | "running"
  | "stalled"
  | "latest_failed"
  | "never_succeeded"
  | "stale"
  | "recent_success";

export type BackupRunStatus = "queued" | "running" | "success" | "failed";

export type BackupTrigger = "daily" | "manual";

/** One backup run, as the Settings surface sees it. */
export interface BackupRunView {
  readonly id: string;
  readonly trigger: BackupTrigger;
  readonly status: BackupRunStatus;
  readonly startedAt: string;
  readonly completedAt: string | null;
  /**
   * The R2 object key. Present so a details disclosure CAN show it, never shown
   * by default (BACKUP-02 §12). It is a storage path, not a credential — there is
   * no way to fetch it from the browser.
   */
  readonly objectKey: string | null;
  readonly sizeBytes: number | null;
  readonly retentionDays: number | null;
  readonly stage: string | null;
  /** A short, canned sentence chosen by the backup Worker. Never raw error text. */
  readonly message: string | null;
}

/** Everything the summary card renders. */
export interface BackupStatusView {
  readonly available: boolean;
  readonly health: BackupHealth;
  readonly reason: BackupHealthReason;
  readonly latestAttempt: BackupRunView | null;
  readonly lastSuccessfulBackup: BackupRunView | null;
  readonly retainedBackupCount: number;
  readonly retainedBackupCountExact: boolean;
  readonly retentionDays: { readonly daily: number; readonly manual: number };
  /** The cron expression, and the fact that it is UTC. */
  readonly schedule: string;
  readonly scheduleTimeZone: string;
  readonly intervalHours: number;
  readonly graceHours: number;
  readonly staleAfterHours: number;
  readonly databaseName: string | null;
}

/** The status used whenever the real one could not be obtained or trusted. */
export const UNAVAILABLE_BACKUP_STATUS: BackupStatusView = {
  available: false,
  health: "unknown",
  reason: "unavailable",
  latestAttempt: null,
  lastSuccessfulBackup: null,
  retainedBackupCount: 0,
  retainedBackupCountExact: false,
  retentionDays: { daily: 90, manual: 365 },
  schedule: "0 16 * * *",
  scheduleTimeZone: "UTC",
  intervalHours: 24,
  graceHours: 6,
  staleAfterHours: 30,
  databaseName: null,
};

/* -------------------------------------------------------------------------- */
/* Boundary validation                                                        */
/* -------------------------------------------------------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const HEALTHS = new Set<BackupHealth>([
  "healthy",
  "running",
  "attention",
  "unknown",
]);
const REASONS = new Set<BackupHealthReason>([
  "unavailable",
  "no_runs",
  "running",
  "stalled",
  "latest_failed",
  "never_succeeded",
  "stale",
  "recent_success",
]);
const RUN_STATUSES = new Set<BackupRunStatus>([
  "queued",
  "running",
  "success",
  "failed",
]);
const TRIGGERS = new Set<BackupTrigger>(["daily", "manual"]);

/**
 * How long a status message from the backup service may be.
 *
 * The service only ever sends one of its own canned sentences, so this can never
 * fire in normal operation. It exists so that IF something ever sent free text,
 * the surface would truncate it rather than render an unbounded string into the
 * page — a belt to the service's braces.
 */
const MAX_MESSAGE_LENGTH = 200;

function isoOrNull(value: unknown): string | null {
  if (typeof value !== "string" || value === "") return null;
  const at = Date.parse(value);
  return Number.isFinite(at) ? new Date(at).toISOString() : null;
}

function nonNegativeIntOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : null;
}

/** Validate one run. Returns `null` for anything incomplete or incoherent. */
export function parseBackupRun(value: unknown): BackupRunView | null {
  if (!isRecord(value)) return null;
  const id = typeof value.id === "string" ? value.id : "";
  if (id === "") return null;
  if (
    typeof value.status !== "string" ||
    !RUN_STATUSES.has(value.status as BackupRunStatus)
  ) {
    return null;
  }
  if (
    typeof value.trigger !== "string" ||
    !TRIGGERS.has(value.trigger as BackupTrigger)
  ) {
    return null;
  }
  const startedAt = isoOrNull(value.startedAt);
  if (startedAt === null) return null;

  return {
    id,
    trigger: value.trigger as BackupTrigger,
    status: value.status as BackupRunStatus,
    startedAt,
    completedAt: isoOrNull(value.completedAt),
    objectKey: typeof value.objectKey === "string" ? value.objectKey : null,
    sizeBytes: nonNegativeIntOrNull(value.sizeBytes),
    retentionDays: nonNegativeIntOrNull(value.retentionDays),
    stage: typeof value.stage === "string" ? value.stage : null,
    message:
      typeof value.message === "string"
        ? value.message.slice(0, MAX_MESSAGE_LENGTH)
        : null,
  };
}

/**
 * Validate a status payload from the backup service.
 *
 * Returns {@link UNAVAILABLE_BACKUP_STATUS} rather than throwing, because there
 * is exactly one right answer when the status cannot be trusted and it is not an
 * exception — it is "we do not know", which the UI already renders properly.
 */
export function parseBackupStatus(value: unknown): BackupStatusView {
  if (!isRecord(value)) return UNAVAILABLE_BACKUP_STATUS;
  if (value.available !== true) return UNAVAILABLE_BACKUP_STATUS;

  const health = value.health;
  const reason = value.reason;
  if (
    typeof health !== "string" ||
    !HEALTHS.has(health as BackupHealth) ||
    typeof reason !== "string" ||
    !REASONS.has(reason as BackupHealthReason)
  ) {
    return UNAVAILABLE_BACKUP_STATUS;
  }

  const retention = isRecord(value.retentionDays) ? value.retentionDays : {};
  const daily = nonNegativeIntOrNull(retention.daily);
  const manual = nonNegativeIntOrNull(retention.manual);

  return {
    available: true,
    health: health as BackupHealth,
    reason: reason as BackupHealthReason,
    latestAttempt: parseBackupRun(value.latestAttempt),
    lastSuccessfulBackup: parseBackupRun(value.lastSuccessfulBackup),
    retainedBackupCount: nonNegativeIntOrNull(value.retainedBackupCount) ?? 0,
    retainedBackupCountExact: value.retainedBackupCountExact === true,
    retentionDays: {
      daily: daily ?? UNAVAILABLE_BACKUP_STATUS.retentionDays.daily,
      manual: manual ?? UNAVAILABLE_BACKUP_STATUS.retentionDays.manual,
    },
    schedule:
      typeof value.schedule === "string" && value.schedule !== ""
        ? value.schedule
        : UNAVAILABLE_BACKUP_STATUS.schedule,
    scheduleTimeZone:
      typeof value.scheduleTimeZone === "string" &&
      value.scheduleTimeZone !== ""
        ? value.scheduleTimeZone
        : "UTC",
    intervalHours:
      nonNegativeIntOrNull(value.intervalHours) ??
      UNAVAILABLE_BACKUP_STATUS.intervalHours,
    graceHours:
      nonNegativeIntOrNull(value.graceHours) ??
      UNAVAILABLE_BACKUP_STATUS.graceHours,
    staleAfterHours:
      nonNegativeIntOrNull(value.staleAfterHours) ??
      UNAVAILABLE_BACKUP_STATUS.staleAfterHours,
    databaseName:
      typeof value.databaseName === "string" ? value.databaseName : null,
  };
}

/** Validate a history payload. An unreadable history is an empty one. */
export function parseBackupHistory(value: unknown): readonly BackupRunView[] {
  if (!isRecord(value)) return [];
  if (value.available !== true) return [];
  if (!Array.isArray(value.runs)) return [];
  return value.runs
    .map((entry) => parseBackupRun(entry))
    .filter((entry): entry is BackupRunView => entry !== null);
}

/* -------------------------------------------------------------------------- */
/* The words                                                                  */
/* -------------------------------------------------------------------------- */

/** The headline for each health state. Always says the state in text. */
export const BACKUP_HEALTH_LABELS: Readonly<Record<BackupHealth, string>> = {
  healthy: "Healthy",
  running: "Backup in progress",
  attention: "Backup needs attention",
  unknown: "Backup status unavailable",
};

/**
 * The pill tone for each state.
 *
 * `unknown` is `neutral`, not `warning`: not knowing is not the same as a
 * problem, and colouring it as one would teach the owner to ignore the colour.
 */
export const BACKUP_HEALTH_TONES: Readonly<
  Record<BackupHealth, "success" | "info" | "warning" | "neutral">
> = {
  healthy: "success",
  running: "info",
  attention: "warning",
  unknown: "neutral",
};

export function backupTriggerLabel(trigger: BackupTrigger): string {
  return trigger === "daily" ? "Automatic" : "Manual";
}

export const BACKUP_RUN_STATUS_LABELS: Readonly<
  Record<BackupRunStatus, string>
> = {
  queued: "Queued",
  running: "In progress",
  success: "Successful",
  failed: "Failed",
};

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A byte count, in the units a person uses.
 *
 * DECIMAL units with decimal labels (1 MB = 1,000,000 bytes), which is what macOS
 * and iOS show — so the number here matches the number the owner sees if they
 * download the file. Labelling binary sizes "MB" is the common alternative and is
 * simply wrong; using "MiB" would be correct and unfamiliar. This is both.
 */
export function formatBackupSize(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes === 0) return "0 kB";
  if (bytes < 1_000_000) {
    return `${Math.max(1, Math.round(bytes / 1000))} kB`;
  }
  return `${(bytes / 1_000_000).toFixed(2)} MB`;
}

/** The calendar day an instant falls on, in `timeZone`. `YYYY-MM-DD`. */
function calendarDay(instant: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(instant);
}

/**
 * "2:03 am" in `timeZone`.
 *
 * Current ICU separates the time from the day period with a NARROW NO-BREAK SPACE
 * (U+202F), not an ordinary space. That is invisible in a diff and would break a
 * `toContain("2:03 am")` assertion in a way that takes an afternoon to find, so
 * every space-like separator is normalised to a plain space — written as an
 * escape, because the literal character in source is exactly the kind of thing
 * nobody can see.
 */
function clockTime(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(instant)
    .replace(/[\u202f\u00a0\s]+/g, " ")
    .toLowerCase();
}

/** "13 Aug 2026" in `timeZone`. */
function calendarDate(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(instant);
}

function dayOffset(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000,
  );
}

/**
 * An instant, as the owner reads it: "Today, 2:03 am", "Yesterday, 2:02 am",
 * "11 Aug 2026, 7:18 pm".
 *
 * Always rendered in the owner's configured timezone, never the server's and
 * never the browser's, and never hard-coded to an Australian offset — DST is
 * handled by `Intl` because that is the only thing that gets it right in both
 * halves of the year.
 */
export function formatBackupInstant(
  iso: string | null,
  timeZone: string,
  now: Date,
): string {
  if (iso === null) return "—";
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return "—";
  const instant = new Date(at);

  const today = calendarDay(now, timeZone);
  const day = calendarDay(instant, timeZone);
  const offset = dayOffset(today, day);
  const time = clockTime(instant, timeZone);

  if (offset === 0) return `Today, ${time}`;
  if (offset === -1) return `Yesterday, ${time}`;
  if (offset === 1) return `Tomorrow, ${time}`;
  return `${calendarDate(instant, timeZone)}, ${time}`;
}

/** "9 seconds", "2 minutes" — the run's duration, or `null` if unknown. */
export function formatBackupDuration(run: BackupRunView): string | null {
  if (run.completedAt === null) return null;
  const start = Date.parse(run.startedAt);
  const end = Date.parse(run.completedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return null;
  }
  const seconds = Math.round((end - start) / 1000);
  if (seconds < 1) return "under a second";
  if (seconds < 60) return `${seconds} ${seconds === 1 ? "second" : "seconds"}`;
  const minutes = Math.round(seconds / 60);
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}

/** "8 hours ago" — the AGE, because "is this fresh?" is what health asks. */
export function formatBackupAge(iso: string, now: Date): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return "at an unknown time";
  const seconds = Math.max(0, Math.round((now.getTime() - at) / 1000));
  if (seconds < 60) return "moments ago";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60)
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} ${days === 1 ? "day" : "days"} ago`;
  return "over a month ago";
}

/* -------------------------------------------------------------------------- */
/* The next scheduled backup                                                  */
/* -------------------------------------------------------------------------- */

/** A `M H * * *` cron, which is the only shape this backup schedule uses. */
const DAILY_CRON = /^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+\*$/;

/**
 * The next UTC instant a daily cron fires after `now`. `null` if the expression
 * is not a simple daily one.
 *
 * Deliberately narrow. A general cron parser would be a dependency and a source
 * of subtle wrongness for a schedule that is one line long; anything this cannot
 * read is reported as unknown rather than guessed at.
 */
export function nextDailyCronRun(cron: string, now: Date): Date | null {
  const match = DAILY_CRON.exec(cron.trim());
  if (match === null) return null;
  const minute = Number(match[1]);
  const hour = Number(match[2]);
  if (hour > 23 || minute > 59) return null;

  const candidate = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    hour,
    minute,
    0,
    0,
  );
  const next =
    candidate > now.getTime() ? candidate : candidate + 24 * 60 * 60 * 1000;
  return new Date(next);
}

/**
 * The next automatic backup, in the owner's words.
 *
 * Says "approximately" on purpose. The schedule is a UTC cron, so the LOCAL clock
 * time it lands on shifts by an hour across daylight saving, and Cron Triggers are
 * dispatched on a best-effort basis rather than to the second. Presenting a UTC
 * cron as an invariant local wall-clock time would be a small, confident lie that
 * the owner would eventually catch — see BACKUP-02 §13.
 */
export function describeNextScheduledBackup(
  status: BackupStatusView,
  now: Date,
  timeZone: string,
): string {
  const next = nextDailyCronRun(status.schedule, now);
  if (next === null) return "On its usual nightly schedule.";

  const today = calendarDay(now, timeZone);
  const day = calendarDay(next, timeZone);
  const offset = dayOffset(today, day);
  const time = clockTime(next, timeZone);

  const when =
    offset === 0
      ? "Today"
      : offset === 1
        ? "Tomorrow"
        : calendarDate(next, timeZone);
  return `${when} at approximately ${time}`;
}

/* -------------------------------------------------------------------------- */
/* The health sentence                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The supporting sentence under the health headline.
 *
 * One sentence per reason, each checked against what the state actually proves.
 * The `latest_failed` case says BOTH things — the failure and the last good
 * backup — because a screen that shows only the failure invites the owner to
 * assume they have nothing, and one that shows only the success hides a problem.
 */
export function describeBackupHealth(
  status: BackupStatusView,
  now: Date,
  timeZone: string,
): string {
  const success = status.lastSuccessfulBackup;
  const attempt = status.latestAttempt;

  switch (status.reason) {
    case "unavailable":
      return "DalyHub could not reach the backup service just now. This does not mean a backup has failed — try again shortly.";

    case "no_runs":
      return "The first scheduled backup has not completed yet.";

    case "running":
      return attempt === null
        ? "A backup is running now."
        : `A backup started ${formatBackupAge(attempt.startedAt, now)} and is still running.`;

    case "stalled":
      return "A backup started but never reported finishing. Taking one now is safe.";

    case "latest_failed": {
      const failure = attempt?.message ?? "The last attempt did not complete.";
      const when =
        attempt === null
          ? ""
          : ` at ${formatBackupInstant(attempt.completedAt ?? attempt.startedAt, timeZone, now)}`;
      const lastGood =
        success === null
          ? " There is no earlier successful backup."
          : ` Last successful backup: ${formatBackupInstant(success.completedAt ?? success.startedAt, timeZone, now)}.`;
      return `${failure.replace(/\.$/, "")}${when}.${lastGood}`;
    }

    case "never_succeeded":
      return "No backup has completed successfully yet.";

    case "stale":
      return success === null
        ? "No recent successful backup."
        : `The last successful backup was ${formatBackupAge(success.completedAt ?? success.startedAt, now)}, which is longer ago than the nightly schedule should allow.`;

    case "recent_success":
      return success === null
        ? "The last backup completed successfully."
        : `Last backup completed successfully ${formatBackupAge(success.completedAt ?? success.startedAt, now)}.`;
  }
}
