/**
 * FOLLOW-02 — the ONE server-side read of Goal movement.
 *
 * Three consumers come through here and none of them reads a repository for it:
 * Today's Goal panel, the Goals collection and the Goal record. That is
 * [ADR-110] decision 6 made structural — one derivation per question, shared by
 * every consumer — and it is the reason those three surfaces cannot disagree
 * about whether the same Goal moved.
 *
 * ── It reuses FOLLOW-01's period machinery rather than repeating it ─────────
 * {@link ownerPeriodWindow} resolves the owner-local boundaries, the
 * `activityWindow` repository performs the bounded read, and
 * `ActivityWindowPhase` decides the tense. There is no Goals-specific date
 * helper, no second period abstraction and no timezone arithmetic below this
 * file — which is exactly what FOLLOW-01 built the window for.
 *
 * ── What it costs ──────────────────────────────────────────────────────────
 * TWO D1 statements for a page of up to fifty Goals, and never one per Goal.
 * Flat with respect to history: a Goal with four thousand completed Tasks costs
 * what one with two costs, because the aggregation happens in SQL. Asserted
 * against real D1 by `test/kernel/goal-movement.test.ts`.
 *
 * ── Failing soft ───────────────────────────────────────────────────────────
 * A read that throws produces movements marked `available: false`, and the
 * surfaces then SAY so. "No movement yet this week" and "movement could not be
 * read" are different sentences, and a page must never print the first when it
 * means the second.
 */

import {
  emptyGoalMovementFacts,
  evaluateGoalMovement,
  unavailableGoalMovement,
  type GoalMovement,
} from "~/kernel/alignment";
import type { ActivityWindow } from "~/kernel/activity-window";
import { planningWeekStart, addPlanningDays } from "~/kernel/planning";
import type { FirstDayOfWeek } from "~/kernel/preferences";
import type { WorkspaceScope } from "~/platform/workspaces";
import { ownerCalendarIso } from "~/shared/datetime";

import { ownerPeriodWindow } from "./plan-account.server";

/**
 * The window every FOLLOW-02 surface asks about: the owner's CURRENT calendar
 * week.
 *
 * A week rather than a day, because a Goal is an outcome and outcomes rarely
 * move daily — "no movement today" would be true of almost every Goal on almost
 * every day, which is a statement with no information in it. A week is also the
 * period the product already agrees on: `firstDayOfWeek` plus the owner's
 * timezone is what `/plan`, the weekly Review and FOLLOW-01's account all use,
 * so movement lands in the same seven days the rest of the product means.
 *
 * `planningWeekStart` is the shared authority; nothing here does its own day
 * arithmetic.
 */
export function goalMovementWindow(input: {
  readonly todayIso: string;
  readonly firstDayOfWeek: FirstDayOfWeek;
  readonly timezone: string;
}): ActivityWindow {
  const startIso = planningWeekStart(input.todayIso, input.firstDayOfWeek);
  return ownerPeriodWindow(
    startIso,
    addPlanningDays(startIso, 6),
    input.timezone,
  );
}

/** The noun every surface names this window with. Stated once. */
export const GOAL_MOVEMENT_PERIOD_NOUN = "this week";

export interface GoalMovementRead {
  readonly window: ActivityWindow;
  /** One entry per requested Goal id — never a partial map a caller must guard. */
  readonly movements: ReadonlyMap<string, GoalMovement>;
}

/**
 * Read and derive movement for a bounded set of Goals inside one named window.
 *
 * `todayIso` is the OWNER's calendar day (ADR-022), resolved server-side from
 * their timezone preference — never a browser clock and never the Worker's UTC
 * day. It is what keeps a period that has not started from being described as
 * stalled.
 */
export async function readGoalMovement(
  scope: WorkspaceScope | null,
  input: {
    readonly goalIds: readonly string[];
    readonly window: ActivityWindow;
    readonly timezone: string;
    readonly todayIso: string;
  },
): Promise<GoalMovementRead> {
  const { window, todayIso } = input;
  const ids = [...new Set(input.goalIds)];

  const unavailable = (): GoalMovementRead => ({
    window,
    movements: new Map(
      ids.map((goalId) => [
        goalId,
        unavailableGoalMovement(goalId, { window, todayIso }),
      ]),
    ),
  });

  if (scope === null || ids.length === 0) {
    return ids.length === 0 ? { window, movements: new Map() } : unavailable();
  }

  try {
    const facts = await scope.activityWindow.readGoalMovementFacts(window, ids);
    const ctx = {
      window,
      todayIso,
      calendarIsoOf: (instant: Date) =>
        ownerCalendarIso(instant, input.timezone),
    };
    return {
      window,
      movements: new Map(
        ids.map((goalId) => [
          goalId,
          /*
           * A Goal the read returned no row for is not an error and not an
           * unknown: it is a Goal with no contributing structure and no
           * qualifying event, which is a real answer ("no movement yet this
           * week") rather than a blank.
           */
          evaluateGoalMovement(
            facts.get(goalId) ?? emptyGoalMovementFacts(goalId),
            ctx,
          ),
        ]),
      ),
    };
  } catch {
    return unavailable();
  }
}
