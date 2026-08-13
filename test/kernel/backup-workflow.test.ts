/**
 * BACKUP-01 — the production backup Workflow, driven inside the REAL Workers
 * runtime against a REAL (local, isolated) R2 bucket.
 *
 * This file lives in the Workers pool rather than `test/unit` deliberately. The
 * Workflow's correctness claims are runtime claims: that R2 rejects a write
 * whose bytes do not match the SHA-256 it was given, that `head()` returns the
 * custom metadata that was actually stored, that `crypto.subtle` and
 * `NonRetryableError` behave as the code assumes. A hand-written R2 stub would
 * agree with whatever the implementation did and prove none of it.
 *
 * What IS stubbed is the network: `globalThis.fetch` stands in for the
 * Cloudflare D1 export API, so the suite never performs a production export and
 * needs no credentials — a normal `pnpm test` must never touch production.
 *
 * The `step` implementation below is intentionally the simplest thing that
 * matches the contract (run the callback, return its value). Retry SEMANTICS are
 * Cloudflare's, not ours; what these tests own is which errors are raised as
 * permanent (`NonRetryableError`) versus ordinary, because that classification
 * is DalyHub's decision and it is what stops the pipeline retrying a bad token
 * for six hours or giving up on a five-second blip.
 */

import { env } from "cloudflare:test";
import { NonRetryableError } from "cloudflare:workflows";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runProductionBackup } from "../../infra/backup/src/backup-workflow";
import type { BackupEnv, BackupParams } from "../../infra/backup/src/config";
import { REQUIRED_DUMP_TABLES } from "../../infra/backup/src/dump-validation";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

// Structurally valid but deliberately FAKE identifiers. The repository commits
// no real account id or database UUID anywhere — not in config, and not in a
// fixture either, where they would be just as permanent.
const ACCOUNT_ID = "0123456789abcdef0123456789abcdef";
const DATABASE_ID = "00000000-0000-4000-8000-000000000000";
const API_TOKEN = "test-only-token-abcdef123456";
const SIGNED_URL = "https://example.invalid/signed?token=super-secret-xyz";
const BOOKMARK = "00000085-0000024e-00004f2e-abc";

/** A dump that satisfies every structural rule, without any real data. */
function validDump(): string {
  const tables = REQUIRED_DUMP_TABLES.map(
    (table) => `CREATE TABLE ${table} (id TEXT PRIMARY KEY);`,
  ).join("\n");
  return `PRAGMA defer_foreign_keys=TRUE;\n${tables}\nINSERT INTO workspaces VALUES('w1');\n`;
}

const bucket = (env as unknown as { BACKUPS: R2Bucket }).BACKUPS;

function backupEnv(overrides: Partial<BackupEnv> = {}): BackupEnv {
  return {
    BACKUPS: bucket,
    BACKUP_WORKFLOW: undefined as unknown as BackupEnv["BACKUP_WORKFLOW"],
    CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID,
    D1_DATABASE_ID: DATABASE_ID,
    D1_DATABASE_NAME: "dalyhub-v2",
    BACKUP_ENVIRONMENT: "production",
    WORKER_COMMIT: "abc1234",
    D1_REST_API_TOKEN: API_TOKEN,
    ...overrides,
  };
}

/**
 * A `WorkflowStep` that simply runs each callback and remembers the step names,
 * so a test can assert which stages were reached before a failure.
 */
function makeStep(): WorkflowStep & { names: string[] } {
  const names: string[] = [];
  const doImpl = async (
    name: string,
    configOrCallback: unknown,
    maybeCallback?: unknown,
  ): Promise<unknown> => {
    names.push(name);
    const callback = (
      typeof configOrCallback === "function" ? configOrCallback : maybeCallback
    ) as () => Promise<unknown>;
    return await callback();
  };
  return {
    names,
    do: doImpl,
    sleep: async () => {},
    sleepUntil: async () => {},
    waitForEvent: async () => {
      throw new Error("not used");
    },
  } as unknown as WorkflowStep & { names: string[] };
}

function makeEvent(
  options: {
    payload?: BackupParams;
    schedule?: { cron: string; scheduledTime: number };
    timestamp?: Date;
    instanceId?: string;
  } = {},
): Readonly<WorkflowEvent<BackupParams>> {
  return {
    payload: options.payload ?? {},
    timestamp: options.timestamp ?? new Date("2026-08-13T16:00:00.000Z"),
    instanceId: options.instanceId ?? "instance-under-test",
    workflowName: "dalyhub-production-backup",
    ...(options.schedule !== undefined ? { schedule: options.schedule } : {}),
  } as Readonly<WorkflowEvent<BackupParams>>;
}

function run(
  workflowEnv: BackupEnv,
  event: Readonly<WorkflowEvent<BackupParams>>,
  step: WorkflowStep,
  options: { pollIntervalMs?: number } = {},
) {
  // The Workflow's logic, called directly. `ProductionBackupWorkflow` is a thin
  // adapter over this function precisely so it can be driven here: the Workers
  // runtime brand-checks `WorkflowEntrypoint`'s constructor, so the class itself
  // cannot be instantiated outside a real Workflow invocation.
  return runProductionBackup(workflowEnv, event, step, options);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const inProgress = () =>
  jsonResponse({
    success: true,
    result: { at_bookmark: BOOKMARK, status: "in-progress", messages: [] },
  });

const complete = () =>
  jsonResponse({
    success: true,
    result: {
      at_bookmark: BOOKMARK,
      status: "complete",
      result: {
        filename: "dalyhub-v2-cf-generated-name.sql",
        signed_url: SIGNED_URL,
      },
    },
  });

/**
 * Stub the export API and the signed download.
 *
 * Responses are FACTORIES, not instances, for two reasons: a `Response` body can
 * only be read once, and the workflow calls the export endpoint at least twice
 * (once to initiate, then once per poll). The last factory is reused once the
 * list is exhausted, which models the real API correctly — an export that has
 * reported `complete` keeps reporting `complete`.
 */
function stubNetwork(options: {
  pollResponses: Array<() => Response>;
  dump?: string | (() => Response);
}) {
  const remaining = [...options.pollResponses];
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith(SIGNED_URL)) {
      const dump = options.dump ?? validDump();
      return typeof dump === "function" ? dump() : new Response(dump);
    }
    const next = remaining.length > 1 ? remaining.shift() : remaining[0];
    if (next === undefined) throw new Error("unexpected extra export poll");
    return next();
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/* -------------------------------------------------------------------------- */

let logs: string[] = [];

beforeEach(async () => {
  logs = [];
  // Capture every log line so leakage can be asserted over the real output.
  vi.spyOn(console, "log").mockImplementation((line: unknown) => {
    logs.push(String(line));
  });
  vi.spyOn(console, "error").mockImplementation((line: unknown) => {
    logs.push(String(line));
  });
  // Isolated bucket per test.
  const existing = await bucket.list({ prefix: "" });
  await Promise.all(
    existing.objects.map((object) => bucket.delete(object.key)),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* The happy path                                                             */
/* -------------------------------------------------------------------------- */

describe("a successful backup", () => {
  it("progresses through the export and stores a verified object", async () => {
    stubNetwork({ pollResponses: [inProgress, complete] });

    const step = makeStep();
    const result = await run(
      backupEnv(),
      makeEvent({
        schedule: {
          cron: "0 16 * * *",
          scheduledTime: Date.parse("2026-08-13T16:00:00.000Z"),
        },
      }),
      step,
    );

    expect(step.names).toEqual([
      "plan",
      "initiate-export",
      "export-and-store",
      "verify-stored-object",
    ]);
    expect(result.key).toBe(
      "production/daily/2026/08/dalyhub-v2-2026-08-13T160000Z.sql",
    );
    expect(result.bytes).toBeGreaterThan(0);
    expect(result.bookmark).toBe(BOOKMARK);

    const stored = await bucket.head(result.key);
    expect(stored).not.toBeNull();
    expect(stored?.size).toBe(result.bytes);
  });

  it("writes the provenance metadata a recovery needs", async () => {
    stubNetwork({ pollResponses: [complete] });
    const result = await run(backupEnv(), makeEvent(), makeStep());

    const stored = await bucket.head(result.key);
    const metadata = stored?.customMetadata ?? {};
    expect(metadata.database).toBe("dalyhub-v2");
    expect(metadata.databaseId).toBe(DATABASE_ID);
    expect(metadata.environment).toBe("production");
    expect(metadata.bookmark).toBe(BOOKMARK);
    expect(metadata.trigger).toBe("manual");
    expect(metadata.retentionDays).toBe("365");
    expect(metadata.sourceFilename).toBe("dalyhub-v2-cf-generated-name.sql");
    expect(metadata.workflowInstanceId).toBe("instance-under-test");
    expect(metadata.workerCommit).toBe("abc1234");
    expect(metadata.backupTimestamp).toBe("2026-08-13T16:00:00.000Z");
    expect(metadata.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("never puts a credential into object metadata", async () => {
    stubNetwork({ pollResponses: [complete] });
    const result = await run(backupEnv(), makeEvent(), makeStep());
    const stored = await bucket.head(result.key);
    const serialised = JSON.stringify(stored?.customMetadata ?? {});
    expect(serialised).not.toContain(API_TOKEN);
    expect(serialised).not.toContain("super-secret-xyz");
    expect(serialised).not.toMatch(/signed_url|signedUrl/i);
  });

  it("stores the dump bytes intact", async () => {
    const dump = validDump();
    stubNetwork({ pollResponses: [complete], dump });
    const result = await run(backupEnv(), makeEvent(), makeStep());

    const object = await bucket.get(result.key);
    expect(await object?.text()).toBe(dump);
  });
});

/* -------------------------------------------------------------------------- */
/* Tier selection                                                             */
/* -------------------------------------------------------------------------- */

describe("trigger tiers", () => {
  it("files a cron-scheduled run under production/daily/", async () => {
    stubNetwork({ pollResponses: [complete] });
    const result = await run(
      backupEnv(),
      makeEvent({
        schedule: {
          cron: "0 16 * * *",
          scheduledTime: Date.parse("2026-08-13T16:00:00.000Z"),
        },
      }),
      makeStep(),
    );
    expect(result.key.startsWith("production/daily/")).toBe(true);
  });

  it("files an operator-triggered run under production/manual/", async () => {
    stubNetwork({ pollResponses: [complete] });
    const result = await run(
      backupEnv(),
      makeEvent({ payload: { trigger: "manual" } }),
      makeStep(),
    );
    expect(result.key.startsWith("production/manual/")).toBe(true);
  });

  it("cannot be told to relabel a scheduled run as manual", async () => {
    // The schedule is the honest signal about what produced the instance. A
    // parameter must not be able to move a nightly backup onto the 365-day
    // retention tier, or the daily series would silently stop expiring.
    stubNetwork({ pollResponses: [complete] });
    const result = await run(
      backupEnv(),
      makeEvent({
        payload: { trigger: "manual" },
        schedule: {
          cron: "0 16 * * *",
          scheduledTime: Date.parse("2026-08-13T16:00:00.000Z"),
        },
      }),
      makeStep(),
    );
    expect(result.key.startsWith("production/daily/")).toBe(true);
  });

  it("names a scheduled backup for its cron slot, not for when it ran", async () => {
    // A run that starts late (or retries) must still file under the slot it
    // belongs to, so the nightly series has exactly one object per night.
    stubNetwork({ pollResponses: [complete] });
    const result = await run(
      backupEnv(),
      makeEvent({
        timestamp: new Date("2026-08-13T16:47:31.000Z"),
        schedule: {
          cron: "0 16 * * *",
          scheduledTime: Date.parse("2026-08-13T16:00:00.000Z"),
        },
      }),
      makeStep(),
    );
    expect(result.key).toContain("2026-08-13T160000Z");
  });
});

/* -------------------------------------------------------------------------- */
/* Failure behaviour — everything fails closed                                */
/* -------------------------------------------------------------------------- */

describe("failure behaviour", () => {
  it("refuses to run without the API-token secret, and names the fix", async () => {
    stubNetwork({ pollResponses: [] });
    const error = await run(
      backupEnv({ D1_REST_API_TOKEN: "" }),
      makeEvent(),
      makeStep(),
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NonRetryableError);
    expect((error as Error).message).toContain("D1_REST_API_TOKEN");
  });

  it("refuses to run against the committed placeholder database id", async () => {
    stubNetwork({ pollResponses: [] });
    const error = await run(
      backupEnv({
        D1_DATABASE_ID: "PLACEHOLDER_SET_REAL_PRODUCTION_D1_DATABASE_ID",
      }),
      makeEvent(),
      makeStep(),
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NonRetryableError);
    expect((error as Error).message).toContain("placeholder");
  });

  it("reports every configuration problem at once", async () => {
    stubNetwork({ pollResponses: [] });
    const error = await run(
      backupEnv({ CLOUDFLARE_ACCOUNT_ID: "", D1_REST_API_TOKEN: "" }),
      makeEvent(),
      makeStep(),
    ).catch((e: unknown) => e);
    expect((error as Error).message).toContain("CLOUDFLARE_ACCOUNT_ID");
    expect((error as Error).message).toContain("D1_REST_API_TOKEN");
  });

  it("treats an authentication failure as permanent", async () => {
    stubNetwork({ pollResponses: [() => new Response("no", { status: 403 })] });
    const error = await run(backupEnv(), makeEvent(), makeStep()).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(NonRetryableError);
  });

  it("treats a server error as transient, so the Workflow retries it", async () => {
    stubNetwork({
      pollResponses: [() => new Response("later", { status: 503 })],
    });
    const error = await run(backupEnv(), makeEvent(), makeStep()).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(NonRetryableError);
  });

  it("refuses a malformed API response", async () => {
    stubNetwork({
      pollResponses: [
        () => jsonResponse({ success: true, result: { nonsense: 1 } }),
      ],
    });
    const error = await run(backupEnv(), makeEvent(), makeStep()).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(NonRetryableError);
    expect((error as Error).message).toMatch(/bookmark/i);
  });

  it("refuses an export that completes with no signed URL", async () => {
    stubNetwork({
      pollResponses: [
        () =>
          jsonResponse({
            success: true,
            result: {
              at_bookmark: BOOKMARK,
              status: "complete",
              result: { filename: "x.sql" },
            },
          }),
      ],
    });
    const error = await run(backupEnv(), makeEvent(), makeStep()).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(NonRetryableError);
    expect((error as Error).message).toMatch(/signed download URL/i);
  });

  it("stores nothing when the download fails", async () => {
    stubNetwork({
      pollResponses: [complete],
      dump: () => new Response("gone", { status: 500 }),
    });
    await run(backupEnv(), makeEvent(), makeStep()).catch(() => {});
    const listed = await bucket.list({ prefix: "production/" });
    expect(listed.objects).toHaveLength(0);
  });

  it("stores nothing when the export is zero bytes", async () => {
    stubNetwork({ pollResponses: [complete], dump: "" });
    const error = await run(backupEnv(), makeEvent(), makeStep()).catch(
      (e: unknown) => e,
    );
    expect((error as Error).message).toMatch(/zero bytes/i);
    const listed = await bucket.list({ prefix: "production/" });
    expect(listed.objects).toHaveLength(0);
  });

  it("refuses a dump that is missing a kernel table, and stores nothing", async () => {
    // A truncated or partial export is the failure that looks fine until the
    // day it is needed. It must never become an object in the bucket.
    const partial =
      "PRAGMA defer_foreign_keys=TRUE;\nCREATE TABLE entities (id TEXT);\n";
    stubNetwork({ pollResponses: [complete], dump: partial });
    const error = await run(backupEnv(), makeEvent(), makeStep()).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(NonRetryableError);
    expect((error as Error).message).toMatch(/workspaces/);
    const listed = await bucket.list({ prefix: "production/" });
    expect(listed.objects).toHaveLength(0);
  });

  it("refuses a dump cut off mid-statement", async () => {
    const truncated = validDump().replace(/;\n$/, "");
    stubNetwork({ pollResponses: [complete], dump: truncated });
    const error = await run(backupEnv(), makeEvent(), makeStep()).catch(
      (e: unknown) => e,
    );
    expect((error as Error).message).toMatch(/complete SQL statement/i);
  });

  it("refuses a download that is not SQL at all", async () => {
    stubNetwork({
      pollResponses: [complete],
      dump: "<html><body>Gateway timeout</body></html>",
    });
    const error = await run(backupEnv(), makeEvent(), makeStep()).catch(
      (e: unknown) => e,
    );
    expect((error as Error).message).toMatch(/does not look like a SQL dump/i);
  });

  it("fails when the export never becomes ready", async () => {
    stubNetwork({
      pollResponses: [inProgress],
    });
    // The poll interval is collapsed: this proves the exhaustion branch, not
    // that JavaScript can sleep.
    const error = await run(backupEnv(), makeEvent(), makeStep(), {
      pollIntervalMs: 1,
    }).catch((e: unknown) => e);
    expect((error as Error).message).toMatch(/still in progress/i);
    // Transient: the step retries and re-polls the same bookmark.
    expect(error).not.toBeInstanceOf(NonRetryableError);
  });

  it("reports a verification failure as a failed backup", async () => {
    stubNetwork({ pollResponses: [complete] });
    const workflowEnv = backupEnv();
    const step = makeStep();

    // Delete the object between the write and the verification, which is the
    // shape of "put() returned but there is no backup".
    const original = step.do.bind(step);
    const spied = async (
      name: string,
      configOrCallback: unknown,
      maybeCallback?: unknown,
    ) => {
      const value = await (
        original as (...args: unknown[]) => Promise<unknown>
      )(name, configOrCallback, maybeCallback);
      if (name === "export-and-store") {
        await bucket.delete((value as { key: string }).key);
      }
      return value;
    };
    (step as unknown as { do: unknown }).do = spied;

    const error = await run(workflowEnv, makeEvent(), step).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(NonRetryableError);
    expect((error as Error).message).toMatch(/does not exist/i);
  });
});

/* -------------------------------------------------------------------------- */
/* Retry safety                                                               */
/* -------------------------------------------------------------------------- */

describe("retry and idempotency", () => {
  it("re-running the same instance reuses the key rather than duplicating", async () => {
    const event = makeEvent({ instanceId: "instance-retry" });

    stubNetwork({ pollResponses: [complete] });
    const first = await run(backupEnv(), event, makeStep());
    vi.unstubAllGlobals();

    stubNetwork({ pollResponses: [complete] });
    const second = await run(backupEnv(), event, makeStep());

    expect(second.key).toBe(first.key);
    const listed = await bucket.list({ prefix: "production/" });
    expect(listed.objects).toHaveLength(1);
  });

  it("refuses to overwrite a backup written by a DIFFERENT instance", async () => {
    stubNetwork({ pollResponses: [complete] });
    await run(
      backupEnv(),
      makeEvent({ instanceId: "instance-one" }),
      makeStep(),
    );
    vi.unstubAllGlobals();

    stubNetwork({ pollResponses: [complete] });
    const error = await run(
      backupEnv(),
      makeEvent({ instanceId: "instance-two" }),
      makeStep(),
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NonRetryableError);
    expect((error as Error).message).toMatch(/refusing to overwrite/i);

    const listed = await bucket.list({ prefix: "production/" });
    expect(listed.objects).toHaveLength(1);
    const stored = await bucket.head(listed.objects[0].key);
    expect(stored?.customMetadata?.workflowInstanceId).toBe("instance-one");
  });
});

/* -------------------------------------------------------------------------- */
/* Secrecy                                                                    */
/* -------------------------------------------------------------------------- */

describe("logging never leaks", () => {
  it("logs each stage without the token, the signed URL or dump contents", async () => {
    const dump = validDump();
    stubNetwork({ pollResponses: [inProgress, complete], dump });
    const result = await run(backupEnv(), makeEvent(), makeStep());

    const output = logs.join("\n");
    // It says the useful things…
    expect(output).toContain('"backup":"started"');
    expect(output).toContain('"backup":"export-bookmark-obtained"');
    expect(output).toContain('"backup":"export-ready"');
    expect(output).toContain('"backup":"stored"');
    expect(output).toContain('"backup":"completed"');
    expect(output).toContain(result.key);
    expect(output).toContain(BOOKMARK);

    // …and none of the dangerous ones.
    expect(output).not.toContain(API_TOKEN);
    expect(output).not.toContain(SIGNED_URL);
    expect(output).not.toContain("super-secret-xyz");
    expect(output).not.toContain("INSERT INTO workspaces");
  });

  it("keeps the token and signed URL out of failure logs and errors", async () => {
    stubNetwork({
      pollResponses: [complete],
      dump: () => new Response("gone", { status: 500 }),
    });
    const error = await run(backupEnv(), makeEvent(), makeStep()).catch(
      (e: unknown) => e,
    );
    const output = `${logs.join("\n")}\n${(error as Error).message}`;
    expect(output).not.toContain(API_TOKEN);
    expect(output).not.toContain("super-secret-xyz");
  });
});
