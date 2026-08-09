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

import { EntityCard, EntityCardGrid, ExpressiveSummary } from "~/shared/card";
import {
  CollectionLayout,
  useCollectionLoading,
} from "~/shared/collection-layout";
import { EmptyState } from "~/shared/empty-state";
import { AccentIcon, EntityIcon, emptyCollectionTitle } from "~/shared/entity";
import { HistoryIcon } from "~/shared/icons";
import { LoadMore, useKeysetPagination } from "~/shared/load-more";
import { useCollectionRestore } from "~/shared/record-lifecycle";
import { StatusPill } from "~/shared/pill";
import { ViewSwitcher, type ViewSwitcherOption } from "~/shared/view-switcher";
import { formatCalendarDate } from "~/shared/task-record/task-view";
import { AlignmentIndicator, type GoalAlignment } from "~/shared/alignment";
import {
  formatMeasurementChange,
  formatMeasurementValue,
  goalTargetLabel,
  goalProgressStatusLabel,
  goalProgressStatusTone,
  goalProgressSummaryText,
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
  failed,
}: GoalsCollectionViewProps) {
  return (
    <GoalsCollection
      goals={goals}
      deletedGoals={deletedGoals}
      nextCursor={nextCursor}
      state={state}
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
 * One Goal card.
 *
 * The Goal's own accent is its AREA's, exactly as a Project card inherits its
 * Area's — a grid of Goals then groups visually by the part of life they serve
 * without needing a heading. `SerializedGoalListItem` does not carry the Area's
 * colour rank, so the neutral entity container applies rather than a colour that
 * would mean nothing; that is the same rule a Project with no Area follows.
 *
 * ── M3X-02: what this card is FOR ────────────────────────────────────────────
 *
 * The audit's H7 finding was that a Goal card was "a title, a chip and a
 * sentence explaining what is ABSENT", and PR #144 answered it with a summary
 * above the grid rather than in the grid. Three things changed here:
 *
 *   1. **The measure leads.** It is now the strongest element after the title,
 *      through the same shared progress the Project card uses. It is DERIVED,
 *      never stored, and it never implies the Goal itself is complete: that
 *      stays `completedAt`.
 *      - **GOAL-02 changed WHICH measure.** A Goal that states how it is
 *        measured leads with its own reading — `79 kg`, `79 kg → 70 kg`, the
 *        percentage of the distance covered — because that is what the owner set
 *        out to move. A Goal with no measurement keeps Project contribution,
 *        which is exactly the card M3X-02 built. Neither is ever a 0% bar for a
 *        journey that has not started: an unmeasured Goal with no contributing
 *        Projects still gets alignment's sentence and no bar at all.
 *   2. **The "Open" chip is gone.** Every open Goal in the collection carried an
 *      identical grey pill saying it was open, in the card's most valuable
 *      corner, next to a heading that could not have meant anything else. Only
 *      completion — the state that is genuinely news — takes a chip now.
 *   3. **Alignment states its REASON only when the reason is the whole story.**
 *      With a bar on the card, "Projects exist, but no recent Task activity was
 *      found" is a second sentence about the same subject; without one, it is
 *      the only thing that explains why there is nothing to measure.
 *
 * "Updated 19 Jul 2026" went for the reason it went from Projects and Areas: a
 * fact about the row rather than about the Goal, drawn identically on every card.
 */
function GoalEntityCard({
  goal,
}: {
  readonly goal: SerializedGoalWithAlignment;
}) {
  const complete = isGoalComplete(goal);
  // The SHARED derivations, so the card, the record and the Area tab can never
  // disagree — about how far a Goal's Projects have got, or about where its own
  // measurement stands.
  const contribution = goalContributionProgress(goal.contribution);
  const { progress } = goal;
  const measured = progress.measured && progress.progressPercent !== null;

  // A measured Goal's own reading replaces the contribution bar rather than
  // joining it: two bars on one card would be two answers to "how far along?".
  const overall = formatMeasurementChange(progress.totalChange, progress.unit);

  return (
    <EntityCard
      data-testid="goal-card"
      icon={<AccentIcon entityType="goal" iconKey={null} size="lg" />}
      title={goal.title}
      headingLevel={2}
      subtitle={goal.area.title}
      status={
        complete ? <StatusPill tone="success">Completed</StatusPill> : undefined
      }
      metric={
        measured && progress.current !== null
          ? {
              value:
                progress.type === "milestone"
                  ? `${progress.current}/${progress.target ?? 0}`
                  : formatMeasurementValue(progress.current, progress.unit),
              // VIS-01 — the TARGET, not the pair. The value is already the
              // figure above this label; repeating it inside the label made the
              // label the longer of the two strings.
              label: goalTargetLabel(progress) ?? "current",
            }
          : undefined
      }
      progress={
        measured
          ? {
              value: progress.progressPercent!,
              max: 100,
              label: `${progress.progressPercent}%`,
              // The announced value is the SAME sentence the record's own bar
              // announces, so one Goal has one wording everywhere.
              valueText: goalProgressSummaryText(progress),
            }
          : contribution.has
            ? {
                value: contribution.completed,
                max: contribution.total,
                label: `${contribution.percent}%`,
                valueText: `${contribution.percent}% — ${contribution.summary}`,
              }
            : undefined
      }
      /*
       * VIS-01 — ONE state signal and ONE fact, and which they are depends on
       * what the Goal actually is.
       *
       * This slot used to carry up to four things at once on a measured Goal: a
       * status pill, an alignment pill, "9.3 kg remaining" and "↓ 5.7 kg
       * overall". Every one of them is true and every one of them is somewhere
       * else on the same card — the status is a state of the reading, the
       * alignment is a state of the WORK, the remainder is the value against
       * the target two lines above, and the overall change is the record's
       * trend. Eleven facts is a card that documents a Goal; the job of a
       * gallery card is to help choose one.
       *
       * So: a MEASURED Goal states its measurement status and its total change
       * — the two things its number cannot say. An UNMEASURED one states its
       * alignment, which is this collection's reason for existing (ADR-040 —
       * the intention-to-action gap) and, for that Goal, genuinely the only
       * story on the card.
       */
      meta={
        measured ? (
          <>
            <StatusPill tone={goalProgressStatusTone(progress.status)}>
              {goalProgressStatusLabel(progress.status)}
            </StatusPill>
            {overall ? <span>{`${overall} overall`}</span> : null}
          </>
        ) : (
          <>
            <AlignmentIndicator
              alignment={goal.alignment}
              showReason={!contribution.has}
            />
            {contribution.has ? <span>{contribution.summary}</span> : null}
          </>
        )
      }
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
 * The same counts `alignmentSummary` states in words, as numbers.
 *
 * Split out rather than derived twice so the summary surface and its note can
 * never disagree — and so the ring's proportion is provably the proportion the
 * sentence beneath it describes. Null when there is no open Goal, which is the
 * same condition that suppresses the sentence: a page of completed Goals has
 * nothing to be "working toward".
 */
function alignmentMomentum(goals: readonly SerializedGoalWithAlignment[]): {
  readonly open: number;
  readonly active: number;
  readonly completed: number;
} | null {
  const open = goals.filter((goal) => goal.alignment.state !== "completed");
  if (open.length === 0) {
    return null;
  }
  return {
    open: open.length,
    active: open.filter((goal) => goal.alignment.state === "active").length,
    completed: goals.length - open.length,
  };
}

function GoalsCollection({
  goals,
  deletedGoals,
  nextCursor,
  state,
  failed,
}: {
  readonly goals: readonly SerializedGoalWithAlignment[];
  readonly deletedGoals: readonly SerializedDeletedGoalItem[];
  readonly nextCursor: string | null;
  readonly state: GoalCollectionState;
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
        entityType="goal"
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
    : hasMore
      ? count === 1
        ? "1 Goal loaded"
        : `${count} Goals loaded`
      : count === 1
        ? "1 Goal"
        : `${count} Goals`;
  const summary = failed ? null : alignmentSummary(items);
  const momentum = failed ? null : alignmentMomentum(items);

  return (
    <CollectionLayout
      isLoading={isReloading}
      title="Goals"
      subtitle={subtitle}
      entityType="goal"
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
       * M3X — Goals' one expressive surface.
       *
       * Every figure on it is a COUNT the module already had, and the ring is
       * the proportion the recap sentence has always stated in words. There is
       * deliberately no completion percentage, no score and no momentum
       * gauge: a DalyHub Goal carries no numeric target, and inventing one to
       * fill a hero would be exactly the fabricated precision
       * PRODUCT_PRINCIPLES rules out. The sentence stays, as the surface's
       * note, so nothing here depends on reading a ring.
       */}
      {momentum ? (
        <ExpressiveSummary
          className="dh-goals-summary"
          data-testid="goals-summary"
          eyebrow="Goals"
          headline="What you are working toward"
          ring={{
            value: momentum.active / momentum.open,
            label: `${momentum.active} of ${momentum.open} open Goals have had recent action`,
            centre: `${momentum.active}/${momentum.open}`,
          }}
          stats={[
            {
              id: "open",
              value: momentum.open,
              label: momentum.open === 1 ? "open Goal" : "open Goals",
            },
            ...(momentum.completed > 0
              ? [
                  {
                    id: "completed",
                    value: momentum.completed,
                    label: "completed",
                  },
                ]
              : []),
          ]}
          /*
           * The recap keeps its LIVE REGION. It is the sentence that changes
           * when "Load more" brings another page of Goals in, and moving it
           * onto the summary must not stop it being announced — the surface
           * changed, the behaviour did not.
           */
          note={summary ? <span role="status">{summary}</span> : undefined}
        />
      ) : summary ? (
        <p className="dh-goals-alignment-summary" role="status">
          {summary}
        </p>
      ) : null}
      <EntityCardGrid label="Goals">
        {items.map((goal) => (
          <GoalEntityCard key={goal.id} goal={goal} />
        ))}
      </EntityCardGrid>
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
