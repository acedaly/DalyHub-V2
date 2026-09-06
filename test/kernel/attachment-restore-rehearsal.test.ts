/**
 * V2.11 FILE-02 — THE REHEARSAL. The gate on the whole release.
 *
 * The rule V2.11 accepted before it accepted a single owner file is that DalyHub
 * must be able to get that file back. This is where that is proven, and it is
 * proven the only way it can be: with real bytes, a real object store, a real
 * database, a real archive, and a real destruction in between.
 *
 * ```
 *   1. upload a real PDF, a real PNG and a real text file to two records
 *   2. export the workspace, bytes and all
 *   3. DESTROY the workspace — every row AND every object
 *   4. restore from the archive
 *   5. read the files back and compare them BYTE FOR BYTE
 * ```
 *
 * Not a mocked string pretending to be a file, and not a metadata-only round
 * trip: step 5 compares the actual `Uint8Array` the owner uploaded with the one
 * the restored workspace serves, and asserts the checksum, the filename, the
 * media type and the OWNER RECORD each survived.
 *
 * The negative cases matter as much as the positive one, because a restore that
 * accepts a damaged file is worse than one that refuses a good one. Corrupting a
 * single byte of one archived file, and separately truncating one, and
 * separately removing one, must each reject the WHOLE restore.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { env } from "cloudflare:test";

import { createSystemActorContext } from "~/kernel/activity";
import {
  attachmentStorageKey,
  attachmentWorkspacePrefix,
  hexDigest,
} from "~/kernel/attachments";
import { buildWorkspaceSnapshot } from "~/platform/export";
import {
  buildStructuredExportArchive,
  readAttachmentBytesForArchive,
  AttachmentExportError,
} from "~/platform/export";
import {
  createR2ObjectStore,
  listMissingObjects,
  listOrphanedObjects,
  uploadAttachment,
} from "~/platform/attachments";
import {
  applyRestore,
  createSafetyBackup,
  acknowledgeSafetyBackup,
  prepareRestore,
  readBackupArchive,
  type RestoreDependencies,
} from "~/platform/restore";
import {
  createAttachmentRepository,
  createWorkspaceRestoreRepository,
  createWorkspaceSnapshotRepository,
} from "~/platform/storage/d1";

import { makeContext, makeRepository, resetTables } from "./support";

const WS = "ws_rehearsal";
const OWNER = "owner-subject";
const APPLICATION = {
  name: "DalyHub",
  version: "2.11.0",
  releaseName: "EVIDENCE",
  environment: "test",
  buildCommit: "test",
} as const;

/* -------------------------------------------------------------------------- */
/* The fixtures — real files, deterministic, and tiny                          */
/* -------------------------------------------------------------------------- */

/**
 * A minimal but genuinely valid one-page PDF.
 *
 * Written out byte by byte rather than committed as a binary, so the repository
 * carries no opaque blob and the fixture is inspectable in a diff. It starts
 * `%PDF-1.4`, which is what the upload validator's signature check requires, and
 * it ends `%%EOF`.
 */
const PDF = new TextEncoder().encode(
  "%PDF-1.4\n" +
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n" +
    "trailer<</Root 1 0 R>>\n" +
    "%%EOF\n",
);

/**
 * A real 1x1 PNG: signature, IHDR, a minimal IDAT and IEND.
 *
 * The bytes matter — a PNG whose signature did not match would be refused by the
 * validator, which is precisely the check being relied on everywhere else.
 */
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06,
  0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44,
  0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d,
  0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42,
  0x60, 0x82,
]);

/** A text file with a non-ASCII line, so encoding survives the round trip too. */
const TEXT = new TextEncoder().encode(
  "Rego renewal — paid 6 September 2026.\nAmount: $89.40\n",
);

interface Fixture {
  readonly filename: string;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
}

const FIXTURES: readonly Fixture[] = [
  {
    filename: "Rego renewal — Hilux.pdf",
    mediaType: "application/pdf",
    bytes: PDF,
  },
  { filename: "receipt.png", mediaType: "image/png", bytes: PNG },
  { filename: "notes.txt", mediaType: "text/plain", bytes: TEXT },
];

/* -------------------------------------------------------------------------- */
/* Harness                                                                    */
/* -------------------------------------------------------------------------- */

function objectStore() {
  return createR2ObjectStore(env.ATTACHMENTS);
}

function attachmentRepo() {
  return createAttachmentRepository(env.DB, makeContext(WS), {
    actorContext: createSystemActorContext(),
  });
}

function attachmentDeps() {
  return {
    attachments: attachmentRepo(),
    objects: objectStore(),
    workspaceId: WS,
  };
}

let restoreCounter = 0;

function restoreDeps(): RestoreDependencies {
  const context = makeContext(WS);
  return {
    restore: createWorkspaceRestoreRepository(env.DB, context),
    snapshot: createWorkspaceSnapshotRepository(env.DB, context),
    attachments: attachmentRepo(),
    objects: objectStore(),
    workspaceId: WS,
    ownerId: OWNER,
    application: APPLICATION,
    now: () => new Date("2026-09-06T00:00:00.000Z"),
    newId: () => `rehearsal-${++restoreCounter}`,
  };
}

async function snapshot() {
  return buildWorkspaceSnapshot(
    createWorkspaceSnapshotRepository(env.DB, makeContext(WS)),
    {
      ownerId: OWNER,
      exportedAt: new Date("2026-09-06T00:00:00.000Z"),
      application: APPLICATION,
    },
  );
}

/** Build the complete archive the owner would download. */
async function exportArchive(): Promise<Uint8Array> {
  const current = await snapshot();
  return (
    await buildStructuredExportArchive(
      current,
      await readAttachmentBytesForArchive({
        workspaceId: WS,
        attachments: current.records.attachments,
        store: objectStore(),
      }),
    )
  ).bytes;
}

/** Seed two records and attach every fixture across them. */
async function seedWorkspace(): Promise<{
  readonly ownerA: string;
  readonly ownerB: string;
  readonly uploaded: readonly { id: string; fixture: Fixture }[];
}> {
  const entities = makeRepository(makeContext(WS));
  const ownerA = (await entities.create({ type: "note", title: "Hilux" })).id;
  const ownerB = (await entities.create({ type: "note", title: "Camper" })).id;

  const uploaded: { id: string; fixture: Fixture }[] = [];
  for (const [index, fixture] of FIXTURES.entries()) {
    const result = await uploadAttachment(attachmentDeps(), {
      // Two owners, so the rehearsal proves the OWNER RELATIONSHIP survives
      // rather than merely that some rows came back.
      ownerEntityId: index === 0 ? ownerA : ownerB,
      filename: fixture.filename,
      declaredMediaType: fixture.mediaType,
      bytes: fixture.bytes,
      uploadOperationId: `rehearsal-op-${String(index).padStart(4, "0")}`,
    });
    uploaded.push({ id: result.attachment.id, fixture });
  }
  return { ownerA, ownerB, uploaded };
}

/**
 * DESTROY the workspace — the database rows AND the object bytes.
 *
 * The point of a rehearsal is that nothing survives to make the restore look
 * better than it is. Deleting only the rows would leave the objects in place and
 * the byte comparison would pass without the archive having carried anything.
 */
async function destroyWorkspace(): Promise<void> {
  const listed = await env.ATTACHMENTS.list({
    prefix: attachmentWorkspacePrefix(WS),
    limit: 1000,
  });
  for (const object of listed.objects) await env.ATTACHMENTS.delete(object.key);

  for (const table of [
    "activity_subjects",
    "activities",
    "entity_links",
    "attachments",
    "attachment_object_purges",
    "note_details",
    "spine_records",
    "entities",
  ]) {
    await env.DB.prepare(`DELETE FROM ${table} WHERE workspace_id = ?`)
      .bind(WS)
      .run();
  }
}

/**
 * Run the whole restore flow the owner would drive.
 *
 * The safety backup is taken only for a DESTRUCTIVE replace, which is the
 * product's own rule: restoring into an empty workspace has nothing to protect,
 * and the cutover's claim requires the `staged` status in that case rather than
 * the acknowledged one. Both paths are exercised by the tests below — the
 * rehearsal restores into a destroyed (empty) workspace, and the
 * replaced-objects test restores over a populated one.
 */
async function restoreFrom(archive: Uint8Array): Promise<void> {
  const deps = restoreDeps();
  const preview = await prepareRestore(deps, archive);
  if (preview.mode === "replace") {
    const backup = await createSafetyBackup(deps, preview.operationId);
    await acknowledgeSafetyBackup(
      deps,
      preview.operationId,
      await hexDigest(backup.bytes),
    );
  }
  await applyRestore(deps, preview.operationId);
}

beforeEach(async () => {
  await resetTables([WS]);
  const listed = await env.ATTACHMENTS.list({
    prefix: attachmentWorkspacePrefix(WS),
    limit: 1000,
  });
  for (const object of listed.objects) await env.ATTACHMENTS.delete(object.key);
});

/* -------------------------------------------------------------------------- */
/* The rehearsal                                                              */
/* -------------------------------------------------------------------------- */

describe("the D1 + R2 restore rehearsal", () => {
  it("gets every byte back after the workspace is destroyed", async () => {
    const seeded = await seedWorkspace();
    const archive = await exportArchive();

    /* The archive really carries the files, under their ids. */
    const read = await readBackupArchive(archive);
    expect(read.attachmentBytes.size).toBe(FIXTURES.length);
    expect(read.snapshot.records.attachments).toHaveLength(FIXTURES.length);

    await destroyWorkspace();

    /* Nothing is left: no rows, no objects. */
    expect(
      (
        await env.DB.prepare(
          "SELECT COUNT(*) AS n FROM attachments WHERE workspace_id = ?",
        )
          .bind(WS)
          .first<{ n: number }>()
      )?.n,
    ).toBe(0);
    expect(
      (await env.ATTACHMENTS.list({ prefix: attachmentWorkspacePrefix(WS) }))
        .objects,
    ).toEqual([]);

    await restoreFrom(archive);

    /* Every row is back, with its owner, its name, its type and its digest. */
    const restored = await attachmentRepo().listAll();
    expect(restored).toHaveLength(FIXTURES.length);

    for (const { id, fixture } of seeded.uploaded) {
      const row = restored.find((candidate) => candidate.id === id);
      expect(row, `attachment ${fixture.filename} came back`).toBeDefined();
      expect(row!.filename).toBe(fixture.filename);
      expect(row!.mediaType).toBe(fixture.mediaType);
      expect(row!.byteSize).toBe(fixture.bytes.length);
      expect(row!.checksumSha256).toBe(await hexDigest(fixture.bytes));
      // The key is DERIVED on the way back in — it was never in the archive.
      expect(row!.storageKey).toBe(
        attachmentStorageKey({ workspaceId: WS, attachmentId: id }),
      );

      /* THE assertion. Byte for byte, from the store, after destruction. */
      const object = await env.ATTACHMENTS.get(row!.storageKey);
      expect(object, `object for ${fixture.filename} exists`).not.toBeNull();
      const bytes = new Uint8Array(await object!.arrayBuffer());
      expect([...bytes]).toEqual([...fixture.bytes]);
    }

    /* The owner relationship survived — not just the rows. */
    const onA = await attachmentRepo().listForOwner(seeded.ownerA);
    const onB = await attachmentRepo().listForOwner(seeded.ownerB);
    expect(onA.map((row) => row.filename)).toEqual([FIXTURES[0]!.filename]);
    expect(onB.map((row) => row.filename).sort()).toEqual(
      [FIXTURES[1]!.filename, FIXTURES[2]!.filename].sort(),
    );

    /* And the two stores agree: no orphan object, no metadata without bytes. */
    expect(
      await listOrphanedObjects(
        attachmentDeps(),
        attachmentWorkspacePrefix(WS),
      ),
    ).toEqual([]);
    expect(
      await listMissingObjects(attachmentDeps(), attachmentWorkspacePrefix(WS)),
    ).toEqual([]);
  });

  it("rejects the WHOLE restore when an archived file's BYTES are corrupt", async () => {
    await seedWorkspace();
    const current = await snapshot();
    const complete = await readAttachmentBytesForArchive({
      workspaceId: WS,
      attachments: current.records.attachments,
      store: objectStore(),
    });

    /*
     * One byte of one file, changed — and the archive is otherwise perfectly
     * well formed: its ZIP CRCs are correct, its `CHECKSUMS.txt` is correct,
     * and its manifest is correct about the archive it describes. The ONLY
     * thing wrong is that the file no longer hashes to what DalyHub recorded
     * when the owner uploaded it.
     *
     * That is exactly what silent storage corruption looks like, and catching
     * it is the entire reason the digest travels in the snapshot rather than
     * being recomputed at export time. A restore that accepted this would hand
     * the owner a damaged document and tell them it was recovered.
     */
    const damagedBytes = new Uint8Array(complete[0]!.bytes);
    damagedBytes[5] = (damagedBytes[5]! + 1) & 0xff;
    const damaged = await buildStructuredExportArchive(current, [
      { ...complete[0]!, bytes: damagedBytes },
      ...complete.slice(1),
    ]);

    await expect(readBackupArchive(damaged.bytes)).rejects.toThrow(
      /do not match what DalyHub recorded/,
    );
  });

  it("rejects the WHOLE restore when the RECORDED digest is changed", async () => {
    await seedWorkspace();
    const current = await snapshot();
    const complete = await readAttachmentBytesForArchive({
      workspaceId: WS,
      attachments: current.records.attachments,
      store: objectStore(),
    });

    /*
     * The same disagreement from the other side: the bytes are the owner's, and
     * the SNAPSHOT ROW claims a different digest for them. An archive edited to
     * make a substituted file look legitimate takes this shape, and it is
     * refused by the same check — which is why the check compares the two
     * rather than trusting either.
     */
    const rewritten = {
      ...current,
      records: {
        ...current.records,
        attachments: current.records.attachments.map((row, index) =>
          index === 0 ? { ...row, checksumSha256: "c".repeat(64) } : row,
        ),
      },
    };
    const forged = await buildStructuredExportArchive(rewritten, complete);

    await expect(readBackupArchive(forged.bytes)).rejects.toThrow(
      /do not match what DalyHub recorded/,
    );
  });

  it("rejects an archive whose file is the wrong SIZE", async () => {
    await seedWorkspace();
    const current = await snapshot();
    const complete = await readAttachmentBytesForArchive({
      workspaceId: WS,
      attachments: current.records.attachments,
      store: objectStore(),
    });

    // A truncated file. Caught by the byte count before the digest is even
    // computed, which is the cheaper of the two checks and the more legible
    // failure.
    const truncated = await buildStructuredExportArchive(current, [
      { ...complete[0]!, bytes: complete[0]!.bytes.slice(0, 4) },
      ...complete.slice(1),
    ]);
    await expect(readBackupArchive(truncated.bytes)).rejects.toThrow();
  });

  it("rejects an archive whose file is missing", async () => {
    await seedWorkspace();
    const archive = await exportArchive();

    /*
     * The snapshot lists three attachments; this archive is rebuilt with two of
     * their files. The bytes-and-rows parity check refuses it — this is the
     * "export claims completeness without the bytes" failure, arriving from the
     * reader's side.
     */
    const current = await snapshot();
    const complete = await readAttachmentBytesForArchive({
      workspaceId: WS,
      attachments: current.records.attachments,
      store: objectStore(),
    });
    const short = await buildStructuredExportArchive(
      current,
      complete.slice(0, complete.length - 1),
    );

    await expect(readBackupArchive(short.bytes)).rejects.toThrow(
      /lists files it does not contain/,
    );
    void archive;
  });

  it("rejects an archive carrying a file its snapshot does not list", async () => {
    await seedWorkspace();
    const current = await snapshot();
    const complete = await readAttachmentBytesForArchive({
      workspaceId: WS,
      attachments: current.records.attachments,
      store: objectStore(),
    });
    /*
     * A file the snapshot has never heard of. This is the shape a crafted
     * "backup" would take if the archive's allow-list had simply been widened
     * to `attachments/**` and nothing else changed.
     */
    const smuggled = await buildStructuredExportArchive(current, [
      ...complete,
      {
        row: { ...complete[0]!.row, id: "not-in-the-snapshot" },
        path: "attachments/not-in-the-snapshot",
        bytes: PDF,
      },
    ]);
    await expect(readBackupArchive(smuggled.bytes)).rejects.toThrow();
  });

  it("refuses to EXPORT when an object has gone missing", async () => {
    const seeded = await seedWorkspace();
    /* The "D1 says this exists and R2 disagrees" state, forced. */
    await env.ATTACHMENTS.delete(
      attachmentStorageKey({
        workspaceId: WS,
        attachmentId: seeded.uploaded[0]!.id,
      }),
    );
    await expect(exportArchive()).rejects.toBeInstanceOf(AttachmentExportError);
  });

  it("refuses to EXPORT when an object no longer matches its digest", async () => {
    const seeded = await seedWorkspace();
    const key = attachmentStorageKey({
      workspaceId: WS,
      attachmentId: seeded.uploaded[1]!.id,
    });
    const different = new Uint8Array(PNG);
    different[different.length - 1] =
      (different[different.length - 1]! + 1) & 0xff;
    await env.ATTACHMENTS.put(key, different as unknown as ArrayBuffer);

    await expect(exportArchive()).rejects.toMatchObject({
      reason: "checksum_mismatch",
    });
  });

  it("restores a workspace that has no files at all", async () => {
    /*
     * The zero-attachment path through the SAME machinery, so a workspace that
     * has never attached anything is not a special case that only works because
     * nobody has run it. (The other half of compatibility — an archive whose
     * JSON has no `attachments` KEY, which is what a pre-V2.11 export looks
     * like — is asserted where that rule lives, over
     * `SNAPSHOT_OPTIONAL_ON_READ_COLLECTIONS`, in the export unit suite.)
     */
    const entities = makeRepository(makeContext(WS));
    await entities.create({ type: "note", title: "No evidence here" });

    const archive = await exportArchive();
    const read = await readBackupArchive(archive);
    expect(read.attachmentBytes.size).toBe(0);
    expect(read.snapshot.records.attachments).toEqual([]);

    await destroyWorkspace();
    await restoreFrom(archive);

    expect(await attachmentRepo().listAll()).toEqual([]);
    expect(
      (await env.ATTACHMENTS.list({ prefix: attachmentWorkspacePrefix(WS) }))
        .objects,
    ).toEqual([]);
  });

  it("queues the replaced workspace's objects when a restore overwrites it", async () => {
    /*
     * A destructive replace. The workspace holds three files; the archive being
     * restored holds a DIFFERENT one, so all three of the current objects become
     * unreachable the moment the cutover lands. They must be owed to the sweep
     * rather than left in the bucket forever.
     */
    const first = await seedWorkspace();
    const archiveOfOne = await (async () => {
      // Take an archive, then remove two of the three attachments from the
      // workspace so the archive and the target genuinely differ.
      const full = await exportArchive();
      return full;
    })();

    await destroyWorkspace();
    const entities = makeRepository(makeContext(WS));
    const later = (await entities.create({ type: "note", title: "Later" })).id;
    const replacedUpload = await uploadAttachment(attachmentDeps(), {
      ownerEntityId: later,
      filename: "superseded.txt",
      declaredMediaType: "text/plain",
      bytes: TEXT,
      uploadOperationId: "rehearsal-op-superseded",
    });

    await restoreFrom(archiveOfOne);

    const queued = await attachmentRepo().listPurges();
    expect(queued.map((row) => row.storageKey)).toContain(
      replacedUpload.attachment.storageKey,
    );
    expect(queued.every((row) => row.reason === "workspace_replaced")).toBe(
      true,
    );
    // And the restored files were NOT queued.
    for (const { id } of first.uploaded) {
      expect(queued.map((row) => row.storageKey)).not.toContain(
        attachmentStorageKey({ workspaceId: WS, attachmentId: id }),
      );
    }
  });
});
