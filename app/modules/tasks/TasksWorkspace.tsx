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
import type { CardMetaItem, CardProps, CardTone } from "~/shared/card";
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
import { helpTopicHref } from "~/shared/help";
import { EntityIcon } from "~/shared/entity";
import { LoadMore } from "~/shared/load-more";
import { ViewSwitcher } from "~/shared/view-switcher";
import {
  InlineTaskDate,
  InlineTaskParent,
  InlineTaskPriority,
  RecurrenceChip,
} from "~/shared/task-record/TaskRowFields";
import { TaskQuickEditPanel } from "~/shared/task-record/TaskQuickEditPanel";
import { TaskRecordDrawer } from "~/shared/task-record/TaskRecordDrawer";
import type {
  TaskActionData,
  TaskRecurrenceOutcome,
} from "~/shared/task-record/contract";
import { UrgencyChip } from "~/shared/task-record/UrgencyChip";
import {
  formatCalendarDate,
  taskPriorityLabel,
  taskUrgency,
  timeSectorLabel,
  type SerializedTaskListItem,
} from "~/shared/task-record/task-view";
import { TASK_PRIORITIES, TIME_SECTORS } from "~/kernel/tasks";
import { TASK_PRESENTATIONS, taskViewFilterCount } from "~/kernel/task-views";

import { NewTaskForm } from "./NewTaskForm";
import { TasksQuickAdd } from "./TasksQuickAdd";
import { TasksViewSwitcher } from "./TasksViewSwitcher";
import { buildTasksControlGroups } from "./tasks-controls";
import type { TasksBulkResult, TasksPageData } from "./tasks-contract";
import { PRESENTATION_LABELS } from "./tasks-presentation";
import {
  EMPTY_TASK_SELECTION,
  bulkFieldLabel,
  summariseBulkField,
  taskSelectionReducer,
} from "./task-selection";
import { TASKS_PARAMS, paramsFromConfig } from "./tasks-url-state";
import {
  resolveGroupedSections,
  toTaskCardData,
  type GroupedSection,
  type TaskCardData,
} from "./tasks-view-model";

/** The drawer key that opens the "New task" capture form. */
const NEW_TASK_KEY = "new-task";

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
 * the SAME `/tasks` loader through a fetcher with the next `cursor`, and the rows
 * are appended. A configuration change (the `resetKey`) or a loader re-run (a new
 * first page) RESETS the accumulation. Duplicate ids are collapsed defensively.
 */
function useTaskPagination(
  firstPage: readonly SerializedTaskListItem[],
  initialCursor: string | null,
  resetKey: string,
  loadHref: (cursor: string) => string,
) {
  const fetcher = useFetcher<TasksPageData>();
  const [appended, setAppended] = useState<SerializedTaskListItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loadFailed, setLoadFailed] = useState(false);
  const processed = useRef<TasksPageData | null>(null);

  useEffect(() => {
    setAppended([]);
    setCursor(initialCursor);
    setLoadFailed(false);
    processed.current = null;
  }, [firstPage, initialCursor, resetKey]);

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) {
      return;
    }
    const page = fetcher.data;
    if (processed.current === page) {
      return;
    }
    processed.current = page;
    if (page.failed || !Array.isArray(page.items)) {
      setLoadFailed(true);
      return;
    }
    setAppended((prev) => [...prev, ...page.items]);
    setCursor(page.nextCursor);
    setLoadFailed(false);
  }, [fetcher.state, fetcher.data]);

  const loadMore = useCallback(() => {
    if (cursor === null) {
      return;
    }
    setLoadFailed(false);
    fetcher.load(loadHref(cursor));
  }, [cursor, fetcher, loadHref]);

  const items = useMemo(() => {
    const seen = new Set<string>();
    const out: SerializedTaskListItem[] = [];
    for (const item of [...firstPage, ...appended]) {
      if (seen.has(item.id)) {
        continue;
      }
      seen.add(item.id);
      out.push(item);
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

/**
 * List-level quick edits, through the CANONICAL routes.
 *
 * Completion posts `intent=complete`/`reopen` to `POST /tasks/:taskId` — the same
 * atomic task-domain operation the Task Drawer's Complete button uses (ADR-029), so
 * completing from a list and completing from the record are ONE execution path with
 * ONE Activity trail. Every field change goes through the trusted `/tasks/bulk`
 * mutation with a single id — again the same authority the bulk bar uses.
 *
 * The loader is revalidated after each change so a row reflects the server (a
 * completed task leaving an active view, a re-sorted list) rather than an optimistic
 * guess that could disagree with it. Every outcome is announced.
 */
function useTaskQuickMutation() {
  const fetcher = useFetcher();
  const revalidator = useRevalidator();
  const settled = useRef<unknown>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const pendingLabel = useRef<string | null>(null);

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) {
      return;
    }
    if (settled.current === fetcher.data) {
      return;
    }
    settled.current = fetcher.data;
    const result = fetcher.data as {
      readonly ok?: boolean;
      readonly formError?: string;
      readonly recurrence?: TaskRecurrenceOutcome;
    };
    if (result.ok === false) {
      setAnnouncement(
        result.formError ??
          "That change couldn’t be saved. Nothing was changed.",
      );
    } else if (pendingLabel.current) {
      // TASKS-04: completing or undoing a REPEATING task has a second consequence,
      // and the surface says so rather than leaving a new (or surviving) occurrence
      // unexplained.
      setAnnouncement(
        `${pendingLabel.current}${recurrenceNote(result.recurrence)}`,
      );
    }
    pendingLabel.current = null;
    revalidator.revalidate();
  }, [fetcher.state, fetcher.data, revalidator]);

  const setCompleted = useCallback(
    (taskId: string, completed: boolean, title: string) => {
      pendingLabel.current = completed
        ? `Completed ${title}.`
        : `Reopened ${title}.`;
      const body = new FormData();
      body.set("intent", completed ? "complete" : "reopen");
      fetcher.submit(body, { method: "post", action: `/tasks/${taskId}` });
    },
    [fetcher],
  );

  const setField = useCallback(
    (taskId: string, fields: Record<string, string>, label: string) => {
      pendingLabel.current = label;
      const body = new FormData();
      body.append("id", taskId);
      for (const [key, value] of Object.entries(fields)) {
        body.set(key, value);
      }
      fetcher.submit(body, { method: "post", action: "/tasks/bulk" });
    },
    [fetcher],
  );

  /**
   * A canonical `/tasks/:taskId` record mutation from the row — the same route the
   * Drawer's own controls post to. Used for the recurrence-series operations (skip,
   * stop repeating), which are task-domain operations rather than field writes and so
   * have no place on the bulk field endpoint.
   */
  const setRecord = useCallback(
    (taskId: string, fields: Record<string, string>, label: string) => {
      pendingLabel.current = label;
      const body = new FormData();
      for (const [key, value] of Object.entries(fields)) body.set(key, value);
      fetcher.submit(body, { method: "post", action: `/tasks/${taskId}` });
    },
    [fetcher],
  );

  /**
   * Report a change the ROW's own inline field already persisted through a canonical
   * route, and re-read the list. The inline fields own their own request (DS-16 needs a
   * promise-returning save), so this is how their outcome reaches the same live region
   * and the same revalidation every other row mutation uses — one announcement channel,
   * not two.
   */
  const announce = useCallback(
    (message: string) => {
      setAnnouncement(message);
      revalidator.revalidate();
    },
    [revalidator],
  );

  return {
    setCompleted,
    setField,
    setRecord,
    announce,
    busy: fetcher.state !== "idle",
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
  const quick = useTaskQuickMutation();
  const config = data.config;
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

  const cards = useMemo(
    () => items.map((item) => toTaskCardData(item)),
    [items],
  );

  // A grouped view renders from the SERVER grouping (authoritative per-bucket
  // counts + bounded records), not from the accumulated flat page. A loader re-run
  // replaces `data.grouping` wholesale, so stale bucket data can never linger.
  const grouping = data.grouping;
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
      metadata.push({
        id: "priority",
        value: (
          <InlineTaskPriority
            taskId={card.id}
            title={card.title}
            priority={card.priority}
            onSaved={quick.announce}
            disabled={card.completed || viewingDeleted}
          />
        ),
      });
      // The urgency CHIP is kept for the three states a raw date cannot express —
      // Overdue, Due today, Scheduled today — and dropped otherwise, because the
      // inline date field below already says "Due 12 Aug". Showing both for an
      // ordinary future date would be the same fact twice.
      if (
        urgency !== null &&
        (urgency.kind === "overdue" ||
          urgency.kind === "due_today" ||
          urgency.kind === "scheduled_today")
      ) {
        metadata.push({
          id: "urgency",
          value: (
            <UrgencyChip
              task={{
                completedAt: card.completed ? "done" : null,
                dueDate: card.dueDate,
                scheduledDate: card.scheduledDate,
              }}
              todayIso={data.todayIso}
            />
          ),
        });
      }
      if (card.recurrence) {
        metadata.push({
          id: "repeat",
          value: <RecurrenceChip recurrence={card.recurrence} />,
        });
      }
      // No metadata `label` on the three inline fields: each one's own accessible
      // name already says which field it edits ("Due date: 12 Aug"), and its empty
      // state reads "No due date" / "Not planned" / "Unassigned" — so a visible
      // prefix would state the field name twice on every row.
      metadata.push({
        id: "due",
        value: (
          <InlineTaskDate
            taskId={card.id}
            title={card.title}
            kind="due"
            value={card.dueDate}
            onSaved={quick.announce}
            disabled={card.completed || viewingDeleted}
          />
        ),
        priority: "low",
      });
      metadata.push({
        id: "planned",
        value: (
          <InlineTaskDate
            taskId={card.id}
            title={card.title}
            kind="scheduled"
            value={card.scheduledDate}
            onSaved={quick.announce}
            disabled={card.completed || viewingDeleted}
          />
        ),
        priority: "low",
      });
      metadata.push({
        id: "parent",
        value: (
          <InlineTaskParent
            taskId={card.id}
            title={card.title}
            parent={card.parent}
            options={data.parents}
            onSaved={quick.announce}
            disabled={card.completed || viewingDeleted}
          />
        ),
        priority: "low",
      });
      // The module declares what a small card leads with: priority and urgency are
      // the SIGNALS a user scans for; the sector, the delegate and the waiting
      // subject are supporting detail — de-emphasised, never hidden.
      metadata.push({
        id: "sector",
        label: "Sector",
        value: card.sectorLabel,
        priority: "low",
      });
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
      const completeAction = {
        id: "complete",
        label: card.completed ? "Reopen" : "Complete",
        ariaLabel: card.completed
          ? `Reopen ${card.title}`
          : `Complete ${card.title}`,
        onSelect: () =>
          quick.setCompleted(card.id, !card.completed, card.title),
        disabled: quick.busy,
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
              ),
            disabled: quick.busy,
          };
      // Nothing on a deleted row can be mutated, so nothing on it offers to.
      const quickActions = viewingDeleted
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
              {
                id: "rename",
                label: "Rename",
                disabled: quick.busy,
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
                disabled: quick.busy,
                onSelect: () =>
                  quick.setField(
                    card.id,
                    { intent: "set_commitment", commitment: "someday" },
                    `${card.title} moved to Someday / Maybe.`,
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
                      disabled: quick.busy,
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
                      disabled: quick.busy,
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
                label: "Repeat, sector and dates…",
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
        icon: <EntityIcon type="task" />,
        headingLevel,
        status: { label: card.stateLabel, tone: card.stateTone as CardTone },
        metadata,
        density,
        presentation: "list",
        href: `?${withDrawerPushed(searchParams, key).toString()}`,
        onOpen: () => openDrawer(key),
        openAriaLabel: `Open ${card.title}`,
        quickActions,
        overflowActions,
        swipeActions: quickActions,
        // TASKS-08 — a touch HOLD enters selection mode and selects the held row, so
        // multi-select on a phone costs one gesture. It is an accelerator: the checkbox
        // below and the "Select tasks" toggle in the header are the ordinary,
        // keyboard-and-screen-reader path, and the hold is inert on a non-touch device.
        onLongPress: () => dispatchSelection({ type: "enter", id: card.id }),
        selection: {
          selected: selected.has(card.id),
          // Shift extends a RANGE from the last row toggled, in the order the rows are
          // on screen — which is why the visible order is passed rather than inferred.
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
      secondaryActions={
        // APPEARANCE-01/shell cleanup: the header's "New task" button is gone. It
        // opened the generic capture drawer with no context the global capture
        // control does not already supply, so it was a second door onto the same
        // room occupying the most valuable space on the screen. Creating a task
        // has not moved anywhere the owner has to learn: the global `+` is on
        // every page at every width, `c` opens it from the keyboard, and the
        // empty state below still offers "New task" to someone with no tasks at
        // all — which is the one moment a page-level create genuinely helps.
        //
        // Review Inbox STAYS. It is not a creation control: it is the way into
        // triage, and nothing in the global capture menu does it.
        <>
          {/*
           * TASKS-06/08 — the ORDINARY way into multi-selection, at every width.
           *
           * The phone gesture (hold a row) and the desktop habit (click a checkbox)
           * both work, but neither is discoverable and neither is reachable by
           * keyboard alone — so selection also has a real, labelled, focusable
           * control. Its pressed state is announced, not implied by colour.
           */}
          <button
            type="button"
            className="dh-btn dh-btn--secondary"
            aria-pressed={selection.mode}
            onClick={() =>
              dispatchSelection(
                selection.mode ? { type: "reset" } : { type: "enter" },
              )
            }
          >
            {selection.mode ? "Stop selecting" : "Select tasks"}
          </button>
          <Link className="dh-btn dh-btn--secondary" to="/tasks/review">
            Review Inbox
          </Link>
        </>
      }
      // The shared PX-02 view switcher stays in the pane header on desktop, so
      // changing presentation is ONE click rather than a trip through the sheet.
      // It writes the same `?view=` parameter the sheet's Layout group writes —
      // one control model, two affordances, never two states.
      viewSwitcher={
        <ViewSwitcher
          param={TASKS_PARAMS.presentation}
          options={TASK_PRESENTATIONS.map((presentation) => ({
            value: presentation,
            label: PRESENTATION_LABELS[presentation],
          }))}
          value={config.presentation}
          label="Task layout"
        />
      }
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
            <div className="dh-tasks-bulk__actions">
              <button
                type="button"
                className="dh-btn dh-btn--secondary"
                disabled={visibleIds.length === 0}
                onClick={() =>
                  dispatchSelection({ type: "select_visible", visibleIds })
                }
              >
                Select all {visibleIds.length}
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
      <h2 className="dh-tasks-section__label">
        {section.title}
        <span className="dh-tasks-section__count"> ({section.count})</span>
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
}: {
  readonly cards: readonly TaskCardData[];
  readonly ids: readonly string[];
  readonly todayIso: string;
  readonly parents: TasksPageData["parents"];
  /** True on the Deleted view, where Restore replaces the destructive actions. */
  readonly viewingDeleted: boolean;
  readonly onCleared: () => void;
}) {
  const fetcher = useFetcher<TasksBulkResult>();
  const revalidator = useRevalidator();
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
      setStatus(
        `${result.changed} ${result.changed === 1 ? "task" : "tasks"} ${lastVerb.current}, ${result.unchanged} unchanged.`,
      );
      setConfirmDelete(false);
      setShowMore(false);
      revalidator.revalidate();
      onCleared();
    } else {
      // A refusal keeps the selection: the owner's intent survives so they can fix the
      // cause and retry, rather than having to re-select fourteen rows.
      setStatus(result.formError);
      setConfirmDelete(false);
    }
  }, [fetcher.state, fetcher.data, revalidator, onCleared]);

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
