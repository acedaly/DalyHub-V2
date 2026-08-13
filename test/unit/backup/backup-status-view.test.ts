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
  isCoherentBackupStatus,
  nextDailyCronRun,
  parseBackupHistory,
  parseBackupRun,
  parseBackupStatus,
  type BackupRunView,
} from "~/kernel/backup";

// The PRODUCER, imported so the contract below is checked against what the backup
// Worker really emits rather than against what this file assumes. Its sibling
// `backup-health.test.ts` imports from `infra/` the same way.
import { calculateBackupHealth } from "../../../infra/backup/src/backup-health";
import type { BackupRunRecord as HealthRun } from "../../../infra/backup/src/run-records";

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

  it("costs only the run itself when the verdict does not depend on it", () => {
    // A malformed run should cost that run and no more — but only where the
    // verdict does not rest on it. "Last attempt failed" is true whether or not
    // an earlier success can be read, so the failure verdict survives.
    const status = parseBackupStatus(
      statusPayload({
        health: "attention",
        reason: "latest_failed",
        latestAttempt: runPayload({ status: "failed", stage: "r2-write" }),
        lastSuccessfulBackup: { id: "" },
      }),
    );
    expect(status.available).toBe(true);
    expect(status.health).toBe("attention");
    expect(status.latestAttempt).not.toBeNull();
    expect(status.lastSuccessfulBackup).toBeNull();
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

  /*
   * Field-by-field validation is not enough: every field can be individually
   * valid while the payload as a whole is a lie. These are the combinations that
   * would otherwise render a confident verdict with no evidence behind it.
   */
  describe("coherence between the verdict and its evidence", () => {
    it("refuses 'healthy' with no successful backup to point at", () => {
      // The finding this suite exists for: enum-valid, run-invalid, and the
      // surface would have said "Healthy" beside "Last successful backup: None".
      for (const broken of [undefined, null, {}, { id: "" }, "nonsense"]) {
        const status = parseBackupStatus(
          statusPayload({ lastSuccessfulBackup: broken }),
        );
        expect(status.available).toBe(false);
        expect(status.health).toBe("unknown");
        expect(status.reason).toBe("unavailable");
      }
    });

    it("refuses 'healthy' paired with any other reason", () => {
      for (const reason of ["running", "stale", "no_runs", "latest_failed"]) {
        expect(parseBackupStatus(statusPayload({ reason })).available).toBe(
          false,
        );
      }
    });

    it("refuses a verdict about a run that is not there", () => {
      for (const [health, reason] of [
        ["running", "running"],
        ["attention", "latest_failed"],
        ["attention", "stalled"],
        ["attention", "stale"],
      ] as const) {
        const status = parseBackupStatus(
          statusPayload({
            health,
            reason,
            latestAttempt: null,
            lastSuccessfulBackup: runPayload(),
          }),
        );
        expect(status.available, `${health}/${reason}`).toBe(false);
      }
    });

    it("refuses 'stale' without the successful backup it is measuring", () => {
      expect(
        parseBackupStatus(
          statusPayload({
            health: "attention",
            reason: "stale",
            lastSuccessfulBackup: null,
          }),
        ).available,
      ).toBe(false);
    });

    it("refuses 'no runs' while carrying a run", () => {
      expect(
        parseBackupStatus(
          statusPayload({
            health: "unknown",
            reason: "no_runs",
            latestAttempt: runPayload(),
            lastSuccessfulBackup: null,
          }),
        ).available,
      ).toBe(false);
    });

    it("still accepts the coherent shapes the producer really emits", () => {
      // The check must not be so strict that honest states get reported as
      // unavailable — over-rejecting is safe but it is not free.
      const coherent = [
        statusPayload(),
        statusPayload({
          health: "running",
          reason: "running",
          latestAttempt: runPayload({ status: "running", completedAt: null }),
          lastSuccessfulBackup: null,
        }),
        statusPayload({
          health: "attention",
          reason: "latest_failed",
          latestAttempt: runPayload({ status: "failed", stage: "r2-write" }),
          lastSuccessfulBackup: null,
        }),
        statusPayload({
          health: "attention",
          reason: "stalled",
          latestAttempt: runPayload({ status: "running", completedAt: null }),
          lastSuccessfulBackup: null,
        }),
        statusPayload({ health: "attention", reason: "stale" }),
        statusPayload({
          health: "unknown",
          reason: "no_runs",
          latestAttempt: null,
          lastSuccessfulBackup: null,
        }),
        statusPayload({
          health: "unknown",
          reason: "never_succeeded",
          latestAttempt: runPayload({ status: "failed" }),
          lastSuccessfulBackup: null,
        }),
        // `unavailable` reached WITH runs — the producer's un-computable-age
        // branch. It must not be required to be empty.
        statusPayload({ health: "unknown", reason: "unavailable" }),
      ];
      for (const payload of coherent) {
        const status = parseBackupStatus(payload);
        expect(status.available, `${payload.health}/${payload.reason}`).toBe(
          true,
        );
      }
    });
  });
});

/**
 * The drift guard.
 *
 * The coherence rules now live on both sides of the service binding: the producer
 * (`calculateBackupHealth`, in the backup Worker) and the contract
 * (`isCoherentBackupStatus`, here). If someone adds a branch to the health
 * calculation that the validator would reject, the UI would silently go
 * "unavailable" in production and nothing would fail. So the producer is driven
 * over every branch it has and each verdict is checked against the contract.
 *
 * This mirrors the parity guard between `scripts/production-backup.mjs` and the
 * Worker's own dump validation in `dump-validation.test.ts`.
 */
describe("the producer can only emit combinations the validator accepts", () => {
  const NOW = new Date("2026-08-14T10:00:00.000Z");

  function record(overrides: Partial<HealthRun> = {}): HealthRun {
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

  /** One case per branch `calculateBackupHealth` can return from. */
  const CASES: readonly {
    name: string;
    runs: HealthRun[];
    available: boolean;
  }[] = [
    { name: "unreadable state", runs: [record()], available: false },
    { name: "no runs at all", runs: [], available: true },
    {
      name: "a run in progress",
      runs: [
        record({ status: "running", startedAt: ago(0.01), completedAt: null }),
      ],
      available: true,
    },
    {
      name: "a stalled run",
      runs: [
        record({ status: "running", startedAt: ago(2), completedAt: null }),
      ],
      available: true,
    },
    {
      name: "a failure with no earlier success",
      runs: [
        record({ status: "failed", startedAt: ago(2), completedAt: ago(2) }),
      ],
      available: true,
    },
    {
      name: "a failure over an earlier success",
      runs: [
        record({ id: "ok", startedAt: ago(26), completedAt: ago(26) }),
        record({
          id: "bad",
          status: "failed",
          startedAt: ago(2),
          completedAt: ago(2),
        }),
      ],
      available: true,
    },
    {
      name: "a stale success",
      runs: [record({ startedAt: ago(40), completedAt: ago(40) })],
      available: true,
    },
    {
      name: "a recent success",
      runs: [record({ startedAt: ago(8), completedAt: ago(8) })],
      available: true,
    },
  ];

  for (const testCase of CASES) {
    it(`accepts the verdict for ${testCase.name}`, () => {
      const verdict = calculateBackupHealth({
        runs: testCase.runs,
        available: testCase.available,
        now: NOW,
      });
      expect(
        isCoherentBackupStatus(
          verdict.health,
          verdict.reason,
          verdict.latestAttempt,
          verdict.lastSuccess,
        ),
        `${verdict.health}/${verdict.reason}`,
      ).toBe(true);
    });
  }

  it("covers every reason the validator knows about", () => {
    // If a reason exists that no case above produces, the guard has a hole.
    const produced = new Set(
      CASES.map(
        (testCase) =>
          calculateBackupHealth({
            runs: testCase.runs,
            available: testCase.available,
            now: NOW,
          }).reason,
      ),
    );
    // `never_succeeded` is unreachable in practice (the producer says so), so it
    // is the one reason no case can exercise.
    expect([...produced].sort()).toEqual([
      "latest_failed",
      "no_runs",
      "recent_success",
      "running",
      "stale",
      "stalled",
      "unavailable",
    ]);
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
