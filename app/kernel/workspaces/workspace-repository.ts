/**
 * FND-03 Workspace kernel — the workspace repository contract.
 *
 * This is a LOW-LEVEL platform/bootstrap concern, NOT a module-facing contract.
 * It exists so the server composition boundary can create and verify workspace
 * records while establishing a `WorkspaceContext`. Ordinary modules never see
 * this interface — they receive only a `WorkspaceContext` and workspace-scoped
 * domain repositories (ADR-010).
 *
 * The surface is deliberately minimal: only what is needed to ESTABLISH and
 * VERIFY the boundary. There is intentionally no list-all-workspaces (for
 * modules), no delete, no membership, no switching and no preferences. There is
 * no public hard-delete of a workspace, and the database's `ON DELETE RESTRICT`
 * prevents removing a workspace that still owns entities.
 *
 * Error semantics (thrown as the typed errors in `workspace-errors.ts`):
 *   - invalid id      → `WorkspaceValidationError` (no data is written)
 *   - duplicate id    → `WorkspaceConflictError`
 *   - storage failure → `WorkspaceStorageError`
 */

import type { WorkspaceId, WorkspaceRecord } from "./workspace";

/** Input to create a workspace. An explicit id may be supplied (e.g. to adopt a
 * pre-existing scope id); when omitted the repository generates a fresh one with
 * `crypto.randomUUID()`. Timestamps are always generated internally. */
export type CreateWorkspaceInput = {
  readonly id?: WorkspaceId;
};

export interface WorkspaceRepository {
  /**
   * Create a workspace. Generates `id` (unless supplied) and both timestamps
   * internally. Throws `WorkspaceConflictError` if the id already exists, so a
   * duplicate can never silently overwrite an existing boundary.
   */
  create(input?: CreateWorkspaceInput): Promise<WorkspaceRecord>;

  /** Read one workspace by id. Returns null when no such workspace exists. */
  getById(id: WorkspaceId): Promise<WorkspaceRecord | null>;

  /** True when a workspace with the given id exists. */
  exists(id: WorkspaceId): Promise<boolean>;
}
