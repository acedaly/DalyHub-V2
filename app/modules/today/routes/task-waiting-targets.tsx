/**
 * TODAY-03 — the waiting-target search endpoint
 * (`/today/task/:taskId/waiting-targets?q=`).
 *
 * A resource route (no UI) backing the Task Drawer's waiting-control entity picker.
 * It returns only ACTIVE, in-workspace entities of the permitted WAITING target
 * types (Person, Project, Goal, Area, Task), excluding the anchor task — so an
 * inaccessible or cross-workspace title never leaks. Same trusted authenticated
 * composition boundary as the other task routes; the anchor is verified to be a
 * task before searching (a non-task/cross-workspace anchor gets the calm 404).
 */

import { env } from "cloudflare:workers";

import { searchLinkTargets } from "~/platform/entity-links";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import { WAITING_TARGET_TYPES } from "~/kernel/tasks";
import type { EntityLinkTargetOption } from "~/shared/forms/model";

import type { Route } from "./+types/task-waiting-targets";

export interface TaskWaitingTargetsData {
  readonly options: readonly EntityLinkTargetOption[];
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

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const taskId = params.taskId;
  const query = new URL(request.url).searchParams.get("q") ?? "";

  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  // The anchor is a TASK id. Confirm it resolves to a task in this workspace
  // before searching, so this endpoint never serves target options for a
  // non-task (or cross-workspace) anchor — the same calm not-found.
  if (!(await scope.tasks.getTask(taskId))) {
    return json({ error: "not_found" }, 404);
  }

  const options = await searchLinkTargets(
    { entities: scope.entities, entityLinks: scope.entityLinks },
    {
      anchorId: taskId,
      query,
      targetTypes: [...WAITING_TARGET_TYPES],
    },
  );

  return json({ options } satisfies TaskWaitingTargetsData);
}
