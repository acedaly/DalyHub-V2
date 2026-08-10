/**
 * UIX-05 — the Assets collection.
 *
 * ── What was wrong ──────────────────────────────────────────────────────────
 * Assets rendered through the generic shared `Card` in a single-column list,
 * behind a filter bar of SEVEN permanent controls — search, type, status, area,
 * owner, obligations, tag, plus a sort — laid out as one wrapping row. On a
 * 1280 laptop that was three rows of chrome above the first record; on a phone
 * it was a screenful. Every card then carried type, make/model, location, status
 * and one date at near-equal weight, so the surface that exists to answer "what
 * do I own, and what does it need from me next?" answered the first half and
 * whispered the second.
 *
 * ── What this is now ────────────────────────────────────────────────────────
 * A gallery of `AssetCard`s (`~/shared/card/AssetCard.tsx`) whose measure is
 * TIME: the thing at the top, the next commitment pinned to the floor, in the
 * state's own words and tone. The five scopes stay on the shared view rail; the
 * seven filters move into the ONE shared collection sheet at every width
 * (`persistentControls`), which is exactly the case TASKS-03 built it for — a
 * collection with a genuinely rich control surface should not fork into a
 * desktop bar and a phone sheet, because that is two things to learn and two
 * places for a filter to hide. Search stays visible, because a search box behind
 * a button is a search box nobody uses.
 *
 * ── What did NOT change ─────────────────────────────────────────────────────
 * Every filter, sort, view and cursor is still URL-backed and still applied
 * server-side over the FULL collection; the obligation facet is still applied
 * over the loaded page for the reason `assets-collection-data.ts` documents; and
 * the card still shows only non-sensitive facts — no serial number, no reference
 * code, no price, no private note ever reaches it (§17).
 */

import { useCallback, useMemo } from "react";
import { Link, useSearchParams } from "react-router";

import { ASSET_STATUSES, ASSET_TYPES, type AssetView } from "~/kernel/assets";
import { AssetCard, EntityCardGrid, type AssetCardTone } from "~/shared/card";
import {
  CollectionControls,
  CollectionLayout,
  useCollectionLoading,
  type CollectionControlGroup,
} from "~/shared/collection-layout";
import { EmptyState } from "~/shared/empty-state";
import { EntityIcon } from "~/shared/entity";
import { LoadMore, useKeysetPagination } from "~/shared/load-more";
import { ViewSwitcher } from "~/shared/view-switcher";

import { assetTypeIcon } from "./asset-icons";
import {
  formatAssetDate,
  nextMeaningfulDate,
  type AssetDateStatus,
} from "./asset-dates";
import type { SerializedObligationSignal } from "./asset-history-view";
import type { AssetsCollectionData } from "./assets-collection-data";
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

/**
 * The card's tone for a canonical date status.
 *
 * `overdue` is the attention tone rather than the error one (D3): a lapsed
 * warranty is a state of a record, not an application fault. `today` reads as
 * due-soon rather than overdue, because a thing due today has not yet been
 * missed.
 */
const DATE_TONE: Record<AssetDateStatus, AssetCardTone> = {
  overdue: "danger",
  due_soon: "warning",
  today: "warning",
  future: "neutral",
  historical: "neutral",
  none: "neutral",
};

const OBLIGATION_TONE: Record<
  SerializedObligationSignal["tone"],
  AssetCardTone
> = {
  danger: "danger",
  warning: "warning",
  info: "info",
  neutral: "neutral",
};

function pathFor(view: AssetView): string {
  return VIEWS.find((v) => v.view === view)?.path ?? "/assets";
}

/**
 * The ONE commitment a card shows.
 *
 * The OBLIGATION signal wins where the Asset has one, because that is a live
 * commitment the owner created; the canonical warranty/renewal/service date is
 * the fallback. The two are never shown together — a card carries one urgent
 * line, not a maintenance history (§12) — and the obligation's own `when` is
 * omitted because the signal's text already carries it ("Rego due 30
 * September").
 *
 * An Asset with neither returns `null`, and the card states the absence once in
 * the space the date would have taken rather than leaving a gap.
 */
function commitmentFor(
  item: SerializedAssetListItem,
  today: string,
  signal: SerializedObligationSignal | undefined,
): { text: string; tone: AssetCardTone; when: string | null } | null {
  if (signal) {
    return {
      text: signal.text,
      tone: OBLIGATION_TONE[signal.tone],
      when: null,
    };
  }
  const next = nextMeaningfulDate(item, today);
  if (!next) return null;
  return {
    text: next.text,
    tone: DATE_TONE[next.status],
    // The relative phrase is in `text` ("Service due in 12 days"); the absolute
    // date beneath it is what an owner needs to act on, and one without the
    // other is either vague or unscannable.
    when: formatAssetDate(next.iso),
  };
}

/** "Vehicle · Toyota HiLux SR5" — the type, then what it actually is. */
function contextFor(item: SerializedAssetListItem): string {
  const model = [item.manufacturer, item.model].filter(Boolean).join(" ");
  return [item.assetTypeLabel, model].filter(Boolean).join(" · ");
}

/**
 * Accumulating cursor pagination over the collection route.
 *
 * UX-01 — the ONE shared `useKeysetPagination` (DEBT-45); this was one of five
 * near-identical private copies.
 */
function usePagination(
  initial: readonly SerializedAssetListItem[],
  initialCursor: string | null,
  base: string,
) {
  return useKeysetPagination<SerializedAssetListItem, AssetsCollectionData>({
    firstPage: initial,
    initialCursor,
    path: base,
    select: selectAssetsPage,
    getId: assetId,
  });
}

/** Stable module-level selectors, so the shared hook's memo identity is stable. */
function selectAssetsPage(data: AssetsCollectionData) {
  return {
    items: data.assets,
    nextCursor: data.nextCursor,
    failed: data.failed,
  };
}

function assetId(asset: SerializedAssetListItem): string {
  return asset.id;
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
    data.obligations !== "any" ||
    data.view !== "all";

  const viewLabel = VIEWS.find((v) => v.view === data.view)?.label ?? "Assets";

  // UIQ-013 — the five Asset scopes are the collection's principal mode, on the
  // ONE shared switcher. Each view is its own route, so the option carries its
  // own href (with the current filters preserved and the scope-bound cursor
  // dropped) rather than deriving one from a search param.
  const viewSwitcher = (
    <ViewSwitcher
      options={VIEWS.map((v) => {
        const qs = new URLSearchParams(searchParams);
        qs.delete("cursor");
        return {
          value: v.view,
          label: v.label,
          href: qs.toString() ? `${v.path}?${qs.toString()}` : v.path,
        };
      })}
      value={data.view}
      label="Asset views"
    />
  );

  /*
   * The seven control dimensions, as ONE shared sheet at every width.
   *
   * Every group is URL-backed and single-select, so the sheet is a different way
   * to reach the same state rather than a second state store: a shared link
   * still restores the exact collection, and Back/Forward still work. The Area
   * and Owner groups are bounded server-loaded option lists (never a collection
   * loaded to filter it locally), which is why they are ordinary groups rather
   * than the sheet's server-backed picker slot.
   */
  const controlGroups: readonly CollectionControlGroup[] = useMemo(
    () => [
      {
        id: "type",
        label: "Type",
        param: "type",
        options: [
          { value: "", label: "All types" },
          ...ASSET_TYPES.map((t) => ({ value: t.value, label: t.label })),
        ],
      },
      {
        id: "status",
        label: "Status",
        param: "status",
        options: [
          { value: "", label: "Any status" },
          ...ASSET_STATUSES.map((s) => ({ value: s.value, label: s.label })),
        ],
      },
      {
        id: "obligations",
        label: "Obligations",
        param: "obligations",
        defaultValue: "any",
        options: [
          { value: "any", label: "Any" },
          { value: "overdue", label: "Overdue" },
          { value: "due_soon", label: "Due soon" },
        ],
      },
      {
        id: "area",
        label: "Area",
        param: "area",
        options: [
          { value: "", label: "Any area" },
          ...data.areas.map((a) => ({ value: a.id, label: a.title })),
        ],
      },
      {
        id: "person",
        label: "Owner",
        param: "person",
        options: [
          { value: "", label: "Anyone" },
          ...data.people.map((p) => ({ value: p.id, label: p.title })),
        ],
      },
      {
        id: "sort",
        label: "Sort",
        param: "sort",
        kind: "sort",
        defaultValue: "recent",
        options: SORTS.map((s) => ({ value: s.value, label: s.label })),
      },
    ],
    [data.areas, data.people],
  );

  /*
   * Search stays visible at every width.
   *
   * It is the one control an owner reaches for without deciding to filter, and a
   * search box behind a button is a search box nobody uses. Everything else is
   * in the sheet beside it.
   */
  const filterBar = (
    <div className="dh-assets-filters">
      <label className="dh-assets-filters__search">
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
      {/*
       * The active-filter CHIPS are not rendered here: the shared control row
       * already draws them from the same groups (see `CollectionControls`), so a
       * narrowed gallery explains itself and each filter can be removed where it
       * is displayed. That is what makes moving six controls behind a button
       * honest — and rendering a second copy beside the search box would print
       * every chip twice.
       */}
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
      presentation="grid"
      viewSwitcher={viewSwitcher}
      filterBar={filterBar}
      persistentControls
      mobileControls={
        <CollectionControls
          groups={controlGroups}
          label="Filter and sort assets"
          triggerLabel="Filter & sort"
          basePath={basePath}
        />
      }
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
          description="Track the important things you own — vehicles, appliances, licences, subscriptions and more. DalyHub remembers what each one needs next."
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
      <EntityCardGrid label={`Assets — ${viewLabel}`}>
        {pagination.items.map((asset) => {
          const Icon = assetTypeIcon(asset.assetType);
          const commitment = commitmentFor(
            asset,
            data.today,
            data.obligationSignals[asset.id],
          );
          return (
            <AssetCard
              key={asset.id}
              headingLevel={2}
              icon={<Icon />}
              title={asset.title}
              context={contextFor(asset)}
              commitment={commitment ?? undefined}
              status={asset.statusLabel}
              place={asset.location}
              muted={asset.archived}
              href={`/asset/${encodeURIComponent(asset.id)}`}
              openAriaLabel={`Open ${asset.title}`}
            />
          );
        })}
      </EntityCardGrid>
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
