/**
 * V2.8 CONV-02 — the Waiting collection, drawn as the SHARED Task row.
 *
 * Until this item `/today/waiting` rendered a read-only generic `Card` with
 * hand-built props (`WaitingTaskCard.tsx`): no completion control, no editor,
 * no menu, a second responsive ladder that hid priority and the waiting subject
 * below 26rem — and it was the ONE surface that drew RECALL-03's follow-up
 * fact, which the shared row had no field for (DEBT-128). So the fork widened
 * in V2.7 in the direction DEBT-175 did not predict: the Card path had a fact
 * the row lacked.
 *
 * The surface now renders the shared `TaskRow` inside the shared `TaskList`,
 * over the shared `SerializedTaskListItem` (the Waiting read returns the shared
 * list-item shape, narrowed), and everything about a ROW is the row's:
 *
 *   - the anatomy and its responsive ladder (`task-list.css` — this surface
 *     declares no breakpoint and hides no fact);
 *   - the inline title, due, priority and Project editors, the overflow set
 *     (`buildTaskRowActions`), the recurrence and checklist signals, the
 *     parent mark, swipe with its visible non-swipe equivalents;
 *   - the waiting FACT — subject, since · elapsed, follow-up state — through the
 *     row's one optional `waiting` slot (`taskRowWaitingFact`), formatted by the
 *     canonical helpers. Nothing here formats a date or a subject;
 *   - completion with DHDS-11's departure: completing a waiting Task clears its
 *     waiting state atomically (ADR-029 §29.4a), so the loader's next answer no
 *     longer holds it and the row LEAVES with focus handed on
 *     (`useDepartingRows`) — membership is the server's, never re-derived here;
 *   - ADR-086's optimistic patch map, hosted by the shared
 *     `useTaskSurfaceActions` — an accepted save paints at once, the server
 *     stays authoritative, a refusal rolls back exactly what it painted, and the
 *     outcome is announced once through this surface's single live region.
 *
 * ── What stays the surface's ───────────────────────────────────────────────
 * Its scope (the waiting population, V2.7 RECALL-03's one predicate), its
 * total order, its keyset pagination and page size, the follow-up filter and
 * its honest subtitle, the empty states and the "Load more" that never
 * navigates. Nothing else here is bespoke: no Waiting-specific row, card,
 * metadata run, completion control, formatter or mutation path.
 *
 * ── Capability contract: what this scope switches OFF, and why ─────────────
 * Shared anatomy is not every capability in every scope (ADR-115 decision 2).
 * Each absence below goes through the row's EXISTING contract — a handler not
 * passed, a slot left empty — never a fork of the row:
 *
 *   - **Selection and bulk** — not passed. Neither the roadmap item nor ADR-115
 *     asks the Waiting list to act on several rows at once, and the surface's
 *     purpose is "what am I waiting on, and who do I chase today"; a bulk
 *     workflow over delegated work is a decision with no evidence behind it,
 *     so no selection mode, no long-press and no bulk bar. The row's lead is
 *     the completion control at rest, which is what this surface wants.
 *   - **Drag** — no `dragHandle`. The list draws no drop destination and stores
 *     no order (its order is derived — overdue, then longest-waiting; DEBT-188
 *     stands), so there is nothing to drop on and nothing a drag could persist.
 *   - **Plan for today** — no `onPlanToday`. Today's day EXCLUDES waiting work
 *     ("blocked work is not today's work", TODAY-03), so the act would write a
 *     planned date the day never draws; the record's planning section remains
 *     the honest door. The row's swipe end-edge still opens the shared date
 *     editor for the DUE date, which is the deadline and is valid here.
 *   - **Snooze, a follow-up status, reminders** — not added anywhere; the
 *     follow-up date is edited where it has always been edited, in the Task
 *     record's Details form (`TaskDetailsTab`), reached from the row's "Open
 *     task" — one editor, one authority (V2.7 RECALL-03).
 *
 * ── Pagination survives the work done on it ────────────────────────────────
 * The shared keyset hook runs in `merge` mode: a mutation's revalidation
 * refreshes page one and merges it in by id, keeping every loaded page — the
 * TASKS-09 rule `/tasks` holds — rather than collapsing the owner back to the
 * first fifty. A row on page one that the server no longer returns departs; a
 * completed row on a later page stays, struck through, until the collection is
 * next read from the top, exactly as it does on `/tasks`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";

import type { TaskFollowUpState } from "~/kernel/tasks";
import { CollectionLayout } from "~/shared/collection-layout";
import { useDrawer, withDrawerPushed } from "~/shared/drawer";
import { EmptyState } from "~/shared/empty-state";
import { EntityIcon } from "~/shared/entity";
import { LoadMore, useKeysetPagination } from "~/shared/load-more";
import { TaskList } from "~/shared/task-record/TaskList";
import { TaskRow, type TaskRowProps } from "~/shared/task-record/TaskRow";
import type { TaskParentOption } from "~/shared/task-record/TaskRowFields";
import { TaskTitleEditor } from "~/shared/task-record/TaskTitleEditor";
import { buildTaskRowActions } from "~/shared/task-record/task-row-actions";
import {
  applyTaskListItemPatch,
  taskRowWaitingFact,
  toTaskRowProjection,
  type SerializedTaskListItem,
} from "~/shared/task-record/task-view";
import { useDepartingRows } from "~/shared/task-record/use-departing-rows";
import { useTaskSurfaceActions } from "~/shared/task-record/use-task-surface-actions";
import { ButtonLink } from "~/shared/ui";

import { waitingSubtitle } from "./waiting-view";
import { WAITING_FOLLOW_UP_PARAM, WAITING_HREF } from "../waiting-destination";

/** The subset of the Waiting loader's payload a "Load more" fetch reads back. */
export interface WaitingPageData {
  readonly items: readonly SerializedTaskListItem[];
  readonly nextCursor: string | null;
  readonly failed: boolean;
}

/** Stable module-level selector, so the shared hook's memo identity is stable. */
function selectWaitingPage(data: WaitingPageData) {
  return {
    items: data.items,
    nextCursor: data.nextCursor,
    failed: data.failed,
  };
}

function waitingItemId(item: SerializedTaskListItem): string {
  return item.id;
}

export interface WaitingTasksProps {
  readonly items: readonly SerializedTaskListItem[];
  readonly nextCursor: string | null;
  readonly followUp: TaskFollowUpState | null;
  /** The server's instant, for the elapsed phrase — hydration-stable. */
  readonly nowMs: number;
  /** The owner's calendar day, so a follow-up can say "Today". */
  readonly todayIso: string;
  /** The loader's bounded parent candidates, for the row's inline Project editor. */
  readonly parents: readonly TaskParentOption[];
  readonly failed: boolean;
}

export function WaitingTasks({
  items: firstPage,
  nextCursor,
  followUp,
  nowMs,
  todayIso,
  parents,
  failed,
}: WaitingTasksProps) {
  const { openDrawer } = useDrawer();
  const [searchParams] = useSearchParams();

  // The follow-up filter is part of the cursor's SCOPE, so it must be part of the
  // path a later page is requested from — a cursor issued under one filter is
  // rejected under another rather than reinterpreted.
  const path = useMemo(
    () =>
      followUp === null
        ? WAITING_HREF
        : `${WAITING_HREF}?${WAITING_FOLLOW_UP_PARAM}=${encodeURIComponent(followUp)}`,
    [followUp],
  );

  const { items, hasMore, loading, loadFailed, loadMore } = useKeysetPagination<
    SerializedTaskListItem,
    WaitingPageData
  >({
    firstPage,
    initialCursor: nextCursor,
    path,
    select: selectWaitingPage,
    getId: waitingItemId,
    // A mutation re-reads page one; the loaded pages beneath it survive.
    refresh: "merge",
  });

  /*
   * ADR-086, through the SHARED host — the same one Today, Plan and the Project
   * record use. This surface holds no optimistic state of its own.
   */
  const actions = useTaskSurfaceActions();
  const { clearPatches } = actions;
  // Fresh loader data is the truth; every client guess is dropped the moment it
  // arrives, which is what keeps a patch a guess rather than a second state.
  useEffect(() => {
    clearPatches();
  }, [firstPage, clearPatches]);

  /** DHDS-10 — which row (if any) is being renamed in place. At most one. */
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);

  /*
   * The page, re-painted against the OPTIMISTIC state through the shared
   * applier and re-projected by the shared projection. Membership is NOT
   * re-decided here: a completed row stays, struck through, until the loader's
   * answer no longer contains it — and then it departs.
   */
  const painted = useMemo(
    () =>
      items.map((task) =>
        applyTaskListItemPatch(task, actions.patches.get(task.id)),
      ),
    [items, actions.patches],
  );

  const listElement = useRef<HTMLUListElement | null>(null);
  const { rendered, isLeaving } = useDepartingRows(
    painted,
    actions.departing,
    listElement,
  );

  const openTask = useCallback((key: string) => openDrawer(key), [openDrawer]);

  /**
   * One waiting Task, as SHARED `TaskRow` props: data, callbacks, and the
   * row's one optional waiting fact. No `selection`, no `onLongPress`, no
   * `dragHandle`, no `onPlanToday` — see the file header for each.
   */
  const rowProps = useCallback(
    (task: SerializedTaskListItem): TaskRowProps => {
      const key = `task:${task.id}`;
      const row = toTaskRowProjection(task);
      const waiting = taskRowWaitingFact(task, nowMs);
      return {
        task: row,
        todayIso,
        parents,
        // The pane title is h1; rows are h2 so the heading order never skips.
        headingLevel: 2,
        href: `?${withDrawerPushed(searchParams, key).toString()}`,
        onOpen: () => openTask(key),
        onCompletedChange: (complete: boolean) =>
          actions.setCompleted(task.id, complete, task.title),
        onInlineSave: actions.reportInlineSave,
        current: searchParams.get("drawer") === key,
        leaving: isLeaving(task.id),
        ...(waiting !== null ? { waiting } : {}),
        overflowActions: buildTaskRowActions(row, {
          onOpenRecord: () => openTask(key),
          onRename: () => setEditingTitleId(task.id),
          onMoveToParent: () => openTask(`task-move:${task.id}`),
          onSomeday: () =>
            actions.setField(
              task.id,
              { intent: "set_commitment", commitment: "someday" },
              `${task.title} moved to Someday / Maybe.`,
              { commitmentState: "someday" },
            ),
          onSkipOccurrence: () =>
            actions.setRecord(
              task.id,
              { intent: "skip_occurrence" },
              `Skipped this occurrence of ${task.title}.`,
            ),
          onStopRepeating: () =>
            actions.setRecord(
              task.id,
              { intent: "set_recurrence" },
              `${task.title} no longer repeats.`,
            ),
        }),
        // The editor replaces the title ONLY while this row is being renamed.
        ...(editingTitleId === task.id
          ? {
              titleEditor: (
                <TaskTitleEditor
                  taskId={task.id}
                  title={task.title}
                  onDone={() => setEditingTitleId(null)}
                  onSaved={(id, title) =>
                    actions.reportInlineSave({
                      taskId: id,
                      intent: "rename",
                      message: `Renamed to ${title}.`,
                      patch: { title },
                    })
                  }
                  // PWA-12 — a rename accepted locally while offline is
                  // painted and said to be waiting, never silently dropped.
                  onQueued={actions.reportQueuedTitle}
                />
              ),
            }
          : {}),
      };
    },
    [
      nowMs,
      todayIso,
      parents,
      searchParams,
      openTask,
      actions,
      isLeaving,
      editingTitleId,
    ],
  );

  // The count is the LOADED population the loader answered — server truth,
  // never a client-side decrement — which is what the honest subtitle states.
  const count = items.length;
  const subtitle = waitingSubtitle({
    loaded: count,
    hasMore,
    followUp,
    failed,
  });

  return (
    <CollectionLayout
      title="Waiting"
      subtitle={subtitle}
      error={
        failed ? (
          <EmptyState
            title="We couldn’t load your waiting tasks"
            description="Something went wrong. Please try again."
          />
        ) : undefined
      }
      isEmpty={!failed && count === 0}
      emptySlot={
        <EmptyState
          icon={<EntityIcon type="task" />}
          title={
            followUp === null
              ? "Nothing’s waiting"
              : "No follow-ups match this filter"
          }
          description={
            followUp === null
              ? "When a task is blocked on someone or something else, mark it as waiting from the task’s drawer and it will appear here."
              : "Every waiting task with a follow-up date has been dealt with. Open Waiting without a filter to see them all."
          }
          primaryAction={
            followUp === null ? undefined : (
              <ButtonLink href={WAITING_HREF} variant="secondary">
                Show all waiting tasks
              </ButtonLink>
            )
          }
        />
      }
    >
      <TaskList
        ariaLabel="Waiting tasks"
        listRef={(element) => {
          listElement.current = element;
        }}
      >
        {rendered.map((task) => (
          <TaskRow key={task.id} {...rowProps(task)} />
        ))}
      </TaskList>
      {hasMore ? (
        <LoadMore
          loading={loading}
          loadFailed={loadFailed}
          onLoadMore={loadMore}
          label="Load more waiting tasks"
        />
      ) : null}
      {/* Every row mutation announces its outcome once, politely — the SAME
          channel `/tasks`, Today, Plan and the Project record use. A refusal
          is a notification instead, because a failure has to interrupt. */}
      <p className="dh-visually-hidden" role="status" aria-live="polite">
        {actions.announcement ?? ""}
      </p>
    </CollectionLayout>
  );
}
