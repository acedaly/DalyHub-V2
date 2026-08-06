/**
 * AREA-05 Area Settings — D1 implementation of the workspace-bound
 * `AreaSettingsRepository`.
 *
 * The reversible archival transition, built on the SAME established DalyHub
 * mutation pattern as `D1ProjectSettingsRepository.archive`/`restore`
 * (ADR-037) and the spine's own lifecycle mutations:
 *
 *   - the precondition (the Area exists and is active; whether it is already in
 *     the target archival state) is folded into the ONE conditional statement's
 *     `WHERE`/`EXISTS` clauses — never a separate precondition `SELECT` followed by
 *     an unconditional write — so a race between the read and the write is
 *     evaluated at the statement's own commit;
 *   - the statement always carries `RETURNING`, and the caller inspects
 *     `changes()` (via the shared `recordAtomicMutation` seam) before deciding the
 *     outcome — a guard miss is never reported as success;
 *   - the domain write and its Activity append run in the SAME `D1Database.batch()`
 *     (ADR-012), so a no-op appends nothing and an Activity-insert failure rolls
 *     the domain write back too;
 *   - a guard miss is reconciled by RE-READING the fresh state and classifying
 *     honestly, never by trusting a stale read.
 *
 * Unlike a Project, archiving an Area is ALWAYS allowed on an active Area (it
 * preserves every child Goal/Project/Task, link and Activity — it is not a delete
 * and never cascades), so there is no "blocked archive" branch. Permanent deletion
 * is the SpineRepository's authority, not this slice's.
 */

import {
  buildActivityWriteModel,
  createSystemActorContext,
  secureIdGenerator,
  type ActivityActorContext,
  type NewActivityEvent,
} from "~/kernel/activity";
import {
  AREA_ARCHIVED,
  AREA_RESTORED,
  AreaSettingsNotFoundError,
  AreaSettingsStorageError,
  type AreaSettingsChangeResult,
  type AreaSettingsRecord,
  type AreaSettingsRepository,
} from "~/kernel/area-settings";
import {
  AREA,
  systemClock,
  type Clock,
  type IdGenerator,
} from "~/kernel/spine";
import { parseWorkspaceId, type WorkspaceContext } from "~/kernel/workspaces";

import { D1ActivityRecorder } from "./d1-activity-recorder";
import {
  recordAtomicMutation,
  type AtomicMutationFault,
} from "./d1-atomic-mutation";
import { fromStorageTimestamp, toStorageTimestamp } from "./database";
import {
  normaliseEntityIconKey,
  type EntityIconKey,
} from "~/kernel/entities/entity-icon-keys";

/** The `area_details` row shape this adapter reads/writes, exactly as stored. */
interface AreaDetailsRow {
  readonly archived_at: string | null;
  readonly icon_key: string | null;
}

export type D1AreaSettingsRepositoryOptions = {
  readonly actorContext?: ActivityActorContext;
  readonly clock?: Clock;
  readonly idGenerator?: IdGenerator;
  /** TEST-ONLY: force the atomic mutation's batch to fail at a chosen point,
   * proving the domain write rolls back with it. Never set in production. */
  readonly mutationFault?: AtomicMutationFault;
};

export class D1AreaSettingsRepository implements AreaSettingsRepository {
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
    options?: D1AreaSettingsRepositoryOptions,
  ) {
    this.#db = db;
    this.#workspaceId = context.workspaceId;
    this.#actor = options?.actorContext ?? createSystemActorContext();
    this.#clock = options?.clock ?? systemClock;
    this.#id = options?.idGenerator ?? secureIdGenerator;
    this.#recorder = new D1ActivityRecorder(db);
    this.#fault = options?.mutationFault;
  }

  async get(id: string): Promise<AreaSettingsRecord | null> {
    const row = await this.#row(id);
    if (!row) return null;
    return this.#record(id, row.archived_at, row.icon_key);
  }

  /**
   * Archive: hide the Area from active collections and creation pickers while it
   * stays readable by URL and every descendant is preserved. Reversible. The
   * precondition (an active Area that is not already archived) is folded into the
   * SAME conditional write — a concurrent archive/restore racing this statement is
   * resolved at commit, never against a stale read. A no-op (already archived)
   * appends no Activity.
   */
  async archive(id: string): Promise<AreaSettingsChangeResult> {
    const current = await this.#require(id);
    if (current.archivedAt) {
      return { settings: current, changed: false };
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);

    const domainStatement = this.#db
      .prepare(
        `INSERT INTO area_details (workspace_id, entity_id, entity_type, archived_at, updated_at)
         SELECT ?, ?, '${AREA}', ?, ?
         WHERE EXISTS (${this.#activeAreaExistsSql})
           AND NOT EXISTS (
                 SELECT 1 FROM area_details
                 WHERE workspace_id = ? AND entity_id = ? AND archived_at IS NOT NULL
               )
         ON CONFLICT (workspace_id, entity_id) DO UPDATE SET
           archived_at = excluded.archived_at, updated_at = excluded.updated_at
         WHERE area_details.archived_at IS NULL
         RETURNING archived_at, icon_key`,
      )
      .bind(
        // SELECT: workspace_id, entity_id, archived_at, updated_at
        this.#workspaceId,
        id,
        nowTs,
        nowTs,
        // EXISTS (#activeAreaExistsSql): workspace_id, id
        this.#workspaceId,
        id,
        // NOT EXISTS (already-archived guard): workspace_id, entity_id
        this.#workspaceId,
        id,
      );

    const event: NewActivityEvent = {
      type: AREA_ARCHIVED,
      subjects: [{ entityId: id, role: "subject" }],
      payload: { archivedAt: nowTs },
    };
    const result = await this.#runAtomic<AreaDetailsRow>(
      event,
      domainStatement,
      now,
    );

    if (result.changed && result.row) {
      return {
        settings: this.#record(id, result.row.archived_at, result.row.icon_key),
        changed: true,
      };
    }

    // Nothing changed: a concurrent archive already won, or the Area became
    // inactive. Re-read and report the fresh state honestly.
    const refreshed = await this.get(id);
    if (!refreshed) {
      throw new AreaSettingsNotFoundError();
    }
    return { settings: refreshed, changed: false };
  }

  /** Restore an archived Area back into the active collection. Always allowed
   * (there is nothing to re-validate on the way back — descendants were never
   * touched). Reversible, idempotent. */
  async restore(id: string): Promise<AreaSettingsChangeResult> {
    const current = await this.#require(id);
    if (!current.archivedAt) {
      return { settings: current, changed: false };
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);

    const domainStatement = this.#db
      .prepare(
        `UPDATE area_details SET archived_at = NULL, updated_at = ?
         WHERE workspace_id = ? AND entity_id = ? AND archived_at IS NOT NULL
           AND EXISTS (${this.#activeAreaExistsSql})
         RETURNING archived_at, icon_key`,
      )
      .bind(nowTs, this.#workspaceId, id, this.#workspaceId, id);

    const event: NewActivityEvent = {
      type: AREA_RESTORED,
      subjects: [{ entityId: id, role: "subject" }],
      payload: { restoredAt: nowTs },
    };
    const result = await this.#runAtomic<AreaDetailsRow>(
      event,
      domainStatement,
      now,
    );

    if (result.changed && result.row) {
      return {
        settings: this.#record(id, result.row.archived_at, result.row.icon_key),
        changed: true,
      };
    }

    const refreshed = await this.get(id);
    if (!refreshed) {
      throw new AreaSettingsNotFoundError();
    }
    return { settings: refreshed, changed: false };
  }

  /* ---------------------------------------------------------------------- */
  /* Internals                                                              */
  /* ---------------------------------------------------------------------- */

  /** Reusable EXISTS clause: an active AREA entity in this workspace. Binds
   * `(workspaceId, id)` at each embedding site, in source order. */
  get #activeAreaExistsSql(): string {
    return `SELECT 1 FROM entities
            WHERE workspace_id = ? AND id = ? AND type = '${AREA}' AND deleted_at IS NULL`;
  }

  async #require(id: string): Promise<AreaSettingsRecord> {
    const value = await this.get(id);
    if (!value) throw new AreaSettingsNotFoundError();
    return value;
  }

  /** Read the current settings row. Missing, soft-deleted, wrong-kind and
   * cross-workspace ids all resolve to `null` — the calm not-found contract. An
   * active Area with no `area_details` row resolves to `{ archived_at: null }`. */
  async #row(id: string): Promise<AreaDetailsRow | null> {
    try {
      const row = await this.#db
        .prepare(
          `SELECT d.archived_at AS archived_at, d.icon_key AS icon_key
           FROM entities e
           LEFT JOIN area_details d
             ON d.workspace_id = e.workspace_id AND d.entity_id = e.id
           WHERE e.workspace_id = ? AND e.id = ? AND e.type = '${AREA}' AND e.deleted_at IS NULL
           LIMIT 1`,
        )
        .bind(this.#workspaceId, id)
        .first<AreaDetailsRow>();
      return row ?? null;
    } catch (cause) {
      throw new AreaSettingsStorageError({ cause });
    }
  }

  /*
   * `normaliseEntityIconKey` on the way OUT, not just on the way in.
   *
   * The column is deliberately unconstrained (migration 0032), and a key can
   * outlive the catalogue entry that produced it — an icon removed in a later
   * release, a row restored from an older export, a hand-edited row. Normalising
   * here means an unrecognised value becomes `null` at the kernel boundary
   * rather than being handed to the UI typed as if this build understood it. The
   * record then renders its entity default, which is the documented fallback.
   */
  #record(
    id: string,
    archived: string | null,
    iconKey: string | null,
  ): AreaSettingsRecord {
    return {
      id,
      workspaceId: parseWorkspaceId(this.#workspaceId),
      archivedAt: archived ? fromStorageTimestamp(archived) : null,
      iconKey: normaliseEntityIconKey(iconKey),
    };
  }

  /**
   * Choose (or clear) the Area's icon.
   *
   * An upsert, because `area_details` is sparse: an Area that has never been
   * archived has no row at all, and choosing an icon must create one rather than
   * silently doing nothing. The `EXISTS` guard keeps the same contract every
   * other write here has — the Area must exist, be an Area, and not be
   * soft-deleted — resolved at commit rather than against a stale read.
   *
   * `null` clears the choice and is a legitimate value, not a failure: it is what
   * "reset to default" stores. Validation of a NON-null key belongs at the route
   * boundary, which refuses an unrecognised one rather than quietly storing
   * nothing; by the time a key reaches here it is already a member of the
   * vocabulary.
   *
   * No Activity event. The lifecycle events in this slice mark transitions that
   * change what an Area IS to the rest of the product — archived, restored,
   * deleted. Choosing a glyph changes how it is drawn, and an activity feed that
   * records every appearance tweak buries the events that matter.
   */
  async setIcon(
    id: string,
    iconKey: EntityIconKey | null,
  ): Promise<AreaSettingsRecord> {
    const current = await this.#require(id);
    const nowTs = toStorageTimestamp(this.#clock());
    try {
      await this.#db
        .prepare(
          `INSERT INTO area_details (workspace_id, entity_id, entity_type, icon_key, updated_at)
           SELECT ?, ?, '${AREA}', ?, ?
           WHERE EXISTS (${this.#activeAreaExistsSql})
           ON CONFLICT (workspace_id, entity_id) DO UPDATE SET
             icon_key = excluded.icon_key, updated_at = excluded.updated_at`,
        )
        .bind(this.#workspaceId, id, iconKey, nowTs, this.#workspaceId, id)
        .run();
    } catch (cause) {
      throw new AreaSettingsStorageError({ cause });
    }
    return { ...current, iconKey };
  }

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
      throw new AreaSettingsStorageError({ cause });
    }
  }
}
