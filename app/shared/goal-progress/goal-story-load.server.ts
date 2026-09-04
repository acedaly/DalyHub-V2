/**
 * STEER-03 — the ONE bounded read that composes a Goal's shared story.
 *
 * `loadGoalSummaries` already does this for the two GLANCE surfaces (Today's
 * Goal panel, the Projects page's Goal rail): it chooses which Goals to show,
 * ranks them and returns their facts. STEER-03 needs the same facts for a set
 * of Goals somebody ELSE has already chosen — the Area record's Goals tab shows
 * that Area's Goals, and the guided Review's Goals step shows the
 * alignment-ranked page `listGoalsByAlignment` selected. So this is the
 * selection-free half: *"given these Goal ids, what is each one's story?"*
 *
 * It is deliberately NOT a second derivation. Every value it returns comes from
 * an existing authority:
 *
 *   - measurement  → `evaluateGoalFromSummary` (GOAL-02's kernel evaluator)
 *   - alignment    → `evaluateGoalAlignment`  (ADR-040)
 *   - movement     → `readGoalMovement`       (FOLLOW-02's one server read)
 *   - condition    → the owner's stored value, carried, never interpreted
 *   - contribution → `listGoalProjectContributions`
 *
 * ── What it costs, stated ──────────────────────────────────────────────────
 * SIX grouped reads over the page's ids, which execute as **eight D1
 * statements**, and never one per Goal:
 *
 *   | read | statements |
 *   |---|---|
 *   | `goalDetails.listMany` | 1 |
 *   | `goalMeasurements.listMeasurementSummaries` | 2 |
 *   | `goalMeasurements.listMilestoneSummaries` | 1 |
 *   | `goals.listGoalProjectContributions` | 1 |
 *   | `alignment.listGoalAlignmentFacts` | 1 |
 *   | `readGoalMovement` (FOLLOW-02, unchanged) | 2 |
 *
 * Flat in the number of Goals up to each repository's own chunk size, and well
 * inside D1's 100-bound-parameter ceiling for the bounded pages that call it
 * (an Area's 50-Goal page, the Review's 12). Asserted against a counting
 * database by `test/kernel/goal-story.test.ts`.
 *
 * ── Why `.server` ──────────────────────────────────────────────────────────
 * `readGoalMovement` reaches the platform layer. `~/shared/goal-progress`'s
 * barrel is imported from the CLIENT bundle (Today's check-in sheet), so this
 * read is a separate module reached by its full path and is never re-exported
 * from the barrel — the same rule `goal-summary-load.ts` states and the same
 * reason it takes its movement read as an injected function.
 */

import { addDaysToIsoDate } from "~/kernel/alignment";
import {
  EMPTY_GOAL_PROJECT_CONTRIBUTION,
  UNMEASURED_GOAL,
} from "~/kernel/goals";
import type { FirstDayOfWeek } from "~/kernel/preferences";
import {
  goalMovementWindow,
  readGoalMovement,
} from "~/platform/activity-window/goal-movement.server";
import type { WorkspaceScope } from "~/platform/workspaces";
import {
  composeGoalAlignmentFacts,
  evaluateGoalAlignment,
  unavailableGoalMovement,
  type AlignmentEvaluationContext,
} from "~/shared/alignment";
import { ownerCalendarIso } from "~/shared/datetime";

import { evaluateGoalFromSummary } from "./goal-progress-view";
export type { LoadedGoalStory } from "./goal-story";
import type { GoalStoryContribution, LoadedGoalStory } from "./goal-story";

/**
 * The window the measurement summary's "since" comparison reads against — a
 * month, the same window `/goals` and Today use, so the change figure means the
 * same thing on every surface.
 */
const COMPARISON_WINDOW_DAYS = 30;

/** What each Goal id must arrive with, so this read never has to fetch it. */
export interface GoalStorySubject {
  readonly id: string;
  readonly title: string;
  /** The spine's own creation instant — the measurement schedule's origin. */
  readonly createdAt: Date;
  /** The spine's EXPLICIT completion, never a derived "achieved". */
  readonly completedAt: Date | null;
}

export interface GoalStoryFactsInput {
  readonly now: Date;
  readonly timezone: string;
  readonly todayIso: string;
  readonly firstDayOfWeek: FirstDayOfWeek;
  /** ADR-040's evaluation context, built by `createOwnerAlignmentContext`. */
  readonly evaluation: AlignmentEvaluationContext;
  /** ADR-040's recent-action window start, from the same context. */
  readonly recentWindowStartIso: string;
}

function toContribution(contribution: {
  readonly total: number;
  readonly completed: number;
  readonly active: number;
}): GoalStoryContribution {
  return {
    total: contribution.total,
    completed: contribution.completed,
    active: contribution.active,
  };
}

/**
 * Compose the shared story for a bounded set of Goals.
 *
 * The result is a Map keyed by Goal id with ONE entry per requested subject —
 * never a partial map a caller has to guard — so a Goal whose details row does
 * not exist yet still tells its honest unmeasured, unmoved story rather than
 * being silently absent from a surface that listed it.
 */
export async function loadGoalStories(
  scope: WorkspaceScope,
  subjects: readonly GoalStorySubject[],
  facts: GoalStoryFactsInput,
): Promise<ReadonlyMap<string, LoadedGoalStory>> {
  const stories = new Map<string, LoadedGoalStory>();
  if (subjects.length === 0) return stories;

  const ids = subjects.map((subject) => subject.id);
  const comparisonFromIso = addDaysToIsoDate(
    facts.todayIso,
    -COMPARISON_WINDOW_DAYS,
  );
  const movementWindow = goalMovementWindow({
    todayIso: facts.todayIso,
    firstDayOfWeek: facts.firstDayOfWeek,
    timezone: facts.timezone,
  });

  const [
    detailsById,
    measurementSummaries,
    milestoneSummaries,
    contributions,
    activityFacts,
    movement,
  ] = await Promise.all([
    scope.goalDetails.listMany(ids),
    scope.goalMeasurements.listMeasurementSummaries(ids, { comparisonFromIso }),
    scope.goalMeasurements.listMilestoneSummaries(ids),
    scope.goals.listGoalProjectContributions(ids),
    scope.alignment.listGoalAlignmentFacts(ids, {
      recentWindowStartIso: facts.recentWindowStartIso,
    }),
    readGoalMovement(scope, {
      goalIds: ids,
      window: movementWindow,
      timezone: facts.timezone,
      todayIso: facts.todayIso,
    }),
  ]);

  for (const subject of subjects) {
    const details = detailsById.get(subject.id);
    const contribution =
      contributions.get(subject.id) ?? EMPTY_GOAL_PROJECT_CONTRIBUTION;
    const progress = evaluateGoalFromSummary({
      config: details?.measurement ?? UNMEASURED_GOAL,
      targetDate: details?.targetDate ?? null,
      summary: measurementSummaries.get(subject.id) ?? null,
      milestones: milestoneSummaries.get(subject.id),
      // The Goal's own creation day is the schedule's origin when there is no
      // earlier reading, so "on track" is measured against real elapsed time.
      startedOn: ownerCalendarIso(subject.createdAt, facts.timezone),
      completed: subject.completedAt !== null,
      todayIso: facts.todayIso,
    });
    const alignment = evaluateGoalAlignment(
      composeGoalAlignmentFacts({
        goalId: subject.id,
        completedAt: subject.completedAt,
        contribution,
        activity: activityFacts.get(subject.id),
      }),
      facts.evaluation,
    );
    stories.set(subject.id, {
      id: subject.id,
      title: subject.title,
      progress,
      alignment,
      /*
       * An unreadable movement arrives as `available: false`, never as `null` —
       * "nothing moved" and "we could not look" are different sentences, and
       * `null` here means "this surface did not ask", which is not the case on
       * any caller of this read.
       */
      movement:
        movement.movements.get(subject.id) ??
        unavailableGoalMovement(subject.id, {
          window: movementWindow,
          todayIso: facts.todayIso,
        }),
      /*
       * STEER-02 — the OWNER's condition, carried BESIDE the derived answers.
       * It costs no read (it is on the details row already fetched), and no
       * evaluator above has seen it (ADR-111 decision 1).
       */
      condition: details?.condition ?? null,
      targetDate: details?.targetDate ?? null,
      contribution: toContribution(contribution),
      // The shared loader reads no Review snapshots; a caller that has the
      // series composes it in (V2.9 INS-02).
      contributionAcrossReviews: null,
      iconKey: details?.iconKey ?? null,
      colourSlot: details?.colourSlot ?? null,
    });
  }

  return stories;
}
