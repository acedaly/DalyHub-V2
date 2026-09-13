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
import { useSearchParams } from "react-router";

import {
  collectionCountLabel,
  CollectionLayout,
  CollectionSearchField,
  CreateActionLabel,
  SortMenu,
  useCollectionLoading,
} from "~/shared/collection-layout";
import { EmptyState } from "~/shared/empty-state";
import { EntityIcon } from "~/shared/entity";
import { LoadMore, useKeysetPagination } from "~/shared/load-more";
import { ButtonLink } from "~/shared/ui";
import { ViewSwitcher } from "~/shared/view-switcher";

import { MeetingsList, type MeetingsListMeeting } from "./MeetingsList";

/** The loader payload each `/meetings/*` view returns. */
type MeetingsPageData = {
  readonly meetings: readonly MeetingsListMeeting[];
  readonly nextCursor: string | null;
  readonly failed: boolean;
};

const VIEW_LINKS = [
  { id: "upcoming", label: "Upcoming", href: "/meetings/upcoming" },
  { id: "recent", label: "Recent", href: "/meetings/recent" },
  { id: "archived", label: "Archived", href: "/meetings/archived" },
] as const;

/*
 * DHDS-09 — the option is the VALUE; the shared control says the dimension.
 *
 * UIX-06 put "Sort:" inside every option because a bare native `<select>` has
 * nowhere else to put the field's name. The shared `SortMenu` states it once on
 * the trigger, so the options go back to being what they are — three sort keys —
 * and a screen reader hears the name once rather than once per option.
 */
const SORT_OPTIONS = [
  { value: "start", label: "Start date" },
  { value: "updated", label: "Updated date" },
  { value: "title", label: "Title" },
] as const;

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
  meetings: readonly MeetingsListMeeting[];
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

  const pagination = useKeysetPagination<MeetingsListMeeting, MeetingsPageData>(
    {
      firstPage: meetings,
      initialCursor: hasMore ? nextCursor : null,
      path,
      select: selectMeetingsPage,
      getId: meetingId,
    },
  );

  const subtitle = failed
    ? "We couldn’t load your Meetings."
    : pagination.hasMore
      ? `${pagination.items.length} of ${total} loaded`
      : collectionCountLabel(total, "Meeting", "Meetings");

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
        /*
         * UNTITLED-04 — the shared collection search field, which is Untitled's
         * `base/input`, in place of this module's own hand-built label/field
         * pair. It carries its own accessible name, its own Clear affordance
         * and the phone reveal every other collection has.
         */
        <div className="dh-meetings-filters flex w-full flex-wrap items-center gap-3">
          <CollectionSearchField
            value={draftQuery}
            onChange={setDraftQuery}
            label="Search meetings"
            placeholder="Search meetings"
            data-testid="meetings-search"
          />
          <SortMenu
            subject="meetings"
            value={sort}
            options={SORT_OPTIONS}
            onSelect={(next) => updateParam("sort", next)}
          />
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
            <ButtonLink variant="primary" href="/new/meeting">
              <CreateActionLabel>New meeting</CreateActionLabel>
            </ButtonLink>
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

function meetingId(meeting: MeetingsListMeeting): string {
  return meeting.id;
}
