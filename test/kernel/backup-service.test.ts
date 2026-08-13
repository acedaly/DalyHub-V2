/**
 * BACKUP-02 — the internal backup service, against a REAL (local, isolated) R2
 * bucket in the Workers runtime.
 *
 * The properties worth proving here are the ones a stub would happily agree with
 * and a real bucket will not:
 *
 *   - status is derived from what is actually stored, and an unreadable log
 *     produces `unavailable` rather than a confident verdict;
 *   - history is bounded regardless of what the caller asks for;
 *   - a second trigger is refused while a run is genuinely in flight;
 *   - a stalled run does NOT lock the owner out of taking a backup;
 *   - and nothing the service returns can carry SQL, a signed URL or a secret,
 *     even when the bucket contains a real dump right next to the status files.
 */

import { env, runInDurableObject } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { backupAdmissionGate } from "../../infra/backup/src/backup-admission";
import type { BackupAdmissionNamespace } from "../../infra/backup/src/backup-admission";
import { BackupService } from "../../infra/backup/src/backup-service";
import { startBackupWorkflow } from "../../infra/backup/src/backup-start";
import { BACKUP_STALLED_MINUTES } from "../../infra/backup/src/backup-health";
import type { BackupEnv } from "../../infra/backup/src/config";
import {
  RUN_LOG_KEY,
  RUN_LOG_LIMIT,
  type BackupRunRecord,
} from "../../infra/backup/src/run-records";
import { recordRun } from "../../infra/backup/src/status-store";

const bucket = (env as unknown as { BACKUPS: R2Bucket }).BACKUPS;
const admissionNamespace = (
  env as unknown as { BACKUP_ADMISSION: BackupAdmissionNamespace }
).BACKUP_ADMISSION;

const ACCOUNT_ID = "0123456789abcdef0123456789abcdef";
const DATABASE_ID = "00000000-0000-4000-8000-000000000000";
const API_TOKEN = "test-only-token-never-returned";

/**
 * A stand-in Workflow binding. `create()` records the call and hands back an id,
 * which is all the service uses — the Workflow itself is BACKUP-01's, and it is
 * exercised end to end in `backup-workflow.test.ts`.
 */
function workflowStub() {
  const created: unknown[] = [];
  let nextId = 0;
  return {
    created,
    binding: {
      create: vi.fn(async (options?: unknown) => {
        created.push(options);
        nextId += 1;
        return { id: `instance-${nextId}` };
      }),
    } as unknown as BackupEnv["BACKUP_WORKFLOW"],
  };
}

function serviceEnv(overrides: Partial<BackupEnv> = {}): BackupEnv {
  return {
    BACKUPS: bucket,
    BACKUP_WORKFLOW: workflowStub().binding,
    BACKUP_ADMISSION: admissionNamespace,
    CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID,
    D1_DATABASE_ID: DATABASE_ID,
    D1_DATABASE_NAME: "dalyhub-v2",
    BACKUP_ENVIRONMENT: "production",
    D1_REST_API_TOKEN: API_TOKEN,
    ...overrides,
  };
}

/** The service, constructed the way the runtime does. */
function makeService(environment: BackupEnv = serviceEnv()): BackupService {
  return new BackupService({} as ExecutionContext, environment);
}

function run(overrides: Partial<BackupRunRecord> = {}): BackupRunRecord {
  return {
    id: "instance-1",
    trigger: "daily",
    status: "success",
    startedAt: new Date(Date.now() - 3600_000).toISOString(),
    completedAt: new Date(Date.now() - 3590_000).toISOString(),
    objectKey: "production/daily/2026/08/dalyhub-v2-2026-08-13T160000Z.sql",
    sizeBytes: 424523,
    retentionDays: 90,
    stage: null,
    message: null,
    ...overrides,
  };
}

beforeEach(async () => {
  const listed = await bucket.list({ prefix: "" });
  await Promise.all(listed.objects.map((object) => bucket.delete(object.key)));
  await runInDurableObject(
    backupAdmissionGate({ BACKUP_ADMISSION: admissionNamespace }),
    (_instance, state) => state.storage.deleteAll(),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* status()                                                                   */
/* -------------------------------------------------------------------------- */

describe("status()", () => {
  it("reports 'no backups yet' on an empty bucket — not unavailable", () => {
    return makeService()
      .status()
      .then((status) => {
        expect(status.available).toBe(true);
        expect(status.health).toBe("unknown");
        expect(status.reason).toBe("no_runs");
        expect(status.retainedBackupCount).toBe(0);
      });
  });

  it("reports health derived from what is actually stored", async () => {
    await recordRun(bucket, run());
    const status = await makeService().status();

    expect(status.available).toBe(true);
    expect(status.health).toBe("healthy");
    expect(status.lastSuccessfulBackup?.id).toBe("instance-1");
    expect(status.schedule).toBe("0 16 * * *");
    expect(status.scheduleTimeZone).toBe("UTC");
    expect(status.retentionDays).toEqual({ daily: 90, manual: 365 });
    expect(status.databaseName).toBe("dalyhub-v2");
  });

  it("counts the dumps actually in storage, without reading one", async () => {
    await bucket.put(
      "production/daily/2026/08/dalyhub-v2-2026-08-13T160000Z.sql",
      "CREATE TABLE entities (id TEXT);",
    );
    await bucket.put(
      "production/manual/2026/08/dalyhub-v2-2026-08-12T090000Z.sql",
      "CREATE TABLE entities (id TEXT);",
    );
    await recordRun(bucket, run());

    const status = await makeService().status();
    expect(status.retainedBackupCount).toBe(2);
    expect(status.retainedBackupCountExact).toBe(true);
    // The dumps are counted, never returned.
    expect(JSON.stringify(status)).not.toContain("CREATE TABLE");
  });

  it("is unavailable — not healthy — when the run log cannot be read", async () => {
    // A corrupt log is the case that must never be reported as working.
    await bucket.put(RUN_LOG_KEY, "{ this is not json");
    const status = await makeService().status();
    expect(status.available).toBe(false);
    expect(status.health).toBe("unknown");
    expect(status.reason).toBe("unavailable");
  });

  it("drops an unreadable entry rather than the whole log", async () => {
    await recordRun(bucket, run());
    const stored = await bucket.get(RUN_LOG_KEY);
    const parsed = (await stored!.json()) as { runs: unknown[] };
    parsed.runs.push({ id: "", status: "nonsense" });
    await bucket.put(RUN_LOG_KEY, JSON.stringify(parsed));

    const status = await makeService().status();
    expect(status.available).toBe(true);
    expect(status.health).toBe("healthy");
  });

  it("still reports health when the object count fails", async () => {
    await recordRun(bucket, run());
    const broken = serviceEnv({
      BACKUPS: {
        ...bucket,
        get: bucket.get.bind(bucket),
        list: vi.fn(async () => {
          throw new Error("listing unavailable");
        }),
      } as unknown as R2Bucket,
    });
    const status = await makeService(broken).status();
    // A failed count is supporting detail, not the verdict.
    expect(status.available).toBe(true);
    expect(status.health).toBe("healthy");
    expect(status.retainedBackupCountExact).toBe(false);
  });

  it("never returns a token, a signed URL or dump bytes", async () => {
    await bucket.put(
      "production/daily/2026/08/dalyhub-v2-2026-08-13T160000Z.sql",
      "PRAGMA defer_foreign_keys=TRUE;\nCREATE TABLE person_details (email TEXT);",
    );
    await recordRun(bucket, run());
    const serialised = JSON.stringify(await makeService().status());

    expect(serialised).not.toContain(API_TOKEN);
    expect(serialised).not.toContain(DATABASE_ID);
    expect(serialised).not.toMatch(/signed_url|signedUrl|Bearer/i);
    expect(serialised).not.toMatch(/CREATE TABLE|PRAGMA|person_details/);
  });
});

/* -------------------------------------------------------------------------- */
/* history()                                                                  */
/* -------------------------------------------------------------------------- */

describe("history()", () => {
  it("returns recent runs newest first", async () => {
    await recordRun(
      bucket,
      run({ id: "older", startedAt: "2026-08-10T16:00:00.000Z" }),
    );
    await recordRun(
      bucket,
      run({ id: "newer", startedAt: "2026-08-13T16:00:00.000Z" }),
    );
    const history = await makeService().history();
    expect(history.available).toBe(true);
    expect(history.runs.map((entry) => entry.id)).toEqual(["newer", "older"]);
  });

  it("limits the default response", async () => {
    for (let index = 0; index < RUN_LOG_LIMIT + 10; index += 1) {
      await recordRun(
        bucket,
        run({
          id: `run-${String(index).padStart(3, "0")}`,
          startedAt: new Date(
            Date.parse("2026-01-01T00:00:00Z") + index * 86_400_000,
          ).toISOString(),
        }),
      );
    }
    const history = await makeService().history();
    expect(history.runs).toHaveLength(RUN_LOG_LIMIT);
  });

  it("cannot be asked for more than the log holds", async () => {
    await recordRun(bucket, run());
    const history = await makeService().history(10_000);
    expect(history.runs.length).toBeLessThanOrEqual(RUN_LOG_LIMIT);
  });

  it("clamps a nonsensical limit instead of failing", async () => {
    await recordRun(bucket, run());
    for (const limit of [0, -5, Number.NaN]) {
      const history = await makeService().history(limit);
      expect(history.runs.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("is unavailable rather than empty when the log cannot be read", async () => {
    await bucket.put(RUN_LOG_KEY, "not json at all");
    const history = await makeService().history();
    expect(history.available).toBe(false);
    expect(history.runs).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* trigger()                                                                  */
/* -------------------------------------------------------------------------- */

describe("trigger()", () => {
  it("starts one instance of the existing Workflow", async () => {
    const workflow = workflowStub();
    const result = await makeService(
      serviceEnv({ BACKUP_WORKFLOW: workflow.binding }),
    ).trigger();

    expect(result).toEqual({
      accepted: true,
      instanceId: "instance-1",
      status: "queued",
    });
    // The manual tier, so the object lands under production/manual/ and is kept
    // for a year. And it creates a Workflow instance rather than backing up
    // anything itself — there is exactly one backup engine.
    expect(workflow.created).toHaveLength(1);
    expect(workflow.created[0]).toMatchObject({
      params: { trigger: "manual" },
    });
    expect(
      (workflow.created[0] as { params?: { admissionId?: unknown } }).params
        ?.admissionId,
    ).toEqual(expect.any(String));
  });

  it("admits only one of two simultaneous manual triggers", async () => {
    const workflow = workflowStub();
    const service = makeService(
      serviceEnv({ BACKUP_WORKFLOW: workflow.binding }),
    );

    const [a, b] = await Promise.all([service.trigger(), service.trigger()]);
    const results = [a, b];

    expect(results.filter((result) => result.accepted)).toHaveLength(1);
    expect(
      results.filter(
        (result) => !result.accepted && result.status === "running",
      ),
    ).toHaveLength(1);
    expect(workflow.binding.create).toHaveBeenCalledTimes(1);
  });

  it("uses the same gate for simultaneous manual and scheduled triggers", async () => {
    const workflow = workflowStub();
    const environment = serviceEnv({ BACKUP_WORKFLOW: workflow.binding });
    const service = makeService(environment);

    const [manual, scheduled] = await Promise.all([
      service.trigger(),
      startBackupWorkflow(environment, {
        trigger: "daily",
        scheduledTime: Date.parse("2026-08-13T16:00:00.000Z"),
      }),
    ]);
    const results = [manual, scheduled];

    expect(results.filter((result) => result.accepted)).toHaveLength(1);
    expect(
      results.filter(
        (result) => !result.accepted && result.status === "running",
      ),
    ).toHaveLength(1);
    expect(workflow.binding.create).toHaveBeenCalledTimes(1);
    const created = workflow.created[0] as { params?: { trigger?: string } };
    expect(["manual", "daily"]).toContain(created.params?.trigger);
  });

  it("refuses a second backup while one is genuinely running", async () => {
    await recordRun(
      bucket,
      run({
        id: "in-flight",
        status: "running",
        startedAt: new Date().toISOString(),
        completedAt: null,
        objectKey: null,
        sizeBytes: null,
      }),
    );
    const workflow = workflowStub();
    const result = await makeService(
      serviceEnv({ BACKUP_WORKFLOW: workflow.binding }),
    ).trigger();

    expect(result.accepted).toBe(false);
    if (result.accepted) throw new Error("unreachable");
    expect(result.status).toBe("running");
    expect(result.message).toMatch(/already running/i);
    // The important half: no second export was started.
    expect(workflow.binding.create).not.toHaveBeenCalled();
  });

  it("does NOT refuse because of a run that died without finishing", async () => {
    // If a stalled run blocked new backups, one bad night would permanently
    // disable the very button that fixes it.
    await recordRun(
      bucket,
      run({
        id: "stalled",
        status: "running",
        startedAt: new Date(
          Date.now() - (BACKUP_STALLED_MINUTES + 5) * 60_000,
        ).toISOString(),
        completedAt: null,
        objectKey: null,
        sizeBytes: null,
      }),
    );
    const result = await makeService().trigger();
    expect(result.accepted).toBe(true);
  });

  it("still starts a backup when the history cannot be read", async () => {
    // Not knowing whether a backup is running is a reason to take one, not a
    // reason to refuse.
    await bucket.put(RUN_LOG_KEY, "corrupt");
    const result = await makeService().trigger();
    expect(result.accepted).toBe(true);
  });

  it("refuses, without leaking the token, when configuration is missing", async () => {
    const result = await makeService(
      serviceEnv({ D1_REST_API_TOKEN: "" }),
    ).trigger();
    expect(result.accepted).toBe(false);
    if (result.accepted) throw new Error("unreachable");
    expect(result.status).toBe("error");
    expect(result.message).not.toContain(API_TOKEN);
    expect(result.message).toMatch(/not fully configured/i);
  });

  it("reports a failure to start as a plain sentence", async () => {
    const failing = serviceEnv({
      BACKUP_WORKFLOW: {
        create: vi.fn(async () => {
          throw new Error("workflow subsystem unavailable at https://internal");
        }),
      } as unknown as BackupEnv["BACKUP_WORKFLOW"],
    });
    const result = await makeService(failing).trigger();
    expect(result.accepted).toBe(false);
    if (result.accepted) throw new Error("unreachable");
    expect(result.status).toBe("error");
    // The thrown detail belongs in logs, not in the owner's face.
    expect(result.message).not.toContain("https://internal");
    expect(result.message).toBe(
      "The backup could not be started. Please try again.",
    );
  });

  it("cancels admission when Workflow creation fails, so a retry can start", async () => {
    const failing = serviceEnv({
      BACKUP_WORKFLOW: {
        create: vi.fn(async () => {
          throw new Error("workflow subsystem unavailable");
        }),
      } as unknown as BackupEnv["BACKUP_WORKFLOW"],
    });
    const failed = await makeService(failing).trigger();
    expect(failed.accepted).toBe(false);

    const workflow = workflowStub();
    const retried = await makeService(
      serviceEnv({ BACKUP_WORKFLOW: workflow.binding }),
    ).trigger();

    expect(retried.accepted).toBe(true);
    expect(workflow.binding.create).toHaveBeenCalledTimes(1);
  });

  it("recovers a stale admission instead of wedging backups permanently", async () => {
    const gate = backupAdmissionGate({ BACKUP_ADMISSION: admissionNamespace });
    const old = new Date(
      Date.now() - (BACKUP_STALLED_MINUTES + 5) * 60_000,
    ).toISOString();
    const admitted = await gate.admit({ trigger: "manual", now: old });
    expect(admitted.accepted).toBe(true);

    const workflow = workflowStub();
    const result = await makeService(
      serviceEnv({ BACKUP_WORKFLOW: workflow.binding }),
    ).trigger();

    expect(result.accepted).toBe(true);
    expect(workflow.binding.create).toHaveBeenCalledTimes(1);
  });
});
