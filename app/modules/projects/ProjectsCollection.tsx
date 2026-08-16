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
import type { ProjectLifecycleCounts } from "~/kernel/projects";
import {
  CollectionControlRow,
  CollectionLayout,
  CollectionSearchField,
  collectionCountLabel,
  collectionStateBreakdown,
  collectionStateSegment,
  CreateActionLabel,
  useCollectionLoading,
  useCollectionSearch,
  type CollectionPresentation,
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
import type { GoalSummary } from "~/shared/goal-progress";
import { GridIcon, TableIcon } from "~/shared/icons";
import { ViewSwitcher, ViewTabs } from "~/shared/view-switcher";

import { GoalSummarySection } from "./GoalSummarySection";
import { ProjectsTable } from "./ProjectsTable";
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
/*
 * REDESIGN-04 — the mockup's ORDER and the mockup's WORD, with the product's
 * fourth real bucket kept.
 *
 * `mockup3.png` draws three tabs — Active / All / Archived — and "Active" is the
 * word it uses for what this repository calls `open`. The label follows the
 * reference; the VALUE does not change, so every `?state=open` link, bookmark
 * and test in the product still resolves and the documented
 * `ProjectStateFilter` semantics are untouched.
 *
 * "Completed" survives as a fourth tab even though the reference has no room to
 * draw it. It is a real, separately-reachable collection of Projects, and §12 is
 * explicit that simplicity must not be bought by deleting capability — a
 * completed Project would otherwise be reachable only by scanning "All".
 */
const STATE_OPTIONS = [
  { value: "open", label: "Active" },
  { value: "all", label: "All" },
  { value: "completed", label: "Completed" },
  { value: "archived", label: "Archived" },
] as const;

/** The presentation toggle's two options — a gallery, or the same rows as a table. */
const PRESENTATION_OPTIONS = [
  { value: "grid", label: "Grid", icon: <GridIcon /> },
  { value: "table", label: "Table", icon: <TableIcon /> },
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
  /**
   * REDESIGN-04 — the workspace's lifecycle counts, for the header's
   * "8 active · 2 archived". `null` when the one grouped count read failed, in
   * which case the line falls back to the loaded-row wording rather than
   * printing a number it cannot stand behind.
   */
  readonly counts?: ProjectLifecycleCounts | null;
  /** §5.3 — the compact Goals section's summaries, from the shared bounded read. */
  readonly goals?: readonly GoalSummary[];
  readonly goalsFailed?: boolean;
  /** The committed search text, from the URL. */
  readonly query?: string;
  /** Gallery or table. A presentation, never a filter — both show the same rows. */
  readonly presentation?: CollectionPresentation;
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
  /*
   * REDESIGN-04 — the reference's additions default to their honest ABSENT
   * state, so a caller that renders this view without them (the design-states
   * route, a unit test) gets the collection the product had before this pass:
   * no count line beyond the loaded rows, no Goals section, an un-narrowed
   * gallery. Absence is never rendered as zero.
   */
  counts = null,
  goals = [],
  goalsFailed = false,
  query = "",
  presentation = "grid",
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
        counts={counts}
        goals={goals}
        goalsFailed={goalsFailed}
        query={query}
        presentation={presentation}
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
            colourSlot={card.colourSlot}
            colourRank={card.colourRank}
            size="lg"
          />
        }
        title={card.title}
        headingLevel={2}
        context={card.parentLabel}
        // The SAME inputs the mark above is painted from, so the bar and the
        // mark are one identity rather than two colour decisions — the resolver
        // folds them once, inside the card.
        accent={card.colourRank}
        colourSlot={card.colourSlot}
        /*
         * REDESIGN-04 §5.6 — attention survives as SIGNAL, not as a sentence.
         *
         * UIX-02 replaced a status chip plus a health sentence with one line of
         * words. `mockup3.png` gives that line to volume and urgency instead, so
         * the sentence goes and the state dot stays: the dot takes the
         * evaluator's tone, its full wording rides along for assistive tech, and
         * the due-this-week fragment below is tinted when the same evaluator
         * says work is overdue. `projectAttention` is untouched — it is
         * re-expressed, not deleted.
         */
        attention={{
          text: card.attention.text,
          tone: card.attention.tone,
          detail: card.attention.detail,
        }}
        /*
         * The reference's meta line — "14 tasks · 4 due this week".
         *
         * Both figures are FREE. `taskTotal` is the rollup the card already
         * drew a bar from, and `dueThisWeek` is `upcomingDueOpen` out of the
         * health summary the collection loader already gathers for the whole
         * page in one read (§5.5: cheap aggregates only, never a per-card
         * query). A Project with no tasks has nothing true to say here and says
         * nothing.
         */
        meta={card.meta}
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
         * REDESIGN-04 — the trailing "N open" fact is GONE from the gallery
         * card, and its absence is deliberate rather than an omission.
         *
         * The meta line beside it now states the total and the due count, and
         * "63% · 14 tasks · 4 due this week · 3 open" is four numbers about the
         * same eight tasks. The reference draws two. Nothing is lost: open work
         * is `taskTotal` minus the percentage, it is stated exactly on the
         * record, and a Project with no tasks still says so — that IS its meta
         * line (see `projectCardMeta`).
         */
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
  query: string,
) {
  return useKeysetPagination<SerializedProjectListItem, ProjectsPageData>({
    firstPage,
    initialCursor,
    // The state filter AND the search term are part of the cursor's scope
    // (`PROJECT_CURSOR_VERSION` 4), so both must be part of the path a later
    // page is requested from — otherwise the next page would be fetched from a
    // different result set than the cursor was issued against.
    path:
      query.length > 0
        ? `/projects?state=${encodeURIComponent(state)}&q=${encodeURIComponent(query)}`
        : `/projects?state=${encodeURIComponent(state)}`,
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

/**
 * REDESIGN-04 — the reference's count line: "8 active · 2 archived".
 *
 * A workspace-wide statement from one grouped count read, so it is a real
 * total rather than a page's length. Every fragment is dropped when it is zero:
 * a workspace with nothing archived says "8 active", not "8 active · 0
 * archived" — a zero on a count line reads as a warning about the zero.
 * Completed is folded in only when there is some, because the reference's line
 * is two facts and a third is worth adding only when it exists.
 *
 * Returns `null` when the count read failed or the workspace is genuinely
 * empty, so the caller falls back to the wording it has always used rather than
 * printing "0 active".
 */
export function projectLifecycleCountLabel(
  counts: ProjectLifecycleCounts | null,
): string | null {
  if (!counts) return null;
  // CONVERGE-01 — the joining is the SHARED breakdown grammar now, so every
  // collection's state line breaks the same way on a phone and drops its zero
  // segments by the same rule.
  return collectionStateBreakdown([
    collectionStateSegment(counts.active, "active"),
    collectionStateSegment(counts.completed, "completed"),
    collectionStateSegment(counts.archived, "archived"),
  ]);
}

function ProjectsCollection({
  projects,
  nextCursor,
  counts,
  goals,
  goalsFailed,
  query,
  presentation,
  state,
  failed,
}: {
  readonly projects: readonly SerializedProjectListItem[];
  readonly nextCursor: string | null;
  readonly counts: ProjectLifecycleCounts | null;
  readonly goals: readonly GoalSummary[];
  readonly goalsFailed: boolean;
  readonly query: string;
  readonly presentation: CollectionPresentation;
  readonly state: ProjectState;
  readonly failed: boolean;
}) {
  const { items, hasMore, loading, loadFailed, loadMore } =
    useProjectPagination(projects, nextCursor, state, query);
  // The ONE shared search controller — a local draft, a debounce, a `replace`d
  // URL write and a cursor reset. See `useCollectionSearch`.
  const { draft, setDraft } = useCollectionSearch();
  // Archiving moves a Project between state filters, so the list is re-read
  // rather than patched: the server decides which segment it now belongs to.
  const revalidator = useRevalidator();

  const cards = useMemo(
    () => items.map((project) => toProjectCardData(project)),
    [items],
  );

  const count = items.length;
  /*
   * REDESIGN-04 — the reference's count line, "8 active · 2 archived".
   *
   * It describes the WORKSPACE, from the one grouped count read, which is why
   * it can state a total the loaded page does not contain. Three fallbacks, in
   * order, and each one is honest about what it knows:
   *
   *   - a NARROWED collection counts what the search matched, because "8
   *     active" beside three search results would be answering a question
   *     nobody asked;
   *   - a failed count read drops to the loaded-row wording — the same line the
   *     collection has always shown — rather than printing a number it cannot
   *     stand behind;
   *   - a failed LIST read says so in a sentence.
   */
  const subtitle = failed
    ? "We couldn’t load your projects."
    : query.length > 0
      ? projectsCountLabel(count, hasMore)
      : (projectLifecycleCountLabel(counts) ??
        projectsCountLabel(count, hasMore));

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
          <CreateActionLabel>New project</CreateActionLabel>
        </DrawerTrigger>
      }
      /*
       * REDESIGN-04 — search is on the TITLE row, per `mockup3.png`, through the
       * one shared field. See `PaneHeader` for why this single narrowing control
       * is a header slot when no other is.
       */
      search={
        <CollectionSearchField
          value={draft}
          onChange={setDraft}
          label="Search projects"
          placeholder="Search projects…"
          data-testid="projects-search"
        />
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
      /*
       * REDESIGN-04 — the reference's CONTROL ROW: the lifecycle rail at the
       * leading edge, the presentation toggle at the trailing one.
       *
       * The toggle is deliberately NOT in the header's `viewSwitcher` slot even
       * though it is a view switcher: at 1280 the title row is already carrying
       * a search field and the primary action, and a third cluster is where it
       * breaks. UIQ-013's semantics are untouched — this is still the ONE
       * switcher control, changing presentation and never which records are
       * included. It has simply been given the row the reference draws it on.
       */
      filterBar={
        <CollectionControlRow
          leading={
            <ViewTabs
              param="state"
              options={STATE_OPTIONS}
              value={state}
              label="Project views"
              defaultValue="all"
            />
          }
          trailing={
            <ViewSwitcher
              param="present"
              options={PRESENTATION_OPTIONS}
              value={presentation}
              label="Project layout"
            />
          }
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
      /*
       * A narrowed collection is FILTERED-empty at every state, including "All"
       * — "No Projects yet" would be a lie about a workspace that simply has
       * none matching "kitchn".
       */
      isFilteredEmpty={
        !failed && count === 0 && (state !== "all" || query.length > 0)
      }
      filteredEmptySlot={
        query.length > 0 ? (
          <EmptyState
            icon={<EntityIcon type="project" />}
            title={`No projects match “${query}”`}
            description="Try a shorter search, or a different lifecycle tab."
            primaryAction={
              <button
                type="button"
                className="dh-btn"
                onClick={() => setDraft("")}
              >
                Clear search
              </button>
            }
          />
        ) : (
          <EmptyState
            icon={<EntityIcon type="project" />}
            title={
              state === "completed"
                ? "No completed projects"
                : state === "archived"
                  ? "No archived projects"
                  : "No active projects"
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
                  <CreateActionLabel>New project</CreateActionLabel>
                </DrawerTrigger>
              )
            }
          />
        )
      }
      isEmpty={!failed && count === 0 && state === "all" && query.length === 0}
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
              <CreateActionLabel>New project</CreateActionLabel>
            </DrawerTrigger>
          }
        />
      }
    >
      {/*
       * REDESIGN-04 §5.4 — the SAME records, in the other representation.
       *
       * One loader, one order, one set of rows; the toggle chooses only how
       * they are drawn. The table is not a second collection with its own
       * reads, which is why it can sit behind a URL param rather than behind a
       * route.
       */}
      {presentation === "table" ? (
        <ProjectsTable
          cards={cards}
          onLifecycleChange={() => revalidator.revalidate()}
        />
      ) : (
        <EntityCardGrid label="Projects">
          {cards.map((card) => (
            <ProjectEntityCard
              key={card.id}
              card={card}
              onLifecycleChange={() => revalidator.revalidate()}
            />
          ))}
        </EntityCardGrid>
      )}
      {!failed && hasMore ? (
        <LoadMore
          loading={loading}
          loadFailed={loadFailed}
          onLoadMore={loadMore}
          label="Load more projects"
        />
      ) : null}

      {/*
       * REDESIGN-04 §5.3 — the compact Goals section the reference draws
       * beneath the gallery, on the desktop page and in the handset frame
       * alike.
       *
       * It is a SUMMARY, not a second collection: three rows from the shared
       * bounded read Today already makes, with `View all` leading to the real
       * workspace. It is hidden while the collection is narrowed or showing a
       * non-default lifecycle — an owner searching for a Project is not asking
       * about Goals, and a rail that ignores the tab above it reads as broken.
       */}
      {!failed &&
      !goalsFailed &&
      goals.length > 0 &&
      query.length === 0 &&
      (state === "all" || state === "open") ? (
        <GoalSummarySection goals={goals} />
      ) : null}
    </CollectionLayout>
  );
}
