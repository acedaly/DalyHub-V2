/**
 * PX-02 — the Application Frame & Collection Layout demonstration route (dev only).
 *
 * A FIXTURE, not a product surface. It proves the PX-02 frame end to end, composed
 * ENTIRELY from the shared parts over DS-01 tokens — no bespoke layout here:
 *   - it renders INSIDE the AppShell (sidebar + pane + user menu + mobile nav), so
 *     the whole frame is exercised together;
 *   - the `CollectionLayout` scaffold with a Pane Header (title, count, view
 *     switcher, one primary action), a DS-07 FilterBar slot, a DS-04 Card
 *     collection, and a bottom-anchored selection bar;
 *   - entity identity (icon + accent) on the pane header and every card;
 *   - the built-in state slots: Loading (Skeletons), Empty (EmptyState) and
 *     Filtered-empty (EmptyState with a clear-filters recovery);
 *   - a card opens the DS-03 Drawer hosting a DS-02 Record Layout.
 *
 * Fixture records are plain in-memory data — NO production repositories, D1 or
 * bindings. The route is excluded from production builds by the `NODE_ENV` guard in
 * `app/routes.ts`, so it never ships.
 */

import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";

import { Card, CardCollection } from "~/shared/card";
import type { CardProps } from "~/shared/card";
import { CollectionLayout } from "~/shared/collection-layout";
import { DrawerProvider, useDrawer, withDrawerPushed } from "~/shared/drawer";
import type { DrawerEntry, DrawerRenderResult } from "~/shared/drawer";
import { EntityIcon } from "~/shared/entity";
import { EmptyState } from "~/shared/empty-state";
import { FilterBar, filterRecords, useFilterUrlState } from "~/shared/filters";
import type { FilterExpression, FilterFieldRegistry } from "~/shared/filters";
import { BoardIcon, GridIcon, ListIcon, PlusIcon } from "~/shared/icons";
import { RecordContent, RecordLayout } from "~/shared/record-layout";

import "~/styles/collection-demo.css";

export function meta() {
  return [{ title: "Collection Layout · DalyHub design fixtures" }];
}

type Presentation = "list" | "board" | "grid";
type Mode = "content" | "loading" | "empty";

interface ProjectRecord {
  readonly id: string;
  readonly title: string;
  readonly status: "active" | "paused" | "done";
  readonly area: string;
  readonly progress: number;
}

const RECORDS: readonly ProjectRecord[] = [
  {
    id: "p1",
    title: "Website relaunch",
    status: "active",
    area: "Career",
    progress: 0.6,
  },
  {
    id: "p2",
    title: "Half-marathon plan",
    status: "active",
    area: "Health",
    progress: 0.35,
  },
  {
    id: "p3",
    title: "Kitchen renovation",
    status: "paused",
    area: "Home",
    progress: 0.2,
  },
  {
    id: "p4",
    title: "Tax return 2026",
    status: "done",
    area: "Finance",
    progress: 1,
  },
  {
    id: "p5",
    title: "Learn woodworking",
    status: "active",
    area: "Home",
    progress: 0.1,
  },
];

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "done", label: "Done" },
] as const;

const FIELDS: FilterFieldRegistry = [
  {
    id: "title",
    label: "Title",
    type: "text",
    accessor: (record) => (record as ProjectRecord).title,
  },
  {
    id: "status",
    label: "Status",
    type: "enum",
    options: STATUS_OPTIONS,
    accessor: (record) => (record as ProjectRecord).status,
  },
];

const STATUS_TONE: Record<ProjectRecord["status"], CardProps["status"]> = {
  active: { label: "Active", tone: "info" },
  paused: { label: "Paused", tone: "warning" },
  done: { label: "Done", tone: "success" },
};

function ViewSwitcher({
  value,
  onChange,
}: {
  readonly value: Presentation;
  readonly onChange: (next: Presentation) => void;
}) {
  const options: { id: Presentation; label: string; Icon: typeof ListIcon }[] =
    [
      { id: "list", label: "List", Icon: ListIcon },
      { id: "board", label: "Board", Icon: BoardIcon },
      { id: "grid", label: "Grid", Icon: GridIcon },
    ];
  return (
    <div className="dh-view-switcher" role="group" aria-label="View">
      {options.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          className="dh-view-switcher__option"
          aria-pressed={value === id}
          onClick={() => onChange(id)}
        >
          <Icon />
          <span className="dh-visually-hidden">{label}</span>
        </button>
      ))}
    </div>
  );
}

function CollectionDemo() {
  const [searchParams] = useSearchParams();
  const { expression, setExpression } = useFilterUrlState(FIELDS);
  const { openDrawer } = useDrawer();

  const [presentation, setPresentation] = useState<Presentation>("list");
  const [mode, setMode] = useState<Mode>("content");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  const source = useMemo<readonly ProjectRecord[]>(
    () => (mode === "empty" ? [] : RECORDS),
    [mode],
  );
  const filtered = useMemo(
    () => filterRecords(FIELDS, expression, source) as ProjectRecord[],
    [expression, source],
  );

  const isLoading = mode === "loading";
  const isEmpty = mode === "empty";
  const isFilteredEmpty = !isEmpty && filtered.length === 0;

  const toggleSelected = (id: string, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toCard = (record: ProjectRecord): CardProps => ({
    id: record.id,
    title: record.title,
    // The pane header is `h1`; cards sit directly under it, so their titles are
    // `h2` (no skipped level — DS-11 heading-order baseline).
    headingLevel: 2,
    typeLabel: "Project",
    icon: <EntityIcon type="project" />,
    accent: "accent",
    status: STATUS_TONE[record.status],
    context: { label: record.area },
    progress: { value: record.progress },
    href: `?${withDrawerPushed(searchParams, `project:${record.id}`).toString()}`,
    onOpen: () => openDrawer(`project:${record.id}`),
    selection: {
      selected: selected.has(record.id),
      onSelectedChange: (on) => toggleSelected(record.id, on),
    },
    presentation,
  });

  return (
    <CollectionLayout
      title="Projects"
      entityType="project"
      subtitle={`${filtered.length} of ${source.length} shown`}
      viewSwitcher={
        <ViewSwitcher value={presentation} onChange={setPresentation} />
      }
      primaryAction={
        <button type="button" className="dh-demo-primary">
          <PlusIcon />
          New project
        </button>
      }
      filterBar={
        <div className="dh-demo-filters">
          <FilterBar
            fields={FIELDS}
            expression={expression}
            onChange={(next: FilterExpression) => setExpression(next)}
            resultCount={filtered.length}
            totalCount={source.length}
          />
          <fieldset className="dh-demo-states">
            <legend>Simulate state</legend>
            {(["content", "loading", "empty"] as Mode[]).map((value) => (
              <label key={value}>
                <input
                  type="radio"
                  name="mode"
                  checked={mode === value}
                  onChange={() => setMode(value)}
                />
                {value}
              </label>
            ))}
          </fieldset>
        </div>
      }
      isLoading={isLoading}
      isEmpty={isEmpty}
      isFilteredEmpty={isFilteredEmpty}
      presentation={presentation}
      emptySlot={
        <EmptyState
          icon={<EntityIcon type="project" size={28} />}
          title="No projects yet"
          description="Projects you create will show up here."
          primaryAction={
            <button type="button" className="dh-demo-primary">
              New project
            </button>
          }
        />
      }
      filteredEmptySlot={
        <EmptyState
          icon={<EntityIcon type="project" size={28} />}
          title="No projects match these filters"
          description="Try removing a filter to see more."
          primaryAction={
            <button
              type="button"
              className="dh-demo-secondary"
              onClick={() => setExpression({ mode: "and", clauses: [] })}
            >
              Clear filters
            </button>
          }
        />
      }
      selection={
        selected.size > 0 ? (
          <div className="dh-demo-bulkbar" role="status">
            <span>{selected.size} selected</span>
            <button
              type="button"
              className="dh-demo-secondary"
              onClick={() => setSelected(new Set())}
            >
              Clear selection
            </button>
          </div>
        ) : undefined
      }
    >
      <CardCollection
        items={filtered}
        getItemId={(record) => record.id}
        renderCard={(record) => <Card {...toCard(record)} />}
        ariaLabel="Projects"
        presentation={presentation}
      />
    </CollectionLayout>
  );
}

function renderDrawer(entry: DrawerEntry): DrawerRenderResult | null {
  const id = entry.key.split(":")[1];
  const record = RECORDS.find((item) => item.id === id);
  if (!record) {
    return null;
  }
  return {
    title: record.title,
    description: "Project record",
    children: (
      <RecordLayout
        title={record.title}
        headingLevel={3}
        typeLabel="Project"
        icon={<EntityIcon type="project" />}
        summary={{
          description: `A demonstration Project in ${record.area}.`,
          metadata: [
            { id: "area", label: "Area", value: record.area },
            { id: "status", label: "Status", value: record.status },
          ],
        }}
      >
        <RecordContent>
          <p>Opened from a Card in the Collection Layout, over the pane.</p>
        </RecordContent>
      </RecordLayout>
    ),
  };
}

export default function DesignCollectionLayoutRoute() {
  return (
    <DrawerProvider renderDrawer={renderDrawer}>
      <CollectionDemo />
    </DrawerProvider>
  );
}
