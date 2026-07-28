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
 * With the shipped manifests (Today, Tasks, Diary) this yields exactly:
 * `Today · Tasks · Capture · Diary · More`.
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
 * A destination matches its own path or any path nested beneath it, so
 * `/tasks/:id` keeps "Tasks" active — but `/` never matches everything, and a
 * longer sibling segment (`/todayish`) is not a nested path. Exactly ONE
 * destination is active for any pathname (the longest matching href wins), so the
 * bar never shows two active states.
 */
export function isDestinationActive(href: string, pathname: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  const normalised = href.endsWith("/") ? href.slice(0, -1) : href;
  return pathname === normalised || pathname.startsWith(`${normalised}/`);
}

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
  let best: string | null = null;
  for (const destination of destinations) {
    if (!isDestinationActive(destination.href, pathname)) {
      continue;
    }
    if (best === null || destination.href.length > best.length) {
      best = destination.href;
    }
  }
  return best;
}
