/**
 * ASSET-01/ASSET-02 — canonical Asset record route (`/asset/:assetId`).
 *
 * A full-page route hosting the shared DS-02 Record Layout for an Asset: Overview,
 * Obligations, History, Details, Linked records, Activity and Settings. Data
 * loading and lifecycle mutations live here (and in `/asset/:id/mutate` and
 * `/asset/:id/history`); the presentational components only render them.
 *
 * The loader is the ONE place the Asset's projection is assembled (§22 — no
 * duplicated Asset projection logic across Today, the collection and the record).
 * It resolves the canonical NAMES for id-reference fields, the first bounded page
 * of history, the obligations with their DERIVED state already evaluated against
 * the owner-calendar day, the SQL-aggregated recorded costs and the valuation
 * history. Each ASSET-02 surface degrades to empty on failure rather than failing
 * the whole record.
 *
 * The Drawer hosts the remaining write forms — event capture, obligation edit
 * and obligation completion — so the record never navigates away mid-capture and
 * focus returns to where it came from. The NAME is edited on the heading itself
 * (EDIT-02); it needed no form, only a field. Fails closed with a 404 for a missing, wrong-type
 * or cross-workspace id.
 */

import { env } from "cloudflare:workers";
import { useCallback, useMemo, useState } from "react";
import {
  isRouteErrorResponse,
  useRevalidator,
  useSearchParams,
} from "react-router";

import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import {
  DrawerProvider,
  useDrawer,
  type DrawerEntry,
  type DrawerRenderResult,
} from "~/shared/drawer";
import { EmptyState } from "~/shared/empty-state";
import { EntityIcon } from "~/shared/entity";

import { AssetCompleteObligationForm } from "../AssetCompleteObligationForm";
import { AssetEventForm } from "../AssetEventForm";
import type { QuickEventAction } from "../AssetHistoryTab";
import { AssetObligationForm } from "../AssetObligationForm";
import { AssetRecord } from "../AssetRecord";
import {
  formatHistoryDate,
  serializeAssetEvent,
  serializeAssetObligation,
  serializeCostSummary,
  serializeValueHistory,
  type SerializedAssetEvent,
  type SerializedAssetObligation,
} from "../asset-history-view";
import { serializeAsset, type SerializedAsset } from "../asset-view";
import { resolveEventNames } from "./history";
import type { AssetMutationResult } from "./mutate";
import type { Route } from "./+types/detail";

const DRAWER_KEY = "asset-drawer";

/** How much of the record's own surfaces load with the page. Both bounded. */
const OVERVIEW_EVENT_LIMIT = 20;
const OVERVIEW_OBLIGATION_LIMIT = 50;
/** The most linked Tasks whose open-state the record will resolve in one load. */
const MAX_TASK_LOOKUPS = 50;

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
  // AUDIT-14 — the owner's day, from the one scope-level authority.
  const today = await scope.ownerTodayIso();

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

  // Bounded candidate lists for the Details / event / obligation form pickers.
  let people: { id: string; title: string }[];
  let areas: { id: string; title: string }[];
  let notes: { id: string; title: string }[];
  try {
    const [peoplePage, areaPage, notePage] = await Promise.all([
      scope.people.list({ status: "all", limit: 100 }),
      scope.areas.listAreas(),
      scope.entities.listRecentByType("note", 50),
    ]);
    people = peoplePage.items.map((p) => ({ id: p.id, title: p.title }));
    areas = areaPage.items.map((a) => ({ id: a.id, title: a.title }));
    notes = notePage.map((n) => ({ id: n.id, title: n.title }));
  } catch {
    // A picker-candidate failure degrades to empty option lists, never a 500.
    people = [];
    areas = [];
    notes = [];
  }

  /* -- ASSET-02: history, obligations, costs, valuations ------------------ */

  const reading =
    asset.currentMeterValue !== null && asset.currentMeterUnit !== null
      ? { value: asset.currentMeterValue, unit: asset.currentMeterUnit }
      : null;

  let events: readonly SerializedAssetEvent[] = [];
  let eventsCursor: string | null = null;
  let eventsHasMore = false;
  let obligations: readonly SerializedAssetObligation[] = [];
  let costs = serializeCostSummary({
    currencyCode: asset.currencyCode,
    byGroup: { service: 0, repair: 0, renewal: 0, upgrade: 0 },
    ongoingTotalMinor: 0,
    purchasePriceMinor: asset.purchasePriceMinor,
    lifetimeTotalMinor: asset.purchasePriceMinor,
    costedEventCount: 0,
    mixedCurrency: false,
    excludedCurrencies: [],
  });
  let values = serializeValueHistory([]);

  try {
    const [eventPage, obligationPage, costSummary, valuations] =
      await Promise.all([
        scope.assetHistory.listEvents({
          assetId,
          limit: OVERVIEW_EVENT_LIMIT,
        }),
        scope.assetHistory.listObligations({
          assetId,
          limit: OVERVIEW_OBLIGATION_LIMIT,
          today,
        }),
        scope.assetHistory.costSummary(assetId),
        scope.assetHistory.valuationHistory(assetId),
      ]);

    const eventNames = await resolveEventNames(scope, eventPage.items);
    events = eventPage.items.map((event) =>
      serializeAssetEvent(event, eventNames),
    );
    eventsCursor = eventPage.nextCursor;
    eventsHasMore = eventPage.hasMore;

    // Linked-Task titles come from ONE bounded id lookup; open-state is resolved
    // for at most `MAX_TASK_LOOKUPS` so a long obligations list can never fan out
    // without a ceiling (AGENTS.md §16).
    const taskIds = [
      ...new Set(
        obligationPage.items
          .map((o) => o.taskId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    let taskTitles = new Map<string, { title: string }>();
    const openTaskIds = new Set<string>();
    if (taskIds.length > 0) {
      try {
        taskTitles = await scope.entities.getByIds(taskIds, {
          includeDeleted: true,
        });
        const views = await Promise.all(
          taskIds
            .slice(0, MAX_TASK_LOOKUPS)
            .map((id) => scope.tasks.getTask(id)),
        );
        for (const view of views) {
          if (
            view &&
            view.completedAt === null &&
            view.status !== "cancelled"
          ) {
            openTaskIds.add(view.id);
          }
        }
      } catch {
        // An unresolvable Task simply reads as "not open" — never a 500.
      }
    }

    obligations = obligationPage.items.map((obligation) =>
      serializeAssetObligation(obligation, today, reading, {
        taskTitle: obligation.taskId
          ? (taskTitles.get(obligation.taskId)?.title ?? null)
          : null,
        taskOpen: obligation.taskId
          ? openTaskIds.has(obligation.taskId)
          : false,
      }),
    );

    costs = serializeCostSummary(costSummary);
    values = serializeValueHistory(valuations);
  } catch {
    // Each ASSET-02 surface degrades to empty rather than failing the record.
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
    notes,
    today,
    events,
    eventsCursor,
    eventsHasMore,
    obligations,
    costs,
    values,
    meterDisplay:
      reading === null
        ? null
        : `${new Intl.NumberFormat("en-AU").format(reading.value)} ${reading.unit}`,
    meterDateLabel: formatHistoryDate(asset.currentMeterDate),
    openTaskCount: obligations.filter((o) => o.taskOpen).length,
  };
}

/** What the record's single Drawer is currently showing. */
type DrawerState =
  | { readonly kind: "event"; readonly action: QuickEventAction }
  | { readonly kind: "edit-event"; readonly event: SerializedAssetEvent }
  | {
      readonly kind: "obligation";
      readonly obligation: SerializedAssetObligation | null;
    }
  | {
      readonly kind: "complete";
      readonly obligation: SerializedAssetObligation;
    };

const TAB_IDS = [
  "summary",
  "obligations",
  "history",
  "details",
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

export default function AssetDetailRoute({ loaderData }: Route.ComponentProps) {
  const [drawerState, setDrawerState] = useState<DrawerState | null>(null);

  const renderDrawer = useCallback(
    (entry: DrawerEntry): DrawerRenderResult | null => {
      if (entry.key !== DRAWER_KEY || drawerState === null) return null;
      return renderAssetDrawer({
        state: drawerState,
        asset: loaderData.asset,
        today: loaderData.today,
        people: loaderData.people,
        notes: loaderData.notes,
        onSettled: () => setDrawerState(null),
      });
    },
    [
      drawerState,
      loaderData.asset,
      loaderData.today,
      loaderData.people,
      loaderData.notes,
    ],
  );

  return (
    <DrawerProvider renderDrawer={renderDrawer}>
      <AssetDetail loaderData={loaderData} setDrawerState={setDrawerState} />
    </DrawerProvider>
  );
}

function AssetDetail({
  loaderData,
  setDrawerState,
}: {
  readonly loaderData: Awaited<ReturnType<typeof loader>>;
  readonly setDrawerState: (state: DrawerState) => void;
}) {
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

  const open = useCallback(
    (state: DrawerState) => {
      setDrawerState(state);
      openDrawer(DRAWER_KEY);
    },
    [openDrawer, setDrawerState],
  );

  /**
   * DS-16 — the Asset rename, driven from the record heading (EDIT-02).
   *
   * The SAME `rename` intent and the SAME trusted endpoint the Drawer form
   * posted to; the server still resolves the workspace, verifies the id is an
   * Asset in it and returns `EntityValidationError` as a field message.
   */
  const assetId = loaderData.asset.id;
  const onRename = useCallback(
    async (title: string) => {
      const body = new FormData();
      body.set("intent", "rename");
      body.set("title", title);
      let result: AssetMutationResult;
      try {
        const response = await fetch(
          `/asset/${encodeURIComponent(assetId)}/mutate`,
          { method: "POST", body },
        );
        result = (await response.json()) as AssetMutationResult;
      } catch {
        return {
          ok: false,
          message: "That couldn’t be saved. Your text is safe — try again.",
        } as const;
      }
      if (result.kind === "rename" && result.ok) {
        revalidator.revalidate();
        return { ok: true } as const;
      }
      return {
        ok: false,
        message:
          (result.kind === "rename" && !result.ok
            ? (result.fieldErrors?.title ?? result.formError)
            : undefined) ??
          "That couldn’t be saved. Your text is safe — try again.",
      } as const;
    },
    [assetId, revalidator],
  );

  const overview = useMemo(
    () => ({
      obligations: loaderData.obligations,
      recentEvents: loaderData.events,
      costs: loaderData.costs,
      values: loaderData.values,
      meterDisplay: loaderData.meterDisplay,
      meterDateLabel: loaderData.meterDateLabel,
      openTaskCount: loaderData.openTaskCount,
    }),
    [
      loaderData.obligations,
      loaderData.events,
      loaderData.costs,
      loaderData.values,
      loaderData.meterDisplay,
      loaderData.meterDateLabel,
      loaderData.openTaskCount,
    ],
  );

  return (
    <AssetRecord
      asset={loaderData.asset}
      names={loaderData.names}
      people={loaderData.people}
      areas={loaderData.areas}
      today={loaderData.today}
      overview={overview}
      obligations={loaderData.obligations}
      events={loaderData.events}
      eventsCursor={loaderData.eventsCursor}
      eventsHasMore={loaderData.eventsHasMore}
      activeTabId={activeTabId}
      onTabChange={onTabChange}
      onRename={onRename}
      onSaved={() => revalidator.revalidate()}
      onQuickEvent={(action) => open({ kind: "event", action })}
      onEditEvent={(event) => open({ kind: "edit-event", event })}
      onAddObligation={() => open({ kind: "obligation", obligation: null })}
      onEditObligation={(obligation) =>
        open({ kind: "obligation", obligation })
      }
      onCompleteObligation={(obligation) =>
        open({ kind: "complete", obligation })
      }
    />
  );
}

/**
 * The drawer body host.
 *
 * A save must both REVALIDATE the record and CLOSE the drawer — otherwise the
 * form stays over the page it just changed, and its backdrop swallows the very
 * clicks the owner reaches for next. `useDrawer` is only available inside the
 * provider, so the close lives here, in a component the provider renders, rather
 * than in the outer render callback.
 */
function DrawerFormHost({
  onSettled,
  render,
}: {
  readonly onSettled: () => void;
  readonly render: (handlers: {
    readonly onSaved: () => void;
    readonly onCancel: () => void;
  }) => React.ReactNode;
}) {
  const { closeDrawer } = useDrawer();
  const revalidator = useRevalidator();
  const settle = useCallback(
    (revalidate: boolean) => {
      if (revalidate) revalidator.revalidate();
      onSettled();
      closeDrawer();
    },
    [closeDrawer, onSettled, revalidator],
  );
  return (
    <>
      {render({
        onSaved: () => settle(true),
        onCancel: () => settle(false),
      })}
    </>
  );
}

/** Build the drawer contents for the current state. */
function renderAssetDrawer({
  state,
  asset,
  today,
  people,
  notes,
  onSettled,
}: {
  readonly state: DrawerState;
  readonly asset: SerializedAsset;
  readonly today: string;
  readonly people: readonly { id: string; title: string }[];
  readonly notes: readonly { id: string; title: string }[];
  readonly onSettled: () => void;
}): DrawerRenderResult {
  const host = (
    render: (handlers: {
      readonly onSaved: () => void;
      readonly onCancel: () => void;
    }) => React.ReactNode,
  ) => <DrawerFormHost onSettled={onSettled} render={render} />;
  const defaultCurrency = asset.currencyCode ?? "AUD";
  // A vehicle or trailer defaults to kilometres because that is what its meter
  // is; everything else starts unset rather than guessing a unit for it.
  const defaultMeterUnit =
    asset.currentMeterUnit ??
    (asset.assetType === "vehicle" || asset.assetType === "trailer"
      ? "km"
      : "");

  switch (state.kind) {
    case "event":
      return {
        title: quickActionTitle(state.action),
        description: "Record what happened. You can add more detail later.",
        children: host(({ onSaved, onCancel }) => (
          <AssetEventForm
            assetId={asset.id}
            action={state.action}
            today={today}
            defaultCurrency={defaultCurrency}
            defaultMeterUnit={defaultMeterUnit}
            people={people}
            notes={notes}
            onSaved={onSaved}
            onCancel={onCancel}
          />
        )),
      };
    case "edit-event":
      return {
        title: "Edit history entry",
        description: "Correct what was recorded.",
        children: host(({ onSaved, onCancel }) => (
          <AssetEventForm
            assetId={asset.id}
            action="history"
            event={state.event}
            today={today}
            defaultCurrency={defaultCurrency}
            defaultMeterUnit={defaultMeterUnit}
            people={people}
            notes={notes}
            onSaved={onSaved}
            onCancel={onCancel}
          />
        )),
      };
    case "obligation":
      return {
        title: state.obligation ? "Edit obligation" : "Add obligation",
        description:
          "When does this next need doing? A date, a meter reading, or both.",
        children: host(({ onSaved, onCancel }) => (
          <AssetObligationForm
            assetId={asset.id}
            obligation={state.obligation}
            defaultMeterUnit={defaultMeterUnit}
            onSaved={onSaved}
            onCancel={onCancel}
          />
        )),
      };
    case "complete":
      return {
        title: `Complete: ${state.obligation.title}`,
        description: "Record what actually happened.",
        children: host(({ onSaved, onCancel }) => (
          <AssetCompleteObligationForm
            assetId={asset.id}
            obligation={state.obligation}
            today={today}
            defaultCurrency={defaultCurrency}
            defaultMeterUnit={defaultMeterUnit}
            people={people}
            notes={notes}
            onSaved={onSaved}
            onCancel={onCancel}
          />
        )),
      };
  }
}

function quickActionTitle(action: QuickEventAction): string {
  switch (action) {
    case "service":
      return "Record service";
    case "repair":
      return "Record repair";
    case "meter":
      return "Update meter";
    case "renewal":
      return "Record renewal";
    case "valuation":
      return "Record valuation";
    default:
      return "Add history entry";
  }
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <div className="dh-asset-not-found">
        <EmptyState
          icon={<EntityIcon type="asset" />}
          title="We couldn’t find that asset"
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
