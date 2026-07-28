/**
 * NOTES-02 — the `[[Wiki Link]]` resolver (`GET /notes/resolve?title=`).
 *
 * A resource route (no UI) that turns a wiki-link title into a real record at
 * navigation time — the one workspace-scoped step the deterministic FND-08
 * renderer deliberately does NOT do.
 *
 * NOTES-02 replaced the original whole-workspace page scan (the performance half
 * of [DEBT-39]) with the SAME bounded, indexed lookup that reconciliation uses:
 * `NoteQueryRepository.resolveReferenceTargets`. That matters for more than
 * speed — it makes navigation and relationship reconciliation agree by
 * construction. Both resolve a title through one function with one total,
 * stable tie-break (a Note wins, then the earliest-created record), so clicking
 * a wiki link can never land somewhere different from the record the saved
 * relationship points at.
 *
 * A note may wiki-link any record type, so the match is not restricted to
 * notes. When the resolved record has no standalone canonical URL (a Task opens
 * in the shared Drawer), or when nothing matches, this lands on the Notes
 * collection rather than a dead end (AGENTS.md §6).
 */

import { env } from "cloudflare:workers";
import { redirect } from "react-router";

import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import { entityDestination } from "~/shared/entity/destination";

import type { Route } from "./+types/resolve";

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const title = (new URL(request.url).searchParams.get("title") ?? "").trim();
  if (title === "") return redirect("/notes");

  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

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
