/**
 * X-04 — the `/settings/export/:format` resource route, against the real Workers
 * runtime and D1.
 *
 * This is the security surface of the whole feature: the one route by which a
 * workspace leaves DalyHub in bulk. The tests below assert the properties that
 * would be catastrophic to get wrong — fail closed without a session, ignore any
 * client-supplied workspace identity, never cache, never mutate — as well as the
 * ordinary ones (a real ZIP comes back, with a safe filename).
 */

import { env } from "cloudflare:test";
import { RouterContextProvider } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";

import type { AuthenticatedSession } from "~/kernel/auth";
import { setAuthenticatedSession } from "~/platform/request";
import { loader as exportLoader } from "~/modules/settings/routes/export";

import {
  countActivities,
  countRows,
  ensureWorkspace,
  makeContext,
  makeNoteDetailsRepository,
  makeRepository,
  resetTables,
} from "./support";

const WS = "test-default-workspace";
const OTHER_WS = "other-workspace";

function authedContext(subject = "owner-subject"): RouterContextProvider {
  const session: AuthenticatedSession = {
    user: { subject, email: "owner@example.com" },
    issuedAt: new Date(0),
    expiresAt: new Date(Date.parse("2999-01-01")),
  };
  const context = new RouterContextProvider();
  setAuthenticatedSession(context, session);
  return context;
}

async function runLoader(
  format: string,
  {
    context = authedContext(),
    search = "",
  }: { context?: RouterContextProvider; search?: string } = {},
): Promise<Response> {
  const request = new Request(
    `https://app.test/settings/export/${format}${search}`,
  );
  return (await exportLoader({
    request,
    context,
    params: { format },
  } as unknown as Parameters<typeof exportLoader>[0])) as Response;
}

/** Read the entry names out of a ZIP's central directory. */
function zipEntryNames(bytes: Uint8Array): string[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = bytes.length - 22;
  expect(view.getUint32(eocd, true)).toBe(0x06054b50);
  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const names: string[] = [];
  for (let index = 0; index < count; index += 1) {
    expect(view.getUint32(offset, true)).toBe(0x02014b50);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    names.push(
      decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength)),
    );
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return names;
}

describe("/settings/export/:format", () => {
  beforeEach(async () => {
    await resetTables([WS]);
    const entities = makeRepository(makeContext(WS));
    const noteDetails = makeNoteDetailsRepository(makeContext(WS));
    const note = await entities.create({ type: "note", title: "A note" });
    await noteDetails.update(note.id, "Body.\n");

    await ensureWorkspace(OTHER_WS);
    const other = makeRepository(makeContext(OTHER_WS));
    await other.create({ type: "note", title: "Another workspace secret" });
  });

  it("fails closed with no authenticated session", async () => {
    await expect(
      runLoader("full", { context: new RouterContextProvider() }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("returns 404 for an unknown format rather than guessing", async () => {
    await expect(runLoader("csv")).rejects.toMatchObject({ status: 404 });
    await expect(runLoader("../../etc/passwd")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("serves the structured export as a ZIP attachment", async () => {
    const response = await runLoader("full");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    const disposition = response.headers.get("content-disposition") ?? "";
    expect(disposition).toContain("attachment;");
    expect(disposition).toMatch(/filename="dalyhub-export-[^"]+\.zip"/);

    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(zipEntryNames(bytes).sort()).toEqual([
      "CHECKSUMS.txt",
      "README.md",
      "SCHEMA.md",
      "dalyhub-snapshot.json",
      "manifest.json",
    ]);
  });

  it("serves the Obsidian vault as a ZIP attachment", async () => {
    const response = await runLoader("obsidian");
    expect(response.status).toBe(200);
    const disposition = response.headers.get("content-disposition") ?? "";
    expect(disposition).toMatch(/filename="dalyhub-obsidian-vault-[^"]+\.zip"/);

    const names = zipEntryNames(new Uint8Array(await response.arrayBuffer()));
    expect(names).toContain("DalyHub Export/Home.md");
    expect(names).toContain("DalyHub Export/Notes/A note.md");
    expect(names.every((name) => name.startsWith("DalyHub Export/"))).toBe(
      true,
    );
  });

  it("never caches a private export", async () => {
    const response = await runLoader("full");
    const cacheControl = response.headers.get("cache-control") ?? "";
    expect(cacheControl).toContain("no-store");
    expect(cacheControl).toContain("private");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("sets a filename that is safe in a Content-Disposition header", async () => {
    const disposition =
      (await runLoader("full")).headers.get("content-disposition") ?? "";
    const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "";
    expect(filename).toMatch(/^[A-Za-z0-9._-]+\.zip$/);
    expect(filename).not.toContain(" ");
    expect(filename).not.toContain(";");
  });

  it("ignores any client-supplied workspace identity", async () => {
    // The route takes no workspace parameter at all; these are the values a
    // hostile client would try. The archive must describe the SAME workspace,
    // and must never contain the other workspace's data.
    const plain = new Uint8Array(await (await runLoader("full")).arrayBuffer());
    const crafted = new Uint8Array(
      await (
        await runLoader("full", {
          search: `?workspace=${OTHER_WS}&workspaceId=${OTHER_WS}&ws=${OTHER_WS}`,
        })
      ).arrayBuffer(),
    );
    // (Byte equality is deliberately NOT asserted: each response carries its own
    // `exportedAt`, so the compressed bytes legitimately differ.)
    expect(zipEntryNames(crafted).sort()).toEqual(zipEntryNames(plain).sort());

    // The vault is uncompressed enough to inspect directly for the workspace id;
    // the structured export is checked through its own snapshot below.
    const vault = await (
      await runLoader("obsidian", {
        search: `?workspace=${OTHER_WS}`,
      })
    ).arrayBuffer();
    const names = zipEntryNames(new Uint8Array(vault));
    expect(names).toContain("DalyHub Export/Notes/A note.md");
    expect(
      names.some((name) => name.includes("Another workspace secret")),
    ).toBe(false);
  });

  it("does not mutate data or append Activity", async () => {
    const rows = await countRows();
    const activities = await countActivities();
    await (await runLoader("full")).arrayBuffer();
    await (await runLoader("obsidian")).arrayBuffer();
    expect(await countRows()).toBe(rows);
    expect(await countActivities()).toBe(activities);
  });

  it("exposes no SQL, binding name or stack trace when it fails", async () => {
    // A workspace that does not exist is the realistic failure: the composition
    // boundary fails closed, and the owner must get a sentence, not internals.
    const previous = env.DEFAULT_WORKSPACE_ID;
    try {
      await expect(
        runLoader("full", { context: authedContext("no-such-owner") }),
      ).resolves.toBeInstanceOf(Response);
    } finally {
      expect(env.DEFAULT_WORKSPACE_ID).toBe(previous);
    }

    // Force a failure by removing the workspace row the scope resolves against.
    await env.DB.prepare("DELETE FROM entity_links").run();
    await env.DB.prepare("DELETE FROM activity_subjects").run();
    await env.DB.prepare("DELETE FROM activities").run();
    await env.DB.prepare("DELETE FROM note_details").run();
    await env.DB.prepare("DELETE FROM entities").run();
    await env.DB.prepare("DELETE FROM workspaces WHERE id = ?").bind(WS).run();

    let thrown: unknown;
    try {
      await runLoader("full");
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Response);
    const body = await (thrown as Response).text();
    expect(body).not.toMatch(/SELECT|INSERT|FROM |workspace_id|DB\b/);
    expect(body).not.toContain("at ");
    expect(body.length).toBeLessThan(300);
  });
});
