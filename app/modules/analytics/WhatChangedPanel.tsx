/**
 * V2.9 INS-04 — "What changed", on the Insight page.
 *
 * The figures above this panel say HOW MUCH happened in the window. This says
 * WHAT happened in it, and it is the same window: the panel asks
 * `/analytics/activity?window=…`, which resolves the parameter through the very
 * parser the page's own loader uses, so the list and the charts can never be
 * describing different periods.
 *
 * It is the ONE shared DS-05 feed (`ActivityFeed` over `ActivityStream`), not a
 * second list: day headings, keyset paging, virtualisation above a threshold,
 * referenced records opening in the shared Drawer, and the calm retryable error
 * state all come from there. This file supplies a page loader and nothing else.
 *
 * The bound is REAL and is stated: a window holds far more events than a panel
 * should render, so the feed loads 30 at a time and says "Load more" while
 * there are more — never a total that would imply the list is complete
 * (ADR-079 decision 11).
 */

import { useCallback } from "react";

import type { InsightWindowId } from "~/kernel/analytics";
import { ActivityFeed } from "~/shared/activity-feed";
import type { ActivityStreamPage } from "~/shared/activity-feed/types";
import { DashboardCard } from "~/shared/card";

import type { InsightActivityPage } from "./activity-feed";

export function WhatChangedPanel({
  window: windowId,
  rangeLabel,
}: {
  readonly window: InsightWindowId;
  /** The span in the owner's own words, so the panel names its period. */
  readonly rangeLabel: string;
}) {
  /*
   * The loader identity depends on the WINDOW, so choosing a different one
   * resets the stream rather than appending a second period's events beneath
   * the first — which is also why the cursor is bound to its window in the
   * kernel: a page of one fortnight cannot be continued into another.
   */
  const loadPage = useCallback(
    async (cursor: string | null): Promise<ActivityStreamPage> => {
      const params = new URLSearchParams({ window: windowId });
      if (cursor !== null) params.set("cursor", cursor);
      const response = await fetch(`/analytics/activity?${params.toString()}`, {
        headers: { accept: "application/json" },
      });
      if (!response.ok) {
        // The shared stream turns a rejection into its retryable error state,
        // which is the right answer here: nothing in the workspace changed, and
        // the figures above this panel are unaffected.
        throw new Error(`Activity request failed: ${response.status}`);
      }
      const page = (await response.json()) as InsightActivityPage;
      return {
        items: page.items.map((item) => ({
          ...item,
          occurredAt: new Date(item.occurredAt),
        })),
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
      };
    },
    [windowId],
  );

  return (
    <DashboardCard
      className="dh-analytics__changed"
      title="What changed"
      supporting={rangeLabel}
      density="standard"
    >
      <ActivityFeed
        loadPage={loadPage}
        ariaLabel={`What changed, ${rangeLabel}`}
        maxHeight="28rem"
        /*
         * The card's own title is an `h2` (the `DashboardCard` default under
         * the page's `h1`), so the day headings inside it are `h3`. An `h4`
         * here skips a level and axe is right to say so.
         */
        dayHeadingLevel={3}
      />
    </DashboardCard>
  );
}
