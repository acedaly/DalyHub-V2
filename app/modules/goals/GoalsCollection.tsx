/**
 * AREA-03 / PX-04 — the Goals collection view: the Alignment view (ADR-040).
 *
 * Replaces the placeholder `/goals` surface with the shared PX-02 Collection
 * Layout and DS-04 Card. Every open Goal across every Area is shown with its
 * derived alignment state (`AlignmentIndicator`) so the owner can see, at a
 * glance, which Goals have had recent Task action and which have not. The
 * component contains no server imports; the loader hands it JSON-safe Goal +
 * alignment summaries. Goal CREATION stays owned by the Area record (AREA-02)
 * — this collection is a read-only alignment surface, not a second creation
 * entry point.
 *
 * PX-04 adds the `?state=active|deleted` lifecycle filter, identical in shape and
 * wording to the Notes collection's (ADR-042): `deleted` lists ONLY soft-deleted
 * Goals and offers a one-click Restore, so removing a Goal is reversible for good
 * and never a dead end — the durable path back when an Undo toast is missed.
 *
 * DS-16 — the presentation moves from the generic full-width row Card to the
 * SAME `EntityCard`/`EntityCardGrid` foundation Areas and Projects use. A Goal
 * is a record you recognise before you read it, exactly like the other two, and
 * leaving it as the odd one out would have meant the spine's three collection
 * surfaces disagreeing about what a collection looks like. Nothing Goal-specific
 * was introduced: the grid, the card, the identity container, the fact group and
 * the overflow all come from `~/shared/card`, so the column behaviour here is
 * whatever `--app-entity-card-min-width` says it is everywhere else.
 *
 * The DELETED view uses the same grid, deliberately. Its cards carry identity, a
 * deletion date and one Restore action — no open target, because a soft-deleted
 * record's canonical route 404s — but switching layouts between two views of the
 * same collection would make the lifecycle filter feel like a different page.
 */

import { useCallback } from "react";

import {
  EntityCard,
  EntityCardGrid,
  GoalCard,
  type GoalCardTone,
} from "~/shared/card";
import { Sparkline } from "~/shared/charts";
import {
  CollectionLayout,
  collectionCountLabel,
  useCollectionLoading,
} from "~/shared/collection-layout";
import { EmptyState } from "~/shared/empty-state";
import { AccentIcon, EntityIcon, emptyCollectionTitle } from "~/shared/entity";
import { HistoryIcon } from "~/shared/icons";
import { LoadMore, useKeysetPagination } from "~/shared/load-more";
import { useCollectionRestore } from "~/shared/record-lifecycle";
import { SegmentedFilter } from "~/shared/segmented-filter";
import { ViewSwitcher, type ViewSwitcherOption } from "~/shared/view-switcher";
import { formatCalendarDate } from "~/shared/task-record/task-view";
import {
  alignmentReasonText,
  type AlignmentTone,
  type GoalAlignment,
} from "~/shared/alignment";
import {
  GOAL_COLLECTION_VIEWS,
  GOAL_COLLECTION_VIEW_LABELS,
  formatMeasurementValue,
  goalAbsenceNote,
  goalJourneyLabel,
  goalMatchesCollectionView,
  goalOverTargetLabel,
  goalProgressStatusLabel,
  goalProgressStatusTone,
  goalProgressSummaryText,
  goalRemainingLabel,
  type GoalCollectionView,
  type GoalProgressEvaluation,
} from "~/shared/goal-progress";

import { goalContributionProgress, isGoalComplete } from "./goal-view";
import type {
  SerializedGoalListItem,
  SerializedGoalProjectContribution,
} from "./goal-view";
import type { GoalMutationResult } from "./routes/mutate";

export type SerializedGoalWithAlignment = SerializedGoalListItem & {
  readonly alignment: GoalAlignment;
  /**
   * M3X-02 — how many of the Projects advancing this Goal are complete.
   *
   * The Goal's measure when it has no measurement of its own, which was every
   * Goal until GOAL-02 and is still every Goal that has not opted in. The
   * collection loader has ALWAYS read it (it is an input to the alignment
   * evaluation); until M3X-02 it was computed, used once, and thrown away before
   * the card that most needed it.
   */
  readonly contribution: SerializedGoalProjectContribution;
  /**
   * GOAL-02 — the Goal's OWN measure, when it has one.
   *
   * M3X-02 reasoned that "a DalyHub Goal carries no numeric target and no unit,
   * so the mockups' weight readings have nothing behind them". That was true of
   * the product it was written against. A Goal can now carry a baseline, a
   * target and a unit, so when it does, this is the better answer to the same
   * question and the card leads with it. When it does not, `measured` is false
   * and the card is exactly the M3X-02 card, unchanged.
   */
  readonly progress: GoalProgressEvaluation;
  /**
   * UIX-03 — the recent readings, for the card's sparkline and nothing else.
   *
   * Deliberately separate from `progress`: every FIGURE on the card comes from
   * the evaluation (which is derived from the bounded summary), and this is
   * only the shape. Keeping them apart is what guarantees the drawing can never
   * imply a different number from the one printed beside it.
   */
  readonly series?: readonly {
    readonly value: number;
    readonly measuredOn: string;
  }[];
  /** The Goal's definition of done — the CONTENT of a Goal with no number. */
  readonly definitionOfDone?: string | null;
};

/** A soft-deleted Goal, as the honest "Deleted" view shows it: identity only. */
export type SerializedDeletedGoalItem = {
  readonly id: string;
  readonly title: string;
  readonly updatedAt: string;
};

/** The two lifecycle views of the Goals collection (`?state=`). */
export type GoalCollectionState = "active" | "deleted";

const STATE_OPTIONS: readonly ViewSwitcherOption[] = [
  { value: "active", label: "Active" },
  { value: "deleted", label: "Deleted" },
];

export interface GoalsCollectionViewProps {
  readonly goals: readonly SerializedGoalWithAlignment[];
  readonly deletedGoals?: readonly SerializedDeletedGoalItem[];
  readonly nextCursor: string | null;
  readonly state?: GoalCollectionState;
  /** UIX-03 — the status view (`?view=`), narrowing the loaded Goals. */
  readonly view?: GoalCollectionView;
  readonly failed: boolean;
}

type GoalsPageData = {
  readonly goals: readonly SerializedGoalWithAlignment[];
  readonly nextCursor: string | null;
  readonly failed: boolean;
};

type DeletedGoalsPageData = {
  readonly deletedGoals: readonly SerializedDeletedGoalItem[];
  readonly nextCursor: string | null;
  readonly failed: boolean;
};

export function GoalsCollectionView({
  goals,
  deletedGoals = [],
  nextCursor,
  state = "active",
  view = "all",
  failed,
}: GoalsCollectionViewProps) {
  return (
    <GoalsCollection
      goals={goals}
      deletedGoals={deletedGoals}
      nextCursor={nextCursor}
      state={state}
      view={view}
      failed={failed}
    />
  );
}

/**
 * A DELETED Goal's Card: no open target (its canonical route 404s — soft-deleted
 * records read as "not found" everywhere in the kernel), just identity and a
 * "Restore" quick action. The SAME shape the Deleted Notes view uses.
 */
function DeletedGoalCard({
  goal,
  onRestore,
  pending,
}: {
  readonly goal: SerializedDeletedGoalItem;
  readonly onRestore: (id: string, title: string) => void;
  readonly pending: boolean;
}) {
  const deletedOn = formatCalendarDate(goal.updatedAt.slice(0, 10));
  return (
    <EntityCard
      data-testid="deleted-goal-card"
      icon={<AccentIcon entityType="goal" iconKey={null} />}
      title={goal.title}
      headingLevel={2}
      meta={
        deletedOn ? (
          <span className="dh-ecard__fact">
            <HistoryIcon className="dh-ecard__fact-icon" aria-hidden="true" />
            {`Deleted ${deletedOn}`}
          </span>
        ) : undefined
      }
      // Quieter than an active Goal, and the muting is never the only signal —
      // the footer says "Deleted" in words.
      muted
      footer={
        <button
          type="button"
          className="dh-btn dh-btn--outlined dh-btn--sm"
          disabled={pending}
          onClick={() => onRestore(goal.id, goal.title)}
        >
          {pending ? "Restoring…" : "Restore"}
        </button>
      }
    />
  );
}

/**
 * Accumulate pages of DELETED Goals behind "Load more".
 *
 * It cannot share a scope with the active paginator: that one loads `/goals?cursor=`
 * — the ACTIVE alignment scope — so a deleted-scope cursor replayed through it would
 * fetch the wrong records. The cursor is bound to its scope, so the Deleted view
 * carries `state=deleted` through every page. Without this, a workspace with more
 * deleted Goals than one page could never reach — or restore — anything past the
 * first (a dead end of exactly the kind PX-04 exists to remove).
 *
 * UX-01 — the mechanics are now the ONE shared `useKeysetPagination` (DEBT-45). The
 * request-scoped guard this hook pioneered (a page is consumed only if it was asked
 * for since the current scope began) lives in the shared hook, so every collection
 * gets it rather than only this one.
 */
function useDeletedGoalPagination(
  firstPage: readonly SerializedDeletedGoalItem[],
  initialCursor: string | null,
) {
  return useKeysetPagination<SerializedDeletedGoalItem, DeletedGoalsPageData>({
    firstPage,
    initialCursor,
    path: "/goals?state=deleted",
    select: selectDeletedGoalsPage,
    getId: goalId,
  });
}

/** Stable module-level selectors, so the shared hook's memo identity is stable. */
function selectDeletedGoalsPage(data: DeletedGoalsPageData) {
  return {
    items: data.deletedGoals,
    nextCursor: data.nextCursor,
    failed: data.failed,
  };
}

function selectGoalsPage(data: GoalsPageData) {
  return {
    items: data.goals,
    nextCursor: data.nextCursor,
    failed: data.failed,
  };
}

function goalId(goal: { readonly id: string }): string {
  return goal.id;
}

/** Restore a Goal from the Deleted view — one click, through the shared hook. */
function useRestoreGoal() {
  const post = useCallback(async (goalId: string) => {
    const body = new FormData();
    body.set("intent", "restore");
    const response = await fetch(
      `/goals/${encodeURIComponent(goalId)}/mutate`,
      { method: "POST", body },
    );
    const result = (await response.json()) as GoalMutationResult;
    return result.kind === "restore" && result.ok;
  }, []);

  return useCollectionRestore({ post });
}

/**
 * Alignment's own tone vocabulary, mapped onto the card's.
 *
 * `AlignmentTone` is deliberately narrower than the card's — it excludes
 * `warning` and `danger`, because a Goal receiving no recent attention is not a
 * missed deadline (ADR-040 §40.5). The map is written out rather than cast so
 * that narrowing stays visible here: the card CAN paint a warning, and
 * alignment must never ask it to.
 */
function alignmentPillTone(tone: AlignmentTone): GoalCardTone {
  switch (tone) {
    case "success":
      return "success";
    case "info":
      return "info";
    default:
      return "neutral";
  }
}

/**
 * One Goal card — UIX-03.
 *
 * The M3X-02 card led with a percentage and a bar, because that was the only
 * measure a Goal had. GOAL-02 gave Goals a real one, and this card is built
 * around it: the READING is the card's largest element, the journey that makes
 * it checkable sits under it, and the percentage is demoted to a small figure on
 * a thin bar. A Goal is an outcome, and the card now looks like one — which is
 * also what stops the Goals gallery reading as a second Projects gallery.
 *
 * ── What each Goal shows, and why it differs ────────────────────────────────
 *
 * A MEASURED Goal states its reading, its journey, its bar, its status, what
 * remains and its target date. A Goal with a history also gets a sparkline —
 * one visual, never two, and never a flat line drawn from a single point.
 *
 * An UNMEASURED Goal states the absence in words and gets NO bar. Its story is
 * the WORK underneath it, so it keeps what this collection was built for
 * (ADR-040 — the intention-to-action gap): the alignment state is its one state
 * word, and its facts carry the Project contribution and, when there is no
 * contribution to state, alignment's own reason.
 *
 * A MEASURED Goal does not show alignment, and that is the one thing UIX-03
 * takes away. Its measurement status ("On track") and its alignment
 * ("Recently active") are two different state words about two different
 * subjects — the outcome and the work — and a card carrying both makes the
 * reader decide which one answers "how is this going?". The measurement is the
 * Goal's own answer, so it wins; the record still explains alignment in full.
 *
 * Identity is the AREA's, resolved server-side (`SerializedGoalArea`) and
 * applied once — the mark, the tint behind the reading, the bar and the
 * sparkline all take the same rank. Before UIX-03 every Goal in the gallery drew
 * the same neutral grey flag.
 */
function GoalEntityCard({
  goal,
}: {
  readonly goal: SerializedGoalWithAlignment;
}) {
  const complete = isGoalComplete(goal);
  const contribution = goalContributionProgress(goal.contribution);
  const { progress } = goal;
  const measured = progress.measured && progress.current !== null;
  const absence = goalAbsenceNote(progress);

  /*
   * The reading. A milestone Goal counts stages ("2 of 5"), everything else
   * states its value in its own unit — the two are different sentences and
   * flattening them into one would make "2" read as a weight.
   */
  const value = measured
    ? progress.type === "milestone"
      ? `${progress.current} of ${progress.target ?? 0}`
      : formatMeasurementValue(progress.current, progress.unit)
    : null;

  /*
   * The state line's trailing facts, in the order a chooser needs them: how far
   * is left, then by when. `goalOverTargetLabel` replaces the remainder once the
   * target is passed, because "0 kg to go" is a worse sentence than "113% of
   * target" and only one of the two is news.
   */
  const facts: string[] = [];
  const over = goalOverTargetLabel(progress);
  const remaining = goalRemainingLabel(progress);
  if (over) {
    facts.push(over);
  } else if (remaining) {
    facts.push(remaining);
  }
  if (progress.targetDate && !complete) {
    const formatted = formatCalendarDate(progress.targetDate);
    if (formatted) facts.push(`by ${formatted}`);
  }
  /*
   * An unmeasured Goal has no reading to qualify, so its facts are the WORK
   * beneath it. The alignment reason joins them only when there is no
   * contribution to state — with "2 of 3 Projects complete" on the card,
   * "Projects exist, but no recent Task activity was found" is a second
   * sentence about the same subject; without it, it is the whole story.
   */
  if (!measured) {
    if (contribution.has) {
      facts.push(contribution.summary);
    } else {
      for (const reason of goal.alignment.reasons) {
        facts.push(alignmentReasonText(reason));
      }
    }
  }

  /*
   * The sparkline, and ONLY when the history genuinely supports one. Two
   * readings is the floor: one point has no direction, and drawing a flat line
   * through it would assert the Goal is steady when nobody has said so.
   */
  const sparkPoints = (goal.series ?? []).map((point) => ({
    key: `${goal.id}-${point.measuredOn}-${point.value}`,
    date: point.measuredOn,
    value: point.value,
  }));

  return (
    <GoalCard
      data-testid="goal-card"
      icon={
        <AccentIcon
          entityType="goal"
          iconKey={goal.area.iconKey}
          colourRank={goal.area.colourRank}
          size="lg"
        />
      }
      title={goal.title}
      headingLevel={2}
      context={goal.area.title}
      accent={goal.area.colourRank}
      metric={
        value === null
          ? undefined
          : { value, caption: goalJourneyLabel(progress) }
      }
      note={value === null ? absence : null}
      /*
       * A qualitative Goal's definition of done is its content, and without it
       * the card is the words "Not measured" in an otherwise empty box. It is
       * only ever shown when there is no reading — a measured Goal's card is
       * about the measurement.
       */
      noteDetail={value === null ? goal.definitionOfDone : null}
      visual={
        sparkPoints.length >= 2 ? (
          <Sparkline points={sparkPoints} direction={progress.direction} />
        ) : undefined
      }
      /*
       * The bar. A measured Goal's own percentage when it has one; otherwise
       * the Project contribution, which is real bounded data with a real
       * denominator and is the only measure an unmeasured Goal has (M3X-02).
       *
       * Never both — two bars on one card would be two answers to "how far
       * along?" — and never a contribution bar on a MEASURED Goal, where the
       * outcome's own percentage is the better answer to the same question.
       * A Goal with neither gets no bar at all rather than an empty track at 0%.
       */
      progress={
        progress.progressPercent === null
          ? contribution.has
            ? {
                percent: contribution.percent,
                valueText: `${contribution.percent}% — ${contribution.summary}`,
                /*
                 * No figure beside this bar. It measures the WORK, not the
                 * outcome, and the card has already said "Not measured" where
                 * the reading would be — a bare "0%" next to those two words
                 * reads as "this Goal is nought per cent done", which is
                 * exactly the claim the note is there to refuse. The fact line
                 * states "0 of 1 Project complete", which labels the bar
                 * honestly and says whose percentage it is.
                 */
                label: null,
              }
            : undefined
          : {
              percent: progress.progressPercent,
              // The SAME sentence the record's own bar announces, so one Goal
              // has one wording everywhere.
              valueText: goalProgressSummaryText(progress),
              /*
               * A MANUAL Goal's reading is the percentage itself, so the figure
               * beside the bar would be the same number the card already prints
               * at display size. One card, one statement of one number.
               */
              label: progress.type === "manual" ? null : undefined,
            }
      }
      /*
       * ONE state word. A completed Goal says "Completed" — the spine's
       * explicit truth, which outranks whatever the last reading implied — and
       * everything else says what the evaluator concluded.
       */
      state={
        complete
          ? { label: "Completed", tone: "success" }
          : progress.measured
            ? {
                label: goalProgressStatusLabel(progress.status),
                tone: goalProgressStatusTone(progress.status),
              }
            : // The unmeasured Goal's one state word is its alignment — the
              // question this collection was built to answer for exactly the
              // Goals that cannot answer it with a number.
              {
                label: goal.alignment.label,
                tone: alignmentPillTone(goal.alignment.tone),
              }
      }
      facts={facts}
      /*
       * A completed Goal is NOT muted.
       *
       * Muting is the treatment for archived and deleted records — things
       * withdrawn from view. A Goal the owner actually achieved is the best news
       * on the page, and greying it out is the opposite of the "readable and
       * dignified" completion the brief asks for. The "Completed" state word and
       * the full bar carry it.
       */
      href={`/goals/${encodeURIComponent(goal.id)}`}
      openAriaLabel={`Open ${goal.title}`}
    />
  );
}

/** UX-01 — the ONE shared keyset paginator (DEBT-45). */
function useGoalPagination(
  firstPage: readonly SerializedGoalWithAlignment[],
  initialCursor: string | null,
) {
  return useKeysetPagination<SerializedGoalWithAlignment, GoalsPageData>({
    firstPage,
    initialCursor,
    path: "/goals",
    select: selectGoalsPage,
    getId: goalId,
  });
}

/**
 * A calm, honest one-line recap of the loaded page — plain counts, never a
 * percentage or a score (PRODUCT_PRINCIPLES' anti-fabricated-precision
 * mandate). Reflects only the Goals loaded so far (ADR-040 §40.9's disclosed
 * per-page limitation), not a workspace-wide total.
 */
function alignmentSummary(
  goals: readonly SerializedGoalWithAlignment[],
): string | null {
  const open = goals.filter((goal) => goal.alignment.state !== "completed");
  if (open.length === 0) {
    return null;
  }
  // Base the claim ONLY on `active` vs. the open total — never infer "every
  // Goal has had recent action" from "no Goal is neglected", since
  // `no_structure`/`unreachable` Goals are also not `active` and have NOT
  // had recent action either; they are just not classified `neglected`.
  const active = open.filter(
    (goal) => goal.alignment.state === "active",
  ).length;
  const goalNoun = open.length === 1 ? "Goal" : "Goals";
  if (active === open.length) {
    return open.length === 1
      ? "This Goal has had recent action."
      : "Every open Goal has had recent action.";
  }
  if (active === 0) {
    return open.length === 1
      ? "This Goal has not had recent action yet."
      : "No open Goals have had recent action yet.";
  }
  return `${active} of ${open.length} open ${goalNoun} ${open.length === 1 ? "has" : "have"} had recent action.`;
}

/**
 * UIX-03 — how many loaded Goals fall into each status view.
 *
 * Derived from the SAME predicate the grid filters with
 * (`goalMatchesCollectionView`), so a tab that says "3" always has three cards
 * behind it. Counting through the shared predicate rather than re-testing the
 * statuses here is the whole point: two implementations of "is this Goal on
 * track?" is one more than the product can keep honest.
 */
function goalViewCounts(goals: readonly SerializedGoalWithAlignment[]): {
  readonly total: number;
  readonly on_track: number;
  readonly attention: number;
  readonly completed: number;
} {
  const tally = (view: GoalCollectionView) =>
    goals.filter((goal) =>
      goalMatchesCollectionView(view, {
        completed: isGoalComplete(goal),
        status: goal.progress.status,
      }),
    ).length;
  return {
    total: goals.length,
    on_track: tally("on_track"),
    attention: tally("attention"),
    completed: tally("completed"),
  };
}

function GoalsCollection({
  goals,
  deletedGoals,
  nextCursor,
  state,
  view,
  failed,
}: {
  readonly goals: readonly SerializedGoalWithAlignment[];
  readonly deletedGoals: readonly SerializedDeletedGoalItem[];
  readonly nextCursor: string | null;
  readonly state: GoalCollectionState;
  readonly view: GoalCollectionView;
  readonly failed: boolean;
}) {
  const { items, hasMore, loading, loadFailed, loadMore } = useGoalPagination(
    goals,
    nextCursor,
  );
  // PX-06: the ONE shared collection loading signal — a same-route navigation
  // (a filter, a view, a page) shows the shared skeleton instead of leaving the
  // previous list on screen with no feedback.
  const isReloading = useCollectionLoading();
  const { restore, pendingIds, restoredIds } = useRestoreGoal();
  const deletedPages = useDeletedGoalPagination(
    deletedGoals,
    state === "deleted" ? nextCursor : null,
  );
  const deleted = deletedPages.items.filter(
    (goal) => !restoredIds.has(goal.id),
  );

  if (state === "deleted") {
    return (
      <CollectionLayout
        isLoading={isReloading}
        title="Goals"
        subtitle={
          failed
            ? "We couldn’t load your deleted Goals."
            : deletedPages.hasMore
              ? `${deleted.length} deleted Goals loaded`
              : deleted.length === 1
                ? "1 deleted Goal"
                : `${deleted.length} deleted Goals`
        }
        presentation="grid"
        viewSwitcher={
          <ViewSwitcher
            param="state"
            options={STATE_OPTIONS}
            value={state}
            label="Goal views"
          />
        }
        error={
          failed ? (
            <EmptyState
              title="We couldn’t load your deleted Goals"
              description="Something went wrong. Please try again."
            />
          ) : undefined
        }
        isFilteredEmpty={
          !failed && deleted.length === 0 && !deletedPages.hasMore
        }
        filteredEmptySlot={
          <EmptyState
            icon={<EntityIcon type="goal" />}
            title="No deleted Goals"
            description="Goals you delete appear here, and can be restored at any time."
          />
        }
      >
        <EntityCardGrid label="Deleted Goals">
          {deleted.map((goal) => (
            <DeletedGoalCard
              key={goal.id}
              goal={goal}
              onRestore={restore}
              pending={pendingIds.has(goal.id)}
            />
          ))}
        </EntityCardGrid>
        {!failed && deletedPages.hasMore ? (
          <LoadMore
            loading={deletedPages.loading}
            loadFailed={deletedPages.loadFailed}
            onLoadMore={deletedPages.loadMore}
            label="Load more deleted Goals"
          />
        ) : null}
      </CollectionLayout>
    );
  }

  // DEBT-23: the Alignment order is now established WORKSPACE-WIDE by the
  // repository (`listGoalsByAlignment`) BEFORE pagination, so accumulated pages
  // are already globally ordered by `GOAL_ALIGNMENT_DISPLAY_RANK` then
  // `(createdAt, id)`. The client renders that authoritative order directly and
  // never re-sorts Goals into a merely per-page ranking.
  const count = items.length;
  const subtitle = failed
    ? "We couldn’t load your Goals."
    : collectionCountLabel(count, "Goal", "Goals", { hasMore });
  const summary = failed ? null : alignmentSummary(items);
  /*
   * The view counts, over the Goals LOADED — the same per-page honesty the
   * subtitle already declares. They are computed here rather than server-side
   * because a count that disagreed with the cards beneath it would be worse
   * than one that is explicitly about this page.
   */
  const counts = goalViewCounts(items);
  const visible = items.filter((goal) =>
    goalMatchesCollectionView(view, {
      completed: isGoalComplete(goal),
      status: goal.progress.status,
    }),
  );

  return (
    <CollectionLayout
      isLoading={isReloading}
      title="Goals"
      subtitle={subtitle}
      presentation="grid"
      // UIQ-013 — Active/Deleted is the collection's principal mode (the two
      // are different collections of Goals, not a narrowing of one), so it sits
      // in the shared header view slot rather than in the filter row.
      viewSwitcher={
        <ViewSwitcher
          param="state"
          options={STATE_OPTIONS}
          value={state}
          label="Goal views"
        />
      }
      /*
       * UIX-06 — the status rail is a FILTER, so it lives in the filter band.
       *
       * It used to render into the CONTENT slot, which put a second, differently
       * drawn control rail loose between the header and the gallery: the
       * lifecycle segments in the header's view slot, and four bordered status
       * chips floating below the divider with nothing containing them. Two rails
       * in two presentations on one screen was the single clearest convergence
       * failure the UIX-06 audit found.
       *
       * The header contract settles which slot it belongs in: a view "cannot be
       * unset" and changes the principal mode (Active/Deleted); a filter narrows
       * which records are included and composes with its siblings. "On track",
       * "Needs attention" and "Completed" narrow — "All" is the unset state —
       * so they are filters, and the filter band is where Notes' search, People's
       * circles and Assets' tags already are.
       */
      filterBar={
        counts.total > 0 ? (
          <div className="dh-goals-views" data-testid="goals-views">
            <SegmentedFilter
              param="view"
              options={GOAL_COLLECTION_VIEWS.map((option) => ({
                value: option,
                label:
                  option === "all"
                    ? GOAL_COLLECTION_VIEW_LABELS[option]
                    : `${GOAL_COLLECTION_VIEW_LABELS[option]} ${counts[option]}`,
              }))}
              value={view}
              label="Filter Goals by status"
            />
          </div>
        ) : undefined
      }
      error={
        failed ? (
          <EmptyState
            title="We couldn’t load your Goals"
            description="Something went wrong. Please try again."
          />
        ) : undefined
      }
      isEmpty={!failed && count === 0}
      emptySlot={
        <EmptyState
          icon={<EntityIcon type="goal" />}
          title={emptyCollectionTitle("goal")}
          description="Goals are the aspirational outcomes you pursue under an Area. Open an Area to add one."
          primaryAction={
            <a className="dh-btn dh-btn--primary" href="/areas">
              Browse Areas
            </a>
          }
        />
      }
    >
      {/*
       * UIX-03 — the status views, and the collection's one quiet note.
       *
       * The M3X expressive banner that stood here was a ring, two counts and a
       * headline, all describing ALIGNMENT — whether recent Task activity had
       * touched each Goal. Every figure on it was true, and none of them was
       * about an outcome: it answered "is work happening?" on the one screen
       * whose subject is "am I getting there?", and at 390px it was the whole
       * first screen before a single Goal appeared.
       *
       * What replaces it is smaller and does more: four views over statuses the
       * evaluator already produces, so a workspace with fifteen Goals can ask
       * "which need me?" without reading fifteen cards. The alignment sentence
       * survives as the quiet note beneath — same words, same live region, a
       * twentieth of the space.
       */}
      {summary ? (
        <p className="dh-goals-alignment-summary" role="status">
          {summary}
        </p>
      ) : null}
      {/*
       * A view that matches nothing is a designed state, not an empty page: the
       * Goals ARE there, this lens just excludes them, so the copy says which
       * lens and offers the way back rather than inviting the owner to create a
       * Goal they already have (AGENTS.md §6 — no dead ends).
       */}
      {visible.length === 0 && count > 0 ? (
        <EmptyState
          icon={<EntityIcon type="goal" />}
          title={`No Goals are ${GOAL_COLLECTION_VIEW_LABELS[view].toLowerCase()}`}
          description="Nothing loaded matches this view."
          primaryAction={
            <a className="dh-btn dh-btn--outlined" href="/goals">
              Show all Goals
            </a>
          }
        />
      ) : (
        <EntityCardGrid label="Goals">
          {visible.map((goal) => (
            <GoalEntityCard key={goal.id} goal={goal} />
          ))}
        </EntityCardGrid>
      )}
      {!failed && hasMore ? (
        <LoadMore
          loading={loading}
          loadFailed={loadFailed}
          onLoadMore={loadMore}
          label="Load more Goals"
        />
      ) : null}
    </CollectionLayout>
  );
}
