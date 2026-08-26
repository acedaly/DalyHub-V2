/**
 * REVIEW-02 / REVIEW-04 — the guided weekly Review route.
 *
 * ONE Review, two presentations. This route renders the SAME `review` entity the
 * canonical record at `/reviews/:reviewId` renders — same id, same lifecycle, same
 * period, same stored template version, same `review_sections`, same Activity,
 * same completion state. There is no guided-review record and no wizard-only copy
 * of anything.
 *
 * The URL contract (documented in REVIEWS_MODULE.md):
 *
 *   GET  /reviews/:id/guide             → resolves the owner's current step and
 *                                          REDIRECTS to it, so the canonical URL
 *                                          always names a real step.
 *   GET  /reviews/:id/guide?step=<id>   → that step. Deep-linkable, refreshable,
 *                                          Back/Forward-correct.
 *   POST /reviews/:id/guide             → deliberate navigation, step
 *                                          acknowledgement, prompt saves and
 *                                          completion; every one redirects back to
 *                                          a canonical step URL (POST-redirect-GET),
 *                                          so history stays clean and a refresh
 *                                          never re-submits.
 *
 * An unknown, missing or malformed step recovers by redirect to the current step —
 * a stale bookmark never dead-ends the owner out of their own Review.
 */

import { env } from "cloudflare:workers";
import { useCallback, useMemo } from "react";
import { isRouteErrorResponse, redirect, useSearchParams } from "react-router";

import {
  ReviewArchivedError,
  ReviewConflictError,
  ReviewValidationError,
  answeredReviewSectionIds,
  deriveWeeklyReviewProgress,
  parseWeeklyReviewStepId,
  resolveWeeklyReviewStep,
  weeklyReviewStep,
  type WeeklyReviewStepId,
} from "~/kernel/reviews";
import { formatPreferenceDate } from "~/kernel/preferences";
import { readAiAvailability } from "~/platform/ai";
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
import {
  TASK_DRAWER_TITLE,
  TaskRecordDrawer,
} from "~/shared/task-record/TaskRecordDrawer";

import { ReviewGuide } from "../guided/ReviewGuide";
import {
  loadReviewGuideStepData,
  readReviewInboxRemaining,
} from "../guided/review-guide-context";
import { captureSnapshotForCompletedReview } from "../insights/review-insights-context";
import {
  REVIEW_GUIDE_STEP_PARAM,
  reviewGuidePath,
  reviewRecordPath,
} from "../guided/review-guide-view";
import { serializeReview } from "../review-view";
import type { Route } from "./+types/guide";

export function meta() {
  return [{ title: "Guided Review · DalyHub" }];
}

/** The calm sentence a conflicting write reports. Never a storage detail. */
const CONFLICT_MESSAGE =
  "This Review changed somewhere else — the newer version is shown. Your text was not overwritten.";

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);
  const review = await scope.reviews.get(params.reviewId);
  if (!review) throw new Response("Not Found", { status: 404 });

  // The guided flow is the WEEKLY flow (REVIEW-02). Every other Review type keeps
  // its general-purpose record, unchanged — it is not a lesser experience, it is
  // the one that already exists.
  if (review.type !== "weekly") throw redirect(reviewRecordPath(review.id));
  // Archived Reviews are read-only until restored; the record's Settings tab is
  // where restore lives, so send the owner somewhere that can actually help.
  if (review.archivedAt)
    throw redirect(reviewRecordPath(review.id, "settings"));

  const preferences = await scope.appPreferences.get(session.user.subject);
  const todayIso = ownerCalendarIso(new Date(), preferences.timezone);
  const now = new Date();

  const [workflow, inboxRemaining] = await Promise.all([
    scope.reviews.getWorkflowState(review.id),
    readReviewInboxRemaining(scope, todayIso, preferences.timezone),
  ]);

  const progress = deriveWeeklyReviewProgress({
    status: review.status,
    answeredSectionIds: answeredReviewSectionIds(review.sections),
    inboxRemaining,
    acknowledgedSteps: workflow.acknowledgedSteps,
    bookmarkedStep: workflow.currentStep,
  });

  const url = new URL(request.url);
  const requested = url.searchParams.get(REVIEW_GUIDE_STEP_PARAM);
  const { stepId, recovered } = resolveWeeklyReviewStep(requested, progress);
  if (recovered) {
    // Canonicalise: a bare `/guide`, an unknown step or a typo all land on a real
    // step URL rather than rendering something the URL does not describe.
    throw redirect(reviewGuidePath(review.id, stepId));
  }

  const stepData = await loadReviewGuideStepData(
    scope,
    {
      review,
      stepId,
      now,
      timezone: preferences.timezone,
      todayIso,
      firstDayOfWeek: preferences.firstDayOfWeek,
      formatDate: (iso) => formatPreferenceDate(iso, preferences.dateFormat),
    },
    inboxRemaining,
  );

  return {
    // AI-01 — whether the Weekly Review assistant can run. Availability only:
    // the guide never sees a provider credential or a model name.
    aiAvailability: await readAiAvailability(
      scope,
      session.user.subject,
      "weekly-review-assistant",
      env,
    ),
    review: serializeReview(review, preferences.dateFormat),
    stepId,
    progress,
    stepData,
    inboxRemaining,
    workflowRevision: workflow.revision,
    todayIso,
    notice: url.searchParams.get("notice"),
  };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw new Response("Method Not Allowed", { status: 405 });
  }
  const session = requireAuthenticatedSession(context);
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);
  const reviewId = params.reviewId;
  const review = await scope.reviews.get(reviewId);
  if (!review) throw new Response("Not Found", { status: 404 });

  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const requestedStep = parseWeeklyReviewStepId(form.get("step"));

  /** Redirect back into the flow, optionally carrying one calm notice. */
  function back(stepId: WeeklyReviewStepId, notice?: string): Response {
    const path = reviewGuidePath(reviewId, stepId);
    return redirect(
      notice ? `${path}&notice=${encodeURIComponent(notice)}` : path,
    );
  }

  try {
    if (intent === "go" && requestedStep) {
      const revisionRaw = form.get("revision");
      const expectedRevision =
        typeof revisionRaw === "string" && /^\d+$/.test(revisionRaw)
          ? Number(revisionRaw)
          : undefined;
      // A DRAFT Review that the owner deliberately moves through is, truthfully,
      // in progress. This is the EXISTING lifecycle transition through the
      // existing contract — one `review.status_changed` event, once, on the first
      // deliberate move — not a workflow-only flag. Every later navigation is a
      // no-op here, so navigation itself still writes no Activity.
      if (review.status === "draft") {
        await scope.reviews.setStatus(reviewId, "in_progress");
      }
      const result = await scope.reviews.setWorkflowStep(
        reviewId,
        requestedStep,
        expectedRevision === undefined ? {} : { expectedRevision },
      );
      if (result.conflict) {
        // A second tab moved the bookmark. Follow ITS position rather than
        // overwriting it, and say so — calmly, once.
        return back(
          result.state.currentStep ?? requestedStep,
          "This Review moved on in another tab, so it opened where it is now.",
        );
      }
      return back(requestedStep);
    }

    if (intent === "acknowledge" || intent === "unacknowledge") {
      const target = parseWeeklyReviewStepId(form.get("target"));
      if (!target) {
        return back(requestedStep ?? "overview");
      }
      await scope.reviews.setStepAcknowledged(
        reviewId,
        target,
        intent === "acknowledge",
      );
      return back(requestedStep ?? target);
    }

    if (intent === "complete") {
      // The guided flow's own server-side gate. It uses the EXISTING completion
      // action and the existing Activity contract — there is no parallel
      // completion flag — but it refuses to complete on the owner's behalf while a
      // required step is neither done nor deliberately acknowledged.
      const timezone = (await scope.appPreferences.get(session.user.subject))
        .timezone;
      const todayIso = ownerCalendarIso(new Date(), timezone);
      const [workflow, inboxRemaining] = await Promise.all([
        scope.reviews.getWorkflowState(reviewId),
        readReviewInboxRemaining(scope, todayIso, timezone),
      ]);
      const progress = deriveWeeklyReviewProgress({
        status: review.status,
        answeredSectionIds: answeredReviewSectionIds(review.sections),
        inboxRemaining,
        acknowledgedSteps: workflow.acknowledgedSteps,
        bookmarkedStep: workflow.currentStep,
      });
      if (!progress.canComplete) {
        return back("complete", "blocked");
      }
      const completed = await scope.reviews.complete(reviewId);
      // REVIEW-03 — the same best-effort capture the record's Complete action
      // makes. One completion contract, one snapshot rule.
      await captureSnapshotForCompletedReview(
        scope,
        session.user.subject,
        completed.review,
      );
      return back("complete", "Review completed");
    }

    if (intent === "reopen") {
      await scope.reviews.reopen(reviewId);
      return back("complete", "Review reopened");
    }
  } catch (cause) {
    if (cause instanceof ReviewConflictError) {
      return back(requestedStep ?? "overview", CONFLICT_MESSAGE);
    }
    if (cause instanceof ReviewArchivedError) {
      return redirect(reviewRecordPath(reviewId, "settings"));
    }
    if (cause instanceof ReviewValidationError) {
      return back(requestedStep ?? "overview", cause.message);
    }
    return back(
      requestedStep ?? "overview",
      "That change couldn’t be saved. Please try again.",
    );
  }

  return back(requestedStep ?? "overview");
}

export default function ReviewGuideRoute({ loaderData }: Route.ComponentProps) {
  const renderDrawer = useMemo(() => createGuideDrawerRenderer(), []);
  return (
    <DrawerProvider renderDrawer={renderDrawer}>
      <GuideBody {...loaderData} />
    </DrawerProvider>
  );
}

function createGuideDrawerRenderer() {
  return function render(entry: DrawerEntry): DrawerRenderResult | null {
    const separator = entry.key.indexOf(":");
    const kind = separator === -1 ? entry.key : entry.key.slice(0, separator);
    const id = separator === -1 ? "" : entry.key.slice(separator + 1);
    if (kind === "task" && id.length > 0) {
      return {
        title: TASK_DRAWER_TITLE,
        children: <TaskRecordDrawer taskId={id} />,
      };
    }
    return null;
  };
}

function GuideBody(data: Awaited<ReturnType<typeof loader>>) {
  const [searchParams, setSearchParams] = useSearchParams();
  // The notice is a one-shot: clearing it from the URL means a refresh or a Back
  // never replays a stale "Saved" or a stale conflict warning.
  const dismissNotice = useCallback(() => {
    if (!searchParams.has("notice")) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("notice");
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  }, [searchParams, setSearchParams]);

  return (
    <ReviewGuide
      review={data.review}
      stepId={data.stepId}
      step={weeklyReviewStep(data.stepId)}
      progress={data.progress}
      stepData={data.stepData}
      inboxRemaining={data.inboxRemaining}
      workflowRevision={data.workflowRevision}
      todayIso={data.todayIso}
      notice={data.notice}
      aiAvailability={data.aiAvailability}
      onNoticeDismissed={dismissNotice}
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
