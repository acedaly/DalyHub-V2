/**
 * PROJ-03 — Project Knowledge: the Notes a Project is explicitly linked to.
 *
 * **The relationship model is the FND-04 EntityLink kernel, unchanged.** A
 * Note belongs to a Project's knowledge when there is an ACTIVE, non-structural
 * `entity_links` row between them, in EITHER direction. There is deliberately no
 * `project_notes` join table and no `note.project_id` column, because
 * `entity_links` already provides everything such a table would have to
 * re-implement, and provides it correctly:
 *
 *   - **many-to-many** — a Note may document several Projects, a Project may
 *     hold many Notes;
 *   - **uniqueness** — `UNIQUE (workspace_id, source, target, type)` spans
 *     unlinked rows too, so linking the same pair twice is impossible;
 *   - **restore in place** — re-adding a removed Note restores the SAME link id
 *     rather than minting a duplicate (§9: restoration must not duplicate);
 *   - **workspace isolation at the database level** — both endpoints carry a
 *     composite FK into `entities (workspace_id, id)`;
 *   - **stable ids, never titles** — renaming either record cannot break it;
 *   - **Activity** — create/remove are recorded atomically on BOTH records.
 *
 * Cardinality is therefore **many-to-many, at most one association per
 * (Project, Note, link type)**, and the presentation de-duplicates by Note so a
 * pair linked by two different types still shows exactly one row.
 *
 * Adding uses the module-agnostic `link.related` type, so a Note added here is
 * the SAME relationship the shared Linked Items surface shows on both records —
 * not a private Projects-only association the rest of the app cannot see.
 */

import { isReservedSpineLinkType } from "~/kernel/spine";
import type { EntityLinkRepository } from "~/kernel/entity-links";
import type { EntityRepository } from "~/kernel/entities";
import type { NoteQueryRepository } from "~/kernel/notes";
import { excerptAroundMatch } from "~/platform/markdown/note-document";

import { UNIVERSAL_RELATED_LINK } from "./universal-links";

/** One Note in a Project's knowledge view. */
export interface ProjectKnowledgeNote {
  readonly id: string;
  readonly title: string;
  /** Every active link id joining this Note to the Project (usually one). */
  readonly linkIds: readonly string[];
  readonly archived: boolean;
  /** A bounded, syntax-free opening excerpt, or `""` for an empty note. */
  readonly excerpt: string;
  /** ISO-8601 — when the association was last created or restored. */
  readonly linkedAt: string;
}

export interface ProjectKnowledgePage {
  readonly notes: readonly ProjectKnowledgeNote[];
  readonly nextCursor: string | null;
}

export interface ProjectKnowledgeDeps {
  readonly entities: Pick<EntityRepository, "getById" | "create" | "list">;
  readonly entityLinks: Pick<
    EntityLinkRepository,
    "create" | "listForEntity" | "unlink"
  >;
  readonly notes: Pick<NoteQueryRepository, "loadContextWindows" | "list">;
}

export const DEFAULT_KNOWLEDGE_PAGE = 25;
const LINK_SCAN_PAGE_SIZE = 100;
const MAX_SCAN_PAGES_PER_CALL = 10;

/**
 * One bounded page of a Project's knowledge: the ACTIVE Notes explicitly linked
 * to it, in either direction, de-duplicated by Note.
 *
 * Soft-deleted Notes are excluded by the kernel's own `listForEntity` contract
 * (its counterpart join is active-only), so a deleted Note leaves the Knowledge
 * tab without its link row being touched — and returns, with the association
 * intact, if it is restored. ARCHIVED Notes DO appear, flagged, because
 * archiving is "put away", not "removed": hiding them would silently drop
 * knowledge the Project still owns.
 */
export async function loadProjectKnowledge(
  deps: ProjectKnowledgeDeps,
  projectId: string,
  options: { readonly limit?: number; readonly cursor?: string } = {},
): Promise<ProjectKnowledgePage> {
  const limit = Math.max(1, options.limit ?? DEFAULT_KNOWLEDGE_PAGE);
  const byNote = new Map<
    string,
    { title: string; linkIds: string[]; linkedAt: string }
  >();

  let cursor: string | undefined = options.cursor;
  let scanned = 0;
  do {
    const page = await deps.entityLinks.listForEntity(projectId, {
      direction: "both",
      limit: LINK_SCAN_PAGE_SIZE,
      ...(cursor ? { cursor } : {}),
    });
    scanned += 1;
    for (const view of page.items) {
      if (isReservedSpineLinkType(view.link.type)) continue;
      if (view.counterpart.type !== "note") continue;
      const existing = byNote.get(view.counterpart.id);
      if (existing) {
        existing.linkIds.push(view.link.id);
        continue;
      }
      byNote.set(view.counterpart.id, {
        title: view.counterpart.title,
        linkIds: [view.link.id],
        linkedAt: view.link.updatedAt.toISOString(),
      });
    }
    cursor = page.nextCursor ?? undefined;
  } while (cursor && byNote.size < limit && scanned < MAX_SCAN_PAGES_PER_CALL);

  const ids = [...byNote.keys()].slice(0, limit);
  // ONE batched query resolves every note's archive state and opening excerpt.
  const windows = await deps.notes.loadContextWindows(ids, "");

  return {
    notes: ids.map((id) => {
      const entry = byNote.get(id)!;
      const found = windows.get(id);
      return {
        id,
        title: entry.title,
        linkIds: entry.linkIds,
        archived: found?.archivedAt != null,
        excerpt: found ? excerptAroundMatch(found.window, "") : "",
        linkedAt: entry.linkedAt,
      };
    }),
    nextCursor: cursor ?? null,
  };
}

/**
 * Associate an existing Note with a Project.
 *
 * Idempotent by construction: the kernel's relationship identity means a second
 * call returns the existing link (or restores a previously removed one in
 * place), so the Knowledge tab can never hold the same Note twice (§8).
 * Endpoint validation is the kernel's — a non-existent, deleted or
 * cross-workspace id fails closed as an endpoint error and writes nothing.
 */
export async function linkNoteToProject(
  deps: ProjectKnowledgeDeps,
  projectId: string,
  noteId: string,
): Promise<void> {
  await deps.entityLinks.create({
    sourceEntityId: projectId,
    targetEntityId: noteId,
    type: UNIVERSAL_RELATED_LINK,
  });
}

/**
 * Remove a Note from a Project's knowledge.
 *
 * This unlinks the RELATIONSHIP and nothing else: the Note keeps its content,
 * its title, its tags, its other relationships and its place in `/notes`. It is
 * neither deleted nor archived (§8). Every active non-structural link between
 * the two records is removed, so the Note genuinely leaves the tab whichever
 * direction the association was created from — and re-adding it later restores
 * the same link id rather than creating a duplicate.
 */
export async function unlinkNoteFromProject(
  deps: ProjectKnowledgeDeps,
  projectId: string,
  noteId: string,
): Promise<number> {
  let removed = 0;
  let cursor: string | undefined;
  let scanned = 0;
  const linkIds: string[] = [];
  do {
    const page = await deps.entityLinks.listForEntity(projectId, {
      direction: "both",
      limit: LINK_SCAN_PAGE_SIZE,
      ...(cursor ? { cursor } : {}),
    });
    scanned += 1;
    for (const view of page.items) {
      if (isReservedSpineLinkType(view.link.type)) continue;
      if (view.counterpart.id !== noteId) continue;
      linkIds.push(view.link.id);
    }
    cursor = page.nextCursor ?? undefined;
  } while (cursor && scanned < MAX_SCAN_PAGES_PER_CALL);

  for (const linkId of linkIds) {
    const result = await deps.entityLinks.unlink(linkId);
    if (result.changed) removed += 1;
  }
  return removed;
}
