/**
 * NOTES-01A Note Details — D1 implementation of the workspace-bound
 * `NoteDetailsRepository`.
 *
 * `update` is ONE conditional SQL statement — never a separate precondition
 * read followed by an unconditional write — mirroring the established DalyHub
 * mutation pattern (`D1GoalDetailsRepository`, `D1ProjectSettingsRepository`):
 * the precondition (an ACTIVE Note in this workspace) is folded directly into
 * the statement's `WHERE EXISTS` clause, so a Note soft-deleted between the
 * read and the write cannot commit an orphaned details row. The domain write
 * and its `note.content_updated` Activity append run in the SAME
 * `D1Database.batch()` as `recordAtomicMutation` (ADR-012) — a no-op appends
 * nothing, and an Activity-insert failure rolls the details write back too.
 *
 * The idempotency check at the top of `update` compares against a value read
 * BEFORE the write (needed to short-circuit an obvious no-op without touching
 * storage), so two concurrent submissions of the SAME new content can both
 * pass it and reach the SQL. The `ON CONFLICT DO UPDATE`'s own
 * `WHERE note_details.content != excluded.content` predicate is the real,
 * storage-level guard: whichever request loses the race finds the content
 * already written and its UPDATE is skipped, so it changes nothing and
 * appends no Activity — `update` reconciles that outcome as an idempotent
 * success rather than a conflict (see the comment at the reconciliation
 * branch below). This keeps "identical content never appends a second
 * Activity event" true under genuine concurrency, not just for sequential
 * calls.
 */

import {
  buildActivityWriteModel,
  createSystemActorContext,
  secureIdGenerator,
  systemClock,
  type ActivityActorContext,
  type Clock,
  type IdGenerator,
  type NewActivityEvent,
} from "~/kernel/activity";
import {
  NOTE_CONTENT_UPDATED,
  NOTE_ENTITY_TYPE,
  NoteDetailsConflictError,
  NoteDetailsNotFoundError,
  NoteDetailsStorageError,
  validateNoteContent,
  type NoteDetailsChangeResult,
  type NoteDetailsRecord,
  type NoteDetailsRepository,
} from "~/kernel/notes";
import { parseWorkspaceId, type WorkspaceContext } from "~/kernel/workspaces";

import { D1ActivityRecorder } from "./d1-activity-recorder";
import {
  recordAtomicMutation,
  type AtomicMutationFault,
} from "./d1-atomic-mutation";
import { fromStorageTimestamp, toStorageTimestamp } from "./database";

/** The `note_details` row shape this adapter reads/writes, exactly as stored. */
interface NoteDetailsRow {
  readonly content: string;
  readonly updated_at: string;
}

export type D1NoteDetailsRepositoryOptions = {
  readonly actorContext?: ActivityActorContext;
  readonly clock?: Clock;
  readonly idGenerator?: IdGenerator;
  /** TEST-ONLY: force the atomic mutation's batch to fail at a chosen point,
   * proving the details write rolls back with it. Never set in production. */
  readonly mutationFault?: AtomicMutationFault;
};

export class D1NoteDetailsRepository implements NoteDetailsRepository {
  readonly #db: D1Database;
  readonly #workspaceId: string;
  readonly #actor: ActivityActorContext;
  readonly #clock: Clock;
  readonly #id: IdGenerator;
  readonly #recorder: D1ActivityRecorder;
  readonly #fault?: AtomicMutationFault;

  constructor(
    db: D1Database,
    context: WorkspaceContext,
    options?: D1NoteDetailsRepositoryOptions,
  ) {
    this.#db = db;
    this.#workspaceId = context.workspaceId;
    this.#actor = options?.actorContext ?? createSystemActorContext();
    this.#clock = options?.clock ?? systemClock;
    this.#id = options?.idGenerator ?? secureIdGenerator;
    this.#recorder = new D1ActivityRecorder(db);
    this.#fault = options?.mutationFault;
  }

  async get(id: string): Promise<NoteDetailsRecord | null> {
    const row = await this.#row(id);
    if (!row) return null;
    return this.#record(id, row.content, row.updated_at);
  }

  async update(id: string, content: string): Promise<NoteDetailsChangeResult> {
    const current = await this.#require(id);
    const validated = validateNoteContent(content);

    if (validated === current.content) {
      return { details: current, changed: false };
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);

    const domainStatement = this.#db
      .prepare(
        `INSERT INTO note_details
           (workspace_id, entity_id, content, updated_at)
         SELECT ?, ?, ?, ?
         WHERE EXISTS (
                 SELECT 1 FROM entities
                 WHERE workspace_id = ? AND id = ? AND type = '${NOTE_ENTITY_TYPE}'
                       AND deleted_at IS NULL
               )
         ON CONFLICT (workspace_id, entity_id) DO UPDATE SET
           content = excluded.content,
           updated_at = excluded.updated_at
         WHERE note_details.content != excluded.content
         RETURNING content, updated_at`,
      )
      .bind(this.#workspaceId, id, validated, nowTs, this.#workspaceId, id);

    const event: NewActivityEvent = {
      type: NOTE_CONTENT_UPDATED,
      subjects: [{ entityId: id, role: "subject" }],
      payload: { empty: validated.length === 0 },
    };

    const result = await this.#runAtomic<NoteDetailsRow>(
      event,
      domainStatement,
      now,
    );

    if (result.changed && result.row) {
      return {
        details: this.#record(id, result.row.content, result.row.updated_at),
        changed: true,
      };
    }

    // The gate failed. Two distinct causes look identical here — the Note was
    // soft-deleted (or otherwise became unavailable) between the read above
    // and this statement's execution, OR a concurrent duplicate submission
    // already wrote this exact content first (the `WHERE note_details.content
    // != excluded.content` predicate skipped a genuine no-op UPDATE). Reconcile
    // honestly rather than assume the stale read still holds.
    const refreshed = await this.get(id);
    if (!refreshed) {
      throw new NoteDetailsNotFoundError();
    }
    if (refreshed.content === validated) {
      // A concurrent racer already stored this exact content: a benign,
      // idempotent no-op — not a conflict, and no second Activity event.
      return { details: refreshed, changed: false };
    }
    throw new NoteDetailsConflictError();
  }

  /* ---------------------------------------------------------------------- */
  /* Internals                                                              */
  /* ---------------------------------------------------------------------- */

  async #require(id: string): Promise<NoteDetailsRecord> {
    const value = await this.get(id);
    if (!value) throw new NoteDetailsNotFoundError();
    return value;
  }

  /** Read the current details row. Missing, deleted, wrong-type and
   * cross-workspace ids all resolve to `null` — the calm not-found contract. */
  async #row(id: string): Promise<NoteDetailsRow | null> {
    try {
      const row = await this.#db
        .prepare(
          `SELECT d.content AS content, d.updated_at AS updated_at
           FROM entities e
           LEFT JOIN note_details d
             ON d.workspace_id = e.workspace_id AND d.entity_id = e.id
           WHERE e.workspace_id = ? AND e.id = ? AND e.type = '${NOTE_ENTITY_TYPE}'
                 AND e.deleted_at IS NULL
           LIMIT 1`,
        )
        .bind(this.#workspaceId, id)
        .first<NoteDetailsRow>();
      return row ?? null;
    } catch (cause) {
      throw new NoteDetailsStorageError({ cause });
    }
  }

  /**
   * Build a `NoteDetailsRecord` from a stored row — never an unchecked cast. A
   * Note with no `note_details` row (both columns `NULL` from the LEFT JOIN)
   * reads back as validated empty content with no content timestamp. A
   * malformed stored `content` value (impossible under `parseMarkdownSource`
   * except for genuinely corrupt storage state) fails honestly as a storage
   * error rather than being silently coerced.
   */
  #record(
    id: string,
    content: string | null,
    updatedAt: string | null,
  ): NoteDetailsRecord {
    let validatedContent;
    try {
      validatedContent = validateNoteContent(content ?? "");
    } catch (cause) {
      throw new NoteDetailsStorageError({ cause });
    }
    return {
      id,
      workspaceId: parseWorkspaceId(this.#workspaceId),
      content: validatedContent,
      contentUpdatedAt: updatedAt ? fromStorageTimestamp(updatedAt) : null,
    };
  }

  /**
   * Execute the domain statement and its Activity event atomically via the
   * SHARED `recordAtomicMutation` seam (ADR-012) — the same mechanism the
   * Entity/EntityLink/GoalDetails repositories use, never a bespoke
   * transaction.
   */
  async #runAtomic<TRow>(
    event: NewActivityEvent,
    domainStatement: D1PreparedStatement,
    now: Date,
  ) {
    const model = buildActivityWriteModel(
      event,
      this.#actor.actor,
      this.#id(),
      now,
    );
    try {
      return await recordAtomicMutation<TRow>({
        db: this.#db,
        workspaceId: this.#workspaceId,
        domainStatement,
        recorder: this.#recorder,
        model,
        fault: this.#fault,
      });
    } catch (cause) {
      throw new NoteDetailsStorageError({ cause });
    }
  }
}
