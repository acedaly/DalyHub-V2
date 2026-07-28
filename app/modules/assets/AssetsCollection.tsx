/**
 * ASSET-01 — the Assets collection view (presentational).
 *
 * Layers the Assets-specific controls on the shared PX-02 Collection Layout: a
 * segmented VIEW switcher (All / Recently updated / Expiring soon / Service due /
 * Archived), a FILTER bar (type, status, area, owner, tag) and a SORT control — all
 * URL-driven, so filtering/sorting/pagination run against the FULL workspace
 * collection server-side (never only the loaded page), and Back/Forward restores
 * them. Cards show only NON-SENSITIVE facts (type, status, make/model, location) plus
 * the single next meaningful date; a serial/reference number, price or private note
 * never reaches a card (§17). "Load more" appends cursor pages without re-loading.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useFetcher, useSearchParams } from "react-router";

import { ASSET_STATUSES, ASSET_TYPES, type AssetView } from "~/kernel/assets";
import {
  Card,
  CardCollection,
  type CardMetaItem,
  type CardProps,
  type CardTone,
} from "~/shared/card";
import {
  CollectionLayout,
  useCollectionLoading,
} from "~/shared/collection-layout";
import { EmptyState } from "~/shared/empty-state";
import { EntityIcon } from "~/shared/entity";
import { LoadMore } from "~/shared/load-more";

import { assetTypeIcon } from "./asset-icons";
import { nextMeaningfulDate, type AssetDateStatus } from "./asset-dates";
import type {
  AssetFilterOption,
  AssetsCollectionData,
} from "./assets-collection-data";
import type { SerializedAssetListItem } from "./asset-view";

const VIEWS: {
  readonly view: AssetView;
  readonly label: string;
  readonly path: string;
}[] = [
  { view: "all", label: "All", path: "/assets" },
  { view: "recent", label: "Recently updated", path: "/assets/recent" },
  { view: "expiring", label: "Expiring soon", path: "/assets/expiring" },
  { view: "service_due", label: "Service due", path: "/assets/service-due" },
  { view: "archived", label: "Archived", path: "/assets/archived" },
];

const SORTS = [
  { value: "recent", label: "Recently updated" },
  { value: "title", label: "Title" },
  { value: "type", label: "Type" },
  { value: "next_date", label: "Next date" },
];

const DATE_TONE: Record<AssetDateStatus, CardTone> = {
  overdue: "danger",
  due_soon: "warning",
  today: "warning",
  future: "neutral",
  historical: "neutral",
  none: "neutral",
};

function pathFor(view: AssetView): string {
  return VIEWS.find((v) => v.view === view)?.path ?? "/assets";
}

/** Build the NON-SENSITIVE card view-model for one Asset. */
function toCard(item: SerializedAssetListItem, today: string): CardProps {
  const Icon = assetTypeIcon(item.assetType);
  const nextDate = nextMeaningfulDate(item, today);
  const metadata: CardMetaItem[] = [];
  const modelLine = [item.manufacturer, item.model].filter(Boolean).join(" ");
  if (modelLine) metadata.push({ id: "model", value: modelLine });
  if (item.location) {
    metadata.push({ id: "location", label: "Location", value: item.location });
  }
  return {
    id: item.id,
    title: item.title,
    headingLevel: 2,
    typeLabel: item.assetTypeLabel,
    icon: <Icon />,
    accent: "neutral",
    subtitle: item.assetTypeLabel,
    status: { label: item.statusLabel },
    metadata,
    dateLabel: nextDate
      ? { label: nextDate.text, tone: DATE_TONE[nextDate.status] }
      : undefined,
    href: `/asset/${encodeURIComponent(item.id)}`,
    openAriaLabel: `Open ${item.title}`,
  };
}

/** Accumulating cursor pagination over the collection route. */
function usePagination(
  initial: readonly SerializedAssetListItem[],
  initialCursor: string | null,
  base: string,
) {
  const fetcher = useFetcher<AssetsCollectionData>();
  const [items, setItems] =
    useState<readonly SerializedAssetListItem[]>(initial);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [failed, setFailed] = useState(false);
  const processed = useRef<AssetsCollectionData | null>(null);

  // Reset when the loader delivers a fresh first page (filters/sort/view changed).
  useEffect(() => {
    setItems(initial);
    setCursor(initialCursor);
    setFailed(false);
    processed.current = null;
  }, [initial, initialCursor, base]);

  useEffect(() => {
    const data = fetcher.data;
    if (!data || processed.current === data) return;
    processed.current = data;
    if (data.failed) {
      setFailed(true);
      return;
    }
    setItems((prev) => {
      const seen = new Set(prev.map((p) => p.id));
      return [...prev, ...data.assets.filter((a) => !seen.has(a.id))];
    });
    setCursor(data.nextCursor);
  }, [fetcher.data]);

  const loadMore = useCallback(() => {
    if (!cursor) return;
    const sep = base.includes("?") ? "&" : "?";
    fetcher.load(`${base}${sep}cursor=${encodeURIComponent(cursor)}`);
  }, [cursor, base, fetcher]);

  return {
    items,
    hasMore: cursor !== null,
    loading: fetcher.state === "loading",
    loadFailed: failed,
    loadMore,
  };
}

export function AssetsCollectionView({
  data,
}: {
  readonly data: AssetsCollectionData;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const basePath = pathFor(data.view);

  // The search string WITHOUT cursor, so pagination resumes the same query.
  const baseWithQuery = useMemo(() => {
    const params = new URLSearchParams(searchParams);
    params.delete("cursor");
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }, [basePath, searchParams]);

  const pagination = usePagination(data.assets, data.nextCursor, baseWithQuery);

  const setParam = useCallback(
    (key: string, value: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) next.set(key, value);
          else next.delete(key);
          next.delete("cursor");
          return next;
        },
        { replace: true, preventScrollReset: true },
      );
    },
    [setSearchParams],
  );

  const filtersActive =
    Boolean(data.query) ||
    Object.keys(data.filters).length > 0 ||
    data.view !== "all";

  const viewLabel = VIEWS.find((v) => v.view === data.view)?.label ?? "Assets";

  const viewSwitcher = (
    <nav className="dh-assets-views" aria-label="Asset views">
      {VIEWS.map((v) => {
        const qs = new URLSearchParams(searchParams);
        qs.delete("cursor");
        const href = qs.toString() ? `${v.path}?${qs.toString()}` : v.path;
        return (
          <Link
            key={v.view}
            to={href}
            className="dh-assets-views__link"
            aria-current={v.view === data.view ? "page" : undefined}
          >
            {v.label}
          </Link>
        );
      })}
    </nav>
  );

  const filterBar = (
    <div className="dh-assets-filters">
      <label className="dh-assets-filters__field">
        <span className="dh-visually-hidden">Search assets</span>
        <input
          type="search"
          className="dh-input"
          placeholder="Search assets…"
          defaultValue={data.query}
          onChange={(e) => setParam("q", e.currentTarget.value)}
          aria-label="Search assets"
        />
      </label>
      <label className="dh-assets-filters__field">
        <span className="dh-assets-filters__label">Type</span>
        <select
          className="dh-select"
          value={data.filters.type ?? ""}
          onChange={(e) => setParam("type", e.currentTarget.value)}
        >
          <option value="">All types</option>
          {ASSET_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <label className="dh-assets-filters__field">
        <span className="dh-assets-filters__label">Status</span>
        <select
          className="dh-select"
          value={data.filters.status ?? ""}
          onChange={(e) => setParam("status", e.currentTarget.value)}
        >
          <option value="">Any status</option>
          {ASSET_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <FilterSelect
        label="Area"
        allLabel="Any area"
        value={data.filters.areaId ?? ""}
        options={data.areas}
        onChange={(v) => setParam("area", v)}
      />
      <FilterSelect
        label="Owner"
        allLabel="Anyone"
        value={data.filters.personId ?? ""}
        options={data.people}
        onChange={(v) => setParam("person", v)}
      />
      <label className="dh-assets-filters__field">
        <span className="dh-assets-filters__label">Tag</span>
        <input
          type="text"
          className="dh-input"
          defaultValue={data.filters.tag ?? ""}
          onChange={(e) => setParam("tag", e.currentTarget.value)}
          aria-label="Filter by tag"
        />
      </label>
      {data.view === "all" ||
      data.view === "recent" ||
      data.view === "archived" ? (
        <label className="dh-assets-filters__field">
          <span className="dh-assets-filters__label">Sort</span>
          <select
            className="dh-select"
            value={data.sort}
            onChange={(e) => setParam("sort", e.currentTarget.value)}
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );

  const isEmpty =
    !data.failed && pagination.items.length === 0 && !filtersActive;
  const isFilteredEmpty =
    !data.failed && pagination.items.length === 0 && filtersActive;

  // PX-06: the ONE shared collection loading signal — a same-route navigation
  // (a filter, a view, a page) shows the shared skeleton instead of leaving the
  // previous list on screen with no feedback.
  const isReloading = useCollectionLoading();
  return (
    <CollectionLayout
      isLoading={isReloading}
      title="Assets"
      entityType="asset"
      subtitle={viewLabel}
      viewSwitcher={viewSwitcher}
      filterBar={filterBar}
      primaryAction={
        <Link to="/new/asset" className="dh-btn dh-btn--primary">
          New Asset
        </Link>
      }
      error={
        data.failed ? (
          <EmptyState
            icon={<EntityIcon type="asset" />}
            title="We couldn’t load your assets"
            description="Something went wrong. Please try again."
          />
        ) : undefined
      }
      isEmpty={isEmpty}
      emptySlot={
        <EmptyState
          icon={<EntityIcon type="asset" />}
          title="No Assets yet"
          description="Track the important things you own — vehicles, appliances, licences, subscriptions and more."
          primaryAction={
            <Link to="/new/asset" className="dh-btn dh-btn--primary">
              New Asset
            </Link>
          }
        />
      }
      isFilteredEmpty={isFilteredEmpty}
      filteredEmptySlot={
        <EmptyState
          icon={<EntityIcon type="asset" />}
          title="Nothing matches"
          description="No assets match these filters. Try clearing a filter or search."
        />
      }
    >
      <CardCollection
        items={[...pagination.items]}
        getItemId={(a) => a.id}
        ariaLabel={`Assets — ${viewLabel}`}
        presentation="list"
        density="comfortable"
        renderCard={(a) => <Card {...toCard(a, data.today)} />}
      />
      {!data.failed && pagination.hasMore ? (
        <LoadMore
          loading={pagination.loading}
          loadFailed={pagination.loadFailed}
          onLoadMore={pagination.loadMore}
          label="Load more assets"
        />
      ) : null}
    </CollectionLayout>
  );
}

function FilterSelect({
  label,
  allLabel,
  value,
  options,
  onChange,
}: {
  readonly label: string;
  readonly allLabel: string;
  readonly value: string;
  readonly options: readonly AssetFilterOption[];
  readonly onChange: (value: string) => void;
}) {
  const known = options.some((o) => o.id === value);
  return (
    <label className="dh-assets-filters__field">
      <span className="dh-assets-filters__label">{label}</span>
      <select
        className="dh-select"
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.title}
          </option>
        ))}
        {value && !known ? (
          <option value={value}>(current selection)</option>
        ) : null}
      </select>
    </label>
  );
}
