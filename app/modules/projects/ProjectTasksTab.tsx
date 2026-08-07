/**
 * PROJ-01 — the project overview's Tasks tab.
 *
 * The project's real child tasks using the shared DS-04 Card and the shared task
 * semantics (completion = the spine's `completedAt`; waiting = the TODAY-03 state;
 * scheduled vs due kept distinct). A restrained open/completed/all filter (URL
 * `?tasks=`) and an "Add task" affordance that opens the shared create Drawer. A task
 * Card opens the SAME shared Task Drawer used on Today (`?drawer=task:<id>`), so the
 * project stays behind the Drawer and the task is edited the one canonical way.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFetcher, useLocation, useSearchParams } from "react-router";

import { Card, CardCollection } from "~/shared/card";
import type { CardMetaItem, CardProps } from "~/shared/card";
import { DrawerTrigger, useDrawer, withDrawerPushed } from "~/shared/drawer";
import { EntityIcon, isEntityType } from "~/shared/entity";
import { EmptyState } from "~/shared/empty-state";
import { LoadMore } from "~/shared/load-more";
import { SegmentedFilter } from "~/shared/segmented-filter";
import { PriorityIndicator } from "~/shared/task-record/PriorityIndicator";
import { UrgencyChip } from "~/shared/task-record/UrgencyChip";
import {
  isTaskWaiting,
  taskDisplayState,
  waitingSubjectLabel,
} from "~/shared/task-record/task-view";

import type { SerializedProjectTask } from "./project-view";

const TASK_STATE_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "completed", label: "Completed" },
  { value: "all", label: "All" },
] as const;

/** The drawer key that opens the "New Task" create form. */
export const NEW_TASK_KEY = "new-task";

type TaskState = "open" | "completed" | "all";

interface ProjectTasksTabProps {
  readonly projectId: string;
  readonly tasks: readonly SerializedProjectTask[];
  /** Opaque cursor for the next task page from the loader, or null when exhausted. */
  readonly nextCursor: string | null;
  readonly taskState: TaskState;
  readonly todayIso: string;
  /**
   * PROJ-05: an archived project is read-only — creating a Task under it is
   * always rejected server-side, so "Add task" is HIDDEN (not disabled) rather
   * than offered and failing.
   */
  readonly archived?: boolean;
}

/** The subset of the tasks endpoint's payload a "Load more" fetch reads back. */
type TasksPageData = {
  readonly tasks: readonly SerializedProjectTask[];
  readonly nextCursor: string | null;
};

/**
 * True when two location searches differ ONLY in the `?drawer=` param — i.e. the
 * navigation opened, closed or swapped the task Drawer and changed nothing about
 * which tasks the list should show. Everything else (the `?tasks=` filter, or a
 * fully-identical URL — the signature of an in-place mutation revalidation) is NOT
 * drawer-only.
 */
function isDrawerOnlyChange(prev: string, next: string): boolean {
  if (prev === next) {
    return false;
  }
  const a = new URLSearchParams(prev);
  const b = new URLSearchParams(next);
  const drawerDiffers = a.get("drawer") !== b.get("drawer");
  a.delete("drawer");
  b.delete("drawer");
  return drawerDiffers && a.toString() === b.toString();
}

/**
 * Accumulate keyset pages of a project's tasks behind "Load more" WITHOUT
 * navigating — a fetcher hits the dedicated `/projects/:id/tasks` endpoint, so the
 * record route's `?drawer=task:<id>` state, scroll position and focus are never
 * disturbed by loading more rows (pagination state and drawer state stay wholly
 * independent). The loader's first page seeds the list; duplicate ids are collapsed
 * defensively so a task card can never render twice.
 *
 * Reset policy — the accumulation is dropped when (and only when) the task set may
 * have changed underneath it:
 *   - the `?tasks=` filter changed (a different result set), OR
 *   - the loader re-ran with the URL otherwise UNCHANGED — the signature of a
 *     **mutation revalidation** (a task was completed, edited or created via the
 *     shared Drawer / the create form, whose action triggers a revalidation of this
 *     record loader). Dropping the appended pages here means a completed/edited/new
 *     task is RECONCILED from the authoritative fresh first page — no stale row
 *     lingers, and the roll-up and list stay consistent.
 * It is NOT dropped when the ONLY thing that changed was the `?drawer=` param
 * (opening/closing/swapping the Task Drawer), so pagination and drawer state stay
 * fully independent.
 */
function useProjectTaskPagination(
  projectId: string,
  firstPage: readonly SerializedProjectTask[],
  initialCursor: string | null,
  taskState: TaskState,
) {
  const fetcher = useFetcher<TasksPageData>();
  const location = useLocation();
  const [appended, setAppended] = useState<SerializedProjectTask[]>([]);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loadFailed, setLoadFailed] = useState(false);
  const processed = useRef<TasksPageData | null>(null);
  const prevFirstPage = useRef(firstPage);
  const prevSearch = useRef(location.search);
  // A monotonic pagination generation, bumped on every reset. Each "Load more"
  // captures the immutable request scope `{ gen, projectId }`; a response is
  // applied ONLY if that scope still matches the active project and generation, so
  // a late response from a "Load more" on project A that resolves after navigating
  // to project B is discarded rather than appended into B. Object identity alone is
  // insufficient — a stale response arrives as a NEW payload.
  const generation = useRef(0);
  const pending = useRef<{ gen: number; projectId: string } | null>(null);

  useEffect(() => {
    // `firstPage` is a loader-provided prop, so a new identity means the record
    // loader actually re-ran; a plain local re-render (load-more state) leaves it
    // unchanged and must not reset anything.
    if (prevFirstPage.current === firstPage) {
      prevSearch.current = location.search;
      return;
    }
    const drawerOnly = isDrawerOnlyChange(prevSearch.current, location.search);
    prevFirstPage.current = firstPage;
    prevSearch.current = location.search;
    if (drawerOnly) {
      // Opening/closing the Task Drawer — keep the accumulated pages.
      return;
    }
    // A filter change OR a mutation revalidation — reconcile from the fresh page,
    // and start a NEW generation so any in-flight request's response is discarded.
    generation.current += 1;
    pending.current = null;
    setAppended([]);
    setCursor(initialCursor);
    setLoadFailed(false);
    // Mark the current fetcher payload as already consumed rather than clearing the
    // marker: a stale `fetcher.data` from a prior "Load more" persists across this
    // reset, and nulling the marker would let the fold effect re-append it (re-adding
    // the page we just dropped). The next real "Load more" produces a new payload.
    processed.current = fetcher.data ?? null;
  }, [firstPage, location.search, initialCursor, fetcher.data]);

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) {
      return;
    }
    const data = fetcher.data;
    if (processed.current === data) {
      return;
    }
    processed.current = data;
    // Discard a stale response whose project or pagination generation no longer
    // matches the active one.
    const scope = pending.current;
    pending.current = null;
    if (
      !scope ||
      scope.projectId !== projectId ||
      scope.gen !== generation.current
    ) {
      return;
    }
    // The endpoint returns `{ tasks, nextCursor }` on success; a 4xx JSON body has
    // neither, so treat a missing `tasks` array as a calm, retryable failure.
    if (!Array.isArray(data.tasks)) {
      setLoadFailed(true);
      return;
    }
    setAppended((prev) => [...prev, ...data.tasks]);
    setCursor(data.nextCursor ?? null);
    setLoadFailed(false);
  }, [fetcher.state, fetcher.data, projectId]);

  const loadMore = useCallback(() => {
    if (cursor === null) {
      return;
    }
    setLoadFailed(false);
    pending.current = { gen: generation.current, projectId };
    fetcher.load(
      `/projects/${encodeURIComponent(projectId)}/tasks?state=${encodeURIComponent(taskState)}&cursor=${encodeURIComponent(cursor)}`,
    );
  }, [cursor, fetcher, projectId, taskState]);

  const items = useMemo(() => {
    const seen = new Set<string>();
    const out: SerializedProjectTask[] = [];
    for (const task of [...firstPage, ...appended]) {
      if (seen.has(task.id)) {
        continue;
      }
      seen.add(task.id);
      out.push(task);
    }
    return out;
  }, [firstPage, appended]);

  return {
    items,
    hasMore: cursor !== null,
    loading: fetcher.state !== "idle",
    loadFailed,
    loadMore,
  };
}

function toTaskCardProps(
  task: SerializedProjectTask,
  todayIso: string,
  openProps: (key: string) => { href: string; onOpen: () => void },
): CardProps {
  const waiting = isTaskWaiting(task);
  // The ONE canonical display-state evaluator (TASKS-02 retired the legacy
  // `taskDisplayStatus`, so every surface now resolves state identically).
  const status = taskDisplayState({
    deletedAt: null,
    completedAt: task.completedAt,
    status: task.status,
    commitmentState: task.commitmentState,
    timeSector: task.timeSector,
    scheduledDate: task.scheduledDate,
    waiting: task.waiting,
  });

  // Priority ≠ urgency ≠ display-state as three separable slots (TASKS-02): the
  // shared coloured indicators render on the Project's task cards too, not only in
  // Tasks, so priority is no longer absent from this surface (DEBT-28).
  const metadata: CardMetaItem[] = [];
  if (task.priority) {
    metadata.push({
      id: "priority",
      value: <PriorityIndicator priority={task.priority} />,
    });
  }
  if (task.dueDate || task.scheduledDate) {
    metadata.push({
      id: "urgency",
      value: <UrgencyChip task={task} todayIso={todayIso} />,
    });
  }
  if (waiting && task.waiting) {
    metadata.push({
      id: "waiting-for",
      label: "Waiting for",
      value: (
        <span className="dh-waiting-card__subject">
          {task.waiting.subject.kind === "entity" &&
          task.waiting.subject.type &&
          isEntityType(task.waiting.subject.type) ? (
            <EntityIcon type={task.waiting.subject.type} />
          ) : null}
          <span>{waitingSubjectLabel(task.waiting.subject)}</span>
        </span>
      ),
    });
  }

  return {
    id: task.id,
    title: task.title,
    typeLabel: "Task",
    icon: <EntityIcon type="task" />,
    // h3 under the tab's section h2 (record h1 → section h2 → card h3): a
    // non-skipping outline on the bare project record (DEBT-21).
    headingLevel: 3,
    status: { label: status.label, tone: status.tone },
    metadata,
    density: "comfortable",
    presentation: "list",
    openAriaLabel: `Open ${task.title}`,
    ...openProps(`task:${task.id}`),
  };
}

export function ProjectTasksTab({
  projectId,
  tasks,
  nextCursor,
  taskState,
  todayIso,
  archived = false,
}: ProjectTasksTabProps) {
  const { openDrawer } = useDrawer();
  const [searchParams] = useSearchParams();
  const { items, hasMore, loading, loadFailed, loadMore } =
    useProjectTaskPagination(projectId, tasks, nextCursor, taskState);

  const openProps = (key: string) => ({
    href: `?${withDrawerPushed(searchParams, key).toString()}`,
    onOpen: () => openDrawer(key),
  });

  return (
    <div className="dh-project-tasks">
      <h2 className="dh-visually-hidden">Tasks</h2>
      <div className="dh-project-tasks__toolbar">
        <SegmentedFilter
          param="tasks"
          options={TASK_STATE_OPTIONS}
          value={taskState}
          label="Filter tasks by state"
        />
        {/*
         * RECORD-01 — the ONE local creation action on this record.
         *
         * The contract keeps a local create only where context materially
         * matters and it beats the global +, and this one does: the form
         * already receives `projectId`, so a task created here lands in this
         * project with nothing for the owner to pick. It is low-emphasis
         * because it sits beside a filter, not because it is unimportant — the
         * loud tonal button it used to be competed with the tab strip and the
         * task rows for the same attention.
         *
         * The duplicate route was the header overflow's "New task", which
         * opened the GLOBAL capture sheet pre-seeded with this project: a
         * second mechanism for the same outcome, which is exactly the
         * local-vs-global confusion this PR set out to resolve. It is gone;
         * this is the local path and the global + is the generic one.
         */}
        {archived ? null : (
          <DrawerTrigger
            drawerKey={NEW_TASK_KEY}
            className="dh-btn dh-btn--text"
          >
            Add task
          </DrawerTrigger>
        )}
      </div>

      {items.length === 0 ? (
        /*
         * RECORD-01 — a record-level empty state is one calm line.
         *
         * An icon, a headline, a description and a primary button is the
         * COLLECTION treatment, and it was being spent here to say "no open
         * tasks" directly beneath an "Add task" control that was already
         * visible. The compact variant states the absence and stops.
         */
        <EmptyState
          size="inline"
          headingLevel={3}
          title={
            taskState === "completed"
              ? "No completed tasks"
              : taskState === "open"
                ? "No open tasks"
                : "No tasks yet"
          }
          description={
            archived
              ? "This archived project has no tasks matching this filter."
              : undefined
          }
        />
      ) : (
        <>
          <CardCollection
            items={items}
            getItemId={(task) => task.id}
            ariaLabel="Project tasks"
            presentation="list"
            density="comfortable"
            renderCard={(task) => (
              <Card {...toTaskCardProps(task, todayIso, openProps)} />
            )}
          />
          {hasMore ? (
            <LoadMore
              loading={loading}
              loadFailed={loadFailed}
              onLoadMore={loadMore}
              label="Load more tasks"
            />
          ) : null}
        </>
      )}
    </div>
  );
}
