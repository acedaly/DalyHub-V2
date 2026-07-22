/**
 * PROJ-01 — the Projects collection view (presentation, no server imports).
 *
 * Split from the route so it can be unit-tested without the `cloudflare:workers`
 * loader (mirroring TodayDashboard). Composed ENTIRELY from the shared frame — the
 * PX-02 CollectionLayout, the ONE DS-04 Card, the shared EmptyState, the DS-03 Drawer
 * (hosting the DS-06 create form) and a restrained state segment. Each Card opens its
 * project overview through NORMAL client navigation (a real link + SPA open), never
 * an inaccessible clickable container.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFetcher, useNavigate } from "react-router";

import { Card, CardCollection } from "~/shared/card";
import type { CardMetaItem, CardProps } from "~/shared/card";
import { CollectionLayout } from "~/shared/collection-layout";
import {
  DrawerProvider,
  DrawerTrigger,
  useDrawer,
  type DrawerEntry,
  type DrawerRenderResult,
} from "~/shared/drawer";
import { EntityIcon } from "~/shared/entity";
import { EmptyState } from "~/shared/empty-state";
import { LoadMore } from "~/shared/load-more";
import type { SelectOption } from "~/shared/forms/types";
import { HealthIndicator } from "~/shared/project-health";

import { NewProjectForm } from "./NewProjectForm";
import { SegmentedFilter } from "./SegmentedFilter";
import {
  toProjectCardData,
  type ProjectCardData,
  type SerializedProjectListItem,
} from "./project-view";

export type ProjectState = "open" | "completed" | "all";

/** The drawer key hosting the create form. */
const NEW_PROJECT_KEY = "new-project";

const STATE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "completed", label: "Completed" },
] as const;

export interface ProjectsCollectionViewProps {
  readonly projects: readonly SerializedProjectListItem[];
  /** Opaque cursor for the next page from the loader, or null when exhausted. */
  readonly nextCursor: string | null;
  readonly parentOptions: readonly SelectOption[];
  readonly state: ProjectState;
  readonly failed: boolean;
}

/**
 * The subset of the collection loader's payload a "Load more" fetch reads back:
 * the next page of projects and the following cursor (plus the calm failure flag).
 */
type ProjectsPageData = {
  readonly projects: readonly SerializedProjectListItem[];
  readonly nextCursor: string | null;
  readonly failed: boolean;
};

export function ProjectsCollectionView({
  projects,
  nextCursor,
  parentOptions,
  state,
  failed,
}: ProjectsCollectionViewProps) {
  const navigate = useNavigate();

  const renderDrawer = useMemo(() => {
    return function render(entry: DrawerEntry): DrawerRenderResult | null {
      if (entry.key !== NEW_PROJECT_KEY) {
        return null;
      }
      return {
        title: "New project",
        description: "Create a project under an Area or a Goal.",
        children: <NewProjectFormHost parentOptions={parentOptions} />,
      };
    };
  }, [parentOptions]);

  return (
    <DrawerProvider renderDrawer={renderDrawer}>
      <ProjectsCollection
        projects={projects}
        nextCursor={nextCursor}
        state={state}
        failed={failed}
        onOpenProject={(id) => navigate(`/projects/${encodeURIComponent(id)}`)}
      />
    </DrawerProvider>
  );
}

/** The create-form host: closes the Drawer and navigates to the new project. */
function NewProjectFormHost({
  parentOptions,
}: {
  readonly parentOptions: readonly SelectOption[];
}) {
  const navigate = useNavigate();
  const { closeDrawer } = useDrawer();
  return (
    <NewProjectForm
      parentOptions={parentOptions}
      onCreated={(projectId) =>
        navigate(`/projects/${encodeURIComponent(projectId)}`)
      }
      onCancel={closeDrawer}
    />
  );
}

function toCardProps(
  card: ProjectCardData,
  onOpenProject: (id: string) => void,
): CardProps {
  const metadata: CardMetaItem[] = [];
  // The derived health signal (PROJ-02): a restrained toned pill + the primary
  // reason as accessible text. It is a distinct axis from the open/completed
  // `status` pill, so both coexist without a second card component. Shown ONLY
  // for genuinely active work (PROJ-05 §8 / ADR-037) — a Planned, On-hold,
  // Completed or Archived project never shows an active-work health warning.
  if (card.healthVisible) {
    metadata.push({
      id: "health",
      label: "Health",
      value: <HealthIndicator health={card.health} showReason />,
    });
  }
  if (card.goalLabel) {
    metadata.push({ id: "goal", label: "Goal", value: card.goalLabel });
  }
  if (!card.progress.has) {
    metadata.push({ id: "tasks", label: "Tasks", value: "No tasks yet" });
  }
  if (card.updatedLabel) {
    metadata.push({
      id: "updated",
      label: "Updated",
      value: card.updatedLabel,
    });
  }

  return {
    id: card.id,
    title: card.title,
    typeLabel: "Project",
    icon: <EntityIcon type="project" />,
    headingLevel: 2,
    status: card.state,
    context: card.areaLabel ? { label: card.areaLabel } : undefined,
    metadata,
    progress: card.progress.has
      ? {
          value: card.progress.completed,
          max: card.progress.total,
          label: card.progress.summary,
        }
      : undefined,
    density: "comfortable",
    presentation: "list",
    href: `/projects/${encodeURIComponent(card.id)}`,
    onOpen: () => onOpenProject(card.id),
    openAriaLabel: `Open ${card.title}`,
  };
}

/**
 * Accumulate keyset pages behind a "Load more" affordance WITHOUT navigating (so a
 * `?drawer=` param and scroll position survive). The loader's first page seeds the
 * list; each "Load more" runs the SAME loader through a fetcher with the next
 * `cursor`, and the returned rows are appended. Changing the state filter (or any
 * loader re-run — reload, Back/Forward, a mutation's revalidation) hands down a
 * fresh first page and cursor, which RESETS the accumulation so nothing stale or
 * cross-filter lingers. Duplicate ids are collapsed defensively so a card can never
 * render twice even if a page boundary overlaps.
 */
function useProjectPagination(
  firstPage: readonly SerializedProjectListItem[],
  initialCursor: string | null,
  state: ProjectState,
) {
  const fetcher = useFetcher<ProjectsPageData>();
  const [appended, setAppended] = useState<SerializedProjectListItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loadFailed, setLoadFailed] = useState(false);
  const processed = useRef<ProjectsPageData | null>(null);

  // Reset the accumulation when the QUERY that defines the result set changes — the
  // state filter or the first page's cursor. Keying on those (not the base array's
  // identity) means a filter change or reload resets predictably, while an unrelated
  // loader re-run — e.g. opening the new-project Drawer, which only adds a URL param
  // — keeps the already-loaded pages instead of snapping back to page one.
  useEffect(() => {
    setAppended([]);
    setCursor(initialCursor);
    setLoadFailed(false);
    processed.current = null;
  }, [initialCursor, state]);

  // Fold each fetched page into the accumulation exactly once.
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) {
      return;
    }
    const data = fetcher.data;
    if (processed.current === data) {
      return;
    }
    processed.current = data;
    if (data.failed) {
      setLoadFailed(true);
      return;
    }
    setAppended((prev) => [...prev, ...data.projects]);
    setCursor(data.nextCursor);
    setLoadFailed(false);
  }, [fetcher.state, fetcher.data]);

  const loadMore = useCallback(() => {
    if (cursor === null) {
      return;
    }
    setLoadFailed(false);
    fetcher.load(
      `/projects?state=${encodeURIComponent(state)}&cursor=${encodeURIComponent(cursor)}`,
    );
  }, [cursor, fetcher, state]);

  // De-duplicate defensively: the base page and any appended pages are merged in
  // order, first occurrence wins, so an overlapping boundary never doubles a card.
  const items = useMemo(() => {
    const seen = new Set<string>();
    const out: SerializedProjectListItem[] = [];
    for (const project of [...firstPage, ...appended]) {
      if (seen.has(project.id)) {
        continue;
      }
      seen.add(project.id);
      out.push(project);
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

function ProjectsCollection({
  projects,
  nextCursor,
  state,
  failed,
  onOpenProject,
}: {
  readonly projects: readonly SerializedProjectListItem[];
  readonly nextCursor: string | null;
  readonly state: ProjectState;
  readonly failed: boolean;
  readonly onOpenProject: (id: string) => void;
}) {
  const { items, hasMore, loading, loadFailed, loadMore } =
    useProjectPagination(projects, nextCursor, state);

  const cards = useMemo(
    () => items.map((project) => toProjectCardData(project)),
    [items],
  );

  const count = items.length;
  // Never present the loaded-row count as the TOTAL while more pages remain — say
  // how many are "loaded" so far, not how many exist.
  const subtitle = failed
    ? "We couldn't load your projects."
    : hasMore
      ? `${count} projects loaded`
      : count === 1
        ? "1 project"
        : `${count} projects`;

  return (
    <CollectionLayout
      title="Projects"
      subtitle={subtitle}
      entityType="project"
      primaryAction={
        <DrawerTrigger
          drawerKey={NEW_PROJECT_KEY}
          className="dh-btn dh-btn--primary"
        >
          New project
        </DrawerTrigger>
      }
      filterBar={
        <SegmentedFilter
          param="state"
          options={STATE_OPTIONS}
          value={state}
          label="Filter projects by state"
        />
      }
      error={
        failed ? (
          <EmptyState
            title="We couldn't load your projects"
            description="Something went wrong. Please try again."
          />
        ) : undefined
      }
      isFilteredEmpty={!failed && count === 0 && state !== "all"}
      filteredEmptySlot={
        <EmptyState
          icon={<EntityIcon type="project" />}
          title={
            state === "completed" ? "No completed projects" : "No open projects"
          }
          description="Try a different state, or create a project."
          primaryAction={
            <DrawerTrigger
              drawerKey={NEW_PROJECT_KEY}
              className="dh-btn dh-btn--primary"
            >
              New project
            </DrawerTrigger>
          }
        />
      }
      isEmpty={!failed && count === 0 && state === "all"}
      emptySlot={
        <EmptyState
          icon={<EntityIcon type="project" />}
          title="No projects yet"
          description="Projects are the finite bodies of work you run under an Area or a Goal. Create your first one to get started."
          primaryAction={
            <DrawerTrigger
              drawerKey={NEW_PROJECT_KEY}
              className="dh-btn dh-btn--primary"
            >
              New project
            </DrawerTrigger>
          }
        />
      }
    >
      <CardCollection
        items={cards}
        getItemId={(card) => card.id}
        ariaLabel="Projects"
        presentation="list"
        density="comfortable"
        renderCard={(card) => <Card {...toCardProps(card, onOpenProject)} />}
      />
      {!failed && hasMore ? (
        <LoadMore
          loading={loading}
          loadFailed={loadFailed}
          onLoadMore={loadMore}
          label="Load more projects"
        />
      ) : null}
    </CollectionLayout>
  );
}
