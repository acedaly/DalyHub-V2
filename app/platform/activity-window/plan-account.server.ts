/**
 * FOLLOW-01 — the ONE server-side read of a period's plan account.
 *
 * Both consumers come through here and neither reads a repository for it:
 * Weekly Planning asks about the week it is showing, and the weekly Review asks
 * about the period it covers. That is [ADR-110] decision 6 made structural —
 * one derivation per question, shared by every consumer — and it is the reason
 * `/plan` and the Review cannot disagree about what became of the same week.
 *
 * FOLLOW-02 is specified to answer a DIFFERENT question over the same window
 * (did a Goal move?). It reuses {@link ownerPeriodWindow} and the same
 * `activityWindow` repository; it does not re-resolve a period, re-derive a
 * boundary, or reverse-engineer any of this from a surface.
 *
 * ── What it costs ───────────────────────────────────────────────────────────
 * TWO D1 statements, always, whatever the period holds. Not one per day, not
 * one per Task, and not one per Task's history. Asserted by
 * `test/kernel/activity-window.test.ts` against real D1, together with the
 * flatness claim: a fifteen-Task week costs exactly what a three-Task week does.
 *
 * ── Failing soft ────────────────────────────────────────────────────────────
 * A read that throws produces an account marked `available: false`, and the
 * surfaces then SAY so. "Nothing was planned" and "DalyHub could not read your
 * history" are different sentences, and a page must never print the first when
 * it means the second.
 */

import {
  buildActivityWindow,
  derivePeriodPlanAccount,
  unavailablePlanAccount,
  type ActivityWindow,
  type PeriodPlanAccount,
} from "~/kernel/activity-window";
import type { WorkspaceScope } from "~/platform/workspaces";
import { ownerCalendarIso, ownerDayStartInstant } from "~/shared/datetime";

/**
 * Resolve a named owner-local period into the window every V2.4 derivation
 * shares.
 *
 * The timezone conversion happens HERE, once — never inside SQL, never inside a
 * kernel evaluator and never in the browser. `ownerDayStartInstant` is used
 * rather than a raw local-midnight parse because a handful of zones skip
 * midnight on their DST transition, and walking forward to the first hour that
 * exists is the difference between a period that starts an hour late and one
 * that silently falls back to UTC.
 */
export function ownerPeriodWindow(
  periodStart: string,
  periodEnd: string,
  timezone: string,
): ActivityWindow {
  return buildActivityWindow({
    periodStart,
    periodEnd,
    startOfOwnerDay: (dayIso) => ownerDayStartInstant(dayIso, timezone),
  });
}

export interface PeriodPlanAccountRead {
  readonly window: ActivityWindow;
  readonly account: PeriodPlanAccount;
}

/**
 * Read and derive one period's plan account.
 *
 * `todayIso` is the OWNER's calendar day (ADR-022), resolved server-side from
 * their timezone preference — never a browser clock and never the Worker's UTC
 * day. It is what keeps a running period from being described as having failed
 * work it has not reached.
 */
export async function readPeriodPlanAccount(
  scope: WorkspaceScope | null,
  input: {
    readonly periodStart: string;
    readonly periodEnd: string;
    readonly timezone: string;
    readonly todayIso: string;
    readonly limits?: { readonly tasks?: number; readonly events?: number };
  },
): Promise<PeriodPlanAccountRead> {
  const window = ownerPeriodWindow(
    input.periodStart,
    input.periodEnd,
    input.timezone,
  );
  if (scope === null) {
    return { window, account: unavailablePlanAccount(window, input.todayIso) };
  }
  try {
    const read = await scope.activityWindow.readTaskPlanWindow(
      window,
      input.limits,
    );
    return {
      window,
      account: derivePeriodPlanAccount({
        window,
        todayIso: input.todayIso,
        subjects: read.subjects,
        events: read.events,
        bounded: read.bounded,
        ownerDayOf: (instantIso) =>
          ownerCalendarIso(new Date(instantIso), input.timezone),
      }),
    };
  } catch {
    return { window, account: unavailablePlanAccount(window, input.todayIso) };
  }
}
