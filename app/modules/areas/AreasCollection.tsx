/**
 * The Areas index — a calm list of the permanent domains of a life.
 *
 * ── UIX-02 (the current design) ──────────────────────────────────────────────
 *
 * Areas were a gallery of `EntityCard`s, which is the SAME component and the
 * same grid Projects used. Two consequences, both bad:
 *
 * 1. **An Area was a Project with renamed fields.** Identical mark, identical
 *    card, identical layout, one big figure where a Project had its percentage.
 *    With the labels hidden nothing distinguished the two most different
 *    records in the spine — a finite body of work, and a part of life that
 *    never ends.
 * 2. **The cards were mostly empty.** An Area has no description, no
 *    completion, no due date and no progress. Four facts in a 260px card is a
 *    lot of whitespace, and six of them tiled across a 1440 was a page of air
 *    with words in the corners.
 *
 * So Areas are now `EntityRow` in `EntityRowList`: one surface, hairlines
 * between, a column of identity marks down the left edge. That is the reference
 * design's own Areas composition, it is the design system's stated rule for a
 * record too sparse to fill a gallery card, and it makes the two modules
 * distinguishable by STRUCTURE rather than by reading the labels.
 *
 * What did NOT change, and must not:
 *
 *   - **No progress, anywhere.** Areas never complete (AGENTS.md §4), so a
 *     completion bar answers a question the entity does not have. The row has
 *     nowhere to put one by construction.
 *   - **No status chip.** "Permanent" on every Area is a fact about Areas, not
 *     about this Area, and `listAreas` does not return archived ones at all.
 *   - **No invented health.** There is no Area score, no traffic light and no
 *     "at risk". What the row states is what is in the Area.
 *   - The owner's CHOSEN icon on the Area's own stable accent.
 *
 * The component holds no server imports; loaders hand it JSON-safe summaries.
 */

import { useCallback, useMemo } from "react";
import { useNavigate, useRevalidator } from "react-router";

import { EntityRow, EntityRowList } from "~/shared/card";
import {
  CollectionLayout,
  collectionCountLabel,
  CreateActionLabel,
  useCollectionLoading,
} from "~/shared/collection-layout";
import {
  DrawerProvider,
  DrawerTrigger,
  useDrawer,
  type DrawerEntry,
  type DrawerRenderResult,
} from "~/shared/drawer";
import { EmptyState } from "~/shared/empty-state";
import { AccentIcon, EntityIcon } from "~/shared/entity";
import { LoadMore, useKeysetPagination } from "~/shared/load-more";
import { OverflowMenu } from "~/shared/overflow-menu";
import { useRecordLifecycle } from "~/shared/record-lifecycle";

import { NewAreaForm } from "./NewAreaForm";
import {
  toAreaCardData,
  type AreaCardData,
  type SerializedAreaListItem,
} from "./area-view";

export const NEW_AREA_KEY = "new-area";

export interface AreasCollectionViewProps {
  readonly areas: readonly SerializedAreaListItem[];
  readonly nextCursor: string | null;
  readonly failed: boolean;
}

type AreasPageData = {
  readonly areas: readonly SerializedAreaListItem[];
  readonly nextCursor: string | null;
  readonly failed: boolean;
};

export function AreasCollectionView({
  areas,
  nextCursor,
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
      <AreasCollection areas={areas} nextCursor={nextCursor} failed={failed} />
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
 * One Area card.
 *
 * The accessible name is the Area's name plus its work state, so a screen-reader
 * user hears what a sighted user sees in the container's colour and the
 * summary line — the identity accent is never the only carrier of meaning.
 *
 * DS-16 — the metadata region is now a compact GROUP of facts (glyph, number,
 * noun) rather than the audit's `Goals: 2 · Projects: 4 · Tasks: 11` label
 * ladder, and the card carries the shared DS-12 overflow so an Area can be
 * archived from the gallery instead of only from inside its Settings tab. The
 * overflow sits above the whole-card link (`.dh-ecard__overflow`), so opening
 * the menu never navigates.
 */
function AreaEntityCard({
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
      <EntityRow
        data-testid="area-card"
        /*
         * The mark leads, at the compact rung. An Area is the most permanent
         * thing in the product and the one most often navigated to by
         * recognition rather than by reading — but a row does not need the
         * gallery's 56px square to say so, and a column of them down the left
         * edge is the whole point of drawing this as a list.
         */
        icon={
          <AccentIcon
            entityType="area"
            iconKey={card.iconKey}
            colourRank={card.colourRank}
            size="md"
          />
        }
        title={card.title}
        headingLevel={2}
        accent={card.colourRank}
        /*
         * The relationships, on one line — what is LIVING in this part of life.
         *
         * A count of zero is omitted rather than rendered as "0 Projects": an
         * absent dimension is not a fact worth a line on every row, and three
         * of them stacked ("No goals yet · No Projects yet · No tasks yet") is
         * the placeholder ladder the AREA-01 audit removed. The one absence
         * that survives is the ACTIONABLE one — an Area with nothing in it is
         * an Area waiting for its first Project, and saying so is how the list
         * avoids a dead end (AGENTS.md §6).
         */
        facts={areaRelationshipLine(card)}
        /*
         * The one trailing figure: how much is waiting here. NOT a proportion —
         * an Area never completes, so there is no percentage to state and this
         * row deliberately has nowhere to put one.
         */
        figure={
          card.openTasks > 0
            ? `${card.openTasks} open ${card.openTasks === 1 ? "task" : "tasks"}`
            : null
        }
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
 * The Area's relationship line — "2 Projects · 3 Goals", or the one absence
 * worth stating.
 *
 * Deliberately plain nouns rather than the "2 active Projects · 3 open Goals"
 * the card's subtitle used: on a list where every row says it, the qualifiers
 * are six words per row restating what the collection already means, and the
 * counts are what the eye is actually comparing down the column.
 */
function areaRelationshipLine(card: AreaCardData): string | null {
  const parts: string[] = [];
  if (card.activeProjects > 0) {
    parts.push(
      `${card.activeProjects} ${card.activeProjects === 1 ? "Project" : "Projects"}`,
    );
  }
  if (card.openGoals > 0) {
    parts.push(`${card.openGoals} ${card.openGoals === 1 ? "Goal" : "Goals"}`);
  }
  if (parts.length > 0) {
    return parts.join(" · ");
  }
  /*
   * The fallback is only honest when the Area is genuinely EMPTY.
   *
   * An Area with no Projects and no Goals but a handful of loose tasks filed
   * directly in it is not "ready for its first Project" — it is being used, and
   * telling its owner to start something would be the product misreading its
   * own data. That Area draws no relationship line at all: the trailing figure
   * beside it already says "3 open tasks", which is the whole truth about it.
   *
   * This is the same distinction `areaWorkSummary` drew, and the reason it
   * checked the task count before reporting an absence.
   */
  return card.openTasks > 0 ? null : "Ready for its first Project";
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

function AreasCollection({
  areas,
  nextCursor,
  failed,
}: {
  readonly areas: readonly SerializedAreaListItem[];
  readonly nextCursor: string | null;
  readonly failed: boolean;
}) {
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

  // PX-06: the ONE shared collection loading signal — a same-route navigation
  // shows the shared skeleton instead of leaving the previous list on screen
  // with no feedback. `presentation="grid"` so the skeleton resembles the card
  // anatomy that replaces it rather than the row list it no longer is.
  const isReloading = useCollectionLoading();
  return (
    <CollectionLayout
      // DS-05 — Areas is a flat LIST, so it takes the white ground DS-04
      // established for one (`collection-layout.css` → `--flat`). It was drawn
      // as a bordered white panel floating on the grey canvas, which is the
      // ground a card GRID wants.
      className="dh-collection--flat"
      isLoading={isReloading}
      title="Areas"
      subtitle={subtitle}
      presentation="list"
      primaryAction={
        <DrawerTrigger
          drawerKey={NEW_AREA_KEY}
          className="dh-btn dh-btn--primary"
        >
          <CreateActionLabel>New area</CreateActionLabel>
        </DrawerTrigger>
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
            <DrawerTrigger
              drawerKey={NEW_AREA_KEY}
              className="dh-btn dh-btn--primary"
            >
              <CreateActionLabel>New area</CreateActionLabel>
            </DrawerTrigger>
          }
        />
      }
    >
      <EntityRowList label="Areas">
        {cards.map((card) => (
          <AreaEntityCard
            key={card.id}
            card={card}
            onArchived={() => revalidator.revalidate()}
          />
        ))}
      </EntityRowList>
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
