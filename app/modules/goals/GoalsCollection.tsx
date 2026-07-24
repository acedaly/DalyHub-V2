/**
 * AREA-03 — the Goals collection view: the Alignment view (ADR-040).
 *
 * Replaces the placeholder `/goals` surface with the shared PX-02 Collection
 * Layout and DS-04 Card. Every open Goal across every Area is shown with its
 * derived alignment state (`AlignmentIndicator`) so the owner can see, at a
 * glance, which Goals have had recent Task action and which have not. The
 * component contains no server imports; the loader hands it JSON-safe Goal +
 * alignment summaries. Goal CREATION stays owned by the Area record (AREA-02)
 * — this collection is a read-only alignment surface, not a second creation
 * entry point.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFetcher, useNavigate } from "react-router";

import {
  Card,
  CardCollection,
  type CardMetaItem,
  type CardProps,
} from "~/shared/card";
import { CollectionLayout } from "~/shared/collection-layout";
import { EmptyState } from "~/shared/empty-state";
import { EntityIcon } from "~/shared/entity";
import { LoadMore } from "~/shared/load-more";
import {
  AlignmentIndicator,
  compareAlignmentForDisplay,
  type GoalAlignment,
} from "~/shared/alignment";

import { goalStateLabel } from "./goal-view";
import type { SerializedGoalListItem } from "./goal-view";

export type SerializedGoalWithAlignment = SerializedGoalListItem & {
  readonly alignment: GoalAlignment;
};

export interface GoalsCollectionViewProps {
  readonly goals: readonly SerializedGoalWithAlignment[];
  readonly nextCursor: string | null;
  readonly failed: boolean;
}

type GoalsPageData = {
  readonly goals: readonly SerializedGoalWithAlignment[];
  readonly nextCursor: string | null;
  readonly failed: boolean;
};

export function GoalsCollectionView({
  goals,
  nextCursor,
  failed,
}: GoalsCollectionViewProps) {
  const navigate = useNavigate();
  return (
    <GoalsCollection
      goals={goals}
      nextCursor={nextCursor}
      failed={failed}
      onOpenGoal={(id) => navigate(`/goals/${encodeURIComponent(id)}`)}
    />
  );
}

function toCardProps(
  goal: SerializedGoalWithAlignment,
  onOpenGoal: (id: string) => void,
): CardProps {
  const metadata: CardMetaItem[] = [
    {
      id: "alignment",
      label: "Alignment",
      value: <AlignmentIndicator alignment={goal.alignment} showReason />,
    },
  ];

  return {
    id: goal.id,
    title: goal.title,
    typeLabel: "Goal",
    icon: <EntityIcon type="goal" />,
    headingLevel: 2,
    status: goalStateLabel(goal),
    context: {
      label: goal.area.title,
      href: `/areas/${encodeURIComponent(goal.area.id)}`,
    },
    metadata,
    density: "comfortable",
    presentation: "list",
    href: `/goals/${encodeURIComponent(goal.id)}`,
    onOpen: () => onOpenGoal(goal.id),
    openAriaLabel: `Open ${goal.title}`,
  };
}

function useGoalPagination(
  firstPage: readonly SerializedGoalWithAlignment[],
  initialCursor: string | null,
) {
  const fetcher = useFetcher<GoalsPageData>();
  const [appended, setAppended] = useState<SerializedGoalWithAlignment[]>([]);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loadFailed, setLoadFailed] = useState(false);
  const processed = useRef<GoalsPageData | null>(null);

  useEffect(() => {
    setAppended([]);
    setCursor(initialCursor);
    setLoadFailed(false);
    processed.current = null;
  }, [initialCursor]);

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) {
      return;
    }
    const data = fetcher.data;
    if (processed.current === data) {
      return;
    }
    processed.current = data;
    if (data.failed) {
      setLoadFailed(true);
      return;
    }
    setAppended((prev) => [...prev, ...data.goals]);
    setCursor(data.nextCursor);
    setLoadFailed(false);
  }, [fetcher.state, fetcher.data]);

  const loadMore = useCallback(() => {
    if (cursor === null) {
      return;
    }
    setLoadFailed(false);
    fetcher.load(`/goals?cursor=${encodeURIComponent(cursor)}`);
  }, [cursor, fetcher]);

  const items = useMemo(() => {
    const seen = new Set<string>();
    const out: SerializedGoalWithAlignment[] = [];
    for (const goal of [...firstPage, ...appended]) {
      if (seen.has(goal.id)) {
        continue;
      }
      seen.add(goal.id);
      out.push(goal);
    }
    return out;
  }, [firstPage, appended]);

  return {
    items,
    hasMore: cursor !== null,
    loading: fetcher.state !== "idle",
    loadFailed,
    loadMore,
  };
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
  nextCursor,
  failed,
  onOpenGoal,
}: {
  readonly goals: readonly SerializedGoalWithAlignment[];
  readonly nextCursor: string | null;
  readonly failed: boolean;
  readonly onOpenGoal: (id: string) => void;
}) {
  const { items, hasMore, loading, loadFailed, loadMore } = useGoalPagination(
    goals,
    nextCursor,
  );
  const sorted = useMemo(
    () =>
      [...items].sort((a, b) =>
        compareAlignmentForDisplay(
          { alignment: a.alignment, createdAt: a.createdAt, id: a.id },
          { alignment: b.alignment, createdAt: b.createdAt, id: b.id },
        ),
      ),
    [items],
  );
  const count = items.length;
  const subtitle = failed
    ? "We couldn't load your Goals."
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
      title="Goals"
      subtitle={subtitle}
      entityType="goal"
      error={
        failed ? (
          <EmptyState
            title="We couldn't load your Goals"
            description="Something went wrong. Please try again."
          />
        ) : undefined
      }
      isEmpty={!failed && count === 0}
      emptySlot={
        <EmptyState
          icon={<EntityIcon type="goal" />}
          title="No Goals yet"
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
      <CardCollection
        items={sorted}
        getItemId={(goal) => goal.id}
        ariaLabel="Goals"
        presentation="list"
        density="comfortable"
        renderCard={(goal) => <Card {...toCardProps(goal, onOpenGoal)} />}
      />
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
