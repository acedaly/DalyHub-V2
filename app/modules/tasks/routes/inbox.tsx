/**
 * `/inbox` — triage, as a place rather than a filter.
 *
 * The Inbox is the built-in "unassigned active tasks" system view, and it was
 * already reachable at `/tasks?saved=inbox`. The visual references promote it to
 * the primary navigation group beside Today, which is where a capture-first
 * product wants it: the whole point of quick capture is that things land
 * somewhere unsorted, and a destination is what makes emptying it a habit.
 *
 * It is the SAME surface. This module owns no loader, no query and no component
 * of its own — it rewrites the request into the Inbox view's query string and
 * delegates to `/tasks`, so there is exactly one task query path (ADR-043) and
 * no second definition of what an unsorted task is.
 */

import { loader as tasksLoader } from "./index";
import { requestForSystemView } from "./system-view";
import type { Route } from "./+types/inbox";

export function meta() {
  return [{ title: "Inbox · DalyHub" }];
}

export { shouldRevalidate } from "./index";
export { default } from "./index";

export async function loader(args: Route.LoaderArgs) {
  return tasksLoader({
    ...args,
    request: requestForSystemView(args.request, "inbox"),
  } as Parameters<typeof tasksLoader>[0]);
}
