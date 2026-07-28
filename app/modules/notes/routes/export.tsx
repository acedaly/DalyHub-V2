/**
 * NOTES-06 — single-Note export (`GET /notes/:noteId/export?format=md|txt`).
 *
 * A resource route (no UI). The whole authorisation story lives here, server
 * side, and nothing about it is negotiable by the client:
 *
 *   - `requireAuthenticatedSession` — no session, no export;
 *   - `resolveAuthenticatedWorkspaceScope` — the workspace comes from trusted
 *     server configuration, never a request value, so a crafted id cannot reach
 *     another workspace's note;
 *   - the anchor must be an ACTIVE `note` in that workspace: a missing, deleted,
 *     wrong-type or cross-workspace id all fail closed with the same calm 404,
 *     exactly as every other Notes route does.
 *
 * The response is a download, not a page: it streams the built string with a
 * `Content-Disposition: attachment` and `no-store`, so choosing "Export" never
 * reloads the app and never leaves the record. Only THIS note's data crosses the
 * boundary — the response is built from one record read.
 */

import { env } from "cloudflare:workers";

import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import { distinctReferenceTitles } from "~/platform/markdown";
import {
  NOTE_EXPORT_FORMAT_INFO,
  buildNoteExport,
  isNoteExportFormat,
  noteExportFilename,
  safeFilenameStem,
  type NoteExportInput,
} from "~/platform/notes/note-export";

import type { Route } from "./+types/export";

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "md";
  if (!isNoteExportFormat(format)) {
    throw new Response("Unsupported export format", { status: 400 });
  }

  const scope = await resolveAuthenticatedWorkspaceScope(env, session);
  const noteId = params.noteId;
  const entity = await scope.entities.getById(noteId);
  if (!entity || entity.type !== "note") {
    throw new Response("Not Found", { status: 404 });
  }
  const details = await scope.noteDetails.get(noteId);
  const content = details?.content ?? "";

  const note: NoteExportInput = {
    id: entity.id,
    title: entity.title,
    content,
    tags: details?.tags ?? [],
    createdAt: entity.createdAt,
    updatedAt:
      details?.contentUpdatedAt && details.contentUpdatedAt > entity.updatedAt
        ? details.contentUpdatedAt
        : entity.updatedAt,
    archived: details?.archivedAt != null,
  };

  // Resolve the note's own `[[…]]` references ONCE so the Markdown export can
  // write explicit `dalyhub://type/id` destinations instead of internal syntax
  // that would be meaningless outside DalyHub. One bounded, indexed query.
  const titles = format === "md" ? distinctReferenceTitles(content) : [];
  const targets =
    titles.length > 0
      ? await scope.notes.resolveReferenceTargets(titles)
      : new Map<string, { id: string; type: string; title: string }>();

  const body = buildNoteExport(
    note,
    format,
    (title) => targets.get(title.toLocaleLowerCase()) ?? null,
  );

  const filename = noteExportFilename(note, format, {
    disambiguate: await slugIsAmbiguous(scope, note),
  });

  return new Response(body, {
    headers: {
      "content-type": NOTE_EXPORT_FORMAT_INFO[format].mediaType,
      // `filename*` carries the UTF-8 name for modern clients; the ASCII
      // `filename` is already safe by construction (see `safeFilenameStem`).
      "content-disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

/**
 * True when another ACTIVE note in this workspace would export to the SAME
 * filename stem — in which case the download gets a stable id suffix so the two
 * files never collide and neither is silently renamed by the browser.
 *
 * Bounded: one small search page over titles, never a workspace scan.
 */
async function slugIsAmbiguous(
  scope: Awaited<ReturnType<typeof resolveAuthenticatedWorkspaceScope>>,
  note: NoteExportInput,
): Promise<boolean> {
  const stem = safeFilenameStem(note.title);
  try {
    const hits = await scope.notes.search({
      text: note.title,
      limit: 10,
      includeArchived: true,
    });
    return hits.some(
      (hit) => hit.id !== note.id && safeFilenameStem(hit.title) === stem,
    );
  } catch {
    // A failed uniqueness probe must never fail the export; fall back to the
    // plain, readable name.
    return false;
  }
}
