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

import type { EntityIconKey } from "~/kernel/entities/entity-icon-keys";
import type { IdentityColourSlot } from "~/kernel/entities/identity-colour-slots";

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

  /**
   * Choose (or clear) the Area's IDENTITY — its icon and its colour together —
   * returning the settings that now apply.
   *
   * One method rather than two because the owner picks both in one surface and
   * applies them once. Two writes would give a half-applied identity a moment to
   * exist, and give the failure path two different things to undo.
   *
   * `null` on either field clears that choice — a legitimate value, not a
   * failure: it is what "reset to default" and "Automatic" store, and the Area
   * then renders its entity icon and its derived colour. A NON-null value is
   * expected to be a member of its vocabulary already; refusing an unrecognised
   * one is the route boundary's job, so that an owner is told their choice was
   * rejected rather than seeing it silently become "no choice".
   */
  setIdentity(
    id: string,
    identity: {
      readonly iconKey: EntityIconKey | null;
      readonly colourSlot: IdentityColourSlot | null;
    },
  ): Promise<AreaSettingsRecord>;
}
