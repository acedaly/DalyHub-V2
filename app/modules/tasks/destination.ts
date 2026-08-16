/**
 * POLISH-01 — which DESTINATION the Tasks workspace is rendering as.
 *
 * One component serves three places — `/tasks`, `/inbox` and `/upcoming` — and
 * every one of them put "Tasks" in the page's `h1`. The browser tab said
 * "Inbox · DalyHub", the navigation rail said Inbox, the address bar said
 * `/inbox`, and the page said Tasks.
 *
 * That is not a cosmetic mismatch. The reason Inbox and Upcoming are routes
 * rather than `?saved=` parameters is that a place is something an owner can be
 * IN — it keeps the rail lit, it survives a filter, it can be linked to and
 * come back to. A place that will not say its own name is a filter with a
 * nicer URL.
 *
 * Pure, and keyed off the same pathname `useWorkspaceBasePath` reads, so the
 * title cannot disagree with the destination the workspace's own links
 * preserve. It lives in its own module so the mapping can be asserted without
 * mounting the workspace.
 */

/** The destinations that are NOT the general workspace, by base path. */
const DESTINATION_TITLES: Readonly<Record<string, string>> = {
  "/inbox": "Inbox",
  "/upcoming": "Upcoming",
};

/**
 * The page title for a Tasks-workspace base path. Anything unrecognised is the
 * general workspace, which is titled "Tasks" — the honest default, and the one
 * that keeps a future destination from silently rendering a blank heading.
 */
export function tasksDestinationTitle(basePath: string): string {
  return DESTINATION_TITLES[basePath] ?? "Tasks";
}
