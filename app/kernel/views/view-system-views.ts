/**
 * X-02 — the BUILT-IN cross-module views.
 *
 * Derived in code from the same configuration vocabulary user-saved views use, so
 * they cost no storage, cannot be deleted, cannot silently mutate, exist in a new
 * workspace on day one, and run through the SAME query engine — there is no bespoke
 * code path per preset (ROADMAP X-02 §14).
 *
 * Deliberately FOUR. A product that ships twenty predefined filters has replaced
 * one decision the owner should make with twenty it has made for them. Each of
 * these answers a question the owner actually asks out loud, and each is a starting
 * point they can duplicate and make their own.
 */

import { CROSS_VIEW_CONFIG_VERSION, type CrossViewConfig } from "./view-config";

export interface CrossViewSystemViewDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly config: CrossViewConfig;
}

export const CROSS_VIEW_SYSTEM_VIEWS: readonly CrossViewSystemViewDefinition[] =
  [
    {
      id: "attention",
      name: "Needs attention",
      description:
        "Overdue and due work, at-risk Projects, off-track Goals, Meetings with open actions and Reviews still to finish.",
      config: {
        version: CROSS_VIEW_CONFIG_VERSION,
        scopes: ["task", "project", "goal", "meeting", "review"],
        shared: { attention: true },
        modules: {},
        sort: "due",
        direction: "asc",
        groupBy: "entity",
      },
    },
    {
      id: "this_week",
      name: "This week",
      description: "Everything that has moved in the current week.",
      config: {
        version: CROSS_VIEW_CONFIG_VERSION,
        scopes: ["task", "project", "goal", "note", "meeting", "review"],
        shared: { updatedWithin: "this_week" },
        modules: {},
        sort: "updated",
        direction: "desc",
        groupBy: "entity",
      },
    },
    {
      id: "since_review",
      name: "Since my last Review",
      description:
        "Records that changed after the period your most recent completed Review closed.",
      config: {
        version: CROSS_VIEW_CONFIG_VERSION,
        scopes: ["task", "project", "goal", "note", "meeting"],
        shared: { changedSince: "last_review" },
        modules: {},
        sort: "updated",
        direction: "desc",
        groupBy: "entity",
      },
    },
    {
      id: "waiting",
      name: "Waiting & follow-up",
      description:
        "Work you are waiting on, and Meetings with actions still outstanding.",
      config: {
        version: CROSS_VIEW_CONFIG_VERSION,
        scopes: ["task", "meeting"],
        shared: { attention: true },
        modules: { task: { waiting: true } },
        sort: "updated",
        direction: "desc",
        groupBy: "entity",
      },
    },
  ];

const BY_ID = new Map(
  CROSS_VIEW_SYSTEM_VIEWS.map((definition) => [definition.id, definition]),
);

/** The built-in view with this id, or null. */
export function findCrossViewSystemView(
  id: string,
): CrossViewSystemViewDefinition | null {
  return BY_ID.get(id) ?? null;
}

/** True when this id names a BUILT-IN view (which has no stored row). */
export function isCrossViewSystemViewId(id: string): boolean {
  return BY_ID.has(id);
}
