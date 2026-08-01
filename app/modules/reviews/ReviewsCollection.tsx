/**
 * The Reviews collection.
 *
 * UX-01 — two corrections to bring Reviews onto the conventions every other
 * collection already followed:
 *   - pagination was a "Next page" `Link` that REPLACED the list; it now uses the
 *     ONE shared `useKeysetPagination` hook and accumulates in place, like Areas,
 *     Goals, Notes, Projects, People, Assets and (since UX-01) Meetings (DEBT-45);
 *   - the placeholder copy used ASCII "..." where the rest of the product uses a
 *     real ellipsis (the PX-06 copy convention).
 */

import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";

import {
  REVIEW_TYPES,
  type ReviewType,
  type ReviewView,
} from "~/kernel/reviews";
import { Card, CardCollection, type CardMetaItem } from "~/shared/card";
import {
  CollectionLayout,
  useCollectionLoading,
} from "~/shared/collection-layout";
import { EmptyState } from "~/shared/empty-state";
import { helpTopicHref } from "~/shared/help";
import { EntityIcon } from "~/shared/entity";
import { LoadMore, useKeysetPagination } from "~/shared/load-more";

import type { ReviewsCollectionData } from "./review-collection-data";
import { REVIEW_TYPE_LABELS } from "./review-view";

const VIEWS: readonly { readonly view: ReviewView; readonly label: string }[] =
  [
    { view: "current", label: "Current" },
    { view: "in_progress", label: "In progress" },
    { view: "completed", label: "Completed" },
    { view: "archived", label: "Archived" },
  ];

const SORTS = [
  { value: "recent", label: "Recently updated" },
  { value: "period", label: "Period" },
] as const;

function hrefFor(
  searchParams: URLSearchParams,
  changes: Record<string, string | null>,
): string {
  const next = new URLSearchParams(searchParams);
  for (const [key, value] of Object.entries(changes)) {
    if (value) next.set(key, value);
    else next.delete(key);
  }
  next.delete("cursor");
  const qs = next.toString();
  return qs ? `/reviews?${qs}` : "/reviews";
}

function cardMeta(
  review: ReviewsCollectionData["reviews"][number],
): CardMetaItem[] {
  const metadata: CardMetaItem[] = [
    { id: "period", label: "Period", value: review.periodLabel },
    { id: "updated", label: "Updated", value: review.updatedLabel },
  ];
  if (review.completedAt) {
    metadata.push({
      id: "completed",
      label: "Completed",
      value: review.completedLabel,
    });
  }
  metadata.push({
    id: "authored",
    label: "Reflection",
    value: review.completionLabel,
  });
  return metadata;
}

export function ReviewsCollectionView({
  data,
}: {
  readonly data: ReviewsCollectionData;
}) {
  const [searchParams, setSearchParams] = useSearchParams();

  // `/reviews` plus the current filters, minus any cursor — so a "Load more"
  // resumes the same view rather than the unfiltered default.
  const path = useMemo(() => {
    const params = new URLSearchParams(searchParams);
    params.delete("cursor");
    const qs = params.toString();
    return qs ? `/reviews?${qs}` : "/reviews";
  }, [searchParams]);

  const pagination = useKeysetPagination<
    ReviewsCollectionData["reviews"][number],
    ReviewsCollectionData
  >({
    firstPage: data.reviews,
    initialCursor: data.hasMore ? data.nextCursor : null,
    path,
    select: selectReviewsPage,
    getId: reviewId,
  });

  const filtersActive =
    data.view !== "current" || data.query.length > 0 || data.type !== "all";

  const viewSwitcher = (
    <nav className="dh-reviews-views" aria-label="Review views">
      {VIEWS.map((view) => (
        <Link
          key={view.view}
          to={hrefFor(searchParams, {
            view: view.view === "current" ? null : view.view,
          })}
          className="dh-reviews-views__link"
          aria-current={data.view === view.view ? "page" : undefined}
        >
          {view.label}
        </Link>
      ))}
    </nav>
  );

  const filterBar = (
    <div className="dh-reviews-filters">
      <label className="dh-reviews-filters__field">
        <span className="dh-visually-hidden">Search reviews</span>
        <input
          type="search"
          className="dh-input"
          placeholder="Search reviews…"
          defaultValue={data.query}
          aria-label="Search reviews"
          onChange={(event) => {
            setSearchParams(
              (prev) => {
                const next = new URLSearchParams(prev);
                const value = event.currentTarget.value.trim();
                if (value) next.set("q", value);
                else next.delete("q");
                next.delete("cursor");
                return next;
              },
              { replace: true, preventScrollReset: true },
            );
          }}
        />
      </label>
      <label className="dh-reviews-filters__field">
        <span className="dh-reviews-filters__label">Type</span>
        <select
          className="dh-select"
          value={data.type}
          onChange={(event) =>
            setSearchParams(
              (prev) => {
                const next = new URLSearchParams(prev);
                if (event.currentTarget.value === "all") next.delete("type");
                else next.set("type", event.currentTarget.value);
                next.delete("cursor");
                return next;
              },
              { replace: true, preventScrollReset: true },
            )
          }
        >
          <option value="all">All types</option>
          {REVIEW_TYPES.map((type) => (
            <option key={type} value={type}>
              {REVIEW_TYPE_LABELS[type as ReviewType]}
            </option>
          ))}
        </select>
      </label>
      <label className="dh-reviews-filters__field">
        <span className="dh-reviews-filters__label">Sort</span>
        <select
          className="dh-select"
          value={data.sort}
          onChange={(event) =>
            setSearchParams(
              (prev) => {
                const next = new URLSearchParams(prev);
                if (event.currentTarget.value === "recent") next.delete("sort");
                else next.set("sort", event.currentTarget.value);
                next.delete("cursor");
                return next;
              },
              { replace: true, preventScrollReset: true },
            )
          }
        >
          {SORTS.map((sort) => (
            <option key={sort.value} value={sort.value}>
              {sort.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );

  // PX-06: the ONE shared collection loading signal — a same-route navigation
  // (a filter, a view, a page) shows the shared skeleton instead of leaving the
  // previous list on screen with no feedback.
  const isReloading = useCollectionLoading();
  return (
    <CollectionLayout
      isLoading={isReloading}
      title="Reviews"
      entityType="review"
      subtitle="Reflect on the period, close loops and plan what matters next."
      viewSwitcher={viewSwitcher}
      primaryAction={
        <Link className="dh-btn dh-btn--primary" to="/reviews/new">
          New Review
        </Link>
      }
      filterBar={filterBar}
      error={
        data.failed ? (
          <EmptyState
            icon={<EntityIcon type="review" />}
            title="Reviews could not be loaded"
            description="Try again in a moment."
          />
        ) : undefined
      }
      isEmpty={!data.failed && pagination.items.length === 0 && !filtersActive}
      emptySlot={
        <EmptyState
          icon={<EntityIcon type="review" />}
          title="No Reviews yet"
          description="Start a weekly, monthly, quarterly, annual or custom review."
          primaryAction={
            <Link className="dh-btn dh-btn--primary" to="/reviews/new">
              New Review
            </Link>
          }
          // HELP-01 — "what is a Review actually for?" is the question standing
          // between an empty list and a first entry. Answer it rather than only
          // offering the button.
          secondaryAction={
            <Link
              className="dh-btn dh-btn--secondary"
              to={helpTopicHref("reviews")}
            >
              What Reviews are for
            </Link>
          }
        />
      }
      isFilteredEmpty={
        !data.failed && pagination.items.length === 0 && filtersActive
      }
      filteredEmptySlot={
        <EmptyState
          icon={<EntityIcon type="review" />}
          title="No matching Reviews"
          description="Adjust the search or filters to widen the view."
        />
      }
      className="dh-reviews"
    >
      <CardCollection
        ariaLabel="Reviews"
        items={pagination.items}
        getItemId={(review) => review.id}
        renderCard={(review) => (
          <Card
            key={review.id}
            id={review.id}
            title={review.title}
            headingLevel={2}
            typeLabel={review.typeLabel}
            icon={<EntityIcon type="review" />}
            subtitle={review.periodLabel}
            status={{
              label: review.archived
                ? `Archived · ${review.statusLabel}`
                : review.statusLabel,
              tone: review.archived
                ? "warning"
                : review.status === "completed"
                  ? "success"
                  : review.status === "in_progress"
                    ? "info"
                    : "neutral",
            }}
            metadata={cardMeta(review)}
            href={`/reviews/${encodeURIComponent(review.id)}`}
            openAriaLabel={`Open ${review.title}`}
          />
        )}
      />
      {pagination.hasMore ? (
        <LoadMore
          loading={pagination.loading}
          loadFailed={pagination.loadFailed}
          onLoadMore={pagination.loadMore}
          label="Load more Reviews"
        />
      ) : null}
    </CollectionLayout>
  );
}

/** Stable module-level selectors, so the shared hook's memo identity is stable. */
function selectReviewsPage(data: ReviewsCollectionData) {
  return {
    items: data.reviews,
    nextCursor: data.nextCursor,
    failed: data.failed,
  };
}

function reviewId(review: ReviewsCollectionData["reviews"][number]): string {
  return review.id;
}
