/**
 * PERF-01 — which destination the owner is on their way to.
 *
 * Backend work made navigation faster; it did not make it instantaneous, and a
 * click that produces no visible change for two hundred milliseconds reads as a
 * click that did not land. DalyHub's collections already answer this for a
 * SAME-ROUTE change — `useCollectionLoading` swaps in the shared skeleton when a
 * filter or a page moves — but a move BETWEEN modules had no acknowledgement at
 * all. React Router keeps the old route on screen until the next one's loaders
 * resolve, which is the right behaviour (nothing blanks, nothing flashes) and
 * also means nothing at all happens on screen.
 *
 * So the rail and the phone bar mark the destination they are heading to, using
 * the SAME `activeNavigationHref` rule that decides which row is current — the
 * rail and the bar cannot disagree about where a click is going any more than
 * they can disagree about where the owner is.
 *
 * It is deliberately not a spinner and not an animation. The destination row
 * takes the selected row's own SHAPE — the indicator pill — so the
 * acknowledgement is the thing the owner is already looking at moving to where
 * they asked it to go, and it survives forced colours and monochrome. `aria-busy`
 * carries it for assistive technology. Nothing is hidden behind it: the page
 * underneath stays exactly as it was until the new route is ready.
 */

import type { Navigation } from "react-router";

import type { NavigationItem } from "~/platform/modules/navigation-adapter";

import { activeNavigationHref } from "./navigation-active";

/**
 * The href of the destination a navigation is currently heading to, or `null`.
 *
 * `null` whenever there is nothing to acknowledge:
 *   - the router is idle, or submitting rather than loading;
 *   - the navigation is a same-route change (a filter, a Drawer, a page), which
 *     the collection's own skeleton already reports and which would otherwise
 *     make the row the owner is ON look like the row they are going to;
 *   - the destination is not a primary navigation entry at all.
 */
export function pendingNavigationHref(
  items: readonly NavigationItem[],
  navigation: Pick<Navigation, "state" | "location" | "formMethod">,
  currentPathname: string,
): string | null {
  if (navigation.state !== "loading") return null;
  const next = navigation.location?.pathname;
  if (next === undefined) return null;
  // A submission's post-action revalidation is not a move, and neither is a
  // same-document parameter change.
  if (navigation.formMethod !== undefined) return null;
  if (next === currentPathname) return null;
  const target = activeNavigationHref(items, next);
  if (target === null) return null;
  // Never mark the row the owner is already on: `aria-current` owns that row,
  // and two rows wearing the indicator at once says nothing.
  return target === activeNavigationHref(items, currentPathname)
    ? null
    : target;
}
