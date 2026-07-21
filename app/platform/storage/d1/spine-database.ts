/**
 * FND-07 Spine — D1 adapter boundary types and conversions.
 *
 * Owns the ONLY place the storage-facing `spine_records` snake_case shape and the
 * joined spine read-row exist, and converts raw rows into the domain
 * `SpineRecord`, so those specifics never leak past the adapter into the kernel
 * contract (ADR-014 §5; mirrors `database.ts` and `entity-link-database.ts`).
 *
 * A spine read joins three tables — `entities` (the shared header), `spine_records`
 * (the additive completion state) and, via a single active structural EntityLink,
 * the record's parent — so one row carries everything a `SpineRecord` needs
 * without an N+1 parent lookup.
 */

import {
  CorruptSpineRecordError,
  parentKindOfLinkType,
  RESERVED_SPINE_LINK_TYPES,
  isSpineKind,
  type SpineParent,
  type SpineRecord,
  type SpineKind,
  type SpineLinkType,
} from "~/kernel/spine";
import { parseWorkspaceId } from "~/kernel/workspaces";

import { fromStorageTimestamp, type EntityRow } from "./database";

/**
 * The raw `spine_records` row, exactly as stored in D1. Never exposed outside the
 * adapter.
 */
export interface SpineStateRow {
  readonly workspace_id: string;
  readonly entity_id: string;
  readonly kind: string;
  readonly completed_at: string | null;
}

/**
 * The projected row of a spine read: the entity header, the spine completion
 * state, and the record's single active structural parent (both parent columns
 * null for an Area or an orphaned read). Column aliases keep the join unambiguous.
 */
export interface SpineJoinedRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly type: string;
  readonly title: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly deleted_at: string | null;
  readonly completed_at: string | null;
  readonly parent_id: string | null;
  readonly parent_link_type: string | null;
}

/** The entity + spine columns a joined read selects, aliased for `SpineJoinedRow`. */
export const SPINE_JOINED_COLUMNS = `
  e.id AS id,
  e.workspace_id AS workspace_id,
  e.type AS type,
  e.title AS title,
  e.created_at AS created_at,
  e.updated_at AS updated_at,
  e.deleted_at AS deleted_at,
  sr.completed_at AS completed_at`;

/**
 * Convert a joined spine read-row into a domain `SpineRecord`. Total but
 * DEFENSIVE: the schema's composite foreign key makes `kind`/`type` disagreement
 * unreachable, but a row that somehow violates it — or an Area carrying a
 * structural parent link — is surfaced as `CorruptSpineRecordError` rather than
 * silently coerced.
 */
export function rowToSpineRecord(row: SpineJoinedRow): SpineRecord {
  if (!isSpineKind(row.type)) {
    throw new CorruptSpineRecordError();
  }
  const kind: SpineKind = row.type;

  let parent: SpineParent | null = null;
  if (row.parent_id !== null && row.parent_link_type !== null) {
    if (
      kind === "area" ||
      !RESERVED_SPINE_LINK_TYPES.has(row.parent_link_type)
    ) {
      // An Area has no structural parent; a non-structural link is not a parent.
      throw new CorruptSpineRecordError();
    }
    parent = {
      kind: parentKindOfLinkType(row.parent_link_type as SpineLinkType),
      id: row.parent_id,
    };
  }

  return {
    id: row.id,
    workspaceId: parseWorkspaceId(row.workspace_id),
    kind,
    title: row.title,
    createdAt: fromStorageTimestamp(row.created_at),
    updatedAt: fromStorageTimestamp(row.updated_at),
    deletedAt:
      row.deleted_at === null ? null : fromStorageTimestamp(row.deleted_at),
    completedAt:
      row.completed_at === null ? null : fromStorageTimestamp(row.completed_at),
    parent,
  };
}

/** The entity columns a completion mutation returns, matching {@link EntityRow}. */
const ENTITY_RETURNING_COLUMNS =
  "id, workspace_id, type, title, created_at, updated_at, deleted_at";

/**
 * The guarded spine-completion statement: set `completed_at` for an ACTIVE,
 * not-yet-completed record in the workspace, RETURNING its id. Matches nothing (an
 * idempotent no-op) when the record is already completed or no longer active, so a
 * delete racing a completion cannot change completion state.
 *
 * Extracted here so the FND-07 SpineRepository (the completion authority) and the
 * TaskRepository's atomic complete-and-clear-waiting operation (ADR-029) build the
 * SAME statement — the completion SQL lives in ONE place, never duplicated.
 */
export function buildSpineCompleteStatement(
  db: D1Database,
  workspaceId: string,
  entityId: string,
  nowTs: string,
): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE spine_records SET completed_at = ?
       WHERE workspace_id = ? AND entity_id = ? AND completed_at IS NULL
         AND EXISTS (SELECT 1 FROM entities
                     WHERE workspace_id = ? AND id = ? AND deleted_at IS NULL)
       RETURNING entity_id`,
    )
    .bind(nowTs, workspaceId, entityId, workspaceId, entityId);
}

/**
 * The guarded entity `updated_at` bump used as the completion Activity anchor:
 * advance `updated_at` for an active record ONLY when the immediately-preceding
 * statement changed a row (`changes() > 0`), RETURNING the fresh entity row. Shared
 * by the spine completion/reopen paths and the task complete-and-clear operation,
 * so a losing racer or a no-op causes no churn and appends nothing.
 */
export function buildEntityUpdatedAtBumpStatement(
  db: D1Database,
  workspaceId: string,
  entityId: string,
  nowTs: string,
): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE entities SET updated_at = ?
       WHERE workspace_id = ? AND id = ? AND deleted_at IS NULL AND changes() > 0
       RETURNING ${ENTITY_RETURNING_COLUMNS}`,
    )
    .bind(nowTs, workspaceId, entityId);
}

/**
 * Compose a `SpineRecord` from a raw `entities` RETURNING row plus the spine
 * state the caller already knows (its kind, its completion timestamp and its
 * resolved parent). Used on the write paths, where a mutation's atomic batch
 * returns the entity row and the parent/completion are known from the input —
 * so no extra read is needed to return the fresh record.
 */
export function composeSpineRecord(
  entityRow: EntityRow,
  kind: SpineKind,
  completedAt: Date | null,
  parent: SpineParent | null,
): SpineRecord {
  return {
    id: entityRow.id,
    workspaceId: parseWorkspaceId(entityRow.workspace_id),
    kind,
    title: entityRow.title,
    createdAt: fromStorageTimestamp(entityRow.created_at),
    updatedAt: fromStorageTimestamp(entityRow.updated_at),
    deletedAt:
      entityRow.deleted_at === null
        ? null
        : fromStorageTimestamp(entityRow.deleted_at),
    completedAt,
    parent,
  };
}
