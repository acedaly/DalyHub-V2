/**
 * The Project record's Tasks tab.
 *
 * ── V2.8 CONV-01 — the rows ARE the shared Task row ─────────────────────────
 *
 * Until this item the tab built generic `Card` props by hand from the same
 * pieces `/tasks` once used, and said so in a comment: *"This tab does not
 * render `TaskRow` yet (DEBT-175)"*. UIX-02 had made the rows "the SAME `Card`
 * props Tasks builds", which was true then; DS-04 then replaced the Tasks card
 * with `TaskRow`, Today and Plan followed, and this surface did not. Measured on
 * 2026-09-02, what the owner could not do here that they could on `/tasks`: open
 * the overflow menu, rename inline, select rows and act in bulk, see the
 * recurrence signal, swipe, watch a completed row leave with focus handed on —
 * and below 26rem see priority at all, including the inline editor DHDS-10 had
 * added to this very tab.
 *
 * So the tab now renders the shared `TaskRow` inside the shared `TaskList`, fed
 * by the same list-item shape `/tasks` reads, and everything about a ROW is the
 * row's:
 *
 *   - the anatomy and its responsive ladder (`task-list.css` container queries —
 *     the tab declares no breakpoint of its own and hides no fact);
 *   - the inline title, due, priority and Project editors, the overflow set
 *     (`buildTaskRowActions`), the recurrence and blocked signals, the
 *     checklist figure, selection, long-press and swipe;
 *   - completion, with DHDS-11's departure: on the Open scope a completed row
 *     collapses when the loader's answer no longer contains it and focus is
 *     handed to the row that takes its place (`useDepartingRows`);
 *   - ADR-086's optimistic patch map, hosted by the shared
 *     `useTaskSurfaceActions` — the same host Today and Plan use — so an
 *     accepted save is painted at once, the server stays the authority, a
 *     refusal rolls back exactly what it painted, and the outcome is announced
 *     once through one live region.
 *
 * ── What stays the tab's ───────────────────────────────────────────────────
 * Its scope (this Project's tasks), the Open / Completed / All filter (URL
 * `?tasks=`), the record-level empty state, the "Add task" affordance, the
 * "Load more" pagination that never navigates, and WHERE the bulk bar sits.
 * Nothing else here is bespoke, and there is no Project-specific row, card,
 * metadata run, completion control or mutation path any more.
 *
 * ── Capability contract: shared anatomy is not every capability ────────────
 * The row draws a drag grip only when its caller passes a `dragHandle`, and
 * this surface passes none — deliberately, and permanently until its domain
 * changes. A drag is licensed only where the object has a real destination or
 * a real stored order (AGENTS.md §7, DHDS-11, ADR-109). `/tasks` grouped by a
 * drop dimension draws destinations, so it passes a grip; this tab is a flat
 * list of one Project's tasks and stores no manual order (DEBT-188 stands), so
 * it draws no grip, adds no order column and issues no reorder request. The
 * slot is left unpassed rather than the row forked or a Project-local ranking
 * invented to fill it (ADR-115 decision 2).
 *
 * An ARCHIVED Project's tasks are read-only until it is restored (PROJ-05 §5):
 * the row's own `readOnly` mode draws no completion control, disables every
 * inline editor and offers one door to the record — the same anatomy the
 * Deleted view uses, for the same reason: every mutation would be refused.
 *
 * ── The Project's own facts ────────────────────────────────────────────────
 * Progress, health and the overdue counts on the record are the SERVER's, and
 * they move with the accepted save because the shared host revalidates this
 * record's loader after every accepted mutation. Nothing here fakes them.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { useFetcher, useLocation, useSearchParams } from "react-router";

import { DrawerTrigger, useDrawer, withDrawerPushed } from "~/shared/drawer";
import { EmptyState } from "~/shared/empty-state";
import { LoadMore } from "~/shared/load-more";
import { ViewTabs } from "~/shared/view-switcher";
import {
  TaskBulkActionBar,
  TaskSelectionPrompt,
} from "~/shared/task-record/TaskBulkActionBar";
import { TaskList } from "~/shared/task-record/TaskList";
import { TaskRow, type TaskRowProps } from "~/shared/task-record/TaskRow";
import type { TaskParentOption } from "~/shared/task-record/TaskRowFields";
import { TaskTitleEditor } from "~/shared/task-record/TaskTitleEditor";
import { buildTaskRowActions } from "~/shared/task-record/task-row-actions";
import {
  EMPTY_TASK_SELECTION,
  boundBulkSelection,
  taskSelectionReducer,
} from "~/shared/task-record/task-selection";
import {
  applyTaskListItemPatch,
  toTaskRowProjection,
} from "~/shared/task-record/task-view";
import { useDepartingRows } from "~/shared/task-record/use-departing-rows";
import { useTaskSurfaceActions } from "~/shared/task-record/use-task-surface-actions";

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
  /**
   * The loader's bounded parent candidates, for the row's inline Project editor
   * and the bulk bar's "Move" — the same fifty `/tasks` and Today offer.
   */
  readonly parents: readonly TaskParentOption[];
  readonly taskState: TaskState;
  readonly todayIso: string;
  /**
   * PROJ-05: an archived project is read-only — creating a Task under it is
   * always rejected server-side, so "Add task" is HIDDEN (not disabled) rather
   * than offered and failing, and every row is the shared row's read-only form.
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
 * defensively so a task row can never render twice.
 *
 * Reset policy — the accumulation is dropped when (and only when) the task set may
 * have changed underneath it:
 *   - the `?tasks=` filter changed (a different result set), OR
 *   - the loader re-ran with the URL otherwise UNCHANGED — the signature of a
 *     **mutation revalidation** (a task was completed, edited or created from a
 *     row, the shared Drawer or the create form, whose outcome revalidates this
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

export function ProjectTasksTab({
  projectId,
  tasks,
  nextCursor,
  parents,
  taskState,
  todayIso,
  archived = false,
}: ProjectTasksTabProps) {
  const { openDrawer } = useDrawer();
  const [searchParams] = useSearchParams();
  const { items, hasMore, loading, loadFailed, loadMore } =
    useProjectTaskPagination(projectId, tasks, nextCursor, taskState);

  /*
   * ADR-086, through the SHARED host.
   *
   * `useTaskSurfaceActions` holds the in-flight patch map, posts every row
   * mutation to the canonical `/tasks/:id` and `/tasks/bulk` routes, announces
   * the SERVER's outcome once, rolls back exactly what a refused write painted,
   * and revalidates this record's loader — which is how the Project's progress
   * band, health and overdue counts come back agreeing with the row. It is the
   * same host Today and Plan use; this tab holds no optimistic state of its own.
   */
  const actions = useTaskSurfaceActions();
  const { clearPatches } = actions;
  // Fresh loader data is the truth; every client guess is dropped the moment it
  // arrives, which is what keeps a patch a guess rather than a second state.
  useEffect(() => {
    clearPatches();
  }, [tasks, clearPatches]);

  /** DHDS-10 — which row (if any) is being renamed in place. At most one. */
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);

  /*
   * The page, re-painted against the OPTIMISTIC state.
   *
   * Every patch is applied to the SOURCE record and the shared projection is
   * re-run over the result, so a ticked row reads as completed at once through
   * the same pure functions that read the server's own answer. Membership is
   * NOT re-decided here: a completed row stays in an Open list, struck through,
   * until the loader's answer no longer contains it — and then it departs.
   */
  const painted = useMemo(
    () =>
      items.map((task) =>
        applyTaskListItemPatch(task, actions.patches.get(task.id)),
      ),
    [items, actions.patches],
  );
  const visibleIds = useMemo(() => painted.map((task) => task.id), [painted]);

  /*
   * V2.4-GATE-02 / TASKS-06 — the SHARED selection model.
   *
   * The same reducer `/tasks` and Plan use: selection mode is explicit and
   * separate from having a selection, a Shift-click extends a range in the
   * order the rows are on screen, a selection never outlives its query (reset
   * on a scope change) and a row that disappears takes its selection with it
   * (prune). Entering is deliberate — the toolbar's "Select tasks", or a touch
   * hold on a row — never a mode the surface simply starts in.
   */
  const [selection, dispatchSelection] = useReducer(
    taskSelectionReducer,
    EMPTY_TASK_SELECTION,
  );
  const selected = selection.ids;
  const selecting = selection.mode || selected.size > 0;
  useEffect(() => dispatchSelection({ type: "reset" }), [projectId, taskState]);
  useEffect(() => {
    dispatchSelection({ type: "prune", visibleIds });
  }, [visibleIds]);
  const clearSelection = useCallback(
    () => dispatchSelection({ type: "reset" }),
    [],
  );
  const bound = useMemo(() => boundBulkSelection(visibleIds), [visibleIds]);
  const selectedTasks = useMemo(
    () =>
      painted
        .filter((task) => selected.has(task.id))
        .map((task) => toTaskRowProjection(task)),
    [painted, selected],
  );

  /*
   * DHDS-11 — a completed row LEAVES; it does not vanish.
   *
   * Derived from what happened rather than declared: a row departs only when
   * the id the owner just acted on is no longer in the loader's answer. On the
   * Completed and All scopes a completed Task stays in the list, so nothing
   * departs; on Open it goes, and focus is handed to the row that takes its
   * place — or to the list itself when none is left.
   */
  const listElement = useRef<HTMLUListElement | null>(null);
  const { rendered, isLeaving } = useDepartingRows(
    painted,
    actions.departing,
    listElement,
  );

  const openTask = useCallback((key: string) => openDrawer(key), [openDrawer]);

  /**
   * One Project task, as SHARED `TaskRow` props.
   *
   * Only data and callbacks: the completion control, the inline editors and the
   * overflow all post the same canonical intents to the same canonical routes
   * they post from `/tasks`. No `dragHandle` — see the file header.
   */
  const rowProps = useCallback(
    (task: SerializedProjectTask): TaskRowProps => {
      const key = `task:${task.id}`;
      const row = toTaskRowProjection(task);
      return {
        task: row,
        todayIso,
        parents,
        // Record h1 → the tab's hidden h2 → the row's h3: a non-skipping
        // outline on the bare Project record (DEBT-21).
        headingLevel: 3,
        href: `?${withDrawerPushed(searchParams, key).toString()}`,
        onOpen: () => openTask(key),
        onCompletedChange: (complete: boolean) =>
          actions.setCompleted(task.id, complete, task.title),
        onInlineSave: actions.reportInlineSave,
        readOnly: archived,
        // DHDS-11 — object continuity: the row whose record is open keeps a
        // quiet current mark while the Drawer is up.
        current: searchParams.get("drawer") === key,
        leaving: isLeaving(task.id),
        overflowActions: buildTaskRowActions(
          row,
          {
            onOpenRecord: () => openTask(key),
            onPlanToday: () =>
              actions.setField(
                task.id,
                { intent: "plan", scheduledDate: todayIso },
                `Planned ${task.title} for today.`,
                { scheduledDate: todayIso },
              ),
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
          },
          { readOnly: archived },
        ),
        /*
         * V2.4-GATE-02 — the row draws ONE leading control, and which one is
         * the mode: the selection control replaces completion in the same box
         * while the tab is selecting, and completion returns when it stops.
         */
        ...(selecting && !archived
          ? {
              selection: {
                selected: selected.has(task.id),
                onSelectedChange: (
                  on: boolean,
                  modifiers?: { readonly shift: boolean },
                ) =>
                  dispatchSelection({
                    type: "toggle",
                    id: task.id,
                    selected: on,
                    shift: modifiers?.shift ?? false,
                    visibleIds,
                  }),
                label: `Select ${task.title}`,
              },
            }
          : {}),
        // The touch way in: a hold enters the mode and selects the held row.
        ...(archived
          ? {}
          : {
              onLongPress: () =>
                dispatchSelection({ type: "enter", id: task.id }),
            }),
        // The editor replaces the title ONLY while this row is being renamed;
        // every other row keeps its ordinary open link.
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
                  // PWA-12 — a rename accepted locally while offline is painted
                  // and said to be waiting, never silently dropped to replay
                  // later as a surprise.
                  onQueued={actions.reportQueuedTitle}
                />
              ),
            }
          : {}),
      };
    },
    [
      todayIso,
      parents,
      searchParams,
      openTask,
      actions,
      archived,
      isLeaving,
      selecting,
      selected,
      visibleIds,
      editingTitleId,
    ],
  );

  return (
    <div className="dh-project-tasks">
      <h2 className="dh-visually-hidden">Tasks</h2>
      <div className="dh-record-toolbar">
        {/*
         * UIX-02 — the shared TAB RAIL, the same control the Projects gallery
         * and the Tasks list take.
         */}
        <ViewTabs
          param="tasks"
          options={TASK_STATE_OPTIONS}
          value={taskState}
          label="Filter tasks by state"
          defaultValue="open"
        />
        {/*
         * The way INTO selection on a pointer device — the same act `/tasks`
         * offers from its header overflow. Absent on an archived Project, where
         * every bulk action would be refused.
         */}
        {archived || items.length === 0 ? null : (
          <button
            type="button"
            className="dh-btn dh-btn--ghost"
            data-testid="project-tasks-select"
            aria-pressed={selection.mode}
            onClick={() =>
              dispatchSelection(
                selection.mode ? { type: "reset" } : { type: "enter" },
              )
            }
          >
            {selection.mode ? "Stop selecting" : "Select tasks"}
          </button>
        )}
        {/*
         * RECORD-01 — the ONE local creation action on this record. The form
         * already receives `projectId`, so a task created here lands in this
         * project with nothing for the owner to pick.
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
         * RECORD-01 — a record-level empty state is one calm line: the compact
         * variant states the absence and stops, directly beneath an "Add task"
         * control that is already visible.
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
          <TaskList
            ariaLabel="Project tasks"
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
              label="Load more tasks"
            />
          ) : null}
        </>
      )}

      {/*
       * The SHARED bulk bar, over the SHARED `/tasks/bulk` contract — the same
       * component `/tasks` renders in its selection slot. Bottom-anchored here
       * too, so the owner acts where every other selection in the product is
       * acted on.
       */}
      {selected.size > 0 ? (
        <div className="dh-project-tasks__selection">
          <TaskBulkActionBar
            tasks={selectedTasks}
            ids={[...selected]}
            todayIso={todayIso}
            parents={parents}
            viewingDeleted={false}
            onCleared={clearSelection}
            onAnnounce={actions.announce}
          />
        </div>
      ) : selection.mode ? (
        <div className="dh-project-tasks__selection">
          <TaskSelectionPrompt
            loadedCount={visibleIds.length}
            selectableIds={bound.selectableIds}
            capped={bound.capped}
            onSelectAll={(ids) =>
              dispatchSelection({ type: "select_visible", visibleIds: ids })
            }
            onDone={clearSelection}
          />
        </div>
      ) : null}

      {/* Every row mutation announces its outcome once, politely — the SAME
          channel `/tasks`, Today and Plan use. A refusal is a notification
          instead, because a failure has to interrupt. */}
      <p className="dh-visually-hidden" role="status" aria-live="polite">
        {actions.announcement ?? ""}
      </p>
    </div>
  );
}
