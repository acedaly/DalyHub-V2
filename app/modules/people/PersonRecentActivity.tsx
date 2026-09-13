/**
 * UNTITLED-13 — the recent relationship activity band on a Person's workspace.
 *
 * §28 asks the Person record to carry a shared activity composition, and §29
 * asks it to express real relationships rather than record maintenance. Both
 * were already true of the Activity tab; what was missing is that the tab which
 * OPENS carried none of it, so "when did we last actually do something
 * together?" was a click away on the surface built to answer it.
 *
 * ── It is the same stream, read short ───────────────────────────────────────
 *
 * This mounts the shared DS-05 `Timeline` over the SAME one
 * `/person/:id/activity` endpoint the Activity tab reads — no second endpoint,
 * no second projection, no per-surface filtering of what counts as a moment.
 * The kernel's own vocabulary already does §29's work: `person.updated` and
 * every `*.updated` maintenance event are excluded from a relationship's
 * interactions on purpose (see `person-relationship.ts`), so fixing a phone
 * number never shows up here as contact.
 *
 * The differences from the tab are two, and both are about being a BAND rather
 * than a page:
 *
 *   - no filter bar. A filter that narrows five rows is chrome; the tab has the
 *     real one, and this band links to it;
 *   - a short viewport. The shared `Timeline` paginates inside its own scroll
 *     region, so a bounded height is what makes this a preview rather than a
 *     second copy of the tab.
 *
 * A record's tab panels are mounted one at a time (Phase 4), so this reads its
 * first page only while the workspace is open, and the Activity tab's own read
 * happens only when that tab is.
 */

import { useCallback } from "react";
import { Link } from "react-router";

import { Timeline } from "~/shared/activity-feed";
import type { ActivityStreamPage } from "~/shared/activity-feed/model";
import { SectionHeading } from "~/shared/ui/untitled/overrides/section-heading";

import type { PersonActivityPage } from "./person-activity";

export interface PersonRecentActivityProps {
  readonly personId: string;
  /** Bumps to force a re-read after a mutation appends an event. */
  readonly reloadKey: string;
  /** The Activity tab — where the whole history, and its filters, live. */
  readonly allHref: string;
}

export function PersonRecentActivity({
  personId,
  reloadKey,
  allHref,
}: PersonRecentActivityProps) {
  const loadPage = useCallback(
    async (cursor: string | null): Promise<ActivityStreamPage> => {
      // `reloadKey` participates so a save re-creates this loader and the
      // Timeline re-reads its first page with the new event visible.
      void reloadKey;
      const url = new URL(
        `/person/${encodeURIComponent(personId)}/activity`,
        window.location.origin,
      );
      if (cursor) url.searchParams.set("cursor", cursor);
      const response = await fetch(url, {
        headers: { accept: "application/json" },
      });
      if (!response.ok) throw new Error("Failed to load activity");
      const data = (await response.json()) as Partial<PersonActivityPage> & {
        readonly error?: string;
      };
      if (data.error || !data.items) throw new Error("Failed to load activity");
      return {
        items: data.items.map((item) => ({
          ...item,
          occurredAt: new Date(item.occurredAt),
        })),
        nextCursor: data.nextCursor ?? null,
        hasMore: data.hasMore ?? false,
      };
    },
    [personId, reloadKey],
  );

  return (
    <section className="dh-person-recent flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <SectionHeading
          level={2}
          title="Recent activity"
          description="Meetings, notes, commitments and diary entries you share."
        />
        {/*
          A real link, not a "view all" button: it navigates, so a middle click
          opens the Activity tab in a new tab and Back returns here (§36).
        */}
        <Link
          to={allHref}
          className="inline-flex shrink-0 items-center text-sm font-semibold text-brand-secondary outline-focus-ring [@media(hover:none)]:min-h-[var(--app-touch-target-min)] hover:text-brand-secondary_hover focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          All activity
        </Link>
      </div>
      <Timeline
        loadPage={loadPage}
        ariaLabel="Recent relationship activity"
        /*
         * Short enough to be a preview and tall enough to show the handful of
         * moments that answer "what have we been doing?" — about five rows of
         * the shared stream's own density. The tab is where the rest lives.
         */
        maxHeight="20rem"
        dayHeadingLevel={3}
        emptyState={
          <p className="m-0 text-sm text-tertiary">
            Nothing shared yet. Link a task, note, meeting or diary entry to
            this person and it will appear here.
          </p>
        }
      />
    </section>
  );
}
