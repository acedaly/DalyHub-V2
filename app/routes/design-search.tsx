/**
 * DS-08 — the development-only Shared Search demonstration (`/design/search`).
 *
 * Development fixture, EXCLUDED from production by the `NODE_ENV` guard in
 * `app/routes.ts` (the same guard as the DS-02/DS-03/DS-04/DS-05/DS-06 fixtures). It
 * is not a module, establishes no product route or business rule, and ships no
 * domain functionality. It exercises the real `SearchSurface` + controller + model
 * against IN-MEMORY fake providers (via the real `executeSearch` orchestrator run
 * client-side) so every state is demonstrable deterministically: multiple providers
 * and entity types, exact/prefix/fuzzy matches, title + preview highlighting,
 * grouped results, no results, partial and complete provider failure, duplicates,
 * long content, keyboard navigation, and real DS-03 Drawer opening.
 *
 * The real Product Frame Search affordance (the sidebar `/` entry) uses the live
 * `/search` endpoint and the registry-discovered Today provider — this route is
 * evidence only.
 */

import { useRef, useState } from "react";

import { DrawerProvider } from "~/shared/drawer";
import type { DrawerEntry, DrawerRenderResult } from "~/shared/drawer";
import { EntityIcon, isEntityType } from "~/shared/entity";
import type { EntityType } from "~/shared/entity";
import { RecordContent, RecordLayout } from "~/shared/record-layout";
import { workspaceContextFromId } from "~/kernel/workspaces";
import { parseModuleId } from "~/kernel/modules";
import type {
  ModuleRuntimeContext,
  RegisteredSearchProvider,
  SearchResultItem,
} from "~/kernel/modules";
import { SearchSurface } from "~/shared/search";
import type { SearchFn } from "~/shared/search";
import { executeSearch } from "~/shared/search";

import "~/styles/search-demo.css";

export function meta() {
  return [{ title: "Shared Search — DalyHub design fixture" }];
}

/* -------------------------------------------------------------------------- */
/* Demo records + fake providers                                              */
/* -------------------------------------------------------------------------- */

type DemoRecord = {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly entityType: EntityType;
  readonly body: string;
};

const DEMO_RECORDS: readonly DemoRecord[] = [
  {
    id: "task-relaunch",
    title: "Finish the Acme relaunch brief",
    subtitle: "Career · due today",
    entityType: "task",
    body: "The brief that seeds the whole relaunch project.",
  },
  {
    id: "task-review",
    title: "Review the search PR",
    subtitle: "DalyHub V2",
    entityType: "task",
    body: "Registry-driven global search.",
  },
  {
    id: "task-long",
    title:
      "Reconcile the quarterly reconciliation reconciliation spreadsheet with the finance export and file the variance memo before the board review",
    subtitle:
      "Finance · a deliberately very long title to prove truncation and wrapping behave",
    entityType: "task",
    body: "Long title demo.",
  },
  {
    id: "project-relaunch",
    title: "Acme relaunch",
    subtitle: "Career · active · 62%",
    entityType: "project",
    body: "The finite body of work behind the relaunch.",
  },
  {
    id: "project-marathon",
    title: "Half-marathon plan",
    subtitle: "Health · active · 35%",
    entityType: "project",
    body: "12-week training block.",
  },
  {
    id: "note-standup",
    title: "Standup notes",
    subtitle: "Ship the frame, then start search. Keep it calm.",
    entityType: "note",
    body: "A longer preview so highlighting can span the subtitle line and still ellipsize gracefully at the edge of the panel.",
  },
  {
    id: "note-ideas",
    title: "Product ideas",
    subtitle: "A single calm surface for a whole life.",
    entityType: "note",
    body: "Ideas.",
  },
  {
    id: "meeting-standup",
    title: "Design standup",
    subtitle: "09:00 · with the product group",
    entityType: "meeting",
    body: "Daily sync.",
  },
  {
    id: "person-sam",
    title: "Sam Rivera",
    subtitle: "1:1 partner · Career",
    entityType: "person",
    body: "Recurring 1:1.",
  },
];

function toResult(record: DemoRecord): SearchResultItem {
  return {
    id: record.id,
    title: record.title,
    subtitle: record.subtitle,
    entityType: record.entityType,
    target: {
      kind: "drawer",
      drawerKey: `demo:${record.id}`,
      canonicalPath: "/design/search",
    },
  };
}

function providerFor(
  moduleId: string,
  label: string,
  entityType: EntityType,
  extra: readonly SearchResultItem[] = [],
): RegisteredSearchProvider {
  const items = [
    ...DEMO_RECORDS.filter((r) => r.entityType === entityType).map(toResult),
    ...extra,
  ];
  return {
    id: `${moduleId}.search`,
    moduleId: parseModuleId(moduleId),
    label,
    entityTypes: [entityType],
    search: async (query) => {
      const q = query.text.toLowerCase();
      return items
        .filter(
          (item) =>
            item.title.toLowerCase().includes(q) ||
            (item.subtitle?.toLowerCase().includes(q) ?? false) ||
            // subsequence fallback so "fnsh" still finds "Finish".
            isSubsequence(q, item.title.toLowerCase()),
        )
        .slice(0, query.limit);
    },
  };
}

function isSubsequence(query: string, text: string): boolean {
  let i = 0;
  for (const ch of text) {
    if (ch === query[i]) i += 1;
    if (i === query.length) return true;
  }
  return query.length === 0;
}

const failingProvider: RegisteredSearchProvider = {
  id: "calendar.search",
  moduleId: parseModuleId("calendar"),
  label: "Calendar",
  search: async () => {
    throw new Error("simulated provider failure (never shown to the user)");
  },
};

type Scenario = "healthy" | "partial" | "error" | "stale";

/**
 * A provider whose results resolve instantly EXCEPT for a query containing
 * `hold`, which never resolves — a controlled route delay used to demonstrate
 * (and e2e-test) the stale-selection contract deterministically, without sleeps.
 */
function holdableProvider(
  moduleId: string,
  label: string,
  entityType: EntityType,
): RegisteredSearchProvider {
  const base = providerFor(moduleId, label, entityType);
  return {
    ...base,
    search: async (query, context) => {
      if (query.text.toLowerCase().includes("hold")) {
        return new Promise<readonly SearchResultItem[]>(() => {});
      }
      return base.search(query, context);
    },
  };
}

function providersFor(scenario: Scenario): readonly RegisteredSearchProvider[] {
  // The tasks provider returns one duplicate id to prove deduplication.
  const tasks = providerFor("tasks", "Tasks", "task", [
    toResult(DEMO_RECORDS[0]),
  ]);
  const healthy = [
    tasks,
    providerFor("projects", "Projects", "project"),
    providerFor("notes", "Notes", "note"),
    providerFor("meetings", "Meetings", "meeting"),
    providerFor("people", "People", "person"),
  ];
  if (scenario === "healthy") return healthy;
  if (scenario === "partial") return [...healthy, failingProvider];
  if (scenario === "stale") {
    return [
      holdableProvider("tasks", "Tasks", "task"),
      holdableProvider("projects", "Projects", "project"),
    ];
  }
  return [
    failingProvider,
    { ...failingProvider, id: "b.search", moduleId: parseModuleId("b") },
  ];
}

const DEMO_CONTEXT: ModuleRuntimeContext = {
  workspace: workspaceContextFromId("design-demo-workspace"),
};

function makeSearch(scenario: Scenario): SearchFn {
  const providers = providersFor(scenario);
  // A large timeout for the stale demo so the "hold" query stays loading (the
  // per-provider deadline never fires during the demonstration).
  const timeoutMs = scenario === "stale" ? 60_000 : undefined;
  return async (query) =>
    executeSearch({
      providers,
      context: DEMO_CONTEXT,
      rawQuery: query,
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
    });
}

/* -------------------------------------------------------------------------- */
/* Demo drawer                                                                */
/* -------------------------------------------------------------------------- */

function renderDemoDrawer(entry: DrawerEntry): DrawerRenderResult | null {
  const id = entry.key.startsWith("demo:")
    ? entry.key.slice("demo:".length)
    : "";
  const record = DEMO_RECORDS.find((r) => r.id === id);
  if (record === undefined) {
    return null;
  }
  return {
    title: record.title,
    description: `${record.entityType} record`,
    children: (
      <RecordLayout
        title={record.title}
        headingLevel={3}
        typeLabel={record.entityType}
        icon={
          isEntityType(record.entityType) ? (
            <EntityIcon type={record.entityType} />
          ) : undefined
        }
        summary={{ description: record.subtitle }}
      >
        <RecordContent>
          <p>{record.body}</p>
          <p>
            Opened from Shared Search through the real DS-03 Drawer — the
            underlying route and its state are preserved.
          </p>
        </RecordContent>
      </RecordLayout>
    ),
  };
}

/* -------------------------------------------------------------------------- */
/* Route                                                                      */
/* -------------------------------------------------------------------------- */

export default function DesignSearchRoute() {
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  const open =
    (next: Scenario) => (event: React.MouseEvent<HTMLButtonElement>) => {
      openerRef.current = event.currentTarget;
      setScenario(next);
    };

  return (
    <DrawerProvider renderDrawer={renderDemoDrawer}>
      <div className="dh-design-search">
        <h1>Shared Search</h1>
        <p>
          The DS-08 global Search surface, driven by in-memory fake providers
          through the real orchestrator and model. Try queries like{" "}
          <code>relaunch</code> (exact/prefix), <code>fnsh</code> (fuzzy), or a
          nonsense string (no results). Use ↑/↓, Home/End, Enter and Escape.
        </p>
        <div className="dh-design-search__actions">
          <button type="button" onClick={open("healthy")}>
            Open Search (multi-provider)
          </button>
          <button type="button" onClick={open("partial")}>
            Open Search (partial failure)
          </button>
          <button type="button" onClick={open("error")}>
            Open Search (complete failure)
          </button>
          <button type="button" onClick={open("stale")}>
            Open Search (stale-selection demo)
          </button>
        </div>
        <p className="dh-design-search__hint">
          In the stale-selection demo, a query containing <code>hold</code>{" "}
          never resolves — showing that the previous results stay visible but
          become non-actionable while a new query loads.
        </p>
        <p className="dh-design-search__hint">
          The real Product Frame Search (sidebar <kbd>/</kbd>) uses the live{" "}
          <code>/search</code> endpoint and the registry-discovered Today
          provider.
        </p>
      </div>

      {scenario !== null ? (
        <SearchSurface
          search={makeSearch(scenario)}
          opener={openerRef.current}
          onClose={() => setScenario(null)}
        />
      ) : null}
    </DrawerProvider>
  );
}
