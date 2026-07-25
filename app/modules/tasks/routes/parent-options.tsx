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

import { searchLinkTargets } from "~/platform/entity-links";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import type { TaskParentOption } from "../tasks-contract";
import type { Route } from "./+types/parent-options";

/** The entity types a task may sit under (Project preferred, Area permitted). */
const TASK_PARENT_TYPES = ["project", "area"] as const;

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

  const targets = await searchLinkTargets(
    { entities: scope.entities, entityLinks: scope.entityLinks },
    {
      anchorId: "",
      query,
      targetTypes: [...TASK_PARENT_TYPES],
      limit: PARENT_OPTIONS_LIMIT,
    },
  );

  const options: TaskParentOption[] = targets.map((target) => ({
    id: target.id,
    kind: target.type === "area" ? "area" : "project",
    title: target.title,
    context: target.type === "area" ? "Area" : "Project",
  }));

  return json({ options } satisfies TaskParentOptionsData);
}
