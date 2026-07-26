import type { CommandContribution } from "~/kernel/modules";
export const meetingCommands: readonly CommandContribution[] = [
  {
    id: "meetings.open",
    title: "Open Meetings",
    subtitle: "Prepare, capture and remember",
    keywords: ["meetings"],
    kind: "navigate",
    target: { kind: "route", to: "/meetings" },
  },
  {
    id: "meetings.new",
    title: "Create Meeting",
    subtitle: "Plan a meeting",
    keywords: ["meeting", "new"],
    kind: "navigate",
    target: { kind: "route", to: "/new/meeting" },
  },
  {
    id: "meetings.search",
    title: "Search Meetings",
    subtitle: "Find by title or location",
    keywords: ["meeting", "find"],
    kind: "navigate",
    target: { kind: "route", to: "/meetings?focus=search" },
  },
];
