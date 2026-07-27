/**
 * ASSET-01 — canonical Asset record route (`/asset/:assetId`).
 *
 * A full-page route hosting the shared DS-02 Record Layout for an Asset: Summary,
 * Details, Dates, Linked records, Activity and Settings. Data loading and lifecycle
 * mutations live here (and in `/asset/:id/mutate`); the presentational `AssetRecord`
 * only renders them. The loader resolves the owner/responsible/Area canonical NAMES
 * (never duplicating those records) and the bounded candidate lists the Details
 * form's pickers use. The Drawer hosts the "Rename" form. Fails closed with a 404
 * for a missing/wrong-type/cross-workspace id.
 */

import { env } from "cloudflare:workers";
import { useCallback, useMemo } from "react";
import {
  isRouteErrorResponse,
  useRevalidator,
  useSearchParams,
} from "react-router";

import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import { ownerCalendarIso } from "~/shared/datetime";
import {
  DrawerProvider,
  useDrawer,
  type DrawerEntry,
  type DrawerRenderResult,
} from "~/shared/drawer";
import { EmptyState } from "~/shared/empty-state";
import { EntityIcon } from "~/shared/entity";

import { AssetRecord } from "../AssetRecord";
import { RenameAssetForm } from "../RenameAssetForm";
import { serializeAsset } from "../asset-view";
import type { Route } from "./+types/detail";

const RENAME_KEY = "rename";

export function meta() {
  return [{ title: "Asset · DalyHub" }];
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const assetId = params.assetId;
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  const asset = await scope.assets.get(assetId);
  if (!asset) {
    throw new Response("Not Found", { status: 404 });
  }

  // Resolve the id-reference fields to canonical names (never duplicated records).
  const refIds = [
    asset.ownerPersonId,
    asset.responsiblePersonId,
    asset.areaId,
  ].filter((id): id is string => Boolean(id));
  const resolved =
    refIds.length > 0
      ? await scope.entities.getByIds(refIds, { includeDeleted: true })
      : new Map<string, { title: string }>();
  const nameOf = (id: string | null): string | null =>
    id ? (resolved.get(id)?.title ?? null) : null;

  // Bounded candidate lists for the Details form pickers.
  let people: { id: string; title: string }[];
  let areas: { id: string; title: string }[];
  try {
    const [peoplePage, areaPage] = await Promise.all([
      scope.people.list({ status: "all", limit: 100 }),
      scope.areas.listAreas(),
    ]);
    people = peoplePage.items.map((p) => ({ id: p.id, title: p.title }));
    areas = areaPage.items.map((a) => ({ id: a.id, title: a.title }));
  } catch {
    // A picker-candidate failure degrades to empty option lists, never a 500.
    people = [];
    areas = [];
  }

  return {
    asset: serializeAsset(asset),
    names: {
      ownerName: nameOf(asset.ownerPersonId),
      responsibleName: nameOf(asset.responsiblePersonId),
      areaName: nameOf(asset.areaId),
    },
    people,
    areas,
    today: ownerCalendarIso(new Date()),
  };
}

export default function AssetDetailRoute({ loaderData }: Route.ComponentProps) {
  const renderDrawer = useMemo(
    () =>
      createAssetDrawerRenderer(loaderData.asset.id, loaderData.asset.title),
    [loaderData.asset.id, loaderData.asset.title],
  );

  return (
    <DrawerProvider renderDrawer={renderDrawer}>
      <AssetDetail {...loaderData} />
    </DrawerProvider>
  );
}

function createAssetDrawerRenderer(assetId: string, title: string) {
  return function render(entry: DrawerEntry): DrawerRenderResult | null {
    if (entry.key === RENAME_KEY) {
      return {
        title: "Rename asset",
        description: "Update this asset's display name.",
        children: <RenameDrawerHost assetId={assetId} currentTitle={title} />,
      };
    }
    return null;
  };
}

function RenameDrawerHost({
  assetId,
  currentTitle,
}: {
  readonly assetId: string;
  readonly currentTitle: string;
}) {
  const { closeDrawer } = useDrawer();
  const revalidator = useRevalidator();
  return (
    <RenameAssetForm
      assetId={assetId}
      currentTitle={currentTitle}
      onDone={() => {
        revalidator.revalidate();
        closeDrawer();
      }}
      onCancel={closeDrawer}
    />
  );
}

const TAB_IDS = [
  "summary",
  "details",
  "dates",
  "linked",
  "activity",
  "settings",
] as const;
type TabId = (typeof TAB_IDS)[number];

function parseTab(value: string | null): TabId {
  return (TAB_IDS as readonly string[]).includes(value ?? "")
    ? (value as TabId)
    : "summary";
}

function AssetDetail({
  asset,
  names,
  people,
  areas,
  today,
}: Awaited<ReturnType<typeof loader>>) {
  const { openDrawer } = useDrawer();
  const revalidator = useRevalidator();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTabId = parseTab(searchParams.get("tab"));

  const onTabChange = useCallback(
    (tabId: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (tabId === "summary") {
            next.delete("tab");
          } else {
            next.set("tab", tabId);
          }
          return next;
        },
        { replace: true, preventScrollReset: true },
      );
    },
    [setSearchParams],
  );

  return (
    <AssetRecord
      asset={asset}
      names={names}
      people={people}
      areas={areas}
      today={today}
      activeTabId={activeTabId}
      onTabChange={onTabChange}
      onRename={() => openDrawer(RENAME_KEY)}
      onSaved={() => revalidator.revalidate()}
    />
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <div className="dh-asset-not-found">
        <EmptyState
          icon={<EntityIcon type="asset" />}
          title="We couldn't find that asset"
          description="It may have been deleted, or the link is out of date."
          primaryAction={
            <a className="dh-btn dh-btn--primary" href="/assets">
              Back to Assets
            </a>
          }
        />
      </div>
    );
  }
  throw error;
}
