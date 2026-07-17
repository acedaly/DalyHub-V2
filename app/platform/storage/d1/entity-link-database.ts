/**
 * FND-04 EntityLinks — D1 adapter boundary types and conversions.
 *
 * Owns the ONLY place the storage-facing snake_case `entity_links` row shape and
 * SQLite timestamp strings are allowed to exist, and converts raw rows into the
 * domain `EntityLinkRecord` / `EntityLinkView`, so those specifics never leak
 * past the adapter into the kernel contract (ADR-011; mirrors `database.ts` for
 * entities).
 */

import type {
  EntityLinkDirection,
  EntityLinkRecord,
  EntityLinkType,
  EntityLinkView,
} from "~/kernel/entity-links";
import { parseWorkspaceId } from "~/kernel/workspaces";

import { fromStorageTimestamp, rowToEntity, type EntityRow } from "./database";

/**
 * The raw `entity_links` row, exactly as stored in D1 (snake_case columns,
 * ISO-8601 UTC TEXT timestamps). Never exposed outside the adapter.
 */
export interface EntityLinkRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly source_entity_id: string;
  readonly target_entity_id: string;
  readonly type: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly deleted_at: string | null;
}

/**
 * Convert a raw `entity_links` row into a domain `EntityLinkRecord`. Pure and
 * total: it assumes the row satisfies the table's NOT NULL / CHECK constraints
 * (the adapter only ever passes rows read straight from `entity_links`). The id
 * and type are re-branded through their parsers so the branded invariants hold
 * even for rows read back from storage.
 */
export function rowToEntityLink(row: EntityLinkRow): EntityLinkRecord {
  return {
    id: row.id,
    workspaceId: parseWorkspaceId(row.workspace_id),
    sourceEntityId: row.source_entity_id,
    targetEntityId: row.target_entity_id,
    // Stored verbatim after validation on write; re-cast to the branded type.
    type: row.type as EntityLinkType,
    createdAt: fromStorageTimestamp(row.created_at),
    updatedAt: fromStorageTimestamp(row.updated_at),
    deletedAt:
      row.deleted_at === null ? null : fromStorageTimestamp(row.deleted_at),
  };
}

/**
 * The projected row of a `listForEntity` JOIN: the link columns (aliased `link_`),
 * the direction literal chosen per branch, and the counterpart entity columns
 * (aliased `cp_`). Selecting the counterpart in the SAME query is what makes the
 * listing free of N+1 lookups.
 */
export interface EntityLinkViewRow {
  readonly link_id: string;
  readonly link_workspace_id: string;
  readonly link_source_entity_id: string;
  readonly link_target_entity_id: string;
  readonly link_type: string;
  readonly link_created_at: string;
  readonly link_updated_at: string;
  readonly link_deleted_at: string | null;
  readonly direction: EntityLinkDirection;
  readonly cp_id: string;
  readonly cp_workspace_id: string;
  readonly cp_type: string;
  readonly cp_title: string;
  readonly cp_created_at: string;
  readonly cp_updated_at: string;
  readonly cp_deleted_at: string | null;
}

/** Convert a joined view row into a domain `EntityLinkView`. */
export function viewRowToEntityLinkView(
  row: EntityLinkViewRow,
): EntityLinkView {
  const link = rowToEntityLink({
    id: row.link_id,
    workspace_id: row.link_workspace_id,
    source_entity_id: row.link_source_entity_id,
    target_entity_id: row.link_target_entity_id,
    type: row.link_type,
    created_at: row.link_created_at,
    updated_at: row.link_updated_at,
    deleted_at: row.link_deleted_at,
  });

  const counterpartRow: EntityRow = {
    id: row.cp_id,
    workspace_id: row.cp_workspace_id,
    type: row.cp_type,
    title: row.cp_title,
    created_at: row.cp_created_at,
    updated_at: row.cp_updated_at,
    deleted_at: row.cp_deleted_at,
  };

  return {
    link,
    direction: row.direction,
    counterpart: rowToEntity(counterpartRow),
  };
}
