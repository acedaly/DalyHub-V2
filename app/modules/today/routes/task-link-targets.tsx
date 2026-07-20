/**
 * TODAY-02 — the "related records" target search endpoint
 * (`/today/task/:taskId/link-targets?q=`).
 *
 * A resource route (no UI) backing the Drawer's EntityLinkPicker `searchTargets`
 * loader. It returns only ACTIVE, in-workspace entities of the permitted target
 * types, excluding the anchor task — so an inaccessible title never leaks. The same
 * trusted authenticated composition boundary as the other task routes.
 */

import { env } from "cloudflare:workers";

import { searchLinkTargets } from "~/platform/entity-links";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import type { EntityLinkTargetOption } from "~/shared/forms/model";

import { TASK_RELATE_TARGET_TYPES } from "../task/task-view";
import type { Route } from "./+types/task-link-targets";

export interface TaskLinkTargetsData {
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
      targetTypes: [...TASK_RELATE_TARGET_TYPES],
    },
  );

  return json({ options } satisfies TaskLinkTargetsData);
}
