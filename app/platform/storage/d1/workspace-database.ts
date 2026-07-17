/**
 * FND-03 Workspace kernel — D1 adapter boundary for workspace rows.
 *
 * Owns the conversion between the raw `workspaces` row (snake_case columns,
 * ISO-8601 UTC TEXT timestamps) and the domain `WorkspaceRecord`, so storage
 * specifics never leak past the adapter (mirrors `database.ts` for entities).
 */

import { parseWorkspaceId, type WorkspaceRecord } from "~/kernel/workspaces";

import { fromStorageTimestamp } from "./database";

/** The raw `workspaces` row exactly as stored in D1. Never exposed outside the
 * adapter. */
export interface WorkspaceRow {
  readonly id: string;
  readonly created_at: string;
  readonly updated_at: string;
}

/**
 * Convert a raw D1 row into a domain `WorkspaceRecord`. Re-validates the id
 * through `parseWorkspaceId` so the branded `WorkspaceId` invariant holds even
 * for rows read back from storage.
 */
export function rowToWorkspace(row: WorkspaceRow): WorkspaceRecord {
  return {
    id: parseWorkspaceId(row.id),
    createdAt: fromStorageTimestamp(row.created_at),
    updatedAt: fromStorageTimestamp(row.updated_at),
  };
}
