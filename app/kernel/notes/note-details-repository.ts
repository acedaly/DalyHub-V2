/**
 * NOTES-01A Notes kernel — the Note-details read/mutation repository contract.
 *
 * Storage-independent and workspace-bound at construction, mirroring
 * `~/kernel/goals/goal-details-repository.ts` and
 * `~/kernel/project-settings/project-settings-repository.ts`. Every write
 * verifies the target is an ACTIVE Note in the bound workspace (missing,
 * deleted, wrong-type and cross-workspace ids fail closed via
 * {@link NoteDetailsNotFoundError}) and is atomic with its Activity append —
 * never a separate precondition read followed by an unguarded write.
 */

import type {
  NoteDetailsChangeResult,
  NoteDetailsRecord,
} from "./note-details";

export interface NoteDetailsRepository {
  /**
   * Read a Note's Markdown content. Returns the validated empty-string
   * content (`contentUpdatedAt: null`) when the Note is active but has no
   * `note_details` row (never backfilled). Returns `null` for a missing,
   * soft-deleted, wrong-type or cross-workspace Note id — the cases are never
   * distinguished, so a caller cannot learn which one occurred.
   */
  get(id: string): Promise<NoteDetailsRecord | null>;

  /**
   * Replace the Note's Markdown content with the exact submitted source
   * (validated through the shared FND-08 parser — never trimmed or
   * rewritten). Idempotent: when the validated source exactly matches the
   * currently-stored effective content (the empty string when there is no
   * row yet), this is a no-op — no write, no Activity. A genuine change
   * atomically upserts `note_details` and appends `note.content_updated` in
   * the SAME transaction — an Activity-insert failure rolls the content
   * write back too.
   */
  update(id: string, content: string): Promise<NoteDetailsChangeResult>;
}
