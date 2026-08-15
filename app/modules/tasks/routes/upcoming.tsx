/**
 * `/upcoming` — what is coming, as a place rather than a filter.
 *
 * The sibling of `/inbox`, and the same argument: "Upcoming" is a question an
 * owner asks daily, so the references give it a row in the primary navigation
 * group rather than a tab to remember. It resolves to the built-in Upcoming
 * system view — planned or due after today, grouped by due state, ordered by
 * scheduled date.
 *
 * Like Inbox, it owns nothing: it rewrites the request and delegates to the one
 * `/tasks` loader, so the list here and the list under the view switcher are the
 * same list by construction.
 */

import { loader as tasksLoader } from "./index";
import { requestForSystemView } from "./system-view";
import type { Route } from "./+types/upcoming";

export function meta() {
  return [{ title: "Upcoming · DalyHub" }];
}

export { shouldRevalidate } from "./index";
export { default } from "./index";

export async function loader(args: Route.LoaderArgs) {
  return tasksLoader({
    ...args,
    request: requestForSystemView(args.request, "upcoming"),
  } as Parameters<typeof tasksLoader>[0]);
}
