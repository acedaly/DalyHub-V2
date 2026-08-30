/**
 * V2.6 FIND-02 — the D1 implementation of the tag vocabulary read port.
 *
 * Two statements exist in this file and both are bounded, workspace-scoped and
 * FLAT IN WORKSPACE SIZE — which is FIND-02 acceptance criterion 5, and the
 * reason the vocabulary is a table rather than an aggregate over the records
 * that carry tags:
 *
 *   - {@link D1TagVocabularyRepository.listVocabulary} reads `workspace_tags`
 *     alone, in primary-key order, with a `LIMIT`. It never touches `entities`,
 *     never touches a detail table, and never sorts: `(workspace_id, tag_key)`
 *     is the primary key, so the index supplies the ordering and the statement
 *     stops after `limit` rows. Adding ten thousand Tasks to the workspace does
 *     not change what it reads.
 *   - {@link D1TagVocabularyRepository.listVocabularyUsage} adds a grouped count
 *     over `entity_tags_by_tag`. It is bounded by the same ceiling and reads one
 *     index, never a record body. It REPLACES the NOTES-02 tag facet, which had
 *     to project 500 note rows and fold their JSON in JavaScript because a JSON
 *     column cannot be grouped.
 *
 * Workspace isolation is structural (ADR-010): the repository is constructed
 * with one `WorkspaceContext`, no method accepts a workspace id, and every
 * statement binds it.
 */

import {
  TAG_VOCABULARY_READ_LIMIT,
  type TagVocabularyRepository,
  type WorkspaceTag,
  type WorkspaceTagUsage,
} from "~/kernel/tags";
import type { WorkspaceContext } from "~/kernel/workspaces";

/** A vocabulary read that failed at the storage boundary. */
export class TagVocabularyStorageError extends Error {
  constructor(options?: { cause?: unknown }) {
    super("The tag vocabulary could not be read.", options);
    this.name = "TagVocabularyStorageError";
  }
}

interface VocabularyRow {
  readonly tag_key: string;
  readonly label: string;
}

interface UsageRow extends VocabularyRow {
  readonly usage_count: number;
}

function bounded(limit: number | undefined): number {
  return Math.min(
    Math.max(1, limit ?? TAG_VOCABULARY_READ_LIMIT),
    TAG_VOCABULARY_READ_LIMIT,
  );
}

export class D1TagVocabularyRepository implements TagVocabularyRepository {
  readonly #db: D1Database;
  readonly #workspaceId: string;

  constructor(db: D1Database, context: WorkspaceContext) {
    this.#db = db;
    this.#workspaceId = context.workspaceId;
  }

  async listVocabulary(limit?: number): Promise<readonly WorkspaceTag[]> {
    try {
      const result = await this.#db
        .prepare(
          `SELECT tag_key, label
             FROM workspace_tags
            WHERE workspace_id = ?
            ORDER BY tag_key ASC
            LIMIT ?`,
        )
        .bind(this.#workspaceId, bounded(limit))
        .all<VocabularyRow>();
      return (result.results ?? []).map((row) => ({
        key: row.tag_key,
        label: row.label,
      }));
    } catch (cause) {
      throw new TagVocabularyStorageError({ cause });
    }
  }

  async listVocabularyUsage(
    options: { readonly limit?: number; readonly entityType?: string } = {},
  ): Promise<readonly WorkspaceTagUsage[]> {
    const limit = bounded(options.limit);
    // The entity-type narrowing is a BOUND parameter compared against
    // `entities.type`, never interpolated, and `NULL` means "every type" — so a
    // caller cannot widen the statement or reach another workspace's rows.
    const entityType = options.entityType ?? null;
    try {
      const result = await this.#db
        .prepare(
          `SELECT wt.tag_key AS tag_key,
                  wt.label AS label,
                  COUNT(e.id) AS usage_count
             FROM workspace_tags wt
             LEFT JOIN entity_tags et
               ON et.workspace_id = wt.workspace_id
              AND et.tag_key = wt.tag_key
             LEFT JOIN entities e
               ON e.workspace_id = et.workspace_id
              AND e.id = et.entity_id
              AND e.deleted_at IS NULL
              AND (?2 IS NULL OR e.type = ?2)
            WHERE wt.workspace_id = ?1
            GROUP BY wt.tag_key, wt.label
            ORDER BY usage_count DESC, wt.tag_key ASC
            LIMIT ?3`,
        )
        .bind(this.#workspaceId, entityType, limit)
        .all<UsageRow>();
      return (result.results ?? []).map((row) => ({
        key: row.tag_key,
        label: row.label,
        count: Number(row.usage_count ?? 0),
      }));
    } catch (cause) {
      throw new TagVocabularyStorageError({ cause });
    }
  }
}
