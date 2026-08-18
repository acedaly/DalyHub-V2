/**
 * TASKS-04 — Review Inbox: the focused triage flow for UNASSIGNED Tasks.
 *
 * Inbox means active Tasks with no structural parent, so this route reads exactly the
 * built-in Inbox query — the SAME `scope.tasks` projection `/tasks?system=inbox`
 * renders — and walks it one Task at a time. There is no Inbox-specific Task model,
 * no second query definition and no second mutation authority: every change the
 * reviewer makes posts to the canonical task routes, exactly as a list row does.
 *
 * The queue is BOUNDED (one page, cursor-backed) rather than "load the whole Inbox":
 * a review session is a session, and a 4,000-item Inbox must not become a 4,000-item
 * payload. When the page is exhausted the surface offers the next page rather than
 * silently stopping.
 */

import { env } from "cloudflare:workers";

import { DEFAULT_APP_PREFERENCES } from "~/kernel/preferences";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import { ownerCalendarIso } from "~/shared/datetime";
import { serializeTaskListItem } from "~/shared/task-record/task-view";

import type { Route } from "./+types/review";
import type { TasksReviewData } from "../tasks-contract";
import { TasksReviewWorkspace } from "../TasksReviewWorkspace";

export function meta() {
  return [{ title: "Review Inbox · DalyHub" }];
}

/**
 * How many Tasks one review page holds. Generous enough that most Inbox sessions
 * finish in a single page, bounded so the payload never grows with the Inbox.
 */
const REVIEW_PAGE_SIZE = 25;

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");

  // AUDIT-14 — the degraded page still needs a day to render its date-relative
  // labels; that is the ONLY use of the documented no-preference default here.
  let timezone = DEFAULT_APP_PREFERENCES.timezone;
  try {
    const scope = await resolveAuthenticatedWorkspaceScope(env, session);
    timezone = await scope.ownerTimeZone();
    const todayIso = ownerCalendarIso(new Date(), timezone);
    const page = await scope.tasks.listWorkspaceTasks({
      view: "inbox",
      limit: REVIEW_PAGE_SIZE,
      todayIso,
      ...(cursor ? { cursor } : {}),
    });
    return {
      // TASKS-13 — the Review Inbox deliberately projects NO checklist progress.
      // It is a triage flow whose one question is "where does this belong", and a
      // step count answers a different one. Not projecting it also means this
      // surface pays nothing for it.
      items: page.items.map((item) => serializeTaskListItem(item)),
      nextCursor: page.nextCursor,
      todayIso,
      failed: false,
    } satisfies TasksReviewData;
  } catch {
    return {
      items: [],
      nextCursor: null,
      todayIso: ownerCalendarIso(new Date(), timezone),
      failed: true,
    } satisfies TasksReviewData;
  }
}

export default function TasksReviewRoute({ loaderData }: Route.ComponentProps) {
  return <TasksReviewWorkspace data={loaderData} />;
}
