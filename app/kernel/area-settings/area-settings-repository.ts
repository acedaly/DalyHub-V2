/**
 * AREA-05 Area Settings — workspace-bound repository contract.
 *
 * Bound to a `WorkspaceContext` at construction; no method accepts a workspace id
 * (ADR-010). It owns ONLY the reversible archival transition. Archive is always
 * allowed on an active Area — it preserves every child Goal/Project/Task, link and
 * Activity untouched; it is not a delete and never cascades. Restore is always
 * allowed on an archived Area. Both are idempotent and atomic with their Activity
 * event (ADR-012), mirroring `ProjectSettingsRepository.archive`/`restore`.
 */

import type {
  AreaSettingsChangeResult,
  AreaSettingsRecord,
} from "./area-settings";

export interface AreaSettingsRepository {
  /**
   * Read the Area's archival settings. Returns `null` for missing, soft-deleted,
   * wrong-kind or cross-workspace ids — the calm not-found contract, disclosing
   * nothing about other workspaces. An Area with no `area_details` row resolves to
   * the default (`archivedAt: null`), never `null`.
   */
  get(id: string): Promise<AreaSettingsRecord | null>;

  /**
   * Archive the Area: hide it from active collections and creation pickers while
   * keeping it readable by its canonical URL and preserving all descendants. A
   * no-op when already archived. Appends `area.archived` on a real transition.
   */
  archive(id: string): Promise<AreaSettingsChangeResult>;

  /**
   * Restore an archived Area back into the active collection. A no-op when already
   * active. Appends `area.restored` on a real transition.
   */
  restore(id: string): Promise<AreaSettingsChangeResult>;
}
