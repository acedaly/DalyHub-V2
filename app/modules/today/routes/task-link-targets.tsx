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

function json(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
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
