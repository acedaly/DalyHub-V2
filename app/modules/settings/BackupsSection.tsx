/**
 * BACKUP-02 — `Settings → This app → Backups`.
 *
 * ── The one question this screen answers ─────────────────────────────────────
 * *Are my backups working?* Everything on it is arranged around answering that in
 * the first line, before any detail: the health state in words, then when the last
 * good backup was, then the supporting facts, then the action, then the history.
 * Nothing here is a dashboard widget — no gauges, no sparklines, no charts that
 * restate a single number as a picture.
 *
 * ── The language rule ────────────────────────────────────────────────────────
 * The words are "backup", "automatic", "storage", "kept for 90 days". Never
 * "Workflow instance", "R2 object", "D1 export", "bucket" or "cron". The
 * infrastructure underneath is rigorous and the owner should never need to know
 * its vocabulary to trust it. Object keys and run ids exist in the data and are
 * shown only inside an explicitly-opened details disclosure.
 *
 * ── Colour is never the signal ───────────────────────────────────────────────
 * The health state is a `StatusPill`, which always says its state in text; the
 * tone is a shortcut for a reader who has seen it before, never the carrier. The
 * same applies to every row in the history: "Successful" and "Failed" are words.
 *
 * ── No restore, and it says so ───────────────────────────────────────────────
 * There is no restore, delete, purge or import control anywhere on this screen,
 * and BACKUP-02 does not add one. The screen states plainly that production
 * restores happen outside DalyHub, so the absence reads as a deliberate decision
 * rather than a missing feature.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";

import {
  BACKUP_HEALTH_LABELS,
  BACKUP_HEALTH_TONES,
  BACKUP_RUN_STATUS_LABELS,
  backupTriggerLabel,
  describeBackupHealth,
  describeNextScheduledBackup,
  formatBackupDuration,
  formatBackupInstant,
  formatBackupSize,
  type BackupRunView,
  type BackupStatusView,
} from "~/kernel/backup";
import { StatusPill } from "~/shared/pill";
import { SettingsGroup, SettingsLayout, SettingsRow } from "~/shared/settings";

import type { BackupSettingsData } from "~/platform/backup";

import type { BackupActionResult } from "./routes/backups";

/**
 * How often the surface re-reads status while a backup is running.
 *
 * Five seconds: a backup of this database takes about ten, so one or two polls
 * covers the normal case, and the poll STOPS as soon as the state is no longer
 * `running`. It is not a background timer — nothing polls while the page is idle,
 * which is why this screen costs nothing to leave open.
 */
const POLL_INTERVAL_MS = 5000;

/**
 * How long polling continues before giving up.
 *
 * Bounded so a run that dies without recording its outcome cannot leave a browser
 * tab polling forever. Past this the surface stops and shows whatever the last
 * read said — and the health calculation's own stalled threshold takes over.
 */
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

export function BackupsSection({
  data,
}: {
  readonly data: BackupSettingsData;
}) {
  const statusFetcher = useFetcher<BackupSettingsData>();
  const loadBackupStatus = useCallback(() => {
    statusFetcher.load("/settings/backups/status");
  }, [statusFetcher]);
  const liveData = statusFetcher.data ?? data;
  const { status, history, timeZone } = liveData;
  // One instant for the whole render, so "Today" in the header and "Today" in the
  // history cannot disagree because the clock ticked between two calls.
  const now = new Date();

  return (
    <SettingsLayout
      title="Backups"
      description="DalyHub backs up your production data automatically every night, to private storage in your own Cloudflare account."
    >
      <BackupHealthGroup
        status={status}
        history={history}
        timeZone={timeZone}
        now={now}
        loadBackupStatus={loadBackupStatus}
      />
      <BackupHistoryGroup history={history} timeZone={timeZone} now={now} />
      <BackupRestoreNote />
    </SettingsLayout>
  );
}

/* -------------------------------------------------------------------------- */
/* Health + the manual action                                                 */
/* -------------------------------------------------------------------------- */

function BackupHealthGroup({
  status,
  history,
  timeZone,
  now,
  loadBackupStatus,
}: {
  readonly status: BackupStatusView;
  readonly history: readonly BackupRunView[];
  readonly timeZone: string;
  readonly now: Date;
  readonly loadBackupStatus: () => void;
}) {
  const success = status.lastSuccessfulBackup;
  const attempt = status.latestAttempt;
  const running = status.health === "running";

  return (
    <SettingsGroup
      title="Backup health"
      description="What DalyHub knows about the most recent backups."
    >
      {/* The verdict, first. `aria-live` so a state change after a manual backup
          is announced rather than silently repainted. */}
      <SettingsRow
        align="start"
        label="Status"
        description={describeBackupHealth(status, now, timeZone)}
        control={
          <span
            className="dh-backup-health"
            aria-live="polite"
            data-testid="backup-health"
          >
            <StatusPill tone={BACKUP_HEALTH_TONES[status.health]}>
              {BACKUP_HEALTH_LABELS[status.health]}
            </StatusPill>
          </span>
        }
      />

      <SettingsRow
        label="Last successful backup"
        description={
          success === null
            ? "No successful backups yet."
            : `${backupTriggerLabel(success.trigger)} backup.`
        }
        control={
          <span className="dh-backup-fact" data-testid="backup-last-success">
            {success === null
              ? "None"
              : formatBackupInstant(
                  success.completedAt ?? success.startedAt,
                  timeZone,
                  now,
                )}
          </span>
        }
      />

      <SettingsRow
        label="Last attempt"
        description={
          attempt === null
            ? "Nothing has run yet."
            : `${backupTriggerLabel(attempt.trigger)}, ${formatBackupInstant(attempt.startedAt, timeZone, now)}.`
        }
        control={
          <span className="dh-backup-fact" data-testid="backup-last-attempt">
            {attempt === null
              ? "None"
              : BACKUP_RUN_STATUS_LABELS[attempt.status]}
          </span>
        }
      />

      <SettingsRow
        label="Size"
        description="The size of the most recent successful backup."
        control={
          <span className="dh-backup-fact" data-testid="backup-size">
            {formatBackupSize(success?.sizeBytes ?? null)}
          </span>
        }
      />

      <SettingsRow
        label="Kept for"
        description="Automatic backups are removed after this long. Backups you take by hand are kept longer."
        control={
          <span className="dh-backup-fact" data-testid="backup-retention">
            {`${status.retentionDays.daily} days`}
            <span className="dh-backup-fact__note">
              {` · by hand: ${status.retentionDays.manual} days`}
            </span>
          </span>
        }
      />

      <SettingsRow
        label="Backups kept"
        description="How many backups are currently in storage."
        control={
          <span className="dh-backup-fact" data-testid="backup-count">
            {status.available
              ? `${status.retainedBackupCountExact ? "" : "at least "}${status.retainedBackupCount}`
              : "—"}
          </span>
        }
      />

      <SettingsRow
        label="Next automatic backup"
        // "Approximately", and the reason is stated: the schedule is UTC, so the
        // local time shifts by an hour across daylight saving.
        description="The schedule runs in UTC, so the local time shifts by an hour when daylight saving changes."
        control={
          <span className="dh-backup-fact" data-testid="backup-next">
            {describeNextScheduledBackup(status, now, timeZone)}
          </span>
        }
      />

      <BackUpNowRow
        running={running}
        status={status}
        history={history}
        loadBackupStatus={loadBackupStatus}
      />
    </SettingsGroup>
  );
}

/**
 * "Back up now".
 *
 * Three separate reasons the button can be unavailable, and they are genuinely
 * different: a request is in flight, this session just started one, or a backup
 * was already running when the page loaded. All three disable it, and the label
 * says which — a disabled control with no explanation is a dead end.
 */
function runById(
  id: string | null,
  status: BackupStatusView,
  history: readonly BackupRunView[],
): BackupRunView | null {
  if (id === null) return null;
  if (status.latestAttempt?.id === id) return status.latestAttempt;
  return history.find((run) => run.id === id) ?? null;
}

function runStillInFlight(run: BackupRunView | null): boolean {
  return run === null || run.status === "queued" || run.status === "running";
}

function BackUpNowRow({
  running,
  status,
  history,
  loadBackupStatus,
}: {
  readonly running: boolean;
  readonly status: BackupStatusView;
  readonly history: readonly BackupRunView[];
  readonly loadBackupStatus: () => void;
}) {
  const fetcher = useFetcher<BackupActionResult>();
  const [acceptedInstanceId, setAcceptedInstanceId] = useState<string | null>(
    null,
  );
  const [localStatus, setLocalStatus] = useState<{
    readonly message: string;
    readonly tone: "neutral" | "danger";
  } | null>(null);
  const startedAt = useRef<number | null>(null);
  const observedActionId = useRef<string | null>(null);

  const submitting = fetcher.state !== "idle";
  const result = fetcher.data;
  const acceptedRun = runById(acceptedInstanceId, status, history);
  const acceptedRunInFlight =
    acceptedInstanceId !== null && runStillInFlight(acceptedRun);

  // Begin polling once a trigger has been accepted.
  useEffect(() => {
    if (result !== undefined && !result.ok) {
      setAcceptedInstanceId(null);
      setLocalStatus(null);
      return;
    }
    if (
      result !== undefined &&
      result.ok &&
      observedActionId.current !== result.instanceId
    ) {
      observedActionId.current = result.instanceId;
      setAcceptedInstanceId(result.instanceId);
      startedAt.current = Date.now();
      setLocalStatus({ message: result.message, tone: "neutral" });
      loadBackupStatus();
    }
  }, [loadBackupStatus, result]);

  // Poll the dedicated backup status resource only for the run this session
  // started. No timer runs when the page is simply open.
  useEffect(() => {
    if (acceptedInstanceId === null) return;
    const timer = setInterval(() => {
      const since = startedAt.current;
      if (since !== null && Date.now() - since > POLL_TIMEOUT_MS) {
        setAcceptedInstanceId(null);
        setLocalStatus({
          message:
            "Backup status is taking longer than expected. You can check again in a few minutes.",
          tone: "neutral",
        });
        return;
      }
      loadBackupStatus();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [acceptedInstanceId, loadBackupStatus]);

  // Stop as soon as the exact accepted run reaches a terminal state. It does not
  // matter whether the browser ever observed the intermediate `running` state.
  useEffect(() => {
    if (acceptedInstanceId === null || acceptedRun === null) return;
    if (acceptedRun.status === "success") {
      setAcceptedInstanceId(null);
      setLocalStatus({ message: "Backup completed.", tone: "neutral" });
    }
    if (acceptedRun.status === "failed") {
      setAcceptedInstanceId(null);
      setLocalStatus({
        message: acceptedRun.message ?? "The backup did not complete.",
        tone: "danger",
      });
    }
  }, [acceptedInstanceId, acceptedRun]);

  const disabled = submitting || running || acceptedRunInFlight;

  const label = submitting
    ? "Starting…"
    : running || acceptedRunInFlight
      ? "Backup in progress…"
      : "Back up now";

  const actionStatus =
    localStatus?.message ??
    (result === undefined
      ? running
        ? "A backup is already running."
        : null
      : result.message);

  return (
    <SettingsRow
      align="start"
      label="Back up now"
      description="Takes an immediate backup, kept for a year rather than 90 days. Useful before a big change."
      status={actionStatus}
      statusTone={
        localStatus?.tone ??
        (result !== undefined && !result.ok ? "danger" : "neutral")
      }
      statusLive
      control={
        <fetcher.Form method="post" action="/settings/backups/run">
          <button
            type="submit"
            className="dh-btn dh-btn--filled"
            disabled={disabled}
            data-testid="backup-run"
          >
            {label}
          </button>
        </fetcher.Form>
      }
    />
  );
}

/* -------------------------------------------------------------------------- */
/* History                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Recent backups.
 *
 * A LIST of rows, not a table, and that is a mobile decision made once rather
 * than a desktop table patched later. Each row stacks its own facts at narrow
 * widths and lays them out in columns when there is room, so an iPhone never gets
 * a horizontally-scrolling grid and a desktop never gets a cramped column of
 * cards. The date/time and the outcome lead, because those are what a person
 * scans for; size and duration follow.
 */
function BackupHistoryGroup({
  history,
  timeZone,
  now,
}: {
  readonly history: readonly BackupRunView[];
  readonly timeZone: string;
  readonly now: Date;
}) {
  return (
    <SettingsGroup
      title="Recent backups"
      description="The most recent backup runs, newest first."
    >
      {history.length === 0 ? (
        <SettingsRow
          label="No backups recorded yet"
          description="Once a backup has run, it appears here with its date, size and outcome."
          control={null}
        />
      ) : (
        <ul className="dh-backup-history" data-testid="backup-history">
          {history.map((run) => (
            <BackupHistoryRow
              key={run.id}
              run={run}
              timeZone={timeZone}
              now={now}
            />
          ))}
        </ul>
      )}
    </SettingsGroup>
  );
}

function BackupHistoryRow({
  run,
  timeZone,
  now,
}: {
  readonly run: BackupRunView;
  readonly timeZone: string;
  readonly now: Date;
}) {
  const duration = formatBackupDuration(run);
  const tone =
    run.status === "success"
      ? "success"
      : run.status === "failed"
        ? "danger"
        : "info";

  return (
    <li className="dh-backup-history__item">
      <div className="dh-backup-history__head">
        <span className="dh-backup-history__when">
          {formatBackupInstant(run.startedAt, timeZone, now)}
        </span>
        <StatusPill tone={tone}>
          {BACKUP_RUN_STATUS_LABELS[run.status]}
        </StatusPill>
      </div>

      <dl className="dh-backup-history__facts">
        <div className="dh-backup-history__fact">
          <dt>Kind</dt>
          <dd>{backupTriggerLabel(run.trigger)}</dd>
        </div>
        <div className="dh-backup-history__fact">
          <dt>Size</dt>
          <dd>{formatBackupSize(run.sizeBytes)}</dd>
        </div>
        {duration !== null ? (
          <div className="dh-backup-history__fact">
            <dt>Took</dt>
            <dd>{duration}</dd>
          </div>
        ) : null}
      </dl>

      {run.message !== null ? (
        <p className="dh-backup-history__message">{run.message}</p>
      ) : null}

      {/* Technical detail, behind an explicit disclosure. The storage path is not
          a secret — there is no way to fetch it from a browser — but it is noise
          for the question this screen exists to answer. */}
      {run.objectKey !== null ? (
        <details className="dh-backup-history__details">
          <summary>Technical details</summary>
          <dl className="dh-backup-history__facts">
            <div className="dh-backup-history__fact">
              <dt>Stored as</dt>
              <dd className="dh-backup-history__key">{run.objectKey}</dd>
            </div>
            <div className="dh-backup-history__fact">
              <dt>Run</dt>
              <dd className="dh-backup-history__key">{run.id}</dd>
            </div>
          </dl>
        </details>
      ) : null}
    </li>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Why there is no Restore button here.
 *
 * Stated rather than left as an absence, so the owner knows where recovery lives
 * and does not go looking for a control that was deliberately not built.
 */
function BackupRestoreNote() {
  return (
    <SettingsGroup
      title="Restoring"
      description="Recovery is deliberately not a button in DalyHub."
    >
      <SettingsRow
        label="Production restores are intentionally performed outside DalyHub"
        description="Restoring the production database is an irreversible operation, so it stays an explicit operator action taken with the command line — never something reachable by a mis-click in Settings."
        status="To recover individual records instead, use Privacy & data → Restore, which reads a DalyHub backup you downloaded yourself."
        control={null}
      />
    </SettingsGroup>
  );
}
