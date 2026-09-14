/**
 * V2.9 INS-04 — "What happened", on the Insight page.
 *
 * ── UNTITLED-17 renamed it, and the collision is why ────────────────────────
 *
 * The page's second section is now called "What changed": the period's
 * completion figures and their comparisons, which is what that phrase means.
 * This section is the EVENTS — the individual things the owner did — and two
 * sections with one name on one page is a page a reader cannot navigate by
 * heading. "What happened" is also the more precise of the two for a feed: it
 * lists occurrences, not deltas.
 *
 * The figures above this section say HOW MUCH happened in the window. This says
 * WHAT happened in it, and it is the same window: the section asks
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
import { SectionHeading } from "~/shared/ui/untitled/overrides/section-heading";

import type { InsightActivityPage } from "./activity-feed";

export function WhatChangedPanel({
  window: windowId,
  rangeLabel,
  todayIso,
}: {
  readonly window: InsightWindowId;
  /** The span in the owner's own words, so the panel names its period. */
  readonly rangeLabel: string;
  /**
   * The day the page's figures were measured back from.
   *
   * Sent with every request, so a page left open across the owner's midnight
   * keeps asking for the period it is showing rather than silently sliding a
   * day — and so a "Load more" whose cursor is bound to that window is still
   * answerable. The route accepts it only for today or yesterday.
   */
  readonly todayIso: string;
}) {
  /*
   * The loader identity depends on the WINDOW, so choosing a different one
   * resets the stream rather than appending a second period's events beneath
   * the first — which is also why the cursor is bound to its window in the
   * kernel: a page of one fortnight cannot be continued into another.
   */
  const loadPage = useCallback(
    async (cursor: string | null): Promise<ActivityStreamPage> => {
      const params = new URLSearchParams({
        window: windowId,
        today: todayIso,
      });
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
    [windowId, todayIso],
  );

  /*
   * UNTITLED-17 — a SECTION of the page, not a card on it.
   *
   * This was a `DashboardCard`: a bounded box with its own surface, radius and
   * shadow, painted by `card-family.css`. Insight is now a run of flat sections
   * separated by hairline rules (Untitled's `dashboards-01/14` arrangement), so
   * a card here would be the one boxed thing on a page of unboxed ones — and
   * `DashboardCard` had no other consumer in the product once Insight stopped
   * drawing four of them, so the component and its paint went with this change.
   *
   * The feed keeps its own bounded viewport: it is a long list inside a page
   * that also scrolls, which is the one place a nested scroller earns its keep.
   */
  return (
    <section
      className="dh-analytics__changed flex min-w-0 flex-col gap-4 border-t border-secondary pt-8"
      aria-labelledby="insight-changed"
    >
      <SectionHeading
        id="insight-changed"
        level={2}
        size="md"
        title="What happened"
        description={rangeLabel}
      />
      {/*
       * The list is BOUNDED and says so where it is read: thirty at a time,
       * newest first, and "Load more" reaches further back. No total anywhere —
       * a bounded list stating one would claim a completeness it does not have
       * (ADR-079 d11).
       */}
      <p className="dh-analytics__changed-note">
        The most recent changes in this period, newest first, thirty at a time.
      </p>
      <ActivityFeed
        loadPage={loadPage}
        ariaLabel={`What happened, ${rangeLabel}`}
        maxHeight="28rem"
        /*
         * The section's own heading is an `h2` under the page's `h1`, so the day
         * headings inside it are `h3`. An `h4` here skips a level and axe is
         * right to say so.
         */
        dayHeadingLevel={3}
      />
    </section>
  );
}
