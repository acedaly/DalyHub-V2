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
  useRevalidator,
  useSearchParams,
} from "react-router";

import { Card, CardCollection } from "~/shared/card";
import type {
  CardAction,
  CardMetaItem,
  CardProps,
  CardTone,
} from "~/shared/card";
import {
  CollectionControls,
  CollectionLayout,
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
import {
  InlineTaskDate,
  InlineTaskParent,
  InlineTaskPriority,
  RecurrenceChip,
  type TaskRowFieldSave,
} from "~/shared/task-record/TaskRowFields";
import { TaskQuickEditPanel } from "~/shared/task-record/TaskQuickEditPanel";
import { TaskRecordDrawer } from "~/shared/task-record/TaskRecordDrawer";
import type {
  TaskActionData,
  TaskRecurrenceOutcome,
} from "~/shared/task-record/contract";
import {
  postTaskBulkAction,
  postTaskRecordAction,
} from "~/shared/task-record/task-inline-edit";
import {
  formatCalendarDate,
  taskPriorityLabel,
  taskUrgency,
  timeSectorLabel,
  type SerializedTaskListItem,
  type TaskListItemPatch,
} from "~/shared/task-record/task-view";
import {
  MAX_PLAN_BATCH_SIZE,
  TASK_PRIORITIES,
  TIME_SECTORS,
} from "~/kernel/tasks";
import {
  TASK_PRESENTATIONS,
  taskViewFilterCount,
  type TaskViewConfig,
} from "~/kernel/task-views";

import { NewTaskForm } from "./NewTaskForm";
import { TasksQuickAdd } from "./TasksQuickAdd";
import { TasksViewSwitcher } from "./TasksViewSwitcher";
import { buildTasksControlGroups } from "./tasks-controls";
import type { TasksBulkResult, TasksPageData } from "./tasks-contract";
import { PRESENTATION_LABELS } from "./tasks-presentation";
import {
  EMPTY_TASK_SELECTION,
  boundBulkSelection,
  bulkFieldLabel,
  bulkSelectionOverBy,
  summariseBulkField,
  taskSelectionReducer,
  type TaskSelectionAction,
} from "./task-selection";
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
  toTaskCardData,
  type GroupedSection,
  type TaskCardData,
} from "./tasks-view-model";

/** The drawer key that opens the "New task" capture form. */
const NEW_TASK_KEY = "new-task";

/**
 * UIX-01 — a task row's leading COMPLETION control.
 *
 * The reference's list is a column of circles, and ticking one is the single
 * most frequent act on the page. Before this the row's leading control was the
 * bulk-SELECTION checkbox and completing meant finding a "Complete" button in
 * the trailing action group, revealed on hover — the frequent act behind the
 * rare one.
 *
 * It is a real `<input type="checkbox">` with its own accessible name, inside a
 * `label` that gives the 20px circle a 44px target (WCAG 2.2 §2.5.8), and it
 * writes through the SAME optimistic completion path every other surface uses
 * (`quick.setCompleted` → `POST /tasks/:id`, with the Undo the feedback layer
 * already attaches). Nothing about the completion contract changed; it acquired
 * a better-placed control.
 */
function TaskCompleteToggle({
  card,
  urgent,
  onToggle,
  disabled,
}: {
  readonly card: TaskCardData;
  /** Whether the task has slipped — the one state that colours the ring. */
  readonly urgent: boolean;
  readonly onToggle: (complete: boolean) => void;
  readonly disabled: boolean;
}) {
  return (
    <label className="dh-check-circle-target">
      <input
        type="checkbox"
        className="dh-check-circle"
        checked={card.completed}
        disabled={disabled}
        data-urgency={urgent && !card.completed ? "overdue" : undefined}
        aria-label={
          card.completed ? `Reopen ${card.title}` : `Complete ${card.title}`
        }
        onChange={(event) => onToggle(event.currentTarget.checked)}
        // The row's open link sits beside this; a click here must never open it.
        onClick={(event) => event.stopPropagation()}
      />
    </label>
  );
}

/**
 * UIX-01 — the display states a list row does NOT draw a status pill for.
 *
 * Both are restatements of what the row already shows: `planned` is "there is a
 * planned date" (and the row prints it), `inbox` is "there is not" (and the row
 * prints nothing, which is the same claim). Every other state — Completed,
 * Cancelled, Waiting, On hold, Someday / Maybe, In progress — appears nowhere
 * else on the row, so its pill stays.
 */
const ROUTINE_TASK_STATES: ReadonlySet<string> = new Set(["planned", "inbox"]);

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
  const layoutHref = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.delete("drawer");
    next.delete(TASKS_PARAMS.cursor);
    next.set(TASKS_PARAMS.presentation, value);
    return `/tasks?${next.toString()}`;
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
          title: "Task",
          description: "Task record",
          children: <TaskRecordDrawer taskId={id} />,
        };
      }
      // TASKS-04 — the row's quick edits (and its parent change) open the ONE shared
      // quick-edit panel in the ONE shared Drawer, rather than a bespoke popover per
      // field. Both keys carry the task id, so the state is URL-backed and Back works.
      if ((kind === "task-quick" || kind === "task-move") && id.length > 0) {
        const item = findLoadedTask(data, id);
        if (!item) return null;
        return {
          title: kind === "task-move" ? "Move task" : "Quick edit",
          description:
            kind === "task-move"
              ? "File this task under a Project or an Area, or leave it in Inbox."
              : "Dates, sector, commitment and repeat.",
          children: (
            <TaskQuickEditDrawerHost item={item} todayIso={data.todayIso} />
          ),
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

/**
 * The task a Drawer key refers to, from whichever payload the current presentation
 * loaded it into: the flat page, or a bucket of the server-grouped result. One
 * lookup, so a grouped Sectors row can open the same panel a list row does.
 */
function findLoadedTask(
  data: TasksPageData,
  id: string,
): SerializedTaskListItem | null {
  const flat = data.items.find((task) => task.id === id);
  if (flat) return flat;
  for (const group of data.grouping?.groups ?? []) {
    const found = group.items.find((task) => task.id === id);
    if (found) return found;
  }
  return null;
}

/**
 * Hosts the shared quick-edit panel in the Drawer. It revalidates the list after each
 * canonical mutation and announces the outcome through a live region, so the row the
 * user came from reflects the SERVER rather than an optimistic guess.
 */
function TaskQuickEditDrawerHost({
  item,
  todayIso,
}: {
  readonly item: SerializedTaskListItem;
  readonly todayIso: string;
}) {
  const revalidator = useRevalidator();
  const [announcement, setAnnouncement] = useState<string | null>(null);
  return (
    <>
      <TaskQuickEditPanel
        task={item}
        todayIso={todayIso}
        onChanged={(message) => {
          setAnnouncement(message);
          revalidator.revalidate();
        }}
      />
      <p className="dh-visually-hidden" role="status">
        {announcement ?? ""}
      </p>
    </>
  );
}

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
      void postTaskRecordAction(taskId, { intent })
        .then((result) => {
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
    [notifyUndo, refuse, revalidateFor],
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

  return {
    patches,
    setCompleted,
    setField,
    setRecord,
    reportInlineSave,
    announce,
    announcement,
  };
}

/**
 * TASKS-04 — the inline TITLE editor for one list row.
 *
 * It is rendered ONLY while the row is being renamed (the Card keeps its ordinary
 * open link the rest of the time), so inline editing never costs the user the way
 * into the record. Renaming posts to the canonical `POST /tasks/:taskId` route and
 * revalidates the list; a rejected save keeps the typed text, announces the reason
 * and returns focus to the field.
 */
function InlineTaskTitleEditor({
  taskId,
  title,
  onDone,
}: {
  readonly taskId: string;
  readonly title: string;
  readonly onDone: () => void;
}) {
  const fetcher = useFetcher<TaskActionData>();
  const revalidator = useRevalidator();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState(title);
  const [error, setError] = useState<string | null>(null);
  const processed = useRef<TaskActionData | null>(null);
  const saving = fetcher.state !== "idle";

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (processed.current === fetcher.data) return;
    processed.current = fetcher.data;
    const result = fetcher.data;
    if (result.kind !== "update") return;
    if (result.status === "success") {
      setError(null);
      revalidator.revalidate();
      onDone();
      return;
    }
    // The user's text is never discarded on a recoverable failure.
    setError(
      result.fieldErrors?.title ??
        result.formError ??
        "That title couldn’t be saved. Your text is safe — try again.",
    );
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [fetcher.state, fetcher.data, revalidator, onDone]);

  const save = useCallback(() => {
    const trimmed = draft.trim();
    if (saving) return;
    if (trimmed.length === 0) {
      setError("A title is required.");
      window.requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }
    if (trimmed === title) {
      onDone();
      return;
    }
    setError(null);
    const body = new FormData();
    body.set("intent", "rename");
    body.set("title", trimmed);
    fetcher.submit(body, { method: "post", action: `/tasks/${taskId}` });
  }, [draft, fetcher, onDone, saving, taskId, title]);

  return (
    <span className="dh-tasks-inline-title-editor">
      <input
        ref={inputRef}
        className="dh-input dh-tasks-inline-title-editor__input"
        value={draft}
        maxLength={512}
        disabled={saving}
        aria-label={`Rename ${title}`}
        aria-invalid={error ? true : undefined}
        onChange={(event) => {
          setDraft(event.target.value);
          if (error) setError(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            save();
          } else if (event.key === "Escape") {
            event.preventDefault();
            setError(null);
            onDone();
          }
        }}
        onBlur={() => {
          // A blur with an unresolved error would throw the text away; keep editing.
          if (!error) save();
        }}
      />
      {error ? (
        <span className="dh-tasks-inline-title-editor__error" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* The surface                                                                 */
/* -------------------------------------------------------------------------- */

function TasksWorkspaceInner({ data }: { readonly data: TasksPageData }) {
  const [searchParams] = useSearchParams();
  const { openDrawer } = useDrawer();
  const config = data.config;
  const quick = useTaskQuickMutation(config, data);
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
      }),
    [data.delegates, data.parents],
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
      return `/tasks?${next.toString()}`;
    },
    [searchParams],
  );

  const { items, hasMore, loading, loadFailed, loadMore } = useTaskPagination(
    data.items,
    data.nextCursor,
    resetKey,
    loadHref,
  );

  /*
   * The rows, with any in-flight change already applied (ADR-086).
   *
   * The patch is applied to the SERIALISED record, before `toTaskCardData`, so the
   * strike-through, the state pill, the tone and the urgency chip are all re-derived
   * by the same pure functions that read the server's own answer. There is no display
   * value an optimistic row can have and a reconciled one cannot.
   */
  const patchedItems = useMemo(
    () => applyTaskPatches(items, quick.patches),
    [items, quick.patches],
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
    () => applyTaskPatchesToGrouping(data.grouping, quick.patches),
    [data.grouping, quick.patches],
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
      return `/tasks?${next.toString()}`;
    },
    [searchParams],
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

  const toCardProps = useCallback(
    (card: TaskCardData, headingLevel: 2 | 3): CardProps => {
      // Priority ≠ urgency ≠ display-state as THREE separable slots (TASKS-02): the
      // display-state stays the status pill; priority and urgency render in the
      // metadata row — colour is reinforcement only, each carries its meaning in
      // words.
      //
      // TASKS-05 turns the first three of those slots into DS-16 inline fields. The
      // read state is exactly what the row showed before (a `PriorityIndicator`, a
      // formatted date, the parent's name); the edit state is the shared anchored menu
      // or date popover. Nothing new appears on the row — an untriaged task reads a
      // quiet "Priority" where it used to read nothing at all, and that quiet word is
      // the target. So "set P1, move it to a Project, give it tomorrow" happens on the
      // row, and the Drawer keeps the long tail.
      const metadata: CardMetaItem[] = [];
      const urgency = taskUrgency(
        {
          completedAt: card.completed ? "done" : null,
          dueDate: card.dueDate,
          scheduledDate: card.scheduledDate,
        },
        data.todayIso,
      );
      /*
       * M3X-02 — the row's THREE TIERS.
       *
       * The audit's H4 finding was a row carrying eight elements at near-equal
       * weight, with the one thing being scanned for — the title — quieter than
       * several of them. Nothing is removed here (every field stays inline-
       * editable, which is TASKS-05's whole point); what changes is that the run
       * now DECLARES its tiers and the stylesheet draws them:
       *
       *   `high`     the two signals a list is triaged by — priority and urgency.
       *              Ordered first, at the run's full weight.
       *   (default)  what qualifies the task — its due date and its parent.
       *   `low`      detail that is true but rarely the reason to act — the
       *              planned date, the sector, a delegate, a waiting subject.
       *              De-emphasised at every width, hidden at none.
       *
       * `data-priority` is the SAME mechanism MOBILE-01 introduced for narrow
       * cards; M3X-02 stopped it being a phone-only idea, because a 1,400px row
       * with eight equal facts is no easier to scan than a 358px one.
       */
      /*
       * UIX-01 — priority is `quiet` when there is none to show.
       *
       * The editor is unchanged and is still on every row, which is what
       * TASKS-05/TASKS-10 require: setting P1 is one click on the row. What
       * changed is that a row with NO priority no longer spends a scanning slot
       * on the words "No priority" — the tier below de-emphasises it and, on a
       * pointer device, holds it back until the row is hovered or something
       * inside it is focused. It is never hidden from the accessibility tree and
       * never hidden on touch, where there is no hover to reveal it (see
       * `card.css`). A row that HAS a priority always shows it.
       */
      metadata.push({
        id: "priority",
        priority: card.priority === null ? "quiet" : "high",
        value: (
          <InlineTaskPriority
            taskId={card.id}
            title={card.title}
            priority={card.priority}
            onSaved={quick.reportInlineSave}
            disabled={card.completed || viewingDeleted}
          />
        ),
      });
      /*
       * UIX-01 — the urgency CHIP is gone from the list row.
       *
       * It was kept for the three states a raw date could not express — Overdue,
       * Due today, Scheduled today — because the date field beside it printed
       * "7 Aug 2026" and a bare date cannot say it has passed. The date field
       * now says exactly that, in words: it reads "Yesterday", "Today",
       * "Tomorrow" or "Thu, 12 Jun" and takes the overdue colour when it has
       * slipped (see `TaskRowFields`). With the words on the date itself, the
       * chip beside it was the same fact twice, in a pill, on every row — and
       * two coloured pills per row is most of what made this list read as an
       * enterprise table rather than as the reference's.
       *
       * Nothing is conveyed by colour alone as a result: the word IS the state.
       * The chip survives unchanged everywhere it is genuinely the only signal
       * (the Task record, the drawer, search results).
       */
      if (card.recurrence) {
        metadata.push({
          id: "repeat",
          value: <RecurrenceChip recurrence={card.recurrence} />,
          priority: "low",
        });
      }
      /*
       * UIX-01 — the PLANNED date follows the same absence rule the sector has
       * followed since M3X-02: it is drawn when there IS one.
       *
       * "Not planned" was on most rows in the product, in italics, saying that a
       * dimension the owner had not used was not used — the exact placeholder
       * the absence rule exists to remove, and one of the two facts that made
       * every row two lines tall. Setting a planned date from the list did not
       * become unreachable with it: the row's overflow → "Priority, dates and
       * repeat…" opens the shared quick-edit panel, which is also the path a
       * phone (with no hover) has always used, and the Task record is a click
       * away. A row that HAS a planned date still edits it in place.
       */
      if (card.scheduledDate !== null && card.scheduledDate !== card.dueDate) {
        metadata.push({
          id: "planned",
          value: (
            <InlineTaskDate
              taskId={card.id}
              title={card.title}
              kind="scheduled"
              value={card.scheduledDate}
              todayIso={data.todayIso}
              onSaved={quick.reportInlineSave}
              disabled={card.completed || viewingDeleted}
            />
          ),
          priority: "low",
        });
      }
      // No metadata `label` on the inline fields: each one's own accessible name
      // already says which field it edits ("Due date: 12 Aug"), and its empty
      // state reads "No due date" / "Unassigned" — so a visible prefix would
      // state the field name twice on every row.
      //
      // The parent is the row's one CONTEXT fact — "which project is this?" is
      // the question asked immediately after "what is it?" — so it comes first
      // of the trailing pair. UIX-01 put the DUE date last and pinned it to the
      // row's trailing edge: a date column only reads as a column when every
      // date in it starts at the same x.
      metadata.push({
        id: "parent",
        // Same absence rule again: "Unassigned" on every Inbox row is a column
        // of italic text saying that a task has not been filed, which is what
        // the Inbox view is FOR. The editor stays, revealed on hover/focus and
        // always present on touch.
        priority: card.parent === null ? "quiet" : "high",
        value: (
          <InlineTaskParent
            taskId={card.id}
            title={card.title}
            parent={card.parent}
            options={data.parents}
            onSaved={quick.reportInlineSave}
            disabled={card.completed || viewingDeleted}
          />
        ),
      });
      metadata.push({
        id: "due",
        // The same rule the priority editor takes: a task with no due date is
        // usually IN a group called "No date", so the row saying "No due date"
        // as well is the heading restated once per row. The editor stays on
        // every row and appears on hover, on focus, and always on touch.
        priority: card.dueDate === null ? "quiet" : "high",
        value: (
          <InlineTaskDate
            taskId={card.id}
            title={card.title}
            kind="due"
            value={card.dueDate}
            todayIso={data.todayIso}
            onSaved={quick.reportInlineSave}
            disabled={card.completed || viewingDeleted}
          />
        ),
      });
      /*
       * The sector is drawn only when there IS one.
       *
       * "Sector: No sector" was on every untriaged row in the product — the
       * clearest case of the brief's absence rule: a placeholder occupying a
       * scanning slot to say that a dimension the owner has not used is not used.
       * The field stays editable where it is edited (the row's overflow →
       * "Priority, dates and repeat…", and the Task record), so nothing became
       * unreachable; it simply stopped being announced fifty times down a list.
       */
      if (card.sector !== null) {
        metadata.push({
          id: "sector",
          label: "Sector",
          value: card.sectorLabel,
          priority: "low",
        });
      }
      if (card.delegatedTo) {
        metadata.push({
          id: "delegated",
          label: "Delegated to",
          value: card.delegatedTo,
          priority: "low",
        });
      }
      if (card.waiting) {
        metadata.push({
          id: "waiting",
          label: "Waiting",
          value: "Blocked on someone else",
          priority: "low",
        });
      }

      // The two things a user does most from a list, as visible, labelled 44px
      // buttons. The swipe tray below reveals the SAME actions, so nothing is
      // gesture-only and a non-touch device behaves identically.
      //
      // TASKS-09 removed the `disabled` these carried while ANY row mutation was in
      // flight. It existed because one shared fetcher meant a second submission
      // superseded the first; each write is now its own request, so completing three
      // rows in three seconds is three writes and three answers rather than two
      // refusals and a stall.
      const completeAction = {
        id: "complete",
        label: card.completed ? "Reopen" : "Complete",
        ariaLabel: card.completed
          ? `Reopen ${card.title}`
          : `Complete ${card.title}`,
        onSelect: () =>
          quick.setCompleted(card.id, !card.completed, card.title),
      };
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
      const quickActions: CardAction[] = [];
      const swipeActions = viewingDeleted
        ? []
        : [completeAction, planTodayAction].filter((action) => action !== null);

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
      const overflowActions = viewingDeleted
        ? [
            {
              id: "open-record",
              label: "Open task record",
              description: "Read-only until it is restored.",
              onSelect: () => openDrawer(`task:${card.id}`),
            },
          ]
        : card.completed
          ? [
              {
                id: "reopen-record",
                label: "Open task record",
                onSelect: () => openDrawer(`task:${card.id}`),
              },
            ]
          : [
              ...(planTodayAction
                ? [
                    {
                      id: "plan-today",
                      label: "Plan for today",
                      // No `ariaLabel` naming the task: the MENU is already
                      // "More actions for <title>", so repeating it on the item
                      // makes a screen reader say the title twice and makes the
                      // item's name unmatchable by the words on it.
                      onSelect: planTodayAction.onSelect,
                    },
                  ]
                : []),
              {
                id: "rename",
                label: "Rename",
                onSelect: () => setEditingTitleId(card.id),
              },
              {
                id: "move-to",
                label: "Move to Project or Area…",
                description: "Search the whole workspace.",
                onSelect: () => openDrawer(`task-move:${card.id}`),
              },
              {
                id: "someday",
                label: "Move to Someday / Maybe",
                separatorBefore: true,
                onSelect: () =>
                  quick.setField(
                    card.id,
                    { intent: "set_commitment", commitment: "someday" },
                    `${card.title} moved to Someday / Maybe.`,
                    { commitmentState: "someday" },
                  ),
              },
              // TASKS-07 — the two series operations that belong on a row. Skipping is
              // NOT completing: the occurrence moves one step along the series and the
              // history says it was skipped. Stopping keeps every past occurrence and
              // only ends the future.
              ...(card.recurrence
                ? [
                    {
                      id: "skip-occurrence",
                      label: "Skip this occurrence",
                      description:
                        "Moves to the next date without completing it.",
                      separatorBefore: true,
                      onSelect: () =>
                        quick.setRecord(
                          card.id,
                          { intent: "skip_occurrence" },
                          `Skipped this occurrence of ${card.title}.`,
                        ),
                    },
                    {
                      id: "stop-repeat",
                      label: "Stop repeating",
                      description: "Past occurrences are kept.",
                      onSelect: () =>
                        quick.setRecord(
                          card.id,
                          { intent: "set_recurrence" },
                          `${card.title} no longer repeats.`,
                        ),
                    },
                  ]
                : []),
              {
                id: "quick-edit",
                label: "Priority, dates and repeat…",
                separatorBefore: true,
                onSelect: () => openDrawer(`task-quick:${card.id}`),
              },
              {
                id: "open-record",
                label: "Open task record",
                description: "For delegation, waiting and removal.",
                onSelect: () => openDrawer(`task:${card.id}`),
              },
            ];

      const key = `task:${card.id}`;
      return {
        id: card.id,
        title: card.title,
        // The editor replaces the title ONLY while this row is being renamed; every
        // other row keeps the ordinary open link (TASKS-04).
        titleEditor:
          editingTitleId === card.id ? (
            <InlineTaskTitleEditor
              taskId={card.id}
              title={card.title}
              onDone={() => setEditingTitleId(null)}
            />
          ) : undefined,
        typeLabel: "Task",
        /*
         * UIX-01 — no leading entity glyph on a task row.
         *
         * A small green check before every title, on a page called Tasks, in a
         * list of nothing but tasks, said only "this is a task" — and it sat
         * directly beside the completion circle, which is a check-shaped
         * control that means something. Two checks per row, one of them inert.
         * `typeLabel` stays, so a screen reader still hears "Task".
         */
        headingLevel,
        // The row's own signal that the work is done, alongside the status pill and
        // the action that now reads "Reopen". Under an in-flight completion it is
        // drawn from the optimistic patch, which is what makes the checkbox feel
        // instant (ADR-086) — the pill and the action come from the same patched
        // record, so the three can never disagree.
        completed: card.completed,
        leadingControl: viewingDeleted ? undefined : (
          <TaskCompleteToggle
            card={card}
            urgent={urgency?.kind === "overdue"}
            disabled={viewingDeleted}
            onToggle={(complete) =>
              quick.setCompleted(card.id, complete, card.title)
            }
          />
        ),
        /*
         * UIX-01 — the status pill is drawn only when it says something.
         *
         * Every row carried one, and on an ordinary open task it read "Planned"
         * or "Unscheduled" — which is the presence or absence of the planned
         * date sitting a few pixels along, restated as a chip, on every row in
         * the list. The five states that are NOT derivable from the rest of the
         * row (Completed, Cancelled, Waiting, On hold, Someday / Maybe, In
         * progress) still paint, because for those the pill genuinely is the
         * only place the fact appears.
         */
        status: ROUTINE_TASK_STATES.has(card.stateKind)
          ? undefined
          : { label: card.stateLabel, tone: card.stateTone as CardTone },
        metadata,
        density,
        presentation: "list",
        href: `?${withDrawerPushed(searchParams, key).toString()}`,
        onOpen: () => openDrawer(key),
        openAriaLabel: `Open ${card.title}`,
        quickActions,
        overflowActions,
        swipeActions,
        // TASKS-08 — a touch HOLD enters selection mode and selects the held row, so
        // multi-select on a phone costs one gesture. It is an accelerator: the checkbox
        // below and the "Select tasks" toggle in the header are the ordinary,
        // keyboard-and-screen-reader path, and the hold is inert on a non-touch device.
        onLongPress: () => dispatchSelection({ type: "enter", id: card.id }),
        /*
         * UIX-01 — the bulk-SELECTION checkbox appears in selection MODE.
         *
         * A row now leads with its completion circle, and two leading controls
         * on every row — one that finishes the task and one that adds it to a
         * batch — is both the busiest thing on the page and a genuine
         * mis-click risk. Selection is a mode the owner enters deliberately, and
         * it has three entry points, none of which was ever the checkbox
         * itself: "Select tasks" in the header menu (labelled, focusable,
         * keyboard-reachable — TASKS-06/08's documented ordinary path), a touch
         * long-press on a row, and Shift-click to extend once a mode is open.
         * Inside the mode every row shows its checkbox exactly as before, with
         * the same range behaviour and the same 100-row bound.
         */
        selection: !selectionVisible
          ? undefined
          : {
              selected: selected.has(card.id),
              // Shift extends a RANGE from the last row toggled, in the order the
              // rows are on screen — which is why the visible order is passed
              // rather than inferred.
              onSelectedChange: (on, modifiers) =>
                dispatchSelection({
                  type: "toggle",
                  id: card.id,
                  selected: on,
                  shift: modifiers?.shift,
                  visibleIds: visibleIdsRef.current,
                }),
              label: `Select ${card.title}`,
            },
      };
    },
    [
      data.todayIso,
      data.parents,
      searchParams,
      openDrawer,
      selected,
      selectionVisible,
      quick,
      density,
      editingTitleId,
      viewingDeleted,
    ],
  );

  const renderCollection = useCallback(
    (list: readonly TaskCardData[], ariaLabel: string, headingLevel: 2 | 3) => (
      <CardCollection
        items={list}
        getItemId={(card) => card.id}
        ariaLabel={ariaLabel}
        presentation="list"
        density={density}
        renderCard={(card) => <Card {...toCardProps(card, headingLevel)} />}
      />
    ),
    [toCardProps, density],
  );

  const count = isGrouped ? groupedTotal : items.length;
  const filterCount = taskViewFilterCount(config);
  const subtitle = data.failed
    ? "We couldn’t load your tasks."
    : isGrouped
      ? count === 1
        ? "1 task"
        : `${count} tasks`
      : hasMore
        ? `${count} tasks loaded`
        : count === 1
          ? "1 task"
          : `${count} tasks`;

  const isReloading = useCollectionLoading();
  const currentQuery = useMemo(() => {
    const next = new URLSearchParams(searchParams);
    next.delete("drawer");
    next.delete(TASKS_PARAMS.cursor);
    return next.toString();
  }, [searchParams]);
  const shareUrl =
    typeof window === "undefined"
      ? `/tasks?${currentQuery}`
      : `${window.location.origin}/tasks${currentQuery.length > 0 ? `?${currentQuery}` : ""}`;

  // Classification carried for the session by the quick-add row: a task added while
  // looking at a filtered view lands in that view rather than somewhere the user
  // then has to go and find.
  const sessionDefaults = useMemo(() => {
    const defaults: {
      priority?: string;
      timeSector?: string;
      scheduledDate?: string;
    } = {};
    const priority = config.filters.priority;
    if (priority && priority !== "__none") defaults.priority = priority;
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
      className="dh-collection--tasks"
      isLoading={isReloading}
      title="Tasks"
      subtitle={subtitle}
      entityType="task"
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
          basePath="/tasks"
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
          <BulkActionBar
            cards={selectedCards}
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
          <div
            className="dh-tasks-bulk dh-tasks-bulk--empty"
            role="group"
            aria-label="Select tasks"
          >
            <p className="dh-tasks-bulk__count">
              Choose tasks to act on them together.
            </p>
            {/* DEBT-110 — the bound is stated BEFORE the action, not discovered as a
                refusal after it. It is only reachable by loading more than one page,
                so it is said only when it actually applies. */}
            {bound.capped ? (
              <p className="dh-tasks-bulk__status">
                {visibleIds.length} tasks are loaded. Bulk actions work on up to{" "}
                {MAX_PLAN_BATCH_SIZE} at a time, so “Select all” takes the first{" "}
                {MAX_PLAN_BATCH_SIZE}.
              </p>
            ) : null}
            <div className="dh-tasks-bulk__actions">
              <button
                type="button"
                className="dh-btn dh-btn--secondary"
                disabled={visibleIds.length === 0}
                onClick={() =>
                  dispatchSelection({
                    type: "select_visible",
                    visibleIds: bound.selectableIds,
                  })
                }
              >
                Select all {bound.selectableIds.length}
              </button>
              <button
                type="button"
                className="dh-btn dh-btn--ghost"
                onClick={clearSelection}
              >
                Done
              </button>
            </div>
          </div>
        ) : undefined
      }
    >
      <TasksQuickAdd
        defaultParent={data.defaultCaptureParent}
        sessionDefaults={sessionDefaults}
        todayIso={data.todayIso}
        onOpenFullForm={() => openDrawer(NEW_TASK_KEY)}
      />

      {isGrouped ? (
        <GroupedView
          presentation={config.presentation}
          sections={groupedSections}
          renderCollection={renderCollection}
          viewAllHref={viewAllHref}
        />
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

/* -------------------------------------------------------------------------- */
/* Grouped presentations                                                       */
/* -------------------------------------------------------------------------- */

type RenderCollection = (
  list: readonly TaskCardData[],
  ariaLabel: string,
  headingLevel: 2 | 3,
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
}: {
  readonly section: GroupedSection;
  readonly className: string;
  readonly renderCollection: RenderCollection;
  readonly viewAllHref: (section: GroupedSection) => string | null;
}) {
  const href = section.hasMore ? viewAllHref(section) : null;
  // The region is named by the bucket ALONE: its heading already carries the
  // authoritative count, and repeating it in the landmark name would make a screen
  // reader announce the number twice.
  return (
    <section className={className} aria-label={section.title}>
      {/* "OVERDUE 2" — the count as a quiet second figure, not "(2)". Brackets
          around a number read as a debugger printing a length; the reference
          sets it as a small-caps figure a space away, and the stylesheet gives
          it the space and the weight. */}
      <h2 className="dh-tasks-section__label">
        {section.title}
        {/* An explicit space: without it the heading's accessible name is
            "Overdue2", because the gap to the count is CSS margin and a screen
            reader cannot see margin. */}{" "}
        <span className="dh-tasks-section__count">{section.count}</span>
      </h2>
      {section.cards.length > 0 ? (
        renderCollection(section.cards, `${section.title} tasks`, 3)
      ) : (
        <p className="dh-tasks-section__empty">Nothing here.</p>
      )}
      {href ? (
        <Link className="dh-tasks-section__more" to={href} preventScrollReset>
          View all {section.count} in {section.title}
        </Link>
      ) : null}
    </section>
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
}: {
  readonly presentation: string;
  readonly sections: readonly GroupedSection[];
  readonly renderCollection: RenderCollection;
  readonly viewAllHref: (section: GroupedSection) => string | null;
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
        />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Bulk action bar (TASKS-06)                                                  */
/* -------------------------------------------------------------------------- */

const BULK_PRIORITY_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  ...TASK_PRIORITIES.map((priority) => ({
    value: priority,
    label: taskPriorityLabel(priority),
  })),
  { value: "__none", label: "No priority" },
];

const BULK_SECTOR_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "__none", label: "No sector" },
  ...TIME_SECTORS.map((sector) => ({
    value: sector,
    label: timeSectorLabel(sector),
  })),
];

const BULK_STATUS_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "on_hold", label: "On hold" },
  { value: "cancelled", label: "Cancelled" },
];

/**
 * The contextual bulk surface.
 *
 * Four decisions shape it, and each answers a specific way a bulk toolbar goes wrong:
 *
 *   1. **It states the MIXED state rather than inventing a current value.** With P1s,
 *      P2s and untriaged tasks selected, Priority reads "Mixed" — choosing P2 then
 *      sets all of them to P2, which is what the owner asked for. Pretending the
 *      selection has one value is how a bulk control silently overwrites work the owner
 *      could not see (brief §17).
 *   2. **The common six are visible; the rest are behind More.** On a phone the row
 *      collapses to Complete · Date · Priority · Move · More, which is the M3 bottom
 *      action-bar shape the shell already uses — not a new overlay primitive.
 *   3. **Delete is REVERSIBLE and says so.** "Delete 18 tasks?" explains that they move
 *      to the Deleted view and can be restored, and names where from. Permanent
 *      destruction is not reachable from here at all (brief §15).
 *   4. **Every action is ONE request.** Each posts the whole id list to `/tasks/bulk`,
 *      which resolves and validates every id before a single write and then runs one
 *      atomic batch. There is no client loop anywhere in this component.
 */
/**
 * The past-tense verb each bulk intent reports in the live region. Only the four
 * LIFECYCLE intents get their own word — those are the ones where "updated" would
 * be actively misleading. Every field mutation (priority, dates, parent, status,
 * commitment) genuinely is an update and shares the default.
 */
const BULK_INTENT_VERBS: Readonly<Record<string, string>> = {
  delete: "deleted",
  restore: "restored",
  complete: "completed",
  reopen: "reopened",
};

function BulkActionBar({
  cards,
  ids,
  todayIso,
  parents,
  viewingDeleted,
  onCleared,
  onAnnounce,
}: {
  readonly cards: readonly TaskCardData[];
  readonly ids: readonly string[];
  readonly todayIso: string;
  readonly parents: TasksPageData["parents"];
  /** True on the Deleted view, where Restore replaces the destructive actions. */
  readonly viewingDeleted: boolean;
  readonly onCleared: () => void;
  /**
   * Announce a COMMITTED outcome through the workspace's own live region, and
   * re-read the list.
   *
   * It cannot be announced from inside this bar. A successful bulk action clears the
   * selection, which unmounts the bar in the same commit — so a message written to a
   * live region that lives in here is destroyed before any assistive technology can
   * read it, and the one confirmation a screen-reader user gets for an action on
   * eighteen records is silence. The workspace's region outlives the selection, so
   * that is where a committed outcome belongs. A REFUSAL still speaks from in here,
   * because a refusal keeps the selection and the bar stays mounted beside it.
   */
  readonly onAnnounce: (message: string) => void;
}) {
  const fetcher = useFetcher<TasksBulkResult>();
  const [status, setStatus] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const processed = useRef<TasksBulkResult | null>(null);
  /*
   * The verb the LAST submitted intent deserves.
   *
   * "18 tasks updated" is true of a priority change and misleading of a deletion —
   * the one bulk action whose outcome the owner most needs stated back to them is
   * the one a generic verb describes worst. The live region is the only confirmation
   * a screen-reader user gets, so it names what happened.
   */
  const lastVerb = useRef<string>("updated");

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    const result = fetcher.data;
    if (processed.current === result) return;
    processed.current = result;
    if (result.ok) {
      setConfirmDelete(false);
      setShowMore(false);
      // Announces AND revalidates, through the same channel every row mutation uses.
      onAnnounce(
        `${result.changed} ${result.changed === 1 ? "task" : "tasks"} ${lastVerb.current}, ${result.unchanged} unchanged.`,
      );
      onCleared();
    } else {
      // A refusal keeps the selection: the owner's intent survives so they can fix the
      // cause and retry, rather than having to re-select fourteen rows.
      setStatus(result.formError);
      setConfirmDelete(false);
    }
  }, [fetcher.state, fetcher.data, onAnnounce, onCleared]);

  const busy = fetcher.state !== "idle";

  const run = useCallback(
    (fields: Record<string, string>) => {
      lastVerb.current = BULK_INTENT_VERBS[fields.intent ?? ""] ?? "updated";
      const body = new FormData();
      for (const id of ids) body.append("id", id);
      for (const [key, value] of Object.entries(fields)) body.set(key, value);
      fetcher.submit(body, { method: "post", action: "/tasks/bulk" });
    },
    [fetcher, ids],
  );

  // Mixed-value summaries over the SELECTED rows, so each control can state what the
  // selection currently holds before it is changed.
  const prioritySummary = useMemo(
    () => summariseBulkField(cards, (card) => card.priority),
    [cards],
  );
  const dueSummary = useMemo(
    () => summariseBulkField(cards, (card) => card.dueDate),
    [cards],
  );
  const parentSummary = useMemo(
    () => summariseBulkField(cards, (card) => card.parent?.id ?? null),
    [cards],
  );
  const anyCompleted = cards.some((card) => card.completed);
  const anyOpen = cards.some((card) => !card.completed);

  const count = ids.length;
  const noun = count === 1 ? "task" : "tasks";

  /*
   * DEBT-110 — a selection the server's bound cannot accept says so INSTEAD of
   * offering actions that are all guaranteed to be refused.
   *
   * Only a Shift-range across more than one loaded page can build one: "Select all" is
   * capped at the bound. Offering a toolbar here would be offering eleven controls
   * that each end in the same typed validation error, which is exactly the
   * correct-but-unexplained refusal this entry was raised about.
   */
  const overBy = bulkSelectionOverBy(count);
  if (overBy > 0) {
    return (
      <div
        className="dh-tasks-bulk dh-tasks-bulk--empty"
        role="group"
        aria-label="Bulk task actions"
      >
        <p className="dh-tasks-bulk__count" aria-live="polite">
          {count} selected
        </p>
        <p className="dh-tasks-bulk__status">
          Bulk actions work on up to {MAX_PLAN_BATCH_SIZE} tasks at a time, so
          one change stays fast and atomic. Deselect {overBy} to continue.
        </p>
        <div className="dh-tasks-bulk__actions">
          <button
            type="button"
            className="dh-btn dh-btn--secondary"
            onClick={onCleared}
          >
            Clear selection
          </button>
        </div>
      </div>
    );
  }

  if (confirmDelete) {
    return (
      <div
        className="dh-tasks-bulk dh-tasks-bulk--confirm"
        role="group"
        aria-label="Confirm bulk delete"
      >
        <p className="dh-tasks-bulk__confirm-title">
          Delete {count} {noun}?
        </p>
        <p className="dh-tasks-bulk__confirm-body">
          They move to the <strong>Deleted</strong> view, keeping their dates,
          links and history, and can be restored from there. Nothing is
          permanently destroyed.
        </p>
        <div className="dh-tasks-bulk__actions">
          <button
            type="button"
            className="dh-btn dh-btn--danger"
            disabled={busy}
            onClick={() => run({ intent: "delete" })}
          >
            Delete {count} {noun}
          </button>
          <button
            type="button"
            className="dh-btn dh-btn--secondary"
            disabled={busy}
            onClick={() => setConfirmDelete(false)}
          >
            Keep them
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dh-tasks-bulk" role="group" aria-label="Bulk task actions">
      <p className="dh-tasks-bulk__count" aria-live="polite">
        {count} selected
      </p>
      <div className="dh-tasks-bulk__actions">
        {viewingDeleted ? (
          <button
            type="button"
            className="dh-btn dh-btn--primary"
            disabled={busy}
            onClick={() => run({ intent: "restore" })}
          >
            Restore
          </button>
        ) : (
          <>
            {anyOpen ? (
              <button
                type="button"
                className="dh-btn dh-btn--secondary"
                disabled={busy}
                onClick={() => run({ intent: "complete" })}
              >
                Complete
              </button>
            ) : null}
            {/* Reopen is offered ONLY when the selection actually contains completed
                work — a control that cannot apply to anything selected is worse than
                a missing one (brief §14). */}
            {anyCompleted ? (
              <button
                type="button"
                className="dh-btn dh-btn--secondary"
                disabled={busy}
                onClick={() => run({ intent: "reopen" })}
              >
                Reopen
              </button>
            ) : null}

            <BulkMenu
              label="Date"
              current={bulkFieldLabel(
                dueSummary,
                (iso) => formatCalendarDate(iso) ?? iso,
                "No due date",
              )}
              disabled={busy}
              options={[
                { value: `due:${todayIso}`, label: "Due today" },
                {
                  value: `due:${shiftIso(todayIso, 1)}`,
                  label: "Due tomorrow",
                },
                {
                  value: `due:${shiftIso(todayIso, 7)}`,
                  label: "Due in a week",
                },
                { value: "due:", label: "Clear due date" },
                { value: `plan:${todayIso}`, label: "Plan for today" },
                {
                  value: `plan:${shiftIso(todayIso, 1)}`,
                  label: "Plan for tomorrow",
                },
                { value: "plan:", label: "Clear planned date" },
              ]}
              onChoose={(value) => {
                const [kind, date] = splitOnce(value, ":");
                if (kind === "due") {
                  run({ intent: "set_due", dueDate: date });
                } else if (date.length === 0) {
                  run({ intent: "clear_plan" });
                } else {
                  run({ intent: "plan", scheduledDate: date });
                }
              }}
            />

            <BulkMenu
              label="Priority"
              current={bulkFieldLabel(
                prioritySummary,
                taskPriorityLabel,
                "No priority",
              )}
              disabled={busy}
              options={BULK_PRIORITY_OPTIONS}
              onChoose={(value) =>
                run({
                  intent: "set_priority",
                  priority: value === "__none" ? "" : value,
                })
              }
            />

            <BulkMenu
              label="Move"
              current={bulkFieldLabel(
                parentSummary,
                (id) =>
                  parents.find((parent) => parent.id === id)?.title ??
                  "A Project or Area",
                "Inbox",
              )}
              disabled={busy}
              options={[
                { value: "__inbox", label: "Move to Inbox" },
                ...parents.map((parent) => ({
                  value: `${parent.kind}:${parent.id}`,
                  label: parent.title,
                })),
              ]}
              onChoose={(value) => {
                if (value === "__inbox") {
                  run({ intent: "set_parent", parentId: "", parentKind: "" });
                  return;
                }
                const [kind, id] = splitOnce(value, ":");
                run({ intent: "set_parent", parentId: id, parentKind: kind });
              }}
            />

            <button
              type="button"
              className="dh-btn dh-btn--secondary"
              aria-expanded={showMore}
              disabled={busy}
              onClick={() => setShowMore((open) => !open)}
            >
              More
            </button>

            {showMore ? (
              <>
                <BulkMenu
                  label="Status"
                  current="Set for all"
                  disabled={busy}
                  options={BULK_STATUS_OPTIONS}
                  onChoose={(value) =>
                    run({ intent: "set_status", status: value })
                  }
                />
                <BulkMenu
                  label="Sector"
                  current="Set for all"
                  disabled={busy}
                  options={BULK_SECTOR_OPTIONS}
                  onChoose={(value) =>
                    run({
                      intent: "set_sector",
                      sector: value === "__none" ? "" : value,
                    })
                  }
                />
                <button
                  type="button"
                  className="dh-btn dh-btn--secondary"
                  disabled={busy}
                  onClick={() =>
                    run({ intent: "set_commitment", commitment: "someday" })
                  }
                >
                  Someday / Maybe
                </button>
                <button
                  type="button"
                  className="dh-btn dh-btn--secondary"
                  disabled={busy}
                  onClick={() =>
                    run({ intent: "set_commitment", commitment: "active" })
                  }
                >
                  Make active
                </button>
                <button
                  type="button"
                  className="dh-btn dh-btn--danger-quiet"
                  disabled={busy}
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete…
                </button>
              </>
            ) : null}
          </>
        )}

        <button
          type="button"
          className="dh-btn dh-btn--ghost"
          disabled={busy}
          onClick={onCleared}
        >
          Done
        </button>
      </div>
      {status ? (
        <p className="dh-tasks-bulk__status" role="status">
          {status}
        </p>
      ) : null}
    </div>
  );
}

/**
 * One bulk field control: a labelled `<select>` whose current OPTION states what the
 * selection holds ("Mixed", "P2 · High", "No due date") and whose real options apply a
 * value to every selected task.
 *
 * A native select rather than a bespoke popover: it is one tab stop, it is announced
 * correctly, it opens as the platform picker on a phone, and the shared anchored-menu
 * primitive is built for a SINGLE record's current value — which is precisely what a
 * mixed selection does not have. The first option is a disabled summary, so the control
 * never claims a value the selection does not share.
 */
function BulkMenu({
  label,
  current,
  options,
  disabled,
  onChoose,
}: {
  readonly label: string;
  readonly current: string;
  readonly options: ReadonlyArray<{ value: string; label: string }>;
  readonly disabled?: boolean;
  readonly onChoose: (value: string) => void;
}) {
  return (
    <label className="dh-tasks-bulk__select">
      <span className="dh-tasks-bulk__select-label">{label}</span>
      <select
        className="dh-input"
        value=""
        disabled={disabled}
        onChange={(event) => {
          const value = event.target.value;
          if (value.length === 0) return;
          onChoose(value);
        }}
      >
        <option value="">{`${label}: ${current}`}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Shift a calendar date by whole days, on the OWNER's calendar day (ADR-022) rather
 * than the browser's clock. Pure string arithmetic through `Date.UTC`, so no timezone
 * can move the result.
 */
function shiftIso(iso: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const base = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  return new Date(base + days * 86_400_000).toISOString().slice(0, 10);
}

/** Split on the FIRST separator only, so an id containing one survives intact. */
function splitOnce(value: string, separator: string): [string, string] {
  const index = value.indexOf(separator);
  return index === -1
    ? [value, ""]
    : [value.slice(0, index), value.slice(index + separator.length)];
}
