/**
 * UNTITLED-09 — the Habits collection.
 *
 * ── The page this replaced, and what was wrong with it ──────────────────────
 *
 * UX-02 built a three-part screen: four KPI tiles across the top, a CSS-grid
 * "table" on the left, and a rail of three cards on the right. Looked at on the
 * actual product data rather than in a mock-up, it had three problems and they
 * were all structural rather than cosmetic.
 *
 *   1. **The rail duplicated the table.** Its "Today" card listed the Habits the
 *      day asks for — and the table's default scope is ALREADY ordered by that
 *      exact rule, so the same six rows were drawn twice, one screen apart, with
 *      two check controls per Habit. The card's own header comment argued it was
 *      "the top of the list, not a second reading of it"; on screen, at 1440,
 *      the whole list fitted above the fold and the shortlist was the same list.
 *   2. **Four KPI tiles are the opening the brief rules out.** Each carried a
 *      coloured icon square, and the four together took 110px of the first
 *      viewport to say four numbers — above the only part of the page that can
 *      be acted on.
 *   3. **The table was not one.** Its headings sat over the wrong columns, and
 *      the seven weekday letters were redrawn on every row.
 *
 * ── What the page is now ────────────────────────────────────────────────────
 *
 * ONE bounded card, in Untitled's `application/table` composition — the same
 * "figures band above a table inside one card" the Pro dashboards use
 * (`dashboards-02/02`), rather than three cards and a rail:
 *
 *     ┌───────────────────────────────────────────────────────────────┐
 *     │  Due today 6 · 2 still open │ This week 31 of 42 │ Recent 80% │  divided band
 *     ├───────────────────────────────────────────────────────────────┤
 *     │  ✓  Habit          Schedule     Today     Progress   M T W …  │  Untitled head
 *     │  ●  Stretch        Every day    Done      ▓▓▓░ 4/7   ● ● ○ ·  │
 *     ├───────────────────────────────────────────────────────────────┤
 *     │  Load more · Show archived habits                             │  divided footer
 *     └───────────────────────────────────────────────────────────────┘
 *
 * and, only when there are any, a second card naming the Goals these behaviours
 * support. The rail is gone; nothing it held is lost. Its Today shortlist was
 * the table; its "Week at a glance" figures are the band; its Goals card is the
 * section below.
 *
 * ── The band is three figures, not four tiles ───────────────────────────────
 *
 * Three, because there are three questions this page answers before you act:
 * what does today ask for, how is the week going, and is the behaviour holding
 * up. It is Untitled's in-card divided band — no boxes, no coloured icon
 * squares, no ring — and every figure states its own denominator, because a
 * proportion without one is a verdict rather than a measurement (ADR-104).
 *
 * ── Checking in still uses the ONE authority ────────────────────────────────
 *
 * Every control posts through `useHabitCheckIn` to `/habits/:id/check-in` — the
 * exact call Today makes. Nothing about a tick differs by where it was made, and
 * the loader's revalidation is what puts the band's counts back in agreement
 * rather than arithmetic in the browser.
 *
 * ── Nothing here manufactures urgency ───────────────────────────────────────
 *
 * No streak, no flame, no day count, no red. A day that was never scheduled is
 * stated in neutral words and offers no control; a day that has not happened is
 * not drawn at all.
 */

import { useEffect, useMemo } from "react";

import {
  CollectionLayout,
  CollectionSearchField,
  CreateActionLabel,
  useCollectionLoading,
  useCollectionSearch,
} from "~/shared/collection-layout";
import { EmptyState } from "~/shared/empty-state";
import { EntityIcon } from "~/shared/entity";
import {
  habitConsistencyLabel,
  useHabitCheckIn,
  type SerializedHabit,
} from "~/shared/habits";
import { ArchiveIcon } from "~/shared/icons";
import { LoadMore, useKeysetPagination } from "~/shared/load-more";
import { ButtonLink } from "~/shared/ui";
import { SectionHeading } from "~/shared/ui/untitled/overrides/section-heading";
import { ViewSwitcher } from "~/shared/view-switcher";

import { HabitsTable } from "./HabitsTable";
import type { HabitsCollectionData } from "./habits-load.server";

export type HabitsCollectionProps = HabitsCollectionData;

interface HabitsPageData {
  readonly habits: readonly SerializedHabit[];
  readonly nextCursor: string | null;
  readonly failed: boolean;
}

function selectHabitsPage(data: HabitsPageData) {
  return {
    items: data.habits,
    nextCursor: data.nextCursor,
    failed: data.failed,
  };
}

function habitId(habit: SerializedHabit): string {
  return habit.id;
}

/** The subtitle, which is the product's promise about this screen in one line. */
const SUBTITLE = "Build consistency without turning life into a game.";

/** Untitled's bounded card boundary, as every migrated collection carries it. */
const CARD = "rounded-xl bg-primary shadow-xs ring-1 ring-secondary";

export function HabitsCollection({
  habits,
  nextCursor,
  scope,
  query,
  todayIso,
  firstDayOfWeek,
  overview,
  failed,
}: HabitsCollectionProps) {
  const search = useCollectionSearch();
  const checkIn = useHabitCheckIn();
  const isReloading = useCollectionLoading();

  const basePath = scope === "archived" ? "/habits/archived" : "/habits";
  const scopeKey = [
    scope === "all" ? "scope=all" : "",
    query === "" ? "" : `q=${encodeURIComponent(query)}`,
  ]
    .filter(Boolean)
    .join("&");
  const { items, hasMore, loading, loadFailed, loadMore } = useKeysetPagination<
    SerializedHabit,
    HabitsPageData
  >({
    firstPage: habits,
    // The `today` scope is a bounded set the loader read in full: there is no
    // cursor to follow, so the paginator is inert rather than absent — one code
    // path for the list, whichever scope it is drawing.
    initialCursor: nextCursor,
    path: `${basePath}${scopeKey ? `?${scopeKey}` : ""}`,
    select: selectHabitsPage,
    getId: habitId,
  });

  /*
   * ADR-086 — the loader is the truth; a patch is this client's guess and lives
   * only until the answer arrives. Dropping every patch when fresh data lands is
   * what keeps a refused check-in from being invisible.
   */
  useEffect(() => {
    checkIn.clearPatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the data.
  }, [habits]);

  const count = items.length;
  const noun = scope === "archived" ? "archived Habits" : "Habits";
  const filtered = query !== "";

  const listLabel =
    scope === "archived"
      ? "Archived habits, with every check-in they earned."
      : scope === "all"
        ? "Every active habit, with today’s state and this week’s progress."
        : "Habits, the ones today asks for first, with today’s state and this week’s progress.";

  const viewSwitcher = useMemo(
    () => (
      <ViewSwitcher
        options={[
          { value: "today", label: "Today", href: "/habits" },
          { value: "all", label: "All active", href: "/habits?scope=all" },
          { value: "archived", label: "Archived", href: "/habits/archived" },
        ]}
        value={scope}
        label="Habit views"
      />
    ),
    [scope],
  );

  return (
    <CollectionLayout
      className="dh-collection--flat dh-habits"
      keepViewsOnCompact
      isLoading={isReloading}
      title="Habits"
      subtitle={SUBTITLE}
      viewSwitcher={viewSwitcher}
      search={
        <CollectionSearchField
          value={search.draft}
          onChange={search.setDraft}
          label="Search Habits"
          placeholder="Search Habits"
          data-testid="habits-search"
        />
      }
      primaryAction={
        scope === "archived" ? undefined : (
          <ButtonLink variant="primary" href="/habits/new">
            <CreateActionLabel>New habit</CreateActionLabel>
          </ButtonLink>
        )
      }
      error={
        failed ? (
          <EmptyState
            title={`We couldn’t load your ${noun}`}
            description="Something went wrong. Please try again."
          />
        ) : undefined
      }
      isEmpty={
        !failed && count === 0 && !hasMore && scope !== "archived" && !filtered
      }
      emptySlot={
        <EmptyState
          icon={<EntityIcon type="habit" />}
          title="No habits yet"
          description="A habit is a behaviour you want to practise — not a task you must not forget. Choose how often, and check it off as you go."
          primaryAction={
            <ButtonLink variant="primary" href="/habits/new">
              <CreateActionLabel>New habit</CreateActionLabel>
            </ButtonLink>
          }
        />
      }
      isFilteredEmpty={
        !failed && count === 0 && !hasMore && (scope === "archived" || filtered)
      }
      filteredEmptySlot={
        <EmptyState
          icon={<EntityIcon type="habit" />}
          title={
            scope === "archived"
              ? "No archived habits"
              : "No habits match that search"
          }
          description={
            scope === "archived"
              ? "Habits you archive appear here, with every check-in they earned. Archiving is putting something down, not failing at it."
              : "Try a different word, or clear the search to see every habit."
          }
        />
      }
    >
      <div className="flex min-w-0 flex-col gap-4">
        <HabitsTable
          habits={items}
          firstDayOfWeek={firstDayOfWeek}
          todayIso={todayIso}
          checkIn={checkIn}
          label={listLabel}
          band={
            overview === null || scope === "archived" ? undefined : (
              <HabitsBand overview={overview} />
            )
          }
          footer={
            <div className="flex flex-col gap-2 border-t border-secondary px-4 py-3">
              {!failed && hasMore ? (
                <LoadMore
                  loading={loading}
                  loadFailed={loadFailed}
                  onLoadMore={loadMore}
                  label={`Load more ${noun}`}
                />
              ) : null}
              {/*
               * The door to the archive. It is the archived TAB's destination
               * said a second way, at the bottom of the list where someone who
               * has scrolled the whole collection is standing — a plain link, so
               * it performs the same navigation the switcher does.
               */}
              {scope === "archived" ? null : (
                <p className="m-0 text-center">
                  <a
                    className="inline-flex min-h-[var(--app-touch-target-min)] items-center gap-2 text-sm text-tertiary no-underline transition duration-100 ease-linear hover:text-secondary_hover hover:underline"
                    href="/habits/archived"
                  >
                    <ArchiveIcon aria-hidden="true" />
                    Show archived habits
                  </a>
                </p>
              )}
            </div>
          }
        />

        {overview === null || overview.goals.length === 0 ? null : (
          <SupportingGoals goals={overview.goals} />
        )}
      </div>

      {/* One polite live region for the whole collection: every tick announces
          its outcome once, in the same words Today uses. */}
      <p className="dh-visually-hidden" role="status" aria-live="polite">
        {checkIn.announcement ?? ""}
      </p>
    </CollectionLayout>
  );
}

/* -------------------------------------------------------------------------- */
/* The band                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Three figures, in the order the questions are asked, as Untitled's in-card
 * divided band.
 *
 * Each is a count or a ratio of two counts, and each states its own denominator
 * on the line beneath it. Nothing is red, nothing counts a streak, and a day
 * that has not happened is never counted as a day that went wrong.
 */
function HabitsBand({
  overview,
}: {
  readonly overview: NonNullable<HabitsCollectionData["overview"]>;
}) {
  const consistency = habitConsistencyLabel({
    expected: overview.consistencyExpected,
    completed: overview.consistencyCompleted,
  });

  const figures = [
    {
      id: "due",
      label: "Due today",
      value: String(overview.dueTodayCount),
      supporting:
        overview.dueTodayCount === 0
          ? "Nothing is asked of today"
          : overview.openTodayCount === 0
            ? "All done"
            : `${overview.openTodayCount} still open`,
    },
    {
      id: "week",
      label: "This week",
      /*
       * A week that expected nothing has no ratio, and "0 of 0" would invent a
       * measurement nobody made. It says so in words instead.
       */
      value:
        overview.weekExpected === 0
          ? "—"
          : `${overview.weekCompleted} of ${overview.weekExpected}`,
      supporting:
        overview.weekExpected === 0
          ? "Nothing expected this week"
          : "Expected check-ins completed",
    },
    {
      id: "consistency",
      label: "Recent consistency",
      value:
        overview.consistencyPercent === null
          ? "—"
          : `${overview.consistencyPercent}%`,
      supporting: consistency ?? "Nothing expected in the last four weeks",
    },
  ];

  return (
    /*
     * Three columns at every width, not a stack on a phone.
     *
     * Stacked, the band cost ~230px of a 390px viewport and pushed the first
     * Habit — the only thing on the page that can be acted on — below the fold.
     * Three columns fit at 320 because the DENOMINATOR line, which is the
     * longest part of each figure, is the part a phone can afford to drop: it
     * restates what the label and the figure already say, and it is still in the
     * document for assistive tech.
     */
    <dl
      className="m-0 grid grid-cols-3 divide-x divide-secondary border-b border-secondary"
      data-testid="habits-stats"
    >
      {figures.map((figure) => (
        <div
          key={figure.id}
          className="flex min-w-0 flex-col gap-0.5 px-3 py-3 sm:px-4"
          data-testid={`habits-stat-${figure.id}`}
        >
          <dt className="text-xs font-semibold text-quaternary">
            {figure.label}
          </dt>
          <dd className="m-0 text-lg font-semibold text-primary tabular-nums sm:text-xl">
            {figure.value}
          </dd>
          <dd className="m-0 text-xs text-tertiary max-sm:sr-only">
            {figure.supporting}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* -------------------------------------------------------------------------- */
/* Supporting goals                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The Goals these behaviours support.
 *
 * EVIDENCE, not measurement, and the rule is restated here because this is
 * exactly where it would be forgotten: a Habit does not move a Goal's progress,
 * so nothing on this card is a percentage of one. The Habits are chips because
 * they are DESTINATIONS — a link wearing Untitled's badge geometry — rather than
 * a React Aria `TagGroup`, whose items are things you select or remove.
 */
function SupportingGoals({
  goals,
}: {
  readonly goals: NonNullable<HabitsCollectionData["overview"]>["goals"];
}) {
  return (
    <section
      className={`${CARD} flex min-w-0 flex-col`}
      aria-labelledby="habits-goals-heading"
      data-testid="habits-goals"
    >
      <div className="px-4 pt-4 pb-3">
        <SectionHeading
          id="habits-goals-heading"
          level={2}
          title="Supporting goals"
          description="Habits are evidence a Goal is being worked at. They never change its measured progress."
        />
      </div>
      <ul className="m-0 flex list-none flex-col divide-y divide-secondary border-t border-secondary p-0">
        {goals.map((goal) => (
          <li
            className="flex min-w-0 flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            key={goal.id}
          >
            <span className="flex min-w-0 flex-col">
              <a
                className="truncate text-sm font-medium text-primary no-underline outline-focus-ring hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                href={`/goals/${encodeURIComponent(goal.id)}`}
              >
                {goal.title}
              </a>
              <span className="text-xs text-tertiary">
                {goal.habits.length === 1
                  ? "1 supporting habit"
                  : `${goal.habits.length} supporting habits`}
              </span>
            </span>
            <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
              {goal.habits.map((habit) => (
                <li key={habit.id}>
                  <a
                    className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium text-secondary no-underline ring-1 ring-secondary transition duration-100 ease-linear outline-focus-ring hover:bg-primary_hover focus-visible:outline-2 focus-visible:outline-offset-2"
                    href={`/habits/${encodeURIComponent(habit.id)}`}
                  >
                    {habit.title}
                  </a>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
