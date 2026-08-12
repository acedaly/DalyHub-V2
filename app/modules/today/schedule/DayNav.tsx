/**
 * CAL-02 — the Today · Tomorrow · Next 7 days navigation.
 *
 * Three links, drawn with the SHARED view-tab rail (`ViewTabs`) that Projects,
 * Areas and Tasks already use. Not a new control, not a segmented button (that
 * is for a bounded toggle over ONE view of the same data; these are three
 * different pages), and deliberately not a date picker — a date picker is the
 * first step towards the month grid CAL-01 explicitly is not building (§45).
 *
 * They are real links to real routes, so Back works, each is shareable, and the
 * shared rail exposes the active one as `aria-current="page"` rather than
 * leaving selection to an underline a screen reader cannot see.
 */

import { ViewTabs } from "~/shared/view-switcher";

export type DaySurface = "today" | "tomorrow" | "upcoming";

const TABS = [
  { value: "today", label: "Today", to: "/today" },
  { value: "tomorrow", label: "Tomorrow", to: "/today/tomorrow" },
  { value: "upcoming", label: "Next 7 days", to: "/today/upcoming" },
] as const;

export function DayNav({ active }: { readonly active: DaySurface }) {
  return (
    <ViewTabs
      param="day"
      label="Day"
      value={active}
      options={TABS}
      className="dh-schedule__nav"
      data-testid="day-nav"
    />
  );
}
