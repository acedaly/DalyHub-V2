/**
 * TODAY-01 — the Today route.
 *
 * The registry-driven `/today` surface: the calm place the owner lands every
 * morning. It mounts ONE DS-03 DrawerProvider around the dashboard (so a Card opens
 * a record over the pane), and renders the fixture-backed TodayDashboard inside the
 * PX-02 application frame it inherits from the app shell.
 *
 * The current date is formatted server-side in the loader (the pane-header
 * subtitle), keeping the component a pure function of its props. TODAY-01 is
 * fixture-only: the loader reads the in-memory `TODAY_FIXTURE` — no repositories,
 * D1, Workers, APIs, AI or persistence. When Tasks/Notes/Meetings connect, only the
 * data source here changes; the composition does not.
 */

import { DrawerProvider } from "~/shared/drawer";

import { formatTodayDate } from "../date";
import { TODAY_FIXTURE } from "../fixtures";
import { TodayDashboard } from "../TodayDashboard";
import { createTodayDrawerRenderer } from "../TodayDrawer";
import type { Route } from "./+types/index";

export function meta() {
  return [
    { title: "Today · DalyHub" },
    {
      name: "description",
      content: "Your calm daily home — what deserves attention right now.",
    },
  ];
}

export function loader() {
  // Format in the owner's calendar timezone (not the UTC Worker runtime), so the
  // date is correct across the UTC/AEST boundary. See `date.ts`.
  return { date: formatTodayDate(new Date()), data: TODAY_FIXTURE };
}

const renderTodayDrawer = createTodayDrawerRenderer(TODAY_FIXTURE);

export default function TodayRoute({ loaderData }: Route.ComponentProps) {
  return (
    <DrawerProvider renderDrawer={renderTodayDrawer}>
      <TodayDashboard data={loaderData.data} date={loaderData.date} />
    </DrawerProvider>
  );
}
