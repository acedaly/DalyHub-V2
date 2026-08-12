/**
 * PWA-12 — the one rule that says whether a navigation moved anything a loader
 * cares about.
 *
 * Three routes now decline to re-read themselves for a navigation that only
 * changes a search parameter they do not consult — `root`, the app shell and
 * `/tasks`. That is worth doing on its own merits (every Drawer open was a round
 * trip spent confirming nothing had changed) and it is what stops opening a task
 * OFFLINE throwing into the global error boundary: a request that is never needed
 * cannot fail.
 *
 * ── The clause that makes it safe ────────────────────────────────────────────
 * `shouldRevalidate` is consulted for more than navigations, and the difference
 * matters more than it looks:
 *
 *   - a NAVIGATION that changes a parameter — `?drawer=task:123` — arrives with a
 *     different url, and is the case worth skipping;
 *   - an EXPLICIT REVALIDATION — `useRevalidator().revalidate()`, which is how
 *     every mutation in DalyHub asks the list to re-read itself — arrives with an
 *     IDENTICAL url;
 *   - a SUBMISSION carries a `formMethod`.
 *
 * A rule written as "same pathname → skip" silences the second and the third as
 * well as the first, which means a task created, renamed or completed never
 * appears. That is exactly what happened when this was first written inline in
 * three files, and it is why the rule lives in one place with the distinction
 * stated rather than assumed.
 */

import type { ShouldRevalidateFunctionArgs } from "react-router";

/**
 * Whether this device currently cannot reach DalyHub.
 *
 * Published by `OfflineProvider`, which owns the ONE connection state in the
 * product and derives it from real request outcomes rather than from
 * `navigator.onLine` (`offline-connection.ts` explains at length why the
 * browser's flag is not the answer). A module-level value because
 * `shouldRevalidate` is a route module export with no access to React context —
 * the same shape, and for the same reason, as the mutation queue's active
 * namespace.
 *
 * It defaults to FALSE, so a surface rendered before the provider has said
 * anything behaves exactly as it did before PWA-12.
 */
let knownOffline = false;

/** Publish the connection state for the revalidation rule. */
export function setRevalidationOffline(offline: boolean): void {
  knownOffline = offline;
}

/** True when the offline layer has said this device cannot reach DalyHub. */
export function isRevalidationOffline(): boolean {
  return knownOffline;
}

/**
 * True when a loader may legitimately decline to re-read itself.
 *
 * Two conditions, and the second one is the one that took two regressions to
 * learn.
 *
 * **It must be a same-document parameter change.** A submission and an explicit
 * `useRevalidator().revalidate()` are not navigations — the latter arrives with
 * an IDENTICAL url — and both are how DalyHub asks a surface to catch up after a
 * mutation. Declining either is how a task created, renamed or completed stops
 * appearing.
 *
 * **And this device must be OFFLINE.** Declining online looked free: a Drawer
 * parameter changes nothing `root`, the app shell or `/tasks` read, so the
 * request only ever confirmed that. But a navigation SUPERSEDES an in-flight
 * revalidation, and previously the navigation's own re-read is what replaced it.
 * Removing the re-read therefore turned "mutate, then navigate" — create a task
 * and close the Drawer — into a permanently stale list. Two browser journeys
 * caught it; a quieter surface might not have.
 *
 * So the skip is scoped to the case that actually needs it. Offline, the request
 * cannot succeed, and a failed navigation loader throws into the global error
 * boundary — which is why a previously loaded Tasks page answered a tap on a row
 * with "Something went wrong". Not making a request that cannot succeed is the
 * fix; the boundary is untouched, and online behaviour is byte-for-byte what it
 * was.
 */
export function isSameDocumentParameterChange(
  args: Pick<
    ShouldRevalidateFunctionArgs,
    "currentUrl" | "nextUrl" | "formMethod"
  >,
): boolean {
  if (!knownOffline) return false;
  if (args.formMethod !== undefined) return false;
  if (args.currentUrl.pathname !== args.nextUrl.pathname) return false;
  // An identical url is a deliberate re-read, not a move.
  return args.currentUrl.search !== args.nextUrl.search;
}

/**
 * True when every parameter in `names` is unchanged across the navigation.
 *
 * For a loader that reads a known set of parameters: combined with
 * {@link isSameDocumentParameterChange}, it answers "this navigation moved
 * something, but nothing I read".
 */
export function parametersUnchanged(
  args: Pick<ShouldRevalidateFunctionArgs, "currentUrl" | "nextUrl">,
  names: readonly string[],
): boolean {
  return names.every(
    (name) =>
      args.currentUrl.searchParams.get(name) ===
      args.nextUrl.searchParams.get(name),
  );
}
