/**
 * The Meetings collection.
 *
 * UX-01 — pagination now uses the ONE shared `useKeysetPagination` hook. It used to
 * be a `Link` labelled "Load more" that NAVIGATED to the next page: the list was
 * replaced rather than extended, the owner lost their scroll position and the
 * label described behaviour the control did not have. Meetings and Reviews were the
 * only two collections that paginated that way; every other one accumulated. See
 * DEBT-45.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";

import {
  CollectionLayout,
  useCollectionLoading,
} from "~/shared/collection-layout";
import { EmptyState } from "~/shared/empty-state";
import { EntityIcon } from "~/shared/entity";
import { LoadMore, useKeysetPagination } from "~/shared/load-more";
import { ViewSwitcher } from "~/shared/view-switcher";

import { MeetingsList } from "./MeetingsList";
import type { SerializedMeeting } from "./meeting-view";

/** The loader payload each `/meetings/*` view returns. */
type MeetingsPageData = {
  readonly meetings: readonly SerializedMeeting[];
  readonly nextCursor: string | null;
  readonly failed: boolean;
};

const VIEW_LINKS = [
  { id: "upcoming", label: "Upcoming", href: "/meetings/upcoming" },
  { id: "recent", label: "Recent", href: "/meetings/recent" },
  { id: "archived", label: "Archived", href: "/meetings/archived" },
] as const;

const SORT_LABELS = {
  start: "Start date",
  updated: "Updated date",
  title: "Title",
} as const;

export function MeetingsCollection({
  meetings,
  view,
  failed,
  total,
  nextCursor,
  hasMore,
  todayKey,
  ownerTimezone,
}: {
  meetings: readonly SerializedMeeting[];
  view: string;
  failed: boolean;
  total: number;
  nextCursor: string | null;
  hasMore: boolean;
  /** The owner's calendar day, for the list's relative day headings (§25). */
  todayKey: string;
  /** The owner's timezone — the one frame those day boundaries are read in. */
  ownerTimezone: string;
}) {
  const isReloading = useCollectionLoading();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const [draftQuery, setDraftQuery] = useState(query);
  const sort = searchParams.get("sort") ?? "start";

  // The route path plus the CURRENT query minus any cursor, so a "Load more"
  // resumes the same filtered, sorted view rather than the unfiltered default.
  const viewHref =
    VIEW_LINKS.find((item) => item.id === view)?.href ?? "/meetings";
  const path = useMemo(() => {
    const params = new URLSearchParams(searchParams);
    params.delete("cursor");
    const qs = params.toString();
    return qs ? `${viewHref}?${qs}` : viewHref;
  }, [viewHref, searchParams]);

  const pagination = useKeysetPagination<SerializedMeeting, MeetingsPageData>({
    firstPage: meetings,
    initialCursor: hasMore ? nextCursor : null,
    path,
    select: selectMeetingsPage,
    getId: meetingId,
  });

  const subtitle = failed
    ? "We couldn’t load your meetings."
    : pagination.hasMore
      ? `${pagination.items.length} of ${total} loaded`
      : total === 1
        ? "1 meeting"
        : `${total} meetings`;

  const updateParam = useCallback(
    (name: string, value: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (!value || (name === "sort" && value === "start"))
            next.delete(name);
          else next.set(name, value);
          next.delete("cursor");
          return next;
        },
        { replace: true, preventScrollReset: true },
      );
    },
    [setSearchParams],
  );

  useEffect(() => {
    setDraftQuery(query);
  }, [query]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (draftQuery !== query) updateParam("q", draftQuery);
    }, 250);
    return () => clearTimeout(timeout);
  }, [draftQuery, query, updateParam]);

  return (
    <CollectionLayout
      isLoading={isReloading}
      title="Meetings"
      entityType="meeting"
      subtitle={subtitle}
      // Shell cleanup: the header's "New meeting" button is gone. It navigated to
      // the generic `/new/meeting` form with no context the global capture
      // control does not already supply — capture asks for the same two things a
      // meeting needs to exist (a title and a start) and posts to the same
      // `POST /meetings/create` route, then opens the created Meeting's workspace
      // where the rest of the detail belongs anyway.
      //
      // `/new/meeting` itself is untouched and still reachable: from the command
      // palette, from a link, and from the empty state below — which is where a
      // create action actually earns its place, because an owner with no meetings
      // has nothing else on the screen to act on.
      //
      // UIQ-013 — Meetings was the one collection rendering its controls into
      // the CONTENT slot: the three scope views (its principal mode) as loose
      // `.dh-segmented__option` links with no container, and search and sort
      // beside them in a toolbar above the first card. The views are now the
      // shared switcher in the header's view slot, and search/sort are ordinary
      // filters in the shared filter row — the same two bands, in the same
      // order, as every other collection.
      viewSwitcher={
        <ViewSwitcher
          options={VIEW_LINKS.map((item) => ({
            value: item.id,
            label: item.label,
            href: item.href,
          }))}
          value={view}
          label="Meeting views"
        />
      }
      filterBar={
        <div className="dh-meetings-filters">
          {/*
            UIX-04 §7/§37 — the search field's visible label is its placeholder,
            exactly as the Notes band does it. The label element is only
            VISUALLY hidden, so the control is still named for assistive tech;
            what goes is the empty, unlabelled box the band used to open with.
          */}
          <label className="dh-field dh-meetings-search">
            <span className="dh-field__label-text dh-visually-hidden">
              Search meetings
            </span>
            <input
              className="dh-input"
              type="search"
              placeholder="Search meetings"
              value={draftQuery}
              onChange={(event) => setDraftQuery(event.target.value)}
            />
          </label>
          <label className="dh-field dh-meetings-sort">
            <span className="dh-field__label-text">Sort</span>
            <select
              className="dh-input"
              value={sort}
              onChange={(event) => updateParam("sort", event.target.value)}
            >
              {Object.entries(SORT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      }
    >
      {failed ? (
        <EmptyState
          icon={<EntityIcon type="meeting" />}
          title="Meetings couldn’t be loaded"
          description="Try again in a moment."
        />
      ) : pagination.items.length === 0 ? (
        <EmptyState
          icon={<EntityIcon type="meeting" />}
          title={`No ${view} meetings`}
          description="Create a meeting when there is something worth preparing and remembering."
          // An empty collection is the one place a page-level create still
          // belongs: there is nothing else here to act on, and "no dead ends"
          // (AGENTS.md §6) means an empty state teaches the next action. It
          // arrived with the header button's removal so the empty view is not
          // left without one.
          primaryAction={
            <Link className="dh-btn dh-btn--primary" to="/new/meeting">
              New meeting
            </Link>
          }
        />
      ) : (
        <>
          <MeetingsList
            meetings={pagination.items}
            ariaLabel={`${view} meetings`}
            todayKey={todayKey}
            ownerTimezone={ownerTimezone}
            view={view}
          />
          {pagination.hasMore ? (
            <LoadMore
              loading={pagination.loading}
              loadFailed={pagination.loadFailed}
              onLoadMore={pagination.loadMore}
              label="Load more meetings"
            />
          ) : null}
        </>
      )}
    </CollectionLayout>
  );
}

/** Stable module-level selectors, so the shared hook's memo identity is stable. */
function selectMeetingsPage(data: MeetingsPageData) {
  return {
    items: data.meetings,
    nextCursor: data.nextCursor,
    failed: data.failed,
  };
}

function meetingId(meeting: SerializedMeeting): string {
  return meeting.id;
}
