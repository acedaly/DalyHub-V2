/**
 * AREA-01 — the Areas collection view.
 *
 * Replaces the placeholder `/areas` surface with the shared PX-02 Collection
 * Layout, DS-04 Card, DS-03 Drawer and DS-06 create form. The component contains
 * no server imports; loaders hand it JSON-safe Area summaries.
 */

import { useMemo } from "react";
import { useNavigate } from "react-router";

import {
  Card,
  CardCollection,
  type CardMetaItem,
  type CardProps,
} from "~/shared/card";
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
import { EntityIcon } from "~/shared/entity";
import { LoadMore, useKeysetPagination } from "~/shared/load-more";

import { NewAreaForm } from "./NewAreaForm";
import { toAreaCardData, type SerializedAreaListItem } from "./area-view";

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
  const navigate = useNavigate();
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
        failed={failed}
        onOpenArea={(id) => navigate(`/areas/${encodeURIComponent(id)}`)}
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

function toCardProps(
  card: ReturnType<typeof toAreaCardData>,
  onOpenArea: (id: string) => void,
): CardProps {
  const metadata: CardMetaItem[] = [
    {
      id: "goals",
      label: "Goals",
      value: card.goals.has ? card.goals.summary : "No goals yet",
    },
    {
      id: "projects",
      label: "Projects",
      value: card.projects.has ? card.projects.summary : "No Projects yet",
    },
  ];
  if (!card.tasks.has) {
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
    typeLabel: "Area",
    icon: <EntityIcon type="area" />,
    headingLevel: 2,
    status: card.state,
    metadata,
    progress: card.tasks.has
      ? {
          value: card.tasks.completed,
          max: card.tasks.total,
          label: `Task roll-up: ${card.tasks.summary}`,
        }
      : undefined,
    density: "comfortable",
    presentation: "list",
    href: `/areas/${encodeURIComponent(card.id)}`,
    onOpen: () => onOpenArea(card.id),
    openAriaLabel: `Open ${card.title}`,
  };
}

/**
 * UX-01 — replaced by the ONE shared `useKeysetPagination` (DEBT-45). This was one
 * of five near-identical private copies of the same accumulate/de-duplicate/reset
 * logic; the shared hook also fixes the request-scoping defect they all carried.
 */
/**
 * UX-01 — replaced by the ONE shared `useKeysetPagination` (DEBT-45). This was one
 * of five near-identical private copies of the same accumulate/de-duplicate/reset
 * logic; the shared hook also fixes the request-scoping defect they all carried.
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

function AreasCollection({
  areas,
  nextCursor,
  failed,
  onOpenArea,
}: {
  readonly areas: readonly SerializedAreaListItem[];
  readonly nextCursor: string | null;
  readonly failed: boolean;
  readonly onOpenArea: (id: string) => void;
}) {
  const { items, hasMore, loading, loadFailed, loadMore } = useAreaPagination(
    areas,
    nextCursor,
  );
  const cards = useMemo(
    () => items.map((area) => toAreaCardData(area)),
    [items],
  );
  const count = items.length;
  const subtitle = failed
    ? "We couldn’t load your Areas."
    : hasMore
      ? `${count} Areas loaded`
      : count === 1
        ? "1 Area"
        : `${count} Areas`;

  // PX-06: the ONE shared collection loading signal — a same-route navigation
  // (a filter, a view, a page) shows the shared skeleton instead of leaving the
  // previous list on screen with no feedback.
  const isReloading = useCollectionLoading();
  return (
    <CollectionLayout
      isLoading={isReloading}
      title="Areas"
      subtitle={subtitle}
      entityType="area"
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
      <CardCollection
        items={cards}
        getItemId={(card) => card.id}
        ariaLabel="Areas"
        presentation="list"
        density="comfortable"
        renderCard={(card) => <Card {...toCardProps(card, onOpenArea)} />}
      />
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
