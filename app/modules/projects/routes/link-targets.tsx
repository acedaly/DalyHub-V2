/**
 * PROJ-01 — the project "related records" target search endpoint
 * (`/projects/:projectId/link-targets?q=`).
 *
 * A resource route (no UI) backing the Key links picker's `searchTargets` loader. It
 * returns only ACTIVE, in-workspace entities of the permitted target types, excluding
 * the anchor project — so an inaccessible title never leaks. Same trusted
 * authenticated composition boundary as the other project routes.
 */

import { env } from "cloudflare:workers";

import { searchLinkTargets } from "~/platform/entity-links";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import type { EntityLinkTargetOption } from "~/shared/forms/model";

import { PROJECT_RELATE_TARGET_TYPES } from "../project-links";
import type { Route } from "./+types/link-targets";

export interface ProjectLinkTargetsData {
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
  const projectId = params.projectId;
  const query = new URL(request.url).searchParams.get("q") ?? "";

  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  // The anchor is a PROJECT id. Confirm it resolves to a project in this workspace
  // before searching, so this endpoint never serves target options for a non-project
  // (or cross-workspace) anchor — the same calm not-found.
  const project = await scope.spine.getById(projectId);
  if (!project || project.kind !== "project") {
    return json({ error: "not_found" }, 404);
  }

  const options = await searchLinkTargets(
    { entities: scope.entities, entityLinks: scope.entityLinks },
    {
      anchorId: projectId,
      query,
      targetTypes: [...PROJECT_RELATE_TARGET_TYPES],
    },
  );

  return json({ options } satisfies ProjectLinkTargetsData);
}
