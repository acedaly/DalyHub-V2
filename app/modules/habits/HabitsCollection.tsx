/**
 * HABITS-01 — the Habits collection (presentation, no server imports).
 *
 * A first-class collection in DalyHub's current grammar: the shared PX-02
 * Collection Layout, the shared search field, the shared Active/Archived view
 * switcher and bounded "Load more" pagination — composed entirely from the
 * shared frame, with the ONE shared `HabitRow` doing the drawing.
 *
 * ── It is a LIST, not a gallery of cards ────────────────────────────────────
 * DESIGN_SYSTEM's card-vs-list rule puts "any repeated homogeneous content" in a
 * list, and a Habit is exactly that: a short title, a cadence, a context and two
 * counts. A grid of Habit cards would spend a whole tile on four words and turn
 * a five-second morning scan into a page of rectangles. So the collection takes
 * the flat ground (`dh-collection--flat`) with hairline-separated rows, as Notes
 * and the Tasks list do.
 *
 * ── Checking in from here uses the ONE authority ────────────────────────────
 * The row's control posts through `useHabitCheckIn` to `/habits/:id/check-in` —
 * the exact call Today makes. Nothing about a tick is different depending on
 * where it was made, and the loader's revalidation is what puts the week's
 * counts back in agreement rather than arithmetic in the browser.
 */

import { useEffect, useMemo } from "react";

import {
  CollectionLayout,
  CollectionSearchField,
  collectionCountLabel,
  CreateActionLabel,
  useCollectionLoading,
  useCollectionSearch,
} from "~/shared/collection-layout";
import { EmptyState } from "~/shared/empty-state";
import { EntityIcon } from "~/shared/entity";
import { HabitRow, useHabitCheckIn } from "~/shared/habits";
import type { SerializedHabit } from "~/shared/habits";
import { LoadMore, useKeysetPagination } from "~/shared/load-more";
import { ViewSwitcher } from "~/shared/view-switcher";

export type HabitCollectionStatus = "active" | "archived";

export interface HabitsCollectionProps {
  readonly habits: readonly SerializedHabit[];
  readonly nextCursor: string | null;
  readonly status: HabitCollectionStatus;
  readonly query: string;
  readonly todayIso: string;
  readonly failed: boolean;
}

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

export function HabitsCollection({
  habits,
  nextCursor,
  status,
  query,
  todayIso,
  failed,
}: HabitsCollectionProps) {
  const search = useCollectionSearch();
  const checkIn = useHabitCheckIn();
  const isReloading = useCollectionLoading();

  const basePath = status === "archived" ? "/habits/archived" : "/habits";
  const scopeKey = query === "" ? "" : `q=${encodeURIComponent(query)}`;
  const { items, hasMore, loading, loadFailed, loadMore } = useKeysetPagination<
    SerializedHabit,
    HabitsPageData
  >({
    firstPage: habits,
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
  const noun = status === "archived" ? "archived Habits" : "Habits";
  const filtered = query !== "";
  const subtitle = failed
    ? `We couldn’t load your ${noun}.`
    : collectionCountLabel(count, "Habit", "Habits", {
        hasMore,
        ...(status === "archived" ? { scope: "archived" } : {}),
      });

  const listLabel = status === "archived" ? "Archived habits" : "Habits";

  const viewSwitcher = useMemo(
    () => (
      <ViewSwitcher
        options={[
          { value: "active", label: "Active", href: "/habits" },
          { value: "archived", label: "Archived", href: "/habits/archived" },
        ]}
        value={status}
        label="Habit views"
      />
    ),
    [status],
  );

  return (
    <CollectionLayout
      className="dh-collection--flat dh-habits"
      keepViewsOnCompact
      isLoading={isReloading}
      title="Habits"
      subtitle={subtitle}
      viewSwitcher={viewSwitcher}
      filterBar={
        <CollectionSearchField
          value={search.draft}
          onChange={search.setDraft}
          label="Search Habits"
          placeholder="Search Habits"
          data-testid="habits-search"
        />
      }
      primaryAction={
        status === "active" ? (
          <a className="dh-btn dh-btn--primary" href="/habits/new">
            <CreateActionLabel>New habit</CreateActionLabel>
          </a>
        ) : undefined
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
        !failed && count === 0 && !hasMore && status === "active" && !filtered
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
        !failed && count === 0 && !hasMore && (status !== "active" || filtered)
      }
      filteredEmptySlot={
        <EmptyState
          icon={<EntityIcon type="habit" />}
          title={
            status === "archived"
              ? "No archived habits"
              : "No habits match that search"
          }
          description={
            status === "archived"
              ? "Habits you archive appear here, with every check-in they earned. Archiving is putting something down, not failing at it."
              : "Try a different word, or clear the search to see every habit."
          }
        />
      }
    >
      <ul
        className="dh-habit-list"
        aria-label={listLabel}
        data-testid="habit-list"
      >
        {items.map((habit) => (
          <HabitRow
            key={habit.id}
            habit={habit}
            doneOverride={checkIn.patches.get(habit.id)?.done}
            href={`/habits/${encodeURIComponent(habit.id)}`}
            onCheckedChange={
              habit.archived
                ? undefined
                : (checked) =>
                    checkIn.setChecked({
                      habitId: habit.id,
                      title: habit.title,
                      dateIso: todayIso,
                      checked,
                    })
            }
          />
        ))}
      </ul>
      {!failed && hasMore ? (
        <LoadMore
          loading={loading}
          loadFailed={loadFailed}
          onLoadMore={loadMore}
          label={`Load more ${noun}`}
        />
      ) : null}
      {/* One polite live region for the whole collection: every tick announces
          its outcome once, in the same words Today uses. */}
      <p className="dh-visually-hidden" role="status" aria-live="polite">
        {checkIn.announcement ?? ""}
      </p>
    </CollectionLayout>
  );
}
