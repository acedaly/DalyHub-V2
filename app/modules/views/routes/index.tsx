/**
 * X-02 — the `/views` module route: cross-module saved views.
 *
 * The loader resolves ONE validated {@link CrossViewConfig} from the URL (falling
 * back to a built-in view), applies the owner's module visibility BEFORE any row is
 * read, and runs the bounded cross-module query. There is exactly one query path:
 * every built-in view and every user-saved view goes through `scope.crossViewQuery`,
 * so no preset can invent its own definition of what a record is.
 *
 * The owner's calendar day, current week and the AREA-03 recent-window boundary are
 * computed HERE from the stored timezone and first-day-of-week preference, using the
 * SAME `~/shared/datetime` and `~/kernel/reviews` helpers the rest of DalyHub uses —
 * so this surface introduces no second definition of "today" or "this week".
 */

import { env } from "cloudflare:workers";

import { requireAuthenticatedSession } from "~/platform/request";
import {
  resolveAuthenticatedWorkspaceScope,
  type WorkspaceScope,
} from "~/platform/workspaces";
import { DEFAULT_APP_PREFERENCES } from "~/kernel/preferences";
import { weeklyPeriod } from "~/kernel/reviews";
import {
  CROSS_VIEW_SYSTEM_VIEWS,
  DEFAULT_CROSS_VIEW_CONFIG,
  availableViewScopes,
  crossViewFilterCount,
  findCrossViewSystemView,
  serialiseCrossViewConfig,
  viewScopeDefinition,
  VIEW_SCOPES,
  type CrossViewConfig,
  type CrossViewResult,
  type SavedView,
  type ViewScope,
} from "~/kernel/views";
import { createOwnerAlignmentContext } from "~/shared/alignment";
import { ownerCalendarIso, ownerDayStartInstant } from "~/shared/datetime";

import type { Route } from "./+types/index";
import { ViewsWorkspace } from "../ViewsWorkspace";
import {
  configFromParams,
  paramsFromConfig,
  VIEWS_PARAMS,
  viewQuery,
} from "../views-url-state";
import { buildGroups, resultToItem } from "../views-presentation";
import type {
  ViewScopeOption,
  ViewsPageData,
  ViewsViewOption,
} from "../views-contract";

export function meta() {
  return [{ title: "Views · DalyHub" }];
}

/**
 * Resolve the configuration this request is showing.
 *
 * `?view=<id>` alone means "open this view as saved". Any other parameter present
 * means the owner has adjusted it, so the URL wins and the view is reported as
 * Modified — the address bar always states what is actually applied.
 */
async function resolveConfig(
  scope: WorkspaceScope,
  ownerId: string,
  params: URLSearchParams,
): Promise<{
  readonly config: CrossViewConfig;
  readonly activeViewId: string | null;
  readonly storedConfig: CrossViewConfig | null;
}> {
  const viewId = params.get(VIEWS_PARAMS.view);
  if (!viewId) {
    const hasAny = [...params.keys()].some((key) => key !== VIEWS_PARAMS.view);
    return {
      config: hasAny
        ? configFromParams(params)
        : CROSS_VIEW_SYSTEM_VIEWS[0].config,
      activeViewId: hasAny ? null : CROSS_VIEW_SYSTEM_VIEWS[0].id,
      storedConfig: hasAny ? null : CROSS_VIEW_SYSTEM_VIEWS[0].config,
    };
  }

  const system = findCrossViewSystemView(viewId);
  const stored = system
    ? system.config
    : ((await scope.crossViews.get(ownerId, viewId))?.config ?? null);

  const onlyView = [...params.keys()].every((key) => key === VIEWS_PARAMS.view);
  if (stored && onlyView) {
    return { config: stored, activeViewId: viewId, storedConfig: stored };
  }
  // A saved view that no longer resolves is not an error page: the surface falls
  // back to the standard configuration and says the view could not be opened.
  return {
    config: onlyView ? DEFAULT_CROSS_VIEW_CONFIG : configFromParams(params),
    activeViewId: stored ? viewId : null,
    storedConfig: stored,
  };
}

function buildViewOptions(
  saved: readonly SavedView<CrossViewConfig>[],
): readonly ViewsViewOption[] {
  const system = CROSS_VIEW_SYSTEM_VIEWS.map<ViewsViewOption>((definition) => ({
    id: definition.id,
    name: definition.name,
    description: definition.description,
    kind: "system",
    query: viewQuery(definition.id, definition.config),
  }));
  const own = saved.map<ViewsViewOption>((view) => ({
    id: view.id,
    name: view.name,
    kind: "user",
    query: viewQuery(view.id, view.config),
  }));
  return [...system, ...own];
}

function buildScopeOptions(
  config: CrossViewConfig,
  available: readonly ViewScope[],
  activeViewId: string | null,
): readonly ViewScopeOption[] {
  const selected = new Set(config.scopes);
  const availableSet = new Set(available);
  return VIEW_SCOPES.map<ViewScopeOption>((scope) => {
    const definition = viewScopeDefinition(scope);
    const next = new Set(selected);
    if (next.has(scope)) next.delete(scope);
    else next.add(scope);
    // The last remaining scope cannot be removed: a view with nothing to show is
    // a broken state, not a filter.
    const scopes = next.size > 0 ? [...next] : [...selected];
    const params = paramsFromConfig({ ...config, scopes });
    // Carry the active view's identity, so adjusting a scope reads as "Modified"
    // rather than silently becoming an unnamed Custom configuration. The shared
    // control sheet and chip row already edit the URL in place and preserve it.
    if (activeViewId) params.set(VIEWS_PARAMS.view, activeViewId);
    return {
      scope,
      label: definition.plural,
      selected: selected.has(scope),
      query: params.toString(),
      hidden: !availableSet.has(scope),
    };
  });
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);
  const ownerId = session.user.subject;
  const url = new URL(request.url);
  const params = url.searchParams;

  const preferences = await scope.appPreferences
    .get(ownerId)
    .catch(() => DEFAULT_APP_PREFERENCES);
  const available = availableViewScopes(preferences.navigation.hiddenModuleIds);

  const {
    config,
    activeViewId: selectedViewId,
    storedConfig,
  } = await resolveConfig(scope, ownerId, params);
  const saved = await scope.crossViews.list(ownerId);

  // When nothing is explicitly selected, RECOGNISE a configuration that matches a
  // view and name it — a bare `/views` is a built-in view, not a "Custom" one, and
  // the switcher should say what you are LOOKING AT rather than merely what you
  // last clicked. Matching by canonical configuration also means a shared link and
  // the view it came from report themselves identically.
  const canonicalConfig = serialiseCrossViewConfig(config);
  const activeViewId =
    selectedViewId ??
    CROSS_VIEW_SYSTEM_VIEWS.find(
      (definition) =>
        serialiseCrossViewConfig(definition.config) === canonicalConfig,
    )?.id ??
    saved.find(
      (view) => serialiseCrossViewConfig(view.config) === canonicalConfig,
    )?.id ??
    null;

  const now = new Date();
  const todayIso = ownerCalendarIso(now, preferences.timezone);
  const week = weeklyPeriod(todayIso, preferences.firstDayOfWeek);
  // AUDIT-FIX-06: there is ONE owner day, and the timezone is always passed
  // explicitly — this surface never falls back to a default zone.
  const alignment = createOwnerAlignmentContext(now, preferences.timezone);

  const page = await scope.crossViewQuery.runCrossView(config, {
    now,
    todayIso,
    weekStartIso: week.start,
    weekEndIso: week.end,
    calendarIsoOf: (instant) => ownerCalendarIso(instant, preferences.timezone),
    dayStartInstantOf: (dayIso) =>
      ownerDayStartInstant(dayIso, preferences.timezone),
    alignmentRecentWindowStartIso: alignment.recentWindowStartIso,
    availableScopes: available,
  });

  const canonical = paramsFromConfig(config);

  const items = page.results.map((result: CrossViewResult) =>
    resultToItem(result, todayIso, preferences.dateFormat),
  );

  const data: ViewsPageData = {
    title: "Views",
    groups: buildGroups(items, config.groupBy),
    total: items.length,
    bounded: page.bounded,
    unavailable: page.unavailable,
    scopeOptions: buildScopeOptions(config, available, activeViewId),
    views: buildViewOptions(saved),
    activeViewId,
    modified:
      storedConfig !== null &&
      canonicalConfig !== serialiseCrossViewConfig(storedConfig),
    filterCount: crossViewFilterCount(config),
    currentQuery: canonical.toString(),
    shareUrl: `${url.origin}/views?${canonical.toString()}`,
    changeBoundary: page.changeBoundary,
    awaitingFirstReview:
      config.shared.changedSince === "last_review" &&
      page.changeBoundary === null,
  };
  return data;
}

export default function ViewsRoute({ loaderData }: Route.ComponentProps) {
  return <ViewsWorkspace data={loaderData} />;
}
