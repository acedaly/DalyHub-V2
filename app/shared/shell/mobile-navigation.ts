/**
 * MOBILE-01 — the pure phone bottom-navigation model.
 *
 * The phone bar is DERIVED from the same registry-driven navigation model the
 * desktop rail renders (`buildNavigationModel`), never from a second hand-kept
 * module list: a destination earns a bottom-navigation slot by declaring
 * `meta.mobilePrimaryOrder` in its OWN route manifest (see
 * `app/kernel/modules/module-capabilities.ts` → `RouteMeta`). Adding, removing or
 * reordering a phone destination is therefore a one-line manifest edit in the
 * owning module — the shell cannot drift from the registry, and a module hidden by
 * the SET-01 navigation preference disappears from the bar for free because the
 * shell passes the already-filtered navigation in.
 *
 * The bar's budget is five controls (the platform convention, and the most a thumb
 * can hit reliably at 320px): at most {@link MOBILE_PRIMARY_DESTINATION_LIMIT}
 * registry destinations, the shared Quick Capture control, and "More" — which opens
 * the COMPLETE registry-driven navigation sheet, so every module (including any
 * future one) stays reachable in one tap without appearing twice.
 *
 * This module is deliberately pure and React-free so the ordering, the cap, the
 * capture placement and the active-destination match are unit-tested directly.
 */

import type { NavigationItem } from "~/platform/modules/navigation-adapter";

import {
  activeNavigationHref,
  isNavigationDestinationActive,
} from "./navigation-active";

/**
 * The maximum number of registry destinations the phone bar shows. Three plus
 * Capture plus More is the five-control budget; a fourth opted-in destination
 * stays in the More sheet rather than shrinking every target below 44px.
 */
export const MOBILE_PRIMARY_DESTINATION_LIMIT = 3;

/** A slot in the phone bottom-navigation bar, in render order. */
export type BottomNavSlot =
  /** A registry-derived destination link. */
  | { readonly kind: "destination"; readonly item: NavigationItem }
  /** The shared Quick Capture sheet trigger. */
  | { readonly kind: "capture" }
  /** The complete registry-driven navigation sheet trigger. */
  | { readonly kind: "more" };

/**
 * The destinations that opted in to phone primary placement, ordered by the
 * module-declared `mobilePrimaryOrder`, then by the shared `navOrder`, then by the
 * navigation model's own (already deterministic) position — and capped at the
 * bar's budget. Items without the capability are never included.
 */
export function resolveMobilePrimaryDestinations(
  navigation: readonly NavigationItem[],
  limit: number = MOBILE_PRIMARY_DESTINATION_LIMIT,
): readonly NavigationItem[] {
  const opted = navigation
    .map((item, index) => ({ item, index }))
    .filter((entry) => entry.item.mobilePrimaryOrder !== undefined);

  opted.sort((a, b) => {
    const byMobile =
      (a.item.mobilePrimaryOrder as number) -
      (b.item.mobilePrimaryOrder as number);
    if (byMobile !== 0) return byMobile;
    if (a.item.order !== b.item.order) return a.item.order - b.item.order;
    return a.index - b.index;
  });

  return opted.slice(0, Math.max(0, limit)).map((entry) => entry.item);
}

/**
 * Build the ordered phone bar. Capture sits in the MIDDLE of the destinations —
 * the most reachable point of the bar for either thumb — and More is always last,
 * so the layout is stable no matter how many destinations opted in.
 *
 * With the shipped manifests (Today, Tasks, Projects opted in) this yields
 * exactly `Today · Tasks · Add · Projects · More` — the capture slot renders
 * with the label "Add" — asserted by `e2e/mobile-shell.spec.ts`. (This comment
 * said `Today · Tasks · Capture · Diary · More` long after Projects replaced
 * Diary in the bar; corrected by RECALL-00-D.)
 */
export function buildBottomNavigation(
  navigation: readonly NavigationItem[],
  limit: number = MOBILE_PRIMARY_DESTINATION_LIMIT,
): readonly BottomNavSlot[] {
  const destinations = resolveMobilePrimaryDestinations(navigation, limit);
  const captureIndex = Math.ceil(destinations.length / 2);

  const slots: BottomNavSlot[] = [];
  destinations.forEach((item, index) => {
    if (index === captureIndex) {
      slots.push({ kind: "capture" });
    }
    slots.push({ kind: "destination", item });
  });
  if (captureIndex >= destinations.length) {
    slots.push({ kind: "capture" });
  }
  slots.push({ kind: "more" });
  return slots;
}

/**
 * Whether a bottom-navigation destination is the active one for `pathname`.
 *
 * UX-01 — this is now a thin alias over the ONE shared navigation-active rule
 * (`~/shared/shell/navigation-active`), which the desktop rail and the "More"
 * sheet also use. The behaviour is unchanged; what changed is that the rail no
 * longer disagrees with the bar about the same question.
 */
export const isDestinationActive = isNavigationDestinationActive;

/**
 * The href of the single active destination for `pathname`, or null when the
 * current route is not one of the phone destinations (a record, Settings, a module
 * reached through More). Longest match wins so a nested destination beats its
 * ancestor.
 */
export function activeDestinationHref(
  destinations: readonly NavigationItem[],
  pathname: string,
): string | null {
  // The items go through whole (not just their hrefs) so the one rule can
  // consult each module's declared route prefixes too (RECALL-00-E).
  return activeNavigationHref(destinations, pathname);
}
