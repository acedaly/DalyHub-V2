/**
 * AREA-03 — the real Goals collection route (`/goals`): the Alignment view.
 *
 * Replaces the FND-09 placeholder. Shows every open Goal across every Area
 * with its derived alignment state — whether recent Task activity has
 * contributed to it — so the owner can see at a glance which Goals have had
 * attention and which have not (ADR-040).
 */

import { env } from "cloudflare:workers";

import { addDaysToIsoDate } from "~/kernel/alignment";
import {
  EMPTY_GOAL_PROJECT_CONTRIBUTION,
  UNMEASURED_GOAL,
} from "~/kernel/goals";
import { InvalidSpineCursorError } from "~/kernel/spine";
import {
  composeGoalAlignmentFacts,
  createOwnerAlignmentContext,
  evaluateGoalAlignment,
} from "~/shared/alignment";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import { ownerCalendarIso } from "~/shared/datetime";
import { evaluateGoalFromSummary } from "~/shared/goal-progress";

import { GoalsCollectionView } from "../GoalsCollection";
import type {
  GoalCollectionState,
  SerializedDeletedGoalItem,
} from "../GoalsCollection";
import {
  serializeGoalListItem,
  serializeGoalProjectContribution,
  type SerializedGoalListItem,
} from "../goal-view";
import type { SerializedGoalWithAlignment } from "../GoalsCollection";
import type { Route } from "./+types/index";

export function meta() {
  return [
    { title: "Goals · DalyHub" },
    {
      name: "description",
      content:
        "Whether recent action matches your stated Goals — the intention-to-action gap.",
    },
  ];
}

function parseState(value: string | null): GoalCollectionState {
  return value === "deleted" ? "deleted" : "active";
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const state = parseState(url.searchParams.get("state"));

  // PX-04 — the honest "Deleted" view. A soft-deleted Goal is an ordinary
  // soft-deleted ENTITY (the spine stores identity, title and `deletedAt` on
  // `entities`), so the generic kernel list serves this view with NO new query,
  // NO migration and no Goal-specific deletion model — exactly as Notes do.
  if (state === "deleted") {
    try {
      const scope = await resolveAuthenticatedWorkspaceScope(env, session);
      const page = await scope.entities.list({
        type: "goal",
        cursor,
        deletedOnly: true,
      });
      return {
        goals: [] as SerializedGoalWithAlignment[],
        deletedGoals: page.items.map((item) => ({
          id: item.id,
          title: item.title,
          updatedAt: item.updatedAt.toISOString(),
        })) as readonly SerializedDeletedGoalItem[],
        nextCursor: page.nextCursor,
        state,
        failed: false,
      };
    } catch {
      return {
        goals: [] as SerializedGoalWithAlignment[],
        deletedGoals: [] as readonly SerializedDeletedGoalItem[],
        nextCursor: null as string | null,
        state,
        failed: true,
      };
    }
  }

  try {
    const scope = await resolveAuthenticatedWorkspaceScope(env, session);

    // AUDIT-14 — the owner's day, from the one scope-level authority.
    const timeZone = await scope.ownerTimeZone();
    const { evaluation, recentWindowStartIso, recentBoundaryStartIso } =
      createOwnerAlignmentContext(new Date(), timeZone);

    // DEBT-23: the collection is ordered by the deterministic workspace-wide
    // Alignment precedence in the repository (BEFORE pagination), so the Goals
    // most worth a look lead across the WHOLE workspace — not merely within each
    // fetched page. The rank's active/neglected split uses the EXACT owner-calendar
    // boundary (so the SQL order agrees with the evaluator), and the cursor is
    // bound to that window. A stale/incompatible/cross-window cursor is reset
    // calmly to the first page rather than surfaced as an error.
    let page;
    try {
      page = await scope.goals.listGoalsByAlignment({
        cursor,
        activeBoundaryIso: recentBoundaryStartIso,
      });
    } catch (error) {
      if (error instanceof InvalidSpineCursorError) {
        page = await scope.goals.listGoalsByAlignment({
          activeBoundaryIso: recentBoundaryStartIso,
        });
      } else {
        throw error;
      }
    }
    const ids = page.items.map((item) => item.id);

    /*
     * GOAL-02 — the page's MEASURABLE state, in a fixed number of grouped
     * queries beside the two this loader already made.
     *
     * `listMeasurementSummaries` returns three readings and a count per Goal —
     * never a history — and `goalDetails.listMany` the configurations, so a page
     * of twenty Goals costs a handful of statements rather than twenty
     * (AGENTS.md §16). The comparison window is a month, which is the period the
     * card's "since" figure describes.
     */
    const comparisonFromIso = addDaysToIsoDate(evaluation.todayIso, -30);
    const [
      contributions,
      activityFacts,
      measurementSummaries,
      milestoneSummaries,
      detailsById,
    ] = await Promise.all([
      scope.goals.listGoalProjectContributions(ids),
      scope.alignment.listGoalAlignmentFacts(ids, { recentWindowStartIso }),
      scope.goalMeasurements.listMeasurementSummaries(ids, {
        comparisonFromIso,
      }),
      scope.goalMeasurements.listMilestoneSummaries(ids),
      scope.goalDetails.listMany(ids),
    ]);

    const goals: SerializedGoalWithAlignment[] = page.items.map((item) => {
      // The SAME contribution the alignment evaluation reads. M3X-02 carries it
      // through to the card as well, because it is the Goal's one real measure
      // and it was already in hand — computing it twice, or reading it again for
      // the card, would be the N+1 this loader has always avoided.
      const contribution =
        contributions.get(item.id) ?? EMPTY_GOAL_PROJECT_CONTRIBUTION;
      const facts = composeGoalAlignmentFacts({
        goalId: item.id,
        completedAt: item.completedAt,
        contribution,
        activity: activityFacts.get(item.id),
      });
      const details = detailsById.get(item.id);
      return {
        ...serializeGoalListItem(item),
        alignment: evaluateGoalAlignment(facts, evaluation),
        contribution: serializeGoalProjectContribution(contribution),
        /*
         * GOAL-02 — derived with the SAME kernel evaluator the Goal record uses,
         * from the bounded summary rather than the full series, so a card can
         * never disagree with the record it links to. A Goal with no measurement
         * configuration evaluates to the unmeasured shape and the card keeps the
         * M3X-02 Project-contribution presentation unchanged.
         */
        progress: evaluateGoalFromSummary({
          config: details?.measurement ?? UNMEASURED_GOAL,
          targetDate: details?.targetDate ?? null,
          summary: measurementSummaries.get(item.id) ?? null,
          milestones: milestoneSummaries.get(item.id),
          startedOn: ownerCalendarIso(item.createdAt, timeZone),
          completed: item.completedAt !== null,
          todayIso: evaluation.todayIso,
        }),
      };
    });

    return {
      goals,
      deletedGoals: [] as readonly SerializedDeletedGoalItem[],
      nextCursor: page.nextCursor,
      state,
      failed: false,
    };
  } catch {
    return {
      goals: [] as SerializedGoalWithAlignment[],
      deletedGoals: [] as readonly SerializedDeletedGoalItem[],
      nextCursor: null as string | null,
      state,
      failed: true,
    };
  }
}

export default function GoalsRoute({ loaderData }: Route.ComponentProps) {
  return (
    <GoalsCollectionView
      goals={loaderData.goals}
      deletedGoals={loaderData.deletedGoals}
      nextCursor={loaderData.nextCursor}
      state={loaderData.state}
      failed={loaderData.failed}
    />
  );
}

// Re-exported so `../GoalsCollection` and other callers can share the exact
// loader-data shape without re-declaring it.
export type { SerializedGoalListItem };
