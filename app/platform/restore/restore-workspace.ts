/**
 * SET-02 — the restore orchestration: the exact order the steps must happen in,
 * in one place, so no route can accidentally reorder them.
 *
 * ```
 *   1. validate the incoming backup      (readBackupArchive — no writes at all)
 *   2. preview it against the target     (pure)
 *   3. stage it                          (inert rows; workspace untouched)
 *   4. owner confirms a destructive replace
 *   5. create a safety backup of the CURRENT workspace
 *   6. verify that safety backup by READING IT BACK through the restore reader
 *   7. cut over                          (one transaction)
 *   8. verify the restored workspace
 *   9. report
 * ```
 *
 * Two properties of that sequence are load-bearing and easy to lose:
 *
 * - **Step 6 verifies by round-tripping.** The safety backup is not merely
 *   "produced"; it is fed back through the SAME `readBackupArchive` a restore
 *   would use, so what the owner receives is proven restorable rather than
 *   proven non-empty. If it cannot be produced or cannot be read back, the
 *   destructive restore is abandoned — never attempted on the assumption that it
 *   would probably have worked.
 * - **Step 7 is the only step that touches canonical data**, and it is atomic
 *   (see `d1-workspace-restore-repository.ts`). Everything before it can fail
 *   freely; the workspace is exactly as it was.
 */

import type {
  SnapshotApplication,
  WorkspaceSnapshotRepository,
} from "~/kernel/export";
import {
  RestoreFailedError,
  RestoreRejectedError,
  buildRestorePreview,
  countSnapshotRecords,
  type RestoreOperationRecord,
  type RestorePreview,
  type RestoreResult,
  type SafetyBackupReceipt,
  type WorkspaceRestoreRepository,
} from "~/kernel/restore";
import {
  attachmentStorageKey,
  type AttachmentObjectStore,
  type AttachmentRepository,
} from "~/kernel/attachments";
import {
  buildStructuredExportArchive,
  buildWorkspaceSnapshot,
  readAttachmentBytesForArchive,
  sha256Hex,
} from "~/platform/export";

import { readBackupArchive } from "./read-backup-archive";

/** Everything the orchestration needs, passed explicitly (ADR-010). */
export interface RestoreDependencies {
  readonly restore: WorkspaceRestoreRepository;
  readonly snapshot: WorkspaceSnapshotRepository;
  /**
   * V2.11 FILE-02 — the second physical store, and the reason this sequence
   * needed re-deciding rather than extending.
   *
   * Both are OPTIONAL, and the optionality is honest rather than lazy: a
   * deployment with no bucket bound has no attachments, so an archive carrying
   * none restores exactly as it did before this release. An archive that DOES
   * carry files, restored into a deployment with no store, is refused — with a
   * sentence saying so — rather than silently restoring rows that name evidence
   * nothing can read.
   */
  readonly attachments?: AttachmentRepository;
  readonly objects?: AttachmentObjectStore | null;
  /** The SERVER-resolved target workspace id. Never a request value. */
  readonly workspaceId: string;
  /** The authenticated owner's subject. Used as a predicate and as row owner. */
  readonly ownerId: string;
  readonly application: SnapshotApplication;
  readonly now: () => Date;
  readonly newId: () => string;
}

/**
 * Validate an uploaded backup and prepare it for restoration.
 *
 * Nothing canonical is written. The staged rows this leaves behind are inert:
 * no DalyHub surface reads them, and they are purged when the operation
 * completes, is discarded, or expires.
 */
export async function prepareRestore(
  deps: RestoreDependencies,
  archiveBytes: Uint8Array,
): Promise<RestorePreview> {
  // 1. Everything that can reject the file happens before any write.
  const { snapshot, attachmentBytes } = await readBackupArchive(archiveBytes);

  /*
   * V2.11 FILE-02 — refuse EARLY when the archive carries files this deployment
   * has nowhere to put.
   *
   * The alternative is a restore that succeeds and leaves every record pointing
   * at evidence that does not exist — the "D1 claims an object R2 does not
   * have" state, created deliberately, at the moment the owner is least able to
   * absorb it. Nothing has been written when this throws.
   */
  if (attachmentBytes.size > 0 && !hasAttachmentStores(deps)) {
    throw new RestoreRejectedError({
      kind: "incompatible",
      message:
        "This backup contains attached files, and file storage isn’t configured for this deployment. Restoring it would leave records pointing at files that are not there, so it will not be attempted.",
      issues: [],
      compatibility: null,
    });
  }

  /*
   * 2. Housekeeping first, so it can never remove rows staged below.
   *
   * V2.11 FILE-02 — and BEFORE the housekeeping, queue the objects any EXPIRED
   * operation left behind. A restore writes its bytes to their final keys
   * before the cutover, so an owner who starts a restore and closes the tab has
   * left files that no row will ever name. `purgeStaleOperations` is about to
   * delete the only record of what those were, so this is the last moment they
   * can be identified — and identifying them is the difference between an
   * orphan the system knows about and one it does not.
   */
  await queueAbandonedObjects(deps);
  await deps.restore.purgeStaleOperations();

  const counts = await deps.restore.countTargetRecords();
  const operationId = deps.newId();
  const preview = buildRestorePreview({
    operationId,
    snapshot,
    target: {
      // The SERVER's workspace. The backup's own `workspace.id` appears only in
      // `preview.backup.sourceWorkspaceId`, as provenance.
      workspaceId: deps.workspaceId,
      isEmpty:
        counts.total === 0 && counts.links === 0 && counts.activityEvents === 0,
      counts,
    },
  });

  // 3. Stage. Interruptible; the workspace is untouched throughout.
  const stagedRowCount = await deps.restore.stageSnapshot(
    operationId,
    snapshot,
    deps.ownerId,
  );
  await deps.restore.createOperation({
    operationId,
    mode: preview.mode,
    backupCreatedAt: preview.backup.createdAt,
    sourceWorkspaceId: preview.backup.sourceWorkspaceId,
    stagedRowCount,
    ownerId: deps.ownerId,
  });

  /*
   * 4. The BYTES, to their final keys, before any row that names them exists.
   *
   * This is the ordering decision of the whole release (ADR-119 decision 8), and
   * the argument is asymmetric:
   *
   *   - objects first, rows second → the worst case is an object no row names.
   *     It is invisible to the product, it costs storage, and every abandonment
   *     path below queues it for the sweep.
   *   - rows first, objects second → the worst case is a record that says it has
   *     evidence and a download that 502s. The owner meets it immediately, at
   *     the moment they are recovering from something, and no cleanup can undo
   *     it.
   *
   * Every byte here has already been checked against the digest the snapshot
   * carries (`readBackupArchive` step 7), and the SAME digest is handed to the
   * store so it verifies them again on arrival. A write that fails takes the
   * preparation with it, and what it managed to write is queued.
   */
  if (attachmentBytes.size > 0) {
    await writeRestoredObjects(deps, snapshot, attachmentBytes, operationId);
  }

  return preview;
}

/** True when both halves of the attachment store are available. */
function hasAttachmentStores(
  deps: RestoreDependencies,
): deps is RestoreDependencies & {
  readonly attachments: AttachmentRepository;
  readonly objects: AttachmentObjectStore;
} {
  return Boolean(deps.attachments) && Boolean(deps.objects);
}

/**
 * Queue for the sweep every object an EXPIRED restore left behind.
 *
 * Never throws: this is housekeeping in front of a restore, and a failure to
 * tidy up after a previous one must not stop this one from running.
 */
async function queueAbandonedObjects(deps: RestoreDependencies): Promise<void> {
  if (!hasAttachmentStores(deps)) return;
  try {
    const abandoned = await deps.restore.listStagedAttachmentIds();
    for (const attachmentId of abandoned) {
      await deps.attachments.queuePurge(
        attachmentStorageKey({
          workspaceId: deps.workspaceId,
          attachmentId,
        }),
        "restore_rolled_back",
      );
    }
  } catch {
    /* Housekeeping. The orphan audit still names anything missed. */
  }
}

/** Queue for the sweep every object THIS operation wrote. */
async function queueOperationObjects(
  deps: RestoreDependencies,
  operationId: string,
): Promise<void> {
  if (!hasAttachmentStores(deps)) return;
  try {
    const staged = await deps.restore.listStagedAttachmentIds(operationId);
    for (const attachmentId of staged) {
      await deps.attachments.queuePurge(
        attachmentStorageKey({
          workspaceId: deps.workspaceId,
          attachmentId,
        }),
        "restore_rolled_back",
      );
    }
  } catch {
    /* Best effort, on a path that is already reporting a failure. */
  }
}

/**
 * Write every archived attachment to its final key.
 *
 * The key is DERIVED — from the workspace being restored into and the
 * attachment's own id — which is what makes an archive restorable into an
 * environment whose bucket layout is nothing like the one it came from.
 */
async function writeRestoredObjects(
  deps: RestoreDependencies,
  snapshot: Awaited<ReturnType<typeof readBackupArchive>>["snapshot"],
  bytesById: ReadonlyMap<string, Uint8Array>,
  operationId: string,
): Promise<void> {
  if (!hasAttachmentStores(deps)) return;
  try {
    for (const row of snapshot.records.attachments) {
      const bytes = bytesById.get(row.id);
      if (bytes === undefined) continue;
      await deps.objects.put(
        attachmentStorageKey({
          workspaceId: deps.workspaceId,
          attachmentId: row.id,
        }),
        bytes,
        {
          // Verified once by the reader against this same value, and again here
          // by the store. Two mechanisms, one digest.
          checksumSha256: row.checksumSha256,
          mediaType: row.mediaType,
        },
      );
    }
  } catch (cause) {
    await queueOperationObjects(deps, operationId);
    await deps.restore.discardOperation(operationId, "attachment_write_failed");
    throw new RestoreFailedError(
      "This backup’s files could not be written to storage, so the restore was abandoned. Nothing has changed.",
      { workspaceReplaced: false, cause },
    );
  }
}

/** A safety backup, ready to hand to the owner. */
export interface SafetyBackup {
  readonly receipt: SafetyBackupReceipt;
  readonly bytes: Uint8Array;
}

/**
 * Create and VERIFY a pre-restore safety backup of the current workspace.
 *
 * Built through exactly the same canonical machinery as the owner's ordinary
 * export — one snapshot, one structured archive — so there is no second backup
 * format to drift. Verified by reading it back through the restore reader, which
 * is the only check that means anything: a file that cannot be restored is not a
 * recovery point.
 */
export async function createSafetyBackup(
  deps: RestoreDependencies,
  operationId: string,
): Promise<SafetyBackup> {
  await requireOperation(deps, operationId, ["staged"]);

  let archive: Awaited<ReturnType<typeof buildStructuredExportArchive>>;
  let recordCount: number;
  try {
    const current = await buildWorkspaceSnapshot(deps.snapshot, {
      ownerId: deps.ownerId,
      exportedAt: deps.now(),
      application: deps.application,
    });
    recordCount = countSnapshotRecords(current).total;
    /*
     * V2.11 FILE-02 — the safety backup carries the current workspace's FILES.
     *
     * Without this it would be a recovery point for the database and not for
     * the evidence, which is the failure mode this whole item exists to
     * prevent: a destructive restore is exactly the moment an owner needs to be
     * able to get their receipts back. `readAttachmentBytesForArchive` verifies
     * each one against its recorded digest and THROWS if it cannot, so a
     * workspace whose files cannot be read produces no safety backup — and,
     * through the catch below, no destructive restore either.
     */
    archive = await buildStructuredExportArchive(
      current,
      await readAttachmentBytesForArchive({
        workspaceId: deps.workspaceId,
        attachments: current.records.attachments,
        store: deps.objects ?? null,
      }),
    );
  } catch (error) {
    await queueOperationObjects(deps, operationId);
    await deps.restore.discardOperation(operationId, "safety_backup_failed");
    throw new RestoreFailedError(
      "A safety backup of your current workspace could not be created, so the restore was abandoned. Nothing has changed.",
      { workspaceReplaced: false, cause: error },
    );
  }

  // The proof. If this throws, the file we were about to call a recovery point
  // is not one, and the restore must not proceed.
  try {
    await readBackupArchive(archive.bytes);
  } catch (error) {
    await queueOperationObjects(deps, operationId);
    await deps.restore.discardOperation(
      operationId,
      "safety_backup_unverifiable",
    );
    throw new RestoreFailedError(
      "The safety backup of your current workspace could not be verified, so the restore was abandoned. Nothing has changed.",
      { workspaceReplaced: false, cause: error },
    );
  }

  const receipt: SafetyBackupReceipt = {
    filename: archive.filename,
    sha256: await sha256Hex(archive.bytes),
    bytes: archive.bytes.length,
    recordCount,
  };
  await deps.restore.recordSafetyBackup(operationId, receipt);
  // Re-read: the update is conditional on the operation still being `staged`,
  // so this is how we learn it actually applied rather than assuming it did.
  const advanced = await deps.restore.readOperation(operationId);
  if (advanced?.status !== "safety_backup_ready") {
    throw new RestoreFailedError(
      "The safety backup could not be recorded, so the restore was abandoned. Nothing has changed.",
      { workspaceReplaced: false },
    );
  }
  return { receipt, bytes: archive.bytes };
}

/**
 * Acknowledge that the owner's browser received the COMPLETE safety archive.
 *
 * This, not the act of generating the file, is what unlocks a destructive
 * restore. The digest the client sends is the one IT computed over the bytes it
 * actually received, and the server compares it with the digest it recorded when
 * it produced the file — so a truncated download, a dropped response or a client
 * that never got one cannot satisfy the gate.
 */
export async function acknowledgeSafetyBackup(
  deps: RestoreDependencies,
  operationId: string,
  sha256: string,
): Promise<void> {
  await requireOperation(deps, operationId, ["safety_backup_ready"]);
  const acknowledged = await deps.restore.acknowledgeSafetyBackup(
    operationId,
    sha256.trim().toLowerCase(),
  );
  if (!acknowledged) {
    throw new RestoreFailedError(
      "The safety backup did not arrive intact, so the restore was not unlocked. Download it again before replacing this workspace.",
      { workspaceReplaced: false },
    );
  }
}

/**
 * Apply a prepared restore.
 *
 * The gate is the OPERATION'S OWN recorded status, read from the database — not
 * a flag the client sends — and the transition is then enforced again INSIDE the
 * cutover transaction, so this read is a fast refusal rather than the guarantee.
 * A destructive replace is refused unless the safety backup has been produced,
 * verified AND acknowledged as received.
 */
export async function applyRestore(
  deps: RestoreDependencies,
  operationId: string,
): Promise<RestoreResult> {
  const operation = await requireOperation(deps, operationId, [
    "staged",
    "safety_backup_ready",
    "safety_backed_up",
  ]);

  /*
   * A destructive replace requires the ACKNOWLEDGED state, not merely a receipt.
   * `safety_backup_ready` means the server made a recovery archive and cannot
   * show that the owner received it — which is precisely the situation in which
   * replacing their workspace would leave them with nothing to go back to.
   */
  if (operation.mode === "replace" && operation.status !== "safety_backed_up") {
    throw new RestoreFailedError(
      operation.status === "safety_backup_ready"
        ? "The safety backup has not been confirmed as saved to your device, so this workspace will not be replaced. Create it again and let the download finish."
        : "This restore would replace your current workspace, and no verified safety backup has been taken yet. Nothing has changed.",
      { workspaceReplaced: false },
    );
  }

  /*
   * V2.11 FILE-02 — the keys this workspace holds RIGHT NOW, captured before the
   * cutover replaces the rows that name them.
   *
   * After the cutover those rows are gone, so this is the only moment the old
   * objects can be identified. Everything captured here that the restore does
   * NOT bring back is a byte no row will ever name again, and it is queued for
   * the sweep below — which is what stops a destructive restore from leaving a
   * whole workspace's worth of unreachable files in the bucket.
   */
  const replacedKeys = hasAttachmentStores(deps)
    ? (await deps.attachments.listAll()).map((row) => row.storageKey)
    : [];
  const restoredIds = new Set(
    await deps.restore.listStagedAttachmentIds(operationId).catch(() => []),
  );

  let claimed: boolean;
  try {
    claimed = await deps.restore.applyStagedSnapshot(operationId);
  } catch (error) {
    // The cutover is one transaction: if it threw, it rolled back and the
    // workspace is exactly as it was. Say so, precisely.
    await queueOperationObjects(deps, operationId);
    await deps.restore.discardOperation(operationId, "cutover_failed");
    throw new RestoreFailedError(
      "The restore did not complete, and your workspace was left exactly as it was. No records were changed.",
      { workspaceReplaced: false, cause: error },
    );
  }

  if (!claimed) {
    /*
     * Another request won the claim inside the transaction, so this call wrote
     * nothing at all. It must NOT discard or fail the operation: that operation
     * is the winner's, and marking it failed here would delete the staged rows
     * the winner is still verifying against. A clean refusal is the whole
     * correct outcome.
     */
    throw new RestoreRejectedError({
      kind: "incompatible",
      message:
        "This restore was already being applied, so nothing was done a second time.",
      issues: [],
      compatibility: null,
    });
  }

  const verification = await deps.restore.verifyRestored(operationId);
  if (!verification.passed) {
    await deps.restore.discardOperation(operationId, "verification_failed");
    throw new RestoreFailedError(
      "The backup was written, but checking the result afterwards found it does not match the backup. Your workspace now holds the restored data — restore the safety backup taken a moment ago if this is wrong.",
      { workspaceReplaced: true, verification },
    );
  }

  /*
   * The bytes the replaced workspace held and the restore did not bring back.
   * Queued rather than deleted here: a delete on this path would be a delete
   * running immediately after a destructive replace, which is the last place to
   * do anything irreversible in a hurry. The sweep takes them, bounded, later.
   */
  if (hasAttachmentStores(deps)) {
    const keptKeys = new Set(
      [...restoredIds].map((attachmentId) =>
        attachmentStorageKey({
          workspaceId: deps.workspaceId,
          attachmentId,
        }),
      ),
    );
    for (const key of replacedKeys) {
      if (keptKeys.has(key)) continue;
      await deps.attachments
        .queuePurge(key, "workspace_replaced")
        .catch(() => undefined);
    }
  }

  const restored = await deps.restore.countTargetRecords();
  await deps.restore.completeOperation(operationId);

  return {
    operationId,
    mode: operation.mode,
    restored,
    verification,
    safetyBackupFilename: operation.safetyBackup?.filename ?? null,
  };
}

/**
 * Abandon a prepared restore and remove its staged rows.
 *
 * The objects this operation already wrote are queued for the sweep FIRST,
 * while the staged rows that name them still exist. After
 * `discardOperation` those rows are gone and the keys are unrecoverable — which
 * is precisely the "orphan object nothing knows about" this release refuses to
 * create.
 */
export async function discardRestore(
  deps: RestoreDependencies,
  operationId: string,
): Promise<void> {
  await queueOperationObjects(deps, operationId);
  await deps.restore.discardOperation(operationId, "cancelled_by_owner");
}

async function requireOperation(
  deps: RestoreDependencies,
  operationId: string,
  allowed: readonly RestoreOperationRecord["status"][],
): Promise<RestoreOperationRecord> {
  const operation = await deps.restore.readOperation(operationId);
  if (operation === null) {
    throw new RestoreRejectedError({
      kind: "incompatible",
      message:
        "That restore is no longer available. Choose the backup file again to start over.",
      issues: [],
      compatibility: null,
    });
  }
  if (!allowed.includes(operation.status)) {
    throw new RestoreRejectedError({
      kind: "incompatible",
      message:
        "That restore is no longer available. Choose the backup file again to start over.",
      issues: [],
      compatibility: null,
    });
  }
  return operation;
}
