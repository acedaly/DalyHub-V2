/**
 * SET-02 — the storage-independent restore contract.
 *
 * The shapes here describe what a restore IS, independently of D1, ZIP, HTTP or
 * React: what a backup claims to contain, what the target workspace currently
 * holds, which of the two restore modes applies, and what the system checked
 * afterwards. Everything downstream — the D1 write adapter, the route, the
 * Settings surface and the tests — speaks this vocabulary, so "what will happen
 * to my data" has one answer rather than one per layer.
 *
 * ## The two modes, decided rather than left open
 *
 * - **`into-empty`** — the canonical recovery path. The target workspace holds
 *   no records; the backup becomes the workspace. Nothing can be lost, so it
 *   needs no safety backup and no typed confirmation.
 * - **`replace`** — the target workspace holds records, and they are REPLACED by
 *   the backup's. It is destructive, it says so, and it is gated by a typed
 *   confirmation and a verified pre-restore safety backup.
 *
 * There is deliberately **no merge mode**. Merging two workspaces means deciding,
 * per record, which side wins — and DalyHub has no defined conflict semantics for
 * that (a Task edited on both sides, a link deleted on one, an Activity stream
 * that must stay chronological). Inventing them inside a recovery feature would
 * produce a system capable of silently corrupting the owner's memory, which is
 * strictly worse than a smaller restore whose behaviour is predictable.
 */

import type { SnapshotCollection, WorkspaceSnapshotV1 } from "~/kernel/export";

import type { BackupCompatibility } from "./backup-compatibility";
import type { RestoreSafetyIssue } from "./restore-safety";

/* -------------------------------------------------------------------------- */
/* Modes and outcomes                                                         */
/* -------------------------------------------------------------------------- */

/** How a restore will treat the target workspace. */
export type RestoreMode = "into-empty" | "replace";

/** Why a backup was refused, in the vocabulary the owner is shown. */
export type RestoreRejectionKind =
  /** The uploaded file is not a readable DalyHub backup archive. */
  | "unreadable_archive"
  /** The archive opened, but its contents do not match its own checksums. */
  | "corrupt"
  /** A DalyHub backup written by a version of DalyHub this build cannot read. */
  | "unsupported_version"
  /** A DalyHub backup whose contents cannot be safely written to a database. */
  | "incompatible"
  /** The archive is larger than the restore path will accept. */
  | "too_large";

/** A refusal, with everything a message and a diagnostic log both need. */
export interface RestoreRejection {
  readonly kind: RestoreRejectionKind;
  /** A short, owner-facing sentence. Contains no record content, ever. */
  readonly message: string;
  /**
   * Structural detail for the server-side diagnostic log. Paths and rules only —
   * this is safe to log and is deliberately NOT sent to the browser.
   */
  readonly issues: readonly RestoreSafetyIssue[];
  /** Present when the refusal was a version decision. */
  readonly compatibility: BackupCompatibility | null;
}

/* -------------------------------------------------------------------------- */
/* Counts                                                                     */
/* -------------------------------------------------------------------------- */

/** Row counts for every snapshot collection. */
export type RestoreCollectionCounts = Readonly<
  Record<SnapshotCollection, number>
>;

/** The record counts an owner recognises, by DalyHub's own nouns. */
export interface RestoreRecordCounts {
  readonly areas: number;
  readonly goals: number;
  readonly projects: number;
  readonly tasks: number;
  readonly notes: number;
  readonly diaryEntries: number;
  readonly meetings: number;
  readonly people: number;
  readonly assets: number;
  readonly reviews: number;
  /** Records of a type this build does not recognise. Never silently dropped. */
  readonly other: number;
  readonly links: number;
  readonly activityEvents: number;
  /** Every first-class record, whatever its type. */
  readonly total: number;
}

/** What the target workspace holds right now. */
export interface RestoreTargetState {
  /** The workspace the SERVER resolved. Never a value from the backup. */
  readonly workspaceId: string;
  readonly isEmpty: boolean;
  readonly counts: RestoreRecordCounts;
}

/* -------------------------------------------------------------------------- */
/* Preview                                                                    */
/* -------------------------------------------------------------------------- */

/** What the backup says about itself. */
export interface RestoreBackupSummary {
  /** When the backup was taken (its `meta.exportedAt`). */
  readonly createdAt: string;
  readonly schemaVersion: number;
  readonly applicationVersion: string;
  readonly applicationReleaseName: string;
  /**
   * The workspace the backup came FROM, for provenance only. It is never used to
   * decide where records are written — see `RestoreTargetState.workspaceId`.
   */
  readonly sourceWorkspaceId: string;
  readonly counts: RestoreRecordCounts;
  readonly collectionCounts: RestoreCollectionCounts;
  /** Limitation codes the backup recorded about itself, if any. */
  readonly limitationCodes: readonly string[];
}

/**
 * The complete answer to "what am I about to restore, and what will happen to my
 * current DalyHub data?" — everything the confirmation surface needs, and
 * nothing technical enough to belong in a log instead.
 */
export interface RestorePreview {
  /** The server-side handle for this prepared restore. */
  readonly operationId: string;
  readonly backup: RestoreBackupSummary;
  readonly target: RestoreTargetState;
  readonly mode: RestoreMode;
  /** True when `mode` is `replace`: existing records will be replaced. */
  readonly destructive: boolean;
  /** True when a verified safety backup must be taken before applying. */
  readonly safetyBackupRequired: boolean;
}

/* -------------------------------------------------------------------------- */
/* Verification                                                               */
/* -------------------------------------------------------------------------- */

/** One post-restore check and whether the restored workspace passed it. */
export interface RestoreCheck {
  readonly name: string;
  readonly passed: boolean;
  /** A short statement of what was compared. No record content. */
  readonly detail: string;
}

/** The post-restore verification result. */
export interface RestoreVerification {
  readonly passed: boolean;
  readonly checks: readonly RestoreCheck[];
}

/** The outcome of an applied restore. */
export interface RestoreResult {
  readonly operationId: string;
  readonly mode: RestoreMode;
  readonly restored: RestoreRecordCounts;
  readonly verification: RestoreVerification;
  /** The safety backup taken before a destructive restore, when one was. */
  readonly safetyBackupFilename: string | null;
}

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

/** Thrown when a backup is refused. Carries the owner-facing rejection. */
export class RestoreRejectedError extends Error {
  readonly rejection: RestoreRejection;

  constructor(rejection: RestoreRejection) {
    super(rejection.message);
    this.name = "RestoreRejectedError";
    this.rejection = rejection;
  }
}

/**
 * Thrown when a restore could not be applied. The workspace is in a DEFINED
 * state when this is thrown — either untouched (the failure happened before the
 * atomic cutover) or completely restored and then found wanting by verification.
 * `workspaceReplaced` says which, so the message never guesses.
 */
export class RestoreFailedError extends Error {
  /** True when the cutover committed and the failure came after it. */
  readonly workspaceReplaced: boolean;
  readonly verification: RestoreVerification | null;

  constructor(
    message: string,
    options: {
      readonly workspaceReplaced: boolean;
      readonly verification?: RestoreVerification | null;
      /** The underlying failure, kept for the server-side log only. */
      readonly cause?: unknown;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = "RestoreFailedError";
    this.workspaceReplaced = options.workspaceReplaced;
    this.verification = options.verification ?? null;
  }
}

/* -------------------------------------------------------------------------- */
/* The write port                                                             */
/* -------------------------------------------------------------------------- */

/** A verified pre-restore safety backup of the CURRENT workspace. */
export interface SafetyBackupReceipt {
  readonly filename: string;
  readonly sha256: string;
  readonly bytes: number;
  /** How many first-class records the safety backup captured. */
  readonly recordCount: number;
}

/** The persisted state machine of one restore. */
export type RestoreOperationStatus =
  /** Validated and staged; nothing canonical written. */
  | "staged"
  /** A safety backup was produced and verified. Ready to apply. */
  | "safety_backed_up"
  /**
   * The cutover transaction COMMITTED. Set inside the same batch that replaces
   * the data, so "the workspace is now the backup's" is a durable fact rather
   * than an inference from a request that may not have returned.
   */
  | "applied"
  /** Applied, and post-restore verification passed. */
  | "completed"
  /** Refused or abandoned. The workspace was never modified. */
  | "failed";

/** One restore operation as the database holds it. */
export interface RestoreOperationRecord {
  readonly id: string;
  readonly status: RestoreOperationStatus;
  readonly mode: RestoreMode;
  readonly backupCreatedAt: string;
  readonly sourceWorkspaceId: string;
  readonly stagedRowCount: number;
  readonly safetyBackup: SafetyBackupReceipt | null;
  readonly createdAt: string;
}

/**
 * The workspace-bound WRITE port a restore uses.
 *
 * Bound to a `WorkspaceContext` at construction exactly as every other
 * repository is (ADR-010): **no method accepts a workspace id**, so no value
 * from an uploaded archive can influence which workspace is written. The
 * snapshot's own `workspace.id` is provenance the preview displays and the write
 * path never reads.
 */
export interface WorkspaceRestoreRepository {
  /** Current record counts in the target workspace, for the preview. */
  countTargetRecords(): Promise<RestoreRecordCounts>;

  /**
   * Write a validated snapshot into STAGING, in bounded batches.
   *
   * Staging touches no canonical table. An interruption here leaves the
   * workspace exactly as it was and leaves inert staged rows behind, which
   * {@link discardOperation} removes.
   */
  stageSnapshot(
    operationId: string,
    snapshot: WorkspaceSnapshotV1,
    ownerId: string,
  ): Promise<number>;

  /** Record the operation, its mode, its owner and its staged row count. */
  createOperation(input: {
    readonly operationId: string;
    readonly mode: RestoreMode;
    readonly backupCreatedAt: string;
    readonly sourceWorkspaceId: string;
    readonly stagedRowCount: number;
    /** The AUTHENTICATED owner. Owner-scoped rows are rebound to this subject. */
    readonly ownerId: string;
  }): Promise<void>;

  /** Expire and purge restores that can never be applied. Never destructive. */
  purgeStaleOperations(): Promise<void>;

  readOperation(operationId: string): Promise<RestoreOperationRecord | null>;

  /** Attach a verified safety backup receipt and advance the operation. */
  recordSafetyBackup(
    operationId: string,
    receipt: SafetyBackupReceipt,
  ): Promise<void>;

  /**
   * Replace the workspace's records with the staged rows in ONE transaction.
   *
   * This is the only method that touches canonical data. It either commits
   * entirely or not at all: there is no state in which some collections are the
   * backup's and others are the old workspace's.
   */
  applyStagedSnapshot(operationId: string): Promise<void>;

  /**
   * Read back the restored workspace and check it against the STAGED rows.
   *
   * Called before the staged rows are purged, which is what makes this exact
   * rather than a sample: the backup is still present in the database, so "every
   * row the backup carried is in the workspace, and the workspace holds nothing
   * else" is two SQL comparisons per table instead of shipping thousands of ids
   * back into a query. It also means verification needs no re-upload — the
   * apply request carries an operation id and nothing else.
   */
  verifyRestored(operationId: string): Promise<RestoreVerification>;

  /** Remove an operation's staged rows and mark it failed/abandoned. */
  discardOperation(operationId: string, reason: string): Promise<void>;

  /** Mark an operation completed and remove its staged rows. */
  completeOperation(operationId: string): Promise<void>;
}
