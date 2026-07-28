import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";

import { Card, CardCollection, type CardMetaItem } from "~/shared/card";
import {
  CollectionLayout,
  useCollectionLoading,
} from "~/shared/collection-layout";
import { EmptyState } from "~/shared/empty-state";
import { EntityIcon } from "~/shared/entity";

import type { SerializedMeeting } from "./meeting-view";

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
  const subtitle = failed
    ? "We couldn’t load your meetings."
    : hasMore
      ? `${meetings.length} of ${total} loaded`
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

  const loadMoreHref = (() => {
    const next = new URLSearchParams(searchParams);
    if (nextCursor) next.set("cursor", nextCursor);
    return `?${next.toString()}`;
  })();

  return (
    <CollectionLayout
      isLoading={isReloading}
      title="Meetings"
      entityType="meeting"
      subtitle={subtitle}
      primaryAction={
        <Link className="dh-btn dh-btn--primary" to="/new/meeting">
          New meeting
        </Link>
      }
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
      ) : meetings.length === 0 ? (
        <EmptyState
          icon={<EntityIcon type="meeting" />}
          title={`No ${view} meetings`}
          description="Create a meeting when there is something worth preparing and remembering."
        />
      ) : (
        <>
          <CardCollection
            items={meetings}
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
                  label: meeting.archivedAt ? "Archived" : meeting.status,
                  tone: meeting.archivedAt ? "warning" : "neutral",
                }}
                metadata={meetingMetadata(meeting)}
                href={`/meeting/${meeting.id}`}
                openAriaLabel={`Open meeting ${meeting.title}`}
                density="compact"
                presentation="list"
              />
            )}
          />
          {hasMore && nextCursor ? (
            <Link className="dh-btn dh-btn--secondary" to={loadMoreHref}>
              Load more
            </Link>
          ) : null}
        </>
      )}
    </CollectionLayout>
  );
}

function meetingMetadata(meeting: SerializedMeeting): CardMetaItem[] {
  const metadata: CardMetaItem[] = [
    {
      id: "when",
      label: "When",
      value: new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: meeting.timezone,
      }).format(new Date(meeting.startsAt)),
    },
  ];
  if (meeting.location || meeting.mode) {
    metadata.push({
      id: "where",
      label: "Where",
      value: meeting.location ?? meeting.mode,
    });
  }
  return metadata;
}
