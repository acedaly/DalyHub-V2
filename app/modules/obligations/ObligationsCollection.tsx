/**
 * V2.10 LIFE-02 (D10) — the Life Admin collection.
 *
 * `/obligations` answers one question — "what do I need to deal with?" — so it
 * is ordered by WHEN and grouped into the bands an owner already thinks in:
 *
 *   Overdue · This week · This month · Later · Done
 *
 * Every heading carries the count of its band across the WHOLE collection, not
 * of the rows on the page, because a count of the page is a claim about the set
 * that happens to be false on every page but the last.
 *
 * ── What this is NOT ────────────────────────────────────────────────────────
 * Not a dashboard, not a calendar, not a total. There is no sum of what the
 * year will cost, no chart, and no figure anywhere on this page that is not a
 * count of rows. An obligation's AMOUNT does not appear on the compact row at
 * all — a collection is glanced at, and a price is the most private fact an
 * obligation carries; the record shows it, which is where the owner went to
 * look at it.
 *
 * ── The rows are the SHARED row ─────────────────────────────────────────────
 * `ObligationRow` is drawn identically here and on the Asset record's
 * Obligations tab. Two copies of one row is how two surfaces come to disagree
 * about the same record (ADR-115).
 */

import { useCallback, useMemo, useState } from "react";
import {
  Link,
  useNavigate,
  useRevalidator,
  useSearchParams,
} from "react-router";

import { OBLIGATION_CATEGORY_OPTIONS } from "~/kernel/obligations";
import {
  CollectionControls,
  collectionCountLabel,
  CollectionLayout,
  CreateActionLabel,
  useCollectionLoading,
  type CollectionControlGroup,
} from "~/shared/collection-layout";
import { EmptyState } from "~/shared/empty-state";
import { EntityIcon } from "~/shared/entity";
import { useFeedback } from "~/shared/feedback";
import { LoadMore, useKeysetPagination } from "~/shared/load-more";
import {
  groupObligationsByBand,
  ObligationBands,
  ObligationRow,
  type SerializedObligation,
  useObligationActions,
} from "~/shared/obligations";

import {
  OBLIGATION_STATUS_FILTERS,
  type ObligationsCollectionData,
} from "./obligations-view";

/** Stable module-level selectors, so the shared hook's memo identity is stable. */
function selectObligationsPage(data: ObligationsCollectionData) {
  return {
    items: data.obligations,
    nextCursor: data.nextCursor,
    failed: data.failed,
  };
}

function obligationId(obligation: SerializedObligation): string {
  return obligation.id;
}

export type ObligationsCollectionProps = ObligationsCollectionData;

export function ObligationsCollection(props: ObligationsCollectionProps) {
  const data = props;
  const [searchParams, setSearchParams] = useSearchParams();
  const revalidator = useRevalidator();
  const navigate = useNavigate();
  const feedback = useFeedback();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const baseWithQuery = useMemo(() => {
    const params = new URLSearchParams(searchParams);
    params.delete("cursor");
    const qs = params.toString();
    return qs ? `/obligations?${qs}` : "/obligations";
  }, [searchParams]);

  const pagination = useKeysetPagination<
    SerializedObligation,
    ObligationsCollectionData
  >({
    firstPage: data.obligations,
    initialCursor: data.nextCursor,
    path: baseWithQuery,
    select: selectObligationsPage,
    getId: obligationId,
    /*
     * ACTIONABLE, so `merge` — the rule TASKS-09 measured and CONV-02 stated
     * once on the hook itself: *"a keyset cursor is derived from page one's
     * tail and moves whenever a row leaves page one, so keying the reset on it
     * would collapse the owner's loaded pages after every completion."*
     *
     * This collection holds, dismisses, reopens and completes, and every one of
     * those revalidates. Left at the default `reset`, an owner three pages into
     * their overdue band who held one row was sent back to page one — the exact
     * defect the hook's own comment predicts for "a second actionable
     * collection".
     */
    refresh: "merge",
  });

  const setParam = useCallback(
    (key: string, value: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) next.set(key, value);
          else next.delete(key);
          next.delete("cursor");
          return next;
        },
        { replace: true, preventScrollReset: true },
      );
    },
    [setSearchParams],
  );

  /*
   * Completing opens the RECORD with its completion form already open, rather
   * than a second copy of that form in a dialog over the list. There is one
   * completion sheet in the product, it lives where the obligation lives, and a
   * list that grew its own would be the second one.
   */
  const complete = useCallback(
    (obligation: SerializedObligation) => {
      navigate(`/obligations/${encodeURIComponent(obligation.id)}?complete=1`);
    },
    [navigate],
  );

  const actions = useObligationActions({
    onChanged: () => revalidator.revalidate(),
    onBusy: setPendingId,
    feedback,
  });

  const filtersActive =
    data.query !== "" || data.category !== "" || data.status !== "open";

  const controlGroups: readonly CollectionControlGroup[] = useMemo(
    () => [
      {
        id: "status",
        label: "Status",
        param: "status",
        // Open work is the default lens, so the control shows it as the default
        // rather than as an active filter the owner has to notice and clear.
        defaultValue: "open",
        options: OBLIGATION_STATUS_FILTERS.map((option) => ({
          value: option.value,
          label: option.label,
        })),
      },
      {
        id: "category",
        label: "Category",
        param: "category",
        options: [
          { value: "", label: "All categories" },
          ...OBLIGATION_CATEGORY_OPTIONS.map((option) => ({
            value: option.value,
            label: option.label,
          })),
        ],
      },
    ],
    [],
  );

  const groups = useMemo(
    () => groupObligationsByBand(pagination.items, data.counts),
    [pagination.items, data.counts],
  );

  const subtitle = data.failed
    ? "We couldn’t load your obligations."
    : collectionCountLabel(
        pagination.items.length,
        "Obligation",
        "Obligations",
        { hasMore: pagination.hasMore },
      );

  const filterBar = (
    <div className="dh-obligations-filters">
      <label className="dh-obligations-filters__search">
        <span className="dh-visually-hidden">Search obligations</span>
        <input
          type="search"
          className="dh-input"
          placeholder="Search obligations…"
          defaultValue={data.query}
          onChange={(event) => setParam("q", event.currentTarget.value)}
          aria-label="Search obligations"
        />
      </label>
    </div>
  );

  const isEmpty =
    !data.failed && pagination.items.length === 0 && !filtersActive;
  const isFilteredEmpty =
    !data.failed && pagination.items.length === 0 && filtersActive;
  const isReloading = useCollectionLoading();

  return (
    <CollectionLayout
      isLoading={isReloading}
      title="Life Admin"
      subtitle={subtitle}
      filterBar={filterBar}
      persistentControls
      mobileControls={
        <CollectionControls
          groups={controlGroups}
          label="Filter obligations"
          triggerLabel="Filter"
          basePath="/obligations"
        />
      }
      primaryAction={
        <Link to="/obligations/new" className="dh-btn dh-btn--primary">
          <CreateActionLabel>New obligation</CreateActionLabel>
        </Link>
      }
      error={
        data.failed ? (
          <EmptyState
            icon={<EntityIcon type="obligation" />}
            title="We couldn’t load your obligations"
            description="Something went wrong. Please try again."
          />
        ) : undefined
      }
      isEmpty={isEmpty}
      emptySlot={
        <EmptyState
          icon={<EntityIcon type="obligation" />}
          title="Nothing due"
          description="Life Admin holds everything with a date on it that is not a task — a registration, an insurance renewal, a tax return, a subscription. Most of them are about nothing in particular, and that is fine."
          primaryAction={
            <Link to="/obligations/new" className="dh-btn dh-btn--primary">
              <CreateActionLabel>New obligation</CreateActionLabel>
            </Link>
          }
        />
      }
      isFilteredEmpty={isFilteredEmpty}
      filteredEmptySlot={
        <EmptyState
          icon={<EntityIcon type="obligation" />}
          title="Nothing matches"
          description="No obligations match this search or filter. Try clearing one."
        />
      }
    >
      <ObligationBands
        groups={groups}
        headingLevel={2}
        renderRow={(obligation) => (
          <ObligationRow
            key={obligation.id}
            obligation={obligation}
            busy={pendingId === obligation.id}
            onComplete={complete}
            onCreateTask={actions.createTask}
            onHold={actions.hold}
            onDismiss={actions.dismiss}
            onReopen={actions.reopen}
          />
        )}
      />
      {!data.failed && pagination.hasMore ? (
        <LoadMore
          loading={pagination.loading}
          loadFailed={pagination.loadFailed}
          onLoadMore={pagination.loadMore}
          label="Load more obligations"
        />
      ) : null}
    </CollectionLayout>
  );
}
