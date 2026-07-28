/**
 * NOTES-02 — the Note references endpoint
 * (`GET /notes/:noteId/references?direction=incoming|outgoing&cursor=…`).
 *
 * A resource route (no UI) mirroring `/notes/:noteId/activity`: the record page
 * server-renders the FIRST page of backlinks and outgoing links so they are
 * present without JavaScript, and this endpoint serves each further page for the
 * shared "Load more" affordance. Both paths go through the SAME trusted
 * composition — authenticated session, server-derived workspace, calm 404 for a
 * missing / deleted / wrong-type / cross-workspace id.
 */

import { env } from "cloudflare:workers";

import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import {
  DEFAULT_REFERENCE_PAGE,
  loadNoteReferences,
} from "~/platform/entity-links/note-references";
import type { ReferencePage } from "~/shared/references";

import type { Route } from "./+types/references";

function parseDirection(value: string | null): "incoming" | "outgoing" {
  return value === "outgoing" ? "outgoing" : "incoming";
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const url = new URL(request.url);
  const direction = parseDirection(url.searchParams.get("direction"));
  const cursor = url.searchParams.get("cursor") ?? undefined;

  const scope = await resolveAuthenticatedWorkspaceScope(env, session);
  const entity = await scope.entities.getById(params.noteId);
  if (!entity || entity.type !== "note") {
    throw new Response("Not Found", { status: 404 });
  }

  // Outgoing context is read from THIS note's own source, which the caller
  // already owns server-side — no extra query, and nothing about another
  // record's body is exposed.
  const details =
    direction === "outgoing" ? await scope.noteDetails.get(entity.id) : null;

  const page: ReferencePage = await loadNoteReferences(
    scope,
    entity.id,
    direction,
    {
      limit: DEFAULT_REFERENCE_PAGE,
      ...(cursor ? { cursor } : {}),
      anchorTitle: entity.title,
      ...(details ? { anchorSource: details.content } : {}),
    },
  );

  return new Response(JSON.stringify(page), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
