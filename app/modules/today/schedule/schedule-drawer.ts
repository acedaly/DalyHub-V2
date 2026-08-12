/**
 * CAL-01 — the drawer resolver for imported calendar occurrences.
 *
 * Maps the DS-03 drawer key `event:<id>` to the event detail panel, from the
 * entries the page has ALREADY loaded. There is deliberately no fetch here: the
 * schedule read has every fact the detail shows, so opening an event is
 * instantaneous and works offline exactly as far as the page behind it does.
 *
 * Shared by Today, Tomorrow and Next 7 Days, so an event looks the same
 * whichever surface it was opened from.
 */

import { createElement } from "react";

import type { ScheduleEntry } from "~/kernel/calendar";
import type { DrawerEntry, DrawerRenderResult } from "~/shared/drawer";

import { EVENT_DRAWER_PREFIX, EventDetail } from "./EventDetail";

export function createScheduleDrawerRenderer(
  entries: ReadonlyMap<string, ScheduleEntry>,
  dateLong: string,
) {
  return function renderScheduleDrawer(
    entry: DrawerEntry,
  ): DrawerRenderResult | null {
    const separator = entry.key.indexOf(":");
    if (separator === -1) return null;
    if (entry.key.slice(0, separator) !== EVENT_DRAWER_PREFIX) return null;
    const id = entry.key.slice(separator + 1);
    const occurrence = entries.get(id);
    // A stale or unknown key returns null, which the Drawer renders as its
    // graceful not-found panel — the same behaviour a removed Task gets.
    if (occurrence === undefined) return null;
    return {
      title: occurrence.title,
      description: "Calendar event",
      // The default width: an event has a handful of facts and two actions, and
      // a wide drawer for six lines of text is a container that has not been
      // earned.
      children: createElement(EventDetail, {
        entry: occurrence,
        dateLong,
      }),
    };
  };
}
