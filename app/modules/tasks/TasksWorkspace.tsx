/**
 * TASKS-01 — the `/tasks` workspace surface (presentation, no server imports).
 *
 * The authoritative workspace-wide Tasks planning and execution surface (ADR-043),
 * composed ENTIRELY from the shared frame — the PX-02 CollectionLayout, the ONE
 * DS-04 Card + CardCollection, the shared EmptyState, LoadMore, SegmentedFilter and
 * the DS-03 Drawer (hosting the shared Task record and the DS-06 create form). No
 * bespoke primitives, no second drawer.
 *
 * Four primary views over the SAME loaded cards (the server sorts and filters; the
 * view-model groups): Focus (a flat execution list with Waiting split out), the
 * Eisenhower Matrix (a 2×2 grid on desktop, stacked on mobile), the Time Sectors,
 * and a flat All list with a sort control. A secondary row of system-view links
 * (Inbox, Today, …) re-scopes the query. Bulk actions post to `/tasks/bulk`; the
 * task record itself opens in the ONE canonical shared Task Drawer.
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
  type CollectionControlGroup,
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
import { EntityIcon } from "~/shared/entity";
import { LoadMore } from "~/shared/load-more";
import { SegmentedFilter } from "~/shared/segmented-filter";
import { PriorityIndicator } from "~/shared/task-record/PriorityIndicator";
import { TaskRecordDrawer } from "~/shared/task-record/TaskRecordDrawer";
import { UrgencyChip } from "~/shared/task-record/UrgencyChip";
import {
  taskPriorityLabel,
  timeSectorLabel,
  type SerializedTaskListItem,
} from "~/shared/task-record/task-view";
import {
  TASK_PRIORITIES,
  TASK_SORTS,
  TASK_SYSTEM_VIEWS,
  TIME_SECTORS,
  type TaskSort,
  type TaskSystemView,
} from "~/kernel/tasks";

import { NewTaskForm } from "./NewTaskForm";
import type { TasksBulkResult, TasksPageData } from "./tasks-contract";
import {
  resolveMatrixSections,
  resolveSectorSections,
  toTaskCardData,
  type GroupedSection,
  type TaskCardData,
} from "./tasks-view-model";

/** The drawer key that opens the "New task" quick-capture form. */
const NEW_TASK_KEY = "new-task";

/** The primary view switcher options (URL `?view=`). */
const VIEW_OPTIONS = [
  { value: "focus", label: "Focus" },
  { value: "matrix", label: "Matrix" },
  { value: "sectors", label: "Sectors" },
  { value: "all", label: "All" },
] as const;

/** The secondary system-view chips (URL `?system=`), in planning order. */
const SYSTEM_VIEW_LABELS: Record<TaskSystemView, string> = {
  inbox: "Inbox",
  today: "Today",
  upcoming: "Upcoming",
  this_week: "This week",
  next_week: "Next week",
  this_month: "This month",
  next_month: "Next month",
  long_term: "Long term",
  someday: "Someday / Maybe",
  waiting: "Waiting",
  routines: "Routines",
  overdue: "Overdue",
  completed: "Completed",
  cancelled: "Cancelled",
  active: "Active",
  all: "All",
};

const SORT_LABELS: Record<TaskSort, string> = {
  smart: "Smart",
  due_date: "Due date",
  scheduled_date: "Scheduled date",
  priority: "Priority",
  created: "Created",
  updated: "Updated",
  title: "Title",
};

/**
 * MOBILE-01 — the phone control groups, fed to the ONE shared collection sheet.
 *
 * These are the SAME URL parameters the desktop system-view rail, the view
 * switcher and the sort select write (`?system=`, `?priority=`, `?sector=`,
 * `?view=`, `?sort=`), so the phone sheet is a different way to reach the same
 * state — not a second filter model. Saved views appear as the "View" group: the
 * system views ARE the product's saved views today, and when X-02 adds
 * user-defined ones they extend this same group.
 *
 * Everything here is a small, closed option set. A filter over a searched record
 * (a specific Project) stays a server-backed picker on the desktop filter bar —
 * the sheet never loads a collection to filter it locally.
 */
const MOBILE_CONTROL_GROUPS: readonly CollectionControlGroup[] = [
  {
    id: "system",
    label: "View",
    param: "system",
    kind: "view",
    options: [
      { value: "", label: "Default for this view" },
      ...TASK_SYSTEM_VIEWS.map((view) => ({
        value: view,
        label: SYSTEM_VIEW_LABELS[view],
      })),
    ],
  },
  {
    id: "priority",
    label: "Priority",
    param: "priority",
    options: [
      { value: "", label: "Any priority" },
      { value: "p1", label: "P1 · Urgent" },
      { value: "p2", label: "P2 · High" },
      { value: "p3", label: "P3 · Normal" },
      { value: "p4", label: "P4 · Low" },
      { value: "__none", label: "No priority" },
    ],
  },
  {
    id: "sector",
    label: "Time sector",
    param: "sector",
    options: [
      { value: "", label: "Any sector" },
      { value: "__none", label: "Inbox (no sector)" },
      ...TIME_SECTORS.map((sector) => ({
        value: sector,
        label: timeSectorLabel(sector),
      })),
    ],
  },
  {
    id: "layout",
    label: "Layout",
    param: "view",
    kind: "group",
    defaultValue: "focus",
    options: VIEW_OPTIONS.map((option) => ({
      value: option.value,
      label: option.label,
    })),
  },
  {
    id: "sort",
    label: "Sort",
    param: "sort",
    kind: "sort",
    defaultValue: "smart",
    options: TASK_SORTS.map((sort) => ({
      value: sort,
      label: SORT_LABELS[sort],
    })),
  },
];

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
      if (entry.key === NEW_TASK_KEY) {
        return {
          title: "New task",
          description: "Capture a task under a Project or an Area.",
          children: (
            <NewTaskDrawerHost defaultParent={data.defaultCaptureParent} />
          ),
        };
      }
      return null;
    };
  }, [data.defaultCaptureParent]);

  return (
    <DrawerProvider renderDrawer={renderDrawer}>
      <TasksWorkspaceInner data={data} />
    </DrawerProvider>
  );
}

/** Hosts the create form: reflects the new task, then opens it in the shared Drawer. */
function NewTaskDrawerHost({
  defaultParent,
}: {
  readonly defaultParent: TasksPageData["defaultCaptureParent"];
}) {
  const { closeDrawer, replaceDrawer } = useDrawer();
  const revalidator = useRevalidator();
  return (
    <NewTaskForm
      defaultParent={defaultParent}
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
 * are appended. A filter/view/sort change (the `resetKey`) or a loader re-run
 * (a new first cursor) RESETS the accumulation. Duplicate ids are collapsed
 * defensively. Modelled on Projects' `useProjectPagination`.
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

  // Reset the accumulation whenever the query scope changes (`resetKey`) OR the
  // loader re-runs (a new `firstPage` reference — e.g. a revalidation after a bulk
  // mutation, even if the cursor/scope is unchanged). Keying to the loader RESULT,
  // not only the cursor, prevents stale appended rows — e.g. a completed task
  // lingering in This Week — after a mutation (review feedback). `firstPage` is
  // `loaderData.items`, whose reference is stable across renders and only changes
  // when the loader actually re-runs.
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
/* The surface                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * MOBILE-01 — one-tap task edits from the list, through the CANONICAL routes.
 *
 * Completion posts `intent=complete`/`reopen` to `POST /tasks/:taskId` — the same
 * atomic task-domain operation the Task Drawer's Complete button uses (ADR-029),
 * so completing from a list and completing from the record are one execution
 * path with one Activity trail. Priority and date changes go through the trusted
 * `/tasks/bulk` field mutation with a single id, again the same authority the bulk
 * bar uses. There is no list-only mutation anywhere in this file.
 *
 * The loader is revalidated after each change so the row reflects reality
 * (a completed task leaving an active view, a re-sorted list) rather than an
 * optimistic guess that could disagree with the server.
 */
function useTaskQuickMutation() {
  const fetcher = useFetcher();
  const revalidator = useRevalidator();
  const settled = useRef<unknown>(null);

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) {
      return;
    }
    if (settled.current === fetcher.data) {
      return;
    }
    settled.current = fetcher.data;
    revalidator.revalidate();
  }, [fetcher.state, fetcher.data, revalidator]);

  const setCompleted = useCallback(
    (taskId: string, completed: boolean) => {
      const body = new FormData();
      body.set("intent", completed ? "complete" : "reopen");
      fetcher.submit(body, { method: "post", action: `/tasks/${taskId}` });
    },
    [fetcher],
  );

  const setField = useCallback(
    (taskId: string, fields: Record<string, string>) => {
      const body = new FormData();
      body.append("id", taskId);
      for (const [key, value] of Object.entries(fields)) {
        body.set(key, value);
      }
      fetcher.submit(body, { method: "post", action: "/tasks/bulk" });
    },
    [fetcher],
  );

  return { setCompleted, setField, busy: fetcher.state !== "idle" };
}

function TasksWorkspaceInner({ data }: { readonly data: TasksPageData }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { openDrawer } = useDrawer();
  const quick = useTaskQuickMutation();

  const resetKey = useMemo(
    () =>
      JSON.stringify({
        view: data.primaryView,
        system: data.systemView,
        sort: data.sort,
        filters: data.filters,
      }),
    [data.primaryView, data.systemView, data.sort, data.filters],
  );

  const loadHref = useCallback(
    (cursor: string): string => {
      const next = new URLSearchParams(searchParams);
      next.delete("drawer");
      next.set("cursor", cursor);
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

  // The Matrix and Sectors views render from the SERVER grouping (authoritative
  // per-bucket counts + bounded records), not from the accumulated flat page. A
  // loader re-run (revalidation after a mutation) replaces `data.grouping` wholesale,
  // so stale bucket data can never linger (ADR-043 §11 / decision 12).
  const grouping = data.grouping;
  const isGrouped = grouping !== null;
  const groupedSections = useMemo<GroupedSection[]>(() => {
    if (!grouping) return [];
    return grouping.dimension === "quadrant"
      ? resolveMatrixSections(grouping)
      : resolveSectorSections(grouping);
  }, [grouping]);
  const groupedTotal = useMemo(
    () => (grouping ? grouping.groups.reduce((n, g) => n + g.count, 0) : 0),
    [grouping],
  );

  // Build the "view all in this bucket" link: the flat All list scoped to the SAME
  // active-planning population as the bucket (`system=active`) plus the bucket's
  // priority/sector filter, so the overflow of a bucket paginates independently on
  // its own cursor without an unbounded read.
  const viewAllHref = useCallback(
    (section: GroupedSection): string => {
      const next = new URLSearchParams(searchParams);
      next.set("view", "all");
      next.set("system", "active");
      next.set(section.filterParam, section.filterKey);
      next.delete(section.filterParam === "priority" ? "sector" : "priority");
      next.delete("cursor");
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

  const toCardProps = useCallback(
    (card: TaskCardData, headingLevel: 2 | 3): CardProps => {
      // Priority ≠ urgency ≠ display-state as THREE separable slots (TASKS-02): the
      // display-state stays the status pill; priority and urgency render as the
      // shared, self-describing coloured chips in the metadata row (colour is
      // reinforcement only — each chip carries its meaning in words).
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
      // MOBILE-01: the module declares what a small card should lead with.
      // Priority and urgency are SIGNALS the user scans for; the sector and the
      // delegate are supporting detail — de-emphasised on a phone, never hidden.
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

      // MOBILE-01: one-tap completion straight from the list, and one-tap
      // scheduling — the two things a phone user does most and previously had to
      // open the record for. Both are ordinary, labelled, keyboard-reachable
      // buttons; the swipe tray below is only an accelerator over the same
      // actions (TODAY-06 / ADR-032), never gesture-only functionality.
      const completeAction = {
        id: "complete",
        label: card.completed ? "Reopen" : "Complete",
        ariaLabel: card.completed
          ? `Reopen ${card.title}`
          : `Complete ${card.title}`,
        onSelect: () => quick.setCompleted(card.id, !card.completed),
        disabled: quick.busy,
      };
      const planTodayAction = card.completed
        ? null
        : {
            id: "plan-today",
            label: "Today",
            ariaLabel: `Plan ${card.title} for today`,
            onSelect: () =>
              quick.setField(card.id, {
                intent: "plan",
                scheduledDate: data.todayIso,
              }),
            disabled: quick.busy,
          };
      const quickActions = [completeAction, planTodayAction].filter(
        (action) => action !== null,
      );

      // The long tail of quick edits (priority, clearing a plan) stays in the
      // one shared overflow menu rather than adding buttons to every row.
      const overflowActions = card.completed
        ? []
        : [
            ...TASK_PRIORITIES.map((priority) => ({
              id: `priority-${priority}`,
              label: `Set ${taskPriorityLabel(priority)}`,
              disabled: quick.busy || card.priority === priority,
              onSelect: () =>
                quick.setField(card.id, {
                  intent: "set_priority",
                  priority,
                }),
            })),
            {
              id: "clear-plan",
              label: "Clear scheduled date",
              separatorBefore: true,
              disabled: quick.busy || card.scheduledDate === null,
              onSelect: () => quick.setField(card.id, { intent: "clear_plan" }),
            },
          ];

      const key = `task:${card.id}`;
      return {
        id: card.id,
        title: card.title,
        typeLabel: "Task",
        icon: <EntityIcon type="task" />,
        headingLevel,
        status: { label: card.stateLabel, tone: card.stateTone as CardTone },
        metadata,
        context: card.parentLabel ? { label: card.parentLabel } : undefined,
        density: "comfortable",
        presentation: "list",
        href: `?${withDrawerPushed(searchParams, key).toString()}`,
        onOpen: () => openDrawer(key),
        openAriaLabel: `Open ${card.title}`,
        quickActions,
        overflowActions,
        // The accelerator reveals the SAME actions, so nothing here is
        // gesture-only and a non-touch device behaves exactly as before.
        swipeActions: quickActions,
        selection: {
          selected: selected.has(card.id),
          onSelectedChange: (on) => toggleSelected(card.id, on),
          label: `Select ${card.title}`,
        },
      };
    },
    [data.todayIso, searchParams, openDrawer, selected, toggleSelected, quick],
  );

  const renderCollection = useCallback(
    (list: readonly TaskCardData[], ariaLabel: string, headingLevel: 2 | 3) => (
      <CardCollection
        items={list}
        getItemId={(card) => card.id}
        ariaLabel={ariaLabel}
        presentation="list"
        density="comfortable"
        renderCard={(card) => <Card {...toCardProps(card, headingLevel)} />}
      />
    ),
    [toCardProps],
  );

  const count = isGrouped ? groupedTotal : items.length;
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

  const onSortChange = useCallback(
    (value: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value === "smart") {
            next.delete("sort");
          } else {
            next.set("sort", value);
          }
          next.delete("cursor");
          return next;
        },
        { replace: true, preventScrollReset: true },
      );
    },
    [setSearchParams],
  );

  // PX-06: the ONE shared collection loading signal — a same-route navigation
  // (a filter, a view, a page) shows the shared skeleton instead of leaving the
  // previous list on screen with no feedback.
  const isReloading = useCollectionLoading();
  return (
    <CollectionLayout
      isLoading={isReloading}
      title="Tasks"
      subtitle={subtitle}
      entityType="task"
      primaryAction={
        <DrawerTrigger
          drawerKey={NEW_TASK_KEY}
          className="dh-btn dh-btn--primary"
        >
          New task
        </DrawerTrigger>
      }
      viewSwitcher={
        <SegmentedFilter
          param="view"
          options={VIEW_OPTIONS}
          value={data.primaryView}
          label="Choose a task view"
        />
      }
      filterBar={<SystemViewChips searchParams={searchParams} />}
      // MOBILE-01: on a phone the desktop system-view rail, view switcher and
      // sort select collapse into ONE row plus the shared sheet, so the first
      // task is visible without scrolling past three rows of chrome.
      mobileControls={<CollectionControls groups={MOBILE_CONTROL_GROUPS} />}
      error={
        data.failed ? (
          <EmptyState
            title="We couldn’t load your tasks"
            description="Something went wrong. Please try again."
          />
        ) : undefined
      }
      isEmpty={!data.failed && count === 0}
      emptySlot={
        <EmptyState
          icon={<EntityIcon type="task" />}
          title="No tasks yet"
          description="Capture a task, or choose a different view or system list above."
          primaryAction={
            <DrawerTrigger
              drawerKey={NEW_TASK_KEY}
              className="dh-btn dh-btn--primary"
            >
              New task
            </DrawerTrigger>
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
      {data.primaryView === "matrix" ? (
        <MatrixView
          sections={groupedSections}
          renderCollection={renderCollection}
          viewAllHref={viewAllHref}
        />
      ) : data.primaryView === "sectors" ? (
        <SectorsView
          sections={groupedSections}
          renderCollection={renderCollection}
          viewAllHref={viewAllHref}
        />
      ) : data.primaryView === "all" ? (
        <>
          <div className="dh-tasks-sort">
            <label
              className="dh-tasks-sort__label"
              htmlFor="dh-tasks-sort-select"
            >
              Sort by
            </label>
            <select
              id="dh-tasks-sort-select"
              className="dh-input dh-tasks-sort__select"
              value={data.sort}
              onChange={(event) => onSortChange(event.target.value)}
            >
              {TASK_SORTS.map((sort) => (
                <option key={sort} value={sort}>
                  {SORT_LABELS[sort]}
                </option>
              ))}
            </select>
          </div>
          {renderCollection(cards, "All tasks", 2)}
        </>
      ) : (
        <FocusView cards={cards} renderCollection={renderCollection} />
      )}

      {!data.failed && !isGrouped && hasMore ? (
        <LoadMore
          loading={loading}
          loadFailed={loadFailed}
          onLoadMore={loadMore}
          label="Load more tasks"
        />
      ) : null}
    </CollectionLayout>
  );
}

/* -------------------------------------------------------------------------- */
/* System-view chips                                                           */
/* -------------------------------------------------------------------------- */

function SystemViewChips({
  searchParams,
}: {
  readonly searchParams: URLSearchParams;
}) {
  const active = searchParams.get("system");
  const hrefFor = (view: TaskSystemView): string => {
    const next = new URLSearchParams(searchParams);
    next.set("system", view);
    next.delete("cursor");
    return `?${next.toString()}`;
  };
  return (
    <nav className="dh-tasks-systems" aria-label="System views">
      <ul className="dh-tasks-systems__list">
        {TASK_SYSTEM_VIEWS.map((view) => (
          <li key={view} className="dh-tasks-systems__item">
            <Link
              to={hrefFor(view)}
              replace
              preventScrollReset
              className="dh-tasks-systems__link"
              aria-current={active === view ? "true" : undefined}
            >
              {SYSTEM_VIEW_LABELS[view]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/* -------------------------------------------------------------------------- */
/* Views                                                                       */
/* -------------------------------------------------------------------------- */

type RenderCollection = (
  list: readonly TaskCardData[],
  ariaLabel: string,
  headingLevel: 2 | 3,
) => ReactNode;

function FocusView({
  cards,
  renderCollection,
}: {
  readonly cards: readonly TaskCardData[];
  readonly renderCollection: RenderCollection;
}) {
  const waiting = cards.filter((card) => card.waiting);
  const main = cards.filter((card) => !card.waiting);
  return (
    <div className="dh-tasks-focus">
      {main.length > 0 ? renderCollection(main, "Focus tasks", 2) : null}
      {waiting.length > 0 ? (
        <section
          className="dh-tasks-section"
          aria-labelledby="dh-tasks-waiting-heading"
        >
          <h2 id="dh-tasks-waiting-heading" className="dh-tasks-section__label">
            Waiting
          </h2>
          {renderCollection(waiting, "Waiting tasks", 3)}
        </section>
      ) : null}
    </div>
  );
}

/**
 * A single grouped bucket (a Matrix quadrant or a Time Sector column). Renders the
 * AUTHORITATIVE server count in its heading, the bounded slice of cards the loader
 * returned, and a "View all N →" link to the equivalent filtered list when the bucket
 * holds more than the loaded slice (ADR-043 §11 / decision 12).
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
  readonly viewAllHref: (section: GroupedSection) => string;
}) {
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
      {section.hasMore ? (
        <Link
          to={viewAllHref(section)}
          className="dh-tasks-section__more"
          preventScrollReset
        >
          View all {section.count} in {section.title}
        </Link>
      ) : null}
    </section>
  );
}

function MatrixView({
  sections,
  renderCollection,
  viewAllHref,
}: {
  readonly sections: readonly GroupedSection[];
  readonly renderCollection: RenderCollection;
  readonly viewAllHref: (section: GroupedSection) => string;
}) {
  return (
    <div className="dh-tasks-matrix">
      {sections.map((section) => (
        <GroupedBucket
          key={section.key}
          section={section}
          className={
            section.key === "untriaged"
              ? "dh-tasks-matrix__cell dh-tasks-matrix__cell--untriaged"
              : "dh-tasks-matrix__cell"
          }
          renderCollection={renderCollection}
          viewAllHref={viewAllHref}
        />
      ))}
    </div>
  );
}

function SectorsView({
  sections,
  renderCollection,
  viewAllHref,
}: {
  readonly sections: readonly GroupedSection[];
  readonly renderCollection: RenderCollection;
  readonly viewAllHref: (section: GroupedSection) => string;
}) {
  return (
    <div className="dh-tasks-sectors">
      {sections.map((section) => (
        <GroupedBucket
          key={section.key}
          section={section}
          className="dh-tasks-sectors__column"
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
  { value: "__none", label: "Inbox (no sector)" },
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
