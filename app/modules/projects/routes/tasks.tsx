/**
 * PROJ-01 — the project task-list pagination endpoint
 * (`/projects/:projectId/tasks?state=&cursor=`).
 *
 * A resource route (no UI) backing the Tasks tab's "Load more". It returns ONE
 * bounded keyset page of the project's tasks plus the following `nextCursor`, read
 * through the same trusted authenticated composition boundary as the project record
 * route. Fetching more here NEVER navigates, so the record route's `?drawer=` state,
 * scroll position and focus are untouched — the tab simply appends the returned rows.
 *
 * The project id, `state` filter and cursor scope are validated in the repository:
 * a wrong-kind, missing or cross-workspace id yields an empty page (never a
 * disclosure), and a cursor issued for a different project/state/workspace is
 * rejected rather than reinterpreted. The roll-up totals shown against the project
 * stay the SpineRepository's authority — this endpoint bounds only how many task
 * ROWS load, never what the project's completion counts report.
 */

import { env } from "cloudflare:workers";

import { InvalidSpineCursorError } from "~/kernel/spine";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import {
  loadProjectTasksPage,
  parseProjectTaskState,
  type ProjectTasksPage,
} from "../project-tasks-load.server";
import type { Route } from "./+types/tasks";

/**
 * V2.8 CONV-01 — the page is the SHARED list-item shape, read by the same
 * function the record loader uses, so an appended page and the first page can
 * never disagree about what a task carries.
 */
export type ProjectTasksPageData = ProjectTasksPage;

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
  const url = new URL(request.url);
  const state = parseProjectTaskState(url.searchParams.get("state"));
  const cursor = url.searchParams.get("cursor") ?? undefined;

  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  try {
    const page = await loadProjectTasksPage(scope.tasks, projectId, {
      state,
      ...(cursor !== undefined ? { cursor } : {}),
    });
    return json(page satisfies ProjectTasksPageData);
  } catch (error) {
    // A tampered or cross-scope cursor is a client error, not a 500 — the tab
    // surfaces a calm retry and can recover by re-reading the first page.
    if (error instanceof InvalidSpineCursorError) {
      return json({ error: "invalid_cursor" }, 400);
    }
    throw error;
  }
}
