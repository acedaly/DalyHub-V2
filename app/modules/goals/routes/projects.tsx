/**
 * AREA-02 / DEBT-22 — the Goal contributing-Projects pagination endpoint
 * (`/goals/:goalId/projects?cursor=`).
 *
 * A resource route (no UI) backing the Goal record's Projects tab "Load more". It
 * returns ONE bounded keyset page of the Projects advancing this Goal plus the
 * following `nextCursor`, read through the same trusted authenticated composition
 * boundary as the Goal record route. Fetching more here NEVER navigates, so the
 * record route's `?tab=`/`?drawer=` state, scroll position and focus are untouched —
 * the tab simply appends the returned rows.
 *
 * The goal id and cursor scope are validated in the repository: a wrong-kind,
 * missing, deleted or cross-workspace id yields the calm not-found outcome (never a
 * disclosure), and a cursor issued for a different goal/workspace is rejected rather
 * than reinterpreted. The EXACT Project-contribution total shown against the Goal
 * stays `GoalRepository.getGoalProjectContribution`'s complete, unbounded authority —
 * this endpoint bounds only how many Project ROWS load, never what the Goal's
 * contribution counts report.
 */

import { env } from "cloudflare:workers";

import { InvalidSpineCursorError } from "~/kernel/spine";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import {
  serializeGoalProjectItem,
  type SerializedGoalProjectItem,
} from "../goal-view";
import type { Route } from "./+types/projects";

export interface GoalProjectsPageData {
  readonly projects: readonly SerializedGoalProjectItem[];
  readonly nextCursor: string | null;
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
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;

  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  // Fail closed for a missing / deleted / wrong-kind / cross-workspace Goal:
  // resolve the Goal through the same authority the record route uses, so a
  // tampered id never leaks another Goal's Projects.
  const overview = await scope.goals.getGoalOverview(goalId);
  if (!overview) {
    return json({ error: "not_found" }, 404);
  }

  try {
    const page = await scope.goals.listGoalProjects({ goalId, cursor });
    return json({
      projects: page.items.map(serializeGoalProjectItem),
      nextCursor: page.nextCursor,
    } satisfies GoalProjectsPageData);
  } catch (error) {
    // A tampered or cross-scope cursor is a client error, not a 500 — the tab
    // surfaces a calm retry and can recover by re-reading the first page.
    if (error instanceof InvalidSpineCursorError) {
      return json({ error: "invalid_cursor" }, 400);
    }
    throw error;
  }
}
