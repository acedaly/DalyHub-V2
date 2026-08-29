/**
 * V2.6 FIND-02 — the tag vocabulary endpoint (`GET /tags`).
 *
 * A resource route (no UI) that answers ONE question: *what tags does this
 * workspace use?* Every tagging surface in the product reads it, which is what
 * makes "one vocabulary source" true of the browser as well as of the database.
 *
 * ── Why an endpoint rather than seven loaders ────────────────────────────────
 *
 * Tags are offered on People, Assets, Notes and Tasks, on a record and on a
 * creation form, in a Drawer and on a full page. Adding the vocabulary to every
 * one of those loaders would put a query on every page render whether or not the
 * owner ever opens a tag picker — a cost paid by the many visits that do not tag
 * to save a round trip on the few that do. Reading it when a tagging FORM mounts
 * costs nothing anywhere else, and the picker opens immediately either way
 * (DHDS-09 §39: the surface paints with what the caller has and holds its height
 * with three placeholder rows while options arrive).
 *
 * The Tasks collection is the one deliberate exception and takes the opposite
 * trade for the opposite reason: its filter control needs the option set to RENDER the
 * control, not to fill one, so `/tasks` reads the vocabulary in its own loader
 * beside the delegate options it already resolves there.
 *
 * ── Bounded, and flat in workspace size ──────────────────────────────────────
 *
 * One statement over `workspace_tags` alone, in primary-key order, with a stated
 * ceiling (`TAG_VOCABULARY_READ_LIMIT`). It never touches `entities` and never
 * touches a detail table, so a workspace with ten thousand Tasks and a workspace
 * with ten read exactly the same rows.
 *
 * It fails CALM: a storage failure answers with an empty vocabulary rather than
 * an error, because a tag field whose suggestions did not load must still let
 * the owner type a tag. Nothing here is the authority for a tag — the record's
 * own mutate route validates and writes what it is sent, whatever this returned.
 */

import { env } from "cloudflare:workers";

import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import type { WorkspaceTag } from "~/kernel/tags";

import type { Route } from "./+types/tags";

/** The endpoint's payload. */
export interface TagVocabularyData {
  readonly tags: readonly WorkspaceTag[];
}

export async function loader({ context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  let tags: readonly WorkspaceTag[];
  try {
    const scope = await resolveAuthenticatedWorkspaceScope(env, session);
    tags = await scope.tags.listVocabulary();
  } catch {
    // Calm by design — see the note above.
    tags = [];
  }
  return new Response(JSON.stringify({ tags } satisfies TagVocabularyData), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
