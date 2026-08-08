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
  buildStructuredExportArchive,
  buildWorkspaceSnapshot,
  sha256Hex,
} from "~/platform/export";

import { readBackupArchive } from "./read-backup-archive";

/** Everything the orchestration needs, passed explicitly (ADR-010). */
export interface RestoreDependencies {
  readonly restore: WorkspaceRestoreRepository;
  readonly snapshot: WorkspaceSnapshotRepository;
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
  const { snapshot } = await readBackupArchive(archiveBytes);

  // 2. Housekeeping first, so it can never remove rows staged below.
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

  return preview;
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
    archive = await buildStructuredExportArchive(current);
  } catch (error) {
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
  if (advanced?.status !== "safety_backed_up") {
    throw new RestoreFailedError(
      "The safety backup could not be recorded, so the restore was abandoned. Nothing has changed.",
      { workspaceReplaced: false },
    );
  }
  return { receipt, bytes: archive.bytes };
}

/**
 * Apply a prepared restore.
 *
 * The gate is the OPERATION'S OWN recorded status, read from the database — not
 * a flag the client sends. A destructive replace is refused unless a verified
 * safety backup receipt is already attached to it.
 */
export async function applyRestore(
  deps: RestoreDependencies,
  operationId: string,
): Promise<RestoreResult> {
  const operation = await requireOperation(deps, operationId, [
    "staged",
    "safety_backed_up",
  ]);

  if (operation.mode === "replace" && operation.safetyBackup === null) {
    throw new RestoreFailedError(
      "This restore would replace your current workspace, and no verified safety backup has been taken yet. Nothing has changed.",
      { workspaceReplaced: false },
    );
  }

  try {
    await deps.restore.applyStagedSnapshot(operationId);
  } catch (error) {
    // The cutover is one transaction: if it threw, it rolled back and the
    // workspace is exactly as it was. Say so, precisely.
    await deps.restore.discardOperation(operationId, "cutover_failed");
    throw new RestoreFailedError(
      "The restore did not complete, and your workspace was left exactly as it was. No records were changed.",
      { workspaceReplaced: false, cause: error },
    );
  }

  const verification = await deps.restore.verifyRestored(operationId);
  if (!verification.passed) {
    await deps.restore.discardOperation(operationId, "verification_failed");
    throw new RestoreFailedError(
      "The backup was written, but checking the result afterwards found it does not match the backup. Your workspace now holds the restored data — restore the safety backup taken a moment ago if this is wrong.",
      { workspaceReplaced: true, verification },
    );
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

/** Abandon a prepared restore and remove its staged rows. */
export async function discardRestore(
  deps: RestoreDependencies,
  operationId: string,
): Promise<void> {
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
