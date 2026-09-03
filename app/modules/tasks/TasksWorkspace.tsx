/**
 * TASKS-01 / TASKS-03 — the `/tasks` workspace surface (presentation, no server
 * imports).
 *
 * The authoritative workspace-wide Tasks planning and execution surface (ADR-043,
 * ADR-059), composed ENTIRELY from the shared frame — the PX-02 CollectionLayout,
 * the ONE DS-04 Card + CardCollection, the shared EmptyState, LoadMore, the
 * MOBILE-01 CollectionControls sheet and chip row, and the DS-03 Drawer (hosting
 * the shared Task record and the DS-06 create form). No bespoke primitives, no
 * second drawer, no Tasks-only filter system.
 *
 * TASKS-03 made the LIST the primary workspace; TASKS-05 (V2.2) finished the job by
 * REMOVING the Eisenhower Matrix and putting the ordinary field edits on the row
 * itself. Time Sectors remains as an OPTIONAL presentation of the same query, chosen
 * from the same control surface as any other layout. Every presentation, filter
 * combination, sort and grouping reads the one loader payload; there is no per-view
 * query.
 *
 * Every mutation reachable from a row goes to a CANONICAL route: completion to
 * `POST /tasks/:taskId`, field changes to `/tasks/bulk`, creation to `/tasks/new`,
 * saved views to `/tasks/views`. There is no list-only mutation anywhere here.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import {
  Link,
  useFetcher,
  useLocation,
  useRevalidator,
  useSearchParams,
} from "react-router";

import {
  CollectionControls,
  CollectionLayout,
  collectionCountLabel,
  useCollectionLoading,
} from "~/shared/collection-layout";
import {
  DrawerProvider,
  DrawerTrigger,
  useDrawer,
  withDrawerPushed,
  type DrawerEntry,
  type DrawerRenderResult,
} from "~/shared/drawer";
import { EmptyState } from "~/shared/empty-state";
import { useCapture } from "~/shared/capture";
import { OverflowMenu } from "~/shared/overflow-menu";
import { PlusIcon } from "~/shared/icons";
import { helpTopicHref } from "~/shared/help";
import { EntityIcon } from "~/shared/entity";
import { LoadMore } from "~/shared/load-more";
import { useFeedback } from "~/shared/feedback";
import { type TaskRowFieldSave } from "~/shared/task-record/TaskRowFields";
import { TaskRow, type TaskRowProps } from "~/shared/task-record/TaskRow";
import { TaskTitleEditor } from "~/shared/task-record/TaskTitleEditor";
import {
  TaskBulkActionBar,
  TaskSelectionPrompt,
} from "~/shared/task-record/TaskBulkActionBar";
import { buildTaskRowActions } from "~/shared/task-record/task-row-actions";
import { TaskGroup, TaskList } from "~/shared/task-record/TaskList";
import { useDepartingRows } from "~/shared/task-record/use-departing-rows";
import {
  TASK_DRAWER_TITLE,
  TaskRecordDrawer,
} from "~/shared/task-record/TaskRecordDrawer";
import type { TaskRecurrenceOutcome } from "~/shared/task-record/contract";
import {
  postTaskBulkAction,
  postTaskRecordAction,
  postTaskRecordActionOffline,
} from "~/shared/task-record/task-inline-edit";
import { OfflineChangesPanel } from "~/shared/offline";
import {
  usePendingTasks,
  useReplayRevalidation,
} from "~/shared/task-record/usePendingTasks";
import {
  formatCalendarDate,
  type SerializedTaskListItem,
  type TaskListItemPatch,
} from "~/shared/task-record/task-view";
import { TIME_SECTORS } from "~/kernel/tasks";
import {
  TASK_PRESENTATIONS,
  taskViewFilterCount,
  type TaskDensity,
  type TaskViewConfig,
} from "~/kernel/task-views";

import { tasksDestinationTitle } from "./destination";
import { NewTaskForm } from "./NewTaskForm";
import { TasksQuickAdd } from "./TasksQuickAdd";
import { TasksViewSwitcher } from "./TasksViewSwitcher";
import { buildTasksControlGroups } from "./tasks-controls";
import {
  DraggableTaskRow,
  useTaskBucketDrop,
  useTaskDropHandler,
  type TaskBucketDrop,
  type TaskMoveRequest,
} from "./TaskDragging";
import {
  isTaskDropDimension,
  type TaskDropDimension,
} from "./task-drop-targets";
import type { TasksPageData } from "./tasks-contract";
import { PRESENTATION_LABELS } from "./tasks-presentation";
import {
  EMPTY_TASK_SELECTION,
  boundBulkSelection,
  taskSelectionReducer,
  type TaskSelectionAction,
} from "~/shared/task-record/task-selection";
import {
  NO_TASK_PATCHES,
  applyTaskPatches,
  applyTaskPatchesToGrouping,
  withTaskPatch,
  withoutTaskPatch,
  type TaskPatches,
} from "./task-optimistic";
import {
  initialTaskPagination,
  mergeTaskPages,
  taskPaginationReducer,
} from "./task-pagination";
import { shouldRevalidateTasksForIntent } from "./task-revalidation";
import { TASKS_PARAMS, paramsFromConfig } from "./tasks-url-state";
import {
  resolveGroupedSections,
  taskStateBreakdown,
  toTaskCardData,
  type GroupedSection,
  type TaskCardData,
} from "./tasks-view-model";

/** The drawer key that opens the "New task" capture form. */
const NEW_TASK_KEY = "new-task";

/**
 * The path this workspace should navigate back to when it changes its own
 * configuration — a filter, a sort, a grouping, a presentation, a page.
 *
 * It is the CURRENT path, not the literal `/tasks`. The same workspace renders
 * at three destinations — `/tasks`, `/inbox` and `/upcoming` — and hard-coding
 * the first meant that applying any filter from Inbox silently moved the owner
 * to Tasks: the list stayed correct, but the destination was discarded and the
 * sidebar's current row jumped. "Never lose the user's place" (AGENTS.md §6)
 * covers which PLACE they are in, not only the scroll position.
 *
 * Only the collection routes render this component, so the pathname is always
 * one of those three; a record route opens in a drawer through `?drawer=` and
 * never mounts the workspace at `/tasks/:taskId`. The trailing slash is trimmed
 * so `/inbox/` cannot produce `/inbox/?filter=…`.
 *
 * The view SWITCHER is deliberately not routed through this. Choosing a
 * different saved view is a move to the general workspace rather than a
 * refinement of the current destination, so it keeps its own `/tasks` base.
 */
function useWorkspaceBasePath(): string {
  const { pathname } = useLocation();
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

/*
 * DS-04 — the completion toggle and the routine-state set moved INTO `TaskRow`.
 *
 * Both were properties of a task row's anatomy that the workspace happened to
 * hold because the row was a generic Card configured from here. With a real row
 * component they belong to it, so a second surface adopting `TaskRow` cannot
 * disagree with this one about which states earn a pill or what a completion
 * control's accessible name says.
 */

/* -------------------------------------------------------------------------- */
/* UIX-01 — the header's utility cluster                                       */
/* -------------------------------------------------------------------------- */

/**
 * The page's ONE create control.
 *
 * It opens the shared Quick Capture surface already on its Task panel — the
 * same surface, the same canonical `POST /tasks/new`, the same title-only fast
 * path, the same parser — rather than a Tasks-only form. On a phone that is the
 * bottom sheet the redesign reference draws; on a desktop it is the same sheet
 * over the page. One capture implementation, reached from one more door.
 *
 * `requestedType` is what makes this different from the generic global `+` a
 * previous pass removed from here: that opened the chooser ("what are you
 * capturing?") on a page whose answer is never in doubt.
 */
function NewTaskButton() {
  const capture = useCapture();
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <button
      type="button"
      ref={ref}
      className="dh-btn dh-btn--primary"
      data-testid="tasks-new-task"
      onClick={() => {
        if (ref.current) capture?.openCapture("task", ref.current);
      }}
    >
      <span className="dh-btn__icon" aria-hidden="true">
        <PlusIcon />
      </span>
      New task
    </button>
  );
}

/**
 * The header's long tail, in the ONE shared overflow menu.
 *
 * Three things live here, and each was previously a permanent control competing
 * with the task list for the top of the page:
 *
 *   - **Select tasks** — TASKS-06/08's ordinary, discoverable, keyboard-reachable
 *     way into multi-selection. The phone's hold gesture and the desktop's row
 *     checkbox both still work; this is the labelled path, and its state is
 *     announced by the item's own wording rather than implied by colour.
 *   - **Review Inbox** — the way into triage. Not a creation control, and
 *     nothing in capture does it, so it stays.
 *   - **The layout** — List / Board / Sectors, writing the same `?view=`
 *     parameter the sheet's Layout group writes. One control model, and now one
 *     fewer permanent control.
 */
function TasksOverflow({
  selection,
  onSelectionChange,
  presentation,
}: {
  readonly selection: { readonly mode: boolean };
  readonly onSelectionChange: (action: TaskSelectionAction) => void;
  readonly presentation: string;
}) {
  const [searchParams] = useSearchParams();
  const basePath = useWorkspaceBasePath();
  const layoutHref = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.delete("drawer");
    next.delete(TASKS_PARAMS.cursor);
    next.set(TASKS_PARAMS.presentation, value);
    return `${basePath}?${next.toString()}`;
  };
  return (
    <OverflowMenu
      label="More task actions"
      triggerClassName="dh-tasks-overflow"
      data-testid="tasks-overflow"
      items={[
        {
          id: "select",
          label: selection.mode ? "Stop selecting" : "Select tasks",
          description: "Act on several tasks at once.",
          onSelect: () =>
            onSelectionChange(
              selection.mode ? { type: "reset" } : { type: "enter" },
            ),
        },
        {
          id: "review",
          label: "Review Inbox",
          description: "File everything that has no Project or Area.",
          href: "/tasks/review",
        },
        ...TASK_PRESENTATIONS.map((value, index) => ({
          id: `layout-${value}`,
          label: `${PRESENTATION_LABELS[value]} layout`,
          description: value === presentation ? "Currently shown." : undefined,
          separatorBefore: index === 0,
          href: layoutHref(value),
        })),
      ]}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Provider + drawer wiring                                                    */
/* -------------------------------------------------------------------------- */

export function TasksWorkspace({ data }: { readonly data: TasksPageData }) {
  const renderDrawer = useMemo(() => {
    return function render(entry: DrawerEntry): DrawerRenderResult | null {
      const separator = entry.key.indexOf(":");
      const kind = separator === -1 ? entry.key : entry.key.slice(0, separator);
      const id = separator === -1 ? "" : entry.key.slice(separator + 1);

      if (kind === "task" && id.length > 0) {
        return {
          title: TASK_DRAWER_TITLE,
          children: <TaskRecordDrawer taskId={id} />,
        };
      }
      /*
       * CONTROL-01 §4 — `task-quick:` and `task-move:` open the SAME record.
       *
       * They used to open `TaskQuickEditPanel`, a second editor for the same
       * object: the row's overflow offered "Priority, dates and repeat…" (the
       * quick panel) *and* "Open task record" (the record), and the project
       * editor's escape hatch opened a third variant of the quick panel titled
       * "Move task". Three doors, one task, and each door showed a different
       * subset of its properties — so "where do I change the horizon?" had a
       * different answer from "where do I change the description?".
       *
       * The record drawer now carries every property either door edited, each
       * one a pressable control rather than a printed value, so these keys
       * resolve to it. They are KEPT rather than deleted because they are URL
       * state: a bookmarked or Back-stacked `?drawer=task-quick:<id>` from
       * before this change still opens the task it names, and Back/Forward and
       * focus restoration are unchanged.
       */
      if ((kind === "task-quick" || kind === "task-move") && id.length > 0) {
        return {
          title: TASK_DRAWER_TITLE,
          children: <TaskRecordDrawer taskId={id} />,
        };
      }
      if (entry.key === NEW_TASK_KEY) {
        return {
          title: "New task",
          description: "Capture a task under a Project or an Area.",
          children: (
            <NewTaskDrawerHost
              defaultParent={data.defaultCaptureParent}
              todayIso={data.todayIso}
            />
          ),
        };
      }
      return null;
    };
  }, [data]);

  return (
    <DrawerProvider renderDrawer={renderDrawer}>
      <TasksWorkspaceInner data={data} />
    </DrawerProvider>
  );
}

/*
 * CONTROL-01 §4 — `findLoadedTask` and `TaskQuickEditDrawerHost` are GONE.
 *
 * Both existed only to feed the second Task editor: the host needed a task, and
 * the lookup found one in whichever payload the current presentation had loaded
 * it into. The record drawer loads the task from its own canonical route, so it
 * needs neither — and it works for a task that is not on the loaded page at all,
 * which the lookup could not (a `?drawer=task-quick:<id>` for a row past the
 * first keyset page rendered nothing).
 *
 * Removed rather than left unreferenced: a helper with no caller is sediment,
 * and the next reader cannot tell dead code from dormant code.
 */

/** Hosts the create form: reflects the new task, then opens it in the shared Drawer. */
function NewTaskDrawerHost({
  defaultParent,
  todayIso,
}: {
  readonly defaultParent: TasksPageData["defaultCaptureParent"];
  readonly todayIso: string;
}) {
  const { closeDrawer, replaceDrawer } = useDrawer();
  const revalidator = useRevalidator();
  return (
    <NewTaskForm
      defaultParent={defaultParent}
      todayIso={todayIso}
      onCreated={(taskId) => {
        revalidator.revalidate();
        replaceDrawer(`task:${taskId}`);
      }}
      onCancel={closeDrawer}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Pagination — accumulate keyset pages behind "Load more"                     */
/* -------------------------------------------------------------------------- */

/**
 * Accumulate keyset pages WITHOUT navigating (so the `?drawer=` param and scroll
 * position survive). The loader's first page seeds the list; each "Load more" runs
 * the SAME `/tasks` loader through a fetcher with the next `cursor`, and the rows are
 * appended.
 *
 * TASKS-09 corrected WHEN that accumulation is thrown away. It used to reset on the
 * identity of `firstPage`, which is a fresh array on every revalidation — so any
 * mutation at all collapsed three loaded pages back to one and lost the owner's place.
 * The reset now keys on the CONFIGURATION alone (the pure rule, and why the first
 * page's own cursor is deliberately NOT part of it, live in `task-pagination.ts`), and
 * a re-run of the same query merges its refreshed first page into the accumulator BY
 * ID instead of discarding it.
 */
function useTaskPagination(
  firstPage: readonly SerializedTaskListItem[],
  initialCursor: string | null,
  resetKey: string,
  loadHref: (cursor: string) => string,
) {
  const fetcher = useFetcher<TasksPageData>();
  const [state, dispatch] = useReducer(taskPaginationReducer, undefined, () =>
    initialTaskPagination(resetKey, initialCursor),
  );
  const processed = useRef<TasksPageData | null>(null);
  const fetcherData = fetcher.data ?? null;
  const fetcherDataRef = useRef<TasksPageData | null>(fetcherData);
  fetcherDataRef.current = fetcherData;
  const lastResetKey = useRef(resetKey);

  useEffect(() => {
    if (lastResetKey.current !== resetKey) {
      // Whatever page the fetcher is still holding belongs to the PREVIOUS
      // configuration; mark it consumed so the reset cannot re-append it.
      lastResetKey.current = resetKey;
      processed.current = fetcherDataRef.current;
    }
    dispatch({ type: "sync", resetKey, initialCursor });
  }, [resetKey, initialCursor]);

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcherData) {
      return;
    }
    if (processed.current === fetcherData) {
      return;
    }
    processed.current = fetcherData;
    if (fetcherData.failed || !Array.isArray(fetcherData.items)) {
      dispatch({ type: "page_failed" });
      return;
    }
    dispatch({
      type: "page",
      items: fetcherData.items,
      nextCursor: fetcherData.nextCursor,
    });
  }, [fetcher.state, fetcherData]);

  const cursor = state.cursor;
  const loadMore = useCallback(() => {
    if (cursor === null) {
      return;
    }
    dispatch({ type: "retry" });
    fetcher.load(loadHref(cursor));
  }, [cursor, fetcher, loadHref]);

  const items = useMemo(
    () => mergeTaskPages(firstPage, state.appended),
    [firstPage, state.appended],
  );

  return {
    items,
    hasMore: cursor !== null,
    loading: fetcher.state !== "idle",
    loadFailed: state.loadFailed,
    loadMore,
  };
}

/* -------------------------------------------------------------------------- */
/* Quick edits — always through the canonical routes                           */
/* -------------------------------------------------------------------------- */

/**
 * The plain-English consequence of a completion (or its undo) on a recurrence series.
 * Empty for a one-off task, so an ordinary completion announcement is unchanged.
 */
function recurrenceNote(outcome: TaskRecurrenceOutcome | undefined): string {
  if (!outcome) return "";
  switch (outcome.outcome) {
    case "created":
      return outcome.scheduledDate
        ? ` The next occurrence is scheduled for ${formatCalendarDate(outcome.scheduledDate)}.`
        : outcome.dueDate
          ? ` The next occurrence is due ${formatCalendarDate(outcome.dueDate)}.`
          : " The next occurrence was created.";
    case "removed":
      return " The next occurrence it created was withdrawn.";
    case "retained":
      return " The next occurrence had already changed, so it was kept.";
  }
}

/** The wording used when a write failed and said nothing useful about why. */
const GENERIC_ROW_REFUSAL =
  "That change couldn’t be saved. Nothing was changed.";

/**
 * List-level quick edits, through the CANONICAL routes, with an OPTIMISTIC
 * presentation and a SERVER-AUTHORITATIVE announcement (ADR-086).
 *
 * Completion posts `intent=complete`/`reopen` to `POST /tasks/:taskId` — the same
 * atomic task-domain operation the Task Drawer's Complete button uses (ADR-029), so
 * completing from a list and completing from the record are ONE execution path with
 * ONE Activity trail. Every field change goes through the trusted `/tasks/bulk`
 * mutation with a single id — again the same authority the bulk bar uses. **Nothing
 * about where a write goes, or who validates it, changed here.**
 *
 * What changed is the two things the client does around that write:
 *
 *   1. **The row leads.** A `TaskListItemPatch` is applied the instant the request
 *      goes out, so the checkbox strikes the title through and the changed field
 *      re-renders without waiting for four sequential hops. The patch is dropped when
 *      fresh loader data answers it, and reverted the moment the server refuses.
 *   2. **The announcement does not lead.** Every message in the live region, and every
 *      Undo affordance, is raised from the SERVER's reply — including the recurrence
 *      consequence, which only the server knows. A refused write announces the
 *      refusal, raises a calm DS-10 error with the server's own wording, and leaves
 *      the row exactly as it was.
 *
 * Revalidation is no longer unconditional. `shouldRevalidateTasks` decides, from the
 * configuration alone, whether this change could move the row out of — or reorder it
 * inside — the view on screen. A priority change on an unsorted, unfiltered list
 * re-reads nothing.
 *
 * Each write is its own `fetch` rather than a shared fetcher submission: a fetcher
 * carries one in-flight request and a second submission supersedes the first, which
 * was invisible while the surface blocked and is a lost write now that it does not.
 */
function useTaskQuickMutation(config: TaskViewConfig, data: TasksPageData) {
  const revalidator = useRevalidator();
  const { notifyError, notifyUndo } = useFeedback();
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [patches, setPatches] = useState<TaskPatches>(NO_TASK_PATCHES);
  /*
   * DHDS-11 — the ids this surface has just changed, and the whole of what makes
   * a departing row legitimate.
   *
   * A row is allowed to LEAVE — to collapse while its neighbours close the gap —
   * only when the owner's own action is what removed it. Changing a filter,
   * switching a view, paging and navigating remove rows too, and none of those
   * is a departure: the collection is a different collection, and animating
   * fifty rows out of it would be theatre. An id is added when the SERVER
   * accepts the change and drops out again once the exit could have finished.
   */
  const [departing, setDeparting] =
    useState<ReadonlySet<string>>(NO_DEPARTING_TASKS);
  const departTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const markDeparting = useCallback((taskId: string) => {
    setDeparting((current) => {
      const next = new Set(current);
      next.add(taskId);
      return next;
    });
    const existing = departTimers.current.get(taskId);
    if (existing !== undefined) clearTimeout(existing);
    departTimers.current.set(
      taskId,
      setTimeout(() => {
        departTimers.current.delete(taskId);
        setDeparting((current) => {
          if (!current.has(taskId)) return current;
          const next = new Set(current);
          next.delete(taskId);
          return next;
        });
      }, DEPARTURE_ELIGIBILITY_MS),
    );
  }, []);
  useEffect(() => {
    const timers = departTimers.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  /*
   * Fresh loader data is the truth, so it retires every guess made against the
   * previous one. Patches that the new payload does NOT yet reflect are dropped too:
   * a guess the server has answered is finished either way, and holding it longer
   * would be the client arguing with the record it just asked for.
   */
  useEffect(() => {
    setPatches((previous) =>
      previous.size === 0 ? previous : NO_TASK_PATCHES,
    );
  }, [data]);

  // Read at mutation time, not at render time: the config a change is judged against
  // is the one on screen when it happens.
  const configRef = useRef(config);
  configRef.current = config;

  const revalidateFor = useCallback(
    (intent: string) => {
      if (shouldRevalidateTasksForIntent(configRef.current, intent)) {
        revalidator.revalidate();
      }
    },
    [revalidator],
  );

  /**
   * Announce AND surface a refusal, and put the row back the way it was.
   *
   * `keys` rolls back exactly what THIS write painted, so a refused due date cannot
   * also un-paint a priority the server accepted a moment earlier.
   */
  const refuse = useCallback(
    (
      taskId: string,
      message: string,
      keys?: readonly (keyof TaskListItemPatch)[],
    ) => {
      setPatches((previous) => withoutTaskPatch(previous, taskId, keys));
      setAnnouncement(message);
      notifyError(message);
    },
    [notifyError],
  );

  /*
   * Completion, both directions. Held in a ref so Undo can invoke the same function
   * with the opposite intent without an undo of an undo of an undo.
   */
  const completeRef = useRef<
    (
      taskId: string,
      title: string,
      completed: boolean,
      undoable: boolean,
    ) => void
  >(() => {});

  const runCompletion = useCallback(
    (taskId: string, title: string, completed: boolean, undoable: boolean) => {
      const intent = completed ? "complete" : "reopen";
      setPatches((previous) =>
        withTaskPatch(previous, taskId, {
          completedAt: completed ? new Date().toISOString() : null,
        }),
      );
      void postTaskRecordActionOffline(
        taskId,
        { intent },
        // PWA-12 — ticking a Task offline queues the canonical COMPLETION intent
        // and nothing else. The client never computes a recurrence successor:
        // the authoritative engine is server-side, it runs when this intent
        // replays, and it is what decides whether a successor exists at all
        // (§10). The row shows the occurrence as completed-and-pending; it does
        // not invent the next one.
        //
        // No `baseValue`: a completion is not reconciled like a text field. The
        // only question that matters is whether the Task is ALREADY in the
        // terminal state the owner asked for, which is a fact about the server's
        // current record and needs no base to compare against (§20).
        { operation: completed ? "complete" : "reopen" },
      )
        .then((outcome) => {
          if (outcome.kind === "refused") {
            refuse(taskId, outcome.message, ["completedAt"]);
            return;
          }
          if (outcome.kind === "queued") {
            // Queued, NOT confirmed. The patch stays (the row shows the owner's
            // change), the announcement says what actually happened, and no
            // recurrence note is offered — only the server knows that, and
            // claiming one here is exactly the lie PWA-12 exists to prevent.
            setAnnouncement(
              completed
                ? `Completed ${title}. Waiting to sync.`
                : `Reopened ${title}. Waiting to sync.`,
            );
            return;
          }
          const result = outcome.data;
          if (result.kind !== "completion") {
            refuse(taskId, GENERIC_ROW_REFUSAL, ["completedAt"]);
            return;
          }
          if (result.ok === false) {
            refuse(taskId, result.message, ["completedAt"]);
            return;
          }
          // TASKS-04: completing or undoing a REPEATING task has a second
          // consequence, and the surface says so rather than leaving a new (or
          // surviving) occurrence unexplained. Only the server knows which.
          // The change is the SERVER's now, so the row may legitimately leave a
          // surface that does not keep completed work.
          markDeparting(taskId);
          const label = completed
            ? `Completed ${title}.`
            : `Reopened ${title}.`;
          const note = recurrenceNote(result.recurrence);
          setAnnouncement(`${label}${note}`);
          if (undoable) {
            // ONE affordance: the visible confirmation IS the way back. The undo
            // window is the notification's own timer (DS-10), not a second one.
            notifyUndo(label, {
              message: note.trim().length > 0 ? note.trim() : undefined,
              announce: false,
              onUndo: () =>
                completeRef.current(taskId, title, !completed, false),
            });
          }
          revalidateFor(intent);
        })
        .catch(() => refuse(taskId, GENERIC_ROW_REFUSAL, ["completedAt"]));
    },
    [notifyUndo, refuse, revalidateFor, markDeparting],
  );
  completeRef.current = runCompletion;

  const setCompleted = useCallback(
    (taskId: string, completed: boolean, title: string) => {
      runCompletion(taskId, title, completed, true);
    },
    [runCompletion],
  );

  /** A single-id `/tasks/bulk` field change, painted while it is in flight. */
  const setField = useCallback(
    (
      taskId: string,
      fields: Record<string, string>,
      label: string,
      patch: TaskListItemPatch,
    ) => {
      const intent = fields.intent ?? "";
      const keys = Object.keys(patch) as (keyof TaskListItemPatch)[];
      setPatches((previous) => withTaskPatch(previous, taskId, patch));
      void postTaskBulkAction([taskId], fields)
        .then((outcome) => {
          if (!outcome.ok) {
            refuse(taskId, outcome.message, keys);
            return;
          }
          setAnnouncement(label);
          revalidateFor(intent);
        })
        .catch(() => refuse(taskId, GENERIC_ROW_REFUSAL, keys));
    },
    [refuse, revalidateFor],
  );

  /**
   * A canonical `/tasks/:taskId` record mutation from the row — the same route the
   * Drawer's own controls post to. Used for the recurrence-series operations (skip,
   * stop repeating) and the commitment change, which are task-domain operations
   * rather than field writes and so have no place on the bulk field endpoint.
   *
   * A SERIES operation is deliberately NOT painted optimistically: its consequence
   * reaches the rule, both dates and possibly a successor record the client has never
   * seen, and a guess about any of those would be a guess about something the owner
   * would then have to check.
   */
  const setRecord = useCallback(
    (
      taskId: string,
      fields: Record<string, string>,
      label: string,
      patch?: TaskListItemPatch,
    ) => {
      const intent = fields.intent ?? "";
      const keys = patch
        ? (Object.keys(patch) as (keyof TaskListItemPatch)[])
        : [];
      if (patch) {
        setPatches((previous) => withTaskPatch(previous, taskId, patch));
      }
      void postTaskRecordAction(taskId, fields)
        .then((result) => {
          const refused =
            (result.kind === "update" ||
              result.kind === "planning" ||
              result.kind === "waiting") &&
            result.status === "error";
          if (refused) {
            refuse(
              taskId,
              result.formError ??
                Object.values(result.fieldErrors ?? {})[0] ??
                GENERIC_ROW_REFUSAL,
              keys,
            );
            return;
          }
          setAnnouncement(label);
          revalidateFor(intent);
        })
        .catch(() => refuse(taskId, GENERIC_ROW_REFUSAL, keys));
    },
    [refuse, revalidateFor],
  );

  /**
   * DHDS-11 — a SPATIAL move: the Task was dragged into another bucket.
   *
   * It is `setField` plus one thing — an Undo — and it is a separate function
   * for exactly that reason rather than a flag on the other.
   *
   *   - **The route is the same.** `/tasks/bulk`, with the same intent the bulk
   *     bar and the row's own DHDS-10 control post. There is no drag mutation
   *     path anywhere in the product; `submission` came from
   *     `taskDropSubmission`, which is the one place that decides what a bucket
   *     means (§42 of the brief, and the hard architectural requirement of it).
   *   - **The paint leads and the claim does not.** ADR-086: the patch is
   *     applied immediately, and the announcement, the Undo and any statement of
   *     success wait for the server.
   *   - **Undo is the product's Undo.** The reverse submission is the SAME
   *     `taskDropSubmission` computed for the bucket the Task came from, so a
   *     move and its reversal cannot be different operations. The undo itself
   *     offers no undo — one step back, not a history.
   *
   * A move earns a toast where a small inline edit does not (DHDS-10 §"Mutation,
   * optimism and Undo"): the object has left the place the owner was looking at,
   * and the toast is what says where it went.
   */
  const moveTask = useCallback(
    (taskId: string, move: TaskMoveRequest, undoable = true) => {
      const intent = move.fields.intent ?? "";
      const keys = Object.keys(move.patch) as (keyof TaskListItemPatch)[];
      setPatches((previous) => withTaskPatch(previous, taskId, move.patch));
      void postTaskBulkAction([taskId], { ...move.fields })
        .then((outcome) => {
          if (!outcome.ok) {
            refuse(taskId, outcome.message, keys);
            return;
          }
          setAnnouncement(`${move.label}.`);
          // A move out of a bucket is a departure from that bucket, and the
          // same collapse says so.
          markDeparting(taskId);
          if (undoable && move.undo !== null) {
            const back = move.undo;
            notifyUndo(move.label, {
              announce: false,
              onUndo: () =>
                moveRef.current(
                  taskId,
                  { ...back, label: "Move undone", undo: null },
                  false,
                ),
            });
          }
          revalidateFor(intent);
        })
        .catch(() => refuse(taskId, GENERIC_ROW_REFUSAL, keys));
    },
    [refuse, revalidateFor, notifyUndo, markDeparting],
  );
  /*
   * Held in a ref so Undo can call the same function without an undo of an undo
   * of an undo — the identical device `runCompletion` uses above.
   */
  const moveRef = useRef(moveTask);
  moveRef.current = moveTask;

  /**
   * Report a change the ROW's own inline field already persisted through a canonical
   * route. The inline fields own their own request (DS-16 needs a promise-returning
   * save), so this is how their outcome reaches the same live region, the same patch
   * map and the same revalidation rule every other row mutation uses — one
   * announcement channel, not two.
   */
  const reportInlineSave = useCallback(
    (save: TaskRowFieldSave) => {
      setPatches((previous) =>
        withTaskPatch(previous, save.taskId, save.patch),
      );
      setAnnouncement(save.message);
      revalidateFor(save.intent);
    },
    [revalidateFor],
  );

  /**
   * Announce a COMMITTED bulk outcome and re-read the list.
   *
   * Bulk keeps its unconditional revalidation by decision: a bulk change is a
   * deliberate operation over a whole selection, its per-bucket counts are the
   * server's, and the selection is cleared by the same commit — there is no row left
   * on screen for an optimistic patch to belong to.
   */
  const announce = useCallback(
    (message: string) => {
      setAnnouncement(message);
      revalidator.revalidate();
    },
    [revalidator],
  );

  /**
   * PWA-12 — report a rename that was accepted LOCALLY because DalyHub could not
   * be reached.
   *
   * It paints the new title (the owner's change is real and the row must show it)
   * and announces it as waiting to sync. It does NOT revalidate: there is nothing
   * new on the server to read, and asking would be a request this device has just
   * proven it cannot make.
   */
  const reportQueuedTitle = useCallback((taskId: string, title: string) => {
    setPatches((previous) => withTaskPatch(previous, taskId, { title }));
    setAnnouncement(`Renamed to ${title}. Waiting to sync.`);
  }, []);

  return {
    patches,
    departing,
    setCompleted,
    setField,
    setRecord,
    moveTask,
    reportInlineSave,
    reportQueuedTitle,
    announce,
    announcement,
  };
}

/**
 * How long an id stays eligible to DEPART after the server accepted its change.
 *
 * Long enough for the loader's answer to arrive and the exit to run, short
 * enough that an unrelated later removal of the same row — a filter change a few
 * seconds afterwards — is not mistaken for the consequence of an act the owner
 * has stopped thinking about.
 */
const DEPARTURE_ELIGIBILITY_MS = 2_000;

/** The steady state: nothing has been changed, so nothing may depart. */
const NO_DEPARTING_TASKS: ReadonlySet<string> = new Set<string>();

/*
 * TASKS-04 / DHDS-10 — the inline TITLE editor moved to `~/shared/task-record`.
 *
 * It was declared here, privately, which was defensible while `/tasks` was the
 * only surface that could rename a row. Today and Plan draw the SAME shared
 * `TaskRow`, over the same Tasks, with the same `titleEditor` slot — and had no
 * editor to put in it, so correcting a typo from the surface an owner spends
 * the working day on meant opening the record.
 *
 * `TaskTitleEditor` is that component, unchanged in every observable respect —
 * the same `rename` intent, the same offline queueing, the same Enter/Escape/
 * blur contract, the same refusal handling that keeps the typed text. What is
 * different is that three surfaces now share it.
 */

/* -------------------------------------------------------------------------- */
/* The surface                                                                 */
/* -------------------------------------------------------------------------- */

function TasksWorkspaceInner({ data }: { readonly data: TasksPageData }) {
  const [searchParams] = useSearchParams();
  // `/tasks`, `/inbox` or `/upcoming` — every configuration change navigates
  // back to whichever of them the owner is actually on.
  const basePath = useWorkspaceBasePath();
  const { openDrawer, entries: drawerEntries } = useDrawer();
  const config = data.config;
  const quick = useTaskQuickMutation(config, data);
  // An accepted rename re-reads the list: the title is what the collection is
  // ORDERED and GROUPED by on several of its configurations, so painting it
  // locally without re-reading would leave the row in the wrong place.
  const revalidator = useRevalidator();
  /**
   * TASKS-04 — which row (if any) is being renamed inline. Held here rather than in
   * the row so exactly one title is ever in edit mode and the Card keeps its open
   * control everywhere else.
   */
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);

  const controlGroups = useMemo(
    () =>
      buildTasksControlGroups({
        delegates: data.delegates.map((value) => ({ value, label: value })),
        parents: data.parents,
        // The canonical KEY is what the query matches; the label is the owner's
        // own spelling of it.
        tags: data.tags.map((tag) => ({ value: tag.key, label: tag.label })),
      }),
    [data.delegates, data.parents, data.tags],
  );

  const resetKey = useMemo(() => JSON.stringify(config), [config]);

  /**
   * The CANONICAL parameters for this page: exactly the configuration the server
   * actually applied, written back over the parameters the module does not own.
   *
   * The controls and the chips read from THIS, not from the raw URL, so what they
   * claim is applied is always what the query applied. A value the kernel rejected
   * — a hand-typed nonsense filter, a dimension a later build removed — is gone
   * from the badge, gone from the chips, and gone from anything an Apply writes
   * back, instead of quietly describing a narrower list than the one on screen.
   */
  const canonicalParams = useMemo(
    () => paramsFromConfig(config, searchParams),
    [config, searchParams],
  );

  const loadHref = useCallback(
    (cursor: string): string => {
      const next = new URLSearchParams(searchParams);
      next.delete("drawer");
      next.set(TASKS_PARAMS.cursor, cursor);
      // The named routes delegate to this same loader, so a cursored request
      // against the current path reads the identical page.
      return `${basePath}?${next.toString()}`;
    },
    [searchParams, basePath],
  );

  const { items, hasMore, loading, loadFailed, loadMore } = useTaskPagination(
    data.items,
    data.nextCursor,
    resetKey,
    loadHref,
  );

  /*
   * PWA-12 — the changes this device is holding, as row presentation.
   *
   * They are merged into the SAME patch map an in-flight online change uses, and
   * they are applied UNDER it: an edit made since the queue was read is newer
   * than anything in it. That is what makes a queued change survive a reload —
   * `quick.patches` is memory, the queue is durable storage, and a page that has
   * just booted has the second and not the first.
   */
  const pending = usePendingTasks();
  // When replay applies something, the truth has moved — most consequentially a
  // recurring completion's successor, which only the server can produce. Re-read
  // rather than guess (§10).
  useReplayRevalidation();
  const patches = useMemo(() => {
    if (pending.size === 0) return quick.patches;
    const merged = new Map(quick.patches);
    for (const [taskId, state] of pending) {
      merged.set(taskId, { ...state.patch, ...merged.get(taskId) });
    }
    return merged;
  }, [pending, quick.patches]);

  /*
   * The rows, with any in-flight change already applied (ADR-086).
   *
   * The patch is applied to the SERIALISED record, before `toTaskCardData`, so the
   * strike-through, the state pill, the tone and the urgency chip are all re-derived
   * by the same pure functions that read the server's own answer. There is no display
   * value an optimistic row can have and a reconciled one cannot.
   */
  const patchedItems = useMemo(
    () => applyTaskPatches(items, patches),
    [items, patches],
  );
  const cards = useMemo(
    () => patchedItems.map((item) => toTaskCardData(item)),
    [patchedItems],
  );

  // A grouped view renders from the SERVER grouping (authoritative per-bucket
  // counts + bounded records), not from the accumulated flat page. A loader re-run
  // replaces `data.grouping` wholesale, so stale bucket data can never linger. The
  // in-flight patches reach its RECORDS and never its counts — a count is the
  // server's claim, and an optimistic presentation does not get to restate it.
  const grouping = useMemo(
    () => applyTaskPatchesToGrouping(data.grouping, patches),
    [data.grouping, patches],
  );
  const isGrouped = grouping !== null;
  const groupedSections = useMemo<GroupedSection[]>(
    () => resolveGroupedSections(grouping),
    [grouping],
  );
  const groupedTotal = useMemo(
    () => (grouping ? grouping.groups.reduce((n, g) => n + g.count, 0) : 0),
    [grouping],
  );

  // "View all N" links to the FLAT list scoped to the same population plus the
  // bucket's own filter, so an overflowing bucket paginates independently on its own
  // cursor without an unbounded read — and lands on exactly the records it counted.
  const viewAllHref = useCallback(
    (section: GroupedSection): string | null => {
      if (section.filterParam === null || section.filterKey === null) {
        return null;
      }
      const next = new URLSearchParams(searchParams);
      next.set(TASKS_PARAMS.presentation, "list");
      next.delete(TASKS_PARAMS.groupBy);
      next.set(section.filterParam, section.filterKey);
      next.delete(TASKS_PARAMS.cursor);
      next.delete("drawer");
      return `${basePath}?${next.toString()}`;
    },
    [searchParams, basePath],
  );

  /**
   * TASKS-06 — multi-selection, through the ONE pure reducer (`task-selection.ts`).
   *
   * Two invariants the reducer enforces and this component supplies the inputs for:
   *
   *   - selection is RESET on any configuration change (a filter, a saved view, a
   *     sort, a grouping), because the rows the owner was pointing at are gone and a
   *     surviving selection would act on records they can no longer see (brief §20);
   *   - after every re-query the selection is PRUNED to what is still on screen, so a
   *     task whose own mutation moved it out of the view stops being counted rather
   *     than lingering invisibly.
   */
  const [selection, dispatchSelection] = useReducer(
    taskSelectionReducer,
    EMPTY_TASK_SELECTION,
  );
  const selected = selection.ids;
  /**
   * Whether rows draw their bulk-selection checkbox — see the row's own note.
   * `selected.size > 0` as well as the mode flag, so a selection that survives a
   * revalidation is never left un-clearable behind an absent control.
   */
  const selectionVisible = selection.mode || selected.size > 0;
  useEffect(() => {
    dispatchSelection({ type: "reset" });
  }, [resetKey]);
  const clearSelection = useCallback(
    () => dispatchSelection({ type: "reset" }),
    [],
  );

  /**
   * Every task on screen, in DISPLAY order — flat page or grouped buckets, whichever
   * this presentation rendered. It is the input a Shift-range needs (a range is
   * "everything between these two rows", which only the display order defines) and the
   * input `prune` needs (drop the selection of a row that is no longer here).
   */
  const visibleCards = useMemo<readonly TaskCardData[]>(
    () =>
      isGrouped
        ? groupedSections.flatMap((section) => section.cards)
        : (cards as readonly TaskCardData[]),
    [cards, groupedSections, isGrouped],
  );
  const visibleIds = useMemo(
    () => visibleCards.map((card) => card.id),
    [visibleCards],
  );
  /**
   * What "Select all" may take, and whether the loaded list outran the bulk bound
   * (DEBT-110). The rule itself lives in `task-selection.ts` beside the reducer.
   */
  const bound = useMemo(() => boundBulkSelection(visibleIds), [visibleIds]);
  /**
   * Read inside the row's selection callback. A ref rather than a dependency, so
   * changing what is on screen does not rebuild every row's props — the callback needs
   * the order only at the moment it fires.
   */
  const visibleIdsRef = useRef<readonly string[]>(visibleIds);
  visibleIdsRef.current = visibleIds;

  // After every re-query, forget the ids that are gone. A mutation that moved a task
  // out of this view stops counting towards the selection instead of lingering
  // invisibly (brief §20).
  useEffect(() => {
    dispatchSelection({ type: "prune", visibleIds });
  }, [visibleIds]);

  /** The SELECTED tasks, for the bulk bar's mixed-value summaries (brief §17). */
  const selectedCards = useMemo(
    () => visibleCards.filter((card) => selected.has(card.id)),
    [selected, visibleCards],
  );

  const density = config.density;

  /**
   * The Deleted view is a RECOVERY surface, not a working one.
   *
   * A soft-deleted Task is invisible to every ordinary mutation — `getTask` will not
   * resolve it — so offering the row's inline fields and its Complete action there
   * would offer controls that can only ever fail. In the trash there are exactly two
   * useful moves: restore it, or leave it. The row says so by going read-only rather
   * than by refusing each attempt afterwards.
   */
  const viewingDeleted = config.systemView === "deleted";

  /*
   * DHDS-11 — is this configuration a SPATIAL one?
   *
   * A grouped view draws its destinations already: every bucket is a
   * server-authoritative group of one dimension. Four of those dimensions are a
   * stored field whose bucket key IS a value of that field, and dropping into
   * one sets it — `task-drop-targets.ts` is where that is decided and why.
   * Everything else here is null, which means the page is exactly what it was:
   * no handles, no targets, no listeners.
   *
   * Two configurations opt out even when the dimension qualifies:
   *
   *   - the DELETED view, where every mutation is invisible, so a drag could
   *     only ever fail;
   *   - SELECTION mode, which is a mode with its own gesture (a hold enters it,
   *     a tap extends it). Two leading controls and two meanings for a press on
   *     the same row is the interaction conflict §44 of the brief describes, and
   *     the selection has a "Move" action of its own in the bulk bar.
   */
  const dropDimension = useMemo<TaskDropDimension | null>(() => {
    if (viewingDeleted || selectionVisible || grouping === null) return null;
    return isTaskDropDimension(grouping.dimension) ? grouping.dimension : null;
  }, [viewingDeleted, selectionVisible, grouping]);

  /*
   * DHDS-11 — the drop handler, from the module's own drag wiring.
   *
   * `TaskDragging.tsx` owns everything that knows a bucket is a destination:
   * the grip, the floating Task, the bucket's registration and the translation
   * from a bucket to a canonical intent. This surface owns the mutation host and
   * the collection, and hands one to the other.
   */
  const handleTaskDrop = useTaskDropHandler(quick.moveTask);

  /**
   * DS-04 — one task, as {@link TaskRow} props.
   *
   * The row replaced the generic `Card` on this surface (see `TaskRow.tsx` for
   * why a card could not reach the concept's column grid), so what this builds
   * is the row's data plus its callbacks. Everything about AUTHORITY is
   * unchanged: completion, priority, project and the two dates are the same
   * shared controls posting the same canonical intents, and the overflow below
   * is the same long tail it has been since TASKS-05.
   *
   * The three-tier `metadata` run this used to assemble is gone with the card.
   * The tiers were an attempt to impose hierarchy on a wrapping flex run; the
   * row expresses the same hierarchy structurally — the title is the only
   * flexible column and every other fact sits in a fixed, quieter one — so the
   * declaration has nothing left to do.
   */
  /**
   * The Task ids whose record is currently open, from the drawer stack.
   *
   * A stack rather than a single id: the Drawer nests (a Task opened from a
   * Task), and every row in the chain is one the owner came THROUGH.
   */
  const openRecordIds = useMemo(() => {
    const ids = new Set<string>();
    for (const entry of drawerEntries) {
      const [kind, id] = entry.key.split(":");
      if ((kind === "task" || kind === "task-quick") && id) ids.add(id);
    }
    return ids;
  }, [drawerEntries]);

  const toRowProps = useCallback(
    (card: TaskCardData, headingLevel: 2 | 3): TaskRowProps => {
      /*
       * PWA-12 — the ONE thing a row says about synchronisation, and only when
       * there is something to say.
       *
       * No cloud icons, no green "synced" text, no permanent badge: a Task with
       * nothing outstanding carries no sync chrome at all, which is the steady
       * state and must look completely ordinary. When a change IS waiting, the
       * row says so in words beside its title — because the distinction between
       * "I changed this" and "DalyHub has this" is the one fact the interface
       * must never blur.
       */
      const pendingState = pending.get(card.id);

      const planTodayAction = card.completed
        ? null
        : {
            id: "plan-today",
            label: "Today",
            ariaLabel: `Plan ${card.title} for today`,
            onSelect: () =>
              quick.setField(
                card.id,
                { intent: "plan", scheduledDate: data.todayIso },
                `Planned ${card.title} for today.`,
                { scheduledDate: data.todayIso },
              ),
          };
      /*
       * UIX-01 — the row carries NO permanent action buttons.
       *
       * These two were rendered as visible 44px buttons on every row: revealed
       * on hover on a pointer device, but permanently on touch — which is most
       * of why a phone task row was 230px tall and carried "Complete" and
       * "Today" under every title. The reference's rows carry none, and both
       * actions are now better placed than they were:
       *
       *   - **Complete** is the leading circle, which is where the frequent act
       *     belongs and where every reference product puts it;
       *   - **Plan for today** is in the row's overflow menu (below) and on the
       *     touch swipe tray, so it is reachable by pointer, by keyboard and by
       *     gesture without occupying the row.
       *
       * The swipe tray still offers BOTH, because a gesture is an accelerator
       * over affordances that exist elsewhere — never the only path.
       */
      /*
       * DS-04 — the swipe tray and the row's quick-action slot went with the
       * Card, and nothing became unreachable with them. Complete is the leading
       * circle it has been since UIX-01; "Plan for today" is in the overflow
       * below, which is reachable by pointer, by keyboard and by screen reader
       * on every device. A gesture was always an accelerator over affordances
       * that exist elsewhere (§26), never the only path to either of them.
       */

      // The long tail of quick edits stays in the ONE shared overflow menu rather
      // than turning every row into a spreadsheet. Archive/restore/delete keep the
      // shared lifecycle placement: a Task's removal is a status change made in the
      // canonical Drawer, so the menu POINTS there rather than forking a second
      // lifecycle path (PX-04).
      /*
       * The overflow holds the LONG TAIL only.
       *
       * TASKS-05 removed nine entries from it — "Set P1"…"Set P4", "Due today", "Clear
       * due date", "Clear planned date" and "Move to Inbox" — because every one of them
       * is now a direct edit on the row itself. A menu item that duplicates a control
       * six pixels away is not a second affordance, it is a second place to keep in
       * step. What remains is what genuinely does not fit on a row: renaming (which
       * replaces the title), the searchable full parent picker, the composed
       * quick-edit panel, the commitment change, and the recurrence-series operations.
       */
      /*
       * ── CONTROL-01 §5, the menu's own anatomy ──────────────────────────────
       * Every item carries a LEADING ICON, so the menu is scannable by shape
       * before it is read and every row is the same height whether or not it has
       * one — a menu where three of seven items have a glyph reads as three
       * kinds of item. Descriptions appear only where the label genuinely leaves
       * a question open ("Skip this occurrence" — and does that complete it?);
       * where it does not, a second line is noise that makes the row taller than
       * its neighbours for nothing.
       *
       * The RECORD-LEVEL action sits below a separator at the foot, on its own,
       * because it is the only item that changes surface rather than changing
       * the task in place. There is exactly ONE of them now: "Priority, dates and
       * repeat…" and "Open task record" pointed at two different editors for one
       * object, and §4 merged them.
       */
      /*
       * TODAY-TASK-01 — the SET is shared; only the callbacks are this surface's.
       *
       * It was declared inline here, which was correct while `/tasks` was the
       * only surface drawing the shared row. Today now draws the same row, and a
       * long tail that lives in one module's component is a long tail the second
       * caller can only get by copying — which is how "the same task behaves the
       * same way everywhere" stops being true. The ordering, the icons, the
       * separators and the three shapes (read-only, completed, open) all moved to
       * `~/shared/task-record/task-row-actions` unchanged.
       */
      const overflowActions = buildTaskRowActions(
        card,
        {
          onOpenRecord: () => openDrawer(`task:${card.id}`),
          ...(planTodayAction ? { onPlanToday: planTodayAction.onSelect } : {}),
          onRename: () => setEditingTitleId(card.id),
          onMoveToParent: () => openDrawer(`task-move:${card.id}`),
          onSomeday: () =>
            quick.setField(
              card.id,
              { intent: "set_commitment", commitment: "someday" },
              `${card.title} moved to Someday / Maybe.`,
              { commitmentState: "someday" },
            ),
          onSkipOccurrence: () =>
            quick.setRecord(
              card.id,
              { intent: "skip_occurrence" },
              `Skipped this occurrence of ${card.title}.`,
            ),
          onStopRepeating: () =>
            quick.setRecord(
              card.id,
              { intent: "set_recurrence" },
              `${card.title} no longer repeats.`,
            ),
        },
        { readOnly: viewingDeleted },
      );

      const key = `task:${card.id}`;
      return {
        task: card,
        /*
         * DHDS-11 §"Inspector continuity" — the row whose record is open keeps
         * a quiet current marker, so closing the Inspector returns the owner's
         * eye to where they opened it from. It reads the drawer STACK rather
         * than a second piece of state, so it is true for a bookmarked URL and
         * for a Back-navigated one exactly as it is for a click.
         */
        current: openRecordIds.has(card.id),
        todayIso: data.todayIso,
        parents: data.parents,
        headingLevel,
        href: `?${withDrawerPushed(searchParams, key).toString()}`,
        onOpen: () => openDrawer(key),
        onCompletedChange: (complete: boolean) =>
          quick.setCompleted(card.id, complete, card.title),
        onInlineSave: quick.reportInlineSave,
        /*
         * DHDS-10 §11 — the project menu's escape hatch is INLINE.
         *
         * It was `openDrawer("task-move:<id>")`, so the one command in the
         * field whose purpose is to choose a Project opened the Task's whole
         * record. The field now opens the shared searchable picker over its own
         * cell, so nothing about "move this task" leaves the collection. The
         * overflow's "Move to Project or Area…" still points at the record: it
         * is the phone path for a task with no parent (whose metadata trigger a
         * phone drops) and the deeper home for everything else about the Task.
         */
        overflowActions,
        readOnly: viewingDeleted,
        pending: pendingState !== undefined,
        ...(pendingState ? { pendingNote: pendingState.label } : {}),
        // The editor replaces the title ONLY while this row is being renamed;
        // every other row keeps the ordinary open link (TASKS-04).
        ...(editingTitleId === card.id
          ? {
              titleEditor: (
                <TaskTitleEditor
                  taskId={card.id}
                  title={card.title}
                  onDone={() => setEditingTitleId(null)}
                  onSaved={() => revalidator.revalidate()}
                  onQueued={quick.reportQueuedTitle}
                />
              ),
            }
          : {}),
        /*
         * TASKS-08 — a touch HOLD enters selection mode and selects the held
         * row, so multi-select on a phone costs one gesture. It is an
         * accelerator: the checkbox below and the "Select tasks" item in the
         * header menu are the ordinary, keyboard-and-screen-reader path, and
         * the hold is inert on a non-touch device.
         */
        onLongPress: () => dispatchSelection({ type: "enter", id: card.id }),
        /*
         * UIX-01 — the bulk-SELECTION checkbox appears in selection MODE.
         *
         * A row leads with its completion circle, and two leading controls on
         * every row — one that finishes the task and one that adds it to a
         * batch — is both the busiest thing on the page and a genuine mis-click
         * risk. Selection is a mode the owner enters deliberately, and it has
         * three entry points, none of which was ever the checkbox itself.
         */
        ...(selectionVisible
          ? {
              selection: {
                selected: selected.has(card.id),
                // Shift extends a RANGE from the last row toggled, in the order
                // the rows are on screen — which is why the visible order is
                // passed rather than inferred.
                onSelectedChange: (
                  on: boolean,
                  modifiers?: { readonly shift: boolean },
                ) =>
                  dispatchSelection({
                    type: "toggle",
                    id: card.id,
                    selected: on,
                    shift: modifiers?.shift,
                    visibleIds: visibleIdsRef.current,
                  }),
                label: `Select ${card.title}`,
              },
            }
          : {}),
      };
    },
    [
      data.todayIso,
      data.parents,
      searchParams,
      openRecordIds,
      openDrawer,
      revalidator,
      selected,
      selectionVisible,
      quick,
      editingTitleId,
      pending,
      viewingDeleted,
    ],
  );

  /**
   * The list.
   *
   * FINAL-UI removed the column KEY that DS-04 drew above an ungrouped list.
   * Neither approved Tasks concept has one, and the reason they do not is
   * legible once the row is dense: `Task · Project · Date · Priority · Status`
   * in small caps above thirty rows is a table header, and a table header is
   * what makes a list read as a data grid rather than as the owner's work. Every
   * cell inside a row still carries its own accessible name, which is what the
   * key was decorative FOR (it was `aria-hidden`), so nothing is lost to a
   * screen reader — and the columns still line up, because the grid template
   * lives on the list rather than on the header that used to demonstrate it.
   */
  const renderCollection = useCallback(
    (
      list: readonly TaskCardData[],
      ariaLabel: string,
      headingLevel: 2 | 3,
      /*
       * DHDS-11 — the bucket these rows are IN, when the view has buckets.
       *
       * The server put the row here, so this is the value of the grouping
       * dimension for every Task in the list — which is what lets the bucket a
       * Task came from refuse its own drop without a second derivation of the
       * same fact.
       */
      bucketKey?: string,
    ) => (
      <TaskCollection
        list={list}
        ariaLabel={ariaLabel}
        headingLevel={headingLevel}
        density={density}
        departing={quick.departing}
        dropDimension={dropDimension}
        toRowProps={toRowProps}
        {...(bucketKey === undefined ? {} : { bucketKey })}
      />
    ),
    [toRowProps, density, dropDimension, quick.departing],
  );

  const count = isGrouped ? groupedTotal : items.length;
  const filterCount = taskViewFilterCount(config);
  /*
   * CONVERGE-01 §B — say what STATE the work is in, not "93 Tasks" under a page
   * titled Tasks.
   *
   * The breakdown is only drawn when it is a COMPLETE statement about the list
   * on screen (see `taskStateBreakdown`); a bounded page falls back to the count
   * line, which declares its own bound. A grouped view falls back too, because
   * its per-bucket headings already carry authoritative server counts.
   */
  const groupedBounded = grouping
    ? grouping.groups.some((group) => group.hasMore)
    : false;
  const breakdown = taskStateBreakdown(visibleCards, data.todayIso, {
    bounded: isGrouped ? groupedBounded : hasMore,
  });
  const subtitle = data.failed
    ? "We couldn’t load your Tasks."
    : (breakdown ??
      collectionCountLabel(count, "Task", "Tasks", {
        // A GROUPED view has already loaded every group it draws, so its figure
        // is the whole collection rather than a page of it.
        hasMore: !isGrouped && hasMore,
      }));

  const isReloading = useCollectionLoading();
  const currentQuery = useMemo(() => {
    const next = new URLSearchParams(searchParams);
    next.delete("drawer");
    next.delete(TASKS_PARAMS.cursor);
    return next.toString();
  }, [searchParams]);
  // A shared link reproduces the place the sender was looking at, destination
  // included — not the general workspace with their filters pasted onto it.
  const shareUrl =
    typeof window === "undefined"
      ? `${basePath}?${currentQuery}`
      : `${window.location.origin}${basePath}${currentQuery.length > 0 ? `?${currentQuery}` : ""}`;

  // Classification carried for the session by the quick-add row: a task added while
  // looking at a filtered view lands in that view rather than somewhere the user
  // then has to go and find.
  const sessionDefaults = useMemo(() => {
    const defaults: {
      priority?: string;
      timeSector?: string;
      scheduledDate?: string;
    } = {};
    /*
     * SMART-01 — a quick-add default is seeded from the priority filter only when
     * it names EXACTLY ONE real priority. The dimension is a set now, and a view
     * filtered to "P1 and P2" has no single priority a new Task should inherit —
     * picking one of the two would be inventing the owner's intent.
     */
    const priorities = config.filters.priorities;
    const onlyPriority =
      priorities?.length === 1 && priorities[0] !== "__none"
        ? priorities[0]
        : undefined;
    if (onlyPriority) defaults.priority = onlyPriority;
    const sector = config.filters.timeSector;
    if (sector && sector !== "__none") defaults.timeSector = sector;
    else if ((TIME_SECTORS as readonly string[]).includes(config.systemView)) {
      defaults.timeSector = config.systemView;
    }
    if (
      config.systemView === "today" ||
      config.filters.plannedState === "planned_today"
    ) {
      defaults.scheduledDate = data.todayIso;
    }
    return defaults;
  }, [config, data.todayIso]);

  return (
    <CollectionLayout
      // UIX-01 — names the surface so the redesigned task-row rules can scope
      // to it. A task row leads with a completion control and ends with a date;
      // applying that density to Notes, People and Assets at the same time
      // would be a redesign of eleven modules made by accident.
      className="dh-collection--tasks dh-collection--flat"
      isLoading={isReloading}
      title={tasksDestinationTitle(basePath)}
      subtitle={subtitle}
      density={density}
      // UIQ-014 — Review Inbox is a SECONDARY action, and now sits in the
      // secondary slot rather than borrowing the primary one. Tasks
      // deliberately has no page-level create (see below), and an empty primary
      // slot is the honest expression of that: promoting the next-most-likely
      // action into it would make "the primary action" mean something different
      // here than everywhere else.
      /*
       * UIX-01 — the header's UTILITY CLUSTER, in the redesign reference's own
       * composition: everything that shapes the list, then the one create.
       *
       * What changed, and why each of them:
       *
       *   - **Two filled secondary buttons became an overflow menu.** "Select
       *     tasks" and "Review Inbox" were the two most conspicuous objects on
       *     the page, in tinted pills, above a list they are not part of. They
       *     are both still here, both still labelled, both still keyboard
       *     reachable — in the ONE shared overflow menu, which is where the
       *     reference puts a page's long tail and where every other collection
       *     in DalyHub already puts its secondary actions.
       *   - **The layout switcher moved into that menu too.** List / Board /
       *     Sectors is a real choice and a rare one; a three-segment control
       *     permanently parked beside the title spends the header's best space
       *     on a decision made once a week. It writes the same `?view=`
       *     parameter through the same shared control model.
       *   - **A page-level create came BACK.** A previous pass removed it
       *     because it opened the generic capture chooser — a second door onto
       *     the same room. This one opens the shared capture surface already ON
       *     the Task panel, which is a different thing: one tap to a focused
       *     title field on the page whose entire subject is tasks. It is the
       *     reference's most prominent control and it was the honest gap.
       */
      secondaryActions={
        <TasksOverflow
          selection={selection}
          onSelectionChange={dispatchSelection}
          presentation={config.presentation}
        />
      }
      primaryAction={<NewTaskButton />}
      filterBar={
        <TasksViewSwitcher
          views={data.views}
          activeViewId={data.activeViewId}
          modified={data.viewModified}
          currentQuery={currentQuery}
          shareUrl={shareUrl}
        />
      }
      // ONE control surface at every width (TASKS-03): the shared sheet carries all
      // sixteen filter dimensions, the sorts, the groupings and the density, and the
      // shared chip row keeps what is applied visible without reopening it.
      persistentControls
      mobileControls={
        <CollectionControls
          groups={controlGroups}
          triggerLabel="Filter & sort"
          basePath={basePath}
          params={canonicalParams}
        />
      }
      error={
        data.failed ? (
          <EmptyState
            title="We couldn’t load your tasks"
            description="Something went wrong. Please try again."
          />
        ) : undefined
      }
      isEmpty={!data.failed && count === 0 && filterCount === 0}
      isFilteredEmpty={!data.failed && count === 0 && filterCount > 0}
      filteredEmptySlot={
        <EmptyState
          icon={<EntityIcon type="task" />}
          title="No tasks match these filters"
          description="Nothing is hidden permanently — remove a filter above, or reset them all, to see your tasks again."
        />
      }
      emptySlot={
        <EmptyState
          icon={<EntityIcon type="task" />}
          title="No tasks yet"
          description="Capture a task, or choose a different view."
          primaryAction={
            <DrawerTrigger
              drawerKey={NEW_TASK_KEY}
              className="dh-btn dh-btn--primary"
            >
              New task
            </DrawerTrigger>
          }
          // HELP-01 — an empty Tasks list is where "what is a scheduled date, and
          // how is it different from a due date?" actually gets asked. The
          // secondary action answers it instead of adding a second button that
          // does the same thing as the first.
          secondaryAction={
            <Link
              className="dh-btn dh-btn--secondary"
              to={helpTopicHref("scheduled-vs-due")}
            >
              How tasks work
            </Link>
          }
        />
      }
      selection={
        selected.size > 0 ? (
          /*
           * V2.8 CONV-01 — the SHARED bar. It was declared at the foot of this
           * file; a Project's Tasks tab now selects the same rows through the
           * same reducer, so the bar moved beside them and both surfaces render
           * one implementation over the one `/tasks/bulk` contract.
           */
          <TaskBulkActionBar
            tasks={selectedCards}
            ids={[...selected]}
            todayIso={data.todayIso}
            parents={data.parents}
            viewingDeleted={viewingDeleted}
            onCleared={clearSelection}
            onAnnounce={quick.announce}
          />
        ) : selection.mode ? (
          // Selection mode with nothing chosen yet — the state a long press or the
          // header toggle produces. It says what to do next rather than showing an
          // empty toolbar of disabled buttons.
          <TaskSelectionPrompt
            loadedCount={visibleIds.length}
            selectableIds={bound.selectableIds}
            capped={bound.capped}
            onSelectAll={(ids) =>
              dispatchSelection({ type: "select_visible", visibleIds: ids })
            }
            onDone={clearSelection}
          />
        ) : undefined
      }
    >
      <TasksQuickAdd
        defaultParent={data.defaultCaptureParent}
        sessionDefaults={sessionDefaults}
        todayIso={data.todayIso}
        onOpenFullForm={() => openDrawer(NEW_TASK_KEY)}
      />

      {/* PWA-12 — the queued Task changes, and any decision waiting on the owner.
          It renders NOTHING when the queue is empty, which is the steady state,
          so an ordinary online Tasks page is byte-for-byte what it was. When a
          conflict does arise it appears where the owner already is, rather than
          in a settings screen they would have to be told to visit. */}
      <OfflineChangesPanel headingLevel={2} />

      {isGrouped ? (
        <>
          <GroupedView
            presentation={config.presentation}
            sections={groupedSections}
            renderCollection={renderCollection}
            viewAllHref={viewAllHref}
            dropDimension={dropDimension}
            onDropTask={handleTaskDrop}
          />
        </>
      ) : (
        renderCollection(cards, "Tasks", 2)
      )}

      {!data.failed && !isGrouped && hasMore ? (
        <LoadMore
          loading={loading}
          loadFailed={loadFailed}
          onLoadMore={loadMore}
          label="Load more tasks"
        />
      ) : null}

      {/* Every list-level mutation announces its outcome once, politely. */}
      <p className="dh-visually-hidden" role="status" aria-live="polite">
        {quick.announcement ?? ""}
      </p>
    </CollectionLayout>
  );
}

/**
 * One `TaskList`, plus the two things a list has to own rather than a row.
 *
 * **Departure** (DHDS-11, closing DEBT-177). A row that the owner's own act
 * removed collapses instead of vanishing, and focus is handed to the row that
 * takes its place. Both are list-level facts — a row cannot know that it is the
 * one that left, and it certainly cannot know who should have focus next — which
 * is why this is a component rather than a prop.
 *
 * **Dragging.** Rows become liftable only when the surface has drawn real
 * destinations for them (`dropDimension`). Everywhere else this renders exactly
 * the rows it rendered before DHDS-11.
 */
function TaskCollection({
  list,
  ariaLabel,
  headingLevel,
  density,
  departing,
  dropDimension,
  bucketKey,
  toRowProps,
}: {
  readonly list: readonly TaskCardData[];
  readonly ariaLabel: string;
  readonly headingLevel: 2 | 3;
  readonly density: TaskDensity;
  readonly departing: ReadonlySet<string>;
  readonly dropDimension: TaskDropDimension | null;
  readonly bucketKey?: string;
  readonly toRowProps: (
    card: TaskCardData,
    headingLevel: 2 | 3,
  ) => TaskRowProps;
}) {
  const listElement = useRef<HTMLUListElement | null>(null);
  const { rendered, isLeaving } = useDepartingRows(
    list,
    departing,
    listElement,
  );
  return (
    <TaskList
      ariaLabel={ariaLabel}
      density={density}
      listRef={(element) => {
        listElement.current = element;
      }}
    >
      {rendered.map((card) => {
        const leaving = isLeaving(card.id);
        const rowProps = toRowProps(card, headingLevel);
        /*
         * A LEAVING row is never draggable. It is on its way out of this
         * surface, it is `aria-hidden`, and offering a grip on an object that
         * is mid-departure would be offering to move something that has already
         * gone.
         */
        return dropDimension !== null && bucketKey !== undefined && !leaving ? (
          <DraggableTaskRow
            key={card.id}
            card={card}
            bucketKey={bucketKey}
            rowProps={rowProps}
          />
        ) : (
          <TaskRow key={card.id} {...rowProps} leaving={leaving} />
        );
      })}
    </TaskList>
  );
}

/* -------------------------------------------------------------------------- */
/* Grouped presentations                                                       */
/* -------------------------------------------------------------------------- */

type RenderCollection = (
  list: readonly TaskCardData[],
  ariaLabel: string,
  headingLevel: 2 | 3,
  /** DHDS-11 — the bucket these rows are in, for a grouped presentation. */
  bucketKey?: string,
) => ReactNode;

/**
 * One grouped bucket. Renders the AUTHORITATIVE server count in its heading, the
 * bounded slice the loader returned, and a "View all N" link when the bucket holds
 * more than the slice — pointing at the filtered flat list that isolates exactly
 * those records.
 */
function GroupedBucket({
  section,
  className,
  renderCollection,
  viewAllHref,
  dropDimension,
  onDropTask,
}: {
  readonly section: GroupedSection;
  readonly className: string;
  readonly renderCollection: RenderCollection;
  readonly viewAllHref: (section: GroupedSection) => string | null;
  /** DHDS-11 — null on every configuration that is not a spatial one. */
  readonly dropDimension: TaskDropDimension | null;
  readonly onDropTask: TaskBucketDrop;
}) {
  const href = section.hasMore ? viewAllHref(section) : null;
  const drop = useTaskBucketDrop(section, dropDimension, onDropTask);
  /*
   * DS-04 — the bucket is a heading, a count and a rule.
   *
   * It was a `<section>` wrapping a card, with the heading in the overdue
   * colour; the concept has no per-group container at all, and the row's own
   * date already says that a task has slipped. `TaskGroup` draws the heading and
   * the hairline; the class stays on the outer element because the three grouped
   * presentations (list, board, sectors) still differ only in their container
   * layout, and that difference is still CSS.
   */
  return (
    <TaskGroup
      title={section.title}
      count={section.count}
      headingLevel={2}
      moreHref={href}
      /*
       * FINAL-UI — the overdue bucket's heading is red, and the bucket KEY is
       * what says so rather than its title. The label is translated copy
       * ("Overdue", "Was due earlier" in the deliberately gentler grouping);
       * the key is the server's own bucket name and does not move.
       */
      tone={section.key === "overdue" ? "overdue" : "default"}
      className={className}
      sectionRef={drop.ref}
      dropState={
        drop.isActive ? "active" : drop.isCandidate ? "candidate" : null
      }
      dropHint="Move here"
    >
      {section.cards.length > 0 ? (
        renderCollection(
          section.cards,
          `${section.title} tasks`,
          3,
          section.key,
        )
      ) : (
        /*
         * DHDS-11 §51 — an EMPTY bucket is still a destination.
         *
         * The section element is what the drop is hit-tested against, so a
         * bucket with nothing in it accepts one exactly as a full one does, and
         * this line is a real region rather than a placeholder card invented to
         * give the drop something to land on. (For `parent` and `delegate` an
         * empty bucket is never rendered at all; for the closed dimensions it
         * can be, and this is why that costs nothing.)
         */
        <p className="dh-tasks-section__empty">Nothing here.</p>
      )}
    </TaskGroup>
  );
}

/**
 * The grouped presentations. Time Sectors and an ordinary grouped List/Board render
 * the SAME sections through the SAME bucket component; only the container layout
 * differs, and that difference is CSS. There is no per-view grouping logic and no
 * per-view query.
 */
function GroupedView({
  presentation,
  sections,
  renderCollection,
  viewAllHref,
  dropDimension,
  onDropTask,
}: {
  readonly presentation: string;
  readonly sections: readonly GroupedSection[];
  readonly renderCollection: RenderCollection;
  readonly viewAllHref: (section: GroupedSection) => string | null;
  readonly dropDimension: TaskDropDimension | null;
  readonly onDropTask: TaskBucketDrop;
}) {
  const containerClass =
    presentation === "sectors"
      ? "dh-tasks-sectors"
      : presentation === "board"
        ? "dh-tasks-board"
        : "dh-tasks-grouped";
  const bucketClass =
    presentation === "sectors"
      ? "dh-tasks-sectors__column"
      : presentation === "board"
        ? "dh-tasks-board__column"
        : "dh-tasks-grouped__section";

  return (
    <div className={containerClass}>
      {sections.map((section) => (
        <GroupedBucket
          key={section.key}
          section={section}
          className={bucketClass}
          renderCollection={renderCollection}
          viewAllHref={viewAllHref}
          dropDimension={dropDimension}
          onDropTask={onDropTask}
        />
      ))}
    </div>
  );
}
