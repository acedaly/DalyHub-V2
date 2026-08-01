/**
 * NOTES-02/NOTES-05 — the internal-link resolver (`GET /notes/resolve`).
 *
 * The ONE workspace-scoped step the deterministic FND-08 renderer deliberately
 * does NOT do. It serves both internal-link forms, because both need exactly the
 * same trusted lookup and must land in exactly the same place:
 *
 *   - `?title=…`   — a `[[Wiki Link]]`, resolved by TITLE at navigation time;
 *   - `?type=&id=` — a `dalyhub://type/id` record link, resolved by STABLE ID.
 *
 * ## Why the renderer cannot do this
 *
 * Resolution needs the workspace, and the renderer is stateless by contract
 * (ADR-015 §4.7). Keeping the lookup here is also what stops a link target from
 * being client-authored: the id in a note body is user input, so it is verified
 * against the trusted workspace scope HERE, and a cross-workspace id resolves to
 * nothing rather than disclosing whether it exists (§28).
 *
 * ## Title resolution
 *
 * NOTES-02 replaced the original whole-workspace page scan (the performance half
 * of [DEBT-39]) with the SAME bounded, indexed lookup that reconciliation uses:
 * `NoteQueryRepository.resolveReferenceTargets`. That matters for more than
 * speed — it makes navigation and relationship reconciliation agree by
 * construction. Both resolve a title through one function with one total, stable
 * tie-break (a Note wins, then the earliest-created record), so clicking a wiki
 * link can never land somewhere different from the record the saved relationship
 * points at.
 *
 * ## Id resolution, and being honest about a broken link
 *
 * A record link names a record that may since have been deleted — a normal state
 * in a knowledge base, not an error (§23). Rather than bouncing the user to
 * `/notes` with no explanation, an id that resolves to nothing renders a calm,
 * named "unavailable" page that says what happened and offers the way back. The
 * cases are never distinguished: a deleted record, a wrong-type id and a
 * cross-workspace id all produce the identical response, so a caller cannot
 * learn which one occurred.
 *
 * A record type with no standalone canonical URL (a Task opens in the shared
 * Drawer) has nowhere to redirect to, so it lands on the same page rather than a
 * dead end (AGENTS.md §6). A TITLE that resolves to nothing keeps NOTES-02's
 * original behaviour — back to the collection — because an unresolved `[[…]]` is
 * routinely a note about something not yet created, not a broken pointer.
 */

import { env } from "cloudflare:workers";
import { redirect } from "react-router";

import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import { EmptyState } from "~/shared/empty-state";
import { EntityIcon } from "~/shared/entity";
import { entityDestination } from "~/shared/entity/destination";

import type { Route } from "./+types/resolve";

export function meta() {
  return [{ title: "Link unavailable · DalyHub" }];
}

/** The one non-redirect outcome: the target could not be resolved. */
interface UnavailableTarget {
  readonly unavailable: true;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const params = new URL(request.url).searchParams;
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  const id = (params.get("id") ?? "").trim();
  if (id !== "") {
    return resolveById(scope, params.get("type"), id);
  }

  const title = (params.get("title") ?? "").trim();
  if (title === "") return redirect("/notes");

  // ONE bounded, indexed query over the trusted workspace — never a scan.
  const resolved = await scope.notes.resolveReferenceTargets([title]);
  const match = resolved.get(title.toLocaleLowerCase());
  if (!match) return redirect("/notes");

  const destination = entityDestination(match.type, match.id);
  // A route destination redirects directly; a drawer-only type (task) has no
  // standalone URL, so fall back to the Notes collection rather than a broken link.
  if (destination?.kind === "route") return redirect(destination.to);
  return redirect("/notes");
}

type Scope = Awaited<ReturnType<typeof resolveAuthenticatedWorkspaceScope>>;

/**
 * Resolve a `dalyhub://type/id` record link against the trusted workspace.
 *
 * `entities.getById` is the whole authorisation boundary: it is already bound to
 * this workspace and already excludes soft-deleted records, so a missing id, a
 * deleted record and another workspace's id are one indistinguishable outcome.
 * The declared type is checked against the STORED type, so a hand-written link
 * cannot claim a record is something it is not and have that claim honoured.
 */
async function resolveById(
  scope: Scope,
  declaredType: string | null,
  id: string,
): Promise<Response | UnavailableTarget> {
  const entity = await scope.entities.getById(id);
  if (!entity) {
    return { unavailable: true };
  }
  const declared = (declaredType ?? "").trim();
  if (declared !== "" && declared !== entity.type) {
    return { unavailable: true };
  }

  const destination = entityDestination(entity.type, entity.id);
  if (destination?.kind === "route") return redirect(destination.to);
  // A real record with no standalone page (a Task lives in the shared Drawer).
  // Saying so is more honest than a silent bounce to the collection.
  return { unavailable: true };
}

export default function ResolveRoute() {
  return (
    <div className="dh-note-not-found">
      <EmptyState
        icon={<EntityIcon type="note" />}
        title="That link doesn’t go anywhere"
        description="The record it points to may have been deleted, or it isn’t part of this workspace. The note itself is untouched."
        primaryAction={
          <a className="dh-btn dh-btn--primary" href="/notes">
            Back to Notes
          </a>
        }
      />
    </div>
  );
}
