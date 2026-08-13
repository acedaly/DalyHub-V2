/**
 * BACKUP-01 — object-key naming.
 *
 * The key is the recovery interface: on the day the owner needs a backup, the
 * key is what tells them which one to take. These tests hold the properties that
 * make that true — UTC, sortable, tier-correct, and refusing to produce a key it
 * cannot stand behind.
 */

import { describe, expect, it } from "vitest";

import {
  BACKUP_PREFIX,
  BACKUP_RETENTION_DAYS,
  backupObjectKey,
  backupTimestamp,
} from "../../../infra/backup/src/object-key";

describe("backupTimestamp", () => {
  it("formats an instant as a compact, sortable UTC stamp", () => {
    expect(backupTimestamp(new Date("2026-08-13T16:00:00.000Z"))).toBe(
      "2026-08-13T160000Z",
    );
  });

  it("uses UTC regardless of the host timezone offset", () => {
    // 16:00 UTC on 13 August is 02:00 on the 14th in Australia/Sydney (AEST).
    // The stamp must describe the UTC instant, not the local calendar day, or a
    // nightly backup would appear to jump a date every run.
    expect(backupTimestamp(new Date("2026-08-13T16:00:00+10:00"))).toBe(
      "2026-08-13T060000Z",
    );
  });

  it("pads every component to a fixed width so keys sort as instants", () => {
    expect(backupTimestamp(new Date("2026-01-02T03:04:05.000Z"))).toBe(
      "2026-01-02T030405Z",
    );
  });

  it("refuses an invalid date rather than naming a backup NaN", () => {
    expect(() => backupTimestamp(new Date("not a date"))).toThrow(/invalid/i);
  });
});

describe("backupObjectKey", () => {
  const at = new Date("2026-08-13T16:00:00.000Z");

  it("builds the documented daily key", () => {
    expect(
      backupObjectKey({ trigger: "daily", databaseName: "dalyhub-v2", at }),
    ).toBe("production/daily/2026/08/dalyhub-v2-2026-08-13T160000Z.sql");
  });

  it("files a manual backup under the manual prefix", () => {
    expect(
      backupObjectKey({ trigger: "manual", databaseName: "dalyhub-v2", at }),
    ).toBe("production/manual/2026/08/dalyhub-v2-2026-08-13T160000Z.sql");
  });

  it("is deterministic — the same inputs always give the same key", () => {
    // This is what makes a Workflow retry idempotent: the step that computes the
    // key is memoised, but even recomputed it must not drift.
    const first = backupObjectKey({
      trigger: "daily",
      databaseName: "dalyhub-v2",
      at,
    });
    const second = backupObjectKey({
      trigger: "daily",
      databaseName: "dalyhub-v2",
      at: new Date(at.getTime()),
    });
    expect(second).toBe(first);
  });

  it("produces keys that sort chronologically as plain strings", () => {
    const keys = [
      new Date("2026-08-13T16:00:00Z"),
      new Date("2026-01-05T16:00:00Z"),
      new Date("2026-12-31T23:59:59Z"),
      new Date("2026-08-09T16:00:00Z"),
    ].map((when) =>
      backupObjectKey({
        trigger: "daily",
        databaseName: "dalyhub-v2",
        at: when,
      }),
    );
    const sorted = [...keys].sort();
    expect(sorted).toEqual([keys[1], keys[3], keys[0], keys[2]]);
  });

  it("zero-pads the month directory", () => {
    const key = backupObjectKey({
      trigger: "daily",
      databaseName: "dalyhub-v2",
      at: new Date("2026-03-04T05:06:07Z"),
    });
    expect(key).toContain("/2026/03/");
  });

  it("contains no spaces and no colons", () => {
    const key = backupObjectKey({
      trigger: "daily",
      databaseName: "dalyhub-v2",
      at,
    });
    expect(key).not.toMatch(/[\s:]/);
  });

  it("refuses a database name that could escape its retention prefix", () => {
    // A name carrying a slash or a `..` segment would file the backup outside
    // the prefix its lifecycle rule governs, so it would be kept forever or
    // deleted early — and nobody would find out until recovery day.
    for (const unsafe of [
      "../escape",
      "dalyhub/v2",
      "dalyhub v2",
      "",
      "/absolute",
    ]) {
      expect(() =>
        backupObjectKey({ trigger: "daily", databaseName: unsafe, at }),
      ).toThrow(/unsafe database name/i);
    }
  });

  it("refuses an unknown tier", () => {
    expect(() =>
      backupObjectKey({
        // @ts-expect-error — deliberately outside the union.
        trigger: "weekly",
        databaseName: "dalyhub-v2",
        at,
      }),
    ).toThrow(/unknown backup trigger/i);
  });
});

describe("retention tiers", () => {
  it("keeps the prefixes and retention that the lifecycle rules enforce", () => {
    // These constants are the contract between the object key and the R2
    // lifecycle rules in scripts/backup-worker.mjs. If one changes without the
    // other, backups silently outlive or under-live their policy.
    expect(BACKUP_PREFIX.daily).toBe("production/daily/");
    expect(BACKUP_PREFIX.manual).toBe("production/manual/");
    expect(BACKUP_RETENTION_DAYS.daily).toBe(90);
    expect(BACKUP_RETENTION_DAYS.manual).toBe(365);
  });
});
