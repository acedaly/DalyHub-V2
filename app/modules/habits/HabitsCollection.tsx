/**
 * HABITS-01 / UX-02 — the Habits collection (presentation, no server imports).
 *
 * Rebuilt to `Mockup 8.png`. The frame is unchanged and deliberately so: the
 * shared PX-02 Collection Layout, the shared search field, the shared view
 * switcher and bounded "Load more" pagination. What UX-02 adds is everything the
 * mockup draws INSIDE that frame, and every piece of it is a shared object:
 *
 *   - a **glance row** of four figures — `StatCard`/`StatCardRow` (DS-13/UIX-01),
 *     which existed with no consumer until now;
 *   - a **four-column table** — the ONE `HabitRow` in its `columns` layout,
 *     inside the `HabitList` that declares the grid once (DS-04's device);
 *   - a **rail**: what today asks for, which Goals these behaviours support, and
 *     the week in three figures.
 *
 * ── The rail duplicates nothing ─────────────────────────────────────────────
 * Its "Today" card is a SHORTLIST of the table's own rows — the ones the day asks
 * for — and it exists because the table is ordered by that same rule and can run
 * past the fold. Both draw the same `HabitRow` and both post through the same one
 * check-in authority, so they cannot disagree; the rail is the top of the list,
 * not a second reading of it.
 *
 * ── Checking in from here uses the ONE authority ────────────────────────────
 * The row's control posts through `useHabitCheckIn` to `/habits/:id/check-in` —
 * the exact call Today makes. Nothing about a tick is different depending on
 * where it was made, and the loader's revalidation is what puts the week's
 * counts back in agreement rather than arithmetic in the browser.
 *
 * ── The figures never manufacture urgency ───────────────────────────────────
 * Every one of them states its denominator ("12 of 16 expected check-ins"), and
 * the percentage is drawn beside those words rather than instead of them. Nothing
 * is red, nothing counts a streak, and a day that has not happened is not counted
 * as a day that went wrong.
 */

import { useEffect, useMemo } from "react";

import { StatCard, StatCardItem, StatCardRow } from "~/shared/card";
import { ProgressRing } from "~/shared/charts";
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
  HabitList,
  HabitRow,
  habitConsistencyLabel,
  habitDueToday,
  useHabitCheckIn,
} from "~/shared/habits";
import type { SerializedHabit } from "~/shared/habits";
import {
  ArchiveIcon,
  CheckCircleIcon,
  GoalIcon,
  HabitIcon,
  TodayIcon,
} from "~/shared/icons";
import { LoadMore, useKeysetPagination } from "~/shared/load-more";
import { ViewSwitcher } from "~/shared/view-switcher";

import type {
  HabitCollectionScope,
  HabitsCollectionData,
} from "./habits-load.server";

/** How many Habits the rail's Today card lists before it defers to the table. */
const RAIL_TODAY_LIMIT = 6;

/** How many Goals the rail's supporting card names. */
const RAIL_GOAL_LIMIT = 4;

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
      ? "Archived habits"
      : scope === "all"
        ? "All active habits"
        : "Habits, the ones today asks for first";

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

  const onCheckedChange = (habit: SerializedHabit) =>
    habit.archived
      ? undefined
      : (checked: boolean) =>
          checkIn.setChecked({
            habitId: habit.id,
            title: habit.title,
            dateIso: todayIso,
            checked,
          });

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
          <a className="dh-btn dh-btn--primary" href="/habits/new">
            <CreateActionLabel>New habit</CreateActionLabel>
          </a>
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
            <a className="dh-btn dh-btn--primary" href="/habits/new">
              <CreateActionLabel>New habit</CreateActionLabel>
            </a>
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
      {overview === null ? null : <HabitsStats overview={overview} />}

      <div className="dh-habits__body">
        <section className="dh-habits__main" aria-label={listLabel}>
          <HabitList ariaLabel={listLabel} columns data-testid="habit-list">
            {items.map((habit) => (
              <HabitRow
                key={habit.id}
                habit={habit}
                layout="columns"
                firstDayOfWeek={firstDayOfWeek}
                doneOverride={checkIn.patches.get(habit.id)?.done}
                href={`/habits/${encodeURIComponent(habit.id)}`}
                onCheckedChange={onCheckedChange(habit)}
              />
            ))}
          </HabitList>

          {!failed && hasMore ? (
            <LoadMore
              loading={loading}
              loadFailed={loadFailed}
              onLoadMore={loadMore}
              label={`Load more ${noun}`}
            />
          ) : null}

          {/*
           * The mockup's footer door. It is the archived TAB's destination said a
           * second way, at the bottom of the list where someone who has scrolled
           * the whole collection is standing — and it is a plain link, so it is
           * the same navigation the switcher performs.
           */}
          {scope === "archived" ? null : (
            <p className="dh-habits__footer">
              <a className="dh-habits__footer-link" href="/habits/archived">
                <ArchiveIcon aria-hidden="true" />
                Show archived habits
              </a>
            </p>
          )}
        </section>

        {overview === null ? null : (
          <HabitsRail
            overview={overview}
            todayIso={todayIso}
            checkIn={checkIn}
            scope={scope}
          />
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
/* The glance row                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Four figures, and each one is a count of something the owner can go and look
 * at. `StatCard` is the shared object (UIX-01's glance row) — no bespoke tile,
 * no dashboard, and four is its stated maximum.
 *
 * The fourth is the only proportion on the screen. It is drawn WITH the two
 * integers it comes from, on the card's supporting line, so the percentage never
 * appears without its denominator (ADR-104).
 */
function HabitsStats({
  overview,
}: {
  readonly overview: NonNullable<HabitsCollectionData["overview"]>;
}) {
  const consistency = habitConsistencyLabel({
    expected: overview.consistencyExpected,
    completed: overview.consistencyCompleted,
  });
  return (
    <StatCardRow label="Habits at a glance" data-testid="habits-stats">
      <StatCardItem>
        <StatCard
          label="Active"
          value={String(overview.activeCount)}
          accent="violet"
          icon={<HabitIcon />}
          supporting={
            overview.truncated
              ? `The first ${overview.activeCount} — these figures cover them`
              : undefined
          }
          data-testid="habits-stat-active"
        />
      </StatCardItem>
      <StatCardItem>
        <StatCard
          label="Due today"
          value={String(overview.dueTodayCount)}
          accent="blue"
          icon={<TodayIcon />}
          supporting={
            overview.dueTodayCount === 0
              ? "Nothing is asked of today"
              : `${overview.openTodayCount} still open`
          }
          data-testid="habits-stat-due"
        />
      </StatCardItem>
      <StatCardItem>
        <StatCard
          label="Completed this week"
          value={String(overview.completedThisWeek)}
          accent="green"
          icon={<CheckCircleIcon />}
          data-testid="habits-stat-completed"
        />
      </StatCardItem>
      <StatCardItem>
        <StatCard
          label="Recent consistency"
          /*
           * A window that expected nothing has no proportion, and "0%" would be
           * a verdict on days nobody was asked for anything. It says so in words
           * instead — the same rule `habitConsistencyLabel` follows.
           */
          value={
            overview.consistencyPercent === null
              ? "—"
              : `${overview.consistencyPercent}%`
          }
          accent="teal"
          supporting={consistency ?? "Nothing expected yet"}
          ring={
            overview.consistencyPercent === null ? undefined : (
              <ProgressRing
                value={overview.consistencyPercent / 100}
                label={`Recent consistency: ${consistency}`}
                size={44}
                thickness={5}
              />
            )
          }
          data-testid="habits-stat-consistency"
        />
      </StatCardItem>
    </StatCardRow>
  );
}

/* -------------------------------------------------------------------------- */
/* The rail                                                                   */
/* -------------------------------------------------------------------------- */

function HabitsRail({
  overview,
  todayIso,
  checkIn,
  scope,
}: {
  readonly overview: NonNullable<HabitsCollectionData["overview"]>;
  readonly todayIso: string;
  readonly checkIn: ReturnType<typeof useHabitCheckIn>;
  readonly scope: HabitCollectionScope;
}) {
  const due = overview.habits.filter((habit) => habitDueToday(habit));
  const shown = due.slice(0, RAIL_TODAY_LIMIT);
  const goals = overview.goals.slice(0, RAIL_GOAL_LIMIT);
  const weekLabel = habitConsistencyLabel({
    expected: overview.weekExpected,
    completed: overview.weekCompleted,
  });

  return (
    <aside
      className="dh-habits__rail"
      aria-label="Habits aids"
      data-testid="habits-rail"
    >
      <section
        className="dh-habits-card dh-habits-card--today"
        aria-labelledby="habits-today-heading"
        data-testid="habits-today"
      >
        <header className="dh-habits-card__head">
          <h2 className="dh-habits-card__title" id="habits-today-heading">
            Today
          </h2>
          {/* A FIGURE beside the word, not a badge — the Task group's rule. */}
          <span className="dh-habits-card__count">{due.length}</span>
        </header>
        {due.length === 0 ? (
          <p className="dh-habits-card__empty">
            Nothing is asked of today. An unscheduled day is not a missed one.
          </p>
        ) : (
          <>
            {/* The SAME row and the SAME check-in authority as the table — the
                compact density, because a rail's scarce dimension is height. */}
            <HabitList ariaLabel="Habits due today">
              {shown.map((habit) => (
                <HabitRow
                  key={habit.id}
                  habit={habit}
                  density="compact"
                  doneOverride={checkIn.patches.get(habit.id)?.done}
                  href={`/habits/${encodeURIComponent(habit.id)}`}
                  onCheckedChange={(checked) =>
                    checkIn.setChecked({
                      habitId: habit.id,
                      title: habit.title,
                      dateIso: todayIso,
                      checked,
                    })
                  }
                />
              ))}
            </HabitList>
            {/* Only when the card is actually holding some back — a door to a
                list you are already looking at is noise. */}
            {due.length > shown.length || scope !== "today" ? (
              <p className="dh-habits-card__foot">
                <a className="dh-habits-card__link" href="/habits">
                  View all due today
                </a>
              </p>
            ) : null}
          </>
        )}
      </section>

      {goals.length === 0 ? null : (
        <section
          className="dh-habits-card"
          aria-labelledby="habits-goals-heading"
          data-testid="habits-goals"
        >
          <header className="dh-habits-card__head">
            <h2 className="dh-habits-card__title" id="habits-goals-heading">
              <GoalIcon aria-hidden="true" />
              Supporting goals
            </h2>
          </header>
          <ul className="dh-habits-goals">
            {goals.map((goal) => (
              <li className="dh-habits-goals__item" key={goal.id}>
                <a
                  className="dh-habits-goals__name"
                  href={`/goals/${encodeURIComponent(goal.id)}`}
                >
                  {goal.title}
                </a>
                <p className="dh-habits-goals__count">
                  {goal.habits.length === 1
                    ? "1 supporting habit"
                    : `${goal.habits.length} supporting habits`}
                </p>
                <ul className="dh-habits-goals__habits">
                  {goal.habits.map((habit) => (
                    <li key={habit.id}>
                      <a
                        className="dh-habits-goals__chip"
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
          {/*
           * EVIDENCE, not measurement. HABITS-01's rule is unchanged and stated
           * here because this card is exactly where it would be forgotten: a
           * Habit does not move a Goal's progress, and nothing on this card is a
           * percentage of one.
           */}
          <p className="dh-habits-card__note">
            Habits are evidence a Goal is being worked at. They never change its
            measured progress.
          </p>
        </section>
      )}

      <section
        className="dh-habits-card"
        aria-labelledby="habits-week-heading"
        data-testid="habits-week"
      >
        <header className="dh-habits-card__head">
          <h2 className="dh-habits-card__title" id="habits-week-heading">
            Week at a glance
          </h2>
        </header>
        <ul className="dh-habits-week">
          <li className="dh-habits-week__item">
            <span className="dh-habits-week__value">
              {weekLabel === null
                ? "—"
                : `${overview.weekCompleted} of ${overview.weekExpected}`}
            </span>
            <span className="dh-habits-week__label">
              {weekLabel === null
                ? "Nothing expected this week"
                : "Expected check-ins completed"}
            </span>
          </li>
          <li className="dh-habits-week__item">
            <span className="dh-habits-week__value">
              {overview.doneTodayCount}
            </span>
            <span className="dh-habits-week__label">
              Habits completed today
            </span>
          </li>
          <li className="dh-habits-week__item">
            <span className="dh-habits-week__value">
              {overview.openTodayCount}
            </span>
            <span className="dh-habits-week__label">
              {/* "Still open", never "missed": the day is not over. */}
              Routines still open
            </span>
          </li>
        </ul>
      </section>
    </aside>
  );
}
