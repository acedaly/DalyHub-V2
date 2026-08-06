/**
 * AREA-05 Area Settings — the Areas-owned archival lifecycle slice (kernel types).
 *
 * Area identity, title, soft-delete and parentage stay with the spine
 * (`SpineRepository`); this contract owns ONLY the additive, reversible ARCHIVAL
 * state the spine deliberately does not model. It mirrors the `project-settings`
 * kernel (ADR-037) exactly — event-type constants, an `{ archivedAt }` value, a
 * `{ settings, changed }` change result and typed errors — the only difference is
 * that an Area has no workflow status, so this slice is a single nullable
 * `archivedAt` timestamp and nothing else.
 *
 * Permanent (hard) deletion is NOT here: hard-deleting a spine entity is the
 * SpineRepository's authority (`permanentlyDeleteArea`), because it removes the
 * `entities`/`spine_records` identity rows the spine owns. This slice only turns
 * archival on and off.
 */

import type { EntityIconKey } from "~/kernel/entities/entity-icon-keys";
import type { WorkspaceId } from "~/kernel/workspaces";

/** A meaningful Area lifecycle event was appended to the shared Activity stream. */
export const AREA_ARCHIVED = "area.archived";
export const AREA_RESTORED = "area.restored";
/**
 * The permanent-deletion audit event. Emitted by the SpineRepository's purge, not
 * by this slice — declared here so the one Area-lifecycle event vocabulary lives in
 * one place. It is a subject-less workspace audit fact (its subject would be the
 * row being deleted), carrying the deleted Area's id and title in its payload.
 */
export const AREA_DELETED = "area.deleted";

/**
 * The Area's own module-owned state: whether it is archived, and which icon its
 * owner chose. `archivedAt === null` ⇒ active; `iconKey === null` ⇒ no choice,
 * so the Area renders its entity default.
 *
 * `iconKey` is a KEY, not a glyph — the UI resolves it (`RecordIcon`), which is
 * what keeps the wire format serialisable and lets the drawing change without
 * the data changing. It is typed as the narrow union so a value that reached the
 * database before a catalogue entry was removed cannot be handed on as if this
 * build understood it; the repository normalises on read.
 */
export type AreaSettings = {
  readonly archivedAt: Date | null;
  readonly iconKey: EntityIconKey | null;
};

export type AreaSettingsRecord = AreaSettings & {
  readonly id: string;
  readonly workspaceId: WorkspaceId;
};

export type AreaSettingsChangeResult = {
  readonly settings: AreaSettingsRecord;
  /** True iff this call caused a real transition (not an idempotent no-op). */
  readonly changed: boolean;
};

/** The default (never-persisted) settings for an Area with no `area_details` row. */
export const DEFAULT_AREA_SETTINGS: AreaSettings = {
  archivedAt: null,
  iconKey: null,
};

export function isAreaArchived(settings: AreaSettings): boolean {
  return settings.archivedAt !== null;
}
