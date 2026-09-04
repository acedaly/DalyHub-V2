/**
 * UIX-05 — the Analytics route (`/analytics`).
 *
 * The trusted server boundary: it resolves the authenticated workspace scope,
 * reads the owner's calendar day and date format, and hands the ONE bounded
 * projection (`analytics-context.ts`) to a purely presentational screen. A
 * scope failure degrades to a calm error state so the shell stays usable —
 * never a 500, exactly as every other collection route behaves.
 */

import { env } from "cloudflare:workers";

import { parseInsightWindow, resolveInsightGrain } from "~/kernel/analytics";
import { DEFAULT_APP_PREFERENCES } from "~/kernel/preferences";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import { ownerCalendarIso } from "~/shared/datetime";

import { AnalyticsScreen } from "../AnalyticsScreen";
import { loadAnalytics, type AnalyticsPageData } from "../analytics-context";
import type { Route } from "./+types/index";

export function meta() {
  return [
    { title: "Analytics · DalyHub" },
    {
      name: "description",
      content: "Where your effort has actually gone, over a period you choose.",
    },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const params = new URL(request.url).searchParams;
  const windowId = parseInsightWindow(params.get("window"));
  const now = new Date();

  try {
    const scope = await resolveAuthenticatedWorkspaceScope(env, session);
    const preferences = await scope.appPreferences.get(session.user.subject);
    const todayIso = ownerCalendarIso(now, preferences.timezone);
    /*
     * V2.9 INS-03 — the grain is resolved against the OWNER'S today, because
     * which grains a window can hold depends on how many days it covers. An
     * unrecognised or out-of-range grain falls back to the window's default
     * rather than being truncated: the page states the grain it is showing, so
     * a silent substitution would make it describe a series it is not drawing.
     */
    const grain = resolveInsightGrain(windowId, params.get("grain"), todayIso);
    return await loadAnalytics({
      scope,
      window: windowId,
      grain,
      todayIso,
      timezone: preferences.timezone,
      dateFormat: preferences.dateFormat,
      now,
    });
  } catch {
    /*
     * The degraded page still has to render its range rail and its own heading,
     * so it needs a model rather than a null. The evaluator's own "read failed"
     * path produces exactly that: every figure "Not available", no invented
     * zeroes, and the surface says so.
     */
    const {
      allowedGrains,
      evaluateAnalytics,
      insightWindow,
      insightWindowDays,
    } = await import("~/kernel/analytics");
    const todayIso = ownerCalendarIso(now, DEFAULT_APP_PREFERENCES.timezone);
    const span = insightWindowDays(windowId, todayIso);
    const grain = insightWindow(windowId).defaultGrain;
    const failedPage: AnalyticsPageData = {
      model: evaluateAnalytics({
        window: windowId,
        grain,
        span,
        buckets: [],
        current: null,
        previous: null,
        series: [],
        areas: [],
        areasBounded: false,
        areasAvailable: false,
        goals: null,
        overdueSeries: [],
        overduePrevious: null,
        overdueAvailable: false,
        measuredGoals: [],
        measuredGoalsBounded: false,
        measuredGoalsAvailable: false,
        seriesBounded: false,
        seriesBound: null,
        overdueMoments: 0,
      }),
      window: windowId,
      grain,
      grains: allowedGrains(windowId, todayIso),
      rangeLabel: "",
      bucketLabels: [],
      bucketShortLabels: [],
      bucketDates: [],
      failed: true,
    };
    return failedPage;
  }
}

export default function AnalyticsRoute({ loaderData }: Route.ComponentProps) {
  return <AnalyticsScreen data={loaderData} />;
}
