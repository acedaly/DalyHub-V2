/**
 * X-02 / DS-09 — the Views module's command contributions.
 *
 * Honest NAVIGATION commands only: they open the cross-module surface at a
 * BUILT-IN view, using the same query vocabulary the address bar uses, so a command
 * and a bookmarked link land in exactly the same place.
 */

import type { CommandContribution } from "~/kernel/modules";
import { CROSS_VIEW_SYSTEM_VIEWS } from "~/kernel/views";

import { viewQuery } from "./views-url-state";

const [attention, thisWeek, sinceReview, waiting] = CROSS_VIEW_SYSTEM_VIEWS;

export const viewsCommands: readonly CommandContribution[] = [
  {
    id: "views.open",
    title: "Open Views",
    subtitle: "Saved questions across your records",
    keywords: ["views", "saved", "filter", "cross-module", "everything"],
    kind: "navigate",
    target: { kind: "route", to: "/views" },
  },
  {
    id: "views.attention",
    title: "What needs attention",
    subtitle: attention.description,
    keywords: ["attention", "overdue", "at risk", "stuck", "off track"],
    kind: "navigate",
    target: {
      kind: "route",
      to: `/views?${viewQuery(attention.id, attention.config)}`,
    },
  },
  {
    id: "views.this_week",
    title: "What moved this week",
    subtitle: thisWeek.description,
    keywords: ["this week", "changed", "moved", "recent"],
    kind: "navigate",
    target: {
      kind: "route",
      to: `/views?${viewQuery(thisWeek.id, thisWeek.config)}`,
    },
  },
  {
    id: "views.since_review",
    title: "Changed since my last Review",
    subtitle: sinceReview.description,
    keywords: ["review", "since", "changed", "insights"],
    kind: "navigate",
    target: {
      kind: "route",
      to: `/views?${viewQuery(sinceReview.id, sinceReview.config)}`,
    },
  },
  {
    id: "views.waiting",
    title: "What I am waiting on",
    subtitle: waiting.description,
    keywords: ["waiting", "follow up", "blocked", "actions"],
    kind: "navigate",
    target: {
      kind: "route",
      to: `/views?${viewQuery(waiting.id, waiting.config)}`,
    },
  },
];
