/**
 * REDESIGN-04 §6.2 — the Goal's "link a Project" option endpoint
 * (`/goals/:goalId/link-projects?q=`).
 *
 * A resource route (no UI) backing the Overview's `+ Link project` picker. It
 * returns ACTIVE, in-workspace Projects whose title matches the query, minus the
 * ones already advancing this Goal — so the picker never offers a link that
 * already exists.
 *
 * ── Why the picker is here and the MUTATION is not ─────────────────────────
 * A Goal↔Project link is `project.advances_goal`, and the spine's invariant is
 * one active structural parent per child — so the link is the PROJECT's to
 * change, and it is changed through the Project's own trusted `move` intent
 * (`/projects/:id/mutate`), which re-verifies the chosen parent's kind and
 * ownership itself. This endpoint is a convenience for SELECTION and is never
 * the authority, exactly as `/projects/parent-options` is for the create form.
 * No second mutation path, and no new link semantics.
 */

import { env } from "cloudflare:workers";

import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import type { SelectOption } from "~/shared/forms/types";

import { GOAL_PROJECT_PAGE_SIZE } from "../goal-workspace-load";
import type { Route } from "./+types/link-projects";

/** How many options one search returns. Bounded — never an unbounded list. */
const LINK_PROJECT_OPTIONS_LIMIT = 25;

export interface GoalLinkProjectOptionsData {
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

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const goalId = params.goalId;
  const query = (new URL(request.url).searchParams.get("q") ?? "").trim();

  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  // Confirm the anchor really is a Goal in this workspace BEFORE searching, so
  // this endpoint never serves options for a non-Goal or cross-workspace anchor
  // — the same calm not-found every other anchored endpoint returns.
  const goal = await scope.spine.getById(goalId);
  if (!goal || goal.kind !== "goal") {
    return json({ error: "not_found" }, 404);
  }

  const [matches, existing] = await Promise.all([
    // The command-palette search read: active, non-archived Projects by title,
    // relevance-ordered and bounded. Exactly the set a link may target.
    scope.projects.searchProjects({
      text: query.length > 0 ? query : " ",
      limit: LINK_PROJECT_OPTIONS_LIMIT,
    }),
    scope.goals.listGoalProjects({ goalId, limit: GOAL_PROJECT_PAGE_SIZE }),
  ]);

  const linked = new Set(existing.items.map((item) => item.id));
  const options: SelectOption[] = matches
    .filter((project) => !linked.has(project.id))
    .map((project) => ({
      value: project.id,
      label: project.title,
      // The Project's current home, so the owner can see what the link would
      // move it away from before they choose it.
      description: project.goal
        ? `Advancing ${project.goal.title}`
        : (project.area?.title ?? "No Area"),
    }));

  return json({ options } satisfies GoalLinkProjectOptionsData);
}
