/**
 * V2.7 RECALL-02 — `/tasks/completed/:window`, the two-interaction answer to
 * "what did I complete yesterday?".
 *
 * It owns no query, no component and no state. It resolves the OWNER's calendar
 * day and their first day of the week — the two facts a static palette command
 * cannot carry — turns the named window into an ordinary {@link TaskViewConfig},
 * and REDIRECTS to the `/tasks` URL that expresses it.
 *
 * Redirect, not rewrite. `/inbox` and `/upcoming` keep their own path because
 * they are places in the sidebar and the frame has to light their row. This is
 * not a place: it is a QUESTION whose answer is an ordinary configuration, and
 * the address bar must end up holding that configuration — sort, system view and
 * the two date bounds — so it is shareable, saveable as a saved view, and
 * modifiable with the controls without first escaping a private route state.
 * That is exactly the "no private special-case route state" rule this item is
 * held to.
 *
 * An unknown window segment redirects to the Completed view itself rather than
 * erroring: the honest degradation for "a window I do not know" is the finished
 * work in completion order, which is the question's neighbourhood.
 */

import { env } from "cloudflare:workers";
import { redirect } from "react-router";

import { DEFAULT_APP_PREFERENCES } from "~/kernel/preferences";
import {
  completedWindowConfig,
  findTaskSystemView,
  parseCompletedWindowId,
} from "~/kernel/task-views";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import { ownerCalendarIso } from "~/shared/datetime";

import type { Route } from "./+types/completed";
import { paramsFromConfig, TASKS_PARAMS } from "../tasks-url-state";

/** The Completed built-in view's own URL — the fallback destination. */
function completedViewHref(): string {
  const definition = findTaskSystemView("completed");
  const params = definition
    ? paramsFromConfig(definition.config)
    : new URLSearchParams();
  if (definition) params.set(TASKS_PARAMS.savedView, definition.id);
  const query = params.toString();
  return query.length > 0 ? `/tasks?${query}` : "/tasks";
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const window = parseCompletedWindowId(params.window);
  if (window === null) {
    throw redirect(completedViewHref());
  }

  const session = requireAuthenticatedSession(context);

  /*
   * The owner's calendar facts, read through the ONE authority for each, and
   * degrading to the documented defaults rather than to an error page: a
   * preference read that fails must not make "what did I complete yesterday?"
   * unanswerable, and the defaults are the same values the rest of the product
   * falls back to.
   */
  let timezone = DEFAULT_APP_PREFERENCES.timezone;
  let firstDayOfWeek = DEFAULT_APP_PREFERENCES.firstDayOfWeek;
  try {
    const scope = await resolveAuthenticatedWorkspaceScope(env, session);
    const preferences = await scope.appPreferences.get(session.user.subject);
    timezone = preferences.timezone;
    firstDayOfWeek = preferences.firstDayOfWeek;
  } catch {
    // Deliberate: fall through on the defaults.
  }

  const todayIso = ownerCalendarIso(new Date(), timezone);
  const config = completedWindowConfig(window, todayIso, firstDayOfWeek);
  throw redirect(`/tasks?${paramsFromConfig(config).toString()}`);
}
