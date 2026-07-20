/**
 * DS-04 + DS-07 — the Shared Cards & Filters demonstration route (development only).
 *
 * A FIXTURE, not a product surface. It proves the ONE shared Card and the ONE
 * shared Filter system end to end, composed ENTIRELY from the shared Card, Filter,
 * Drawer and Record Layout components over DS-01 tokens — no bespoke card or filter
 * logic here:
 *   - the same Card renders Areas, Goals, Projects, Tasks and People;
 *   - comfortable/compact density and list/board/grid presentation;
 *   - selection, multi-selection and quick actions that never open the card;
 *   - pointer + keyboard reordering that emits intent (no data mutation);
 *   - URL-backed filters (status/type/text/progress/date), AND/OR, chips,
 *     edit/remove/clear, saved views with a modified indicator;
 *   - a card opens the DS-03 Drawer hosting the real DS-02 Record Layout, with
 *     filter parameters preserved while the Drawer is open and collection
 *     state/scroll preserved across open/close;
 *   - filtered-empty vs genuinely-empty states.
 *
 * The `<type>:<id>` key shape is this fixture's convention; the Drawer treats keys
 * as opaque. Fixture records are plain in-memory data — NO production repositories,
 * D1 or bindings. The route is excluded from production builds by the `NODE_ENV`
 * guard in `app/routes.ts`, so it never ships.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";

import {
  Card,
  CardCollection,
  CardReorderHandle,
  ReorderableCardCollection,
} from "~/shared/card";
import type { CardProps, CardTone } from "~/shared/card";
import { withDrawerPushed } from "~/shared/drawer";
import { DrawerProvider, useDrawer } from "~/shared/drawer";
import type { DrawerEntry, DrawerRenderResult } from "~/shared/drawer";
import {
  FilterBar,
  FilterEmptyState,
  filterRecords,
  useFilterUrlState,
} from "~/shared/filters";
import type {
  FilterExpression,
  FilterFieldRegistry,
  SavedView,
} from "~/shared/filters";
import { RecordContent, RecordLayout } from "~/shared/record-layout";

import "~/styles/cards-filters-demo.css";

export function meta() {
  return [{ title: "Cards & Filters · DalyHub design fixtures" }];
}

/* -------------------------------------------------------------------------- */
/* Fixture records (several entity types; plain data only)                     */
/* -------------------------------------------------------------------------- */

type EntityType = "area" | "goal" | "project" | "task" | "person";

interface FixtureRecord {
  readonly id: string;
  readonly type: EntityType;
  readonly typeLabel: string;
  readonly accent: CardTone;
  readonly title: string;
  readonly description?: string;
  readonly status: string;
  readonly statusLabel: string;
  readonly statusTone: CardTone;
  readonly progress?: number; // 0–100, or undefined where progress is meaningless
  readonly due?: string; // ISO calendar date, or undefined (no due date)
  readonly context?: string;
  readonly tags: readonly string[];
  readonly starred: boolean;
}

const RECORDS: readonly FixtureRecord[] = [
  {
    id: "area:health",
    type: "area",
    typeLabel: "Area",
    accent: "info",
    title: "Health",
    description: "An ongoing domain of life — no end date.",
    status: "active",
    statusLabel: "Active",
    statusTone: "info",
    tags: ["health"],
    starred: false,
  },
  {
    id: "goal:half-marathon",
    type: "goal",
    typeLabel: "Goal",
    accent: "success",
    title: "Run a half-marathon",
    description: "A desired outcome with a definition of success.",
    status: "on-track",
    statusLabel: "On track",
    statusTone: "success",
    progress: 62,
    due: "2026-10-04",
    context: "Health",
    tags: ["health", "focus"],
    starred: true,
  },
  {
    id: "goal:grow-studio",
    type: "goal",
    typeLabel: "Goal",
    accent: "warning",
    title: "Grow the studio",
    status: "at-risk",
    statusLabel: "At risk",
    statusTone: "warning",
    progress: 28,
    due: "2026-12-31",
    context: "Career",
    tags: ["focus"],
    starred: false,
  },
  {
    id: "project:website-relaunch",
    type: "project",
    typeLabel: "Project",
    accent: "accent",
    title: "Website relaunch",
    description: "A finite body of work with a definite end.",
    status: "in-progress",
    statusLabel: "In progress",
    statusTone: "accent",
    progress: 33,
    due: "2026-09-30",
    context: "Grow the studio",
    tags: ["launch", "writing"],
    starred: true,
  },
  {
    id: "project:training-plan",
    type: "project",
    typeLabel: "Project",
    accent: "success",
    title: "12-week training plan",
    status: "done",
    statusLabel: "Done",
    statusTone: "success",
    progress: 100,
    due: "2026-07-01",
    context: "Run a half-marathon",
    tags: ["health"],
    starred: false,
  },
  {
    id: "task:easy-run",
    type: "task",
    typeLabel: "Task",
    accent: "neutral",
    title: "Monday: 5km easy run",
    status: "todo",
    statusLabel: "To do",
    statusTone: "neutral",
    due: "2026-07-18",
    context: "12-week training plan",
    tags: ["health"],
    starred: false,
  },
  {
    id: "task:nav-contrast",
    type: "task",
    typeLabel: "Task",
    accent: "accent",
    title: "Fix navigation contrast",
    status: "in-progress",
    statusLabel: "In progress",
    statusTone: "accent",
    due: "2026-07-20",
    context: "Website relaunch",
    tags: ["urgent", "launch"],
    starred: true,
  },
  {
    id: "task:launch-post",
    type: "task",
    typeLabel: "Task",
    accent: "info",
    title: "Publish launch post",
    status: "waiting",
    statusLabel: "Waiting",
    statusTone: "info",
    context: "Website relaunch",
    tags: ["launch", "writing"],
    starred: false,
  },
  {
    id: "task:archive-old",
    type: "task",
    typeLabel: "Task",
    accent: "success",
    title: "Archive last year's assets",
    status: "done",
    statusLabel: "Done",
    statusTone: "success",
    due: "2026-06-30",
    context: "Website relaunch",
    tags: [],
    starred: false,
  },
  {
    id: "person:dana-lee",
    type: "person",
    typeLabel: "Person",
    accent: "neutral",
    title: "Dana Lee",
    description: "Someone linked across your projects and goals.",
    status: "linked",
    statusLabel: "Linked",
    statusTone: "neutral",
    context: "Career",
    tags: ["focus"],
    starred: false,
  },
  {
    id: "person:sam-rivers",
    type: "person",
    typeLabel: "Person",
    accent: "neutral",
    title: "Sam Rivers",
    status: "linked",
    statusLabel: "Linked",
    statusTone: "neutral",
    tags: [],
    starred: false,
  },
  {
    id: "task:unicode",
    type: "task",
    typeLabel: "Task",
    accent: "warning",
    title:
      "Review très-long título with Ünicode, emoji 🚀 and a supercalifragilisticexpialidocious word",
    description:
      "A deliberately long, Unicode-heavy record to prove wrapping and no horizontal overflow.",
    status: "todo",
    statusLabel: "To do",
    statusTone: "neutral",
    due: "2026-08-15",
    context: "Website relaunch",
    tags: ["writing", "urgent"],
    starred: false,
  },
];

const RECORDS_BY_ID = new Map(RECORDS.map((record) => [record.id, record]));

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "on-track", label: "On track" },
  { value: "at-risk", label: "At risk" },
  { value: "in-progress", label: "In progress" },
  { value: "todo", label: "To do" },
  { value: "waiting", label: "Waiting" },
  { value: "done", label: "Done" },
  { value: "linked", label: "Linked" },
];

const TYPE_OPTIONS = [
  { value: "area", label: "Area" },
  { value: "goal", label: "Goal" },
  { value: "project", label: "Project" },
  { value: "task", label: "Task" },
  { value: "person", label: "Person" },
];

const TAG_OPTIONS = [
  { value: "health", label: "Health" },
  { value: "focus", label: "Focus" },
  { value: "launch", label: "Launch" },
  { value: "writing", label: "Writing" },
  { value: "urgent", label: "Urgent" },
];

/** The typed filter field registry a module would register. */
const FIELDS: FilterFieldRegistry = [
  {
    id: "title",
    label: "Title",
    type: "text",
    accessor: (record) => (record as FixtureRecord).title,
  },
  {
    id: "type",
    label: "Type",
    type: "enum",
    options: TYPE_OPTIONS,
    accessor: (record) => (record as FixtureRecord).type,
  },
  {
    id: "status",
    label: "Status",
    type: "enum",
    options: STATUS_OPTIONS,
    accessor: (record) => (record as FixtureRecord).status,
  },
  {
    id: "progress",
    label: "Progress",
    type: "number",
    accessor: (record) => (record as FixtureRecord).progress,
    formatValue: (value) =>
      typeof value === "object" && value !== null && "from" in value
        ? `${value.from}% – ${value.to}%`
        : `${value}%`,
  },
  {
    id: "due",
    label: "Due date",
    type: "date",
    accessor: (record) => (record as FixtureRecord).due,
  },
  {
    id: "tags",
    label: "Tags",
    type: "multi-enum",
    options: TAG_OPTIONS,
    allowMultipleClauses: true,
    accessor: (record) => (record as FixtureRecord).tags,
  },
  {
    id: "starred",
    label: "Starred",
    type: "boolean",
    accessor: (record) => (record as FixtureRecord).starred,
  },
];

/** A seeded saved view, and one that references an obsolete field (graceful). */
const SEED_VIEWS: readonly SavedView[] = [
  {
    id: "view-open-tasks",
    name: "Open tasks",
    expression: {
      mode: "and",
      clauses: [
        { id: "v0", field: "type", operator: "is", value: "task" },
        { id: "v1", field: "status", operator: "is_not", value: "done" },
      ],
    },
  },
  {
    id: "view-legacy",
    name: "Legacy (obsolete field)",
    expression: {
      mode: "and",
      clauses: [
        { id: "v0", field: "obsolete-field", operator: "is", value: "x" },
      ],
    },
  },
];

/* -------------------------------------------------------------------------- */
/* Card mapping — ONE Card configured for every entity type                    */
/* -------------------------------------------------------------------------- */

function Glyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" role="presentation">
      <rect x="2" y="2" width="12" height="12" rx="3" fill="currentColor" />
    </svg>
  );
}

/** Apply a reorder of the currently displayed ids back onto the master order. */
function applyDisplayedOrder(
  master: readonly string[],
  displayed: readonly string[],
  nextDisplayed: readonly string[],
): string[] {
  const displayedSet = new Set(displayed);
  let cursor = 0;
  return master.map((id) =>
    displayedSet.has(id) ? nextDisplayed[cursor++] : id,
  );
}

/* -------------------------------------------------------------------------- */
/* The collection surface                                                      */
/* -------------------------------------------------------------------------- */

type Density = "comfortable" | "compact";
type Presentation = "list" | "board" | "grid";

function CollectionSurface() {
  const [searchParams] = useSearchParams();
  const { expression, setExpression } = useFilterUrlState(FIELDS);
  const { openDrawer } = useDrawer();

  const [density, setDensity] = useState<Density>("comfortable");
  const [presentation, setPresentation] = useState<Presentation>("list");
  const [orderedIds, setOrderedIds] = useState<string[]>(() =>
    RECORDS.map((record) => record.id),
  );
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [simulateEmpty, setSimulateEmpty] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  // Saved views held in memory (DS-07 does not persist).
  const [views, setViews] = useState<readonly SavedView[]>(SEED_VIEWS);
  const [activeViewId, setActiveViewId] = useState<string | undefined>(
    undefined,
  );

  const orderedRecords = useMemo(
    () =>
      simulateEmpty
        ? []
        : orderedIds
            .map((id) => RECORDS_BY_ID.get(id))
            .filter((record): record is FixtureRecord => record !== undefined),
    [orderedIds, simulateEmpty],
  );

  const filtered = useMemo(
    () => filterRecords(FIELDS, expression, orderedRecords),
    [expression, orderedRecords],
  );

  const drawerHref = useCallback(
    (key: string) => {
      const next = withDrawerPushed(new URLSearchParams(searchParams), key);
      const qs = next.toString();
      return qs.length > 0 ? `?${qs}` : "?";
    },
    [searchParams],
  );

  const toggleSelected = useCallback((id: string, next: boolean) => {
    setSelected((prev) => {
      const updated = new Set(prev);
      if (next) {
        updated.add(id);
      } else {
        updated.delete(id);
      }
      return updated;
    });
  }, []);

  const toCardProps = useCallback(
    (record: FixtureRecord): CardProps => ({
      id: record.id,
      typeLabel: record.typeLabel,
      icon: <Glyph />,
      accent: record.accent,
      title: record.title,
      subtitle: record.description,
      status: { label: record.statusLabel, tone: record.statusTone },
      progress:
        record.progress !== undefined
          ? { value: record.progress, max: 100 }
          : undefined,
      context: record.context ? { label: record.context } : undefined,
      dateLabel: record.due ? { label: `Due ${record.due}` } : undefined,
      metadata: [
        { id: "type", label: "Type", value: record.typeLabel },
        ...(record.tags.length > 0
          ? [{ id: "tags", label: "Tags", value: record.tags.join(", ") }]
          : []),
      ],
      selection: {
        selected: selected.has(record.id),
        onSelectedChange: (next) => toggleSelected(record.id, next),
      },
      quickActions: [
        {
          id: "complete",
          label: "Complete",
          shortcut: "C",
          onSelect: () =>
            setActionMessage(`Marked "${record.title}" complete.`),
        },
        {
          id: "snooze",
          label: "Snooze",
          onSelect: () => setActionMessage(`Snoozed "${record.title}".`),
        },
        {
          id: "archive",
          label: "Archive",
          disabled: true,
          onSelect: () => setActionMessage("This should never fire."),
        },
      ],
      overflowAction: {
        id: "more",
        label: "More actions",
        onSelect: () => setActionMessage(`More actions for "${record.title}".`),
      },
      href: drawerHref(record.id),
      onOpen: () => openDrawer(record.id),
      density,
      presentation,
    }),
    [density, presentation, selected, toggleSelected, drawerHref, openDrawer],
  );

  const clearFilters = () => setExpression({ mode: "and", clauses: [] });

  const savedViewAdapter = {
    views,
    activeViewId,
    onSelect: (viewId: string | null) => {
      setActiveViewId(viewId ?? undefined);
      if (viewId) {
        const view = views.find((item) => item.id === viewId);
        if (view) {
          setExpression(view.expression);
        }
      }
    },
    onSaveRequested: (name: string) => {
      const id = `view-${name.toLowerCase().replace(/\s+/g, "-")}-${views.length}`;
      const view: SavedView = { id, name, expression };
      setViews((prev) => [...prev, view]);
      setActiveViewId(id);
    },
    onUpdateRequested: (viewId: string) => {
      setViews((prev) =>
        prev.map((view) =>
          view.id === viewId ? { ...view, expression } : view,
        ),
      );
    },
    onDeleteRequested: (viewId: string) => {
      setViews((prev) => prev.filter((view) => view.id !== viewId));
      setActiveViewId((current) => (current === viewId ? undefined : current));
    },
  };

  const selectedCount = selected.size;

  return (
    <div className="cf-demo" data-hydrated={hydrated ? "true" : "false"}>
      <header className="cf-demo__header">
        <h1>Cards &amp; Filters</h1>
        <p className="cf-demo__lead">
          Development fixture for DS-04 (Shared Cards) and DS-07 (Shared
          Filters). One Card renders every entity type; one Filter system drives
          the collection. Selecting a card opens the DS-03 Drawer with the DS-02
          Record Layout, preserving your filters.
        </p>
      </header>

      {/* View controls */}
      <div className="cf-demo__controls" aria-label="Collection controls">
        <fieldset className="cf-demo__group">
          <legend>Density</legend>
          {(["comfortable", "compact"] as const).map((value) => (
            <label key={value}>
              <input
                type="radio"
                name="density"
                checked={density === value}
                onChange={() => setDensity(value)}
              />
              {value}
            </label>
          ))}
        </fieldset>

        <fieldset className="cf-demo__group">
          <legend>Presentation</legend>
          {(["list", "board", "grid"] as const).map((value) => (
            <label key={value}>
              <input
                type="radio"
                name="presentation"
                checked={presentation === value}
                onChange={() => setPresentation(value)}
              />
              {value}
            </label>
          ))}
        </fieldset>

        <div className="cf-demo__group">
          <button
            type="button"
            className="dh-filter-btn dh-filter-btn--ghost"
            onClick={() =>
              setSelected(new Set(filtered.map((record) => record.id)))
            }
          >
            Select all shown
          </button>
          <button
            type="button"
            className="dh-filter-btn dh-filter-btn--ghost"
            onClick={() => setSelected(new Set())}
          >
            Clear selection
          </button>
          <span className="cf-demo__selected" role="status" aria-live="polite">
            {selectedCount} selected
          </span>
        </div>

        <label className="cf-demo__group">
          <input
            type="checkbox"
            checked={simulateEmpty}
            onChange={(event) => setSimulateEmpty(event.target.checked)}
          />
          Simulate empty collection
        </label>
      </div>

      <FilterBar
        fields={FIELDS}
        expression={expression}
        onChange={(next: FilterExpression) => setExpression(next)}
        resultCount={filtered.length}
        totalCount={orderedRecords.length}
        savedViews={savedViewAdapter}
      />

      <p className="cf-demo__action-log" role="status" aria-live="polite">
        {actionMessage}
      </p>

      {/* The collection */}
      <div className="cf-demo__collection">
        {orderedRecords.length === 0 ? (
          <FilterEmptyState
            variant="empty"
            title="No records yet"
            description="This collection is genuinely empty — nothing has been added."
          />
        ) : filtered.length === 0 ? (
          <FilterEmptyState
            variant="filtered"
            title="No records match your filters"
            description="Try removing a filter to see more."
            onClearFilters={clearFilters}
          />
        ) : presentation === "board" ? (
          <BoardView
            records={filtered}
            density={density}
            toCardProps={toCardProps}
          />
        ) : presentation === "grid" ? (
          <CardCollection
            items={filtered}
            getItemId={(record) => record.id}
            ariaLabel="Records"
            presentation="grid"
            density={density}
            renderCard={(record) => (
              <Card {...toCardProps(record)} headingLevel={2} />
            )}
          />
        ) : (
          <ReorderableCardCollection
            items={filtered}
            getItemId={(record) => record.id}
            getItemLabel={(record) => record.title}
            isReorderable={(record) => record.type !== "area"}
            ariaLabel="Records (reorderable)"
            density={density}
            onReorder={(nextIds) =>
              setOrderedIds((master) =>
                applyDisplayedOrder(
                  master,
                  filtered.map((record) => record.id),
                  nextIds,
                ),
              )
            }
            renderItem={(record, { handleProps }) => (
              <Card
                {...toCardProps(record)}
                headingLevel={2}
                reorderHandle={<CardReorderHandle {...handleProps} />}
              />
            )}
          />
        )}
      </div>

      <div className="cf-demo__filler" aria-hidden="true">
        {Array.from({ length: 20 }, (_, index) => (
          <p key={index}>
            Spacer paragraph {index + 1}: scroll down, open a card, close it —
            your scroll position and filters are preserved.
          </p>
        ))}
      </div>
      <div data-testid="page-bottom">End of fixture.</div>
    </div>
  );
}

function BoardView({
  records,
  density,
  toCardProps,
}: {
  records: readonly FixtureRecord[];
  density: Density;
  toCardProps: (record: FixtureRecord) => CardProps;
}) {
  const columns = TYPE_OPTIONS.map((option) => ({
    ...option,
    records: records.filter((record) => record.type === option.value),
  })).filter((column) => column.records.length > 0);

  return (
    <div className="cf-demo__board">
      {columns.map((column) => (
        <section
          key={column.value}
          className="cf-demo__board-column"
          aria-label={`${column.label} column`}
        >
          <h2 className="cf-demo__board-heading">{column.label}</h2>
          <CardCollection
            items={column.records}
            getItemId={(record) => record.id}
            ariaLabel={`${column.label} records`}
            presentation="board"
            density={density}
            renderCard={(record) => (
              <Card {...toCardProps(record)} presentation="board" />
            )}
          />
        </section>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Drawer bodies — the real DS-02 Record Layout                                */
/* -------------------------------------------------------------------------- */

function RecordDrawerBody({ record }: { record: FixtureRecord }) {
  return (
    <RecordLayout
      typeLabel={record.typeLabel}
      icon={<Glyph />}
      title={record.title}
      headingLevel={3}
      status={{ label: record.statusLabel, tone: record.statusTone }}
      breadcrumb={
        record.context
          ? [
              { id: "parent", label: record.context, href: "#parent" },
              { id: "self", label: record.title },
            ]
          : undefined
      }
      metadata={[
        { id: "type", label: "Type", value: record.typeLabel },
        ...(record.due ? [{ id: "due", label: "Due", value: record.due }] : []),
        ...(record.progress !== undefined
          ? [
              {
                id: "progress",
                label: "Progress",
                value: `${record.progress}%`,
              },
            ]
          : []),
      ]}
      summary={{
        description:
          record.description ??
          "Opened in the shared Drawer over your filtered collection.",
        metadata: record.tags.length
          ? [{ id: "tags", label: "Tags", value: record.tags.join(", ") }]
          : undefined,
      }}
    >
      <RecordContent label={`${record.typeLabel} overview`}>
        <p className="cf-demo__drawer-prose">
          This is the same shared Card&apos;s record, opened in the DS-03
          Drawer. Your active filters remain in the URL while this is open;
          close it and the filtered collection and scroll position are exactly
          as you left them.
        </p>
      </RecordContent>
    </RecordLayout>
  );
}

/* -------------------------------------------------------------------------- */
/* Route                                                                       */
/* -------------------------------------------------------------------------- */

export default function DesignCardsFiltersRoute() {
  const renderDrawer = useCallback(
    (entry: DrawerEntry): DrawerRenderResult | null => {
      const record = RECORDS_BY_ID.get(entry.key);
      if (!record) {
        return null;
      }
      return {
        title: record.title,
        description: `${record.typeLabel} record, opened over your filtered collection.`,
        children: <RecordDrawerBody record={record} />,
      };
    },
    [],
  );

  return (
    <DrawerProvider renderDrawer={renderDrawer}>
      <CollectionSurface />
    </DrawerProvider>
  );
}
