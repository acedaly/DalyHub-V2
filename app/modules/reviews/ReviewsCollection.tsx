/**
 * UIX-05 — the Reviews collection.
 *
 * ── What was wrong ──────────────────────────────────────────────────────────
 * Reviews rendered through the generic shared `Card`: the Review entity glyph,
 * the title, the period as a grey subtitle, a filled status pill beside the
 * title, and three metadata facts — "Updated 2 August", "Completed 2 August",
 * "3 of 6 sections authored" — all at one weight.
 *
 * Three specific defects:
 *
 * 1. **A Review was identified by its NAME.** Titles are derived from the
 *    period in most workspaces, so a gallery printed "Weekly review" eight times
 *    down the page and put the one distinguishing fact — WHICH week — in the
 *    subtitle at body-small grey.
 * 2. **The measure was a metadata fact.** How much of a Review has been written
 *    is the only bounded proportion a Review has, and it sat third in a run.
 * 3. **Continuing was invisible.** A half-finished Review's whole purpose is to
 *    be finished, and reaching REVIEW-02's guided flow meant opening the record
 *    and finding the control there.
 *
 * ── What this is now ────────────────────────────────────────────────────────
 * A gallery of `ReviewCard`s (`~/shared/card/ReviewCard.tsx`): the cadence as an
 * eyebrow, the PERIOD as the heading in tabular figures, the record's own name
 * demoted beneath it and dropped entirely when it says nothing the period does
 * not, the reflection as the shared 8px bar with an exact fraction, and one
 * state line. A Review that is not finished carries a "Continue" control
 * straight into the guided flow.
 *
 * The four scopes, the type filter, the sort and the cursor are unchanged: all
 * URL-backed, all applied server-side over the full collection.
 */

import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";

import {
  REVIEW_TYPES,
  type ReviewType,
  type ReviewView,
} from "~/kernel/reviews";
import { EntityCardGrid, ReviewCard, type ReviewCardTone } from "~/shared/card";
import {
  collectionCountLabel,
  CollectionLayout,
  CreateActionLabel,
  SortMenu,
  useCollectionLoading,
} from "~/shared/collection-layout";
import { EmptyState } from "~/shared/empty-state";
import { helpTopicHref } from "~/shared/help";
import { EntityIcon } from "~/shared/entity";
import { LoadMore, useKeysetPagination } from "~/shared/load-more";
import { ViewSwitcher } from "~/shared/view-switcher";

import type { ReviewsCollectionData } from "./review-collection-data";
import { REVIEW_TYPE_LABELS } from "./review-view";

const VIEWS: readonly { readonly view: ReviewView; readonly label: string }[] =
  [
    { view: "current", label: "Current" },
    { view: "in_progress", label: "In progress" },
    { view: "completed", label: "Completed" },
    { view: "archived", label: "Archived" },
  ];

/*
 * DHDS-09 — the option is the VALUE; the shared control says the dimension.
 *
 * UIX-06 put "Sort:" inside every option because a bare native `<select>` has
 * nowhere else to put the field's name once its visible label is removed. The
 * shared `SortMenu` states it once on the trigger, so the options go back to
 * being what they are and a screen reader hears the name once.
 */
const SORTS = [
  { value: "recent", label: "Recently updated" },
  { value: "period", label: "Period" },
] as const;

type SerializedReviewRow = ReviewsCollectionData["reviews"][number];

const VIEW_NOUNS: Readonly<Record<ReviewView, string>> = {
  current: "current",
  in_progress: "in progress",
  completed: "completed",
  archived: "archived",
};

/** "3 current Reviews", and honest about the page bound while more remain. */
function reviewCount(
  loaded: number,
  view: ReviewView,
  hasMore: boolean,
): string {
  return collectionCountLabel(loaded, "Review", "Reviews", {
    hasMore,
    scope: VIEW_NOUNS[view],
  });
}

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

/**
 * The card's title slot, or `null`.
 *
 * `defaultReviewTitle` produces "Weekly Review — 27 Jul–2 Aug 2026", so a
 * workspace that has never renamed a Review shows the cadence and the period
 * twice on every card: once in the eyebrow and heading, where they belong, and
 * once more as a title. The card drops the title when it is that derived form,
 * and keeps it when the owner has given the Review a name of their own —
 * because that is how they will look for it.
 *
 * The test is the derived PREFIX rather than the whole string, because the
 * default title's date range is formatted compactly and the heading's is not, so
 * the two are the same fact in two spellings and can never be compared whole.
 * Inferring from the title rather than storing a "was renamed" flag is both
 * honest and self-correcting: rename a Review and the name appears; rename it
 * back and it goes.
 */
function displayTitle(review: SerializedReviewRow): string | null {
  const derivedPrefix = `${review.typeLabel} review — `.toLocaleLowerCase();
  const actual = review.title.trim().toLocaleLowerCase();
  return actual.startsWith(derivedPrefix) ? null : review.title;
}

/**
 * The one state line, and its tone.
 *
 * A COMPLETED Review says when it was completed, because that is the fact that
 * matters afterwards; an open one says what it is and when it last moved. The
 * archived case leads with the word "Archived", because that is the thing that
 * explains why the Review is not in the list the owner expected.
 */
function stateLine(review: SerializedReviewRow): {
  text: string;
  tone: ReviewCardTone;
} {
  if (review.archived) {
    return {
      text: `Archived · ${review.statusLabel.toLocaleLowerCase()}`,
      tone: "neutral",
    };
  }
  if (review.status === "completed") {
    return {
      text: `Completed ${review.completedLabel}`,
      tone: "success",
    };
  }
  return {
    text: `${review.statusLabel} · updated ${review.updatedLabel}`,
    tone: review.status === "in_progress" ? "info" : "neutral",
  };
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
    SerializedReviewRow,
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

  // UIQ-013 — the four Review scopes are the collection's principal MODE (one
  // is always active), so they are the ONE shared view switcher.
  const viewSwitcher = (
    <ViewSwitcher
      options={VIEWS.map((view) => ({
        value: view.view,
        label: view.label,
        href: hrefFor(searchParams, {
          view: view.view === "current" ? null : view.view,
        }),
      }))}
      value={data.view}
      label="Review views"
    />
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
      {/*
       * UIX-06 — the dimension is named by the VALUE, not by a label above it.
       *
       * Two stacked labels pushed the two selects a row below the search field
       * beside them, so a three-control bar had two baselines and three heights.
       * "Every cadence" and "Sort: …" already say what each control is, which is
       * the rule this collection's own search field has followed since UIX-04;
       * the label element stays, visually hidden, so nothing is lost to a screen
       * reader.
       */}
      <label className="dh-reviews-filters__field">
        <span className="dh-visually-hidden">Cadence</span>
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
          <option value="all">Every cadence</option>
          {REVIEW_TYPES.map((type) => (
            <option key={type} value={type}>
              {REVIEW_TYPE_LABELS[type as ReviewType]}
            </option>
          ))}
        </select>
      </label>
      {/*
       * DHDS-09 — the shared sort control.
       *
       * This was a bare native `<select>` with "Sort:" repeated inside each of
       * its two options, beside a Meetings collection whose identical control
       * used a different class and a People collection that used a third. The
       * shared control states the dimension once on its trigger, opens the
       * product's one menu grammar, and sits at the control rung beside the
       * search field rather than at the browser's own.
       */}
      <SortMenu
        subject="reviews"
        value={data.sort}
        options={SORTS}
        onSelect={(next) =>
          setSearchParams(
            (prev) => {
              const params = new URLSearchParams(prev);
              if (next === "recent") params.delete("sort");
              else params.set("sort", next);
              params.delete("cursor");
              return params;
            },
            { replace: true, preventScrollReset: true },
          )
        }
      />
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
      /*
       * A COUNT, not a sentence.
       *
       * The sentence ("Reflect on the period, close loops and plan what matters
       * next.") is good copy in the wrong slot: at 1280 it took enough of the
       * header's track that the view rail and "New Review" could not share the
       * row with the title, so the primary action wrapped to a line of its own —
       * the exact geometry UIQ-013 asserts against on every other collection.
       * Every other collection's subtitle is its scope and its count, and this is
       * now one too. The sentence itself lives in the empty state, which is where
       * someone actually needs to be told what a Review is for.
       */
      subtitle={reviewCount(pagination.items.length, data.view, data.hasMore)}
      presentation="grid"
      viewSwitcher={viewSwitcher}
      primaryAction={
        <Link className="dh-btn dh-btn--primary" to="/reviews/new">
          <CreateActionLabel>New review</CreateActionLabel>
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
              <CreateActionLabel>New review</CreateActionLabel>
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
      <EntityCardGrid label="Reviews">
        {pagination.items.map((review) => {
          const finished = review.status === "completed";
          return (
            <ReviewCard
              key={review.id}
              headingLevel={2}
              cadence={review.typeLabel}
              period={review.periodLabel}
              title={displayTitle(review)}
              // Rule 3: a completed Review draws no bar. The question "how much
              // is written?" has stopped being live, and a wall of full bars is
              // a gallery with nothing to scan.
              reflection={
                finished
                  ? undefined
                  : {
                      authored: review.authoredSections,
                      total: review.totalSections,
                      valueText: review.completionLabel,
                    }
              }
              state={stateLine(review)}
              action={
                finished || review.archived ? undefined : (
                  <Link
                    /* Outlined, not filled. A filled control was the loudest
                     * thing on a card whose job is to be recognised by its
                     * PERIOD — the same finding D24 made about the Project
                     * card's status pill. An outline is unmistakably a control
                     * and still lets the date range lead. */
                    className="dh-btn dh-btn--outlined dh-btn--sm"
                    to={`/reviews/${encodeURIComponent(review.id)}/guide`}
                  >
                    {review.authoredSections === 0 ? "Start" : "Continue"}
                    <span className="dh-visually-hidden">
                      {` ${review.typeLabel} review, ${review.periodLabel}`}
                    </span>
                  </Link>
                )
              }
              muted={review.archived}
              href={`/reviews/${encodeURIComponent(review.id)}`}
              /*
               * The link's accessible name states the NAME when the owner gave
               * the Review one, and the cadence-and-period when they did not.
               *
               * The visible heading is a date range in both cases, so "Open 27
               * July – 2 August 2026" alone never says what kind of thing opens
               * — hence the cadence. But a Review the owner renamed
               * ("Post-Ekka reset") has to be findable by that name, from
               * search and from a screen reader's link list alike, and the
               * card's own title line is a `<p>` rather than the link. Naming
               * the link by the period only would have made a renamed Review
               * unreachable by its name.
               */
              openAriaLabel={
                displayTitle(review)
                  ? `Open ${review.title} — ${review.typeLabel} review, ${review.periodLabel}`
                  : `Open ${review.typeLabel} review — ${review.periodLabel}`
              }
            />
          );
        })}
      </EntityCardGrid>
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

function reviewId(review: SerializedReviewRow): string {
  return review.id;
}
