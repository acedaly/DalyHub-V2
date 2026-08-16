/**
 * AREA-03 / REDESIGN-04 — the Goals WORKSPACE (`/goals`).
 *
 * Shows every open Goal across every Area with its derived alignment state —
 * whether recent Task activity has contributed to it — so the owner can see at
 * a glance which Goals have had attention and which have not (ADR-040).
 *
 * ── REDESIGN-04: the collection became a master–detail ──────────────────────
 * `mockup3.png` draws Goals as a two-pane workspace: the list on the left, the
 * selected Goal's Overview on the right. §5.3 makes `/goals` its primary home.
 *
 * The selection is URL state (`?goal=<id>`), so it is shareable, bookmarkable
 * and Back/Forward-correct, and the detail is read SERVER-side in this loader
 * rather than fetched after mount — the pane arrives with the first byte, like
 * every other DalyHub surface.
 *
 * What that costs, exactly: ONE Goal's detail reads, the same set the canonical
 * `/goals/:goalId` record already makes, and only for the selected Goal. It is
 * not a per-row cost and it does not grow with the list — the collection's own
 * reads are untouched. A workspace with no Goals, or a `?goal=` naming a Goal
 * that is not in this workspace, simply resolves to no selection and pays
 * nothing.
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
import type { SelectOption } from "~/shared/forms/types";
import {
  evaluateGoalFromSummary,
  parseGoalCollectionView,
} from "~/shared/goal-progress";

/**
 * How many readings a gallery card's sparkline is drawn from.
 *
 * Twelve. A card's chart is roughly 100px wide, where more points are pixels
 * rather than information, and the recent run is what a "which way is this
 * going?" glance is asking about — a two-year-old reading would only flatten
 * the shape of the last few months.
 */
const GOAL_CARD_SPARKLINE_POINTS = 12;

/** Bounded page size for the Area options in the `+ Add goal` flow. */
const AREA_OPTIONS_LIMIT = 100;

import { GoalsCollectionView } from "../GoalsCollection";
import {
  loadGoalWorkspaceDetail,
  type GoalWorkspaceDetail,
} from "../goal-workspace-load";
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

/**
 * The `?goal=` selection, as untrusted URL text.
 *
 * It is never used as an authority: the detail read resolves it through the
 * workspace-scoped repository, which returns nothing for an id that is not a
 * Goal in this workspace. A missing, misspelled or cross-workspace id therefore
 * lands on "no selection", never on an error and never on another owner's data.
 */
function parseSelection(value: string | null): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const state = parseState(url.searchParams.get("state"));
  /*
   * UIX-03 — the status view is parsed here and applied on the CLIENT, over the
   * Goals already loaded.
   *
   * It is deliberately not a query filter. The collection's order is the
   * workspace-wide alignment ranking established before pagination (DEBT-23),
   * and its cursor is bound to that window; adding a status predicate to the
   * SQL would need a second ranking, a second cursor scope and a status the
   * database can compute — and the status is a KERNEL derivation over
   * measurements, dates and the owner's calendar, which SQL has no business
   * reproducing. Narrowing the loaded page keeps one source of truth for the
   * word on the card and the tab that counts it; the subtitle already states
   * that counts describe what is loaded.
   */
  const view = parseGoalCollectionView(url.searchParams.get("view"));
  const selection = parseSelection(url.searchParams.get("goal"));

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
        // The Deleted view is a list of removed records with one Restore each;
        // there is nothing to select and nothing to show beside it.
        selected: null as GoalWorkspaceDetail | null,
        selectedId: null as string | null,
        selectionExplicit: false,
        areaOptions: [] as SelectOption[],
        areaOptionsFailed: true,
        todayIso: null as string | null,
        timeZone: null as string | null,
        state,
        view,
        failed: false,
      };
    } catch {
      return {
        goals: [] as SerializedGoalWithAlignment[],
        deletedGoals: [] as readonly SerializedDeletedGoalItem[],
        nextCursor: null as string | null,
        selected: null as GoalWorkspaceDetail | null,
        selectedId: null as string | null,
        selectionExplicit: false,
        areaOptions: [] as SelectOption[],
        areaOptionsFailed: true,
        todayIso: null as string | null,
        timeZone: null as string | null,
        state,
        view,
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
      measurementSeries,
      milestoneSummaries,
      detailsById,
    ] = await Promise.all([
      scope.goals.listGoalProjectContributions(ids),
      scope.alignment.listGoalAlignmentFacts(ids, { recentWindowStartIso }),
      scope.goalMeasurements.listMeasurementSummaries(ids, {
        comparisonFromIso,
      }),
      /*
       * UIX-03 — the card's SPARKLINE, one grouped statement for the page.
       *
       * The summary above holds three readings chosen for arithmetic; drawing
       * those three as a line would assert a smooth path through a history that
       * may have wandered. This is the recent run, capped per Goal so the read
       * stays bounded (`GOAL_CARD_SPARKLINE_POINTS`), and it is used ONLY to
       * draw — every figure on the card still comes from the summary-based
       * evaluation, so the picture and the percentage cannot disagree.
       */
      scope.goalMeasurements.listMeasurementSeries(ids, {
        perGoalLimit: GOAL_CARD_SPARKLINE_POINTS,
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
        ...serializeGoalListItem(item, details),
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
        series: (measurementSeries.get(item.id) ?? []).map((point) => ({
          value: point.value,
          measuredOn: point.measuredOn,
        })),
        // Already in hand from `listMany` above — the card uses it only when
        // there is no reading to show.
        definitionOfDone: details?.definitionOfDone ?? null,
      };
    });

    /*
     * REDESIGN-04 — the selected Goal's detail, for the workspace's right pane.
     *
     * The mockup draws a Goal selected, so the workspace opens on one: the
     * `?goal=` id when it is present, otherwise the FIRST Goal in the list —
     * which is the workspace-wide alignment ranking's own leader, i.e. the Goal
     * the collection already considers most worth a look.
     *
     * Its own failure domain. A detail read that fails leaves the list
     * perfectly usable with an empty pane, rather than taking the whole
     * workspace down for one record.
     */
    /*
     * §5.1 — the Areas the `+ Add goal` flow chooses from.
     *
     * One bounded read of the workspace's Areas, the same one the Projects
     * create form makes for its own parent picker. It is a separate failure
     * domain: options that fail to load must never masquerade as "this
     * workspace has no Areas", which is the state that would make creation
     * genuinely impossible.
     */
    let areaOptions: SelectOption[] = [];
    let areaOptionsFailed = false;
    try {
      const areas = await scope.entities.list({
        type: "area",
        limit: AREA_OPTIONS_LIMIT,
      });
      areaOptions = areas.items.map((area) => ({
        value: area.id,
        label: area.title,
      }));
    } catch {
      areaOptionsFailed = true;
    }

    const selectedId = selection ?? goals[0]?.id ?? null;
    let selected: GoalWorkspaceDetail | null = null;
    if (selectedId !== null) {
      try {
        selected = await loadGoalWorkspaceDetail(scope, selectedId, {
          timeZone,
          evaluation,
          recentWindowStartIso,
        });
      } catch {
        selected = null;
      }
    }

    return {
      goals,
      deletedGoals: [] as readonly SerializedDeletedGoalItem[],
      nextCursor: page.nextCursor,
      selected,
      // The RESOLVED selection, not the requested one: a `?goal=` naming a Goal
      // that no longer exists highlights nothing rather than highlighting a row
      // that is not there.
      selectedId: selected ? selectedId : null,
      /*
       * REDESIGN-04 §7 — whether the selection was ASKED FOR or defaulted.
       *
       * On a desktop both panes are on screen, so opening the workspace on its
       * first Goal is what the reference draws. On a PHONE the pane is the
       * whole screen, so defaulting would mean `/goals` never shows the Goals
       * — the collection URL would open on a record. The phone therefore shows
       * the list unless the URL genuinely names a Goal, and this flag is how
       * CSS can tell the two apart without the server knowing the viewport.
       */
      selectionExplicit: selection !== null && selected !== null,
      areaOptions,
      areaOptionsFailed,
      todayIso: evaluation.todayIso,
      timeZone,
      state,
      view,
      failed: false,
    };
  } catch {
    return {
      goals: [] as SerializedGoalWithAlignment[],
      deletedGoals: [] as readonly SerializedDeletedGoalItem[],
      nextCursor: null as string | null,
      selected: null as GoalWorkspaceDetail | null,
      selectedId: null as string | null,
      selectionExplicit: false,
      areaOptions: [] as SelectOption[],
      areaOptionsFailed: true,
      todayIso: null as string | null,
      timeZone: null as string | null,
      state,
      view,
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
      selected={loaderData.selected}
      selectedId={loaderData.selectedId}
      selectionExplicit={loaderData.selectionExplicit}
      areaOptions={loaderData.areaOptions}
      areaOptionsFailed={loaderData.areaOptionsFailed}
      todayIso={loaderData.todayIso}
      timeZone={loaderData.timeZone}
      state={loaderData.state}
      view={loaderData.view}
      failed={loaderData.failed}
    />
  );
}

// Re-exported so `../GoalsCollection` and other callers can share the exact
// loader-data shape without re-declaring it.
export type { SerializedGoalListItem };
