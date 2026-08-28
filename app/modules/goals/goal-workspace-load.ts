/**
 * REDESIGN-04 — the ONE Goal-detail read, shared by the record and the workspace.
 *
 * `/goals/:goalId` has always made this set of reads. `mockup3.png`'s
 * master–detail means `/goals?goal=<id>` now needs exactly the same facts for
 * the pane on its right, and the one thing that must not happen is two loaders
 * drifting into two slightly different pictures of one Goal. So the reads live
 * here, once, and both routes call them.
 *
 * The cost is stated plainly because §5.3 and §12 both turn on it: this is ONE
 * Goal's reads, made once per page load, for the single selected Goal. It is
 * not per row, it does not grow with the list, and the workspace's own
 * collection reads are untouched by it. A page with no selection does not call
 * it at all.
 *
 * Progress is DERIVED on every read, never stored, by the SAME kernel evaluator
 * the collections and Today use — so the pane, the row beside it and the record
 * it links to can never disagree about one Goal.
 */

import { UNMEASURED_GOAL } from "~/kernel/goals";
import type { WorkspaceScope } from "~/platform/workspaces";
import { readGoalNextAction } from "~/shared/task-record/next-action-load.server";
import type { SerializedNextAction } from "~/shared/task-record/NextActionLine";
import {
  composeGoalAlignmentFacts,
  evaluateGoalAlignment,
  type AlignmentEvaluationContext,
} from "~/shared/alignment";
import { ownerCalendarIso } from "~/shared/datetime";
import {
  evaluateGoalFromSeries,
  serializeGoalMeasurement,
  serializeGoalMilestone,
} from "~/shared/goal-progress";

import {
  serializeGoalDetails,
  serializeGoalOverview,
  serializeGoalProjectContribution,
  serializeGoalProjectItem,
} from "./goal-view";

/** The bounded page of contributing Projects a Goal's detail shows. */
export const GOAL_PROJECT_PAGE_SIZE = 50;

/*
 * DEBT-207 — `GOAL_ALIGNMENT_EVIDENCE_LIMIT` and its read are GONE from here.
 *
 * `listGoalAlignmentEvidence` fetched up to five contributing-Task rows on
 * every selection, and the workspace pane renders none of them: REDESIGN-04
 * gave the pane the alignment INDICATOR (§6.2) and left the evidence panel on
 * the canonical record, which makes the read there — from the record's own
 * loader, where `GoalAlignmentPanel` actually draws it. The constant lives on
 * in `routes/detail.tsx`, which is the one surface that renders it.
 */

export type GoalWorkspaceDetail = Awaited<
  ReturnType<typeof loadGoalWorkspaceDetail>
>;

export async function loadGoalWorkspaceDetail(
  scope: WorkspaceScope,
  goalId: string,
  facts: {
    readonly timeZone: string;
    readonly evaluation: AlignmentEvaluationContext;
    readonly recentWindowStartIso: string;
  },
) {
  const overview = await scope.goals.getGoalOverview(goalId);
  // Not found, soft-deleted, wrong type, or another workspace's — all one calm
  // "no selection". The caller decides what to draw; this never discloses which
  // of those it was.
  if (!overview) return null;

  /*
   * GOAL-02 — the FULL measurement series is read here and nowhere else.
   *
   * This is the one surface that draws a trend, so it is the one surface that
   * pays for the history; every collection reads the bounded summary instead
   * (`listMeasurementSummaries`). The read is still capped by the repository.
   */
  const [
    details,
    contribution,
    projectPage,
    activityFacts,
    measurements,
    milestones,
  ] = await Promise.all([
    scope.goalDetails.get(goalId),
    scope.goals.getGoalProjectContribution(goalId),
    scope.goals.listGoalProjects({ goalId, limit: GOAL_PROJECT_PAGE_SIZE }),
    scope.alignment.getGoalAlignmentFacts(goalId, {
      recentWindowStartIso: facts.recentWindowStartIso,
    }),
    scope.goalMeasurements.listMeasurements(goalId),
    scope.goalMeasurements.listMilestones(goalId),
  ]);

  const alignment = evaluateGoalAlignment(
    composeGoalAlignmentFacts({
      goalId,
      completedAt: overview.completedAt,
      contribution,
      activity: activityFacts ?? undefined,
    }),
    facts.evaluation,
  );

  const measurement = details?.measurement ?? UNMEASURED_GOAL;
  const milestoneSummary = {
    goalId,
    total: milestones.length,
    completed: milestones.filter((item) => item.completedAt !== null).length,
    totalWeight: milestones.reduce((sum, item) => sum + item.weight, 0),
    completedWeight: milestones
      .filter((item) => item.completedAt !== null)
      .reduce((sum, item) => sum + item.weight, 0),
  };
  const progress = evaluateGoalFromSeries({
    config: measurement,
    targetDate: details?.targetDate ?? null,
    measurements: measurements.map((item) => ({
      value: item.value,
      measuredOn: item.measuredOn,
    })),
    milestones: milestoneSummary,
    // The Goal's own creation day is the schedule's origin when there is no
    // earlier reading, so "on track" is measured against real elapsed time.
    startedOn: ownerCalendarIso(overview.createdAt, facts.timeZone),
    completed: overview.completedAt !== null,
    todayIso: facts.evaluation.todayIso,
  });

  /*
   * STEER-04 (DEBT-210) — the Goal's NEXT STEP, across its contributing
   * Projects.
   *
   * The record and the workspace pane share this read for the same reason they
   * share every other fact on this page: two loaders drifting into two pictures
   * of one Goal is the defect REDESIGN-04 built this module to prevent.
   *
   * It costs ONE bounded ranked statement over the contributing-Project page
   * already read above (two only for a Goal with more than forty Projects) —
   * never one query per Project. Its own failure domain: a Goal that cannot name
   * its next step still states every derived fact it has, because a next action
   * is an addition to the record and never a precondition for it.
   */
  let nextAction: SerializedNextAction | null = null;
  try {
    nextAction = await readGoalNextAction(scope, {
      projects: projectPage.items.map((project) => ({
        id: project.id,
        title: project.title,
      })),
      todayIso: facts.evaluation.todayIso,
      timezone: facts.timeZone,
    });
  } catch {
    // A narrower record, never a broken one.
  }

  return {
    overview: serializeGoalOverview(overview),
    details: serializeGoalDetails(details),
    progress,
    nextAction,
    measurements: measurements.map(serializeGoalMeasurement),
    milestones: milestones.map(serializeGoalMilestone),
    contribution: serializeGoalProjectContribution(contribution),
    projects: projectPage.items.map(serializeGoalProjectItem),
    projectsNextCursor: projectPage.nextCursor,
    alignment,
  };
}
