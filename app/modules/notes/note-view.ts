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
import type {
  NoteDetailsRecord,
  NoteLinkFilter,
  NoteListItem,
  NoteSortOrder,
} from "~/kernel/notes";

/** The three lifecycle slices the collection can show. */
export type NoteCollectionState = "active" | "archived" | "deleted";

export type SerializedNoteListItem = {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** The later of the title and content timestamps — what the card shows. */
  readonly effectiveUpdatedAt: string;
  readonly tags: readonly string[];
  readonly archived: boolean;
  readonly excerpt: string;
  readonly linkCount: number;
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
  readonly tags: readonly string[];
  readonly archivedAt: string | null;
};

/** One option in a collection filter `<select>` (tags, Projects, Areas). */
export type NoteFilterOption = {
  readonly value: string;
  readonly label: string;
};

/**
 * The collection's filter values, exactly as the URL carries them. Empty string
 * means "not set" for every optional dimension, so the form's `defaultValue`s
 * and the loader's parsing agree without a second representation.
 */
export type NoteFilterValues = {
  readonly q: string;
  readonly tag: string;
  readonly project: string;
  readonly area: string;
  readonly links: NoteLinkFilter;
  readonly sort: NoteSortOrder;
};

/**
 * NOTES-01B/NOTES-03: one Note on the `/notes` collection, serialised from the
 * READ projection (which resolves the tags, archive state, excerpt and
 * relationship count in the same bounded query the page already runs).
 */
export function serializeNoteListItem(
  item: NoteListItem,
): SerializedNoteListItem {
  return {
    id: item.id,
    title: item.title,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    effectiveUpdatedAt: item.effectiveUpdatedAt.toISOString(),
    tags: item.tags,
    archived: item.archivedAt !== null,
    excerpt: item.excerpt,
    linkCount: item.linkCount,
  };
}

/** Parse the collection's filter values out of a URL, defensively. */
export function parseNoteFilters(params: URLSearchParams): NoteFilterValues {
  const links = params.get("links");
  const sort = params.get("sort");
  return {
    q: (params.get("q") ?? "").trim(),
    tag: (params.get("tag") ?? "").trim(),
    project: (params.get("project") ?? "").trim(),
    area: (params.get("area") ?? "").trim(),
    links: links === "linked" || links === "unlinked" ? links : "all",
    sort: sort === "recent" ? "recent" : "created",
  };
}

/** Parse the lifecycle state out of a URL, defaulting to Active. */
export function parseNoteState(value: string | null): NoteCollectionState {
  return value === "archived" || value === "deleted" ? value : "active";
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
    tags: details?.tags ?? [],
    archivedAt: details?.archivedAt ? details.archivedAt.toISOString() : null,
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
