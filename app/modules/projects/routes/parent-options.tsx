/**
 * PROJ-01 — the New Project parent search endpoint (`/projects/parent-options?q=`).
 *
 * A resource route (no UI) backing the "Area or Goal" picker in the create form.
 * The set of eligible parents (every active Area and Goal in the workspace) can
 * exceed any static bound, so the picker is server-backed and searchable rather
 * than a fixed list: it returns only ACTIVE, in-workspace Areas and Goals whose
 * title matches the query, through the same trusted authenticated composition
 * boundary as the other project routes. The KIND (Area vs Goal) is resolved
 * server-side from each entity's real type — the client never asserts it — and the
 * create action re-verifies the chosen parent's kind and ownership independently, so
 * this endpoint is a convenience for selection, never the authority.
 */

import { env } from "cloudflare:workers";

import { searchLinkTargets } from "~/platform/entity-links";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import type { SelectOption } from "~/shared/forms/types";

import type { Route } from "./+types/parent-options";

/** The entity types a project may sit under (an Area) or advance (a Goal). */
const PROJECT_PARENT_TYPES = ["area", "goal"] as const;

/** How many parent options a single search returns (bounded — never unbounded). */
const PARENT_OPTIONS_LIMIT = 50;

export interface ProjectParentOptionsData {
  readonly options: readonly SelectOption[];
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

  // Reuse the shared, workspace-scoped, bounded target search: a case-insensitive
  // title match over active Areas and Goals only. There is no anchor to exclude for
  // a not-yet-created project, so the anchor id is empty (matches nothing).
  const targets = await searchLinkTargets(
    { entities: scope.entities, entityLinks: scope.entityLinks },
    {
      anchorId: "",
      query,
      targetTypes: [...PROJECT_PARENT_TYPES],
      limit: PARENT_OPTIONS_LIMIT,
    },
  );

  const options: SelectOption[] = targets.map((target) => ({
    value: target.id,
    label: target.title,
    description: target.type === "goal" ? "Goal" : "Area",
  }));

  return json({ options } satisfies ProjectParentOptionsData);
}
