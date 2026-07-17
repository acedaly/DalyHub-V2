/**
 * FND-02 Data kernel — D1 adapter boundary types and conversions.
 *
 * This module owns the ONLY place storage-facing snake_case and SQLite string
 * timestamps are allowed to exist. It converts between the raw `entities` row
 * shape and the domain `EntityRecord`, so those specifics never leak past the
 * adapter into the kernel contract (see ADR-009).
 */

import type { EntityRecord } from "~/kernel/entities";

/**
 * The raw `entities` row, exactly as stored in D1 (snake_case columns, ISO-8601
 * UTC TEXT timestamps). Never exposed outside the adapter.
 */
export interface EntityRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly type: string;
  readonly title: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly deleted_at: string | null;
}

/**
 * Format a `Date` as the canonical storage timestamp: ISO-8601 in UTC with
 * millisecond precision (e.g. `2026-07-17T12:34:56.789Z`). Application-generated
 * so database and application time never disagree; fixed-width and
 * lexicographically chronological so it also serves as a stable sort key.
 */
export function toStorageTimestamp(date: Date): string {
  return date.toISOString();
}

/** Parse a stored ISO-8601 UTC timestamp back into a `Date`. */
export function fromStorageTimestamp(value: string): Date {
  return new Date(value);
}

/**
 * Convert a raw D1 row into a domain `EntityRecord`. Pure and total: it assumes
 * the row satisfies the table's NOT NULL / CHECK constraints (the adapter only
 * ever passes rows read straight from `entities`).
 */
export function rowToEntity(row: EntityRow): EntityRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    type: row.type,
    title: row.title,
    createdAt: fromStorageTimestamp(row.created_at),
    updatedAt: fromStorageTimestamp(row.updated_at),
    deletedAt:
      row.deleted_at === null ? null : fromStorageTimestamp(row.deleted_at),
  };
}
