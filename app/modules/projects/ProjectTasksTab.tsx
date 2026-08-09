/**
 * The Project record's Tasks tab.
 *
 * ── UIX-02 — the rows are TASKS rows now ─────────────────────────────────────
 *
 * The brief's rule for this surface is blunt: tasks inside a Project must reuse
 * the Tasks design language, and there must not be a Project-specific task card.
 * There was one. While UIX-01 rebuilt the Tasks list into a single ~45px line —
 * a leading completion circle, a dominant title, a right-aligned relative date,
 * and nothing else permanent — this tab kept the old two-line card: a green
 * check GLYPH that could not be clicked, a "P1" pill, an "Overdue · due 7 Aug
 * 2026" pill and an "Unscheduled" pill on the right of every row.
 *
 * So it now builds the SAME `Card` props Tasks builds, from the same shared
 * pieces:
 *
 *   - `leadingControl` is the shared `.dh-check-circle`, and it WORKS — a task
 *     can be completed from the Project it belongs to, through the same
 *     canonical `/tasks/bulk` route the Tasks list and the bulk bar use, so
 *     there is one authority and one Activity trail for completion.
 *   - the date is `InlineTaskDate`, which reads "Yesterday / Today / Tomorrow /
 *     Thu, 12 Jun" and takes the overdue colour when it has slipped. That is
 *     what let UIX-01 delete the urgency chip, and deleting it here too is what
 *     makes these rows the same object.
 *   - the routine status pills are gone for the same reason they went from
 *     Tasks: "Unscheduled" is the absence of a planned date restated as a chip,
 *     on every row. The states that appear nowhere else — Waiting, On hold,
 *     Cancelled — still paint.
 *   - the Project MARK is not drawn. Every row in this list belongs to the
 *     Project whose record it is being read on, so a per-row Project column
 *     would be the page title repeated once per task.
 *
 * Unchanged: the open/completed/all filter (URL `?tasks=`), the "Add task"
 * Drawer, and opening a row into the SAME shared Task Drawer used on Today
 * (`?drawer=task:<id>`), so a task is edited the one canonical way.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useFetcher,
  useLocation,
  useRevalidator,
  useSearchParams,
} from "react-router";

import { Card, CardCollection } from "~/shared/card";
import type { CardMetaItem, CardProps } from "~/shared/card";
import { DrawerTrigger, useDrawer, withDrawerPushed } from "~/shared/drawer";
import { EntityIcon, isEntityType } from "~/shared/entity";
import { EmptyState } from "~/shared/empty-state";
import { LoadMore } from "~/shared/load-more";
import { ViewTabs } from "~/shared/view-switcher";
import { PriorityIndicator } from "~/shared/task-record/PriorityIndicator";
import { InlineTaskDate } from "~/shared/task-record/TaskRowFields";
import { postTaskBulkAction } from "~/shared/task-record/task-inline-edit";
import {
  isTaskWaiting,
  taskDisplayState,
  taskUrgency,
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

/**
 * UIX-01's rule, applied here: a list row draws a status pill only when it says
 * something the rest of the row does not. `planned` is "there is a planned date"
 * and `inbox` is "there is not", and both are restatements — on the old Project
 * card every single row carried one of them as an "Unscheduled" chip.
 */
const ROUTINE_TASK_STATES: ReadonlySet<string> = new Set(["planned", "inbox"]);

/**
 * The row's leading COMPLETION control — the shared `.dh-check-circle`, the same
 * one Today and Tasks lead with.
 *
 * It replaces a decorative green check glyph that looked like a completion
 * control and was not one: the only way to finish a task from a Project was to
 * open the drawer first. Completing posts to the canonical `/tasks/bulk` route,
 * so the Project's list, the Tasks list and the bulk bar all complete a task the
 * same way and produce the same Activity.
 */
function ProjectTaskCompleteToggle({
  task,
  urgent,
  disabled,
  onToggle,
}: {
  readonly task: SerializedProjectTask;
  readonly urgent: boolean;
  readonly disabled: boolean;
  readonly onToggle: (complete: boolean) => void;
}) {
  const completed = task.completedAt !== null;
  return (
    <label className="dh-check-circle-target">
      <input
        type="checkbox"
        className="dh-check-circle"
        checked={completed}
        disabled={disabled}
        data-urgency={urgent && !completed ? "overdue" : undefined}
        aria-label={
          completed ? `Reopen ${task.title}` : `Complete ${task.title}`
        }
        onChange={(event) => onToggle(event.currentTarget.checked)}
        // The row's open link sits beside this; a click here must never open it.
        onClick={(event) => event.stopPropagation()}
      />
    </label>
  );
}

function toTaskCardProps(
  task: SerializedProjectTask,
  todayIso: string,
  openProps: (key: string) => { href: string; onOpen: () => void },
  onToggleComplete: (task: SerializedProjectTask, complete: boolean) => void,
  archived: boolean,
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
  const urgency = taskUrgency(task, todayIso);
  const completed = task.completedAt !== null;

  const metadata: CardMetaItem[] = [];
  /*
   * Priority stays, because it is a fact about the task that appears nowhere
   * else on the row — but as the shared INLINE editor rather than as a static
   * "P1" pill, so it is the same control, editable in the same way, as the one
   * on the Tasks list. A task with no priority draws nothing (the absence rule):
   * "No priority" under every row is a column of italics saying a dimension was
   * not used.
   */
  if (task.priority) {
    metadata.push({
      id: "priority",
      value: <PriorityIndicator priority={task.priority} />,
      priority: "low",
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
  /*
   * The DUE date last and pinned to the row's trailing edge, which is what makes
   * it a column: a date column only reads as one when every date in it starts at
   * the same x. It reads "Yesterday / Today / Tomorrow / Thu, 12 Jun" and takes
   * the overdue colour when it has slipped — the words are what let UIX-01
   * delete the urgency chip that used to sit beside it here.
   */
  metadata.push({
    id: "due",
    priority: task.dueDate === null ? "quiet" : "high",
    value: (
      <InlineTaskDate
        taskId={task.id}
        title={task.title}
        kind="due"
        value={task.dueDate}
        todayIso={todayIso}
        disabled={completed || archived}
      />
    ),
  });

  return {
    id: task.id,
    title: task.title,
    typeLabel: "Task",
    /*
     * No leading entity glyph. On a list of nothing but tasks a small check
     * before every title said only "this is a task" — and it sat directly beside
     * the completion circle, which is a check-shaped control that means
     * something. `typeLabel` stays, so a screen reader still hears "Task".
     */
    // h3 under the tab's section h2 (record h1 → section h2 → card h3): a
    // non-skipping outline on the bare project record (DEBT-21).
    headingLevel: 3,
    completed,
    leadingControl: (
      <ProjectTaskCompleteToggle
        task={task}
        urgent={urgency?.kind === "overdue"}
        disabled={archived}
        onToggle={(complete) => onToggleComplete(task, complete)}
      />
    ),
    status: ROUTINE_TASK_STATES.has(status.kind)
      ? undefined
      : { label: status.label, tone: status.tone },
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
  const revalidator = useRevalidator();
  const [completionError, setCompletionError] = useState<string | null>(null);
  const { items, hasMore, loading, loadFailed, loadMore } =
    useProjectTaskPagination(projectId, tasks, nextCursor, taskState);

  const openProps = (key: string) => ({
    href: `?${withDrawerPushed(searchParams, key).toString()}`,
    onOpen: () => openDrawer(key),
  });

  /*
   * Completing from the Project record.
   *
   * The canonical `/tasks/bulk` route, which is the SAME authority the Tasks
   * list, the row quick-edit and the bulk bar all post to — so completion has
   * one server-side rule, one recurrence behaviour and one Activity entry
   * wherever it is done from.
   *
   * No optimistic patch here, deliberately. The Tasks list has one (ADR-086)
   * because it is the surface an owner completes ninety rows on and the
   * latency is the product; a Project's task list is read far less often and
   * its roll-up, its progress bar and its health all have to move with the
   * change. Revalidating means every one of those comes back from the server
   * agreeing with the row, rather than a bar that says 63% next to a list that
   * says otherwise until the next load.
   */
  const onToggleComplete = useCallback(
    (task: SerializedProjectTask, complete: boolean) => {
      setCompletionError(null);
      void postTaskBulkAction(
        [task.id],
        { intent: complete ? "complete" : "reopen" },
        {
          fallback: complete
            ? "That task couldn’t be completed. Please try again."
            : "That task couldn’t be reopened. Please try again.",
        },
      ).then((outcome) => {
        if (outcome.ok) {
          revalidator.revalidate();
        } else {
          setCompletionError(outcome.message);
        }
      });
    },
    [revalidator],
  );

  return (
    /*
     * `dh-tasklist` is the OPT-IN that gives this list the Tasks row treatment
     * (see `tasks.css`): one ~45px line, the leading completion circle, the
     * title dominant, the date right-aligned in its own track. Declaring it is
     * how a surface asks for that language rather than inheriting it by
     * accident.
     */
    <div className="dh-project-tasks dh-tasklist">
      <h2 className="dh-visually-hidden">Tasks</h2>
      {/* A refusal is reported where the action was taken, and politely: the
       * row keeps its previous state because nothing was written optimistically. */}
      {completionError ? (
        <p className="dh-project-tasks__error" role="alert">
          {completionError}
        </p>
      ) : null}
      <div className="dh-record-toolbar">
        {/*
         * UIX-02 — the shared TAB RAIL, the same control the Projects gallery
         * and the Tasks list take. The sunken segmented track it replaces was
         * the heaviest object in the tab panel, sitting directly under the
         * record's own tab strip: two rows of chrome, in two different visual
         * languages, before the first task.
         */}
        <ViewTabs
          param="tasks"
          options={TASK_STATE_OPTIONS}
          value={taskState}
          label="Filter tasks by state"
          defaultValue="open"
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
            className="dh-btn dh-btn--ghost"
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
              <Card
                {...toTaskCardProps(
                  task,
                  todayIso,
                  openProps,
                  onToggleComplete,
                  archived,
                )}
              />
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
