/**
 * UIX-05 — the Analytics module's command contributions.
 *
 * Honest NAVIGATION commands only: each opens the same surface at one of the
 * three spans, using the SAME `?range=` vocabulary the address bar uses — so a
 * command, a bookmarked link and the range rail all land in exactly the same
 * place. Nothing here computes anything.
 */

import type { CommandContribution } from "~/kernel/modules";
import { ANALYTICS_RANGES } from "~/kernel/analytics";

const [week, month, quarter] = ANALYTICS_RANGES;

export const analyticsCommands: readonly CommandContribution[] = [
  {
    id: "analytics.open",
    title: "Open Analytics",
    subtitle: "Where your effort has actually gone",
    keywords: [
      "analytics",
      "stats",
      "statistics",
      "trend",
      "completed",
      "progress",
      "insights",
    ],
    kind: "navigate",
    target: { kind: "route", to: "/analytics" },
  },
  {
    id: "analytics.week",
    title: `Analytics — last ${week.label}`,
    subtitle: "Completions, and where they landed, over the last week",
    keywords: ["analytics", "week", "7 days", "recent"],
    kind: "navigate",
    target: { kind: "route", to: "/analytics" },
  },
  {
    id: "analytics.month",
    title: `Analytics — last ${month.label}`,
    subtitle: "The shape of the last four weeks",
    keywords: ["analytics", "month", "4 weeks"],
    kind: "navigate",
    target: { kind: "route", to: `/analytics?range=${month.id}` },
  },
  {
    id: "analytics.quarter",
    title: `Analytics — last ${quarter.label}`,
    subtitle: "The shape of the last twelve weeks",
    keywords: ["analytics", "quarter", "12 weeks", "long"],
    kind: "navigate",
    target: { kind: "route", to: `/analytics?range=${quarter.id}` },
  },
];
