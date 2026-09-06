/**
 * V2.11 FILE-00 — attachments against the REAL database AND the REAL object
 * store (Workers runtime, isolated D1, isolated local R2, committed migrations
 * applied).
 *
 * These prove the guarantees the release rests on. Each of them is a claim the
 * schema, a transaction or the compensation ordering makes — not one the
 * interface merely promises:
 *
 *   - an attachment CANNOT exist without an owner, and the database is what
 *     says so;
 *   - workspace isolation is absolute in both stores: a foreign id reads as
 *     absent, a foreign owner cannot be written, and two workspaces get
 *     different object keys;
 *   - the bytes go back byte-for-byte, and the digest is verified on the way
 *     out as well as on the way in;
 *   - a retried upload produces ONE attachment and leaves NO orphan object;
 *   - a failed metadata write leaves no object behind, and a failed OBJECT
 *     delete leaves a ledger row rather than a silent orphan;
 *   - deleting a record's evidence is one batch that removes the row and owes
 *     the bytes to the sweep in the same transaction;
 *   - the per-record evidence read is ONE statement, however many records or
 *     files are involved.
 *
 * The object store here is the pool's own local R2 bucket, not a stub. The
 * write path relies on R2 verifying a SHA-256 and on `delete` being idempotent,
 * and a stub would agree with whatever the code did.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { env } from "cloudflare:test";

import {
  ATTACHMENT_ADDED,
  ATTACHMENT_REMOVED,
  AttachmentStorageError,
  AttachmentValidationError,
  attachmentStorageKey,
  attachmentWorkspacePrefix,
  createInMemoryObjectStore,
  hexDigest,
  type AttachmentObjectStore,
  type AttachmentRepository,
} from "~/kernel/attachments";
import {
  createR2ObjectStore,
  deleteAttachment,
  drainPurge,
  listMissingObjects,
  listOrphanedObjects,
  sweepAttachmentPurges,
  uploadAttachment,
} from "~/platform/attachments";

import {
  FakeClock,
  countActivitiesOfType,
  countingDb,
  makeAttachmentRepository,
  makeContext,
  makeRepository,
  resetTables,
  sequentialIds,
} from "./support";
import {
  collectStream,
  objectStoreContract,
} from "../support/object-store-contract";
import { createAttachmentRepository } from "~/platform/storage/d1";
import { createActivityActorContext } from "~/kernel/activity";

const WS = "ws_attach";
const OTHER = "ws_attach_other";

const PDF = new Uint8Array([
  0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf,
  0xd3, 0x0a,
]);
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52,
]);

const nextEntityId = sequentialIds("att_ent");
const nextAttachmentId = sequentialIds("att");

function actor(subject = "owner-subject") {
  return createActivityActorContext({ type: "user", id: subject });
}

function attachmentRepo(
  workspaceId: string,
  options: { readonly now?: () => Date; readonly newId?: () => string } = {},
): AttachmentRepository {
  return makeAttachmentRepository(makeContext(workspaceId), {
    actorContext: actor(),
    now: options.now ?? new FakeClock().now,
    newId: options.newId ?? sequentialIds(`${workspaceId}_row`),
  });
}

function objectStore(): AttachmentObjectStore {
  return createR2ObjectStore(env.ATTACHMENTS);
}

/**
 * An owner record, of an ordinary type.
 *
 * `note` rather than `obligation` on purpose: `obligation` is RESERVED for its
 * own repository (a bare `create` would leave a commitment with no detail slice),
 * and the point being proven here is about the attachment, not about which kind
 * of record it hangs from. The composite foreign key references
 * `entities (workspace_id, id)` with no type predicate, so every record type
 * behaves identically and the cheapest one to seed is the right one to use.
 */
async function seedOwner(workspaceId: string, title = "Hilux rego") {
  const entities = makeRepository(makeContext(workspaceId), {
    idGenerator: nextEntityId,
  });
  return entities.create({ type: "note", title });
}

/** Remove every object both workspaces own, so each test starts empty. */
async function clearObjects(): Promise<void> {
  for (const workspaceId of [WS, OTHER]) {
    const listed = await env.ATTACHMENTS.list({
      prefix: attachmentWorkspacePrefix(workspaceId),
      limit: 1000,
    });
    for (const object of listed.objects) {
      await env.ATTACHMENTS.delete(object.key);
    }
  }
}

function deps(
  workspaceId: string,
  overrides: {
    readonly attachments?: AttachmentRepository;
    readonly objects?: AttachmentObjectStore;
    readonly newId?: () => string;
  } = {},
) {
  return {
    attachments: overrides.attachments ?? attachmentRepo(workspaceId),
    objects: overrides.objects ?? objectStore(),
    workspaceId,
    newId: overrides.newId ?? nextAttachmentId,
  };
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
  await clearObjects();
});

/* -------------------------------------------------------------------------- */
/* An attachment cannot exist without an owner                                */
/* -------------------------------------------------------------------------- */

describe("an attachment requires an owner, and the database says so", () => {
  it("refuses a row whose owner does not exist", async () => {
    const repository = attachmentRepo(WS);
    await expect(
      repository.create({
        id: "x1",
        ownerEntityId: "no-such-record",
        filename: "policy.pdf",
        mediaType: "application/pdf",
        byteSize: PDF.length,
        checksumSha256: await hexDigest(PDF),
        storageKey: attachmentStorageKey({
          workspaceId: WS,
          attachmentId: "x1",
        }),
        uploadOperationId: "op-orphan-0001",
      }),
    ).rejects.toThrow();
  });

  it("refuses a row whose owner belongs to ANOTHER workspace", async () => {
    const foreign = await seedOwner(OTHER, "Their asset");
    const repository = attachmentRepo(WS);
    await expect(
      repository.create({
        id: "x2",
        ownerEntityId: foreign.id,
        filename: "policy.pdf",
        mediaType: "application/pdf",
        byteSize: PDF.length,
        checksumSha256: await hexDigest(PDF),
        storageKey: attachmentStorageKey({
          workspaceId: WS,
          attachmentId: "x2",
        }),
        uploadOperationId: "op-foreign-0001",
      }),
    ).rejects.toThrow();
  });

  it("refuses to permanently delete an owner that still holds evidence", async () => {
    const owner = await seedOwner(WS);
    const { attachment } = await uploadAttachment(deps(WS), {
      ownerEntityId: owner.id,
      filename: "policy.pdf",
      declaredMediaType: "application/pdf",
      bytes: PDF,
      uploadOperationId: "op-restrict-0001",
    });

    /*
     * Every OTHER dependent is cleared first, and that clearing is the test.
     *
     * An entity carries several ON DELETE RESTRICT keys — its activity subjects
     * among them — so "the DELETE threw" proves nothing on its own: it would
     * throw with the attachments key set to CASCADE, for a reason that has
     * nothing to do with evidence. A falsification proved exactly that. With
     * the subjects gone, the ONLY thing left holding this entity is its file.
     */
    await env.DB.prepare(
      "DELETE FROM activity_subjects WHERE workspace_id = ? AND entity_id = ?",
    )
      .bind(WS, owner.id)
      .run();

    // The ON DELETE RESTRICT key, isolated. A purge path that forgets the
    // evidence fails at the database rather than silently orphaning a byte.
    await expect(
      env.DB.prepare("DELETE FROM entities WHERE workspace_id = ? AND id = ?")
        .bind(WS, owner.id)
        .run(),
    ).rejects.toThrow();

    /*
     * And once the evidence is gone, the same delete succeeds — which is what
     * makes the refusal above attributable to the attachment and nothing else.
     * Removed with SQL rather than through `deleteAttachment`, because the
     * service appends an Activity and this test has just torn the subject rows
     * out from under it; the point here is the KEY, not the delete path, which
     * has its own tests.
     */
    await env.DB.prepare(
      "DELETE FROM attachments WHERE workspace_id = ? AND id = ?",
    )
      .bind(WS, attachment.id)
      .run();
    await env.DB.prepare(
      "DELETE FROM entities WHERE workspace_id = ? AND id = ?",
    )
      .bind(WS, owner.id)
      .run();
  });
});

/* -------------------------------------------------------------------------- */
/* Round trip                                                                 */
/* -------------------------------------------------------------------------- */

describe("a file goes in and comes back byte for byte", () => {
  it("stores, reads and deletes one PDF", async () => {
    const owner = await seedOwner(WS);
    const dependencies = deps(WS);

    const { attachment, created } = await uploadAttachment(dependencies, {
      ownerEntityId: owner.id,
      filename: "Rego renewal.pdf",
      declaredMediaType: "application/pdf",
      bytes: PDF,
      uploadOperationId: "op-roundtrip-0001",
    });
    expect(created).toBe(true);
    expect(attachment.filename).toBe("Rego renewal.pdf");
    expect(attachment.mediaType).toBe("application/pdf");
    expect(attachment.byteSize).toBe(PDF.length);
    expect(attachment.checksumSha256).toBe(await hexDigest(PDF));
    expect(attachment.uploadedBy).toBe("owner-subject");
    expect(attachment.storageKey).toBe(
      attachmentStorageKey({ workspaceId: WS, attachmentId: attachment.id }),
    );

    const stored = await env.ATTACHMENTS.get(attachment.storageKey);
    expect(stored).not.toBeNull();
    const bytes = new Uint8Array(await stored!.arrayBuffer());
    expect([...bytes]).toEqual([...PDF]);

    const removed = await deleteAttachment(dependencies, attachment.id);
    expect(removed?.id).toBe(attachment.id);
    expect(await dependencies.attachments.get(attachment.id)).toBeNull();
    expect(await env.ATTACHMENTS.get(attachment.storageKey)).toBeNull();
    // The ledger row is cleared once the bytes really are gone.
    expect(await dependencies.attachments.listPurges()).toEqual([]);
  });

  it("appends one added and one removed event, with no filename in either", async () => {
    const owner = await seedOwner(WS);
    const dependencies = deps(WS);
    const { attachment } = await uploadAttachment(dependencies, {
      ownerEntityId: owner.id,
      filename: "Very Private Diagnosis.pdf",
      declaredMediaType: "application/pdf",
      bytes: PDF,
      uploadOperationId: "op-activity-0001",
    });
    expect(await countActivitiesOfType(ATTACHMENT_ADDED)).toBe(1);

    const payloads = await env.DB.prepare(
      "SELECT payload_json FROM activities WHERE type IN (?, ?)",
    )
      .bind(ATTACHMENT_ADDED, ATTACHMENT_REMOVED)
      .all<{ readonly payload_json: string }>();
    for (const row of payloads.results ?? []) {
      expect(row.payload_json).not.toContain("Diagnosis");
      expect(row.payload_json).not.toContain("workspaces/");
      expect(row.payload_json).toContain("PDF");
    }

    await deleteAttachment(dependencies, attachment.id);
    expect(await countActivitiesOfType(ATTACHMENT_REMOVED)).toBe(1);
  });

  it("verifies the digest on the way out, not only on the way in", async () => {
    const owner = await seedOwner(WS);
    const dependencies = deps(WS);
    const { attachment } = await uploadAttachment(dependencies, {
      ownerEntityId: owner.id,
      filename: "receipt.png",
      declaredMediaType: "image/png",
      bytes: PNG,
      uploadOperationId: "op-digest-0001",
    });

    // Corrupt the object behind DalyHub's back, exactly as a storage fault
    // would. The metadata still claims the original digest.
    const tampered = new Uint8Array(PNG);
    tampered[tampered.length - 1] = (tampered[tampered.length - 1]! + 1) & 0xff;
    await env.ATTACHMENTS.put(
      attachment.storageKey,
      tampered as unknown as ArrayBuffer,
    );

    const { readAttachmentBytes } = await import("~/platform/attachments");
    await expect(
      readAttachmentBytes(dependencies, attachment),
    ).rejects.toMatchObject({ reason: "checksum_mismatch" });
  });

  it("keeps two files of the SAME NAME on one record apart", async () => {
    const owner = await seedOwner(WS);
    const dependencies = deps(WS);

    /*
     * The collision the key design exists to make impossible, and the one a
     * filename-derived key would produce silently: two `receipt.pdf` on one
     * record, the second overwriting the first, the owner none the wiser until
     * they opened the wrong one. Same name, DIFFERENT bytes, so an overwrite
     * cannot hide behind identical content.
     */
    const first = await uploadAttachment(dependencies, {
      ownerEntityId: owner.id,
      filename: "receipt.pdf",
      declaredMediaType: "application/pdf",
      bytes: PDF,
      uploadOperationId: "op-collide-0001",
    });
    const second = await uploadAttachment(dependencies, {
      ownerEntityId: owner.id,
      filename: "receipt.pdf",
      declaredMediaType: "application/pdf",
      bytes: new Uint8Array([...PDF, 0x0a]),
      uploadOperationId: "op-collide-0002",
    });

    expect(second.attachment.storageKey).not.toBe(first.attachment.storageKey);
    // Neither key contains the name, which is WHY they differ.
    expect(first.attachment.storageKey).not.toContain("receipt");
    expect(second.attachment.storageKey).not.toContain("receipt");

    // Two rows, two objects, and both sets of bytes still readable.
    expect(await dependencies.attachments.listForOwner(owner.id)).toHaveLength(
      2,
    );
    const { readAttachmentBytes } = await import("~/platform/attachments");
    expect([
      ...(await readAttachmentBytes(dependencies, first.attachment)),
    ]).toEqual([...PDF]);
    expect([
      ...(await readAttachmentBytes(dependencies, second.attachment)),
    ]).toEqual([...PDF, 0x0a]);
  });

  it("streams the same bytes on the download path", async () => {
    const owner = await seedOwner(WS);
    const dependencies = deps(WS);
    const { attachment } = await uploadAttachment(dependencies, {
      ownerEntityId: owner.id,
      filename: "policy.pdf",
      declaredMediaType: "application/pdf",
      bytes: PDF,
      uploadOperationId: "op-stream-0001",
    });

    /*
     * The download path does not buffer, so this is what proves it still hands
     * over the right bytes: the stream is drained the way the platform drains
     * it when the `Response` is sent, and compared with what went in.
     */
    const { openAttachmentStream } = await import("~/platform/attachments");
    const body = await openAttachmentStream(dependencies, attachment);
    expect([...(await collectStream(body))]).toEqual([...PDF]);
  });

  it("refuses to stream an object that disagrees with its row", async () => {
    const owner = await seedOwner(WS);
    const dependencies = deps(WS);
    const { attachment } = await uploadAttachment(dependencies, {
      ownerEntityId: owner.id,
      filename: "receipt.png",
      declaredMediaType: "image/png",
      bytes: PNG,
      uploadOperationId: "op-stream-0002",
    });

    /*
     * Replaced behind DalyHub's back — the case the O(1) check has to catch, and
     * the one a naive "stream whatever is under the key" would serve happily.
     * A write made outside this service carries a different digest or none, and
     * either is a refusal: the owner is told the file does not match what was
     * recorded rather than being handed someone else's document under their own
     * filename.
     */
    await env.ATTACHMENTS.put(
      attachment.storageKey,
      PDF as unknown as ArrayBuffer,
    );

    const { openAttachmentStream } = await import("~/platform/attachments");
    await expect(
      openAttachmentStream(dependencies, attachment),
    ).rejects.toMatchObject({ reason: "checksum_mismatch" });
  });

  it("refuses to stream an object that is not there", async () => {
    const owner = await seedOwner(WS);
    const dependencies = deps(WS);
    const { attachment } = await uploadAttachment(dependencies, {
      ownerEntityId: owner.id,
      filename: "policy.pdf",
      declaredMediaType: "application/pdf",
      bytes: PDF,
      uploadOperationId: "op-stream-0003",
    });
    await env.ATTACHMENTS.delete(attachment.storageKey);

    const { openAttachmentStream } = await import("~/platform/attachments");
    await expect(
      openAttachmentStream(dependencies, attachment),
    ).rejects.toMatchObject({ reason: "object_missing" });
  });

  it("reports a missing object rather than serving nothing", async () => {
    const owner = await seedOwner(WS);
    const dependencies = deps(WS);
    const { attachment } = await uploadAttachment(dependencies, {
      ownerEntityId: owner.id,
      filename: "policy.pdf",
      declaredMediaType: "application/pdf",
      bytes: PDF,
      uploadOperationId: "op-missing-0001",
    });
    await env.ATTACHMENTS.delete(attachment.storageKey);

    const { readAttachmentBytes } = await import("~/platform/attachments");
    await expect(
      readAttachmentBytes(dependencies, attachment),
    ).rejects.toMatchObject({ reason: "object_missing" });

    // And the integrity read names it, which is what makes the claim checkable.
    const missing = await listMissingObjects(
      dependencies,
      attachmentWorkspacePrefix(WS),
    );
    expect(missing.map((row) => row.id)).toEqual([attachment.id]);
  });
});

/* -------------------------------------------------------------------------- */
/* Workspace isolation                                                        */
/* -------------------------------------------------------------------------- */

describe("a hostile workspace reaches nothing", () => {
  it("cannot read another workspace's attachment by id", async () => {
    const owner = await seedOwner(WS);
    const { attachment } = await uploadAttachment(deps(WS), {
      ownerEntityId: owner.id,
      filename: "policy.pdf",
      declaredMediaType: "application/pdf",
      bytes: PDF,
      uploadOperationId: "op-isolate-0001",
    });

    const intruder = attachmentRepo(OTHER);
    expect(await intruder.get(attachment.id)).toBeNull();
    expect(await intruder.listForOwner(owner.id)).toEqual([]);
    expect(await intruder.countForOwner(owner.id)).toBe(0);
    expect(await intruder.listAll()).toEqual([]);
    expect(
      (await intruder.listForOwners([owner.id])).get(owner.id),
    ).toBeUndefined();
  });

  it("cannot delete another workspace's attachment", async () => {
    const owner = await seedOwner(WS);
    const { attachment } = await uploadAttachment(deps(WS), {
      ownerEntityId: owner.id,
      filename: "policy.pdf",
      declaredMediaType: "application/pdf",
      bytes: PDF,
      uploadOperationId: "op-isolate-0002",
    });

    expect(await deleteAttachment(deps(OTHER), attachment.id)).toBeNull();
    // Still there, bytes and all.
    expect(await deps(WS).attachments.get(attachment.id)).not.toBeNull();
    expect(await env.ATTACHMENTS.get(attachment.storageKey)).not.toBeNull();
  });

  it("refuses to purge a key that belongs to another workspace", async () => {
    const owner = await seedOwner(WS);
    const { attachment } = await uploadAttachment(deps(WS), {
      ownerEntityId: owner.id,
      filename: "policy.pdf",
      declaredMediaType: "application/pdf",
      bytes: PDF,
      uploadOperationId: "op-isolate-0003",
    });

    const intruder = deps(OTHER);
    expect(await drainPurge(intruder, attachment.storageKey)).toBe(false);
    expect(await env.ATTACHMENTS.get(attachment.storageKey)).not.toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Retry and compensation                                                     */
/* -------------------------------------------------------------------------- */

describe("a retry cannot duplicate, and a failure cannot orphan silently", () => {
  it("returns the same attachment for a repeated operation id, and cleans up the second object", async () => {
    const owner = await seedOwner(WS);
    const dependencies = deps(WS);

    const first = await uploadAttachment(dependencies, {
      ownerEntityId: owner.id,
      filename: "policy.pdf",
      declaredMediaType: "application/pdf",
      bytes: PDF,
      uploadOperationId: "op-retry-0001",
    });
    const second = await uploadAttachment(dependencies, {
      ownerEntityId: owner.id,
      filename: "policy.pdf",
      declaredMediaType: "application/pdf",
      bytes: PDF,
      uploadOperationId: "op-retry-0001",
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.attachment.id).toBe(first.attachment.id);
    expect(await dependencies.attachments.countForOwner(owner.id)).toBe(1);
    // ONE event, not two.
    expect(await countActivitiesOfType(ATTACHMENT_ADDED)).toBe(1);
    // And exactly one object: the retry's own write was compensated.
    const listed = await env.ATTACHMENTS.list({
      prefix: attachmentWorkspacePrefix(WS),
    });
    expect(listed.objects.map((object) => object.key)).toEqual([
      first.attachment.storageKey,
    ]);
    expect(
      await listOrphanedObjects(dependencies, attachmentWorkspacePrefix(WS)),
    ).toEqual([]);
  });

  it("deletes the object when the metadata write fails", async () => {
    const owner = await seedOwner(WS);
    const objects = objectStore();
    /*
     * A repository whose insert cannot succeed, because its operation id is
     * longer than the column's CHECK allows. The failure is real — the database
     * refuses it — rather than a stub throwing on request.
     */
    const dependencies = {
      attachments: attachmentRepo(WS),
      objects,
      workspaceId: WS,
      newId: nextAttachmentId,
    };
    await expect(
      uploadAttachment(dependencies, {
        ownerEntityId: owner.id,
        filename: "policy.pdf",
        declaredMediaType: "application/pdf",
        bytes: PDF,
        uploadOperationId: "x".repeat(200),
      }),
    ).rejects.toThrow();

    const listed = await env.ATTACHMENTS.list({
      prefix: attachmentWorkspacePrefix(WS),
    });
    expect(listed.objects).toEqual([]);
    expect(await dependencies.attachments.listPurges()).toEqual([]);
  });

  it("queues the key when the compensating object delete ALSO fails", async () => {
    const owner = await seedOwner(WS);
    const attachments = attachmentRepo(WS);
    // A store that stores nothing and refuses every delete: the "R2 succeeded,
    // D1 failed, and the rollback failed too" corner.
    const objects = createInMemoryObjectStore({ failDelete: () => true });
    const dependencies = { attachments, objects, workspaceId: WS };

    await expect(
      uploadAttachment(dependencies, {
        ownerEntityId: owner.id,
        filename: "policy.pdf",
        declaredMediaType: "application/pdf",
        bytes: PDF,
        uploadOperationId: "y".repeat(200),
      }),
    ).rejects.toThrow();

    const queued = await attachments.listPurges();
    expect(queued).toHaveLength(1);
    expect(queued[0]!.reason).toBe("upload_rolled_back");
    // The orphan is NAMED. That is the whole difference from a silent one.
    expect(
      queued[0]!.storageKey.startsWith(attachmentWorkspacePrefix(WS)),
    ).toBe(true);
  });

  it("leaves a ledger row when the object delete fails, and the sweep finishes it", async () => {
    const owner = await seedOwner(WS);
    const attachments = attachmentRepo(WS);
    let refuse = true;
    const real = objectStore();
    const flaky: AttachmentObjectStore = {
      ...real,
      async delete(key) {
        if (refuse) throw new AttachmentStorageError("delete_failed", key);
        await real.delete(key);
      },
    };

    const { attachment } = await uploadAttachment(
      { attachments, objects: flaky, workspaceId: WS },
      {
        ownerEntityId: owner.id,
        filename: "policy.pdf",
        declaredMediaType: "application/pdf",
        bytes: PDF,
        uploadOperationId: "op-sweep-0001",
      },
    );

    const removed = await deleteAttachment(
      { attachments, objects: flaky, workspaceId: WS },
      attachment.id,
    );
    expect(removed).not.toBeNull();
    // The metadata is gone — the owner was told the truth …
    expect(await attachments.get(attachment.id)).toBeNull();
    // … and the bytes are OWED, with the attempt recorded, not forgotten.
    const queued = await attachments.listPurges();
    expect(queued).toHaveLength(1);
    expect(queued[0]!.reason).toBe("attachment_deleted");
    expect(queued[0]!.attempts).toBe(1);
    expect(queued[0]!.lastError).toBe("delete_failed");
    expect(await env.ATTACHMENTS.get(attachment.storageKey)).not.toBeNull();

    refuse = false;
    const swept = await sweepAttachmentPurges({
      attachments,
      objects: flaky,
      workspaceId: WS,
    });
    expect(swept).toEqual({ attempted: 1, cleared: 1 });
    expect(await attachments.listPurges()).toEqual([]);
    expect(await env.ATTACHMENTS.get(attachment.storageKey)).toBeNull();
  });

  it("refuses the 51st row at the DATABASE, not only at the service check", async () => {
    /*
     * The race the service's count-then-write cannot close, found by review.
     *
     * Two uploads from two tabs against a record holding 49 files can both read
     * 49, both pass `assertRecordHasRoom`, and both commit — 51 rows on a record
     * whose read is capped at 50, so the overflow file is invisible in the UI
     * while its object sits in the bucket for ever, billed and unreachable.
     *
     * Driven through the REPOSITORY rather than the service, because the
     * service check is exactly what a real race steps around: the point is that
     * the insert itself refuses. What the second writer gets is the sentence
     * naming the limit — the same one they would have got had the race gone the
     * other way — rather than an opaque write failure.
     */
    const owner = await seedOwner(WS);
    const dependencies = deps(WS);
    const checksum = await hexDigest(PDF);
    const row = (index: number) => ({
      id: `race-${index}`,
      ownerEntityId: owner.id,
      filename: `f${index}.pdf`,
      mediaType: "application/pdf",
      byteSize: PDF.length,
      checksumSha256: checksum,
      storageKey: attachmentStorageKey({
        workspaceId: WS,
        attachmentId: `race-${index}`,
      }),
      uploadOperationId: `op-race-${String(index).padStart(4, "0")}`,
    });

    for (let index = 0; index < 50; index += 1) {
      await dependencies.attachments.create(row(index));
    }
    await expect(dependencies.attachments.create(row(50))).rejects.toThrow(
      AttachmentValidationError,
    );
    expect(await dependencies.attachments.countForOwner(owner.id)).toBe(50);

    // A DIFFERENT owner is unaffected — the guard counts one record's files,
    // not the workspace's.
    const other = await seedOwner(WS, "Another record");
    await dependencies.attachments.create({
      ...row(51),
      ownerEntityId: other.id,
    });
    expect(await dependencies.attachments.countForOwner(other.id)).toBe(1);
  });

  it("refuses a second upload beyond the per-record bound", async () => {
    const owner = await seedOwner(WS);
    const dependencies = deps(WS);
    // Seed to the bound directly: uploading fifty files through the real store
    // would prove the same rule fifty times more slowly.
    const checksum = await hexDigest(PDF);
    for (let index = 0; index < 50; index += 1) {
      await dependencies.attachments.create({
        id: `seed-${index}`,
        ownerEntityId: owner.id,
        filename: `f${index}.pdf`,
        mediaType: "application/pdf",
        byteSize: PDF.length,
        checksumSha256: checksum,
        storageKey: attachmentStorageKey({
          workspaceId: WS,
          attachmentId: `seed-${index}`,
        }),
        uploadOperationId: `op-bound-${String(index).padStart(4, "0")}`,
      });
    }
    await expect(
      uploadAttachment(dependencies, {
        ownerEntityId: owner.id,
        filename: "one-too-many.pdf",
        declaredMediaType: "application/pdf",
        bytes: PDF,
        uploadOperationId: "op-bound-overflow",
      }),
    ).rejects.toThrow(AttachmentValidationError);
    // And nothing was stored for the refused attempt.
    expect(
      (await env.ATTACHMENTS.list({ prefix: attachmentWorkspacePrefix(WS) }))
        .objects,
    ).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* Reads are bounded                                                          */
/* -------------------------------------------------------------------------- */

describe("reading evidence is bounded", () => {
  it("reads one record's files in ONE statement", async () => {
    const owner = await seedOwner(WS);
    const dependencies = deps(WS);
    for (let index = 0; index < 6; index += 1) {
      await uploadAttachment(dependencies, {
        ownerEntityId: owner.id,
        filename: `receipt-${index}.pdf`,
        declaredMediaType: "application/pdf",
        bytes: PDF,
        uploadOperationId: `op-list-${String(index).padStart(4, "0")}`,
      });
    }

    const counter = countingDb(env.DB);
    const repository = createAttachmentRepository(counter.db, makeContext(WS), {
      actorContext: actor(),
    });
    counter.reset();
    const listed = await repository.listForOwner(owner.id);
    expect(listed).toHaveLength(6);
    expect(counter.prepareCount()).toBe(1);
  });

  it("reads MANY records' files in ONE statement, bounded per record", async () => {
    const owners = [
      await seedOwner(WS, "A"),
      await seedOwner(WS, "B"),
      await seedOwner(WS, "C"),
    ];
    const dependencies = deps(WS);
    for (const owner of owners) {
      for (let index = 0; index < 4; index += 1) {
        await uploadAttachment(dependencies, {
          ownerEntityId: owner.id,
          filename: `f-${index}.pdf`,
          declaredMediaType: "application/pdf",
          bytes: PDF,
          uploadOperationId: `op-many-${owner.id}-${index}`,
        });
      }
    }

    const counter = countingDb(env.DB);
    const repository = createAttachmentRepository(counter.db, makeContext(WS), {
      actorContext: actor(),
    });
    counter.reset();
    const grouped = await repository.listForOwners(
      owners.map((owner) => owner.id),
      { limitPerOwner: 2 },
    );
    // ONE statement for three records — the N+1 this release would grow first.
    expect(counter.prepareCount()).toBe(1);
    for (const owner of owners) {
      expect(grouped.get(owner.id)).toHaveLength(2);
    }
  });

  it("never reads a byte to list metadata", async () => {
    const owner = await seedOwner(WS);
    const dependencies = deps(WS);
    await uploadAttachment(dependencies, {
      ownerEntityId: owner.id,
      filename: "policy.pdf",
      declaredMediaType: "application/pdf",
      bytes: PDF,
      uploadOperationId: "op-nobytes-0001",
    });

    let reads = 0;
    const counting: AttachmentObjectStore = {
      ...objectStore(),
      async get(key) {
        reads += 1;
        return objectStore().get(key);
      },
    };
    await dependencies.attachments.listForOwner(owner.id);
    await listOrphanedObjects(
      { ...dependencies, objects: counting },
      attachmentWorkspacePrefix(WS),
    );
    expect(reads).toBe(0);
  });
});

/*
 * The port contract, against the REAL local R2 bucket — the same block the unit
 * suite runs against `createInMemoryObjectStore`. This is what makes the fake
 * trustworthy: every property the application leans on is asserted of BOTH, so a
 * fake that started agreeing with code the bucket would refuse is caught here.
 *
 * Its own key prefix, so it cannot collide with the fixtures above.
 */
objectStoreContract(
  "real R2 bucket",
  () => createR2ObjectStore(env.ATTACHMENTS),
  "workspaces/ws_contract/attachments/",
);
