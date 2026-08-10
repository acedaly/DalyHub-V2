/**
 * The Projects gallery — a grid of active workspaces.
 *
 * ── UIX-02 (the current design) ──────────────────────────────────────────────
 *
 * Projects and Areas both rendered through the one generic `EntityCard` until
 * this pass, which meant the two most DIFFERENT records in the spine — a finite
 * body of work being moved forward, and a permanent domain of life — were drawn
 * as the same object with different words in it. Hiding the labels left nothing
 * to tell them apart.
 *
 * So a Project has `ProjectCard`: identity at the top, the measure pinned to the
 * bottom, and one attention line between them. Four things changed on the way:
 *
 *   - **One attention line replaces a chip plus a sentence.** The card used to
 *     carry a filled status pill beside the title ("At risk") AND, three rows
 *     below, the health reason explaining it ("2 tasks past their due date").
 *     One fact, two objects, and the pill was the loudest thing on a card whose
 *     job is to be recognised by its mark. Now: a small state dot and the words,
 *     drawn once (`projectAttention`).
 *   - **The identity ramp moved off the CHART hues.** A Project's accent
 *     resolves through the same six-slot rank it always did, but those slots are
 *     now the UIX-01 widget accents rather than the chart-series ramp, whose
 *     hues are chosen so a LEGEND stays separable. That ramp was putting an
 *     olive, a magenta and a crimson on Project progress bars — and the crimson
 *     read as a state, purely because of where its Area sorted.
 *   - **The lifecycle mode is a tab rail**, the same one Tasks has had since
 *     UIX-01, rather than a fourth segmented capsule across the top.
 *   - **Every card ends at the same baseline**, so a row of bars is comparable.
 *
 * What is unchanged, and deliberately so: the owner's CHOSEN icon on the
 * Project's OWN stable rank (#130 — inheriting the Area's meant several
 * Projects in one Area were indistinguishable, and a Project with no Area had no
 * identity at all); the Area staying named in the context line; and progress
 * being ABSENT rather than 0% for a Project with no tasks.
 *
 * Split from the route so it can be unit-tested without the `cloudflare:workers`
 * loader (mirroring TodayDashboard). Each card opens its project through NORMAL
 * client navigation (a real router link), never an inaccessible clickable
 * container.
 */

import { useCallback, useMemo } from "react";
import { useNavigate, useRevalidator } from "react-router";

import { EntityCardGrid, ProjectCard } from "~/shared/card";
import {
  CollectionLayout,
  collectionCountLabel,
  useCollectionLoading,
} from "~/shared/collection-layout";
import {
  DrawerProvider,
  DrawerTrigger,
  useDrawer,
  type DrawerEntry,
  type DrawerRenderResult,
} from "~/shared/drawer";
import { AccentIcon, EntityIcon } from "~/shared/entity";
import { EmptyState } from "~/shared/empty-state";
import { LoadMore, useKeysetPagination } from "~/shared/load-more";
import { OverflowMenu } from "~/shared/overflow-menu";
import { useRecordLifecycle } from "~/shared/record-lifecycle";
import type { SelectOption } from "~/shared/forms/types";
import { ViewTabs } from "~/shared/view-switcher";

import { NewProjectForm } from "./NewProjectForm";
import {
  toProjectCardData,
  type ProjectCardData,
  type SerializedProjectListItem,
} from "./project-view";

export type ProjectState = "open" | "completed" | "archived" | "all";

/**
 * The one wording for "this Project has no tasks", so the attention line and
 * the card's trailing fact can be compared rather than both spelling it.
 */
const NO_TASKS_TEXT = "No tasks yet";

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

/**
 * One Project card.
 *
 * Progress is deliberately absent for a Project with no tasks: an empty bar at
 * 0% reads as "nothing done yet" when the truth is "nothing planned yet", and
 * the two are different facts. Where progress IS shown, the bar and the text
 * come from the same `normaliseProgress` call inside `EntityCard`, so the
 * visible percentage and the `aria-valuenow` can never disagree.
 *
 * DS-16 — the metadata region became a compact fact group (outstanding tasks,
 * completed tasks, last update) and the card gained the shared DS-12 overflow,
 * so archiving a Project no longer means opening it and finding its Settings
 * tab. A sparse Project — no Area, no tasks, no health reason — renders every
 * absent value as ABSENT rather than as an empty row, which is what keeps the
 * grid coherent when half a workspace has just been created.
 */
function ProjectEntityCard({
  card,
  onLifecycleChange,
}: {
  readonly card: ProjectCardData;
  readonly onLifecycleChange: () => void;
}) {
  const post = useCallback(
    async (intent: "archive" | "restore") => {
      const body = new FormData();
      body.set("intent", intent);
      const response = await fetch(
        `/projects/${encodeURIComponent(card.id)}/mutate`,
        { method: "POST", body, headers: { accept: "application/json" } },
      );
      const result = (await response.json()) as {
        readonly ok: boolean;
        readonly formError?: string;
      };
      if (!result.ok) {
        throw new Error(
          result.formError ?? "That couldn’t be saved. Please try again.",
        );
      }
      onLifecycleChange();
    },
    [card.id, onLifecycleChange],
  );

  const lifecycle = useRecordLifecycle({
    entityType: "project",
    title: card.title,
    archived: card.isArchived,
    onArchive: () => post("archive"),
    onRestore: () => post("restore"),
  });

  const open = card.progress.total - card.progress.completed;

  return (
    <>
      <ProjectCard
        data-testid="project-card"
        /*
         * The LARGE identity rung. A Project is the record this product most
         * wants to be recognisable before it is read, and a gallery card is
         * where the mark has room to lead rather than sit beside the title as a
         * 40px afterthought.
         */
        icon={
          <AccentIcon
            entityType="project"
            iconKey={card.iconKey}
            colourRank={card.colourRank}
            size="lg"
          />
        }
        title={card.title}
        headingLevel={2}
        context={card.parentLabel}
        // The SAME rank the mark above is painted with, so the bar and the mark
        // are one identity rather than two colour decisions.
        accent={card.colourRank}
        /*
         * UIX-02 — ONE attention line, replacing the filled status chip AND the
         * supporting health sentence beneath it.
         *
         * The chip said "At risk" and the line three rows below said "2 tasks
         * past their due date": one fact, two objects, and the chip was the
         * loudest thing on a card whose job is to be recognised by its mark. The
         * line now carries both — the compact wording is built from the
         * evaluator's own structured count, and the full sentence rides along
         * for assistive tech.
         */
        attention={{
          text: card.attention.text,
          tone: card.attention.tone,
          detail: card.attention.detail,
        }}
        /*
         * Progress is deliberately ABSENT for a Project with no tasks: an empty
         * bar at 0% reads as "nothing done yet" when the truth is "nothing
         * planned yet", and the two are different facts.
         */
        progress={
          card.progress.has
            ? {
                percent: card.progress.percent,
                valueText: `${card.progress.percent}% — ${card.progress.summary} complete`,
              }
            : undefined
        }
        /*
         * The one trailing fact: what is still to do. It complements the
         * percentage rather than restating it — "63%" answers how far along,
         * "3 open" answers how much is left — and a Project with everything
         * done says so instead of printing "0 open".
         */
        fact={
          card.progress.has
            ? open > 0
              ? `${open} open`
              : "All done"
            : // A Project with no tasks says so ONCE. When health is speaking it
              // has already said it on the attention line above ("No tasks
              // yet"), and repeating it in the foot is the same absence stated
              // twice on one card — which is the exact defect this pass removed
              // from the status chip.
              card.attention.text === NO_TASKS_TEXT
              ? null
              : NO_TASKS_TEXT
        }
        overflow={
          <OverflowMenu
            items={lifecycle.overflowActions}
            label={`More actions for ${card.title}`}
          />
        }
        // The semantic fact, never the chip's English. A card must not stop
        // looking archived because someone reworded a label.
        muted={card.isArchived}
        href={`/projects/${encodeURIComponent(card.id)}`}
        openAriaLabel={`Open ${card.title}`}
      />
      {lifecycle.dialogs}
    </>
  );
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

/**
 * The collection count.
 *
 * While another page exists the loaded count is NOT the total, so it says
 * "loaded" rather than claiming completeness. The singular is spelled out
 * rather than left as the previous "1 projects loaded".
 */
export function projectsCountLabel(count: number, hasMore: boolean): string {
  return collectionCountLabel(count, "Project", "Projects", { hasMore });
}

function ProjectsCollection({
  projects,
  nextCursor,
  state,
  failed,
}: {
  readonly projects: readonly SerializedProjectListItem[];
  readonly nextCursor: string | null;
  readonly state: ProjectState;
  readonly failed: boolean;
}) {
  const { items, hasMore, loading, loadFailed, loadMore } =
    useProjectPagination(projects, nextCursor, state);
  // Archiving moves a Project between state filters, so the list is re-read
  // rather than patched: the server decides which segment it now belongs to.
  const revalidator = useRevalidator();

  const cards = useMemo(
    () => items.map((project) => toProjectCardData(project)),
    [items],
  );

  const count = items.length;
  // Never present the loaded-row count as the TOTAL while more pages remain — say
  // how many are "loaded" so far, not how many exist.
  const subtitle = failed
    ? "We couldn’t load your projects."
    : projectsCountLabel(count, hasMore);

  // PX-06: the ONE shared collection loading signal — a same-route navigation
  // (a filter, a view, a page) shows the shared skeleton instead of leaving the
  // previous list on screen with no feedback.
  const isReloading = useCollectionLoading();
  return (
    <CollectionLayout
      isLoading={isReloading}
      title="Projects"
      subtitle={subtitle}
      presentation="grid"
      primaryAction={
        <DrawerTrigger
          drawerKey={NEW_PROJECT_KEY}
          className="dh-btn dh-btn--primary"
        >
          New Project
        </DrawerTrigger>
      }
      /*
       * UIX-02 — the lifecycle mode is a TAB RAIL under the title, not a
       * segmented capsule beside it.
       *
       * It is still the collection's principal MODE (one of the four is always
       * active, and each is a different collection of Projects rather than a
       * narrowing of one), and the URL contract is untouched. What changed is
       * the drawing: `ViewSwitcher` is an outlined 44px capsule with a filled
       * segment, hairline dividers and a check glyph, and four of those across
       * the top of the gallery was the heaviest object on the calmest band of
       * the page — while the reference draws exactly this control as text with
       * a 2px indicator. Tasks has had that rail since UIX-01; UIX-02 shares it
       * rather than copying it (`~/shared/view-switcher` → `ViewTabs`).
       *
       * On a phone the same rail becomes a scrolling row of pills, which is
       * both the reference's phone treatment and a better thumb target than an
       * underline. Neither is a second control to keep in step.
       */
      filterBar={
        <ViewTabs
          param="state"
          options={STATE_OPTIONS}
          value={state}
          label="Project views"
          defaultValue="all"
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
      <EntityCardGrid label="Projects">
        {cards.map((card) => (
          <ProjectEntityCard
            key={card.id}
            card={card}
            onLifecycleChange={() => revalidator.revalidate()}
          />
        ))}
      </EntityCardGrid>
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
