/**
 * NOTES-01B — the Notes view-model (pure, React-free).
 *
 * Converts the generic `EntityRecord` (identity/title/lifecycle,
 * `app/kernel/entities`) and the Note-owned `NoteDetailsRecord` (Markdown
 * content, `app/kernel/notes`) into JSON-safe display data for the collection
 * and canonical record. Mirrors `~/modules/goals/goal-view.ts`'s shape.
 *
 * `NoteDetailsRepository` deliberately does not compute a combined "last
 * updated" moment (see `docs/development/NOTES_PERSISTENCE.md`'s
 * content-timestamp contract) — `effectiveNoteUpdatedAt` is that computation,
 * kept here as the one small, pure derivation the UI layer owns.
 */

import type { EntityRecord } from "~/kernel/entities";
import type { NoteDetailsRecord } from "~/kernel/notes";

export type SerializedNoteListItem = {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type SerializedNoteOverview = {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type SerializedNoteDetails = {
  readonly content: string;
  readonly contentUpdatedAt: string | null;
};

/** NOTES-01B: one Note on the `/notes` collection. */
export function serializeNoteListItem(
  entity: EntityRecord,
): SerializedNoteListItem {
  return {
    id: entity.id,
    title: entity.title,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}

export function serializeNoteOverview(
  entity: EntityRecord,
): SerializedNoteOverview {
  return {
    id: entity.id,
    title: entity.title,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}

export function serializeNoteDetails(
  details: NoteDetailsRecord | null,
): SerializedNoteDetails {
  return {
    content: details?.content ?? "",
    contentUpdatedAt: details?.contentUpdatedAt
      ? details.contentUpdatedAt.toISOString()
      : null,
  };
}

/**
 * The Note's effective "last updated" moment: the later of the entity's own
 * `updatedAt` (title changes, via the generic `EntityRepository`) and the
 * Note-owned `contentUpdatedAt` (Markdown content changes, via
 * `NoteDetailsRepository`) — these are two independently-advanced timestamps
 * (NOTES_PERSISTENCE.md's content-timestamp contract), and this is the one
 * small, pure combination the UI computes. A Note whose content has never
 * been written (`contentUpdatedAt === null`) reports its entity `updatedAt`.
 */
export function effectiveNoteUpdatedAt(
  entityUpdatedAt: string,
  contentUpdatedAt: string | null,
): string {
  if (contentUpdatedAt === null) {
    return entityUpdatedAt;
  }
  return Date.parse(contentUpdatedAt) > Date.parse(entityUpdatedAt)
    ? contentUpdatedAt
    : entityUpdatedAt;
}
