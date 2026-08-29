/**
 * V2.6 FIND-02 — the ONE place tag SQL is written.
 *
 * Every repository that stores a tagged record (People, Assets, Notes and, from
 * FIND-03, Tasks) reads and writes its tags through this module. There is no
 * per-module tag SQL, which is the storage-layer half of "one vocabulary
 * source": a surface cannot accidentally invent a fourth case rule or a fourth
 * storage shape, because there is nowhere to write one.
 *
 * ── Reading: no extra statement, ever ────────────────────────────────────────
 *
 * {@link entityTagsProjection} is a correlated sub-select a read adds to its
 * existing SELECT list. A collection page that reads 50 People still runs ONE
 * statement; the tags come back on the rows that were already being fetched, so
 * no read in the product gained a round trip and nothing became N+1.
 *
 * The labels arrive as a single `char(31)`-delimited string — the ASCII unit
 * separator, which {@link validateEntityTags} refuses inside a tag, so the
 * delimiter can never appear in a value. Ordering is by canonical key, applied
 * in an inner sub-select rather than inside `group_concat`, because ordered
 * aggregates are a recent SQLite addition and D1's version is not ours to
 * assume.
 *
 * ── Writing: three statements, whatever the tag count ────────────────────────
 *
 * {@link buildEntityTagStatements} returns exactly three statements — attach the
 * new vocabulary, attach the entity, detach what the owner removed — regardless
 * of how many tags are involved, because the set travels as ONE bound JSON
 * parameter expanded by `json_each` rather than as one placeholder per tag. Each
 * statement binds at most seven parameters, so the write is far inside D1's
 * 100-bound-parameter ceiling and is flat in the size of the tag set.
 *
 * ── Writing: guarded, so a losing race writes nothing ────────────────────────
 *
 * The statements are appended to the SAME `D1Database.batch()` as the record's
 * own mutation and its Activity append, and each is guarded on the Activity
 * event having been inserted. That event is itself guarded on the domain
 * statement having changed a row, so a no-op update, an already-deleted record
 * or a concurrent loser leaves the tags exactly as they were. The guard is an
 * `EXISTS` on a fresh unique id rather than `changes()`, so it is independent of
 * where in the batch the statement lands — the same trick `activity_subjects`
 * uses, and for the same reason.
 */

import type { WorkspaceTag } from "~/kernel/tags";

/**
 * The delimiter between labels in the read projection. ASCII 31 (unit
 * separator): a control character, and therefore one a validated tag can never
 * contain.
 */
const LABEL_DELIMITER = "\u001f";

/**
 * The correlated sub-select that reads one row's tags, ordered canonically.
 *
 * `entityAlias` is the SQL alias of the table supplying `workspace_id` and the
 * entity id, and `idColumn` names that id column (`id` on `entities`,
 * `entity_id` on a detail table). Both are call-site constants — never caller
 * data — so this never becomes a place a value reaches SQL as text.
 */
export function entityTagsProjection(
  entityAlias: string,
  idColumn = "entity_id",
): string {
  return `(SELECT group_concat(ordered.label, char(31))
             FROM (SELECT wt.label AS label
                     FROM entity_tags et
                     JOIN workspace_tags wt
                       ON wt.workspace_id = et.workspace_id
                      AND wt.tag_key = et.tag_key
                    WHERE et.workspace_id = ${entityAlias}.workspace_id
                      AND et.entity_id = ${entityAlias}.${idColumn}
                    ORDER BY et.tag_key ASC) AS ordered)`;
}

/** Decode the projection's `char(31)`-delimited labels back into a tag list. */
export function parseTagProjection(
  value: string | null | undefined,
): readonly string[] {
  if (typeof value !== "string" || value.length === 0) return [];
  return value.split(LABEL_DELIMITER).filter((label) => label.length > 0);
}

/**
 * The statement that reads ONE entity's tag labels, in canonical order.
 *
 * Needed only AFTER a tag write, and only where the caller cannot state the
 * result: the vocabulary keeps the FIRST spelling of a tag, which may be one
 * another record introduced, so "what does this record display now" is a
 * question the write's own inputs cannot answer. Every ordinary read gets its
 * tags from {@link entityTagsProjection} and costs no statement at all.
 */
export function entityTagsStatement(
  db: D1Database,
  workspaceId: string,
  entityId: string,
): D1PreparedStatement {
  return db
    .prepare(
      `SELECT group_concat(ordered.label, char(31)) AS tags
         FROM (SELECT wt.label AS label
                 FROM entity_tags et
                 JOIN workspace_tags wt
                   ON wt.workspace_id = et.workspace_id
                  AND wt.tag_key = et.tag_key
                WHERE et.workspace_id = ? AND et.entity_id = ?
                ORDER BY et.tag_key ASC) AS ordered`,
    )
    .bind(workspaceId, entityId);
}

export interface EntityTagWriteInput {
  readonly db: D1Database;
  readonly workspaceId: string;
  readonly entityId: string;
  /** The validated, canonical set the record should carry after the write. */
  readonly tags: readonly WorkspaceTag[];
  /** The storage timestamp new rows are stamped with. */
  readonly now: string;
  /**
   * The id of the Activity event this write belongs to. Every statement is
   * guarded on that event existing, so tags change if and only if the record
   * genuinely changed and the change was recorded.
   */
  readonly activityId: string;
}

/**
 * Build the three guarded statements that make one entity's tags exactly `tags`.
 *
 * Append them to the record's own atomic batch, AFTER the Activity statements.
 * They are ordered vocabulary → attach → detach: the vocabulary row must exist
 * before `entity_tags` may reference it (`entity_tags_tag_fk`), and detaching
 * last means a set that only re-orders never leaves the record momentarily
 * untagged inside the transaction.
 *
 * A vocabulary entry is never deleted here. A word the owner has used stays
 * offerable after the last record drops it — a vocabulary that forgets a tag the
 * moment nothing carries it is an aggregate, not a vocabulary, and would make
 * `#errand` un-typable again the first time the last errand is done.
 */
export function buildEntityTagStatements(
  input: EntityTagWriteInput,
): readonly D1PreparedStatement[] {
  const { db, workspaceId, entityId, tags, now, activityId } = input;
  const vocabularyJson = JSON.stringify(
    tags.map((tag) => ({ k: tag.key, l: tag.label })),
  );
  const keysJson = JSON.stringify(tags.map((tag) => tag.key));

  // 1. Every tag the owner used exists in the vocabulary. `OR IGNORE` is the
  //    "first spelling wins" rule: an existing entry keeps the casing it has,
  //    so re-typing `ERRAND` never re-cases every record already carrying it.
  const vocabulary = db
    .prepare(
      `INSERT OR IGNORE INTO workspace_tags
         (workspace_id, tag_key, label, created_at, updated_at)
       SELECT ?, json_extract(entry.value, '$.k'), json_extract(entry.value, '$.l'), ?, ?
         FROM json_each(?) AS entry
        WHERE EXISTS (SELECT 1 FROM activities WHERE id = ? AND workspace_id = ?)`,
    )
    .bind(workspaceId, now, now, vocabularyJson, activityId, workspaceId);

  // 2. Attach the record to every tag in the set. `OR IGNORE` makes re-saving an
  //    unchanged set a no-op rather than a constraint violation.
  const attach = db
    .prepare(
      `INSERT OR IGNORE INTO entity_tags (workspace_id, entity_id, tag_key, created_at)
       SELECT ?, ?, entry.value, ?
         FROM json_each(?) AS entry
        WHERE EXISTS (SELECT 1 FROM activities WHERE id = ? AND workspace_id = ?)`,
    )
    .bind(workspaceId, entityId, now, keysJson, activityId, workspaceId);

  // 3. Detach everything the set no longer names. An empty set clears the record.
  const detach = db
    .prepare(
      `DELETE FROM entity_tags
        WHERE workspace_id = ? AND entity_id = ?
          AND tag_key NOT IN (SELECT entry.value FROM json_each(?) AS entry)
          AND EXISTS (SELECT 1 FROM activities WHERE id = ? AND workspace_id = ?)`,
    )
    .bind(workspaceId, entityId, keysJson, activityId, workspaceId);

  return [vocabulary, attach, detach];
}

/**
 * The `EXISTS` predicate that filters a collection to records carrying ANY of
 * `keys` — a SEMI-join, never a join.
 *
 * That distinction is the whole reason this helper exists rather than a `JOIN`
 * in the caller: a task carrying two of the three filtered tags matches a JOIN
 * twice, which duplicates it in the page, corrupts the count beside the filter
 * and makes cursor pagination skip a row. `EXISTS` stops at the first match, so
 * a record appears exactly once however many of the named tags it carries.
 *
 * Returns the SQL fragment and the parameters to bind, in order. The caller
 * splices both into its own statement; nothing here reaches SQL as text.
 */
export function tagFilterPredicate(
  entityAlias: string,
  keys: readonly string[],
  idColumn = "id",
): { readonly sql: string; readonly params: readonly string[] } {
  const placeholders = keys.map(() => "?").join(", ");
  return {
    sql: `EXISTS (SELECT 1 FROM entity_tags et
                   WHERE et.workspace_id = ${entityAlias}.workspace_id
                     AND et.entity_id = ${entityAlias}.${idColumn}
                     AND et.tag_key IN (${placeholders}))`,
    params: keys,
  };
}

/**
 * The `EXISTS` predicate that matches a record whose tags contain a search
 * needle — one `?`, bound by the caller, already `likeContains`-escaped.
 *
 * A semi-join for the same reason {@link tagFilterPredicate} is one: a Person
 * whose two tags both match the needle must appear once. It replaces the
 * `lower(d.tags) LIKE ?` scan over the old JSON column, which could match the
 * JSON punctuation between two tags and could not use an index at all.
 */
export function tagSearchPredicate(
  entityAlias: string,
  idColumn = "entity_id",
): string {
  return `EXISTS (SELECT 1 FROM entity_tags et
                    JOIN workspace_tags wt
                      ON wt.workspace_id = et.workspace_id
                     AND wt.tag_key = et.tag_key
                   WHERE et.workspace_id = ${entityAlias}.workspace_id
                     AND et.entity_id = ${entityAlias}.${idColumn}
                     AND wt.tag_key LIKE ? ESCAPE '\\')`;
}
