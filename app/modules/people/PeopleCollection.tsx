/**
 * UIX-05 — the People collection.
 *
 * ── What was wrong ──────────────────────────────────────────────────────────
 * People rendered through the generic shared `Card`, with a list/grid toggle and
 * up to six metadata facts at one weight: relationship, stay-in-touch, last
 * interaction, next follow-up, preferred contact and tags. Every one of those is
 * true and none of them led, so the surface whose subject is "who is in my life,
 * and who have I not spoken to?" answered it with an alphabetised directory in
 * the same object a Project gallery uses.
 *
 * Four specific defects, each addressed here:
 *
 * 1. **A Person was drawn as a body of work.** The shared card is built around a
 *    title, a status and a run of metadata — the shape of something being moved
 *    forward. A Person completes nothing. UIX-02 gave a Project its own card and
 *    an Area its own row for exactly this reason; People was left behind.
 * 2. **The derived signal was buried.** PEOPLE-03 evaluates a real stay-in-touch
 *    state per Person and it arrived as the second of six equal facts.
 * 3. **The list could not reach anyone.** It showed the NAME of the preferred
 *    contact method and never the address, so writing to someone from the People
 *    screen was impossible without opening their record.
 * 4. **Identity carried nothing.** Every generated avatar was the same violet
 *    disc, and thirteen relationship values reached the screen as one grey word.
 *
 * ── What this is now ────────────────────────────────────────────────────────
 * One `PersonRowList` of `PersonRow`s — face, identity, reach, rhythm — read
 * through the CIRCLE rail (All · Personal · Work · Services · Archived), with a
 * "needs a catch-up" filter over the derived state and instant search.
 *
 * ── Two removals, both deliberate ───────────────────────────────────────────
 * - **The list/grid toggle is gone.** A Person has a face, a place, a contact
 *   and a rhythm; four facts in a 280px card is a card that is mostly empty, and
 *   the gallery form said nothing the row does not. This is D25's reasoning
 *   (an Area is a row, only a Project gets a gallery) applied where it holds
 *   just as well, and it removes a control rather than adding one.
 * - **The `Recent` scope left the rail.** "Recently added" is an ORDER, not a
 *   collection, and it already exists as one in the sort. The route stays so no
 *   existing link breaks; it simply is not a tab any more.
 *
 * The circles are applied over the LOADED page rather than in SQL, exactly as
 * UIX-03 applies Goal status views: the circle is a pure derivation over a
 * vocabulary the collection already ships, and the page's cursor is bound to the
 * server's own ordering. The subtitle always states the bound honestly.
 */

import { useCallback, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { PersonRow, PersonRowList, type PersonRowTone } from "~/shared/card";
import {
  CollectionControls,
  CollectionLayout,
  useCollectionLoading,
  type CollectionControlGroup,
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
import { LoadMore, useKeysetPagination } from "~/shared/load-more";
import { OverflowMenu } from "~/shared/overflow-menu";
import { ViewSwitcher } from "~/shared/view-switcher";
import {
  formatRelationshipDate,
  relativeDayPhrase,
} from "~/shared/relationships";
import type { RelationshipTone } from "~/kernel/relationships";

import { NewPersonForm } from "./NewPersonForm";
import { PersonAvatar } from "./PersonAvatar";
import {
  PERSON_CIRCLES,
  parsePersonCircle,
  personCircle,
  personCircleLabel,
  personCircleRank,
  type PersonCircle,
} from "./person-circles";
import { formatPersonDate, type SerializedPersonListItem } from "./person-view";
import type { PersonMutationResult } from "./routes/mutate";

const NEW_PERSON_KEY = "new-person";

/** Which collection surface is rendering. */
export type PeopleView = "all" | "recent" | "archived";

type SortKey = "rhythm" | "name" | "recent" | "organisation";

const SORT_OPTIONS: readonly { value: SortKey; label: string }[] = [
  { value: "rhythm", label: "Needs attention first" },
  { value: "name", label: "Name (A–Z)" },
  { value: "recent", label: "Recently added" },
  { value: "organisation", label: "Organisation" },
];

const DEFAULT_SORT: SortKey = "rhythm";

/** Narrow an untrusted query-string value to a sort. */
function parseSort(value: string | null): SortKey {
  return SORT_OPTIONS.some((option) => option.value === value)
    ? (value as SortKey)
    : DEFAULT_SORT;
}

/**
 * The two control dimensions, as the ONE shared collection sheet's groups.
 *
 * Both are URL-backed, which is what lets the phone reach them through the
 * shared sheet rather than through a second row of chrome — and it is an
 * improvement in its own right: a People list narrowed to "needs a catch-up" and
 * sorted by name is now a link that can be shared and restored, which it was not
 * while the sort lived in component state.
 */
const CONTROL_GROUPS: readonly CollectionControlGroup[] = [
  {
    id: "catch_up",
    label: "Show",
    param: "catch_up",
    options: [
      { value: "", label: "Everyone" },
      {
        value: "1",
        label: "Needs a catch-up",
        description: "Past the rhythm you set, or out of touch.",
      },
    ],
  },
  {
    id: "sort",
    label: "Sort",
    param: "sort",
    kind: "sort",
    defaultValue: DEFAULT_SORT,
    options: SORT_OPTIONS.map((option) => ({
      value: option.value,
      label: option.label,
    })),
  },
];

/**
 * How overdue each stay-in-touch state is, for the default order.
 *
 * It is a display rank and never a score: nothing is shown as a number, and the
 * words on the row are the whole statement. `no_history` sits mid-list rather
 * than first — someone the owner has recorded nothing about yet is an invitation
 * (PEOPLE-03's own wording), not the most pressing thing on the screen.
 */
const RHYTHM_RANK: Readonly<Record<string, number>> = {
  out_of_touch: 0,
  due_for_follow_up: 1,
  no_history: 2,
  in_touch: 3,
  recently_connected: 4,
};

/**
 * The row's tone vocabulary from the relationship kernel's.
 *
 * `out_of_touch` and `due_for_follow_up` both arrive as the kernel's `neutral`
 * tone — correct for a pill that must not shout, and not enough for a column the
 * eye is meant to land on. The escalation is made HERE, from the state rather
 * than from the tone, and it is still never colour alone: the state is spelled
 * out beside the dot on every row.
 */
function rhythmTone(state: string, tone: RelationshipTone): PersonRowTone {
  if (state === "out_of_touch" || state === "due_for_follow_up") {
    return "warning";
  }
  if (tone === "success") return "success";
  if (tone === "info") return "info";
  return "neutral";
}

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
  recent: { title: "Recently added", noun: "recent people" },
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

/**
 * The one identity line under the name.
 *
 * The role and organisation lead where they exist, because that is what
 * distinguishes two people with the same first name; the circle follows, so the
 * avatar's colour always has a word beside it. A Person with neither says only
 * their relationship, and a Person with none of the three says nothing at all
 * rather than a placeholder.
 */
function contextLine(person: SerializedPersonListItem): string | null {
  const circle = personCircleLabel(personCircle(person.relationship));
  const parts = [person.role, person.organisation].filter(Boolean);
  const who = person.relationshipLabel ?? circle;
  const line = [who, ...parts].filter(Boolean).join(" · ");
  return line.length > 0 ? line : null;
}

/**
 * The rhythm column's detail line — when this person was last heard from.
 *
 * The DERIVED date leads, because it cannot go stale; the hand-entered "last
 * spoke" field is the fallback, and "Nothing recorded yet" is the honest third
 * case. A Person whose signal failed to load shows no rhythm at all rather than
 * a wrong one.
 *
 * Every branch is PREFIXED with what the date means. The first screenshots of
 * this row printed a bare "24 March 2026" under "Due for follow-up", and a bare
 * date beneath a follow-up state reads just as naturally as the date the
 * follow-up is DUE — which is the opposite of what it is. A column of dates that
 * needs the reader to remember which kind they are is a column that says nothing.
 */
function rhythmDetail(person: SerializedPersonListItem): string | null {
  const days = person.stayInTouch?.daysSinceLastInteraction ?? null;
  if (days !== null) {
    const dated = formatRelationshipDate(
      person.stayInTouch?.lastInteractionDate ?? null,
    );
    return `Last spoke ${dated ?? relativeDayPhrase(days)}`;
  }
  const entered = formatPersonDate(person.lastInteraction);
  if (entered) return `Last spoke ${entered}`;
  const followUp = formatPersonDate(person.nextFollowUp);
  if (followUp) return `Follow up ${followUp}`;
  return null;
}

/**
 * UX-01 — the ONE shared `useKeysetPagination` (DEBT-45). This was one of five
 * near-identical private copies of the same accumulate/de-duplicate/reset logic.
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
    ...person.reach.map((reach) => reach.value),
    ...person.tags,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
  return haystack.includes(query);
}

/** True when the derived state says this relationship is asking for something. */
function needsCatchUp(person: SerializedPersonListItem): boolean {
  const state = person.stayInTouch?.state;
  return state === "out_of_touch" || state === "due_for_follow_up";
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
    case "recent":
      return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    case "rhythm":
    default:
      // The default. A People list is opened to find out who has gone quiet, so
      // the ones who have lead — and within a state, the longest silence first.
      return items.sort((a, b) => {
        const rank =
          (RHYTHM_RANK[a.stayInTouch?.state ?? "no_history"] ?? 2) -
          (RHYTHM_RANK[b.stayInTouch?.state ?? "no_history"] ?? 2);
        if (rank !== 0) return rank;
        const days =
          (b.stayInTouch?.daysSinceLastInteraction ?? -1) -
          (a.stayInTouch?.daysSinceLastInteraction ?? -1);
        if (days !== 0) return days;
        return a.title.localeCompare(b.title);
      });
  }
}

function PeopleCollection({
  people,
  nextCursor,
  failed,
  view,
}: {
  readonly people: readonly SerializedPersonListItem[];
  readonly nextCursor: string | null;
  readonly failed: boolean;
  readonly view: PeopleView;
}) {
  const { items, hasMore, loading, loadFailed, loadMore } = usePeoplePagination(
    people,
    nextCursor,
    view,
  );
  const { restore, pendingIds, restoredIds } = useRestorePerson();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState("");

  // The circle, the catch-up filter and the sort all live in the URL, so each is
  // deep-linkable, shareable and Back/Forward-correct — the same contract every
  // other view rail and control sheet has. The sort used to be component state,
  // which is why it could not reach the shared phone sheet.
  const circle = parsePersonCircle(searchParams.get("circle"));
  const onlyCatchUp = searchParams.get("catch_up") === "1";
  const sortKey = parseSort(searchParams.get("sort"));

  const setParam = useCallback(
    (key: string, value: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) next.set(key, value);
          else next.delete(key);
          return next;
        },
        { replace: true, preventScrollReset: true },
      );
    },
    [setSearchParams],
  );

  const normalisedQuery = query.trim().toLocaleLowerCase();
  const visible = useMemo(() => {
    const filtered = items
      .filter((person) => !restoredIds.has(person.id))
      .filter(
        (person) =>
          circle === null || personCircle(person.relationship) === circle,
      )
      .filter((person) => !onlyCatchUp || needsCatchUp(person))
      .filter((person) => matchesQuery(person, normalisedQuery));
    return sortPeople(filtered, sortKey);
  }, [items, restoredIds, circle, onlyCatchUp, normalisedQuery, sortKey]);

  const catchUpCount = useMemo(
    () =>
      items.filter((person) => !restoredIds.has(person.id)).filter(needsCatchUp)
        .length,
    [items, restoredIds],
  );

  const { title, noun } = HEADINGS[view];
  const canQuickAdd = view !== "archived";
  const count = visible.length;
  const narrowed = circle !== null || onlyCatchUp || normalisedQuery.length > 0;

  /*
   * The subtitle states the BOUND, not just the count.
   *
   * The circles and the catch-up filter run over the loaded page, so "4 people"
   * would be a claim about the workspace that this screen cannot make while more
   * pages remain. Saying "of 24 loaded" is the honest form, and it is the same
   * wording UIX-03 gave the Goals status views for the same reason.
   */
  const subtitle = failed
    ? `We couldn’t load your ${noun}.`
    : narrowed
      ? `${count} of ${items.length} loaded`
      : hasMore
        ? `${count} ${noun} loaded`
        : count === 1
          ? `1 ${noun.replace(/people$/, "person")}`
          : `${count} ${noun}`;

  const quickAdd = canQuickAdd ? (
    <DrawerTrigger
      drawerKey={NEW_PERSON_KEY}
      className="dh-btn dh-btn--primary"
    >
      New Person
    </DrawerTrigger>
  ) : undefined;

  /*
   * The CIRCLE rail — the one view switcher People has, and the collection's
   * principal mode: exactly one is always active, and each is a partition of the
   * relationship vocabulary the record already carries (`person-circles.ts`).
   *
   * `Archived` is the fifth because it genuinely is the fifth mode of the same
   * kind: a different set of People, not a different lens on the same ones. It
   * is a route rather than a param because it is a different server-side scope.
   */
  const circleHref = (value: PersonCircle | null) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set("circle", value);
    else next.delete("circle");
    const qs = next.toString();
    return qs ? `/people?${qs}` : "/people";
  };

  const viewSwitcher = (
    <ViewSwitcher
      options={[
        { value: "all", label: "All", href: circleHref(null) },
        ...PERSON_CIRCLES.map((entry) => ({
          value: entry.value,
          label: entry.railLabel,
          href: circleHref(entry.value),
        })),
        { value: "archived", label: "Archived", href: "/people/archived" },
      ]}
      value={view === "archived" ? "archived" : (circle ?? "all")}
      label="People circles"
    />
  );

  const filterBar = (
    <div className="dh-people-filters">
      <label className="dh-people-filters__search">
        <span className="dh-visually-hidden">Search people</span>
        <input
          type="search"
          inputMode="search"
          placeholder="Search name, organisation, email or tag"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="dh-people-filters__input"
          autoComplete="off"
        />
      </label>
      {/*
       * The one FILTER People has, and it is the module's own question rather
       * than a generic facet: "who is this list asking me to contact?". It is a
       * toggle rather than a select because there is exactly one answer, and it
       * states its own count so the owner knows before pressing it whether it
       * will show anything.
       */}
      {view !== "archived" ? (
        <button
          type="button"
          className="dh-people-filters__toggle"
          aria-pressed={onlyCatchUp}
          onClick={() => setParam("catch_up", onlyCatchUp ? null : "1")}
        >
          Needs a catch-up
          <span className="dh-people-filters__toggle-count">
            {catchUpCount}
          </span>
        </button>
      ) : null}
      <label className="dh-people-filters__sort">
        <span className="dh-visually-hidden">Sort people</span>
        <select
          value={sortKey}
          onChange={(event) => setParam("sort", event.target.value)}
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

  /*
   * The phone's ONE control row.
   *
   * At 390px the desktop filter bar was three stacked rows — search, the
   * catch-up toggle, the sort select — under a scrolling circle rail, which is
   * four rows of chrome before the first Person. MOBILE-01 exists for exactly
   * this: the phone gets one Filter button and the shared sheet, and it can only
   * do that because the sort and the catch-up filter are both URL-backed.
   *
   * Search stays visible at every width (see `people.css`), because a search box
   * behind a button is a search box nobody uses.
   */
  const mobileControls = (
    <CollectionControls
      groups={CONTROL_GROUPS}
      label="Filter and sort people"
      triggerLabel="Filter & sort"
      basePath={BASE_PATH[view]}
    />
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
      mobileControls={mobileControls}
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
        (items.length > 0 || view !== "all" || narrowed)
      }
      filteredEmptySlot={
        <EmptyState
          icon={<EntityIcon type="person" />}
          title={
            normalisedQuery.length > 0
              ? "No people match your search"
              : onlyCatchUp
                ? "Nobody is waiting to hear from you"
                : circle !== null
                  ? `Nobody in ${personCircleLabel(circle)} yet`
                  : view === "archived"
                    ? "No archived people"
                    : "No people to show"
          }
          description={
            normalisedQuery.length > 0
              ? "Try a different name, organisation, address or tag."
              : onlyCatchUp
                ? "Everyone in this circle is inside the rhythm you set for them."
                : circle !== null
                  ? "Set someone’s relationship on their record and they will appear in the circle it belongs to."
                  : view === "archived"
                    ? "People you archive appear here, and can be restored at any time."
                    : "Add someone to get started."
          }
        />
      }
    >
      <PersonRowList label={title} data-testid="people-list">
        {visible.map((person) => (
          <PersonRow
            key={person.id}
            headingLevel={2}
            avatar={
              <PersonAvatar
                name={person.title}
                initials={person.initials}
                photoUrl={person.photoUrl}
                colourRank={personCircleRank(personCircle(person.relationship))}
                size={44}
              />
            }
            title={person.title}
            context={contextLine(person)}
            reach={person.reach[0] ?? null}
            secondaryReach={person.reach[1] ?? null}
            rhythm={
              person.stayInTouch
                ? {
                    text: person.stayInTouch.label,
                    tone: rhythmTone(
                      person.stayInTouch.state,
                      person.stayInTouch.tone,
                    ),
                    detail: rhythmDetail(person),
                  }
                : undefined
            }
            muted={person.archived}
            href={`/person/${encodeURIComponent(person.id)}`}
            openAriaLabel={`Open ${person.title}`}
            overflow={
              person.archived ? (
                <OverflowMenu
                  label={`Actions for ${person.title}`}
                  items={[
                    {
                      id: "restore",
                      label: pendingIds.has(person.id)
                        ? "Restoring…"
                        : "Restore",
                      disabled: pendingIds.has(person.id),
                      onSelect: () => restore(person.id, person.title),
                    },
                  ]}
                />
              ) : undefined
            }
          />
        ))}
      </PersonRowList>
      {!failed && hasMore && !narrowed ? (
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
