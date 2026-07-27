/**
 * ASSET-01 — the shared Assets collection loader (server-only).
 *
 * The ONE trusted, workspace-scoped read the five collection routes (`all`,
 * `recent`, `expiring`, `service_due`, `archived`) share. It reads the URL's
 * filter/sort/query/cursor, then reads the authoritative `AssetRepository.list`, so
 * filtering, sorting and pagination all operate over the FULL workspace collection
 * in SQL — never only the loaded page. Filter-candidate lists (People, Areas) are
 * loaded bounded. A scope/list failure degrades to a calm `failed` flag so the shell
 * stays usable — never a 500.
 */

import { env } from "cloudflare:workers";

import {
  type AssetFilters,
  type AssetSort,
  type AssetView,
} from "~/kernel/assets";
import type { AuthenticatedSession } from "~/kernel/auth";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import { ownerCalendarIso } from "~/shared/datetime";

import {
  serializeAssetListItem,
  type SerializedAssetListItem,
} from "./asset-view";

export type AssetFilterOption = { readonly id: string; readonly title: string };

export type AssetsCollectionData = {
  readonly assets: readonly SerializedAssetListItem[];
  readonly nextCursor: string | null;
  readonly view: AssetView;
  readonly sort: AssetSort;
  readonly filters: AssetFilters;
  readonly query: string;
  readonly today: string;
  readonly people: readonly AssetFilterOption[];
  readonly areas: readonly AssetFilterOption[];
  readonly failed: boolean;
};

function readFilters(params: URLSearchParams): AssetFilters {
  const out: {
    type?: string;
    status?: string;
    areaId?: string;
    personId?: string;
    tag?: string;
  } = {};
  const type = params.get("type");
  const status = params.get("status");
  const area = params.get("area");
  const person = params.get("person");
  const tag = params.get("tag");
  if (type) out.type = type;
  if (status) out.status = status;
  if (area) out.areaId = area;
  if (person) out.personId = person;
  if (tag) out.tag = tag;
  return out;
}

/** Load one bounded page of an Assets collection view. Never throws for a bad
 * cursor/filter — it degrades to an empty, `failed` page. */
export async function loadAssetsCollection(
  request: Request,
  session: AuthenticatedSession,
  view: AssetView,
): Promise<AssetsCollectionData> {
  const url = new URL(request.url);
  const params = url.searchParams;
  const sort = (params.get("sort") ?? "recent") as AssetSort;
  const query = params.get("q") ?? "";
  const cursor = params.get("cursor") ?? undefined;
  const filters = readFilters(params);
  const today = ownerCalendarIso(new Date());

  const empty: AssetsCollectionData = {
    assets: [],
    nextCursor: null,
    view,
    sort,
    filters,
    query,
    today,
    people: [],
    areas: [],
    failed: true,
  };

  try {
    const scope = await resolveAuthenticatedWorkspaceScope(env, session);
    const page = await scope.assets.list({
      view,
      sort,
      filters,
      query,
      cursor,
      today,
    });
    let people: AssetFilterOption[] = [];
    let areas: AssetFilterOption[] = [];
    try {
      const [peoplePage, areaPage] = await Promise.all([
        scope.people.list({ status: "all", limit: 100 }),
        scope.areas.listAreas(),
      ]);
      people = peoplePage.items.map((p) => ({ id: p.id, title: p.title }));
      areas = areaPage.items.map((a) => ({ id: a.id, title: a.title }));
    } catch {
      people = [];
      areas = [];
    }
    return {
      assets: page.items.map(serializeAssetListItem),
      nextCursor: page.nextCursor,
      view,
      sort,
      filters,
      query,
      today,
      people,
      areas,
      failed: false,
    };
  } catch {
    return empty;
  }
}
