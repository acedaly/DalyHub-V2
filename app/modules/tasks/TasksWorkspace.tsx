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
import { CollectionLayout } from "~/shared/collection-layout";
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
import { TaskRecordDrawer } from "~/shared/task-record/TaskRecordDrawer";
import {
  formatCalendarDate,
  timeSectorLabel,
  type SerializedTaskListItem,
} from "~/shared/task-record/task-view";
import {
  TASK_SORTS,
  TASK_SYSTEM_VIEWS,
  TIME_SECTORS,
  type TaskSort,
  type TaskSystemView,
} from "~/kernel/tasks";

import { NewTaskForm } from "./NewTaskForm";
import type { TasksBulkResult, TasksPageData } from "./tasks-contract";
import {
  MATRIX_QUADRANTS,
  SECTOR_SECTIONS,
  groupByQuadrant,
  groupBySector,
  toTaskCardData,
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
  this_week: "This Week",
  next_week: "Next Week",
  this_month: "This Month",
  next_month: "Next Month",
  long_term: "Long Term",
  someday: "Someday / Maybe",
  waiting: "Waiting",
  routines: "Routines",
  overdue: "Overdue",
  completed: "Completed",
  cancelled: "Cancelled",
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
          children: <NewTaskDrawerHost />,
        };
      }
      return null;
    };
  }, []);

  return (
    <DrawerProvider renderDrawer={renderDrawer}>
      <TasksWorkspaceInner data={data} />
    </DrawerProvider>
  );
}

/** Hosts the create form: reflects the new task, then opens it in the shared Drawer. */
function NewTaskDrawerHost() {
  const { closeDrawer, replaceDrawer } = useDrawer();
  const revalidator = useRevalidator();
  return (
    <NewTaskForm
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

  useEffect(() => {
    setAppended([]);
    setCursor(initialCursor);
    setLoadFailed(false);
    processed.current = null;
  }, [initialCursor, resetKey]);

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

function TasksWorkspaceInner({ data }: { readonly data: TasksPageData }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { openDrawer } = useDrawer();

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
      const metadata: CardMetaItem[] = [
        { id: "priority", label: "Priority", value: card.priorityTag },
        { id: "sector", label: "Sector", value: card.sectorLabel },
      ];
      if (card.delegatedTo) {
        metadata.push({
          id: "delegated",
          label: "Delegated to",
          value: card.delegatedTo,
        });
      }

      let dateLabel: CardProps["dateLabel"];
      if (card.dueDate) {
        const formatted = formatCalendarDate(card.dueDate);
        if (formatted) {
          const overdue = !card.completed && card.dueDate < data.todayIso;
          dateLabel = overdue
            ? { label: `Due ${formatted}`, tone: "danger" }
            : { label: `Due ${formatted}` };
        }
      } else if (card.scheduledDate) {
        const formatted = formatCalendarDate(card.scheduledDate);
        if (formatted) {
          dateLabel = { label: `Scheduled ${formatted}` };
        }
      }

      const key = `task:${card.id}`;
      return {
        id: card.id,
        title: card.title,
        typeLabel: "Task",
        icon: <EntityIcon type="task" />,
        headingLevel,
        status: { label: card.stateLabel, tone: card.stateTone as CardTone },
        metadata,
        dateLabel,
        context: card.parentLabel ? { label: card.parentLabel } : undefined,
        density: "comfortable",
        presentation: "list",
        href: `?${withDrawerPushed(searchParams, key).toString()}`,
        onOpen: () => openDrawer(key),
        openAriaLabel: `Open ${card.title}`,
        selection: {
          selected: selected.has(card.id),
          onSelectedChange: (on) => toggleSelected(card.id, on),
          label: `Select ${card.title}`,
        },
      };
    },
    [data.todayIso, searchParams, openDrawer, selected, toggleSelected],
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

  const count = items.length;
  const subtitle = data.failed
    ? "We couldn't load your tasks."
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

  return (
    <CollectionLayout
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
      error={
        data.failed ? (
          <EmptyState
            title="We couldn't load your tasks"
            description="Something went wrong. Please try again."
          />
        ) : undefined
      }
      isEmpty={!data.failed && count === 0}
      emptySlot={
        <EmptyState
          icon={<EntityIcon type="task" />}
          title="No tasks here"
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
        <MatrixView cards={cards} renderCollection={renderCollection} />
      ) : data.primaryView === "sectors" ? (
        <SectorsView cards={cards} renderCollection={renderCollection} />
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

      {!data.failed && hasMore ? (
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

function MatrixView({
  cards,
  renderCollection,
}: {
  readonly cards: readonly TaskCardData[];
  readonly renderCollection: RenderCollection;
}) {
  const buckets = groupByQuadrant(cards);
  return (
    <div className="dh-tasks-matrix">
      {MATRIX_QUADRANTS.map((quadrant) => {
        const list = buckets[quadrant.quadrant];
        return (
          <section
            key={quadrant.quadrant}
            className="dh-tasks-matrix__cell"
            aria-label={quadrant.title}
          >
            <h2 className="dh-tasks-section__label">
              {quadrant.title}
              <span className="dh-tasks-section__count"> ({list.length})</span>
            </h2>
            {list.length > 0 ? (
              renderCollection(list, quadrant.title, 3)
            ) : (
              <p className="dh-tasks-section__empty">Nothing here.</p>
            )}
          </section>
        );
      })}
      <section
        className="dh-tasks-matrix__cell dh-tasks-matrix__cell--untriaged"
        aria-label="Unprioritised"
      >
        <h2 className="dh-tasks-section__label">
          Unprioritised
          <span className="dh-tasks-section__count">
            {" "}
            ({buckets.untriaged.length})
          </span>
        </h2>
        {buckets.untriaged.length > 0 ? (
          renderCollection(buckets.untriaged, "Unprioritised tasks", 3)
        ) : (
          <p className="dh-tasks-section__empty">Nothing here.</p>
        )}
      </section>
    </div>
  );
}

function SectorsView({
  cards,
  renderCollection,
}: {
  readonly cards: readonly TaskCardData[];
  readonly renderCollection: RenderCollection;
}) {
  const groups = groupBySector(cards);
  return (
    <div className="dh-tasks-sectors">
      {SECTOR_SECTIONS.map((section) => {
        const list = groups[section.key] ?? [];
        return (
          <section
            key={section.key}
            className="dh-tasks-sectors__column"
            aria-label={section.label}
          >
            <h2 className="dh-tasks-section__label">
              {section.label}
              <span className="dh-tasks-section__count"> ({list.length})</span>
            </h2>
            {list.length > 0 ? (
              renderCollection(list, `${section.label} tasks`, 3)
            ) : (
              <p className="dh-tasks-section__empty">Nothing here.</p>
            )}
          </section>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Bulk action bar                                                             */
/* -------------------------------------------------------------------------- */

const BULK_PRIORITY_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "", label: "Set priority…" },
  { value: "p1", label: "P1 · Do" },
  { value: "p2", label: "P2 · Defer" },
  { value: "p3", label: "P3 · Delegate" },
  { value: "p4", label: "P4 · Delete / Review" },
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
