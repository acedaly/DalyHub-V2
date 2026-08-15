/**
 * The shared machinery behind the Tasks module's NAMED destinations.
 *
 * Inbox and Upcoming are top-level places in the sidebar, not tabs buried inside
 * `/tasks` — the visual references put them beside Today, above the ORGANISE
 * group, because triage and "what is coming" are daily destinations rather than
 * a filter someone remembers to apply.
 *
 * They are the SAME surface as `/tasks`, though, and must stay that way: one
 * loader, one query path, one presentation. So a named route does not restate
 * any of it. It rewrites its own URL into the query string that selects the
 * system view and hands the request to the `/tasks` loader unchanged — which is
 * exactly what the view switcher does when the owner picks the view by hand. A
 * filter or sort the owner then applies is preserved, because an explicit
 * parameter in the incoming URL always wins over the view's default.
 *
 * The route KEEPS its own path, so `activeNavigationHref` lights the right
 * sidebar row and the address bar names the place the owner is in. (A redirect
 * to `/tasks?…` would have left the frame highlighting Tasks and lost the
 * destination, which is the whole reason these routes exist.)
 */

import { findTaskSystemView } from "~/kernel/task-views";

import { paramsFromConfig, TASKS_PARAMS } from "../tasks-url-state";

/**
 * Rewrite `request` so its query string selects `viewId`, leaving any parameter
 * the caller set explicitly alone.
 *
 * Returns the original request when the view id does not resolve — an unknown
 * view degrades to the standard workspace rather than to an error, matching how
 * a deleted default view already behaves in the `/tasks` loader.
 */
export function requestForSystemView(
  request: Request,
  viewId: string,
): Request {
  const definition = findTaskSystemView(viewId);
  if (!definition) {
    return request;
  }

  const url = new URL(request.url);
  const incoming = url.searchParams;
  const applied = paramsFromConfig(definition.config);

  // The view's defaults fill only the slots the owner has not spoken for, so
  // sorting or filtering within Inbox survives — it is still the Inbox.
  for (const [key, value] of applied) {
    if (!incoming.has(key)) {
      incoming.set(key, value);
    }
  }
  incoming.set(TASKS_PARAMS.savedView, definition.id);

  return new Request(url, request);
}
