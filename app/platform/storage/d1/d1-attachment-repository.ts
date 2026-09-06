/**
 * V2.11 FILE-00 — the D1 implementation of the attachment metadata repository.
 *
 * Workspace isolation is STRUCTURAL (ADR-010): the repository is constructed
 * with one `WorkspaceContext`, no method accepts a workspace id, and every
 * statement binds it. There is no method here that can be asked about another
 * workspace's row, so a hostile id is a `null`, not a leak.
 *
 * ## The two batches, and why each is one batch
 *
 * `create` runs the metadata INSERT and its Activity event in one
 * `D1Database.batch()`, so a stored file is either recorded with its event or
 * not recorded at all. The event insert is guarded on `changes() > 0`, which is
 * how the retry case comes out right: an `INSERT … ON CONFLICT DO NOTHING` that
 * loses to an existing operation id changes no row, so no second event is
 * appended and the caller learns from the read that follows.
 *
 * `deleteWithPurge` runs the DELETE, the purge-ledger INSERT and the Activity
 * event in one batch. The ledger row is written in the SAME transaction as the
 * delete, which is the whole compensation guarantee (ADR-119 decision 6): after
 * this batch commits the bytes are unreachable through every DalyHub path AND
 * already recorded as owed to the sweep. There is no window in which they are
 * neither.
 *
 * ## The owner is checked by the DATABASE
 *
 * `attachments` carries a composite foreign key into `entities (workspace_id,
 * id)`. An owner id from another workspace does not fail a predicate here — it
 * fails the constraint, which is a stronger guarantee than a query this file
 * could write, and it holds for every future caller including a restore.
 */

import {
  ActivityError,
  buildActivityWriteModel,
  type ActivityActorContext,
  type NewActivityEvent,
} from "~/kernel/activity";
import {
  ATTACHMENT_ADDED,
  ATTACHMENT_REMOVED,
  AttachmentValidationError,
  DEFAULT_ATTACHMENTS_PER_OWNER,
  DEFAULT_ATTACHMENTS_PER_OWNER_IN_LIST,
  MAX_ATTACHMENTS_PER_ARCHIVE,
  MAX_ATTACHMENTS_PER_RECORD,
  attachmentMediaType,
  type AttachmentObjectPurge,
  type AttachmentPurgeReason,
  type AttachmentRecord,
  type AttachmentRepository,
  type CreateAttachmentInput,
  type CreateAttachmentResult,
} from "~/kernel/attachments";
import type { WorkspaceContext } from "~/kernel/workspaces";

import { D1ActivityRecorder } from "./d1-activity-recorder";
import { fromStorageTimestamp, toStorageTimestamp } from "./database";

const SUBJECT_ROLE = "subject";

/** An attachment metadata operation that failed at the storage boundary. */
export class AttachmentStorageWriteError extends Error {
  constructor(options?: { cause?: unknown }) {
    super("The attachment could not be recorded.", options);
    this.name = "AttachmentStorageWriteError";
  }
}

interface AttachmentRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly owner_entity_id: string;
  readonly filename: string;
  readonly media_type: string;
  readonly byte_size: number;
  readonly checksum_sha256: string;
  readonly storage_key: string;
  readonly upload_operation_id: string;
  readonly uploaded_by: string | null;
  readonly created_at: string;
}

interface PurgeRow {
  readonly workspace_id: string;
  readonly storage_key: string;
  readonly reason: string;
  readonly queued_at: string;
  readonly attempts: number;
  readonly last_attempt_at: string | null;
  readonly last_error: string | null;
}

const COLUMNS =
  "id, workspace_id, owner_entity_id, filename, media_type, byte_size, " +
  "checksum_sha256, storage_key, upload_operation_id, uploaded_by, created_at";

function rowToAttachment(row: AttachmentRow): AttachmentRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    ownerEntityId: row.owner_entity_id,
    filename: row.filename,
    mediaType: row.media_type,
    byteSize: row.byte_size,
    checksumSha256: row.checksum_sha256,
    storageKey: row.storage_key,
    uploadOperationId: row.upload_operation_id,
    uploadedBy: row.uploaded_by,
    createdAt: fromStorageTimestamp(row.created_at),
  };
}

function rowToPurge(row: PurgeRow): AttachmentObjectPurge {
  return {
    workspaceId: row.workspace_id,
    storageKey: row.storage_key,
    reason: row.reason as AttachmentPurgeReason,
    queuedAt: fromStorageTimestamp(row.queued_at),
    attempts: row.attempts,
    lastAttemptAt:
      row.last_attempt_at === null
        ? null
        : fromStorageTimestamp(row.last_attempt_at),
    lastError: row.last_error,
  };
}

/** Options the composition boundary supplies. Never a request value. */
export interface D1AttachmentRepositoryOptions {
  readonly actorContext: ActivityActorContext;
  readonly now?: () => Date;
  readonly newId?: () => string;
}

export class D1AttachmentRepository implements AttachmentRepository {
  readonly #db: D1Database;
  readonly #workspaceId: string;
  readonly #actor: ActivityActorContext;
  readonly #recorder: D1ActivityRecorder;
  readonly #clock: () => Date;
  readonly #newId: () => string;

  constructor(
    db: D1Database,
    context: WorkspaceContext,
    options: D1AttachmentRepositoryOptions,
  ) {
    this.#db = db;
    this.#workspaceId = context.workspaceId;
    this.#actor = options.actorContext;
    this.#recorder = new D1ActivityRecorder(db);
    this.#clock = options.now ?? (() => new Date());
    this.#newId = options.newId ?? (() => crypto.randomUUID());
  }

  async create(input: CreateAttachmentInput): Promise<CreateAttachmentResult> {
    const now = this.#clock();
    /*
     * The caller's id, not one minted here. The object was already written under
     * a key derived from it, so a fresh id would put the row and its bytes under
     * two different names — see `CreateAttachmentInput`.
     */
    const id = input.id;
    /*
     * The uploader is the TRUSTED actor established at the composition boundary,
     * never a value the caller passed. A system actor has no subject, and `null`
     * is the truthful record of that rather than a fabricated one.
     */
    const uploadedBy = this.#actor.actor.id ?? null;

    /*
     * ON CONFLICT DO NOTHING against the (workspace_id, upload_operation_id)
     * UNIQUE index is the whole retry guarantee. A repeated upload changes no
     * row, so `changes()` stays 0, so no Activity event is appended, and the
     * read below returns the attachment that already exists.
     */
    /*
     * The per-record bound is enforced HERE, in the same statement as the
     * insert, rather than only by the service's count-then-write.
     *
     * Two uploads from two tabs against a record holding 49 files could both
     * read 49, both pass the service check, and both commit — 51 rows, on a
     * record whose read is capped at 50, so the overflow file was invisible in
     * the UI while its object sat in the bucket for ever. `SELECT ... WHERE
     * (SELECT COUNT(*) ...) <` makes the count and the insert one atomic act,
     * so the second writer loses.
     *
     * The service's check stays, and is not redundant: it runs BEFORE the file
     * is read or stored, and it is what produces the sentence naming the limit.
     * This is the backstop that makes it true under concurrency.
     */
    const insert = this.#db
      .prepare(
        `INSERT INTO attachments
           (${COLUMNS})
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          WHERE (
            SELECT COUNT(*) FROM attachments
             WHERE workspace_id = ? AND owner_entity_id = ?
          ) < ?
         ON CONFLICT (workspace_id, upload_operation_id) DO NOTHING`,
      )
      .bind(
        id,
        this.#workspaceId,
        input.ownerEntityId,
        input.filename,
        input.mediaType,
        input.byteSize,
        input.checksumSha256,
        input.storageKey,
        input.uploadOperationId,
        uploadedBy,
        toStorageTimestamp(now),
        this.#workspaceId,
        input.ownerEntityId,
        MAX_ATTACHMENTS_PER_RECORD,
      );

    try {
      await this.#db.batch([
        insert,
        ...this.#appendStatements(
          ATTACHMENT_ADDED,
          input.ownerEntityId,
          { kind: this.#kindLabel(input.mediaType) },
          now,
        ),
      ]);
    } catch (cause) {
      this.#fail(cause);
    }

    /*
     * Read back by the OPERATION id, not by the id we minted: on the conflict
     * path the row that exists is the first attempt's, with its own id and its
     * own storage key, and that is precisely the row the caller must be given.
     */
    const stored = await this.#byOperationId(input.uploadOperationId);
    if (stored === null) {
      /*
       * The insert reported no error and the row is not there, which now has
       * one known cause: the per-record guard above refused it because another
       * writer took the last slot between the service's count and this commit.
       * Say THAT, with the sentence the owner would have got had the race gone
       * the other way, rather than a generic write failure they cannot act on.
       */
      if (
        (await this.countForOwner(input.ownerEntityId)) >=
        MAX_ATTACHMENTS_PER_RECORD
      ) {
        throw new AttachmentValidationError(
          "owner",
          `This record already has ${MAX_ATTACHMENTS_PER_RECORD} files, which is the most one record holds. Remove one before adding another.`,
        );
      }
      // Anything else: nothing sensible can be said except that it did not
      // happen.
      throw new AttachmentStorageWriteError();
    }
    const created = stored.id === id;
    return {
      attachment: stored,
      outcome: created ? "created" : "already_uploaded",
      created,
    };
  }

  async get(attachmentId: string): Promise<AttachmentRecord | null> {
    try {
      const row = await this.#db
        .prepare(
          `SELECT ${COLUMNS} FROM attachments
            WHERE workspace_id = ? AND id = ?`,
        )
        .bind(this.#workspaceId, attachmentId)
        .first<AttachmentRow>();
      return row === null ? null : rowToAttachment(row);
    } catch (cause) {
      this.#fail(cause);
    }
  }

  async listForOwner(
    ownerEntityId: string,
    options: { readonly limit?: number } = {},
  ): Promise<readonly AttachmentRecord[]> {
    const limit = Math.min(
      Math.max(1, options.limit ?? DEFAULT_ATTACHMENTS_PER_OWNER),
      MAX_ATTACHMENTS_PER_RECORD,
    );
    try {
      const result = await this.#db
        .prepare(
          `SELECT ${COLUMNS} FROM attachments
            WHERE workspace_id = ? AND owner_entity_id = ?
            ORDER BY created_at ASC, id ASC
            LIMIT ?`,
        )
        .bind(this.#workspaceId, ownerEntityId, limit)
        .all<AttachmentRow>();
      return (result.results ?? []).map(rowToAttachment);
    } catch (cause) {
      this.#fail(cause);
    }
  }

  async countForOwner(ownerEntityId: string): Promise<number> {
    try {
      const row = await this.#db
        .prepare(
          `SELECT COUNT(*) AS total FROM attachments
            WHERE workspace_id = ? AND owner_entity_id = ?`,
        )
        .bind(this.#workspaceId, ownerEntityId)
        .first<{ readonly total: number }>();
      return row?.total ?? 0;
    } catch (cause) {
      this.#fail(cause);
    }
  }

  /**
   * The evidence on many records at once.
   *
   * ONE statement with a bound `IN` list and a per-owner window, so a collection
   * page costs one read regardless of how many rows it draws — the N+1 this
   * release is most likely to grow, closed by construction. The window function
   * is the same shape `listEntityLinksForEntities` uses for the same reason.
   */
  async listForOwners(
    ownerEntityIds: readonly string[],
    options: { readonly limitPerOwner?: number } = {},
  ): Promise<ReadonlyMap<string, readonly AttachmentRecord[]>> {
    const owners = [...new Set(ownerEntityIds)].filter(
      (id) => typeof id === "string" && id.length > 0,
    );
    const grouped = new Map<string, AttachmentRecord[]>();
    if (owners.length === 0) return grouped;

    const limitPerOwner = Math.min(
      Math.max(
        1,
        options.limitPerOwner ?? DEFAULT_ATTACHMENTS_PER_OWNER_IN_LIST,
      ),
      MAX_ATTACHMENTS_PER_RECORD,
    );
    // Placeholders are generated from the LENGTH of a validated array; every
    // value is still bound (AGENTS.md §17).
    const placeholders = owners.map(() => "?").join(", ");
    try {
      const result = await this.#db
        .prepare(
          `SELECT ${COLUMNS} FROM (
             SELECT ${COLUMNS},
                    ROW_NUMBER() OVER (
                      PARTITION BY owner_entity_id
                      ORDER BY created_at ASC, id ASC
                    ) AS rank_in_owner
               FROM attachments
              WHERE workspace_id = ?
                AND owner_entity_id IN (${placeholders})
           )
            WHERE rank_in_owner <= ?
            ORDER BY owner_entity_id ASC, created_at ASC, id ASC`,
        )
        .bind(this.#workspaceId, ...owners, limitPerOwner)
        .all<AttachmentRow>();
      for (const row of result.results ?? []) {
        const attachment = rowToAttachment(row);
        const bucket = grouped.get(attachment.ownerEntityId);
        if (bucket) bucket.push(attachment);
        else grouped.set(attachment.ownerEntityId, [attachment]);
      }
      return grouped;
    } catch (cause) {
      this.#fail(cause);
    }
  }

  async listAll(
    options: { readonly limit?: number } = {},
  ): Promise<readonly AttachmentRecord[]> {
    const limit = Math.min(
      Math.max(1, options.limit ?? MAX_ATTACHMENTS_PER_ARCHIVE),
      MAX_ATTACHMENTS_PER_ARCHIVE,
    );
    try {
      const result = await this.#db
        .prepare(
          `SELECT ${COLUMNS} FROM attachments
            WHERE workspace_id = ?
            ORDER BY id ASC
            LIMIT ?`,
        )
        .bind(this.#workspaceId, limit)
        .all<AttachmentRow>();
      return (result.results ?? []).map(rowToAttachment);
    } catch (cause) {
      this.#fail(cause);
    }
  }

  async deleteWithPurge(
    attachmentId: string,
  ): Promise<AttachmentRecord | null> {
    const existing = await this.get(attachmentId);
    if (existing === null) return null;
    const now = this.#clock();

    const remove = this.#db
      .prepare(`DELETE FROM attachments WHERE workspace_id = ? AND id = ?`)
      .bind(this.#workspaceId, attachmentId);

    /*
     * The ledger row goes in the SAME batch, and it goes FIRST.
     *
     * Two orderings are load-bearing here and they pull against each other:
     *
     *   - the ledger must be written in the delete's own transaction, so there
     *     is no window in which the metadata is gone and the bytes are owed to
     *     nobody (ADR-119 decision 6);
     *   - the Activity event's `changes() > 0` guard refers to the statement
     *     IMMEDIATELY BEFORE it, so the delete has to be the statement the
     *     event follows — otherwise a no-op ledger insert would suppress a real
     *     event.
     *
     * Putting the ledger first satisfies both. It is unconditional and
     * idempotent (`ON CONFLICT DO NOTHING`), so a concurrent loser queues a key
     * the winner has already queued and nothing is written twice; if the delete
     * then matches no row, the event is correctly suppressed and the ledger row
     * is a key that is already owed. The batch is one transaction either way.
     */
    const queue = this.#db
      .prepare(
        `INSERT INTO attachment_object_purges
           (workspace_id, storage_key, reason, queued_at, attempts)
         VALUES (?, ?, 'attachment_deleted', ?, 0)
         ON CONFLICT (workspace_id, storage_key) DO NOTHING`,
      )
      .bind(this.#workspaceId, existing.storageKey, toStorageTimestamp(now));

    try {
      await this.#db.batch([
        queue,
        remove,
        ...this.#appendStatements(
          ATTACHMENT_REMOVED,
          existing.ownerEntityId,
          { kind: this.#kindLabel(existing.mediaType) },
          now,
        ),
      ]);
    } catch (cause) {
      this.#fail(cause);
    }
    return existing;
  }

  async queuePurge(
    storageKey: string,
    reason: AttachmentPurgeReason,
  ): Promise<void> {
    try {
      await this.#db
        .prepare(
          `INSERT INTO attachment_object_purges
             (workspace_id, storage_key, reason, queued_at, attempts)
           VALUES (?, ?, ?, ?, 0)
           ON CONFLICT (workspace_id, storage_key) DO NOTHING`,
        )
        .bind(
          this.#workspaceId,
          storageKey,
          reason,
          toStorageTimestamp(this.#clock()),
        )
        .run();
    } catch (cause) {
      this.#fail(cause);
    }
  }

  async clearPurge(storageKey: string): Promise<void> {
    try {
      await this.#db
        .prepare(
          `DELETE FROM attachment_object_purges
            WHERE workspace_id = ? AND storage_key = ?`,
        )
        .bind(this.#workspaceId, storageKey)
        .run();
    } catch (cause) {
      this.#fail(cause);
    }
  }

  async listPurges(
    options: { readonly limit?: number } = {},
  ): Promise<readonly AttachmentObjectPurge[]> {
    const limit = Math.min(Math.max(1, options.limit ?? 25), 500);
    try {
      const result = await this.#db
        .prepare(
          `SELECT workspace_id, storage_key, reason, queued_at, attempts,
                  last_attempt_at, last_error
             FROM attachment_object_purges
            WHERE workspace_id = ?
            ORDER BY queued_at ASC, storage_key ASC
            LIMIT ?`,
        )
        .bind(this.#workspaceId, limit)
        .all<PurgeRow>();
      return (result.results ?? []).map(rowToPurge);
    } catch (cause) {
      this.#fail(cause);
    }
  }

  async recordPurgeAttempt(storageKey: string, error: string): Promise<void> {
    try {
      await this.#db
        .prepare(
          `UPDATE attachment_object_purges
              SET attempts = attempts + 1,
                  last_attempt_at = ?,
                  last_error = ?
            WHERE workspace_id = ? AND storage_key = ?`,
        )
        .bind(
          toStorageTimestamp(this.#clock()),
          // Bounded to the column's own CHECK. The caller passes a short
          // internal reason, never a provider message.
          error.slice(0, 200),
          this.#workspaceId,
          storageKey,
        )
        .run();
    } catch (cause) {
      this.#fail(cause);
    }
  }

  async #byOperationId(
    uploadOperationId: string,
  ): Promise<AttachmentRecord | null> {
    try {
      const row = await this.#db
        .prepare(
          `SELECT ${COLUMNS} FROM attachments
            WHERE workspace_id = ? AND upload_operation_id = ?`,
        )
        .bind(this.#workspaceId, uploadOperationId)
        .first<AttachmentRow>();
      return row === null ? null : rowToAttachment(row);
    } catch (cause) {
      this.#fail(cause);
    }
  }

  /** The media CLASS, which is all an Activity payload may carry. */
  #kindLabel(mediaType: string): string {
    return attachmentMediaType(mediaType)?.label ?? "File";
  }

  #appendStatements(
    type: string,
    ownerEntityId: string,
    payload: Record<string, string>,
    now: Date,
  ): D1PreparedStatement[] {
    const event: NewActivityEvent = {
      type,
      subjects: [{ entityId: ownerEntityId, role: SUBJECT_ROLE }],
      payload,
    };
    const model = buildActivityWriteModel(
      event,
      this.#actor.actor,
      this.#newId(),
      now,
    );
    return this.#recorder.buildAppendStatements(this.#workspaceId, model);
  }

  #fail(cause: unknown): never {
    if (
      cause instanceof AttachmentValidationError ||
      cause instanceof ActivityError
    ) {
      throw cause;
    }
    throw new AttachmentStorageWriteError({ cause });
  }
}

/** Construct the workspace-scoped attachment repository. */
export function createAttachmentRepository(
  db: D1Database,
  context: WorkspaceContext,
  options: D1AttachmentRepositoryOptions,
): AttachmentRepository {
  return new D1AttachmentRepository(db, context, options);
}
