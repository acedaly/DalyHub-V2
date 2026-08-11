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
 * True when this is a plain navigation, within the same document, that changed
 * only the search string — the one case a loader may decline.
 *
 * Callers still decide WHICH parameters they care about; this answers the
 * prior question of whether declining is legitimate at all.
 */
export function isSameDocumentParameterChange(
  args: Pick<
    ShouldRevalidateFunctionArgs,
    "currentUrl" | "nextUrl" | "formMethod"
  >,
): boolean {
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
