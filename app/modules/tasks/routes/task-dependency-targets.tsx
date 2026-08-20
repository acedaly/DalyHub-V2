/**
 * TASKS-12 — the dependency-target search endpoint
 * (`/tasks/:taskId/dependency-targets?q=`).
 *
 * A resource route (no UI) backing the Task record's "Add blocker" picker. It is
 * deliberately NOT the generic entity-link target search: a dependency has one
 * legal endpoint TYPE (a Task) and one legal anchor (this Task), so the endpoint
 * offers exactly what the relationship accepts and nothing else.
 *
 * It offers CANDIDATES, never permission. The picker cannot see whether a choice
 * would close a cycle or cross a bound — those are properties of the graph at the
 * moment of the write, and a list that hid them would be stale the instant
 * another device changed something. So the repository re-checks every invariant
 * inside the write and the picker is a convenience, exactly as the Task-parent
 * search is (ADR-043 §9). The one thing filtered here is the anchor itself, which
 * can never be a legal answer at any moment.
 *
 * Same trusted authenticated composition boundary as every other task route: the
 * workspace comes from server config, never from the client, and a non-task or
 * cross-workspace anchor gets the calm not-found.
 */

import { env } from "cloudflare:workers";

import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import type { EntityLinkTargetOption } from "~/shared/forms/model";

import type { Route } from "./+types/task-dependency-targets";

export interface TaskDependencyTargetsData {
  readonly options: readonly EntityLinkTargetOption[];
}

/**
 * How many candidates one search returns.
 *
 * A picker is read, not scrolled: twenty is more than anyone reads before typing
 * another letter, and the bound is what keeps this a constant-cost read whatever
 * the workspace holds.
 */
const DEPENDENCY_TARGET_LIMIT = 20;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const taskId = params.taskId;
  const query = new URL(request.url).searchParams.get("q") ?? "";

  const scope = await resolveAuthenticatedWorkspaceScope(env, session);
  if (!(await scope.tasks.getTask(taskId))) {
    return json({ error: "not_found" }, 404);
  }

  /*
   * The SAME bounded Task search global Search uses, so a blocker is found by the
   * same words that find the Task anywhere else in DalyHub. One extra result is
   * requested so removing the anchor cannot leave the list one short.
   */
  const hits = await scope.tasks.searchTasks({
    text: query,
    limit: DEPENDENCY_TARGET_LIMIT + 1,
  });

  const options: EntityLinkTargetOption[] = hits
    .filter((hit) => hit.id !== taskId)
    .slice(0, DEPENDENCY_TARGET_LIMIT)
    .map((hit) => ({ id: hit.id, type: "task", title: hit.title }));

  return json({ options } satisfies TaskDependencyTargetsData);
}
