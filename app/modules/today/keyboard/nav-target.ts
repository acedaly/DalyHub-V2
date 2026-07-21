/**
 * TODAY-05 — the pure navigation-target builder for the keyboard focus/section
 * commands ("Focus task list", "Go to <section>").
 *
 * These are shared `navigate` commands: navigating naturally closes the Command
 * Palette AND the whole Drawer stack, and a post-navigation effect moves focus to the
 * requested task after the modal surfaces have unmounted (the Focus-Quick-Capture
 * pattern). This module owns ONLY the target string + the bounded value contract, so
 * both are unit-testable without React or the router.
 *
 * Crucially, the target is built by REMOVING the entire Drawer stack from the current
 * params (via the shared `withAllDrawersRemoved` helper — never by hand-parsing drawer
 * keys, and never preserving a `drawer=` param), so running a section command from
 * inside an open drawer navigates the Drawer stack away cleanly. The Drawer provider's
 * own history entry and push token are left intact, so Back reopens the previous
 * drawer and Forward returns with it closed. Every OTHER query parameter is preserved.
 */

import { withAllDrawersRemoved } from "~/shared/drawer";

import { TODAY_NAV_LIST, TODAY_NAV_PARAM } from "../commands";

/** The section buckets a keyboard command may jump to (the open planning sections). */
export const TODAY_NAV_SECTIONS = [
  "overdue",
  "today",
  "upcoming",
  "anytime",
] as const;

/** A planning bucket the keyboard can navigate to. */
export type TodayNavSection = (typeof TODAY_NAV_SECTIONS)[number];

/** Every accepted `today-nav` value: the whole list, or one open section. */
export const TODAY_NAV_VALUES = [
  TODAY_NAV_LIST,
  ...TODAY_NAV_SECTIONS,
] as const;

/** The bounded set of `today-nav` values — never an arbitrary string. */
export type TodayNavValue = (typeof TODAY_NAV_VALUES)[number];

/** True only for an accepted `today-nav` value (a bounded type guard). */
export function isTodayNavValue(value: string): value is TodayNavValue {
  return (TODAY_NAV_VALUES as readonly string[]).includes(value);
}

/**
 * Build the app-relative navigation target for a focus/section command: start from
 * the current params with the ENTIRE Drawer stack removed, preserve every other
 * param, and set (not append) the bounded `today-nav` value.
 */
export function buildTodayNavTarget(
  searchParams: URLSearchParams,
  value: TodayNavValue,
): string {
  const params = withAllDrawersRemoved(searchParams);
  params.set(TODAY_NAV_PARAM, value);
  return `/today?${params.toString()}`;
}
