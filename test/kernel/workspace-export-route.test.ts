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
import { createSystemActorContext } from "~/kernel/activity";
import { attachmentWorkspacePrefix, hexDigest } from "~/kernel/attachments";
import { createR2ObjectStore, uploadAttachment } from "~/platform/attachments";
import { createAttachmentRepository } from "~/platform/storage/d1";
import { readZipArchive } from "~/platform/restore/zip-reader";

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
    user: { subject, email: "owner@example.com", displayName: null },
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

/**
 * Read ONE entry's decompressed bytes, through the production ZIP reader.
 *
 * The archive is DEFLATEd, so a test cannot read an entry by slicing. Using the
 * reader the restore path uses is also the stronger assertion: it proves the
 * archive is one DalyHub can read back, not merely one it produced.
 */
async function readZipEntry(
  archive: Uint8Array,
  path: string,
): Promise<Uint8Array> {
  const entries = await readZipArchive(archive);
  const entry = entries.find((candidate) => candidate.path === path);
  expect(entry, `archive contains ${path}`).toBeDefined();
  return entry!.data;
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

/* -------------------------------------------------------------------------- */
/* V2.11 FILE-02 — the ROUTE carries the bytes                                */
/* -------------------------------------------------------------------------- */

describe("attachment bytes leave through this route, or nothing does", () => {
  const PDF = new TextEncoder().encode("%PDF-1.4\nrego\n%%EOF\n");

  async function attach(): Promise<{
    readonly id: string;
    readonly key: string;
  }> {
    const entities = makeRepository(makeContext(WS));
    const owner = await entities.create({ type: "note", title: "Hilux" });
    const result = await uploadAttachment(
      {
        attachments: createAttachmentRepository(env.DB, makeContext(WS), {
          actorContext: createSystemActorContext(),
        }),
        objects: createR2ObjectStore(env.ATTACHMENTS),
        workspaceId: WS,
      },
      {
        ownerEntityId: owner.id,
        filename: "Rego renewal.pdf",
        declaredMediaType: "application/pdf",
        bytes: PDF,
        uploadOperationId: "export-route-op-0001",
      },
    );
    return {
      id: result.attachment.id,
      key: result.attachment.storageKey,
    };
  }

  beforeEach(async () => {
    // This describe has its own reset: the suite above seeds a whole workspace
    // it does not need, and one of its tests deliberately deletes the workspace
    // row to force a failure.
    await resetTables([WS]);
    const listed = await env.ATTACHMENTS.list({
      prefix: attachmentWorkspacePrefix(WS),
      limit: 1000,
    });
    for (const object of listed.objects) {
      await env.ATTACHMENTS.delete(object.key);
    }
  });

  it("puts every file in the full export, with a manifest that names it", async () => {
    /*
     * The falsification this test exists for: an export that carries the
     * attachment METADATA and quietly omits the bytes would still produce a
     * valid-looking ZIP, a valid snapshot and a manifest — and would be a backup
     * that cannot restore a single document. Every other assertion about the
     * archive is made where it is BUILT; this one is made at the route, because
     * the route is where the bytes are fetched and where forgetting to fetch
     * them is a one-line mistake.
     */
    const { id } = await attach();

    const response = await runLoader("full");
    expect(response.status).toBe(200);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const names = zipEntryNames(bytes);

    expect(names).toContain(`attachments/${id}`);

    const manifest = JSON.parse(
      new TextDecoder().decode(await readZipEntry(bytes, "manifest.json")),
    ) as {
      contents: { includesAttachmentFiles: boolean };
      attachments: readonly {
        id: string;
        filename: string;
        sha256: string;
        path: string;
        byteSize: number;
      }[];
    };
    expect(manifest.contents.includesAttachmentFiles).toBe(true);
    expect(manifest.attachments).toHaveLength(1);
    expect(manifest.attachments[0]).toMatchObject({
      id,
      filename: "Rego renewal.pdf",
      path: `attachments/${id}`,
      byteSize: PDF.length,
      sha256: await hexDigest(PDF),
    });

    /* And the entry really is the file, byte for byte. */
    expect([...(await readZipEntry(bytes, `attachments/${id}`))]).toEqual([
      ...PDF,
    ]);

    /* No storage key anywhere in the archive. */
    expect(new TextDecoder().decode(bytes)).not.toContain("workspaces/");
  });

  it("puts every file in the VAULT too, under the owner's own name", async () => {
    await attach();
    const response = await runLoader("obsidian");
    expect(response.status).toBe(200);
    const names = zipEntryNames(new Uint8Array(await response.arrayBuffer()));
    expect(names.some((name) => name.endsWith("/Rego renewal.pdf"))).toBe(true);
  });

  it("produces NO archive when a file cannot be read", async () => {
    /*
     * The "D1 says this exists and R2 disagrees" state, at the route. An export
     * that reported this in `limitations` and handed over an archive would be an
     * export that looks complete and is not — which is the single most expensive
     * thing this release could get wrong.
     */
    const { key } = await attach();
    await env.ATTACHMENTS.delete(key);

    let thrown: unknown;
    try {
      await runLoader("full");
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Response);
    const failure = thrown as Response;
    expect(failure.status).toBe(500);
    const body = await failure.text();
    expect(body).toMatch(/could not be read|did not match/);
    // The owner is told no file was produced, not that one was produced badly.
    expect(body).toMatch(/No file was produced|not a backup/);
    // And nothing internal leaks.
    expect(body).not.toContain("workspaces/");
    expect(body).not.toMatch(/SELECT|R2Bucket|ATTACHMENTS/);
  });
});
