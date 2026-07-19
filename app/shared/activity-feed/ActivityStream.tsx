/**
 * DS-05 — the ONE shared Timeline / Activity Feed renderer.
 *
 * Timeline (record-scoped) and Activity Feed (workspace/scope) are two
 * CONFIGURATIONS of this single component, not separate implementations — they
 * differ only in the `loadPage` they are given and their accessible label. It:
 *   - drives cursor pagination via `useActivityStream` (dedup + deterministic
 *     merge, load-more, retry, end-of-feed);
 *   - applies the shared DS-07 filter expression over loaded items;
 *   - groups events under accessible day headings and renders each through the ONE
 *     `ActivityEventItem`;
 *   - virtualises long streams with `useActivityWindow` inside a bounded scroll
 *     region so thousands of events stay smooth;
 *   - shows the loading / empty / filtered-empty / error+retry / end states,
 *     reusing the shared EmptyState, Skeleton and DS-07 FilterEmptyState;
 *   - announces newly-loaded events to assistive tech.
 *
 * It exposes NO repository, D1 binding, cursor internals or workspace control — the
 * route owns those behind `loadPage`.
 */

import { useMemo, useRef, type ReactNode } from "react";

import { filterRecords } from "~/shared/filters/model";
import type {
  FilterExpression,
  FilterFieldRegistry,
} from "~/shared/filters/model";
import { FilterEmptyState } from "~/shared/filters";
import { EmptyState } from "~/shared/empty-state";
import { CollectionSkeleton } from "~/shared/skeleton";

import { ActivityDayHeading } from "./ActivityDayHeading";
import { ActivityEventItem, type RenderEntityLink } from "./ActivityEventItem";
import { buildActivityRows } from "./activity-grouping";
import { defaultActivityDateFormatter } from "./activity-dates";
import { useActivityStream } from "./use-activity-stream";
import { useActivityWindow } from "./use-activity-window";
import type {
  ActivityDateFormatter,
  ActivityPageLoader,
  ActivityRow,
} from "./types";

const HEADING_ESTIMATE = 44;
const ITEM_ESTIMATE = 76;
const DEFAULT_VIRTUALIZE_THRESHOLD = 30;

export interface ActivityStreamProps {
  /** Loads a page for the configured scope (Timeline or Feed). */
  readonly loadPage: ActivityPageLoader;
  /** Accessible name for the feed region (required). */
  readonly ariaLabel: string;
  readonly scope?: "timeline" | "feed";
  readonly formatter?: ActivityDateFormatter;
  /** DS-07 field registry over the ActivityItem view-model (enables filtering). */
  readonly filterFields?: FilterFieldRegistry;
  /** The controlled DS-07 filter expression (from the route's URL state). */
  readonly filterExpression?: FilterExpression;
  /** Recovery for the filtered-empty state (clears the DS-07 filters). */
  readonly onClearFilters?: () => void;
  /** Entity-link renderer; defaults to opening the DS-03 Drawer. */
  readonly renderEntityLink?: RenderEntityLink;
  /** The genuinely-empty state content. Defaults to a calm shared EmptyState. */
  readonly emptyState?: ReactNode;
  readonly loadMoreLabel?: string;
  readonly virtualization?: "auto" | "off";
  readonly virtualizeThreshold?: number;
  readonly overscan?: number;
  /** Bounded scroll-region height (any CSS length). Default `"36rem"`. */
  readonly maxHeight?: string;
  /** Heading level for day headings (document outline). Default 3. */
  readonly dayHeadingLevel?: 2 | 3 | 4;
}

export function ActivityStream(props: ActivityStreamProps): ReactNode {
  const {
    loadPage,
    ariaLabel,
    scope = "feed",
    filterFields,
    filterExpression,
    onClearFilters,
    renderEntityLink,
    emptyState,
    loadMoreLabel = "Load more activity",
    virtualization = "auto",
    virtualizeThreshold = DEFAULT_VIRTUALIZE_THRESHOLD,
    overscan,
    maxHeight = "36rem",
    dayHeadingLevel = 3,
  } = props;

  const formatter = props.formatter ?? defaultActivityDateFormatter;

  const stream = useActivityStream({ loadPage });

  const isFilterActive =
    filterFields !== undefined &&
    filterExpression !== undefined &&
    filterExpression.clauses.length > 0;

  const visibleItems = useMemo(() => {
    if (!isFilterActive || !filterFields || !filterExpression) {
      return stream.items;
    }
    return filterRecords(filterFields, filterExpression, [...stream.items]);
  }, [isFilterActive, filterFields, filterExpression, stream.items]);

  const rows = useMemo<ActivityRow[]>(
    () => buildActivityRows(visibleItems, formatter),
    [visibleItems, formatter],
  );

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const rowKeys = useMemo(() => rows.map((row) => row.key), [rows]);
  const estimateRowHeight = useMemo(() => {
    return (index: number) =>
      rows[index]?.kind === "heading" ? HEADING_ESTIMATE : ITEM_ESTIMATE;
  }, [rows]);

  const virtualizationEnabled =
    virtualization !== "off" &&
    rows.length > virtualizeThreshold &&
    typeof window !== "undefined";

  const windowState = useActivityWindow({
    rowKeys,
    estimateRowHeight,
    overscan,
    enabled: virtualizationEnabled,
    scrollElementRef: scrollRef,
  });

  const genuinelyEmpty = stream.hasLoaded && stream.items.length === 0;
  const filteredEmpty =
    stream.hasLoaded &&
    stream.items.length > 0 &&
    visibleItems.length === 0 &&
    isFilterActive;
  const initialError =
    stream.error !== null &&
    stream.errorPhase === "initial" &&
    stream.items.length === 0;
  const showInitialLoading =
    stream.isLoadingInitial && stream.items.length === 0;
  const showingFeed =
    !genuinelyEmpty && !filteredEmpty && !initialError && !showInitialLoading;

  const renderRow = (row: ActivityRow): ReactNode => {
    if (row.kind === "heading") {
      return (
        <div key={row.key} ref={windowState.rowRef(row.key)}>
          <ActivityDayHeading label={row.dayLabel} level={dayHeadingLevel} />
        </div>
      );
    }
    return (
      <div key={row.key} ref={windowState.rowRef(row.key)}>
        <ActivityEventItem
          item={row.item}
          formatter={formatter}
          posInSet={row.posInSet}
          setSize={row.setSize}
          renderEntityLink={renderEntityLink}
        />
      </div>
    );
  };

  const windowedRows = rows.slice(windowState.startIndex, windowState.endIndex);

  const footer = renderFooter();

  function renderFooter(): ReactNode {
    if (!stream.hasLoaded && !stream.isLoadingMore) {
      return null;
    }
    if (stream.error !== null && stream.errorPhase === "more") {
      return (
        <div className="dh-activity__footer" role="alert">
          <p className="dh-activity__error-text">
            Couldn&apos;t load more activity.
          </p>
          <button
            type="button"
            className="dh-activity__btn"
            onClick={stream.retry}
          >
            Try again
          </button>
        </div>
      );
    }
    if (stream.isLoadingMore) {
      return (
        <div className="dh-activity__footer" aria-hidden="true">
          <span className="dh-activity__loading-more">Loading more…</span>
        </div>
      );
    }
    if (stream.hasMore) {
      return (
        <div className="dh-activity__footer">
          <button
            type="button"
            className="dh-activity__btn dh-activity__btn--load-more"
            onClick={stream.loadMore}
          >
            {loadMoreLabel}
          </button>
        </div>
      );
    }
    if (stream.items.length > 0) {
      return (
        <div className="dh-activity__footer">
          <p className="dh-activity__end">You&apos;ve reached the beginning.</p>
        </div>
      );
    }
    return null;
  }

  return (
    <section className="dh-activity" data-scope={scope}>
      <div
        ref={scrollRef}
        className="dh-activity__viewport"
        style={{ maxHeight }}
        {...(showingFeed
          ? {
              role: "feed",
              "aria-label": ariaLabel,
              "aria-busy": stream.isLoadingMore || undefined,
            }
          : { "aria-label": ariaLabel })}
      >
        {initialError ? (
          <div className="dh-activity__state" role="alert">
            <p className="dh-activity__error-text">
              Couldn&apos;t load activity.
            </p>
            <button
              type="button"
              className="dh-activity__btn"
              onClick={stream.retry}
            >
              Try again
            </button>
          </div>
        ) : showInitialLoading ? (
          <div className="dh-activity__state" aria-busy="true">
            <CollectionSkeleton count={5} presentation="list" />
          </div>
        ) : genuinelyEmpty ? (
          <div className="dh-activity__state">
            {emptyState ?? (
              <EmptyState
                title="No activity yet"
                description="When something happens here, it will show up on this timeline."
                headingLevel={3}
              />
            )}
          </div>
        ) : filteredEmpty ? (
          <div className="dh-activity__state">
            <FilterEmptyState
              variant="filtered"
              title="No activity matches your filters"
              description="Try removing a filter to see more events."
              onClearFilters={onClearFilters}
            />
          </div>
        ) : (
          <div
            className="dh-activity__canvas"
            style={
              windowState.isVirtualized
                ? { height: windowState.totalHeight }
                : undefined
            }
          >
            {windowState.isVirtualized ? (
              <div
                style={{ height: windowState.paddingTop }}
                aria-hidden="true"
              />
            ) : null}
            {windowedRows.map(renderRow)}
            {windowState.isVirtualized ? (
              <div
                style={{ height: windowState.paddingBottom }}
                aria-hidden="true"
              />
            ) : null}
          </div>
        )}
        {!initialError && !showInitialLoading ? footer : null}
      </div>
      <div className="dh-visually-hidden" role="status" aria-live="polite">
        {stream.announcement}
      </div>
    </section>
  );
}
