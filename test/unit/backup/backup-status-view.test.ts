/**
 * BACKUP-02 — the application's boundary validator, wording and formatting.
 *
 * Two properties dominate:
 *
 *  1. **A payload that cannot be trusted becomes "unavailable", never "Healthy".**
 *     The status arrives over a service binding from a Worker that can be
 *     redeployed independently, so every malformed shape is checked here rather
 *     than assumed away.
 *
 *  2. **Times are rendered in the OWNER's timezone, with daylight saving handled
 *     by `Intl`.** The nightly schedule is a UTC cron, so the local clock time it
 *     lands on genuinely moves between AEST and AEDT — and the surface must say
 *     "approximately" rather than pretending otherwise.
 */

import { describe, expect, it } from "vitest";

import {
  BACKUP_HEALTH_LABELS,
  BACKUP_HEALTH_TONES,
  UNAVAILABLE_BACKUP_STATUS,
  backupTriggerLabel,
  describeBackupHealth,
  describeNextScheduledBackup,
  formatBackupAge,
  formatBackupDuration,
  formatBackupInstant,
  formatBackupSize,
  nextDailyCronRun,
  parseBackupHistory,
  parseBackupRun,
  parseBackupStatus,
  type BackupRunView,
} from "~/kernel/backup";

const SYDNEY = "Australia/Sydney";

function runPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: "f9412c3c",
    trigger: "daily",
    status: "success",
    startedAt: "2026-08-13T16:00:00.000Z",
    completedAt: "2026-08-13T16:00:09.000Z",
    objectKey: "production/daily/2026/08/dalyhub-v2-2026-08-13T160000Z.sql",
    sizeBytes: 1_420_000,
    retentionDays: 90,
    stage: null,
    message: null,
    ...overrides,
  };
}

function statusPayload(overrides: Record<string, unknown> = {}) {
  return {
    available: true,
    health: "healthy",
    reason: "recent_success",
    latestAttempt: runPayload(),
    lastSuccessfulBackup: runPayload(),
    retainedBackupCount: 31,
    retainedBackupCountExact: true,
    retentionDays: { daily: 90, manual: 365 },
    schedule: "0 16 * * *",
    scheduleTimeZone: "UTC",
    intervalHours: 24,
    graceHours: 6,
    staleAfterHours: 30,
    databaseName: "dalyhub-v2",
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */

describe("parseBackupStatus", () => {
  it("accepts a well-formed payload", () => {
    const status = parseBackupStatus(statusPayload());
    expect(status.available).toBe(true);
    expect(status.health).toBe("healthy");
    expect(status.retainedBackupCount).toBe(31);
    expect(status.retentionDays).toEqual({ daily: 90, manual: 365 });
    expect(status.databaseName).toBe("dalyhub-v2");
  });

  it("falls back to unavailable rather than trusting a broken payload", () => {
    // Each of these is a shape a mid-deploy or partially-written response could
    // take. None of them may produce a confident "Healthy".
    for (const broken of [
      null,
      undefined,
      "a string",
      [statusPayload()],
      {},
      statusPayload({ available: false }),
      statusPayload({ health: "probably-fine" }),
      statusPayload({ reason: "because" }),
      statusPayload({ health: undefined }),
    ]) {
      const status = parseBackupStatus(broken);
      expect(status.available).toBe(false);
      expect(status.health).toBe("unknown");
      expect(status.reason).toBe("unavailable");
    }
  });

  it("keeps the rest of the status when one run is unreadable", () => {
    // A malformed run should cost that run, not the whole verdict.
    const status = parseBackupStatus(
      statusPayload({ latestAttempt: { id: "" } }),
    );
    expect(status.available).toBe(true);
    expect(status.latestAttempt).toBeNull();
    expect(status.lastSuccessfulBackup).not.toBeNull();
  });

  it("substitutes safe defaults for missing numbers", () => {
    const status = parseBackupStatus(
      statusPayload({
        retainedBackupCount: "lots",
        retentionDays: { daily: null, manual: undefined },
        intervalHours: -3,
      }),
    );
    expect(status.retainedBackupCount).toBe(0);
    expect(status.retentionDays.daily).toBe(
      UNAVAILABLE_BACKUP_STATUS.retentionDays.daily,
    );
    expect(status.intervalHours).toBe(UNAVAILABLE_BACKUP_STATUS.intervalHours);
  });

  it("truncates a message that is not one of the canned sentences", () => {
    const long = "x".repeat(5000);
    const parsed = parseBackupRun(
      runPayload({ status: "failed", stage: "r2-write", message: long }),
    );
    expect(parsed?.message?.length).toBeLessThanOrEqual(200);
  });
});

describe("parseBackupHistory", () => {
  it("returns the runs it can read and drops the ones it cannot", () => {
    const runs = parseBackupHistory({
      available: true,
      runs: [runPayload(), { id: "" }, runPayload({ id: "second" }), null],
    });
    expect(runs.map((run) => run.id)).toEqual(["f9412c3c", "second"]);
  });

  it("is empty for an unavailable or malformed history", () => {
    expect(
      parseBackupHistory({ available: false, runs: [runPayload()] }),
    ).toEqual([]);
    expect(parseBackupHistory(null)).toEqual([]);
    expect(parseBackupHistory({ available: true, runs: "no" })).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */

describe("labels", () => {
  it("says every health state in words, never by colour alone", () => {
    for (const [health, label] of Object.entries(BACKUP_HEALTH_LABELS)) {
      expect(label.length).toBeGreaterThan(0);
      expect(
        BACKUP_HEALTH_TONES[health as keyof typeof BACKUP_HEALTH_TONES],
      ).toBeDefined();
    }
    expect(BACKUP_HEALTH_LABELS.healthy).toBe("Healthy");
    expect(BACKUP_HEALTH_LABELS.running).toBe("Backup in progress");
    expect(BACKUP_HEALTH_LABELS.attention).toBe("Backup needs attention");
    expect(BACKUP_HEALTH_LABELS.unknown).toBe("Backup status unavailable");
  });

  it("does not colour 'unknown' as a problem", () => {
    // Not knowing is not the same as broken, and colouring it as one teaches the
    // owner to ignore the colour.
    expect(BACKUP_HEALTH_TONES.unknown).toBe("neutral");
    expect(BACKUP_HEALTH_TONES.attention).toBe("warning");
  });

  it("uses the product's words for the trigger, not the infrastructure's", () => {
    expect(backupTriggerLabel("daily")).toBe("Automatic");
    expect(backupTriggerLabel("manual")).toBe("Manual");
  });
});

describe("formatBackupSize", () => {
  it("uses decimal units, matching what the owner's OS shows", () => {
    expect(formatBackupSize(1_420_000)).toBe("1.42 MB");
    expect(formatBackupSize(424_523)).toBe("425 kB");
    expect(formatBackupSize(0)).toBe("0 kB");
  });

  it("shows an absence rather than a fake zero", () => {
    expect(formatBackupSize(null)).toBe("—");
    expect(formatBackupSize(-5)).toBe("—");
  });
});

describe("formatBackupInstant", () => {
  it("renders in the owner's timezone, not UTC", () => {
    // 16:00 UTC on 13 Aug is 02:00 on the 14th in Sydney (AEST, UTC+10).
    const now = new Date("2026-08-14T03:00:00.000Z");
    expect(formatBackupInstant("2026-08-13T16:00:00.000Z", SYDNEY, now)).toBe(
      "Today, 2:00 am",
    );
  });

  it("handles the AEDT half of the year with the same code", () => {
    // 16:00 UTC on 13 Jan is 03:00 on the 14th in Sydney (AEDT, UTC+11). Nothing
    // is hard-coded to +10 — this is the case a hard-coded offset gets wrong.
    const now = new Date("2026-01-14T04:00:00.000Z");
    expect(formatBackupInstant("2026-01-13T16:00:00.000Z", SYDNEY, now)).toBe(
      "Today, 3:00 am",
    );
  });

  it("says Today, Yesterday and an explicit date", () => {
    const now = new Date("2026-08-14T03:00:00.000Z");
    expect(
      formatBackupInstant("2026-08-13T16:00:00.000Z", SYDNEY, now),
    ).toContain("Today");
    expect(
      formatBackupInstant("2026-08-12T16:00:00.000Z", SYDNEY, now),
    ).toContain("Yesterday");
    expect(formatBackupInstant("2026-08-09T16:00:00.000Z", SYDNEY, now)).toBe(
      "10 Aug 2026, 2:00 am",
    );
  });

  it("shows an absence for a missing or unparseable instant", () => {
    const now = new Date("2026-08-14T03:00:00.000Z");
    expect(formatBackupInstant(null, SYDNEY, now)).toBe("—");
    expect(formatBackupInstant("nonsense", SYDNEY, now)).toBe("—");
  });

  it("respects a different owner timezone", () => {
    const now = new Date("2026-08-13T17:00:00.000Z");
    expect(formatBackupInstant("2026-08-13T16:00:00.000Z", "UTC", now)).toBe(
      "Today, 4:00 pm",
    );
  });
});

describe("formatBackupDuration and formatBackupAge", () => {
  const base: BackupRunView = {
    id: "x",
    trigger: "manual",
    status: "success",
    startedAt: "2026-08-13T08:49:31.000Z",
    completedAt: "2026-08-13T08:49:46.000Z",
    objectKey: null,
    sizeBytes: null,
    retentionDays: null,
    stage: null,
    message: null,
  };

  it("reports a duration in the units it actually took", () => {
    expect(formatBackupDuration(base)).toBe("15 seconds");
    expect(
      formatBackupDuration({
        ...base,
        completedAt: "2026-08-13T08:51:31.000Z",
      }),
    ).toBe("2 minutes");
  });

  it("has no duration for a run that has not finished", () => {
    expect(formatBackupDuration({ ...base, completedAt: null })).toBeNull();
  });

  it("refuses a negative duration rather than displaying one", () => {
    expect(
      formatBackupDuration({
        ...base,
        completedAt: "2026-08-13T08:00:00.000Z",
      }),
    ).toBeNull();
  });

  it("describes age in the units a person asks in", () => {
    const now = new Date("2026-08-14T00:00:00.000Z");
    expect(formatBackupAge("2026-08-13T16:00:00.000Z", now)).toBe(
      "8 hours ago",
    );
    expect(formatBackupAge("2026-08-13T23:59:40.000Z", now)).toBe(
      "moments ago",
    );
    expect(formatBackupAge("2026-08-11T00:00:00.000Z", now)).toBe("3 days ago");
  });
});

/* -------------------------------------------------------------------------- */

describe("nextDailyCronRun", () => {
  it("finds the next occurrence later today", () => {
    const next = nextDailyCronRun(
      "0 16 * * *",
      new Date("2026-08-13T09:00:00Z"),
    );
    expect(next?.toISOString()).toBe("2026-08-13T16:00:00.000Z");
  });

  it("rolls to tomorrow once today's slot has passed", () => {
    const next = nextDailyCronRun(
      "0 16 * * *",
      new Date("2026-08-13T16:30:00Z"),
    );
    expect(next?.toISOString()).toBe("2026-08-14T16:00:00.000Z");
  });

  it("refuses a cron it does not genuinely understand", () => {
    // Better to say "on its usual nightly schedule" than to guess at an
    // expression this deliberately narrow parser cannot read.
    for (const cron of [
      "*/15 * * * *",
      "0 9 * * MON-FRI",
      "0 16 1 * *",
      "",
      "99 99 * * *",
    ]) {
      expect(nextDailyCronRun(cron, new Date())).toBeNull();
    }
  });
});

describe("describeNextScheduledBackup", () => {
  const status = parseBackupStatus(statusPayload());

  it("says approximately, and gives the local time", () => {
    // 16:00 UTC → 2:00 am Sydney the following day.
    const now = new Date("2026-08-13T09:00:00.000Z");
    const text = describeNextScheduledBackup(status, now, SYDNEY);
    expect(text).toBe("Tomorrow at approximately 2:00 am");
  });

  it("shifts by an hour across daylight saving, rather than lying about it", () => {
    const summer = new Date("2026-01-13T09:00:00.000Z");
    expect(describeNextScheduledBackup(status, summer, SYDNEY)).toContain(
      "3:00 am",
    );
  });

  it("degrades to a truthful vague sentence for an unreadable schedule", () => {
    const odd = parseBackupStatus(statusPayload({ schedule: "*/15 * * * *" }));
    expect(describeNextScheduledBackup(odd, new Date(), SYDNEY)).toBe(
      "On its usual nightly schedule.",
    );
  });
});

/* -------------------------------------------------------------------------- */

describe("describeBackupHealth", () => {
  const now = new Date("2026-08-14T03:00:00.000Z");

  it("never implies failure when the status is merely unavailable", () => {
    const text = describeBackupHealth(UNAVAILABLE_BACKUP_STATUS, now, SYDNEY);
    expect(text).toContain("does not mean a backup has failed");
    expect(text.toLowerCase()).not.toContain("failed at");
  });

  it("says how long ago a healthy backup completed", () => {
    const status = parseBackupStatus(statusPayload());
    expect(describeBackupHealth(status, now, SYDNEY)).toBe(
      "Last backup completed successfully 11 hours ago.",
    );
  });

  it("says BOTH the failure and the last good backup", () => {
    // The property BACKUP-02 §16 asks for: a failure that hides the last success
    // implies the owner has nothing; a success that hides the failure hides a
    // problem.
    const status = parseBackupStatus(
      statusPayload({
        health: "attention",
        reason: "latest_failed",
        latestAttempt: runPayload({
          id: "failed",
          status: "failed",
          startedAt: "2026-08-14T16:01:00.000Z",
          completedAt: "2026-08-14T16:01:20.000Z",
          objectKey: null,
          sizeBytes: null,
          stage: "r2-write",
          message: "The backup could not be saved to storage.",
        }),
        lastSuccessfulBackup: runPayload(),
      }),
    );
    const text = describeBackupHealth(status, now, SYDNEY);
    expect(text).toContain("could not be saved to storage");
    expect(text).toContain("Last successful backup:");
  });

  it("says plainly when there is no earlier success to fall back on", () => {
    const status = parseBackupStatus(
      statusPayload({
        health: "attention",
        reason: "latest_failed",
        latestAttempt: runPayload({ status: "failed", stage: "export-start" }),
        lastSuccessfulBackup: null,
      }),
    );
    expect(describeBackupHealth(status, now, SYDNEY)).toContain(
      "no earlier successful backup",
    );
  });

  it("offers the empty state rather than an alarm when nothing has run", () => {
    const status = parseBackupStatus(
      statusPayload({
        health: "unknown",
        reason: "no_runs",
        latestAttempt: null,
        lastSuccessfulBackup: null,
      }),
    );
    expect(describeBackupHealth(status, now, SYDNEY)).toBe(
      "The first scheduled backup has not completed yet.",
    );
  });

  it("has a sentence for every reason", () => {
    for (const reason of [
      "unavailable",
      "no_runs",
      "running",
      "stalled",
      "latest_failed",
      "never_succeeded",
      "stale",
      "recent_success",
    ] as const) {
      const status = parseBackupStatus(statusPayload({ reason }));
      const text = describeBackupHealth(status, now, SYDNEY);
      expect(text.length, reason).toBeGreaterThan(10);
      // No storage paths, no ids, no infrastructure vocabulary in the sentence.
      expect(text, reason).not.toContain("production/");
      expect(text, reason).not.toMatch(/R2|Workflow|cron|D1/);
    }
  });
});
