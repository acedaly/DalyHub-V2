/**
 * BACKUP-02 — the health calculation.
 *
 * This is the function the whole Backups screen reduces to, so the tests are
 * written around the property that matters most: **it never claims health it
 * cannot prove.** `unknown` on an unreadable state, `attention` on a failure even
 * when an older success exists, and a bounded tolerance for a late Workflow that
 * is a tested number rather than a vibe.
 */

import { describe, expect, it } from "vitest";

import {
  BACKUP_GRACE_HOURS,
  BACKUP_INTERVAL_HOURS,
  BACKUP_SCHEDULE_CRON,
  BACKUP_STALE_AFTER_HOURS,
  BACKUP_STALLED_MINUTES,
  calculateBackupHealth,
  runBlocksNewBackup,
} from "../../../infra/backup/src/backup-health";
import { BACKUP_CRON } from "../../../scripts/backup-worker.mjs";
import type { BackupRunRecord } from "../../../infra/backup/src/run-records";

const NOW = new Date("2026-08-14T10:00:00.000Z");

function run(overrides: Partial<BackupRunRecord> = {}): BackupRunRecord {
  return {
    id: "instance-1",
    trigger: "daily",
    status: "success",
    startedAt: "2026-08-13T16:00:00.000Z",
    completedAt: "2026-08-13T16:00:09.000Z",
    objectKey: "production/daily/2026/08/dalyhub-v2-2026-08-13T160000Z.sql",
    sizeBytes: 424523,
    retentionDays: 90,
    stage: null,
    message: null,
    ...overrides,
  };
}

function ago(hours: number): string {
  return new Date(NOW.getTime() - hours * 3600_000).toISOString();
}

describe("the schedule constants agree with the deployed cron", () => {
  it("keeps the interval, the service's cron and the operator script's cron in step", () => {
    // Three places name the nightly schedule. If one drifts, the health window is
    // computed for a schedule that is not the one running.
    expect(BACKUP_SCHEDULE_CRON).toBe(BACKUP_CRON);
    expect(BACKUP_SCHEDULE_CRON).toBe("0 16 * * *");
    expect(BACKUP_INTERVAL_HOURS).toBe(24);
    expect(BACKUP_STALE_AFTER_HOURS).toBe(
      BACKUP_INTERVAL_HOURS + BACKUP_GRACE_HOURS,
    );
  });
});

describe("calculateBackupHealth", () => {
  it("is unknown when state could not be read — never healthy, never failed", () => {
    // The single most important branch. A status call that fell over must not be
    // reported as either working or broken.
    const verdict = calculateBackupHealth({
      runs: [run()],
      available: false,
      now: NOW,
    });
    expect(verdict.health).toBe("unknown");
    expect(verdict.reason).toBe("unavailable");
    // Nothing is surfaced from the unreadable state, not even a stale record.
    expect(verdict.latestAttempt).toBeNull();
    expect(verdict.lastSuccess).toBeNull();
  });

  it("distinguishes 'no backups yet' from 'unavailable'", () => {
    const verdict = calculateBackupHealth({
      runs: [],
      available: true,
      now: NOW,
    });
    expect(verdict.health).toBe("unknown");
    expect(verdict.reason).toBe("no_runs");
  });

  it("is healthy after a recent success", () => {
    const verdict = calculateBackupHealth({
      runs: [run({ completedAt: ago(8), startedAt: ago(8) })],
      available: true,
      now: NOW,
    });
    expect(verdict.health).toBe("healthy");
    expect(verdict.reason).toBe("recent_success");
    expect(verdict.lastSuccess?.id).toBe("instance-1");
  });

  it("is running while a run is in progress", () => {
    for (const status of ["running", "queued"] as const) {
      const verdict = calculateBackupHealth({
        runs: [run({ status, startedAt: ago(0.01), completedAt: null })],
        available: true,
        now: NOW,
      });
      expect(verdict.health).toBe("running");
      expect(verdict.reason).toBe("running");
    }
  });

  it("stops calling a long-abandoned run 'in progress'", () => {
    // A run that died without recording its outcome would otherwise show as
    // "Backup in progress" forever, which is the most misleading thing this
    // screen could say.
    const verdict = calculateBackupHealth({
      runs: [
        run({
          status: "running",
          startedAt: ago(BACKUP_STALLED_MINUTES / 60 + 1),
          completedAt: null,
        }),
      ],
      available: true,
      now: NOW,
    });
    expect(verdict.health).toBe("attention");
    expect(verdict.reason).toBe("stalled");
  });

  it("needs attention when the latest attempt failed", () => {
    const verdict = calculateBackupHealth({
      runs: [
        run({
          id: "failed-run",
          status: "failed",
          startedAt: ago(2),
          completedAt: ago(2),
          objectKey: null,
          sizeBytes: null,
          stage: "r2-write",
          message: "The backup could not be saved to storage.",
        }),
      ],
      available: true,
      now: NOW,
    });
    expect(verdict.health).toBe("attention");
    expect(verdict.reason).toBe("latest_failed");
  });

  it("reports a failure AND still surfaces the last good backup", () => {
    // Both facts are true and the owner needs each: the problem, and what they
    // still have. A screen that shows only one of them misleads either way.
    const verdict = calculateBackupHealth({
      runs: [
        run({ id: "older-success", startedAt: ago(26), completedAt: ago(26) }),
        run({
          id: "newer-failure",
          status: "failed",
          startedAt: ago(2),
          completedAt: ago(2),
          stage: "export-start",
        }),
      ],
      available: true,
      now: NOW,
    });
    expect(verdict.health).toBe("attention");
    expect(verdict.latestAttempt?.id).toBe("newer-failure");
    expect(verdict.lastSuccess?.id).toBe("older-success");
  });

  it("needs attention when nothing has ever succeeded", () => {
    const verdict = calculateBackupHealth({
      runs: [run({ status: "failed", startedAt: ago(3), completedAt: ago(3) })],
      available: true,
      now: NOW,
    });
    expect(verdict.health).toBe("attention");
    expect(verdict.lastSuccess).toBeNull();
  });

  it("tolerates a late Workflow inside the grace window", () => {
    // 29 hours: a night's schedule plus most of the grace. A backup that retried
    // through transient trouble must not raise an alarm, because an indicator
    // that cries wolf is an indicator the owner learns to ignore.
    const late = BACKUP_STALE_AFTER_HOURS - 1;
    const verdict = calculateBackupHealth({
      runs: [run({ startedAt: ago(late), completedAt: ago(late) })],
      available: true,
      now: NOW,
    });
    expect(verdict.health).toBe("healthy");
  });

  it("calls a genuinely missed night stale", () => {
    const missed = BACKUP_STALE_AFTER_HOURS + 1;
    const verdict = calculateBackupHealth({
      runs: [run({ startedAt: ago(missed), completedAt: ago(missed) })],
      available: true,
      now: NOW,
    });
    expect(verdict.health).toBe("attention");
    expect(verdict.reason).toBe("stale");
  });

  it("measures staleness from completion, falling back to the start", () => {
    const verdict = calculateBackupHealth({
      runs: [
        run({
          startedAt: ago(BACKUP_STALE_AFTER_HOURS + 2),
          completedAt: null,
          status: "success",
        }),
      ],
      available: true,
      now: NOW,
    });
    expect(verdict.reason).toBe("stale");
  });

  it("picks the newest run regardless of the order given", () => {
    const verdict = calculateBackupHealth({
      runs: [
        run({ id: "old", startedAt: ago(50), completedAt: ago(50) }),
        run({ id: "new", startedAt: ago(1), completedAt: ago(1) }),
        run({ id: "middle", startedAt: ago(25), completedAt: ago(25) }),
      ],
      available: true,
      now: NOW,
    });
    expect(verdict.latestAttempt?.id).toBe("new");
    expect(verdict.health).toBe("healthy");
  });

  it("is unknown rather than healthy when a timestamp is unparseable", () => {
    const verdict = calculateBackupHealth({
      runs: [run({ startedAt: "not-a-date", completedAt: "also-not" })],
      available: true,
      now: NOW,
    });
    expect(verdict.health).toBe("unknown");
  });
});

describe("runBlocksNewBackup", () => {
  it("blocks while a run is genuinely in flight", () => {
    expect(
      runBlocksNewBackup(
        run({ status: "running", startedAt: ago(0.01), completedAt: null }),
        NOW,
      ),
    ).toBe(true);
    expect(
      runBlocksNewBackup(
        run({ status: "queued", startedAt: ago(0.01), completedAt: null }),
        NOW,
      ),
    ).toBe(true);
  });

  it("does not block on a finished run", () => {
    expect(runBlocksNewBackup(run({ status: "success" }), NOW)).toBe(false);
    expect(runBlocksNewBackup(run({ status: "failed" }), NOW)).toBe(false);
  });

  it("does not block on a stalled run — that would lock the owner out", () => {
    // If a run that died without recording its outcome blocked new backups, one
    // bad night would permanently disable the button that fixes it.
    expect(
      runBlocksNewBackup(
        run({
          status: "running",
          startedAt: ago(BACKUP_STALLED_MINUTES / 60 + 1),
          completedAt: null,
        }),
        NOW,
      ),
    ).toBe(false);
  });
});
