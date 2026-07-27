/**
 * NOTES-02 seam — the `[[Wiki Link]]` resolver (`GET /notes/resolve?title=`).
 *
 * A resource route (no UI) that turns a wiki-link title into a real record at
 * navigation time — the one workspace-scoped step the deterministic FND-08
 * renderer deliberately does NOT do. It finds an active entity in the trusted
 * workspace whose title matches the requested title (case-insensitively) and has
 * a genuine canonical destination, and redirects there; if none is found it lands
 * on the Notes collection rather than a dead end (AGENTS.md §6). A note may
 * wiki-link any record type, so the match is not restricted to notes; notes are
 * preferred when several titles collide.
 */

import { env } from "cloudflare:workers";
import { redirect } from "react-router";

import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import { entityDestination } from "~/shared/entity/destination";

import type { Route } from "./+types/resolve";

/** How many entities to read per page while scanning for a title match. */
const SCAN_PAGE_SIZE = 100;

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const title = (new URL(request.url).searchParams.get("title") ?? "")
    .trim()
    .toLocaleLowerCase();
  if (title === "") return redirect("/notes");

  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  // Scan through ALL cursor pages — there is deliberately NO page cutoff. Entity
  // listing is ordered by creation time, so a fixed page cap would make an
  // exact-title target created later in a large workspace unreachable (it would
  // wrongly fall back to `/notes`). We stop early the instant a NOTE match is
  // found (the common wiki-link case); a non-note match is remembered and used
  // only after the whole workspace is scanned, so notes remain preferred without
  // an arbitrary correctness limit. Reviewer: resolve wiki links beyond the first
  // 500 entities.
  let noteMatch: { type: string; id: string } | null = null;
  let anyMatch: { type: string; id: string } | null = null;
  let cursor: string | undefined;

  do {
    const listed = await scope.entities.list({
      limit: SCAN_PAGE_SIZE,
      ...(cursor ? { cursor } : {}),
    });
    for (const entity of listed.items) {
      if (entity.title.trim().toLocaleLowerCase() !== title) continue;
      // Only redirect to a type with a genuine canonical destination.
      if (!entityDestination(entity.type, entity.id)) continue;
      if (entity.type === "note") {
        noteMatch = { type: entity.type, id: entity.id };
        break;
      }
      anyMatch ??= { type: entity.type, id: entity.id };
    }
    if (noteMatch) break;
    cursor = listed.nextCursor ?? undefined;
  } while (cursor);

  const match = noteMatch ?? anyMatch;
  if (!match) return redirect("/notes");

  const destination = entityDestination(match.type, match.id);
  // A route destination redirects directly; a drawer-only type (task) has no
  // standalone URL, so fall back to the Notes collection rather than a broken link.
  if (destination?.kind === "route") return redirect(destination.to);
  return redirect("/notes");
}
