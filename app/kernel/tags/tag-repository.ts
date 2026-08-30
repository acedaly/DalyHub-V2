/**
 * V2.6 FIND-02 — the tag vocabulary READ port.
 *
 * Deliberately read-only, and that is the design rather than an omission.
 *
 * A tag is an ATTRIBUTE of a record, so it is written by the record's own
 * repository, in the record's own atomic mutation, beside the record's own
 * Activity event (`d1-entity-tags.ts` builds those statements). A second write
 * port would be a second way to change a Person, which is exactly the "second
 * authority" the constitution forbids — and it would let a tag change land
 * outside the transaction that recorded it.
 *
 * What a caller genuinely needs from the vocabulary as a whole is *what words
 * exist here*, which is what this port answers.
 *
 * Workspace-scoped by construction (ADR-010): an implementation is constructed
 * with one `WorkspaceContext` and no method accepts a workspace id.
 */

import type { WorkspaceTag, WorkspaceTagUsage } from "./tag-vocabulary";

export interface TagVocabularyRepository {
  /**
   * The workspace's tag vocabulary, ordered by canonical key.
   *
   * ONE statement, with a stated ceiling, read in canonical-key order so the
   * primary key index supplies the ordering and no sort of the whole vocabulary
   * is performed. Flat in workspace size: the statement touches
   * `workspace_tags` only, never the records that carry the tags.
   */
  listVocabulary(limit?: number): Promise<readonly WorkspaceTag[]>;

  /**
   * The vocabulary with a usage count per tag, ordered by count then key.
   *
   * The Notes rail's tag facet reads this. ONE statement — a grouped count over
   * the `entity_tags_by_tag` index — so it replaces the fold over 500 note rows
   * NOTES-02 had to perform when tags were a JSON column.
   *
   * `entityType` narrows the count to one kind of record when a surface asks a
   * question about its own collection; omitted, it counts the whole workspace.
   */
  listVocabularyUsage(options?: {
    readonly limit?: number;
    readonly entityType?: string;
  }): Promise<readonly WorkspaceTagUsage[]>;
}
