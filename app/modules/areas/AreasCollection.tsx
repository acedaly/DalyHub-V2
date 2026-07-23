/**
 * AREA-01 — the Areas collection view.
 *
 * Replaces the placeholder `/areas` surface with the shared PX-02 Collection
 * Layout, DS-04 Card, DS-03 Drawer and DS-06 create form. The component contains
 * no server imports; loaders hand it JSON-safe Area summaries.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFetcher, useNavigate } from "react-router";

import {
  Card,
  CardCollection,
  type CardMetaItem,
  type CardProps,
} from "~/shared/card";
import { CollectionLayout } from "~/shared/collection-layout";
import {
  DrawerProvider,
  DrawerTrigger,
  useDrawer,
  type DrawerEntry,
  type DrawerRenderResult,
} from "~/shared/drawer";
import { EmptyState } from "~/shared/empty-state";
import { EntityIcon } from "~/shared/entity";
import { LoadMore } from "~/shared/load-more";

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
      value: card.projects.has ? card.projects.summary : "No projects yet",
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

function useAreaPagination(
  firstPage: readonly SerializedAreaListItem[],
  initialCursor: string | null,
) {
  const fetcher = useFetcher<AreasPageData>();
  const [appended, setAppended] = useState<SerializedAreaListItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loadFailed, setLoadFailed] = useState(false);
  const processed = useRef<AreasPageData | null>(null);

  useEffect(() => {
    setAppended([]);
    setCursor(initialCursor);
    setLoadFailed(false);
    processed.current = null;
  }, [initialCursor]);

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
    setAppended((prev) => [...prev, ...data.areas]);
    setCursor(data.nextCursor);
    setLoadFailed(false);
  }, [fetcher.state, fetcher.data]);

  const loadMore = useCallback(() => {
    if (cursor === null) {
      return;
    }
    setLoadFailed(false);
    fetcher.load(`/areas?cursor=${encodeURIComponent(cursor)}`);
  }, [cursor, fetcher]);

  const items = useMemo(() => {
    const seen = new Set<string>();
    const out: SerializedAreaListItem[] = [];
    for (const area of [...firstPage, ...appended]) {
      if (seen.has(area.id)) {
        continue;
      }
      seen.add(area.id);
      out.push(area);
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
    ? "We couldn't load your Areas."
    : hasMore
      ? `${count} Areas loaded`
      : count === 1
        ? "1 Area"
        : `${count} Areas`;

  return (
    <CollectionLayout
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
            title="We couldn't load your Areas"
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
