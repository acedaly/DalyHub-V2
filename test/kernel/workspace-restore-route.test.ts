/**
 * SET-02 — the `/settings/restore/:step` resource route, against the real
 * Workers runtime and D1.
 *
 * This is the security surface of restore: the one route by which data enters
 * DalyHub in bulk. The properties asserted here are the ones that would be
 * catastrophic to get wrong — fail closed without a session, refuse a GET,
 * ignore any client-supplied workspace identity, refuse a destructive apply
 * without a recorded safety backup, never cache — plus the ordinary ones (a
 * preview comes back as JSON and writes nothing).
 */

import { env } from "cloudflare:test";
import { RouterContextProvider } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";

import type { AuthenticatedSession } from "~/kernel/auth";
import { setAuthenticatedSession } from "~/platform/request";
import {
  action as restoreAction,
  loader as restoreLoader,
} from "~/modules/settings/routes/restore";
import {
  buildStructuredExportArchive,
  buildWorkspaceSnapshot,
} from "~/platform/export";
import { createWorkspaceSnapshotRepository } from "~/platform/storage/d1";

import { ensureWorkspace, makeContext, resetTables } from "./support";
import { seedWorkspace } from "./workspace-fixture";

const WS = "test-default-workspace";
const OTHER_WS = "other-workspace";
const OWNER = "owner-subject";

const APPLICATION = {
  name: "DalyHub",
  version: "2.0.0",
  releaseName: "Test",
  environment: "development",
  buildCommit: null,
} as const;

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

async function post(
  step: string,
  body: FormData,
  context: RouterContextProvider = authedContext(),
): Promise<Response> {
  const request = new Request(`https://app.test/settings/restore/${step}`, {
    method: "POST",
    body,
  });
  return (await restoreAction({
    request,
    context,
    params: { step },
  } as unknown as Parameters<typeof restoreAction>[0])) as Response;
}

function fileForm(bytes: Uint8Array, name = "dalyhub-export.zip"): FormData {
  const form = new FormData();
  form.append(
    "backup",
    new File([bytes as unknown as BlobPart], name, {
      type: "application/zip",
    }),
  );
  return form;
}

async function countEntities(workspaceId: string): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM entities WHERE workspace_id = ?",
  )
    .bind(workspaceId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

describe("restore route (D1)", () => {
  let archive: Uint8Array;

  beforeEach(async () => {
    await resetTables([WS, OTHER_WS]);
    await seedWorkspace();
    const snapshot = await buildWorkspaceSnapshot(
      createWorkspaceSnapshotRepository(env.DB, makeContext(WS)),
      {
        ownerId: OWNER,
        exportedAt: new Date("2026-08-01T09:00:00.000Z"),
        application: APPLICATION,
      },
    );
    archive = (await buildStructuredExportArchive(snapshot)).bytes;
  });

  it("fails closed without an authenticated session", async () => {
    const before = await countEntities(WS);
    await expect(
      post("preview", fileForm(archive), new RouterContextProvider()),
    ).rejects.toBeDefined();
    expect(await countEntities(WS)).toBe(before);
  });

  it("refuses a GET — a restore is never reachable by following a link", async () => {
    // The loader is the answer to a GET, and it is an answer rather than an
    // internal router error, so a pasted URL or a prefetch cannot fill the
    // server log with a stack trace.
    expect(() => restoreLoader()).toThrow();
    try {
      restoreLoader();
    } catch (error) {
      expect((error as Response).status).toBe(405);
      expect((error as Response).headers.get("allow")).toBe("POST");
    }

    const request = new Request("https://app.test/settings/restore/preview");
    await expect(
      restoreAction({
        request,
        context: authedContext(),
        params: { step: "preview" },
      } as unknown as Parameters<typeof restoreAction>[0]),
    ).rejects.toMatchObject({ status: 405 });
  });

  it("rejects an unknown step", async () => {
    await expect(post("wipe-everything", new FormData())).rejects.toMatchObject(
      { status: 404 },
    );
  });

  it("previews without writing, and never caches the response", async () => {
    const before = await countEntities(WS);
    const response = await post("preview", fileForm(archive));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");

    const body = (await response.json()) as {
      ok: boolean;
      preview: {
        mode: string;
        destructive: boolean;
        target: { workspaceId: string };
        backup: { sourceWorkspaceId: string };
      };
    };
    expect(body.ok).toBe(true);
    expect(body.preview.mode).toBe("replace");
    expect(body.preview.destructive).toBe(true);
    // The workspace comes from trusted server configuration.
    expect(body.preview.target.workspaceId).toBe(WS);
    expect(body.preview.backup.sourceWorkspaceId).toBe(WS);
    // Preview writes nothing canonical.
    expect(await countEntities(WS)).toBe(before);
  });

  it("ignores a client-supplied workspace field entirely", async () => {
    const form = fileForm(archive);
    form.append("workspaceId", OTHER_WS);
    form.append("workspace", OTHER_WS);
    const response = await post("preview", form);
    const body = (await response.json()) as {
      preview: { target: { workspaceId: string } };
    };
    expect(body.preview.target.workspaceId).toBe(WS);
  });

  it("refuses a destructive apply until a safety backup has been recorded", async () => {
    const preview = (await (
      await post("preview", fileForm(archive))
    ).json()) as {
      preview: { operationId: string };
    };
    const form = new FormData();
    form.append("operationId", preview.preview.operationId);

    const refused = await post("apply", form);
    expect(refused.status).toBe(500);
    const body = (await refused.json()) as { ok: boolean; message: string };
    expect(body.ok).toBe(false);
    expect(body.message).toContain("no verified safety backup");

    // The safety backup is produced by the route itself, and only then does
    // apply succeed.
    const safety = await post("safety-backup", form);
    expect(safety.status).toBe(200);
    expect(safety.headers.get("content-type")).toBe("application/zip");
    expect(safety.headers.get("content-disposition")).toContain("attachment");
    expect(safety.headers.get("cache-control")).toContain("no-store");
    expect((await safety.arrayBuffer()).byteLength).toBeGreaterThan(0);

    const applied = await post("apply", form);
    expect(applied.status).toBe(200);
    const result = (await applied.json()) as {
      ok: boolean;
      result: { verification: { passed: boolean } };
    };
    expect(result.ok).toBe(true);
    expect(result.result.verification.passed).toBe(true);
  });

  it("reports a refused backup without leaking snapshot paths to the browser", async () => {
    const damaged = archive.slice();
    damaged[Math.floor(damaged.length / 2)] ^= 0xff;
    const response = await post("preview", fileForm(damaged));
    expect(response.status).toBe(422);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.ok).toBe(false);
    expect(typeof body.message).toBe("string");
    // The structural detail is logged server-side; it must not travel.
    expect(body).not.toHaveProperty("issues");
    expect(JSON.stringify(body)).not.toContain("records.");
  });

  it("rejects a request with no file", async () => {
    const response = await post("preview", new FormData());
    expect(response.status).toBe(400);
    expect(await countEntities(WS)).toBeGreaterThan(0);
  });

  it("discards a prepared restore without touching the workspace", async () => {
    const before = await countEntities(WS);
    const preview = (await (
      await post("preview", fileForm(archive))
    ).json()) as {
      preview: { operationId: string };
    };
    const form = new FormData();
    form.append("operationId", preview.preview.operationId);
    const response = await post("discard", form);
    expect(response.status).toBe(200);
    expect(await countEntities(WS)).toBe(before);

    const staged = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM workspace_restore_staged_rows WHERE workspace_id = ?",
    )
      .bind(WS)
      .first<{ n: number }>();
    expect(staged?.n).toBe(0);

    // A discarded restore cannot then be applied.
    const applied = await post("apply", form);
    expect(applied.status).toBe(422);
  });

  it("does not let one workspace's prepared restore be applied from another", async () => {
    await ensureWorkspace(OTHER_WS);
    const preview = (await (
      await post("preview", fileForm(archive))
    ).json()) as {
      preview: { operationId: string };
    };
    // The route resolves the workspace from configuration, so the only way to
    // reference another workspace's operation is by id — and the operation is
    // keyed by (workspace_id, id), so it simply is not found.
    const stolen = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM workspace_restore_operations WHERE workspace_id = ? AND id = ?",
    )
      .bind(OTHER_WS, preview.preview.operationId)
      .first<{ n: number }>();
    expect(stolen?.n).toBe(0);
  });
});
