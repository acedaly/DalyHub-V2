/**
 * BACKUP-02 — the `/settings/backups/:action` route, against the real Workers
 * runtime and D1.
 *
 * This is the boundary the browser actually reaches, so what is asserted here is
 * the security shape rather than the presentation:
 *
 *   - it fails closed without a session — there is no anonymous backup endpoint;
 *   - status is a GET and the trigger is a POST, and neither accepts the other's
 *     method;
 *   - the trigger FORWARDS through the service binding rather than doing anything
 *     itself;
 *   - a service binding that is missing or throwing degrades to "unavailable"
 *     instead of taking the page down;
 *   - and no SQL, signed URL or credential can come back through it.
 *
 * The service binding is injected by assigning onto the runtime `env` the route
 * captured at module load, which is how a production binding would appear.
 */

import { env } from "cloudflare:test";
import { RouterContextProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthenticatedSession } from "~/kernel/auth";
import { setAuthenticatedSession } from "~/platform/request";
import {
  action as backupsAction,
  loader as backupsLoader,
} from "~/modules/settings/routes/backups";

import { ensureWorkspace } from "./support";

const WS = "test-default-workspace";
const OWNER = "owner-subject";

type MutableEnv = Record<string, unknown>;

function authedContext(subject = OWNER): RouterContextProvider {
  const session: AuthenticatedSession = {
    user: { subject, email: "owner@example.com", displayName: null },
    issuedAt: new Date(0),
    expiresAt: new Date(Date.parse("2999-01-01")),
  };
  const context = new RouterContextProvider();
  setAuthenticatedSession(context, session);
  return context;
}

/** A healthy status payload, in the shape the real service returns. */
function statusPayload(overrides: Record<string, unknown> = {}) {
  return {
    available: true,
    health: "healthy",
    reason: "recent_success",
    latestAttempt: null,
    lastSuccessfulBackup: {
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
    },
    retainedBackupCount: 3,
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

/** Install a fake `BACKUP_SERVICE` binding for one test. */
function bindService(binding: unknown): void {
  (env as unknown as MutableEnv).BACKUP_SERVICE = binding;
}

function workingService(overrides: Record<string, unknown> = {}) {
  return {
    status: vi.fn(async () => statusPayload()),
    history: vi.fn(async () => ({
      available: true,
      runs: [statusPayload().lastSuccessfulBackup],
    })),
    trigger: vi.fn(async () => ({
      accepted: true,
      instanceId: "instance-9",
      status: "queued",
    })),
    ...overrides,
  };
}

function get(action: string, context = authedContext()) {
  return backupsLoader({
    request: new Request(`https://dalyhub.test/settings/backups/${action}`),
    params: { action },
    context,
  } as unknown as Parameters<typeof backupsLoader>[0]);
}

function post(action: string, context = authedContext(), method = "POST") {
  return backupsAction({
    request: new Request(`https://dalyhub.test/settings/backups/${action}`, {
      method,
    }),
    params: { action },
    context,
  } as unknown as Parameters<typeof backupsAction>[0]);
}

beforeEach(async () => {
  await ensureWorkspace(WS);
  bindService(workingService());
});

afterEach(() => {
  delete (env as unknown as MutableEnv).BACKUP_SERVICE;
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Authentication                                                             */
/* -------------------------------------------------------------------------- */

describe("authentication", () => {
  it("refuses status without a session", async () => {
    // There is no anonymous backup-status endpoint, by construction.
    await expect(
      get("status", new RouterContextProvider()),
    ).rejects.toBeTruthy();
  });

  it("refuses a manual backup without a session", async () => {
    const service = workingService();
    bindService(service);
    await expect(post("run", new RouterContextProvider())).rejects.toBeTruthy();
    // And crucially: nothing was started.
    expect(service.trigger).not.toHaveBeenCalled();
  });

  it("serves status to the authenticated owner", async () => {
    const response = await get("status");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: { health: string } };
    expect(body.status.health).toBe("healthy");
  });
});

/* -------------------------------------------------------------------------- */
/* Methods and shape                                                          */
/* -------------------------------------------------------------------------- */

describe("methods", () => {
  it("refuses a GET on the trigger", async () => {
    await expect(post("run", authedContext(), "GET")).rejects.toMatchObject({
      status: 405,
    });
  });

  it("refuses an unknown action on both verbs", async () => {
    await expect(get("everything")).rejects.toMatchObject({ status: 404 });
    await expect(post("restore")).rejects.toMatchObject({ status: 404 });
  });

  it("never caches a status response", async () => {
    // A cached "Healthy" is the single most misleading thing this could serve.
    const response = await get("status");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns status, history and the owner's timezone together", async () => {
    const response = await get("status");
    const body = (await response.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["history", "status", "timeZone"]);
    expect(Array.isArray(body.history)).toBe(true);
    expect(typeof body.timeZone).toBe("string");
  });
});

/* -------------------------------------------------------------------------- */
/* Forwarding                                                                 */
/* -------------------------------------------------------------------------- */

describe("the manual trigger", () => {
  it("forwards through the service binding and starts nothing itself", async () => {
    const service = workingService();
    bindService(service);

    const response = await post("run");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      message: "Backup started.",
    });
    expect(service.trigger).toHaveBeenCalledTimes(1);
  });

  it("reports an already-running backup as a conflict, not a failure", async () => {
    bindService(
      workingService({
        trigger: vi.fn(async () => ({
          accepted: false,
          status: "running",
          message: "A backup is already running.",
        })),
      }),
    );
    const response = await post("run");
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      ok: false,
      message: "A backup is already running.",
    });
  });

  it("handles a service binding that throws", async () => {
    bindService(
      workingService({
        trigger: vi.fn(async () => {
          throw new Error("service binding unavailable");
        }),
      }),
    );
    const response = await post("run");
    expect(response.status).toBe(503);
    const body = (await response.json()) as { ok: boolean; message: string };
    expect(body.ok).toBe(false);
    // The thrown detail stays in the logs.
    expect(body.message).not.toContain("service binding unavailable");
  });

  it("handles a missing service binding without throwing", async () => {
    delete (env as unknown as MutableEnv).BACKUP_SERVICE;
    const response = await post("run");
    expect(response.status).toBe(503);
    expect(((await response.json()) as { ok: boolean }).ok).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Degrading safely                                                           */
/* -------------------------------------------------------------------------- */

describe("when the backup service is unreachable", () => {
  it("reports status unavailable rather than failing the page", async () => {
    bindService(
      workingService({
        status: vi.fn(async () => {
          throw new Error("binding is mid-deploy");
        }),
        history: vi.fn(async () => {
          throw new Error("binding is mid-deploy");
        }),
      }),
    );
    const response = await get("status");
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      status: { available: boolean; health: string; reason: string };
      history: unknown[];
    };
    expect(body.status.available).toBe(false);
    expect(body.status.health).toBe("unknown");
    expect(body.status.reason).toBe("unavailable");
    expect(body.history).toEqual([]);
  });

  it("reports unavailable when the binding is absent entirely", async () => {
    // The local-development case, and a production misconfiguration. Same
    // honest surface either way.
    delete (env as unknown as MutableEnv).BACKUP_SERVICE;
    const response = await get("status");
    const body = (await response.json()) as {
      status: { available: boolean; health: string };
    };
    expect(body.status.available).toBe(false);
    expect(body.status.health).toBe("unknown");
  });

  it("never presents a malformed payload as healthy", async () => {
    bindService(
      workingService({
        status: vi.fn(async () => ({ health: "great", available: "yes" })),
      }),
    );
    const response = await get("status");
    const body = (await response.json()) as {
      status: { available: boolean; health: string };
    };
    expect(body.status.available).toBe(false);
    expect(body.status.health).toBe("unknown");
  });
});

/* -------------------------------------------------------------------------- */
/* Leak boundary                                                              */
/* -------------------------------------------------------------------------- */

describe("what cannot come back through this route", () => {
  it("strips anything the service should never have sent", async () => {
    // Defence in depth: even if the backup Worker were changed to include a dump
    // or a credential, the application's own validator drops unknown fields
    // because it rebuilds the payload rather than passing it through.
    bindService(
      workingService({
        status: vi.fn(async () => ({
          ...statusPayload(),
          sql: "CREATE TABLE person_details (email TEXT);",
          signedUrl: "https://r2.example/signed?token=SECRET",
          apiToken: "cfut_secret_value",
        })),
      }),
    );
    const response = await get("status");
    const text = await response.text();

    expect(text).not.toContain("CREATE TABLE");
    expect(text).not.toContain("SECRET");
    expect(text).not.toContain("cfut_secret_value");
    expect(text).not.toContain("signedUrl");
    // The legitimate content still came through.
    expect(text).toContain("healthy");
  });

  it("has no restore, delete or import action at all", async () => {
    for (const forbidden of [
      "restore",
      "delete",
      "purge",
      "import",
      "rollback",
    ]) {
      await expect(post(forbidden)).rejects.toMatchObject({ status: 404 });
    }
  });
});
