/**
 * BACKUP-02 — run records: naming, validation, and the leak boundary.
 *
 * The property this file exists to hold is that **a failure message can only ever
 * be one of the sentences we wrote.** BACKUP-02 §7 says raw stack traces and
 * Cloudflare responses must not reach the UI, and the way that is guaranteed here
 * is structural rather than by filtering: the message is looked up from the stage,
 * so there is no code path from an error object to displayed text — including when
 * a stored record tries to supply its own.
 */

import { describe, expect, it } from "vitest";

import {
  RUN_LOG_LIMIT,
  RUNS_PREFIX,
  STAGE_FAILURE_MESSAGES,
  failedRun,
  parseRunRecord,
  runRecordKey,
  sortRunsNewestFirst,
  upsertRun,
  type BackupRunRecord,
} from "../../../infra/backup/src/run-records";

function record(overrides: Partial<BackupRunRecord> = {}): BackupRunRecord {
  return {
    id: "f9412c3c-f613-4d4a-87ea-22ee5035f43f",
    trigger: "manual",
    status: "success",
    startedAt: "2026-08-13T08:49:31.000Z",
    completedAt: "2026-08-13T08:49:46.000Z",
    objectKey: "production/manual/2026/08/dalyhub-v2-2026-08-13T084931Z.sql",
    sizeBytes: 424523,
    retentionDays: 365,
    stage: null,
    message: null,
    ...overrides,
  };
}

describe("runRecordKey", () => {
  it("leads with the start instant so a listing is chronological", () => {
    // An instance id alone is random, so a prefix listing would come back in an
    // order with no meaning.
    expect(runRecordKey(record())).toBe(
      `${RUNS_PREFIX}2026-08-13T084931Z-f9412c3c-f61.json`,
    );
  });

  it("sorts as plain strings in time order", () => {
    const keys = [
      record({ startedAt: "2026-08-13T16:00:00Z" }),
      record({ startedAt: "2026-01-02T16:00:00Z" }),
      record({ startedAt: "2026-12-31T23:59:00Z" }),
    ].map(runRecordKey);
    expect([...keys].sort()).toEqual([keys[1], keys[0], keys[2]]);
  });

  it("disambiguates two runs that started in the same second", () => {
    const a = runRecordKey(record({ id: "aaaaaaaa-1111" }));
    const b = runRecordKey(record({ id: "bbbbbbbb-2222" }));
    expect(a).not.toBe(b);
  });

  it("strips anything that is not key-safe from the id", () => {
    const key = runRecordKey(record({ id: "../../escape/attempt" }));
    expect(key.startsWith(RUNS_PREFIX)).toBe(true);
    expect(key).not.toContain("..");
    expect(key).not.toContain("/attempt");
  });

  it("does not produce a NaN key from an unparseable start", () => {
    expect(runRecordKey(record({ startedAt: "nonsense" }))).not.toContain(
      "NaN",
    );
  });
});

describe("failedRun", () => {
  it("chooses the message from the stage rather than accepting one", () => {
    const failed = failedRun(
      {
        id: "x",
        trigger: "daily",
        startedAt: "2026-08-13T16:00:00.000Z",
        objectKey: null,
        sizeBytes: null,
        retentionDays: 90,
      },
      "r2-write",
      "2026-08-13T16:00:20.000Z",
    );
    expect(failed.status).toBe("failed");
    expect(failed.stage).toBe("r2-write");
    expect(failed.message).toBe(STAGE_FAILURE_MESSAGES["r2-write"]);
  });

  it("has a sentence for every stage, and none of them leaks", () => {
    for (const [stage, message] of Object.entries(STAGE_FAILURE_MESSAGES)) {
      expect(message.length).toBeGreaterThan(10);
      // No URL, no token shape, no bucket/key path, no quoted API response.
      expect(message).not.toMatch(/https?:\/\//);
      expect(message).not.toMatch(/production\/(daily|manual)\//);
      expect(message).not.toMatch(/Bearer|token|signed/i);
      expect(message, `stage ${stage}`).not.toMatch(/\bError\b|stack/i);
    }
  });
});

describe("parseRunRecord", () => {
  it("accepts a well-formed record", () => {
    expect(parseRunRecord(record())).toEqual(record());
  });

  it("normalises the timestamps it accepts", () => {
    const parsed = parseRunRecord(
      record({ startedAt: "2026-08-13T08:49:31+00:00" }),
    );
    expect(parsed?.startedAt).toBe("2026-08-13T08:49:31.000Z");
  });

  it("refuses anything without an id, a valid status, trigger or start", () => {
    expect(parseRunRecord(record({ id: "" }))).toBeNull();
    expect(parseRunRecord({ ...record(), status: "finished" })).toBeNull();
    expect(parseRunRecord({ ...record(), trigger: "weekly" })).toBeNull();
    expect(parseRunRecord(record({ startedAt: "nope" }))).toBeNull();
    expect(parseRunRecord(null)).toBeNull();
    expect(parseRunRecord([record()])).toBeNull();
    expect(parseRunRecord("a string")).toBeNull();
  });

  it("re-derives the message from the stage, ignoring any stored text", () => {
    // The leak boundary, tested directly: a stored record cannot smuggle text
    // into the UI even if something wrote one.
    const parsed = parseRunRecord({
      ...record(),
      status: "failed",
      stage: "export-start",
      message:
        "Error: fetch failed https://api.cloudflare.com/...?token=SECRET at Object.<anonymous>",
    });
    expect(parsed?.message).toBe(STAGE_FAILURE_MESSAGES["export-start"]);
    expect(parsed?.message).not.toContain("SECRET");
    expect(parsed?.message).not.toContain("https://");
  });

  it("drops a message entirely when there is no stage", () => {
    const parsed = parseRunRecord({
      ...record(),
      stage: null,
      message: "something someone wrote by hand",
    });
    expect(parsed?.message).toBeNull();
  });

  it("ignores an unrecognised stage rather than trusting it", () => {
    const parsed = parseRunRecord({
      ...record(),
      status: "failed",
      stage: "made-up-stage",
    });
    expect(parsed?.stage).toBeNull();
    expect(parsed?.message).toBeNull();
  });

  it("rejects nonsensical numbers instead of displaying them", () => {
    expect(parseRunRecord(record({ sizeBytes: -1 }))?.sizeBytes).toBeNull();
    expect(
      parseRunRecord({ ...record(), sizeBytes: "424523" })?.sizeBytes,
    ).toBeNull();
    expect(
      parseRunRecord(record({ retentionDays: 0 }))?.retentionDays,
    ).toBeNull();
  });
});

describe("the rolling log", () => {
  it("replaces the earlier record for the same run rather than duplicating it", () => {
    // This is what makes the log correct across a run's lifecycle: one instance
    // appears once, as running and then as its outcome.
    const running = record({ status: "running", completedAt: null });
    const done = record({ status: "success" });
    const log = upsertRun(upsertRun([], running), done);
    expect(log).toHaveLength(1);
    expect(log[0].status).toBe("success");
  });

  it("keeps newest first", () => {
    const log = upsertRun(
      upsertRun([], record({ id: "old", startedAt: "2026-08-10T16:00:00Z" })),
      record({ id: "new", startedAt: "2026-08-13T16:00:00Z" }),
    );
    expect(log.map((entry) => entry.id)).toEqual(["new", "old"]);
  });

  it("caps the log and discards the oldest", () => {
    let log: BackupRunRecord[] = [];
    for (let index = 0; index < RUN_LOG_LIMIT + 5; index += 1) {
      log = upsertRun(
        log,
        record({
          id: `run-${String(index).padStart(3, "0")}`,
          startedAt: new Date(
            Date.parse("2026-01-01T00:00:00Z") + index * 86_400_000,
          ).toISOString(),
        }),
      );
    }
    expect(log).toHaveLength(RUN_LOG_LIMIT);
    expect(log[0].id).toBe(`run-${String(RUN_LOG_LIMIT + 4).padStart(3, "0")}`);
  });

  it("sorts totally, so equal timestamps still have a stable order", () => {
    const sorted = sortRunsNewestFirst([
      record({ id: "b" }),
      record({ id: "a" }),
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual(["a", "b"]);
  });
});
