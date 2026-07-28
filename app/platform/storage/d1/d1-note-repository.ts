/**
 * NOTES-03 — D1 implementation of the READ-ONLY `NoteQueryRepository`.
 *
 * One bounded, workspace-scoped, parameterised statement answers each question
 * the Notes collection and the global Search provider ask. Nothing here mutates
 * and nothing records Activity (mirrors `D1ProjectRepository`, the PROJ-01 read
 * projection).
 *
 * Three properties are load-bearing and must survive any edit:
 *
 *   1. **No application-code scan.** Filtering, ordering, excerpting and the
 *      relationship count all happen in SQL; the Worker never lists a workspace's
 *      Notes to sift them in JavaScript (§6 of the knowledge brief).
 *   2. **Workspace isolation is in every statement**, always bound, never
 *      interpolated — including inside the correlated relationship sub-queries,
 *      so a link to a record in another workspace can never widen a result.
 *   3. **Deterministic total ordering.** Every query ends `<sort>, e.id DESC`, so
 *      keyset pagination can never skip or repeat a Note.
 *
 * Search strategy: SQLite `LIKE`/`instr`/`substr` over the canonical Markdown
 * source — the same D1-native approach every other DalyHub search uses (People,
 * Assets, Meetings, Reviews, Tasks). The excerpt window is cut in SQL with
 * `substr(...)` around `instr(...)`, so a matching 1 MiB Note transfers a few
 * hundred bytes, not its whole body. The trade-off (a leading-wildcard LIKE
 * cannot use an index) is documented in `migrations/0019_notes_knowledge.sql`
 * and `SHARED_SEARCH.md`.
 */

import {
  InvalidNoteCursorError,
  NOTE_ENTITY_TYPE,
  NOTE_LIST_DEFAULT_LIMIT,
  NOTE_LIST_MAX_LIMIT,
  NOTE_SEARCH_MAX_LIMIT,
  NOTE_TAG_FACET_MAX,
  MAX_CONTEXT_WINDOWS,
  MAX_TITLE_RESOLUTION,
  NoteQueryStorageError,
  decodeNoteCursorForScope,
  encodeNoteCursor,
  noteCursorScope,
  normaliseNoteQuery,
  type ListNotesInput,
  type NoteCollectionState,
  type NoteContextWindow,
  type NoteLinkFilter,
  type NoteListItem,
  type NoteListPage,
  type NoteMatchSource,
  type NoteQueryRepository,
  type NoteSearchHit,
  type NoteSortOrder,
  type NoteTagFacet,
  type ReferenceTarget,
  type SearchNotesInput,
} from "~/kernel/notes";
import { RESERVED_SPINE_LINK_TYPES } from "~/kernel/spine";
import type { WorkspaceContext } from "~/kernel/workspaces";
import {
  excerptAroundMatch,
  headingAtOffset,
  offsetIsInHeading,
} from "~/platform/markdown/note-document";

import { fromStorageTimestamp } from "./database";

/**
 * The reserved structural spine link types, as a SQL literal list. They are
 * excluded from a Note's "relationships" everywhere, exactly as
 * `loadLinkedItems` excludes them — the hierarchy renders those itself. Built
 * from the kernel's own set so the two can never drift; the values are
 * validated dotted slugs from a frozen kernel constant, never user input.
 */
const STRUCTURAL_LINK_TYPES_SQL = [...RESERVED_SPINE_LINK_TYPES]
  .map((type) => `'${type}'`)
  .join(", ");

/**
 * A Note's active, non-structural relationships — the same definition the shared
 * Linked Items surface uses. Correlated on `e.id`; both endpoints are bound to
 * the same workspace as the Note by the join predicate.
 */
const RELATIONSHIP_PREDICATE = `
  l.workspace_id = e.workspace_id
  AND l.deleted_at IS NULL
  AND (l.source_entity_id = e.id OR l.target_entity_id = e.id)
  AND l.type NOT IN (${STRUCTURAL_LINK_TYPES_SQL})`;

/** How much raw source travels back for an excerpt. Bounded on the DB side. */
const EXCERPT_WINDOW = 400;
/** Cap on the relationship count, so a pathological record cannot dominate. */
const LINK_COUNT_CAP = 99;

interface NoteListRow {
  readonly id: string;
  readonly title: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly deleted_at: string | null;
  readonly content_updated_at: string | null;
  readonly tags: string | null;
  readonly archived_at: string | null;
  readonly sort_value: string;
  readonly excerpt_source: string | null;
  readonly link_count: number;
}

interface NoteSearchRow {
  readonly id: string;
  readonly title: string;
  readonly updated_at: string;
  readonly archived_at: string | null;
  readonly tags: string | null;
  readonly body_hit: number;
  readonly body_window: string | null;
  readonly window_start: number;
}

interface TagRow {
  readonly tags: string | null;
}

interface ReferenceRow {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly created_at: string;
  readonly key: string;
}

interface ContextRow {
  readonly id: string;
  readonly window: string | null;
  readonly archived_at: string | null;
}

/** How many ids/titles are bound into one statement (D1 variable-limit safe). */
const TITLE_CHUNK = 40;

/**
 * D1 caps a LIKE pattern at {@link MAX_LIKE_PATTERN_LENGTH} bytes: a longer one
 * fails the WHOLE statement with `LIKE or GLOB pattern too complex`, not just
 * that predicate. A search box is exactly where an over-long value arrives (a
 * pasted title, a sentence), so the bound is enforced HERE rather than trusted
 * to callers — a long query degrades to matching its opening characters instead
 * of returning a storage error.
 */
const MAX_LIKE_PATTERN_LENGTH = 50;

/**
 * Escape LIKE wildcards so a query character is matched literally, then bound
 * the escaped value so the wrapped pattern fits D1's limit. A truncation is
 * never allowed to end on a lone escape character (which SQLite rejects).
 */
function likeNeedle(value: string, wrappers: number): string {
  let escaped = value
    .toLocaleLowerCase()
    .replace(/[\\%_]/g, (c) => `\\${c}`)
    .slice(0, MAX_LIKE_PATTERN_LENGTH - wrappers);
  // A trailing, unpaired escape character would make the pattern invalid.
  const trailingEscapes = /\\*$/.exec(escaped)?.[0].length ?? 0;
  if (trailingEscapes % 2 === 1) escaped = escaped.slice(0, -1);
  return escaped;
}

/** `%value%` — a bounded, escaped "contains" pattern. */
function likeContains(value: string): string {
  return `%${likeNeedle(value, 2)}%`;
}

/** `value%` — a bounded, escaped "starts with" pattern. */
function likePrefix(value: string): string {
  return `${likeNeedle(value, 1)}%`;
}

function parseStoredTags(value: string | null): readonly string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

function clampLimit(value: number | undefined, max: number, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value), 1), max);
}

function normaliseId(value: string | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed === "" ? null : trimmed;
}

export class D1NoteRepository implements NoteQueryRepository {
  readonly #db: D1Database;
  readonly #workspaceId: string;

  constructor(db: D1Database, context: WorkspaceContext) {
    this.#db = db;
    this.#workspaceId = context.workspaceId;
  }

  /* ---------------------------------------------------------------------- */
  /* List                                                                   */
  /* ---------------------------------------------------------------------- */

  async list(input: ListNotesInput = {}): Promise<NoteListPage> {
    const state: NoteCollectionState =
      input.state === "archived" || input.state === "deleted"
        ? input.state
        : "active";
    const sort: NoteSortOrder = input.sort === "recent" ? "recent" : "created";
    const links: NoteLinkFilter =
      input.links === "linked" || input.links === "unlinked"
        ? input.links
        : "all";
    const query = normaliseNoteQuery(input.query);
    const tag = normaliseId(input.tag)?.toLocaleLowerCase() ?? null;
    const projectId = normaliseId(input.projectId);
    const areaId = normaliseId(input.areaId);
    const limit = clampLimit(
      input.limit,
      NOTE_LIST_MAX_LIMIT,
      NOTE_LIST_DEFAULT_LIMIT,
    );

    const scope = noteCursorScope(this.#workspaceId, {
      state,
      query,
      tag,
      projectId,
      areaId,
      links,
      sort,
    });

    // The `recent` order sorts on the Note's EFFECTIVE updated moment — the
    // later of its own title timestamp and its content-write timestamp — which
    // is the value the record and the collection already display.
    const sortExpr =
      sort === "recent"
        ? "max(e.updated_at, coalesce(d.updated_at, e.updated_at))"
        : "e.created_at";

    const conditions: string[] = [
      "e.workspace_id = ?",
      `e.type = '${NOTE_ENTITY_TYPE}'`,
    ];
    const params: unknown[] = [this.#workspaceId];

    if (state === "deleted") {
      conditions.push("e.deleted_at IS NOT NULL");
    } else {
      conditions.push("e.deleted_at IS NULL");
      conditions.push(
        state === "archived"
          ? "d.archived_at IS NOT NULL"
          : "d.archived_at IS NULL",
      );
    }

    if (query !== null) {
      const like = likeContains(query);
      conditions.push(
        `(lower(e.title) LIKE ? ESCAPE '\\'
          OR lower(coalesce(d.content, '')) LIKE ? ESCAPE '\\'
          OR lower(coalesce(d.tags, '')) LIKE ? ESCAPE '\\')`,
      );
      params.push(like, like, like);
    }

    if (tag !== null) {
      // Tags are stored as a JSON array of already-normalised strings, so an
      // exact `"tag"` token match is unambiguous — no partial-word false hits.
      conditions.push(`instr(coalesce(d.tags, ''), ?) > 0`);
      params.push(JSON.stringify(tag));
    }

    if (projectId !== null) {
      conditions.push(this.#linkedToClause());
      params.push(projectId, projectId);
    }
    if (areaId !== null) {
      conditions.push(this.#linkedToClause());
      params.push(areaId, areaId);
    }

    if (links !== "all") {
      const exists = `EXISTS (SELECT 1 FROM entity_links l WHERE ${RELATIONSHIP_PREDICATE})`;
      conditions.push(links === "linked" ? exists : `NOT ${exists}`);
    }

    if (input.cursor !== undefined) {
      const position = decodeNoteCursorForScope(input.cursor, scope);
      conditions.push(`(${sortExpr} < ? OR (${sortExpr} = ? AND e.id < ?))`);
      params.push(position.sortValue, position.sortValue, position.id);
    }

    const fetchLimit = limit + 1;
    params.push(fetchLimit);

    let rows: NoteListRow[];
    try {
      const result = await this.#db
        .prepare(
          `SELECT e.id AS id,
                  e.title AS title,
                  e.created_at AS created_at,
                  e.updated_at AS updated_at,
                  e.deleted_at AS deleted_at,
                  d.updated_at AS content_updated_at,
                  d.tags AS tags,
                  d.archived_at AS archived_at,
                  ${sortExpr} AS sort_value,
                  substr(coalesce(d.content, ''), 1, ${EXCERPT_WINDOW}) AS excerpt_source,
                  (SELECT count(*) FROM (
                     SELECT 1 FROM entity_links l
                     WHERE ${RELATIONSHIP_PREDICATE}
                     LIMIT ${LINK_COUNT_CAP})) AS link_count
           FROM entities e
           LEFT JOIN note_details d
             ON d.workspace_id = e.workspace_id AND d.entity_id = e.id
           WHERE ${conditions.join(" AND ")}
           ORDER BY ${sortExpr} DESC, e.id DESC
           LIMIT ?`,
        )
        .bind(...params)
        .all<NoteListRow>();
      rows = result.results;
    } catch (cause) {
      if (cause instanceof InvalidNoteCursorError) throw cause;
      throw new NoteQueryStorageError({ cause });
    }

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const items = pageRows.map<NoteListItem>((row) => {
      const updatedAt = fromStorageTimestamp(row.updated_at);
      const contentUpdatedAt = row.content_updated_at
        ? fromStorageTimestamp(row.content_updated_at)
        : null;
      return {
        id: row.id,
        title: row.title,
        createdAt: fromStorageTimestamp(row.created_at),
        updatedAt,
        effectiveUpdatedAt:
          contentUpdatedAt && contentUpdatedAt > updatedAt
            ? contentUpdatedAt
            : updatedAt,
        tags: parseStoredTags(row.tags),
        archivedAt: row.archived_at
          ? fromStorageTimestamp(row.archived_at)
          : null,
        deletedAt: row.deleted_at ? fromStorageTimestamp(row.deleted_at) : null,
        // The window is raw Markdown; the shared analyser turns it into readable
        // prose, so a card never shows `##` or a half-open code fence.
        excerpt: excerptAroundMatch(row.excerpt_source ?? "", query ?? ""),
        linkCount: row.link_count,
      };
    });

    const last = pageRows.at(-1);
    const nextCursor =
      hasMore && last
        ? encodeNoteCursor(scope, { sortValue: last.sort_value, id: last.id })
        : null;

    return { items, nextCursor, hasMore };
  }

  /** `EXISTS` a non-structural active link between this Note and a given record. */
  #linkedToClause(): string {
    return `EXISTS (
      SELECT 1 FROM entity_links l
      WHERE ${RELATIONSHIP_PREDICATE}
        AND (l.source_entity_id = ? OR l.target_entity_id = ?)
    )`;
  }

  /* ---------------------------------------------------------------------- */
  /* Search                                                                 */
  /* ---------------------------------------------------------------------- */

  async search(input: SearchNotesInput): Promise<readonly NoteSearchHit[]> {
    const text = normaliseNoteQuery(input.text);
    if (text === null) return [];
    const limit = clampLimit(input.limit, NOTE_SEARCH_MAX_LIMIT, 10);
    const like = likeContains(text);
    const needle = text.toLocaleLowerCase();

    // `instr` gives the 1-based code-point offset of the first body hit; the
    // window is cut around it so a huge Note never crosses the wire. Both the
    // offset and the window travel back, so the analyser can report WHICH part
    // of the note matched without a second query.
    const hitExpr = `instr(lower(coalesce(d.content, '')), ?)`;
    const windowStart = `max(1, ${hitExpr} - ${EXCERPT_WINDOW / 2})`;

    const conditions: string[] = [
      "e.workspace_id = ?",
      `e.type = '${NOTE_ENTITY_TYPE}'`,
      "e.deleted_at IS NULL",
      `(lower(e.title) LIKE ? ESCAPE '\\'
        OR lower(coalesce(d.content, '')) LIKE ? ESCAPE '\\'
        OR lower(coalesce(d.tags, '')) LIKE ? ESCAPE '\\')`,
    ];
    if (input.includeArchived !== true) {
      conditions.push("d.archived_at IS NULL");
    }

    // Title matches lead, then most recently updated, then id — total and stable.
    const rank = `CASE
        WHEN lower(e.title) = ? THEN 0
        WHEN lower(e.title) LIKE ? ESCAPE '\\' THEN 1
        WHEN lower(e.title) LIKE ? ESCAPE '\\' THEN 2
        ELSE 3 END`;

    // Placeholders bind POSITIONALLY, in the order they appear in the statement
    // text: three in SELECT (the hit offset and the two window expressions),
    // then WHERE, then ORDER BY, then LIMIT. This array mirrors that order
    // exactly — get it wrong and the query silently searches for a workspace id.
    const params: unknown[] = [
      needle, // body_hit
      needle, // substr(..., windowStart, ...)
      needle, // window_start
      this.#workspaceId,
      like,
      like,
      like,
      needle, // rank: exact title
      likePrefix(text), // rank: title prefix
      like, // rank: title contains
      limit,
    ];

    let rows: NoteSearchRow[];
    try {
      const result = await this.#db
        .prepare(
          `SELECT e.id AS id,
                  e.title AS title,
                  e.updated_at AS updated_at,
                  d.archived_at AS archived_at,
                  d.tags AS tags,
                  ${hitExpr} AS body_hit,
                  substr(coalesce(d.content, ''), ${windowStart}, ${EXCERPT_WINDOW}) AS body_window,
                  ${windowStart} AS window_start
           FROM entities e
           LEFT JOIN note_details d
             ON d.workspace_id = e.workspace_id AND d.entity_id = e.id
           WHERE ${conditions.join(" AND ")}
           ORDER BY ${rank}, e.updated_at DESC, e.id DESC
           LIMIT ?`,
        )
        .bind(...params)
        .all<NoteSearchRow>();
      rows = result.results;
    } catch (cause) {
      throw new NoteQueryStorageError({ cause });
    }

    return rows.map<NoteSearchHit>((row) => {
      const tags = parseStoredTags(row.tags);
      const titleMatched = row.title.toLocaleLowerCase().includes(needle);
      const tagMatched = tags.some((value) => value.includes(needle));
      const bodyOffset = row.body_hit > 0 ? row.body_hit - 1 : -1;
      const rawWindow = row.body_window ?? "";
      // The window is a fragment of the document, so offsets inside it are
      // relative to `window_start` (also 1-based, from SQL). When the window
      // begins mid-line, drop the partial first line before analysing it —
      // otherwise a truncated line could be misread as a heading or a fence.
      const rawOffset =
        bodyOffset >= 0 ? bodyOffset - (row.window_start - 1) : -1;
      const partialLine = row.window_start > 1 ? rawWindow.indexOf("\n") : -1;
      const trimFrom =
        partialLine !== -1 && partialLine + 1 <= Math.max(rawOffset, 0)
          ? partialLine + 1
          : 0;
      const window = rawWindow.slice(trimFrom);
      const offsetInWindow = rawOffset >= 0 ? rawOffset - trimFrom : -1;

      let matchSource: NoteMatchSource;
      let heading: string | null = null;
      if (bodyOffset >= 0 && offsetIsInHeading(window, offsetInWindow)) {
        matchSource = "heading";
        heading = headingAtOffset(window, offsetInWindow)?.text ?? null;
      } else if (titleMatched) {
        matchSource = "title";
      } else if (bodyOffset >= 0) {
        matchSource = "body";
        heading = headingAtOffset(window, offsetInWindow)?.text ?? null;
      } else if (tagMatched) {
        matchSource = "tag";
      } else {
        matchSource = "title";
      }

      return {
        id: row.id,
        title: row.title,
        updatedAt: fromStorageTimestamp(row.updated_at),
        archivedAt: row.archived_at
          ? fromStorageTimestamp(row.archived_at)
          : null,
        tags,
        matchSource,
        heading,
        excerpt:
          bodyOffset >= 0
            ? excerptAroundMatch(window, text)
            : excerptAroundMatch(window, ""),
      };
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Tag facets                                                             */
  /* ---------------------------------------------------------------------- */

  async listTags(limit = NOTE_TAG_FACET_MAX): Promise<readonly NoteTagFacet[]> {
    const bounded = clampLimit(limit, NOTE_TAG_FACET_MAX, NOTE_TAG_FACET_MAX);
    let rows: TagRow[];
    try {
      const result = await this.#db
        .prepare(
          `SELECT d.tags AS tags
           FROM entities e
           JOIN note_details d
             ON d.workspace_id = e.workspace_id AND d.entity_id = e.id
           WHERE e.workspace_id = ? AND e.type = '${NOTE_ENTITY_TYPE}'
                 AND e.deleted_at IS NULL AND d.archived_at IS NULL
                 AND d.tags != '[]'
           ORDER BY e.created_at DESC, e.id DESC
           LIMIT 500`,
        )
        .bind(this.#workspaceId)
        .all<TagRow>();
      rows = result.results;
    } catch (cause) {
      throw new NoteQueryStorageError({ cause });
    }

    // Counting distinct JSON members needs either a JSON table-valued function
    // (not guaranteed across D1 versions) or this fold over an already-bounded,
    // tags-only projection. It reads at most 500 short strings — never a note
    // body — and produces a deterministic, count-then-name ordering.
    const counts = new Map<string, number>();
    for (const row of rows) {
      for (const tag of parseStoredTags(row.tags)) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
      .slice(0, bounded);
  }

  /* ---------------------------------------------------------------------- */
  /* Reference resolution                                                   */
  /* ---------------------------------------------------------------------- */

  async resolveReferenceTargets(
    titles: readonly string[],
  ): Promise<ReadonlyMap<string, ReferenceTarget>> {
    const wanted = [
      ...new Set(
        titles
          .map((title) => title.trim().toLocaleLowerCase())
          .filter((title) => title !== ""),
      ),
    ].slice(0, MAX_TITLE_RESOLUTION);
    const resolved = new Map<string, ReferenceTarget>();
    if (wanted.length === 0) return resolved;

    // Chunked to stay well inside D1's bound-variable limit, exactly as the
    // project-health projection chunks its grouped reads.
    for (let i = 0; i < wanted.length; i += TITLE_CHUNK) {
      const chunk = wanted.slice(i, i + TITLE_CHUNK);
      const placeholders = chunk.map(() => "?").join(", ");
      let rows: ReferenceRow[];
      try {
        const result = await this.#db
          .prepare(
            `SELECT e.id AS id, e.type AS type, e.title AS title,
                    e.created_at AS created_at, lower(e.title) AS key
             FROM entities e
             WHERE e.workspace_id = ? AND e.deleted_at IS NULL
                   AND lower(e.title) IN (${placeholders})
             ORDER BY (CASE WHEN e.type = '${NOTE_ENTITY_TYPE}' THEN 0 ELSE 1 END),
                      e.created_at ASC, e.id ASC`,
          )
          .bind(this.#workspaceId, ...chunk)
          .all<ReferenceRow>();
        rows = result.results;
      } catch (cause) {
        throw new NoteQueryStorageError({ cause });
      }
      for (const row of rows) {
        // Ordered Note-first, then oldest — the first row for a key wins, so the
        // same source always resolves to the same record.
        if (!resolved.has(row.key)) {
          resolved.set(row.key, {
            id: row.id,
            type: row.type,
            title: row.title,
          });
        }
      }
    }
    return resolved;
  }

  async loadContextWindows(
    noteIds: readonly string[],
    needle: string,
  ): Promise<ReadonlyMap<string, NoteContextWindow>> {
    const ids = [...new Set(noteIds.filter((id) => id !== ""))].slice(
      0,
      MAX_CONTEXT_WINDOWS,
    );
    const out = new Map<string, NoteContextWindow>();
    if (ids.length === 0) return out;
    const lowered = needle.toLocaleLowerCase();

    for (let i = 0; i < ids.length; i += TITLE_CHUNK) {
      const chunk = ids.slice(i, i + TITLE_CHUNK);
      const placeholders = chunk.map(() => "?").join(", ");
      let rows: ContextRow[];
      try {
        const result = await this.#db
          .prepare(
            `SELECT d.entity_id AS id,
                    substr(d.content,
                           max(1, instr(lower(d.content), ?) - ${EXCERPT_WINDOW / 2}),
                           ${EXCERPT_WINDOW}) AS window,
                    d.archived_at AS archived_at
             FROM note_details d
             WHERE d.workspace_id = ? AND d.entity_id IN (${placeholders})`,
          )
          .bind(lowered, this.#workspaceId, ...chunk)
          .all<ContextRow>();
        rows = result.results;
      } catch (cause) {
        throw new NoteQueryStorageError({ cause });
      }
      for (const row of rows) {
        out.set(row.id, {
          window: row.window ?? "",
          archivedAt: row.archived_at
            ? fromStorageTimestamp(row.archived_at)
            : null,
        });
      }
    }
    return out;
  }
}
