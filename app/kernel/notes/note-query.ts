/**
 * NOTES-03 Notes kernel — the Note READ projection contract (organisation +
 * full-content search).
 *
 * A read-only companion to `NoteDetailsRepository`, in the same spirit as
 * `ProjectRepository` (the PROJ-01 read projection over the spine): identity,
 * title and lifecycle stay the generic `EntityRepository`'s; the Markdown body,
 * tags and archive state stay `note_details`'; this contract exists so the
 * collection and the global Search provider can ask ONE bounded, workspace-scoped,
 * N+1-free question instead of listing every Note and filtering in application
 * code.
 *
 * It never mutates and never records Activity.
 *
 * Storage-independent: no D1, no SQL, no Cloudflare type appears here.
 */

/** Which lifecycle slice of the collection a query addresses. */
export type NoteCollectionState = "active" | "archived" | "deleted";

/** How a Note list is ordered. Both orders are total and deterministic. */
export type NoteSortOrder =
  /** Most recently updated first — the Note's EFFECTIVE updated moment. */
  | "recent"
  /** Newest first by creation, the kernel's default collection order. */
  | "created";

/** Whether the query restricts to Notes with (or without) relationships. */
export type NoteLinkFilter = "all" | "linked" | "unlinked";

/** The filters a Notes collection query accepts. All are optional and additive. */
export type ListNotesInput = {
  /** Defaults to `"active"`. */
  readonly state?: NoteCollectionState;
  /** Case-insensitive substring match over title, body and tags. */
  readonly query?: string;
  /** Restrict to Notes carrying this (already-normalised) tag. */
  readonly tag?: string;
  /** Restrict to Notes explicitly linked to this Project entity id. */
  readonly projectId?: string;
  /** Restrict to Notes explicitly linked to this Area entity id. */
  readonly areaId?: string;
  /** Restrict by whether the Note has any active non-structural relationship. */
  readonly links?: NoteLinkFilter;
  /** Defaults to `"created"` (the established collection order). */
  readonly sort?: NoteSortOrder;
  readonly limit?: number;
  readonly cursor?: string;
};

/** One Note as the collection renders it. */
export type NoteListItem = {
  readonly id: string;
  readonly title: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  /** The later of the entity's `updatedAt` and the content write timestamp. */
  readonly effectiveUpdatedAt: Date;
  readonly tags: readonly string[];
  readonly archivedAt: Date | null;
  readonly deletedAt: Date | null;
  /** A bounded, syntax-free opening excerpt of the body (never raw Markdown). */
  readonly excerpt: string;
  /** How many active non-structural relationships this Note has (capped). */
  readonly linkCount: number;
};

export type NoteListPage = {
  readonly items: readonly NoteListItem[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
};

/** Where a search hit matched. Ordered strongest-first. */
export type NoteMatchSource = "title" | "tag" | "heading" | "body";

/** One full-content search hit. */
export type NoteSearchHit = {
  readonly id: string;
  readonly title: string;
  readonly updatedAt: Date;
  readonly archivedAt: Date | null;
  readonly tags: readonly string[];
  /** Which part of the Note matched — shown to the user, never guessed at. */
  readonly matchSource: NoteMatchSource;
  /** The heading the body match sits under, when it sits under one. */
  readonly heading: string | null;
  /** A bounded, syntax-free excerpt around the match. */
  readonly excerpt: string;
};

export type SearchNotesInput = {
  readonly text: string;
  readonly limit?: number;
  /** Include archived Notes in the results. Defaults to `false`. */
  readonly includeArchived?: boolean;
};

/** One distinct tag in the workspace, with how many active Notes carry it. */
export type NoteTagFacet = {
  readonly tag: string;
  readonly count: number;
};

/** A record a `[[Wiki Link]]` title resolved to. */
export type ReferenceTarget = {
  readonly id: string;
  readonly type: string;
  readonly title: string;
};

/** A bounded slice of one Note's source, plus the state the reader must know. */
export type NoteContextWindow = {
  /** Raw Markdown around the first occurrence of the requested needle. */
  readonly window: string;
  readonly archivedAt: Date | null;
};

/** The most titles one reference-resolution call will look up. */
export const MAX_TITLE_RESOLUTION = 100;

/**
 * The most Notes one context-window call will read.
 *
 * Deliberately larger than a display page: a relationship page may overshoot its
 * requested limit by up to one underlying link page (see `loadNoteReferences`),
 * and every row on a page must get its archive state — silently dropping the
 * tail would make an archived note look active.
 */
export const MAX_CONTEXT_WINDOWS = 200;

/**
 * The Notes read projection. Workspace-bound at construction (ADR-010) — no
 * method takes a workspace id, so a caller can never widen the scope, and
 * soft-deleted Notes are excluded from every result unless the state explicitly
 * asks for them.
 */
export interface NoteQueryRepository {
  /** One bounded, filtered, deterministically-ordered page of the collection. */
  list(input?: ListNotesInput): Promise<NoteListPage>;

  /**
   * Full-content search: title, Markdown body, headings and tags, in ONE bounded
   * query. Deterministic ordering (title matches first, then most recently
   * updated, then id). Deleted Notes are always excluded; archived Notes only
   * appear when `includeArchived` is set.
   */
  search(input: SearchNotesInput): Promise<readonly NoteSearchHit[]>;

  /** The distinct tags across ACTIVE Notes, ordered by count then name. */
  listTags(limit?: number): Promise<readonly NoteTagFacet[]>;

  /**
   * Resolve `[[Wiki Link]]` titles to ACTIVE records in this workspace, in ONE
   * bounded, indexed query — never by paging the whole workspace (the flaw
   * DEBT-39 recorded in the navigation-time resolver).
   *
   * Matching is case-insensitive on the exact title. When several records share
   * a title, a Note wins, then the earliest-created record — a total, stable
   * rule, so the same source always resolves to the same target. Returns a map
   * keyed by the LOWER-CASED title; absent titles are simply missing.
   */
  resolveReferenceTargets(
    titles: readonly string[],
  ): Promise<ReadonlyMap<string, ReferenceTarget>>;

  /**
   * For each of the given Note ids, a bounded slice of its Markdown source
   * around the first occurrence of `needle` (or its opening block when the
   * needle is absent), plus its archive state — in ONE query, so rendering the
   * context of N backlinks costs one round trip, not N. Bounded by
   * {@link MAX_CONTEXT_WINDOWS}.
   */
  loadContextWindows(
    noteIds: readonly string[],
    needle: string,
  ): Promise<ReadonlyMap<string, NoteContextWindow>>;
}

/** Bounds. Kept here so both the adapter and its callers read the same numbers. */
export const NOTE_LIST_DEFAULT_LIMIT = 25;
export const NOTE_LIST_MAX_LIMIT = 100;
export const NOTE_SEARCH_MAX_LIMIT = 25;
export const NOTE_TAG_FACET_MAX = 50;

export class NoteQueryStorageError extends Error {
  readonly code = "storage" as const;
  constructor(options?: ErrorOptions) {
    super("A notes query storage error occurred.", options);
    this.name = "NoteQueryStorageError";
  }
}

export class InvalidNoteCursorError extends Error {
  readonly code = "invalid_cursor" as const;
  constructor() {
    super("That page link is no longer valid.");
    this.name = "InvalidNoteCursorError";
  }
}
