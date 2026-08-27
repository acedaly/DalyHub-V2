/**
 * AREA-03 / REDESIGN-04 / STEER-01 — the Goals WORKSPACE (`/goals`).
 *
 * ── What this surface answers (STEER-01, recorded) ──────────────────────────
 * `/goals` is the **outcomes workspace**. The question it answers is
 * `GOAL_OUTCOME_QUESTION`:
 *
 *   > "How are my outcomes going — and which need my decision first?"
 *
 * Its order is that question's answer: the workspace-wide OUTCOME rank
 * (`GOAL_OUTCOME_DISPLAY_RANK` over GOAL-02's derived status), established in
 * SQL BEFORE pagination, with the keyset cursor bound to the workspace, the
 * owner's day, their zone and the active lens. Nothing is sorted in React.
 *
 * The surface used to be ordered by ADR-040's ALIGNMENT rank — neglected first
 * — beneath UIX-03's measurement lenses, so it answered "which Goal have I been
 * neglecting?" on a screen whose lenses ask about outcomes (DEBT-120). The
 * alignment ordering is not lost: `listGoalsByAlignment` is KEPT for every
 * consumer that still asks the alignment question (the guided Review, the
 * insights read, Today's attention facts and Analytics), and alignment itself
 * is still stated on this surface — as the pane's indicator and in each row's
 * accessible name, a derived signal beside the others rather than the order.
 *
 * The lenses filter the WORKSPACE in that same read, and every count beside a
 * lens is a workspace figure from `countGoalsByOutcomeLens` (DEBT-121) — never
 * a tally of the loaded page.
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
  parseGoalCollectionView,
  type GoalOutcomeLensCounts,
} from "~/kernel/goals";
import { InvalidSpineCursorError } from "~/kernel/spine";
import {
  composeGoalAlignmentFacts,
  createOwnerAlignmentContext,
  evaluateGoalAlignment,
  unavailableGoalMovement,
  type GoalMovement,
} from "~/shared/alignment";
import { DEFAULT_APP_PREFERENCES } from "~/kernel/preferences";
import {
  goalMovementWindow,
  readGoalMovement,
} from "~/platform/activity-window/goal-movement.server";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import { ownerCalendarIso } from "~/shared/datetime";
import type { SelectOption } from "~/shared/forms/types";
import { evaluateGoalFromSummary } from "~/shared/goal-progress";

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
   * STEER-01 — the lens is applied in the COLLECTION READ, not in React.
   *
   * UIX-03 parsed it here and filtered the loaded page, because the order was
   * the alignment ranking and adding a status predicate would have needed "a
   * second ranking, a second cursor scope and a status the database can
   * compute". STEER-01 built exactly those three: the order IS the outcome
   * ranking, the cursor is bound to workspace + day + zone + lens, and the
   * status is derived in SQL from the same stored facts the kernel evaluator
   * reads, under a parity test. So the lens narrows the workspace, its result
   * set is complete across pages, and its count (below) is workspace-true.
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
        selectedMovement: null as GoalMovement | null,
        selectedId: null as string | null,
        selectionExplicit: false,
        areaOptions: [] as SelectOption[],
        areaOptionsFailed: true,
        todayIso: null as string | null,
        timeZone: null as string | null,
        // STEER-01 — no workspace counts on the Deleted scope: four numbers
        // about the ACTIVE collection printed beside a list of deleted Goals
        // would be exactly the mismatch DEBT-121 closed.
        lensCounts: null as GoalOutcomeLensCounts | null,
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
        selectedMovement: null as GoalMovement | null,
        selectedId: null as string | null,
        selectionExplicit: false,
        areaOptions: [] as SelectOption[],
        areaOptionsFailed: true,
        todayIso: null as string | null,
        timeZone: null as string | null,
        lensCounts: null as GoalOutcomeLensCounts | null,
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

    /*
     * FOLLOW-02 — started here, awaited where the window is built, so it costs
     * no round trip of its own. See the note beside `movementWindow` below.
     */
    const firstDayOfWeekRead = scope.appPreferences
      .get(session.user.subject)
      .then((preferences) => preferences.firstDayOfWeek)
      .catch(() => DEFAULT_APP_PREFERENCES.firstDayOfWeek);

    /*
     * STEER-01 — the collection is ordered by the deterministic workspace-wide
     * OUTCOME precedence in the repository, BEFORE pagination, with the active
     * lens applied in the same read (DEBT-120, DEBT-121).
     *
     * The rank is GOAL-02's derived status computed in SQL from the same stored
     * facts the kernel evaluator reads, so a Goal that is behind its own target
     * date leads the workspace rather than the page — and a Goal needing
     * attention on page two is never stranded behind healthy Goals on page one.
     * The cursor is bound to workspace + owner day + zone + lens; a stale,
     * foreign or cross-lens cursor resets calmly to the first page rather than
     * surfacing as an error, exactly as the alignment cursor does.
     */
    const outcomeInput = {
      todayIso: evaluation.todayIso,
      timeZone,
      calendarIsoOf: (instant: Date) => ownerCalendarIso(instant, timeZone),
      view,
    };
    let page;
    try {
      page = await scope.goals.listGoalsByOutcome({ ...outcomeInput, cursor });
    } catch (error) {
      if (error instanceof InvalidSpineCursorError) {
        page = await scope.goals.listGoalsByOutcome(outcomeInput);
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
    /*
     * FOLLOW-02 — the movement window, resolved from the owner's own week.
     *
     * The preference read was STARTED above, concurrently with the Goals page,
     * because the window depends on it and awaiting it in sequence would add a
     * round trip to a route that already makes several. It is its own failure
     * domain and falls back to the product default rather than taking the
     * collection down: a week boundary one day out is a far smaller error than a
     * Goals page that does not load.
     */
    const firstDayOfWeek = await firstDayOfWeekRead;
    const movementWindow = goalMovementWindow({
      todayIso: evaluation.todayIso,
      firstDayOfWeek,
      timezone: timeZone,
    });
    const [
      contributions,
      activityFacts,
      measurementSummaries,
      milestoneSummaries,
      detailsById,
      lensCounts,
      movement,
    ] = await Promise.all([
      scope.goals.listGoalProjectContributions(ids),
      scope.alignment.listGoalAlignmentFacts(ids, { recentWindowStartIso }),
      scope.goalMeasurements.listMeasurementSummaries(ids, {
        comparisonFromIso,
      }),
      /*
       * DEBT-207 — the sparkline series read is GONE.
       *
       * `listMeasurementSeries(ids, { perGoalLimit: 12 })` transferred a run of
       * readings per Goal on every page and every revalidation to draw a
       * gallery card REDESIGN-04 deleted. The trend is not lost: selecting a
       * row draws the full chart on the pane, from the record's own read. The
       * repository method survives for the record; only this dead read goes.
       */
      scope.goalMeasurements.listMilestoneSummaries(ids),
      scope.goalDetails.listMany(ids),
      /*
       * STEER-01 — the WORKSPACE-TRUE lens counts (DEBT-121).
       *
       * Two statements for the whole workspace, from the SAME status and lens
       * expressions the ordered page above is filtered by, so a lens's number
       * and its result set cannot disagree. This is what lets the tabs carry a
       * figure at all: the previous counts described the loaded page beside a
       * label that reads as the workspace, which is the trust cost DEBT-121
       * names.
       */
      scope.goals.countGoalsByOutcomeLens({
        todayIso: evaluation.todayIso,
        calendarIsoOf: outcomeInput.calendarIsoOf,
      }),
      /*
       * FOLLOW-02 — did each Goal on this page move inside the named window?
       *
       * TWO grouped statements for the WHOLE page, beside the grouped reads
       * this loader already makes, and never one per Goal ([DEBT-78]'s closing
       * condition). It respects the pagination boundary by construction: the
       * ids are this page's ids, so a second page costs a second read of the
       * same shape rather than a read of the workspace's whole history.
       */
      readGoalMovement(scope, {
        goalIds: ids,
        window: movementWindow,
        timezone: timeZone,
        todayIso: evaluation.todayIso,
      }),
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
        /*
         * STEER-02 — the OWNER's condition, stated beside the derived facts and
         * never mixed into them. Already in hand from `listMany` above, so it
         * costs no read; it is presentation and scope only (ADR-111 decision 1)
         * and no evaluator above has seen it.
         */
        condition: details?.condition ?? null,
        /*
         * FOLLOW-02 — the SAME derivation Today and the Goal record read, so
         * the three surfaces cannot describe this Goal's week differently.
         */
        movement:
          movement.movements.get(item.id) ??
          unavailableGoalMovement(item.id, {
            window: movementWindow,
            todayIso: evaluation.todayIso,
          }),
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

    /*
     * FOLLOW-02 — the pane's movement is the SAME value its row carries.
     *
     * It is looked up rather than re-read, so selecting a Goal costs nothing:
     * the pane and the row beside it are literally the same object. Only a
     * `?goal=` naming a Goal that is not on this page pays for a second read,
     * which is the case REDESIGN-04 already accepts a whole detail read for.
     */
    let selectedMovement: GoalMovement | null =
      selectedId === null ? null : (movement.movements.get(selectedId) ?? null);
    if (selectedId !== null && selected !== null && selectedMovement === null) {
      const offPage = await readGoalMovement(scope, {
        goalIds: [selectedId],
        window: movementWindow,
        timezone: timeZone,
        todayIso: evaluation.todayIso,
      });
      selectedMovement = offPage.movements.get(selectedId) ?? null;
    }

    return {
      goals,
      deletedGoals: [] as readonly SerializedDeletedGoalItem[],
      nextCursor: page.nextCursor,
      selected,
      selectedMovement,
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
      /*
       * DEBT-121 — the counts the lens tabs print, true of the WORKSPACE.
       *
       * They are the loader's own value rather than something the client
       * derives, because a figure computed from `items` is a figure about the
       * loaded page however it is labelled.
       */
      lensCounts,
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
      selectedMovement: null as GoalMovement | null,
      selectedId: null as string | null,
      selectionExplicit: false,
      areaOptions: [] as SelectOption[],
      areaOptionsFailed: true,
      todayIso: null as string | null,
      timeZone: null as string | null,
      lensCounts: null as GoalOutcomeLensCounts | null,
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
      selectedMovement={loaderData.selectedMovement}
      selectedId={loaderData.selectedId}
      selectionExplicit={loaderData.selectionExplicit}
      areaOptions={loaderData.areaOptions}
      areaOptionsFailed={loaderData.areaOptionsFailed}
      todayIso={loaderData.todayIso}
      timeZone={loaderData.timeZone}
      lensCounts={loaderData.lensCounts}
      state={loaderData.state}
      view={loaderData.view}
      failed={loaderData.failed}
    />
  );
}

// Re-exported so `../GoalsCollection` and other callers can share the exact
// loader-data shape without re-declaring it.
export type { SerializedGoalListItem };
