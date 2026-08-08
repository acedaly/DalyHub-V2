import { env } from "cloudflare:workers";
import { useCallback, useMemo } from "react";
import {
  isRouteErrorResponse,
  useRevalidator,
  useSearchParams,
} from "react-router";

import { formatPreferenceDate } from "~/kernel/preferences";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import { ownerCalendarIso } from "~/shared/datetime";
import {
  DrawerProvider,
  type DrawerEntry,
  type DrawerRenderResult,
} from "~/shared/drawer";
import { EmptyState } from "~/shared/empty-state";
import { EntityIcon } from "~/shared/entity";
import { TaskRecordDrawer } from "~/shared/task-record/TaskRecordDrawer";

import { ReviewRecord } from "../ReviewRecord";
import { loadReviewInsights } from "../insights/review-insights-context";
import { loadReviewPeriodContext } from "../review-period-context";
import { serializeReview } from "../review-view";
import type { Route } from "./+types/detail";

export function meta() {
  return [{ title: "Review · DalyHub" }];
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);
  const review = await scope.reviews.get(params.reviewId);
  if (!review) throw new Response("Not Found", { status: 404 });
  const preferences = await scope.appPreferences.get(session.user.subject);
  const today = ownerCalendarIso(new Date(), preferences.timezone);
  const now = new Date();
  const [periodContext, insights] = await Promise.all([
    loadReviewPeriodContext(scope, {
      periodStart: review.periodStart,
      periodEnd: review.periodEnd,
      today,
      timezone: preferences.timezone,
    }),
    // REVIEW-03 — the same evidence the guided weekly flow opens on, for EVERY
    // Review type. A monthly or quarterly Review compares itself against the
    // previous Review of its own type, so the horizons never get mixed.
    loadReviewInsights(scope, {
      review,
      now,
      timezone: preferences.timezone,
      todayIso: today,
      formatDate: (iso: string) =>
        formatPreferenceDate(iso, preferences.dateFormat),
    }),
  ]);
  return {
    review: serializeReview(review, preferences.dateFormat),
    context: periodContext,
    insights: insights.insights,
  };
}

export default function ReviewDetailRoute({
  loaderData,
}: Route.ComponentProps) {
  const renderDrawer = useMemo(() => createReviewDrawerRenderer(), []);
  return (
    <DrawerProvider renderDrawer={renderDrawer}>
      <ReviewDetail {...loaderData} />
    </DrawerProvider>
  );
}

function createReviewDrawerRenderer() {
  return function render(entry: DrawerEntry): DrawerRenderResult | null {
    const separator = entry.key.indexOf(":");
    const kind = separator === -1 ? entry.key : entry.key.slice(0, separator);
    const id = separator === -1 ? "" : entry.key.slice(separator + 1);
    if (kind === "task" && id.length > 0) {
      return {
        title: "Task",
        description: "Task record",
        children: <TaskRecordDrawer taskId={id} />,
      };
    }
    return null;
  };
}

const TAB_IDS = [
  "summary",
  "progress",
  "tasks",
  "diary",
  "people",
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

function ReviewDetail({
  review,
  context,
  insights,
}: Awaited<ReturnType<typeof loader>>) {
  const revalidator = useRevalidator();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTabId = parseTab(searchParams.get("tab"));
  const onTabChange = useCallback(
    (tabId: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (tabId === "summary") next.delete("tab");
          else next.set("tab", tabId);
          return next;
        },
        { replace: true, preventScrollReset: true },
      );
    },
    [setSearchParams],
  );

  return (
    <ReviewRecord
      review={review}
      context={context}
      insights={insights}
      activeTabId={activeTabId}
      onTabChange={onTabChange}
      onSaved={() => revalidator.revalidate()}
    />
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <div className="dh-review-not-found">
        <EmptyState
          icon={<EntityIcon type="review" />}
          title="We couldn’t find that Review"
          description="It may have been deleted, or the link is out of date."
          primaryAction={
            <a className="dh-btn dh-btn--primary" href="/reviews">
              Back to Reviews
            </a>
          }
        />
      </div>
    );
  }
  throw error;
}
