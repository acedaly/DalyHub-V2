/**
 * V2.7 RECALL-02 — the two named COMPLETION-TIME windows (pure, storage-free).
 *
 * "What did I complete yesterday?" is a control, not an archaeology dig, and the
 * roadmap's acceptance criterion is that it is answerable in no more than two
 * interactions from anywhere. A palette command is one interaction after the
 * palette itself — but a command contribution is a STATIC route string, and
 * "yesterday" is not a static date. This file is the missing half: it turns a
 * named window plus the owner's calendar facts into an ordinary
 * {@link TaskViewConfig} in the one declarative vocabulary.
 *
 * Three rules keep it from becoming a second view model:
 *
 *   1. **The output is an ordinary config.** Nothing here invents a filter, a
 *      sort or a route parameter the Tasks vocabulary does not already have: a
 *      named window resolves to the `completed` system view, the `completed`
 *      sort and the `completedFrom`/`completedTo` pair. That is why the
 *      `/tasks/completed/:window` entry point REDIRECTS into `/tasks?…` — the
 *      address bar ends up holding a configuration that round-trips through
 *      `configFromParams`, is saveable as a saved view, and means the same thing
 *      to whoever it is pasted to.
 *   2. **The owner's calendar decides, not UTC.** Both bounds are OWNER calendar
 *      days: `todayIso` is already resolved in the owner's timezone by the
 *      caller (ADR-022), and "this week" starts on the owner's own first day of
 *      the week through `planningWeekStart` — the product's ONE answer to where
 *      a week begins (DEBT-152/DEBT-154). The conversion from those days to the
 *      UTC instants `spine_records.completed_at` is compared against happens
 *      once, in the repository.
 *   3. **The window is a WINDOW, not "since".** "Yesterday" is one day, closed
 *      at both ends, so work finished today does not leak into the answer to a
 *      question about yesterday.
 */

import { planningWeekStart, addPlanningDays } from "~/kernel/planning";
import type { FirstDayOfWeek } from "~/kernel/preferences";

import {
  DEFAULT_TASK_VIEW_CONFIG,
  type TaskViewConfig,
} from "./task-view-config";

/**
 * The named windows the product offers as destinations.
 *
 * Deliberately TWO, and deliberately the two the roadmap names. Every other
 * completion window an owner might want is already expressible — the recency
 * grammar in the Tasks controls, or an explicit `completedFrom`/`completedTo`
 * pair in a link or a saved view — so a third name here would be a second way to
 * say something the vocabulary already says.
 */
export const COMPLETED_WINDOW_IDS = ["yesterday", "this-week"] as const;
export type CompletedWindowId = (typeof COMPLETED_WINDOW_IDS)[number];

/** The owner-facing name of each window, used by the palette and the page title. */
export const COMPLETED_WINDOW_LABELS: Record<CompletedWindowId, string> = {
  yesterday: "Completed yesterday",
  "this-week": "Completed this week",
};

/** The inclusive owner-calendar bounds of a named window. */
export interface CompletedWindowBounds {
  /** The first owner-calendar day in the window, `YYYY-MM-DD`. */
  readonly from: string;
  /** The last owner-calendar day in the window, INCLUSIVE, `YYYY-MM-DD`. */
  readonly to: string;
}

/** Narrow an untrusted path segment to a known window, or `null`. */
export function parseCompletedWindowId(
  value: string | null | undefined,
): CompletedWindowId | null {
  return typeof value === "string" &&
    (COMPLETED_WINDOW_IDS as readonly string[]).includes(value)
    ? (value as CompletedWindowId)
    : null;
}

/**
 * The inclusive owner-calendar bounds of a named window.
 *
 * `todayIso` must already be the OWNER's calendar day. `firstDayOfWeek` is the
 * owner's stored preference and is what makes "this week" theirs: a Sunday-start
 * owner and a Monday-start owner asking the same question on a Sunday are asking
 * about two different weeks, and both are right.
 */
export function completedWindowBounds(
  window: CompletedWindowId,
  todayIso: string,
  firstDayOfWeek: FirstDayOfWeek,
): CompletedWindowBounds {
  if (window === "yesterday") {
    const day = addPlanningDays(todayIso, -1);
    return { from: day, to: day };
  }
  const start = planningWeekStart(todayIso, firstDayOfWeek);
  return { from: start, to: addPlanningDays(start, 6) };
}

/**
 * The complete Tasks configuration a named window resolves to.
 *
 * The `completed` system view supplies the population (finished work), the
 * `completed` sort supplies the order (most recently completed first, on the one
 * completion-time authority), and the bounds supply the window. It is exactly
 * what an owner would reach by hand through the controls, which is the point:
 * the palette shortens the path, it does not create a private one.
 */
export function completedWindowConfig(
  window: CompletedWindowId,
  todayIso: string,
  firstDayOfWeek: FirstDayOfWeek,
): TaskViewConfig {
  const bounds = completedWindowBounds(window, todayIso, firstDayOfWeek);
  return {
    ...DEFAULT_TASK_VIEW_CONFIG,
    systemView: "completed",
    sort: "completed",
    filters: {
      ...DEFAULT_TASK_VIEW_CONFIG.filters,
      completedFrom: bounds.from,
      completedTo: bounds.to,
    },
  };
}

/**
 * The `/tasks` URL that shows exactly the work completed inside `bounds`, in
 * completion order.
 *
 * This is the ONE place a surface outside the Tasks module — today Analytics'
 * completed-trend metric — is given a completion-window destination, and it is
 * deliberately the same configuration the Tasks module's own codec writes rather
 * than a bespoke query string: the Completed system view, the completion sort,
 * and the two owner-calendar bounds under the parameter names
 * `TASKS_FILTER_PARAMS` publishes. `test/unit/tasks/completed-window-url.test.ts`
 * asserts that equality directly (`paramsFromConfig` of the same window produces
 * this query), so the two cannot drift apart silently.
 *
 * A module cannot import another module's URL codec (AGENTS.md §9.1), and a
 * kernel value that pretended not to be a URL would not have helped anyone: the
 * link IS the contract between the two surfaces, so it is stated here, in the
 * kernel both of them already share, and tested against the codec.
 */
export function completedRangeTasksHref(bounds: CompletedWindowBounds): string {
  const params = new URLSearchParams({
    system: "completed",
    sort: "completed",
    completedFrom: bounds.from,
    completedTo: bounds.to,
  });
  return `/tasks?${params.toString()}`;
}
