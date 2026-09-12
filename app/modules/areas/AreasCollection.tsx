/**
 * The Areas index — the standing domains of a life.
 *
 * ── UNTITLED-05 (the current design) ────────────────────────────────────────
 *
 * The question this page answers is "what parts of my life am I responsible
 * for, and what is living in each of them?". Before this pass it answered the
 * first half and left the second to a run-on sentence:
 *
 *     [mark]  DalyHub V2                              44 open tasks
 *             14 Projects · 2 Goals
 *
 * — the nouns repeated on every row, the figures in a flexible cell where
 * nothing lined up, a filter band whose only occupant was a two-option toggle
 * at the far trailing edge, and no way at all to tell a busy Area from a
 * dormant one without reading all eleven rows.
 *
 * Three things changed, and each is structural rather than cosmetic:
 *
 * 1. **The gallery is an `AreaCard`, and Areas lead with it.** Areas were drawn
 *    by the generic `EntityCard` — the same component and the same grid a
 *    Project used until UIX-02 gave Projects a card of their own. So the fix
 *    for "an Area was a Project with renamed fields" had only been applied to
 *    one side of the pair. `AreaCard` puts PERMANENCE ("Ongoing since Mar
 *    2024") where a Project card puts its measure, and states what is living in
 *    the Area as a fact strip in a bordered foot — figures on a shared
 *    baseline, comparable straight down a gallery column.
 * 2. **The dense reading is a real table.** `EntityRowList`'s own source said
 *    the aim was that "the counts are what the eye is actually comparing down
 *    the column", and then drew them as prose in one flexible cell. A table is
 *    what that row was reaching for: the nouns move to column headings, stated
 *    once at the top; the figures land in columns; and the row semantics become
 *    React Aria's. See `AreasTable`.
 * 3. **The control row carries the collection's shape.** The lifecycle-style
 *    band that held one toggle now leads with a plain statement of what the
 *    workspace holds and ends with the presentation control — the same
 *    filter-bar structure `/tasks` and `/projects` carry from Pro
 *    `dashboards-01/02`.
 *
 * ── What did NOT change, and must not — in EITHER presentation ──────────────
 *
 *   - **No progress, anywhere.** Areas never complete (AGENTS.md §4), so a
 *     completion bar answers a question the entity does not have.
 *   - **No "Permanent" chip.** "Permanent" on every Area is a fact about Areas,
 *     not about this Area, and `listAreas` does not return archived ones at all.
 *   - **No invented health.** There is no Area score, no traffic light and no
 *     "at risk" here. The one state either presentation draws is the genuine
 *     ABSENCE — "No active work" — which is the record's own wording for its
 *     own `empty` momentum, derived from the same three counts. Everything
 *     stronger needs per-Project health for every Project in the Area, which a
 *     bounded collection page does not read and must not start reading per row.
 *   - The owner's CHOSEN icon on the Area's own stable accent.
 *
 * ── The presentation toggle ─────────────────────────────────────────────────
 *
 * `?present=` offers Grid and Table, exactly as Projects does, and GRID is the
 * default. That inverts UIX-02's ordering, and the reason UIX-02 gave for a
 * list-first default has been answered rather than ignored: *"the cards were
 * mostly empty"* was true of a generic card holding four facts, and is not true
 * of a card built around what an Area actually has. An Area is the record most
 * often reached by RECOGNITION rather than by reading, and a gallery of
 * identity marks is what recognition wants. `?present=list` — the value the
 * retired row list used — falls to the default rather than rendering nothing.
 *
 * The component holds no server imports; loaders hand it JSON-safe summaries.
 */

import { useCallback, useMemo } from "react";
import { useNavigate, useRevalidator } from "react-router";

import { AreaCard, AreaCardGrid } from "~/shared/card";
import {
  CollectionLayout,
  collectionCountLabel,
  collectionStateBreakdown,
  collectionStateSegment,
  CreateActionLabel,
  useCollectionLoading,
  type CollectionPresentation,
} from "~/shared/collection-layout";
import {
  DrawerButton,
  DrawerProvider,
  useDrawer,
  type DrawerEntry,
  type DrawerRenderResult,
} from "~/shared/drawer";
import { EmptyState } from "~/shared/empty-state";
import { AccentIcon, EntityIcon } from "~/shared/entity";
import { LoadMore, useKeysetPagination } from "~/shared/load-more";
import { GridIcon, TableIcon } from "~/shared/icons";
import { OverflowMenu } from "~/shared/overflow-menu";
import { useRecordLifecycle } from "~/shared/record-lifecycle";
import { ViewSwitcher } from "~/shared/view-switcher";

import { AreasTable } from "./AreasTable";
import { NewAreaForm } from "./NewAreaForm";
import {
  toAreaCardData,
  type AreaCardData,
  type SerializedAreaListItem,
} from "./area-view";

export const NEW_AREA_KEY = "new-area";

type AreasPageData = {
  readonly areas: readonly SerializedAreaListItem[];
  readonly nextCursor: string | null;
  readonly failed: boolean;
};

/**
 * The presentation toggle's two options — a gallery, or the same Areas as a
 * table.
 *
 * Grid is FIRST and is the default: an Area is the record most often navigated
 * to by recognition rather than by reading, and the gallery is where its mark,
 * its colour and its standing shape have room. The table is one click away for
 * the denser reading, and it is the SAME records in the SAME order from the
 * SAME loader — a presentation, never a filter.
 */
const PRESENTATION_OPTIONS = [
  { value: "grid", label: "Grid", icon: <GridIcon /> },
  { value: "table", label: "Table", icon: <TableIcon /> },
] as const;

export interface AreasCollectionViewProps {
  readonly areas: readonly SerializedAreaListItem[];
  /** Opaque cursor for the next page from the loader, or null when exhausted. */
  readonly nextCursor: string | null;
  /**
   * Gallery or table. A presentation, never a filter — both draw the same
   * records, in the same order, from the same loader. Resolved on the server
   * from `?present=`, so the first byte is already right.
   */
  readonly presentation?: CollectionPresentation;
  readonly failed: boolean;
}

export function AreasCollectionView({
  areas,
  nextCursor,
  presentation,
  failed,
}: AreasCollectionViewProps) {
  const renderDrawer = useMemo(() => {
    return function render(entry: DrawerEntry): DrawerRenderResult | null {
      if (entry.key !== NEW_AREA_KEY) {
        return null;
      }
      return {
        title: "New Area",
        description: "Create a permanent domain of life.",
        children: <NewAreaFormHost />,
      };
    };
  }, []);

  return (
    <DrawerProvider renderDrawer={renderDrawer}>
      <AreasCollection
        areas={areas}
        nextCursor={nextCursor}
        presentation={presentation}
        failed={failed}
      />
    </DrawerProvider>
  );
}

function NewAreaFormHost() {
  const navigate = useNavigate();
  const { closeDrawer } = useDrawer();
  return (
    <NewAreaForm
      onCreated={(areaId) => navigate(`/areas/${encodeURIComponent(areaId)}`)}
      onCancel={closeDrawer}
    />
  );
}

/**
 * One Area gallery card.
 *
 * The accessible name is the Area's name; what a sighted reader takes from the
 * mark's colour and the foot's figures, a screen-reader user takes from the
 * same words in the same order, because every figure carries its noun. The
 * identity accent is never the only carrier of meaning.
 *
 * The card carries the shared DS-12 overflow, so an Area can be archived from
 * the gallery instead of only from inside its Settings tab. The overflow sits
 * above the whole-card link, so opening the menu never navigates.
 */
function AreaGalleryCard({
  card,
  onArchived,
}: {
  readonly card: AreaCardData;
  readonly onArchived: () => void;
}) {
  const archive = useCallback(async () => {
    const body = new FormData();
    body.set("intent", "archive");
    const response = await fetch(
      `/areas/${encodeURIComponent(card.id)}/mutate`,
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
    onArchived();
  }, [card.id, onArchived]);

  const lifecycle = useRecordLifecycle({
    entityType: "area",
    title: card.title,
    onArchive: archive,
  });

  return (
    <>
      <AreaCard
        data-testid="area-card"
        /*
         * The LARGE identity rung. In a gallery the tile is what the eye lands
         * on first, and an Area is the record this product most wants to be
         * recognisable before it is read.
         */
        icon={
          <AccentIcon
            entityType="area"
            iconKey={card.iconKey}
            colourSlot={card.colourSlot}
            colourRank={card.colourRank}
            size="lg"
          />
        }
        title={card.title}
        headingLevel={2}
        accent={card.colourRank}
        colourSlot={card.colourSlot}
        since={card.sinceLabel}
        /*
         * The genuine absence, in the RECORD's own words — and with the next
         * action beside it, so an empty Area is never a dead end (AGENTS.md §6).
         * An Area holding only loose tasks is NOT idle and never reaches here:
         * `hasActiveWork` counts them.
         */
        quiet={
          card.hasActiveWork
            ? null
            : { label: card.quietLabel, hint: "Ready for its first Project" }
        }
        facts={areaCardFacts(card)}
        overflow={
          <OverflowMenu
            items={lifecycle.overflowActions}
            label={`More actions for ${card.title}`}
          />
        }
        href={`/areas/${encodeURIComponent(card.id)}`}
        openAriaLabel={`Open ${card.title}`}
      />
      {lifecycle.dialogs}
    </>
  );
}

/**
 * The card's foot — what is LIVING in this Area, as figures with their nouns.
 *
 * A dimension the Area does not have is ABSENT, not drawn as a zero. That is
 * the same rule AREA-01 applied when it deleted "Goals: No goals yet ·
 * Projects: No Projects yet · Tasks: No tasks yet" from every row: an absence
 * is never drawn as a state, and a column of zeros across a gallery reads as
 * eleven warnings. The strip can therefore be one, two, three or four facts
 * wide, and `auto-fit` lets it fill the card at each of them.
 *
 * It is never EMPTY: an Area with nothing at all in it draws the quiet band
 * instead (see `quiet` above), which is the honest single statement of that
 * state rather than a strip that vanished.
 *
 * Completed Projects join as a last fact ONLY when there are some. They are the
 * one figure here about the Area's HISTORY rather than its present — and the
 * fact that most distinguishes an Area from a Project, because a Project's
 * completion ends it while completed Projects pile up inside an Area that
 * carries on. A "0 completed" column on a young Area would read as a reproach.
 */
function areaCardFacts(card: AreaCardData) {
  const facts: { id: string; value: string; label: string }[] = [];
  if (card.activeProjects > 0) {
    facts.push({
      id: "projects",
      value: String(card.activeProjects),
      label: card.activeProjects === 1 ? "Project" : "Projects",
    });
  }
  if (card.openGoals > 0) {
    facts.push({
      id: "goals",
      value: String(card.openGoals),
      label: card.openGoals === 1 ? "Goal" : "Goals",
    });
  }
  if (card.openTasks > 0) {
    facts.push({
      id: "tasks",
      value: String(card.openTasks),
      label: card.openTasks === 1 ? "open task" : "open tasks",
    });
  }
  if (card.completedProjects > 0) {
    facts.push({
      id: "completed",
      value: String(card.completedProjects),
      label: "completed",
    });
  }
  return facts;
}

/**
 * UX-01 — the ONE shared `useKeysetPagination` (DEBT-45), which also fixes the
 * request-scoping defect the five private copies all carried.
 */
function useAreaPagination(
  firstPage: readonly SerializedAreaListItem[],
  initialCursor: string | null,
) {
  return useKeysetPagination<SerializedAreaListItem, AreasPageData>({
    firstPage,
    initialCursor,
    path: "/areas",
    select: selectAreasPage,
    getId: areaId,
  });
}

/** Stable module-level selectors, so the shared hook's memo identity is stable. */
function selectAreasPage(data: AreasPageData) {
  return {
    items: data.areas,
    nextCursor: data.nextCursor,
    failed: data.failed,
  };
}

function areaId(area: SerializedAreaListItem): string {
  return area.id;
}

/**
 * The collection count.
 *
 * While another page exists the loaded count is NOT the total, and saying "9
 * Areas" when nine are merely loaded would be the exact dishonesty the metric
 * rule forbids. The singular is spelled out rather than left as "1 Areas
 * loaded", which is what the previous copy produced.
 */
export function areasCountLabel(count: number, hasMore: boolean): string {
  return collectionCountLabel(count, "Area", "Areas", { hasMore });
}

/**
 * UNTITLED-05 — the control row's statement of SHAPE: "3 with work in flight ·
 * 2 quiet".
 *
 * A complete statement about the LOADED page and nothing more, which is why it
 * is suppressed while another page exists rather than being quietly wrong. Each
 * fragment is dropped when it is zero, through the same shared breakdown
 * grammar Projects' "8 active · 2 archived" line uses — a zero on a count line
 * reads as a warning about the zero.
 *
 * "Quiet" here is the same derivation the card's state chip draws, so the line
 * and the cards can never disagree: it counts Areas with no Projects, no Goals
 * and no open Tasks, which is exactly the momentum evaluator's `empty`.
 */
export function areaShapeLabel(
  cards: readonly AreaCardData[],
  hasMore: boolean,
): string | null {
  if (hasMore || cards.length === 0) {
    return null;
  }
  const quiet = cards.filter((card) => !card.hasActiveWork).length;
  const running = cards.length - quiet;
  return collectionStateBreakdown([
    collectionStateSegment(running, "with work in flight"),
    collectionStateSegment(quiet, "quiet"),
  ]);
}

function AreasCollection({
  areas,
  nextCursor,
  presentation = "grid",
  failed,
}: AreasCollectionViewProps) {
  const { items, hasMore, loading, loadFailed, loadMore } = useAreaPagination(
    areas,
    nextCursor,
  );
  // An archived Area leaves the active collection, so the list is re-read rather
  // than patched: the server decides what "active" means, not the browser.
  const revalidator = useRevalidator();
  const cards = useMemo(
    () => items.map((area) => toAreaCardData(area)),
    [items],
  );
  const count = items.length;
  const subtitle = failed
    ? "We couldn’t load your Areas."
    : areasCountLabel(count, hasMore);
  const shape = failed ? null : areaShapeLabel(cards, hasMore);

  // PX-06: the ONE shared collection loading signal — a same-route navigation
  // shows the shared skeleton instead of leaving the previous list on screen
  // with no feedback. The skeleton follows the requested presentation so it
  // resembles the card or row anatomy that replaces it.
  const isReloading = useCollectionLoading();
  return (
    <CollectionLayout
      isLoading={isReloading}
      title="Areas"
      subtitle={subtitle}
      // So the loading skeleton resembles the anatomy that replaces it. The
      // skeleton's own vocabulary is narrower than the collection's (it has no
      // table shape), so the mapping is explicit rather than a cast.
      presentation={presentation === "grid" ? "grid" : "list"}
      primaryAction={
        <DrawerButton drawerKey={NEW_AREA_KEY} variant="primary">
          <CreateActionLabel>New area</CreateActionLabel>
        </DrawerButton>
      }
      filterBar={
        /*
         * UNTITLED-04/05 — the Untitled Application UI filter-bar band, the same
         * structure Tasks and Projects carry from Pro `dashboards-01/02`.
         *
         * Areas has no lifecycle tabs to lead the row (`listAreas` returns only
         * active Areas; archived ones are reached from the record), so the
         * leading edge states the collection's SHAPE instead of standing empty
         * — which is what the band looked like before this pass: a full-width
         * strip whose only occupant was the toggle at its far end.
         *
         * The band is ABSENT entirely on a collection with nothing in it. A
         * presentation toggle for zero records is a control that cannot change
         * anything, and the empty state below already carries the one action
         * that can.
         */
        failed || count === 0 ? undefined : (
          <div
            /*
             * `min-w-0` is load-bearing: a flex item's automatic minimum size is
             * its min-content, which overrides `w-full`, so without it this band
             * grows to fit its contents and puts the document into horizontal
             * scroll at 320px.
             */
            className="flex w-full min-w-0 flex-wrap items-center gap-3 max-md:flex-col max-md:items-stretch"
            data-untitled-source="dashboards-01/02:filter-bar"
          >
            {/*
             * `shape` is null only while ANOTHER PAGE exists, where the loaded
             * rows are not the workspace and a count of them would be a claim
             * this page cannot make. The heading's own "N Areas loaded" already
             * says so; the band simply carries the toggle alone there.
             */}
            {shape ? (
              <p
                className="m-0 min-w-0 flex-1 truncate text-sm text-tertiary"
                data-testid="areas-shape"
              >
                {shape}
              </p>
            ) : (
              <span className="min-w-0 flex-1" />
            )}
            <div className="flex shrink-0 items-center gap-3 max-md:justify-end">
              <ViewSwitcher
                param="present"
                options={PRESENTATION_OPTIONS}
                value={presentation}
                label="Area layout"
              />
            </div>
          </div>
        )
      }
      error={
        failed ? (
          <EmptyState
            title="We couldn’t load your Areas"
            description="Something went wrong. Please try again."
          />
        ) : undefined
      }
      isEmpty={!failed && count === 0}
      emptySlot={
        <EmptyState
          icon={<EntityIcon type="area" />}
          title="No Areas yet"
          description="Areas are the permanent domains of life. Create one before adding Projects."
          primaryAction={
            <DrawerButton drawerKey={NEW_AREA_KEY} variant="primary">
              <CreateActionLabel>New area</CreateActionLabel>
            </DrawerButton>
          }
        />
      }
    >
      {presentation === "grid" ? (
        <AreaCardGrid label="Areas">
          {cards.map((card) => (
            <AreaGalleryCard
              key={card.id}
              card={card}
              onArchived={() => revalidator.revalidate()}
            />
          ))}
        </AreaCardGrid>
      ) : (
        <AreasTable cards={cards} onArchived={() => revalidator.revalidate()} />
      )}
      {!failed && hasMore ? (
        <LoadMore
          loading={loading}
          loadFailed={loadFailed}
          onLoadMore={loadMore}
          label="Load more Areas"
        />
      ) : null}
    </CollectionLayout>
  );
}
