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

import { Card, CardCollection, type CardMetaItem } from "~/shared/card";
import {
  CollectionLayout,
  useCollectionLoading,
} from "~/shared/collection-layout";
import { EmptyState } from "~/shared/empty-state";
import { EntityIcon } from "~/shared/entity";
import { LoadMore, useKeysetPagination } from "~/shared/load-more";

import {
  formatMeetingInstant,
  meetingStatusLabel,
  type SerializedMeeting,
} from "./meeting-view";

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
}: {
  meetings: readonly SerializedMeeting[];
  view: string;
  failed: boolean;
  total: number;
  nextCursor: string | null;
  hasMore: boolean;
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
    >
      <div className="dh-collection-toolbar" aria-label="Meeting controls">
        <nav className="dh-meetings-views" aria-label="Meeting views">
          {VIEW_LINKS.map((item) => (
            <Link
              key={item.id}
              to={item.href}
              className="dh-segmented__option"
              aria-current={view === item.id ? "true" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <label className="dh-field dh-meetings-search">
          <span className="dh-field__label-text">Search</span>
          <input
            className="dh-input"
            type="search"
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
          <CardCollection
            items={pagination.items}
            getItemId={(meeting) => meeting.id}
            ariaLabel={`${view} meetings`}
            presentation="list"
            density="compact"
            renderCard={(meeting) => (
              <Card
                id={meeting.id}
                title={meeting.title}
                typeLabel="Meeting"
                icon={<EntityIcon type="meeting" />}
                headingLevel={2}
                status={{
                  label: meeting.archivedAt
                    ? "Archived"
                    : meetingStatusLabel(meeting.status),
                  tone: meeting.archivedAt ? "warning" : "neutral",
                }}
                metadata={meetingMetadata(meeting)}
                href={`/meeting/${meeting.id}`}
                openAriaLabel={`Open meeting ${meeting.title}`}
                quickActions={joinActions(meeting)}
                density="compact"
                presentation="list"
              />
            )}
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

function meetingMetadata(meeting: SerializedMeeting): CardMetaItem[] {
  const metadata: CardMetaItem[] = [
    {
      id: "when",
      label: "When",
      // MOBILE-01: when a meeting IS is the thing you scan a meeting list for.
      value: formatMeetingInstant(meeting.startsAt, meeting.timezone),
    },
  ];
  if (meeting.location || meeting.mode) {
    metadata.push({
      id: "where",
      label: "Where",
      value: meeting.location ?? meeting.mode,
      // Supporting detail: useful, but not what you scan for.
      priority: "low",
    });
  }
  return metadata;
}

/**
 * MOBILE-01 — joining an online meeting is a ONE-TAP card action.
 *
 * Previously the meeting link lived inside the record's details, so joining from
 * a phone thirty seconds before a call meant opening the record, finding the
 * Overview tab and hunting for a URL. It is now a visible, labelled quick action
 * on the card itself, for meetings that actually have a link and are still
 * upcoming — a "Join" button on last month's completed meeting is noise.
 *
 * It is an ordinary Card quick action, so it is a labelled 44px control that
 * stops propagation and never opens the record instead.
 */
function joinActions(meeting: SerializedMeeting) {
  const joinable =
    meeting.meetingUrl !== null &&
    meeting.meetingUrl.length > 0 &&
    meeting.archivedAt === null &&
    meeting.heldAt === null &&
    meeting.status === "planned";
  if (!joinable) {
    return undefined;
  }
  return [
    {
      id: "join",
      label: "Join",
      ariaLabel: `Join ${meeting.title}`,
      href: meeting.meetingUrl as string,
      // The conferencing site is not DalyHub: joining opens a new tab, exactly as
      // the canonical meeting-link control on the record does, so the user's place
      // in the application survives the call.
      external: true,
    },
  ];
}
