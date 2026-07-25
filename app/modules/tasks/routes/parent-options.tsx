/**
 * TASKS-01 — the create-task parent search endpoint (`/tasks/parent-options?q=`).
 *
 * A resource route (no UI) backing the parent selector in the `/tasks` quick-create
 * flow. A Task structurally REQUIRES exactly one parent — an Area OR a Project
 * (ADR-043 §9 / the spine's `TaskParentInput`) — so this returns only ACTIVE,
 * in-workspace Projects and Areas whose title matches the query, through the same
 * trusted authenticated composition boundary as the other task routes. The KIND is
 * resolved server-side from each entity's real type; the create action re-verifies
 * the chosen parent independently, so this endpoint is a convenience for selection,
 * never the authority. No hidden "Inbox Project" is ever invented (ADR-043 §9).
 */

import { env } from "cloudflare:workers";

import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import type { TaskParentOption } from "../tasks-contract";
import type { Route } from "./+types/parent-options";

/** How many parent options a single search returns (bounded — never unbounded). */
const PARENT_OPTIONS_LIMIT = 50;

export interface TaskParentOptionsData {
  readonly options: readonly TaskParentOption[];
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const query = new URL(request.url).searchParams.get("q") ?? "";

  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  // Bounded, indexed, workspace-scoped title search over the WHOLE collection of
  // valid task parents (active Areas + non-archived Projects) — never a fixed-prefix
  // scan that could hide a newer parent in a long-lived workspace (ADR-043 §9).
  const candidates = await scope.tasks.searchTaskParents({
    query,
    limit: PARENT_OPTIONS_LIMIT,
  });

  const options: TaskParentOption[] = candidates.map((candidate) => ({
    id: candidate.id,
    kind: candidate.kind,
    title: candidate.title,
    context: candidate.kind === "area" ? "Area" : "Project",
  }));

  return json({ options } satisfies TaskParentOptionsData);
}
