/**
 * V2.11 FILE-02 — the archive path rule, and what it will and will not accept.
 *
 * The restore reader's file allow-list stopped being an exact set of five names
 * and became "those five, plus this prefix". That is a real loosening, and this
 * is where its bound is stated: `attachments/<id>` and nothing else — no nested
 * path, no traversal, no bare folder, no sibling that merely starts with the
 * same letters.
 *
 * The other half of the defence is elsewhere and stays there: `assertSafeZipPath`
 * refuses traversal and control characters for EVERY entry, `MAX_ENTRIES` bounds
 * the count, and the reader's parity check refuses any attachment entry the
 * snapshot does not name. This file covers the one rule that is new.
 */

import { describe, expect, it } from "vitest";

import {
  ARCHIVE_ATTACHMENT_FOLDER,
  archiveAttachmentPath,
  attachmentIdFromArchivePath,
  describeArchivedAttachments,
  isArchiveAttachmentPath,
  readAttachmentBytesForArchive,
  AttachmentExportError,
} from "~/platform/export";
import {
  attachmentStorageKey,
  createInMemoryObjectStore,
  hexDigest,
  MAX_ATTACHMENTS_PER_ARCHIVE,
  type StoredObjectInfo,
} from "~/kernel/attachments";
import type { SnapshotAttachment } from "~/kernel/export";

const WS = "ws-archive";
const BYTES = new TextEncoder().encode("%PDF-1.4\nevidence\n%%EOF\n");

async function row(
  id: string,
  overrides: Partial<SnapshotAttachment> = {},
): Promise<SnapshotAttachment> {
  return {
    id,
    ownerEntityId: "owner-1",
    filename: "policy.pdf",
    mediaType: "application/pdf",
    byteSize: BYTES.length,
    checksumSha256: await hexDigest(BYTES),
    uploadOperationId: `op-${id}`,
    uploadedBy: null,
    createdAt: "2026-09-06T00:00:00.000Z",
    ...overrides,
  };
}

async function storeWith(
  ids: readonly string[],
  bytes: Uint8Array = BYTES,
): Promise<ReturnType<typeof createInMemoryObjectStore>> {
  const store = createInMemoryObjectStore();
  for (const id of ids) {
    await store.put(
      attachmentStorageKey({ workspaceId: WS, attachmentId: id }),
      bytes,
      { checksumSha256: await hexDigest(bytes), mediaType: "application/pdf" },
    );
  }
  return store;
}

describe("the archive path is derived from the id and nothing else", () => {
  it("names the entry by attachment id", () => {
    expect(archiveAttachmentPath("att-1")).toBe("attachments/att-1");
    expect(ARCHIVE_ATTACHMENT_FOLDER).toBe("attachments");
  });

  it("round-trips an id through the path", () => {
    expect(attachmentIdFromArchivePath(archiveAttachmentPath("abc-123"))).toBe(
      "abc-123",
    );
  });

  it("accepts exactly `attachments/<id>` and nothing else", () => {
    expect(isArchiveAttachmentPath("attachments/att-1")).toBe(true);

    for (const path of [
      "attachments",
      "attachments/",
      "attachments/nested/file.pdf",
      "attachmentsfoo/att-1",
      "other/attachments/att-1",
      "../attachments/att-1",
      "dalyhub-snapshot.json",
      "",
    ]) {
      expect(isArchiveAttachmentPath(path), path).toBe(false);
      expect(attachmentIdFromArchivePath(path), path).toBeNull();
    }
  });
});

describe("reading bytes for an archive verifies every one", () => {
  it("reads nothing when there is nothing, even with no store bound", async () => {
    expect(
      await readAttachmentBytesForArchive({
        workspaceId: WS,
        attachments: [],
        store: null,
      }),
    ).toEqual([]);
  });

  it("refuses when there are files and no store to read them from", async () => {
    await expect(
      readAttachmentBytesForArchive({
        workspaceId: WS,
        attachments: [await row("att-1")],
        store: null,
      }),
    ).rejects.toMatchObject({ reason: "unavailable" });
  });

  it("refuses when an object is missing", async () => {
    await expect(
      readAttachmentBytesForArchive({
        workspaceId: WS,
        attachments: [await row("att-1")],
        store: await storeWith([]),
      }),
    ).rejects.toMatchObject({ reason: "object_missing" });
  });

  it("refuses when the stored bytes do not match the recorded digest", async () => {
    await expect(
      readAttachmentBytesForArchive({
        workspaceId: WS,
        attachments: [await row("att-1", { checksumSha256: "f".repeat(64) })],
        store: await storeWith(["att-1"]),
      }),
    ).rejects.toMatchObject({ reason: "checksum_mismatch" });
  });

  it("refuses when the stored bytes are the wrong length", async () => {
    await expect(
      readAttachmentBytesForArchive({
        workspaceId: WS,
        attachments: [await row("att-1", { byteSize: 1 })],
        store: await storeWith(["att-1"]),
      }),
    ).rejects.toMatchObject({ reason: "checksum_mismatch" });
  });

  it("refuses a workspace with more files than one archive can carry", async () => {
    const rows = await Promise.all(
      Array.from({ length: MAX_ATTACHMENTS_PER_ARCHIVE + 1 }, (_, index) =>
        row(`att-${index}`),
      ),
    );
    await expect(
      readAttachmentBytesForArchive({
        workspaceId: WS,
        attachments: rows,
        store: await storeWith([]),
      }),
    ).rejects.toBeInstanceOf(AttachmentExportError);
  });

  it("reads at the DERIVED key, so no archive needs to carry one", async () => {
    const store = await storeWith(["att-1"]);
    const keys: string[] = [];
    const watched = {
      ...store,
      async get(key: string) {
        keys.push(key);
        return store.get(key);
      },
      async list(prefix: string): Promise<readonly StoredObjectInfo[]> {
        return store.list(prefix);
      },
    };
    await readAttachmentBytesForArchive({
      workspaceId: WS,
      attachments: [await row("att-1")],
      store: watched,
    });
    expect(keys).toEqual([
      attachmentStorageKey({ workspaceId: WS, attachmentId: "att-1" }),
    ]);
  });
});

describe("the manifest section", () => {
  it("names the file, its type, its size, its digest and its path — and no key", async () => {
    const archived = await readAttachmentBytesForArchive({
      workspaceId: WS,
      attachments: [await row("att-1", { filename: "Rego — 2026.pdf" })],
      store: await storeWith(["att-1"]),
    });
    const described = describeArchivedAttachments(archived);
    expect(described).toEqual([
      {
        id: "att-1",
        filename: "Rego — 2026.pdf",
        mediaType: "application/pdf",
        byteSize: BYTES.length,
        sha256: await hexDigest(BYTES),
        path: "attachments/att-1",
      },
    ]);
    /*
     * The claim that makes an archive portable: nothing here, and nothing in the
     * snapshot row it was built from, is a storage key.
     */
    expect(JSON.stringify(described)).not.toContain("workspaces/");
  });
});
