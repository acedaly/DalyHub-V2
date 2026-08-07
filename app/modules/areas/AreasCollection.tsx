/**
 * AREA-01 / Gate D — the Areas collection, on the shared entity-card family.
 *
 * The audit found this surface rendering the one generic full-width row card:
 * Area identity carried by an 8px dot and a generic diamond glyph, a "Permanent"
 * chip on every row (every Area is permanent), and four of nine rows repeating
 * "Goals: No goals yet · Projects: No Projects yet · Tasks: No tasks yet" —
 * three absence messages saying one thing.
 *
 * What replaced it:
 *
 *   - `EntityCard` in `EntityCardGrid` — a 3/2/1-column responsive grid, not a
 *     stack of 1400px rows with a title at one end and a chip at the other.
 *   - The owner's CHOSEN icon on the Area's own accent (`AccentIcon`), which is
 *     the identity treatment the reference uses.
 *   - One concise work-state line, and one "No active work" where there is
 *     none.
 *   - No status chip. "Permanent" on every Area is a fact about Areas, not
 *     about this Area; a state is only worth surfacing when it is an exception,
 *     and `listAreas` does not return archived Areas at all.
 *
 * There is no progress bar on an Area card. Areas never complete (AGENTS.md §4),
 * so a completion bar would be answering a question the entity does not have —
 * and it was the source of the audit's "ragged alignment where some rows have
 * progress bars and some don't".
 *
 * The component holds no server imports; loaders hand it JSON-safe summaries.
 */

import { useCallback, useMemo } from "react";
import { useNavigate, useRevalidator } from "react-router";

import { CardMetaFact, EntityCard, EntityCardGrid } from "~/shared/card";
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
import { EmptyState } from "~/shared/empty-state";
import { AccentIcon, EntityIcon } from "~/shared/entity";
import { GoalIcon, HistoryIcon, ProjectIcon } from "~/shared/icons";
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
      <EntityCard
        data-testid="area-card"
        icon={
          <AccentIcon
            entityType="area"
            iconKey={card.iconKey}
            colourRank={card.colourRank}
          />
        }
        title={card.title}
        headingLevel={2}
        subtitle={card.workSummary}
        /*
         * The one figure that matters for a permanent domain of life is how much
         * is waiting in it. Shown whenever the Area has ANY active work — a "0
         * open tasks" on an Area with three Projects is genuinely "all clear",
         * not noise, and it keeps every working Area's card the same shape.
         */
        metric={
          card.hasActiveWork
            ? {
                value: String(card.openTasks),
                label: card.openTasks === 1 ? "open task" : "open tasks",
              }
            : undefined
        }
        meta={
          <>
            {/* A count of zero is omitted, not rendered as "0 Projects". An
             * absent dimension is not a fact worth a row on every card — that
             * is precisely the placeholder ladder this replaced. */}
            {card.activeProjects > 0 ? (
              <CardMetaFact
                icon={ProjectIcon}
                value={card.activeProjects}
                label={card.activeProjects === 1 ? "Project" : "Projects"}
              />
            ) : null}
            {card.openGoals > 0 ? (
              <CardMetaFact
                icon={GoalIcon}
                value={card.openGoals}
                label={card.openGoals === 1 ? "Goal" : "Goals"}
              />
            ) : null}
            {card.hasActiveWork ? null : (
              <span>Ready for its first Project</span>
            )}
            {card.updatedLabel ? (
              <span className="dh-ecard__fact">
                <HistoryIcon
                  className="dh-ecard__fact-icon"
                  aria-hidden="true"
                />
                {card.updatedLabel}
              </span>
            ) : null}
          </>
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
  const noun = count === 1 ? "Area" : "Areas";
  return hasMore ? `${count} ${noun} loaded` : `${count} ${noun}`;
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
      isLoading={isReloading}
      title="Areas"
      subtitle={subtitle}
      entityType="area"
      presentation="grid"
      primaryAction={
        <DrawerTrigger
          drawerKey={NEW_AREA_KEY}
          className="dh-btn dh-btn--primary"
        >
          New Area
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
              New Area
            </DrawerTrigger>
          }
        />
      }
    >
      <EntityCardGrid label="Areas">
        {cards.map((card) => (
          <AreaEntityCard
            key={card.id}
            card={card}
            onArchived={() => revalidator.revalidate()}
          />
        ))}
      </EntityCardGrid>
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
