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
 * TASKS-03 makes the LIST the primary workspace. The Eisenhower Matrix and the Time
 * Sectors are retained as OPTIONAL presentations of the same query, chosen from the
 * same control surface as any other layout — neither is presented as the way to
 * manage tasks. Every presentation, filter combination, sort and grouping reads the
 * one loader payload; there is no per-view query.
 *
 * Every mutation reachable from a row goes to a CANONICAL route: completion to
 * `POST /tasks/:taskId`, field changes to `/tasks/bulk`, creation to `/tasks/new`,
 * saved views to `/tasks/views`. There is no list-only mutation anywhere here.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { PriorityIndicator } from "~/shared/task-record/PriorityIndicator";
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
 * lookup, so a grouped Matrix row can open the same panel a list row does.
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

  const clearParent = useCallback(
    (taskId: string, title: string) => {
      pendingLabel.current = `${title} moved to Inbox.`;
      const body = new FormData();
      body.set("intent", "set_parent");
      body.set("parentId", "");
      body.set("parentKind", "");
      fetcher.submit(body, { method: "post", action: `/tasks/${taskId}` });
    },
    [fetcher],
  );

  return {
    setCompleted,
    setField,
    clearParent,
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

  // Selection for bulk actions. Cleared whenever the result set changes.
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    setSelected(new Set());
  }, [resetKey]);
  const clearSelection = useCallback(() => setSelected(new Set()), []);
  const toggleSelected = useCallback((id: string, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }, []);

  const density = config.density;

  const toCardProps = useCallback(
    (card: TaskCardData, headingLevel: 2 | 3): CardProps => {
      // Priority ≠ urgency ≠ display-state as THREE separable slots (TASKS-02): the
      // display-state stays the status pill; priority and urgency render as the
      // shared, self-describing chips in the metadata row — colour is reinforcement
      // only, each chip carries its meaning in words.
      const metadata: CardMetaItem[] = [];
      if (card.priority) {
        metadata.push({
          id: "priority",
          value: <PriorityIndicator priority={card.priority} />,
        });
      }
      if (card.dueDate || card.scheduledDate) {
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
      const quickActions = [completeAction, planTodayAction].filter(
        (action) => action !== null,
      );

      // The long tail of quick edits stays in the ONE shared overflow menu rather
      // than turning every row into a spreadsheet. Archive/restore/delete keep the
      // shared lifecycle placement: a Task's removal is a status change made in the
      // canonical Drawer, so the menu POINTS there rather than forking a second
      // lifecycle path (PX-04).
      const overflowActions = card.completed
        ? [
            {
              id: "open-record",
              label: "Open task record",
              onSelect: () => openDrawer(`task:${card.id}`),
            },
          ]
        : [
            ...TASK_PRIORITIES.map((priority) => ({
              id: `priority-${priority}`,
              label: `Set ${taskPriorityLabel(priority)}`,
              disabled: quick.busy || card.priority === priority,
              onSelect: () =>
                quick.setField(
                  card.id,
                  { intent: "set_priority", priority },
                  `${card.title} set to ${taskPriorityLabel(priority)}.`,
                ),
            })),
            {
              id: "due-today",
              label: "Due today",
              separatorBefore: true,
              disabled: quick.busy || card.dueDate === data.todayIso,
              onSelect: () =>
                quick.setField(
                  card.id,
                  { intent: "set_due", dueDate: data.todayIso },
                  `${card.title} is due today.`,
                ),
            },
            {
              id: "clear-due",
              label: "Clear due date",
              disabled: quick.busy || card.dueDate === null,
              onSelect: () =>
                quick.setField(
                  card.id,
                  { intent: "set_due", dueDate: "" },
                  `Cleared the due date on ${card.title}.`,
                ),
            },
            {
              id: "clear-plan",
              label: "Clear planned date",
              disabled: quick.busy || card.scheduledDate === null,
              onSelect: () =>
                quick.setField(
                  card.id,
                  { intent: "clear_plan" },
                  `Cleared the planned date on ${card.title}.`,
                ),
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
            {
              id: "rename",
              label: "Rename",
              separatorBefore: true,
              disabled: quick.busy,
              onSelect: () => setEditingTitleId(card.id),
            },
            {
              id: "move-to",
              label: "Move to Project or Area…",
              onSelect: () => openDrawer(`task-move:${card.id}`),
            },
            {
              id: "move-to-inbox",
              label: "Move to Inbox",
              disabled: quick.busy || !card.parentLabel,
              onSelect: () => quick.clearParent(card.id, card.title),
            },
            {
              id: "quick-edit",
              label: "Dates, sector and repeat…",
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
        // An Inbox Task reads as "Unassigned" — the honest parent value, not a blank.
        context: { label: card.parentLabel ?? "Unassigned" },
        density,
        presentation: "list",
        href: `?${withDrawerPushed(searchParams, key).toString()}`,
        onOpen: () => openDrawer(key),
        openAriaLabel: `Open ${card.title}`,
        quickActions,
        overflowActions,
        swipeActions: quickActions,
        selection: {
          selected: selected.has(card.id),
          onSelectedChange: (on) => toggleSelected(card.id, on),
          label: `Select ${card.title}`,
        },
      };
    },
    [
      data.todayIso,
      searchParams,
      openDrawer,
      selected,
      toggleSelected,
      quick,
      density,
      editingTitleId,
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
        <Link className="dh-btn dh-btn--secondary" to="/tasks/review">
          Review Inbox
        </Link>
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
            ids={[...selected]}
            todayIso={data.todayIso}
            onCleared={clearSelection}
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
      {section.subtitle ? (
        <p className="dh-tasks-section__subtitle">{section.subtitle}</p>
      ) : null}
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
 * The grouped presentations. All three — Matrix, Sectors and an ordinary grouped
 * List/Board — render the SAME sections through the SAME bucket component; only the
 * container layout differs, and that difference is CSS. There is no per-view
 * grouping logic and no per-view query.
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
    presentation === "matrix"
      ? "dh-tasks-matrix"
      : presentation === "sectors"
        ? "dh-tasks-sectors"
        : presentation === "board"
          ? "dh-tasks-board"
          : "dh-tasks-grouped";
  const bucketClass =
    presentation === "matrix"
      ? "dh-tasks-matrix__cell"
      : presentation === "sectors"
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
          className={
            presentation === "matrix" && section.key === "untriaged"
              ? `${bucketClass} dh-tasks-matrix__cell--untriaged`
              : bucketClass
          }
          renderCollection={renderCollection}
          viewAllHref={viewAllHref}
        />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Bulk action bar                                                             */
/* -------------------------------------------------------------------------- */

const BULK_PRIORITY_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "", label: "Set priority…" },
  { value: "p1", label: "P1 · Urgent" },
  { value: "p2", label: "P2 · High" },
  { value: "p3", label: "P3 · Normal" },
  { value: "p4", label: "P4 · Low" },
  { value: "__none", label: "No priority" },
];

const BULK_SECTOR_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "", label: "Move to sector…" },
  { value: "__none", label: "No sector" },
  ...TIME_SECTORS.map((sector) => ({
    value: sector,
    label: timeSectorLabel(sector),
  })),
];

function BulkActionBar({
  ids,
  todayIso,
  onCleared,
}: {
  readonly ids: readonly string[];
  readonly todayIso: string;
  readonly onCleared: () => void;
}) {
  const fetcher = useFetcher<TasksBulkResult>();
  const revalidator = useRevalidator();
  const [status, setStatus] = useState<string | null>(null);
  const processed = useRef<TasksBulkResult | null>(null);

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) {
      return;
    }
    const result = fetcher.data;
    if (processed.current === result) {
      return;
    }
    processed.current = result;
    if (result.ok) {
      setStatus(`${result.changed} updated, ${result.unchanged} unchanged.`);
      revalidator.revalidate();
      onCleared();
    } else {
      setStatus(result.formError);
    }
  }, [fetcher.state, fetcher.data, revalidator, onCleared]);

  const busy = fetcher.state !== "idle";

  const run = useCallback(
    (fields: Record<string, string>) => {
      const body = new FormData();
      for (const id of ids) {
        body.append("id", id);
      }
      for (const [key, value] of Object.entries(fields)) {
        body.set(key, value);
      }
      fetcher.submit(body, { method: "post", action: "/tasks/bulk" });
    },
    [fetcher, ids],
  );

  const onPriority = (value: string) => {
    if (value === "") return;
    run({ intent: "set_priority", priority: value === "__none" ? "" : value });
  };
  const onSector = (value: string) => {
    if (value === "") return;
    run({ intent: "set_sector", sector: value === "__none" ? "" : value });
  };

  return (
    <div className="dh-tasks-bulk" role="group" aria-label="Bulk task actions">
      <p className="dh-tasks-bulk__count" aria-live="polite">
        {ids.length} selected
      </p>
      <div className="dh-tasks-bulk__actions">
        <button
          type="button"
          className="dh-btn dh-btn--secondary"
          disabled={busy}
          onClick={() => run({ intent: "complete" })}
        >
          Complete
        </button>

        <label className="dh-tasks-bulk__select">
          <span className="dh-visually-hidden">
            Set priority for selected tasks
          </span>
          <select
            className="dh-input"
            value=""
            disabled={busy}
            onChange={(event) => onPriority(event.target.value)}
          >
            {BULK_PRIORITY_OPTIONS.map((option) => (
              <option key={option.value || "placeholder"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="dh-tasks-bulk__select">
          <span className="dh-visually-hidden">
            Move selected tasks to a sector
          </span>
          <select
            className="dh-input"
            value=""
            disabled={busy}
            onChange={(event) => onSector(event.target.value)}
          >
            {BULK_SECTOR_OPTIONS.map((option) => (
              <option key={option.value || "placeholder"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

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
          Activate
        </button>
        <button
          type="button"
          className="dh-btn dh-btn--secondary"
          disabled={busy}
          onClick={() => run({ intent: "set_status", status: "on_hold" })}
        >
          On hold
        </button>
        <button
          type="button"
          className="dh-btn dh-btn--secondary"
          disabled={busy}
          onClick={() => run({ intent: "set_status", status: "cancelled" })}
        >
          Cancel
        </button>
        <button
          type="button"
          className="dh-btn dh-btn--secondary"
          disabled={busy}
          onClick={() => run({ intent: "plan", scheduledDate: todayIso })}
        >
          Plan today
        </button>
        <button
          type="button"
          className="dh-btn dh-btn--secondary"
          disabled={busy}
          onClick={() => run({ intent: "clear_plan" })}
        >
          Clear plan
        </button>

        <button
          type="button"
          className="dh-btn dh-btn--ghost"
          disabled={busy}
          onClick={onCleared}
        >
          Clear selection
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
