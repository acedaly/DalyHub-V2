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
import {
  isTaskWaiting,
  taskDateLabel,
  taskDisplayStatus,
  waitingSubjectLabel,
} from "~/shared/task-record/task-view";

import { SegmentedFilter } from "./SegmentedFilter";
import type { SerializedProjectTask } from "./project-view";

const TASK_STATE_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "completed", label: "Completed" },
  { value: "all", label: "All" },
] as const;

/** The drawer key that opens the "New task" create form. */
export const NEW_TASK_KEY = "new-task";

type TaskState = "open" | "completed" | "all";

interface ProjectTasksTabProps {
  readonly projectId: string;
  readonly tasks: readonly SerializedProjectTask[];
  /** Opaque cursor for the next task page from the loader, or null when exhausted. */
  readonly nextCursor: string | null;
  readonly taskState: TaskState;
  readonly todayIso: string;
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
    // A filter change OR a mutation revalidation — reconcile from the fresh page.
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
    // The endpoint returns `{ tasks, nextCursor }` on success; a 4xx JSON body has
    // neither, so treat a missing `tasks` array as a calm, retryable failure.
    if (!Array.isArray(data.tasks)) {
      setLoadFailed(true);
      return;
    }
    setAppended((prev) => [...prev, ...data.tasks]);
    setCursor(data.nextCursor ?? null);
    setLoadFailed(false);
  }, [fetcher.state, fetcher.data]);

  const loadMore = useCallback(() => {
    if (cursor === null) {
      return;
    }
    setLoadFailed(false);
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
  const completed = task.completedAt !== null;
  const waiting = isTaskWaiting(task);
  const status = taskDisplayStatus(completed, task.status, waiting);
  const date = taskDateLabel(task, todayIso);

  const metadata: CardMetaItem[] = [];
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
    headingLevel: 4,
    status: { label: status.label, tone: status.tone },
    metadata,
    dateLabel: date
      ? {
          label: date.label,
          tone: date.tone === "danger" ? "danger" : undefined,
        }
      : undefined,
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
      <div className="dh-project-tasks__toolbar">
        <SegmentedFilter
          param="tasks"
          options={TASK_STATE_OPTIONS}
          value={taskState}
          label="Filter tasks by state"
        />
        <DrawerTrigger
          drawerKey={NEW_TASK_KEY}
          className="dh-btn dh-btn--secondary"
        >
          Add task
        </DrawerTrigger>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<EntityIcon type="task" />}
          headingLevel={3}
          title={
            taskState === "completed"
              ? "No completed tasks"
              : taskState === "open"
                ? "No open tasks"
                : "No tasks yet"
          }
          description="Add a task to start moving this project forward."
          primaryAction={
            <DrawerTrigger
              drawerKey={NEW_TASK_KEY}
              className="dh-btn dh-btn--primary"
            >
              Add task
            </DrawerTrigger>
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
