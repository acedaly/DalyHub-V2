/**
 * PEOPLE-01 — the People collection view (presentation, no server imports).
 *
 * Composed entirely from the shared PX-02 Collection Layout, the DS-04 Card, the
 * DS-03 Drawer (hosting the "New Person" quick-add form) and shared empty states.
 * It adds the collection controls the People module needs — instant client-side
 * search, sort, and a list/grid presentation toggle over the loaded page — plus
 * bounded "Load more" pagination. Each active Card opens the canonical person
 * record through normal client navigation; an archived Card also carries a
 * "Restore" quick action. The three views (`all` on /people, `recent`, `archived`)
 * reuse this one component.
 */

import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router";

import {
  Card,
  CardCollection,
  type CardAction,
  type CardMetaItem,
  type CardProps,
} from "~/shared/card";
import {
  CollectionLayout,
  useCollectionLoading,
} from "~/shared/collection-layout";
import {
  DrawerProvider,
  DrawerTrigger,
  useDrawer,
  type DrawerEntry,
  type DrawerRenderResult,
} from "~/shared/drawer";
import { EmptyState } from "~/shared/empty-state";
import { EntityIcon } from "~/shared/entity";
import { useFeedback } from "~/shared/feedback";
import { GridIcon, ListIcon } from "~/shared/icons";
import { LoadMore, useKeysetPagination } from "~/shared/load-more";
import { ViewSwitcher } from "~/shared/view-switcher";
import {
  StayInTouchIndicator,
  formatRelationshipDate,
  relativeDayPhrase,
} from "~/shared/relationships";

import { NewPersonForm } from "./NewPersonForm";
import { PersonAvatar } from "./PersonAvatar";
import { formatPersonDate, type SerializedPersonListItem } from "./person-view";
import type { PersonMutationResult } from "./routes/mutate";

const NEW_PERSON_KEY = "new-person";

/** Which collection surface is rendering. */
export type PeopleView = "all" | "recent" | "archived";

type SortKey = "name" | "recent" | "organisation" | "follow_up";

const SORT_OPTIONS: readonly { value: SortKey; label: string }[] = [
  { value: "recent", label: "Recently added" },
  { value: "name", label: "Name (A–Z)" },
  { value: "organisation", label: "Organisation" },
  { value: "follow_up", label: "Next follow-up" },
];

export interface PeopleCollectionViewProps {
  readonly people: readonly SerializedPersonListItem[];
  readonly nextCursor: string | null;
  readonly failed: boolean;
  readonly view: PeopleView;
}

type PeoplePageData = {
  readonly people: readonly SerializedPersonListItem[];
  readonly nextCursor: string | null;
  readonly view: PeopleView;
  readonly failed: boolean;
};

const BASE_PATH: Record<PeopleView, string> = {
  all: "/people",
  recent: "/people/recent",
  archived: "/people/archived",
};

const HEADINGS: Record<PeopleView, { title: string; noun: string }> = {
  all: { title: "People", noun: "people" },
  recent: { title: "Recent people", noun: "recent people" },
  archived: { title: "Archived people", noun: "archived people" },
};

export function PeopleCollectionView({
  people,
  nextCursor,
  failed,
  view,
}: PeopleCollectionViewProps) {
  const navigate = useNavigate();

  const renderDrawer = useMemo(() => {
    return function render(entry: DrawerEntry): DrawerRenderResult | null {
      if (entry.key !== NEW_PERSON_KEY) {
        return null;
      }
      return {
        title: "New Person",
        description: "Add someone to People. You can add more detail after.",
        children: (
          <NewPersonFormHost
            onCreated={(id) => navigate(`/person/${encodeURIComponent(id)}`)}
          />
        ),
      };
    };
  }, [navigate]);

  return (
    <DrawerProvider renderDrawer={renderDrawer}>
      <PeopleCollection
        people={people}
        nextCursor={nextCursor}
        failed={failed}
        view={view}
        onOpen={(id) => navigate(`/person/${encodeURIComponent(id)}`)}
      />
    </DrawerProvider>
  );
}

function NewPersonFormHost({
  onCreated,
}: {
  readonly onCreated: (id: string) => void;
}) {
  const { closeDrawer } = useDrawer();
  return <NewPersonForm onCreated={onCreated} onCancel={closeDrawer} />;
}

function metaFor(person: SerializedPersonListItem): CardMetaItem[] {
  const metadata: CardMetaItem[] = [];
  if (person.relationshipLabel) {
    metadata.push({
      id: "relationship",
      label: "Relationship",
      value: person.relationshipLabel,
    });
  }
  // PEOPLE-03 — the DERIVED stay-in-touch state, rendered through the SAME shared
  // indicator the Person record uses (never a second collection-only pill). The
  // pill is non-interactive, so it adds no tab stop inside the card's own link.
  if (person.stayInTouch) {
    metadata.push({
      id: "stay-in-touch",
      label: "Staying in touch",
      value: <StayInTouchIndicator relationship={person.stayInTouch} />,
    });
  }
  // The last interaction is DERIVED from the relationship timeline when there is
  // one, and only falls back to the hand-entered `lastInteraction` field when
  // nothing has been recorded — the derived value is the one that cannot go stale.
  const derivedLast = person.stayInTouch?.daysSinceLastInteraction ?? null;
  if (derivedLast !== null) {
    metadata.push({
      id: "last-interaction",
      label: "Last interaction",
      value:
        formatRelationshipDate(
          person.stayInTouch?.lastInteractionDate ?? null,
        ) ?? relativeDayPhrase(derivedLast),
    });
  } else {
    const lastInteraction = formatPersonDate(person.lastInteraction);
    if (lastInteraction) {
      metadata.push({
        id: "last-interaction",
        label: "Last spoke",
        value: lastInteraction,
      });
    }
  }
  const nextFollowUp = formatPersonDate(person.nextFollowUp);
  if (nextFollowUp) {
    metadata.push({
      id: "next-follow-up",
      label: "Follow up",
      value: nextFollowUp,
    });
  }
  if (person.favouriteContactMethodLabel) {
    metadata.push({
      id: "favourite-contact",
      label: "Prefers",
      value: person.favouriteContactMethodLabel,
    });
  }
  if (person.tags.length > 0) {
    metadata.push({ id: "tags", label: "Tags", value: person.tags.join(", ") });
  }
  return metadata;
}

function toCardProps(
  person: SerializedPersonListItem,
  presentation: "list" | "grid",
  onOpen: (id: string) => void,
  restoreAction: CardAction | undefined,
): CardProps {
  const subtitleParts = [person.role, person.organisation].filter(Boolean);
  return {
    id: person.id,
    title: person.title,
    typeLabel: "Person",
    icon: (
      <PersonAvatar
        name={person.title}
        initials={person.initials}
        photoUrl={person.photoUrl}
        size={presentation === "grid" ? 48 : 40}
      />
    ),
    headingLevel: 2,
    subtitle: subtitleParts.length > 0 ? subtitleParts.join(" · ") : undefined,
    status: person.archived
      ? { label: "Archived", tone: "warning" }
      : undefined,
    metadata: metaFor(person),
    density: "comfortable",
    presentation,
    href: `/person/${encodeURIComponent(person.id)}`,
    onOpen: () => onOpen(person.id),
    openAriaLabel: `Open ${person.title}`,
    quickActions: restoreAction ? [restoreAction] : undefined,
  };
}

/**
 * UX-01 — replaced by the ONE shared `useKeysetPagination` (DEBT-45). This was one
 * of five near-identical private copies of the same accumulate/de-duplicate/reset
 * logic; the shared hook also fixes the request-scoping defect they all carried.
 */
function usePeoplePagination(
  firstPage: readonly SerializedPersonListItem[],
  initialCursor: string | null,
  view: PeopleView,
) {
  return useKeysetPagination<SerializedPersonListItem, PeoplePageData>({
    firstPage,
    initialCursor,
    path: BASE_PATH[view],
    select: selectPeoplePage,
    getId: personId,
  });
}

/** Stable module-level selectors, so the shared hook's memo identity is stable. */
function selectPeoplePage(data: PeoplePageData) {
  return {
    items: data.people,
    nextCursor: data.nextCursor,
    failed: data.failed,
  };
}

function personId(person: SerializedPersonListItem): string {
  return person.id;
}

function useRestorePerson() {
  const feedback = useFeedback();
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  const [restoredIds, setRestoredIds] = useState<ReadonlySet<string>>(
    new Set(),
  );

  const restore = useCallback(
    (personId: string, title: string) => {
      setPendingIds((prev) => new Set(prev).add(personId));
      const body = new FormData();
      body.set("intent", "restore");
      void fetch(`/person/${encodeURIComponent(personId)}/mutate`, {
        method: "POST",
        body,
      })
        .then((response) => response.json() as Promise<PersonMutationResult>)
        .then((result) => {
          setPendingIds((prev) => {
            const next = new Set(prev);
            next.delete(personId);
            return next;
          });
          if (result.kind === "restore" && result.ok) {
            setRestoredIds((prev) => new Set(prev).add(personId));
            feedback.notifySuccess(`"${title}" restored`);
          } else {
            feedback.notifyError(`Couldn’t restore "${title}". Try again.`);
          }
        })
        .catch(() => {
          setPendingIds((prev) => {
            const next = new Set(prev);
            next.delete(personId);
            return next;
          });
          feedback.notifyError(`Couldn’t restore "${title}". Try again.`);
        });
    },
    [feedback],
  );

  return { restore, pendingIds, restoredIds };
}

function matchesQuery(
  person: SerializedPersonListItem,
  query: string,
): boolean {
  if (query.length === 0) return true;
  const haystack = [
    person.title,
    person.preferredName,
    person.organisation,
    person.role,
    person.relationshipLabel,
    ...person.tags,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
  return haystack.includes(query);
}

function sortPeople(
  people: readonly SerializedPersonListItem[],
  sortKey: SortKey,
): SerializedPersonListItem[] {
  const items = [...people];
  switch (sortKey) {
    case "name":
      return items.sort((a, b) => a.title.localeCompare(b.title));
    case "organisation":
      return items.sort(
        (a, b) =>
          (a.organisation ?? "").localeCompare(b.organisation ?? "") ||
          a.title.localeCompare(b.title),
      );
    case "follow_up":
      return items.sort((a, b) => {
        const av = a.nextFollowUp ?? "9999-99-99";
        const bv = b.nextFollowUp ?? "9999-99-99";
        return av.localeCompare(bv) || a.title.localeCompare(b.title);
      });
    case "recent":
    default:
      return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

function PeopleCollection({
  people,
  nextCursor,
  failed,
  view,
  onOpen,
}: {
  readonly people: readonly SerializedPersonListItem[];
  readonly nextCursor: string | null;
  readonly failed: boolean;
  readonly view: PeopleView;
  readonly onOpen: (id: string) => void;
}) {
  const { items, hasMore, loading, loadFailed, loadMore } = usePeoplePagination(
    people,
    nextCursor,
    view,
  );
  const { restore, pendingIds, restoredIds } = useRestorePerson();
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("recent");
  const [presentation, setPresentation] = useState<"list" | "grid">("list");

  const normalisedQuery = query.trim().toLocaleLowerCase();
  const visible = useMemo(() => {
    const filtered = items
      .filter((person) => !restoredIds.has(person.id))
      .filter((person) => matchesQuery(person, normalisedQuery));
    return sortPeople(filtered, sortKey);
  }, [items, restoredIds, normalisedQuery, sortKey]);

  const { title, noun } = HEADINGS[view];
  const canQuickAdd = view !== "archived";
  const count = visible.length;
  const subtitle = failed
    ? `We couldn’t load your ${noun}.`
    : normalisedQuery.length > 0
      ? `${count} of ${items.length} match "${query.trim()}"`
      : hasMore
        ? `${count} ${noun} loaded`
        : count === 1
          ? `1 ${noun.replace(/s$/, "")}`
          : `${count} ${noun}`;

  const quickAdd = canQuickAdd ? (
    <DrawerTrigger
      drawerKey={NEW_PERSON_KEY}
      className="dh-btn dh-btn--primary"
    >
      New Person
    </DrawerTrigger>
  ) : undefined;

  const restoreActionFor = (
    person: SerializedPersonListItem,
  ): CardAction | undefined =>
    person.archived
      ? {
          id: "restore",
          label: "Restore",
          pending: pendingIds.has(person.id),
          onSelect: () => restore(person.id, person.title),
        }
      : undefined;

  /*
   * UIQ-013 — People had TWO bespoke switchers and now has none of its own.
   *
   * Both are the one shared primitive, and both are genuinely views rather
   * than filters: the scope decides which principal collection is shown (one
   * of the three is always active) and the layout decides how those records
   * are presented. They sit side by side in the header's view slot — scope
   * first, because it is the bigger decision — and the layout toggle is
   * icon-only so a second control costs a pair of 44px squares rather than a
   * second row of pills.
   */
  const viewSwitcher = (
    <>
      <ViewSwitcher
        options={[
          { value: "all", label: "All people", href: "/people" },
          { value: "recent", label: "Recent", href: "/people/recent" },
          { value: "archived", label: "Archived", href: "/people/archived" },
        ]}
        value={view}
        label="People views"
      />
      <ViewSwitcher
        options={[
          { value: "list", label: "List view", icon: <ListIcon /> },
          { value: "grid", label: "Gallery view", icon: <GridIcon /> },
        ]}
        value={presentation}
        label="Card layout"
        iconOnly
        onSelect={(next) => setPresentation(next as "list" | "grid")}
      />
    </>
  );

  const filterBar = (
    <div className="dh-people-filters">
      <label className="dh-people-filters__search">
        <span className="dh-visually-hidden">Search people</span>
        <input
          type="search"
          inputMode="search"
          placeholder="Search name, organisation, role or tag"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="dh-people-filters__input"
          autoComplete="off"
        />
      </label>
      <label className="dh-people-filters__sort">
        <span className="dh-visually-hidden">Sort people</span>
        <select
          value={sortKey}
          onChange={(event) => setSortKey(event.target.value as SortKey)}
          className="dh-people-filters__select"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              Sort: {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );

  // PX-06: the ONE shared collection loading signal — a same-route navigation
  // (a filter, a view, a page) shows the shared skeleton instead of leaving the
  // previous list on screen with no feedback.
  const isReloading = useCollectionLoading();
  return (
    <CollectionLayout
      isLoading={isReloading}
      title={title}
      subtitle={subtitle}
      entityType="person"
      viewSwitcher={viewSwitcher}
      filterBar={filterBar}
      primaryAction={quickAdd}
      error={
        failed ? (
          <EmptyState
            title={`We couldn’t load your ${noun}`}
            description="Something went wrong. Please try again."
          />
        ) : undefined
      }
      isEmpty={!failed && items.length === 0 && !hasMore && view === "all"}
      emptySlot={
        <EmptyState
          icon={<EntityIcon type="person" />}
          title="No People yet"
          description="People are the relationships in your life — friends, family, colleagues. Add the first person to start remembering what matters to them."
          primaryAction={
            <DrawerTrigger
              drawerKey={NEW_PERSON_KEY}
              className="dh-btn dh-btn--primary"
            >
              New Person
            </DrawerTrigger>
          }
        />
      }
      isFilteredEmpty={
        !failed &&
        count === 0 &&
        (items.length > 0 || view !== "all" || normalisedQuery.length > 0)
      }
      filteredEmptySlot={
        <EmptyState
          icon={<EntityIcon type="person" />}
          title={
            normalisedQuery.length > 0
              ? "No people match your search"
              : view === "archived"
                ? "No archived people"
                : "No people to show"
          }
          description={
            normalisedQuery.length > 0
              ? "Try a different name, organisation, role or tag."
              : view === "archived"
                ? "People you archive appear here, and can be restored at any time."
                : "Add someone to get started."
          }
        />
      }
    >
      <CardCollection
        items={visible}
        getItemId={(person) => person.id}
        ariaLabel={title}
        presentation={presentation}
        density="comfortable"
        renderCard={(person) => (
          <Card
            {...toCardProps(
              person,
              presentation,
              onOpen,
              restoreActionFor(person),
            )}
          />
        )}
      />
      {!failed && hasMore && normalisedQuery.length === 0 ? (
        <LoadMore
          loading={loading}
          loadFailed={loadFailed}
          onLoadMore={loadMore}
          label={`Load more ${noun}`}
        />
      ) : null}
    </CollectionLayout>
  );
}
