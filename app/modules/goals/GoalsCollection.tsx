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

import { EntityCard, EntityCardGrid } from "~/shared/card";
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
import {
  SegmentedFilter,
  type SegmentedFilterOption,
} from "~/shared/segmented-filter";
import { formatCalendarDate } from "~/shared/task-record/task-view";
import { AlignmentIndicator, type GoalAlignment } from "~/shared/alignment";

import { goalStateLabel } from "./goal-view";
import type { SerializedGoalListItem } from "./goal-view";
import type { GoalMutationResult } from "./routes/mutate";

export type SerializedGoalWithAlignment = SerializedGoalListItem & {
  readonly alignment: GoalAlignment;
};

/** A soft-deleted Goal, as the honest "Deleted" view shows it: identity only. */
export type SerializedDeletedGoalItem = {
  readonly id: string;
  readonly title: string;
  readonly updatedAt: string;
};

/** The two lifecycle views of the Goals collection (`?state=`). */
export type GoalCollectionState = "active" | "deleted";

const STATE_OPTIONS: readonly SegmentedFilterOption[] = [
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
 * Alignment is the one derived signal on the card, and it is the EXISTING
 * `AlignmentIndicator` (ADR-040) — no new health score, no fabricated momentum.
 */
function GoalEntityCard({
  goal,
}: {
  readonly goal: SerializedGoalWithAlignment;
}) {
  // The label stays the SHARED one, so the word cannot drift from the Goal
  // record's own chip. Only the tone is narrowed here: `goalStateLabel` speaks
  // the Card family's wider `CardTone`, and the pill's vocabulary is a subset —
  // narrowing at the boundary is honest, casting would hide a future mismatch.
  const state = goalStateLabel(goal);
  const tone = state.tone === "success" ? "success" : "neutral";
  const updated = formatCalendarDate(goal.updatedAt.slice(0, 10));
  return (
    <EntityCard
      data-testid="goal-card"
      icon={<AccentIcon entityType="goal" iconKey={null} />}
      title={goal.title}
      headingLevel={2}
      subtitle={goal.area.title}
      status={<StatusPill tone={tone}>{state.label}</StatusPill>}
      meta={
        <>
          <AlignmentIndicator alignment={goal.alignment} showReason />
          {updated ? (
            <span className="dh-ecard__fact">
              <HistoryIcon className="dh-ecard__fact-icon" aria-hidden="true" />
              {`Updated ${updated}`}
            </span>
          ) : null}
        </>
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
        filterBar={
          <SegmentedFilter
            param="state"
            options={STATE_OPTIONS}
            value={state}
            label="Filter Goals by state"
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

  return (
    <CollectionLayout
      isLoading={isReloading}
      title="Goals"
      subtitle={subtitle}
      entityType="goal"
      presentation="grid"
      filterBar={
        <SegmentedFilter
          param="state"
          options={STATE_OPTIONS}
          value={state}
          label="Filter Goals by state"
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
      {summary ? (
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
