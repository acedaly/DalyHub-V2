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
import { useFetcher, useSearchParams } from "react-router";

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
 * Accumulate keyset pages of a project's tasks behind "Load more" WITHOUT
 * navigating — a fetcher hits the dedicated `/projects/:id/tasks` endpoint, so the
 * record route's `?drawer=task:<id>` state, scroll position and focus are never
 * disturbed by loading more rows (pagination state and drawer state stay wholly
 * independent). The loader's first page seeds the list; changing the task filter
 * (or any loader re-run — reload, Back/Forward, a mutation's revalidation) hands
 * down a fresh first page and cursor, which RESETS the accumulation. Duplicate ids
 * are collapsed defensively so a task card can never render twice.
 */
function useProjectTaskPagination(
  projectId: string,
  firstPage: readonly SerializedProjectTask[],
  initialCursor: string | null,
  taskState: TaskState,
) {
  const fetcher = useFetcher<TasksPageData>();
  const [appended, setAppended] = useState<SerializedProjectTask[]>([]);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loadFailed, setLoadFailed] = useState(false);
  const processed = useRef<TasksPageData | null>(null);

  // Reset when the QUERY that defines the task set changes — the state filter or the
  // first page's cursor — NOT on every loader re-run. Opening/closing the task Drawer
  // only toggles the `?drawer=` param; keeping the loaded pages across that keeps
  // pagination and drawer state fully independent (neither resets the other).
  useEffect(() => {
    setAppended([]);
    setCursor(initialCursor);
    setLoadFailed(false);
    processed.current = null;
  }, [initialCursor, taskState]);

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
