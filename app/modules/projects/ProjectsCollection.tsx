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

import { useMemo } from "react";
import { useNavigate, useRevalidator } from "react-router";

import { Card, CardCollection } from "~/shared/card";
import type { CardMetaItem, CardProps } from "~/shared/card";
import {
  CollectionLayout,
  useCollectionLoading,
} from "~/shared/collection-layout";
import {
  DrawerProvider,
  DrawerTrigger,
  useDrawer,
  type DrawerEntry,
  type DrawerRenderResult,
} from "~/shared/drawer";
import { EntityIcon } from "~/shared/entity";
import { EmptyState } from "~/shared/empty-state";
import { LoadMore, useKeysetPagination } from "~/shared/load-more";
import type { SelectOption } from "~/shared/forms/types";
import { HealthIndicator } from "~/shared/project-health";
import { SegmentedFilter } from "~/shared/segmented-filter";

import { NewProjectForm } from "./NewProjectForm";
import {
  toProjectCardData,
  type ProjectCardData,
  type SerializedProjectListItem,
} from "./project-view";

export type ProjectState = "open" | "completed" | "archived" | "all";

/** The drawer key hosting the create form. */
const NEW_PROJECT_KEY = "new-project";

/**
 * PROJ-05 §7: "All" keeps its existing, exact meaning (every non-archived
 * project — open or completed); Archived is a SEPARATE, dedicated segment so
 * archived Projects never leak into Open/Completed/All. This matches the
 * repository's documented `ProjectStateFilter` semantics exactly
 * (`d1-project-repository.ts`) — the UI never redefines them.
 */
const STATE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "completed", label: "Completed" },
  { value: "archived", label: "Archived" },
] as const;

export interface ProjectsCollectionViewProps {
  readonly projects: readonly SerializedProjectListItem[];
  /** Opaque cursor for the next page from the loader, or null when exhausted. */
  readonly nextCursor: string | null;
  readonly parentOptions: readonly SelectOption[];
  /**
   * True when the create form's Area/Goal options failed to load — a distinct
   * failure domain from the project list itself, and from a confirmed-empty
   * workspace (an empty `parentOptions` array with this false).
   */
  readonly parentOptionsFailed?: boolean;
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
  parentOptionsFailed = false,
  state,
  failed,
}: ProjectsCollectionViewProps) {
  const navigate = useNavigate();
  const revalidator = useRevalidator();

  const renderDrawer = useMemo(() => {
    return function render(entry: DrawerEntry): DrawerRenderResult | null {
      if (entry.key !== NEW_PROJECT_KEY) {
        return null;
      }
      return {
        title: "New Project",
        description: "Create a project under an Area or a Goal.",
        children: (
          <NewProjectFormHost
            parentOptions={parentOptions}
            parentOptionsFailed={parentOptionsFailed}
            onRetryParentOptions={() => revalidator.revalidate()}
          />
        ),
      };
    };
  }, [parentOptions, parentOptionsFailed, revalidator]);

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
  parentOptionsFailed,
  onRetryParentOptions,
}: {
  readonly parentOptions: readonly SelectOption[];
  readonly parentOptionsFailed: boolean;
  readonly onRetryParentOptions: () => void;
}) {
  const navigate = useNavigate();
  const { closeDrawer } = useDrawer();
  return (
    <NewProjectForm
      parentOptions={parentOptions}
      parentOptionsFailed={parentOptionsFailed}
      onRetryParentOptions={onRetryParentOptions}
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
/**
 * UX-01 — replaced by the ONE shared `useKeysetPagination` (DEBT-45). This was one
 * of five near-identical private copies of the same accumulate/de-duplicate/reset
 * logic; the shared hook also fixes the request-scoping defect they all carried.
 */
function useProjectPagination(
  firstPage: readonly SerializedProjectListItem[],
  initialCursor: string | null,
  state: ProjectState,
) {
  return useKeysetPagination<SerializedProjectListItem, ProjectsPageData>({
    firstPage,
    initialCursor,
    // The state filter is part of the cursor's scope, so it must be part of the
    // path a later page is requested from.
    path: `/projects?state=${encodeURIComponent(state)}`,
    select: selectProjectsPage,
    getId: projectId,
  });
}

/** Stable module-level selectors, so the shared hook's memo identity is stable. */
function selectProjectsPage(data: ProjectsPageData) {
  return {
    items: data.projects,
    nextCursor: data.nextCursor,
    failed: data.failed,
  };
}

function projectId(project: SerializedProjectListItem): string {
  return project.id;
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
    ? "We couldn’t load your projects."
    : hasMore
      ? `${count} projects loaded`
      : count === 1
        ? "1 project"
        : `${count} projects`;

  // PX-06: the ONE shared collection loading signal — a same-route navigation
  // (a filter, a view, a page) shows the shared skeleton instead of leaving the
  // previous list on screen with no feedback.
  const isReloading = useCollectionLoading();
  return (
    <CollectionLayout
      isLoading={isReloading}
      title="Projects"
      subtitle={subtitle}
      entityType="project"
      primaryAction={
        <DrawerTrigger
          drawerKey={NEW_PROJECT_KEY}
          className="dh-btn dh-btn--primary"
        >
          New Project
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
            title="We couldn’t load your projects"
            description="Something went wrong. Please try again."
          />
        ) : undefined
      }
      isFilteredEmpty={!failed && count === 0 && state !== "all"}
      filteredEmptySlot={
        <EmptyState
          icon={<EntityIcon type="project" />}
          title={
            state === "completed"
              ? "No completed projects"
              : state === "archived"
                ? "No archived projects"
                : "No open projects"
          }
          description={
            state === "archived"
              ? "Projects you archive appear here, and can be restored at any time."
              : "Try a different state, or create a project."
          }
          primaryAction={
            state === "archived" ? undefined : (
              <DrawerTrigger
                drawerKey={NEW_PROJECT_KEY}
                className="dh-btn dh-btn--primary"
              >
                New Project
              </DrawerTrigger>
            )
          }
        />
      }
      isEmpty={!failed && count === 0 && state === "all"}
      emptySlot={
        <EmptyState
          icon={<EntityIcon type="project" />}
          title="No Projects yet"
          description="Projects are the finite bodies of work you run under an Area or a Goal. Create your first one to get started."
          primaryAction={
            <DrawerTrigger
              drawerKey={NEW_PROJECT_KEY}
              className="dh-btn dh-btn--primary"
            >
              New Project
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
