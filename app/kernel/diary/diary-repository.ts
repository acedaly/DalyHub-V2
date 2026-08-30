/**
 * DIARY-01A Diary kernel — the authoritative Diary repository contract.
 *
 * Storage-independent and WORKSPACE-BOUND at construction (mirrors every other
 * DalyHub repository, ADR-010): no method accepts a `workspaceId`, and scope
 * comes from the bound `WorkspaceContext`. This single contract is BOTH the
 * capture surface (create/update the entry-detail slice) AND the Timeline read
 * model (`list`) — one authority over Diary Entries, no duplicated ownership.
 *
 * Ownership boundary (ADR-041):
 *   - This repository owns the chronology-bearing detail slice: entry type,
 *     optional body, occurred-at, timezone and source. It CREATES the entry
 *     (the `entities` row + its detail row + one `diary_entry.created` Activity
 *     event) atomically, so a Diary Entry can never exist without its slice.
 *   - The entry's IDENTITY, TITLE and LIFECYCLE (rename, soft-delete, restore)
 *     stay the generic `EntityRepository`'s — exactly like a Note. The generic
 *     repository only REFUSES to CREATE a `diary` entity (that would bypass this
 *     slice); it renames/soft-deletes/restores them normally.
 *   - RELATIONSHIPS (to Projects, Areas, Goals, Tasks, Notes, People) are
 *     ordinary FND-04 EntityLinks — this repository defines no second link model.
 *   - The AUDIT trail is the FND-05 Activity stream — this repository defines no
 *     second event history.
 */

import type { DiaryEntry, DiaryEntryChangeResult } from "./diary-entry";
import type { DiaryTimelineOrder } from "./diary-validation";
import type {
  CreateDiaryEntryInput,
  UpdateDiaryEntryInput,
} from "./diary-entry";

/**
 * Input to a Timeline query. Scope comes from the bound context; there is no
 * `workspaceId`. Every field is an optional FILTERING HOOK — a caller composes
 * the ones it needs and the repository folds them into bounded, cursor-paginated
 * SQL (no N+1, no unbounded scan).
 */
export type ListDiaryTimelineInput = {
  /** Ordering: `newest` (default) lists most-recent-first; `oldest` reverses. */
  readonly order?: DiaryTimelineOrder;
  /** Page size, clamped to `[1, MAX_DIARY_PAGE_SIZE]`; defaults to the page size. */
  readonly limit?: number;
  /** Opaque cursor from a previous page's `nextCursor`, bound to this exact scope. */
  readonly cursor?: string;
  /** Filter to entries of ANY of these types (open vocabulary). */
  readonly entryTypes?: readonly string[];
  /** Inclusive lower bound on `occurredAt`. */
  readonly occurredFrom?: Date;
  /** Inclusive upper bound on `occurredAt`. */
  readonly occurredTo?: Date;
  /** Include soft-deleted entries. Defaults to false. */
  readonly includeDeleted?: boolean;
};

export type SearchDiaryEntriesInput = {
  readonly text: string;
  readonly limit?: number;
};

/** A bounded Timeline page plus the cursor to fetch the next one. */
export type DiaryTimelinePage = {
  readonly items: ReadonlyArray<DiaryEntry>;
  /** Null when there are no further entries in this scope. */
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
};

/**
 * RECALL-01 — WHERE a Diary search hit matched: the entry's `title`, or its
 * `body` prose. Body matching happens ONLY in answer to a non-empty query the
 * owner typed (ADR-114 decision 2 — solicitation, not existence, is the
 * boundary); Diary remains excluded from the empty-query recent list, which
 * carries no subtitle, preview or excerpt of any kind.
 */
export type DiaryMatchSource = "title" | "body";

export type DiarySearchHit = {
  readonly id: string;
  readonly title: string;
  readonly entryType: string;
  readonly occurredAt: Date;
  readonly timezone: string;
  /** Where this hit matched. */
  readonly matchSource: DiaryMatchSource;
  /**
   * A bounded, syntax-free window around a BODY match — never the entry. Empty
   * for a title match, so a title search never returns body prose at all.
   */
  readonly excerpt: string;
};

export interface DiaryRepository {
  /**
   * Capture a new Diary Entry. Writes the `entities` row, the detail row and one
   * `diary_entry.created` Activity event in ONE atomic transaction — all or
   * nothing. `occurredAt` defaults to the capture time (capture-first) but may
   * be any past or future instant (Memory Mode backdating). Returns the stored
   * entry.
   */
  create(input: CreateDiaryEntryInput): Promise<DiaryEntry>;

  /**
   * Read a single Diary Entry by id. Returns `null` for a missing, soft-deleted
   * (unless `includeDeleted`), wrong-type or cross-workspace id — the cases are
   * never distinguished, so a caller learns nothing about ids it may not see.
   */
  get(
    id: string,
    options?: { includeDeleted?: boolean },
  ): Promise<DiaryEntry | null>;

  /**
   * Edit an entry's DETAIL slice (type, body, occurred-at, timezone, source).
   * Idempotent: when every supplied field already matches the stored value this
   * is a no-op (no write, no Activity). A genuine change atomically updates the
   * detail row and appends one `diary_entry.updated` event. Title and lifecycle
   * are NOT editable here — they are the generic `EntityRepository`'s. Fails
   * closed with {@link DiaryNotFoundError} for a missing/deleted/wrong-type/
   * cross-workspace id.
   */
  update(
    id: string,
    changes: UpdateDiaryEntryInput,
  ): Promise<DiaryEntryChangeResult>;

  /**
   * The Timeline read model: a bounded, cursor-paginated page of entries ordered
   * by `occurredAt` (newest- or oldest-first), with optional entry-type,
   * occurred-at-range and include-deleted filters. Returns entries as plain
   * `DiaryEntry` records for the caller to group by day/month (see
   * `groupEntriesByDay`) — this method deliberately returns a flat, ordered page
   * so pagination and grouping compose cleanly.
   */
  list(input?: ListDiaryTimelineInput): Promise<DiaryTimelinePage>;

  /**
   * Search live Diary Entries by title only. Body prose is intentionally not part
   * of the global Search projection because Diary content is sensitive.
   */
  search(input: SearchDiaryEntriesInput): Promise<readonly DiarySearchHit[]>;
}
