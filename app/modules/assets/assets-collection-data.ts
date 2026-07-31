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
  obligationSignal,
  type SerializedObligationSignal,
} from "./asset-history-view";
import {
  serializeAssetListItem,
  type SerializedAssetListItem,
} from "./asset-view";

export type AssetFilterOption = { readonly id: string; readonly title: string };

/**
 * ASSET-02 — the obligation-state facet. Deliberately applied over the loaded page
 * rather than in the Asset list SQL: the obligation state is DERIVED (it depends on
 * the owner-calendar day and the current meter reading), so pushing it into the
 * collection query would mean duplicating the evaluator in SQL and letting the two
 * drift. The page is already bounded, so filtering it is cheap and always agrees
 * with what the record shows.
 */
export type AssetObligationFilter = "any" | "overdue" | "due_soon";

const OBLIGATION_FILTERS: ReadonlySet<string> = new Set([
  "any",
  "overdue",
  "due_soon",
]);

export type AssetsCollectionData = {
  readonly assets: readonly SerializedAssetListItem[];
  /**
   * ASSET-02 — the per-Asset obligation signal, keyed by Asset id. Resolved for the
   * WHOLE PAGE in one query so a card never loads its own history (§27); absent for
   * an Asset with no open obligations.
   */
  readonly obligationSignals: Readonly<
    Record<string, SerializedObligationSignal>
  >;
  readonly nextCursor: string | null;
  readonly view: AssetView;
  readonly sort: AssetSort;
  readonly filters: AssetFilters;
  readonly query: string;
  readonly today: string;
  /** ASSET-02 — the obligation-state filter applied over the loaded page. */
  readonly obligations: AssetObligationFilter;
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
  const rawObligations = params.get("obligations") ?? "any";
  const obligations = (
    OBLIGATION_FILTERS.has(rawObligations) ? rawObligations : "any"
  ) as AssetObligationFilter;
  const today = ownerCalendarIso(new Date());

  const empty: AssetsCollectionData = {
    assets: [],
    obligationSignals: {},
    obligations,
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
    // ONE bounded query for the whole page's obligation counts — never one per card.
    let obligationSignals: Record<string, SerializedObligationSignal> = {};
    try {
      const summaries = await scope.assetHistory.summariseObligations(
        page.items.map((asset) => asset.id),
        today,
      );
      obligationSignals = Object.fromEntries(
        [...summaries]
          .map(([id, summary]) => [id, obligationSignal(summary)] as const)
          .filter(
            (entry): entry is [string, SerializedObligationSignal] =>
              entry[1] !== null,
          ),
      );
    } catch {
      // A signal failure leaves the cards without their obligation line, which is
      // a quieter card — never a broken collection.
      obligationSignals = {};
    }

    const visible =
      obligations === "any"
        ? page.items
        : page.items.filter((asset) => {
            const signal = obligationSignals[asset.id];
            if (!signal) return false;
            return obligations === "overdue"
              ? signal.overdueCount > 0
              : signal.dueSoonCount > 0;
          });

    return {
      assets: visible.map(serializeAssetListItem),
      obligationSignals,
      obligations,
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
