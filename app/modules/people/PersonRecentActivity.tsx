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
 * no second projection, no second cursor.
 *
 * The differences from the tab are three, and all are about being a BAND rather
 * than a page:
 *
 *   - no filter bar. A filter that narrows five rows is chrome; the tab has the
 *     real one, and this band links to it;
 *   - a short viewport. The shared `Timeline` paginates inside its own scroll
 *     region, so a bounded height is what makes this a preview rather than a
 *     second copy of the tab;
 *   - only INTERACTIONS. See below — this is the whole reason the band exists.
 *
 * ── Why the preview reads fewer rows than the tab ───────────────────────────
 *
 * The endpoint is the Person's whole history, maintenance included:
 * `listForEntities` takes no type predicate (`ListEntityActivityInput` filters
 * one type at a time, which is no use for a set of ten), and the Person
 * descriptor map deliberately names `person.updated` so the tab can render it.
 * That is right for the TAB, whose job is the complete record.
 *
 * It is wrong for a five-row band whose heading promises "meetings, notes,
 * commitments and diary entries you share". A meeting autosave or a corrected
 * phone number would push the actual shared moments off the visible rows and
 * answer "what have we been doing together?" with a list of edits.
 *
 * So the band reads the same page and shows only the kernel's own interaction
 * vocabulary from it — `INTERACTION_ACTIVITY_TYPES`, the exact set the
 * relationship model counts as contact (`person-relationship.ts`), not a second
 * opinion invented here. A module that starts contributing real contact joins
 * that list and appears in this band on the same day it appears in the
 * relationship facts.
 *
 * Paging stays the ENDPOINT's: the cursor and `hasMore` are passed through
 * untouched. The one concession is that a page filtered down to nothing is
 * chased — a run of maintenance events must not make a band with a meeting two
 * pages back claim there is nothing shared yet.
 *
 * That chase is BOUNDED, and the bound has a consequence the band has to be
 * honest about: three pages of pure maintenance with an interaction behind them
 * leaves this with no rows AND more to read. "Nothing shared yet. Link a task…"
 * would then be false twice over — it reports an empty relationship that is not
 * empty, and it teaches an action the person does not need, beside a working
 * "Load more" that would show them the truth. So the empty state says which of
 * the two situations it is in.
 *
 * A record's tab panels are mounted one at a time (Phase 4), so this reads its
 * first page only while the workspace is open, and the Activity tab's own read
 * happens only when that tab is.
 */

import { useCallback, useState } from "react";
import { Link } from "react-router";

import { INTERACTION_ACTIVITY_TYPES } from "~/kernel/relationships";
import { Timeline } from "~/shared/activity-feed";
import type {
  ActivityItem,
  ActivityStreamPage,
} from "~/shared/activity-feed/model";
import { SectionHeading } from "~/shared/ui/untitled/overrides/section-heading";

import type { PersonActivityPage } from "./person-activity";

/**
 * The relationship model's own vocabulary, as a set — the band shows exactly
 * what the relationship facts count as contact, and nothing else.
 */
const INTERACTIONS: ReadonlySet<string> = new Set(INTERACTION_ACTIVITY_TYPES);

function isInteraction(type: string): boolean {
  return INTERACTIONS.has(type);
}

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
  /*
   * True when the last read came back with no interactions AND the endpoint
   * still has pages. It changes what the empty state is allowed to claim; it
   * never changes what is fetched.
   */
  const [ranOutOfBudget, setRanOutOfBudget] = useState(false);

  const loadPage = useCallback(
    async (cursor: string | null): Promise<ActivityStreamPage> => {
      // `reloadKey` participates so a save re-creates this loader and the
      // Timeline re-reads its first page with the new event visible.
      void reloadKey;
      let next = cursor;
      /*
       * Chase at most this many pages for a single visible row. A Person with
       * genuinely nothing shared answers on the first read (no cursor, no
       * chase); this bound only covers the case where the most recent events
       * happen to be maintenance, and it keeps a pathological history from
       * turning one band into an unbounded crawl.
       */
      let budget = 3;
      const kept: ActivityItem[] = [];
      // Assigned on every pass of a loop whose body always runs at least once.
      let hasMore: boolean;
      do {
        const url = new URL(
          `/person/${encodeURIComponent(personId)}/activity`,
          window.location.origin,
        );
        if (next) url.searchParams.set("cursor", next);
        const response = await fetch(url, {
          headers: { accept: "application/json" },
        });
        if (!response.ok) throw new Error("Failed to load activity");
        const data = (await response.json()) as Partial<PersonActivityPage> & {
          readonly error?: string;
        };
        if (data.error || !data.items)
          throw new Error("Failed to load activity");
        for (const item of data.items) {
          if (!isInteraction(item.type)) continue;
          kept.push({ ...item, occurredAt: new Date(item.occurredAt) });
        }
        next = data.nextCursor ?? null;
        hasMore = (data.hasMore ?? false) && next !== null;
        budget -= 1;
      } while (kept.length === 0 && hasMore && budget > 0);

      setRanOutOfBudget(kept.length === 0 && hasMore);
      return { items: kept, nextCursor: next, hasMore };
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
          ranOutOfBudget ? (
            <p className="m-0 text-sm text-tertiary">
              Nothing shared in the most recent activity — only record edits.
              Load more to look further back, or open the Activity tab.
            </p>
          ) : (
            <p className="m-0 text-sm text-tertiary">
              Nothing shared yet. Link a task, note, meeting or diary entry to
              this person and it will appear here.
            </p>
          )
        }
      />
    </section>
  );
}
