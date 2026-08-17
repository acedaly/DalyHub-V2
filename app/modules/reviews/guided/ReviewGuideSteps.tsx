/**
 * REVIEW-02 — the bodies of the guided weekly Review's steps.
 *
 * Each one renders the bounded projection its step asked for and nothing else. No
 * step queries a repository, no step owns a mutation, and no step invents a
 * vocabulary: Inbox triage is the shared `TaskQuickEditPanel` posting to the
 * canonical Task routes, Project health is PROJ-02's indicator, Goal alignment is
 * AREA-03's, and reflection is the Review's own stored prompts.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useFetcher, useRevalidator } from "react-router";

import type {
  WeeklyReviewProgress,
  WeeklyReviewStepDefinition,
} from "~/kernel/reviews";
import { EmptyState } from "~/shared/empty-state";
import { FormButton } from "~/shared/forms";
import { AiWeeklyReviewSurface } from "~/shared/ai";
import type { ReviewInsights } from "~/kernel/review-insights";
import { AlignmentIndicator } from "~/shared/alignment";
import { HealthIndicator } from "~/shared/project-health";
import { TaskQuickEditPanel } from "~/shared/task-record/TaskQuickEditPanel";
import { useCompactViewport } from "~/shared/viewport";

/**
 * AI-01 — availability, resolved by the guide route's loader. The step never
 * reads configuration and never sees a credential.
 */
export interface AiSurfaceAvailability {
  readonly enabled: boolean;
  readonly providerConfigured: boolean;
  readonly featureAllowed: boolean;
  readonly budgetExhausted: boolean;
}

import type { SerializedReview } from "../review-view";
import { ReviewInsightsPanel } from "../insights/ReviewInsightsPanel";
import { ReviewPromptEditor } from "./ReviewPromptEditor";
import type {
  ReviewAlignmentContext,
  ReviewInboxContext,
  ReviewProjectsContext,
  SerializedPriorFocus,
} from "./review-guide-context";
import {
  inboxCompletionOutcome,
  reviewCompletionSummary,
  reviewGuidePrompts,
  reviewRecordPath,
  type ReviewGuidePrompt,
} from "./review-guide-view";

/* -------------------------------------------------------------------------- */
/* Shared bits                                                                 */
/* -------------------------------------------------------------------------- */

function Unavailable({ what }: { readonly what: string }) {
  return (
    <p className="dh-review-guide__unavailable">
      We couldn’t load {what} just now. Nothing in your Review has changed — the
      rest of this step still works, and you can come back to it.
    </p>
  );
}

/* -------------------------------------------------------------------------- */
/* Step 1 — Settle in                                                          */
/* -------------------------------------------------------------------------- */

export function OverviewStep({
  review,
  insights,
  inboxRemaining,
}: {
  readonly review: SerializedReview;
  readonly insights: ReviewInsights;
  readonly inboxRemaining: number | null;
}) {
  return (
    <div className="dh-review-guide__stack">
      <ReviewInsightsPanel insights={insights} headingLevel={3} />
      <p className="dh-review-guide__note">
        Evidence for {review.periodLabel}, derived from your own records.{" "}
        {inboxRemaining === null
          ? "The Inbox count could not be read just now."
          : inboxRemaining === 0
            ? "Your Inbox is clear."
            : `${inboxRemaining} ${inboxRemaining === 1 ? "Task is" : "Tasks are"} still in the Inbox — the next step is where you file them.`}{" "}
        Nothing here is written into the Review; what you make of it is yours to
        write.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Step 2 — Clear the Inbox                                                    */
/* -------------------------------------------------------------------------- */

export function InboxStep({
  inbox,
  todayIso,
  acknowledged,
}: {
  readonly inbox: ReviewInboxContext;
  readonly todayIso: string;
  readonly acknowledged: boolean;
}) {
  const revalidator = useRevalidator();
  const completion = useFetcher();
  const [index, setIndex] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  /** A refusal the owner must SEE, not only hear. */
  const [completionError, setCompletionError] = useState<string | null>(null);
  const headingRef = useRef<HTMLParagraphElement | null>(null);
  const settled = useRef<unknown>(null);

  const items = inbox.tasks;
  const total = items.length;
  // The queue shrinks under us as Tasks are filed, so the cursor is clamped
  // rather than allowed to run off the end.
  const position = total === 0 ? 0 : Math.min(index, total - 1);
  const current = total === 0 ? null : items[position];

  useEffect(() => {
    if (index > 0 && index > total - 1) setIndex(Math.max(0, total - 1));
  }, [index, total]);

  // Focus lands on the queue position whenever the reviewed Task changes, so a
  // keyboard or screen-reader user is never left focused on a control that has
  // moved to a different Task.
  useEffect(() => {
    headingRef.current?.focus();
  }, [current?.id]);

  /**
   * Announce the SERVER's answer, never the attempt.
   *
   * `/tasks/:taskId` genuinely refuses a completion — an archived Project, a Task
   * deleted in another tab, any storage failure — and says so with
   * `{ kind: "completion", ok: false, message }`. Reporting "Task completed" for
   * every settled response would tell the owner, and a screen reader, that work
   * finished when it did not, which is exactly the failure a Review must never
   * introduce. A refusal announces the route's own message and does not
   * revalidate, so the Task stays in the queue where the owner can retry it.
   */
  useEffect(() => {
    if (completion.state !== "idle" || !completion.data) return;
    if (settled.current === completion.data) return;
    settled.current = completion.data;
    const outcome = inboxCompletionOutcome(completion.data);
    setAnnouncement(outcome.message);
    if (!outcome.ok) {
      // The Task stays in the queue, where the owner can see the refusal and
      // retry it. Revalidating would only re-fetch the same unchanged Task.
      setCompletionError(outcome.message);
      return;
    }
    setCompletionError(null);
    revalidator.revalidate();
  }, [completion.state, completion.data, revalidator]);

  const complete = useCallback(() => {
    if (!current) return;
    const body = new FormData();
    body.set("intent", "complete");
    completion.submit(body, { method: "post", action: `/tasks/${current.id}` });
  }, [completion, current]);

  if (inbox.unavailable) {
    return <Unavailable what="your Inbox" />;
  }

  if (current === null || current === undefined) {
    return (
      <div className="dh-review-guide__stack">
        <EmptyState
          title="Inbox is clear"
          description="Every captured Task has a home. New captures land here for triage."
          primaryAction={
            <Link className="dh-btn dh-btn--secondary" to="/tasks?system=inbox">
              Open the Inbox
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="dh-review-guide__stack">
      <p className="dh-visually-hidden" role="status">
        {announcement}
      </p>
      <p className="dh-review-guide__queue" tabIndex={-1} ref={headingRef}>
        Task {position + 1} of {total} on this page ·{" "}
        <strong>{inbox.remaining}</strong>{" "}
        {inbox.remaining === 1 ? "Task" : "Tasks"} in the Inbox
        {acknowledged ? " · step marked reviewed" : ""}
      </p>

      {completionError !== null ? (
        <p className="dh-review-guide__unavailable">{completionError}</p>
      ) : null}

      <TaskQuickEditPanel
        key={current.id}
        task={current}
        todayIso={todayIso}
        onChanged={(message) => {
          setAnnouncement(message);
          revalidator.revalidate();
        }}
        footer={
          <div className="dh-review-guide__task-actions">
            <FormButton
              type="button"
              variant="primary"
              disabled={completion.state !== "idle"}
              onClick={() => {
                setCompletionError(null);
                complete();
              }}
            >
              Complete
            </FormButton>
            <FormButton
              type="button"
              variant="secondary"
              onClick={() => {
                setIndex((value) => value + 1);
                setAnnouncement("Skipped to the next task.");
              }}
              disabled={position >= total - 1}
            >
              Leave in Inbox
            </FormButton>
            <FormButton
              type="button"
              variant="ghost"
              onClick={() => setIndex((value) => Math.max(0, value - 1))}
              disabled={position === 0}
            >
              Previous
            </FormButton>
            <Link
              className="dh-btn dh-btn--ghost"
              to={`/tasks?system=inbox&drawer=task:${current.id}`}
            >
              Open Task
            </Link>
          </div>
        }
      />

      {inbox.nextCursor !== null ? (
        <p className="dh-review-guide__note">
          This page holds {total} of {inbox.remaining} Inbox Tasks. Filing these
          brings the next ones in — or work through the whole list in{" "}
          <Link to="/tasks/review">Review Inbox</Link>.
        </p>
      ) : null}
      <p className="dh-review-guide__note">
        A Task does not need a Project. Leaving something in the Inbox on
        purpose is a decision, not a failure — mark the step reviewed and carry
        on.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Step 3 — Review Projects                                                    */
/* -------------------------------------------------------------------------- */

export function ProjectsStep({
  projects,
}: {
  readonly projects: ReviewProjectsContext;
}) {
  if (projects.unavailable) return <Unavailable what="your Projects" />;
  if (projects.projects.length === 0) {
    return (
      <EmptyState
        title="No Projects to review"
        description="Projects appear here once you have one open, or one that finished during this period."
        primaryAction={
          <Link className="dh-btn dh-btn--secondary" to="/projects">
            Open Projects
          </Link>
        }
      />
    );
  }

  return (
    <div className="dh-review-guide__stack">
      <ul className="dh-review-guide__projects">
        {projects.projects.map((project) => (
          <li className="dh-review-guide__project" key={project.id}>
            <div className="dh-review-guide__project-head">
              <h3>
                <Link to={`/projects/${encodeURIComponent(project.id)}`}>
                  {project.title}
                </Link>
              </h3>
              <span className="dh-review-guide__project-status">
                {project.statusLabel}
              </span>
            </div>
            <p className="dh-review-guide__project-context">
              {project.areaTitle ?? "No Area"}
              {project.goalTitle ? ` · ${project.goalTitle}` : " · No Goal"}
            </p>
            {project.health ? (
              <HealthIndicator health={project.health} showReason />
            ) : null}
            <dl className="dh-review-guide__project-counts">
              <div>
                <dt>Open</dt>
                <dd>{project.openTasks}</dd>
              </div>
              <div>
                <dt>Overdue</dt>
                <dd>{project.overdueTasks}</dd>
              </div>
              <div>
                <dt>Waiting</dt>
                <dd>{project.waitingTasks}</dd>
              </div>
              <div>
                <dt>Done this period</dt>
                <dd>{project.completedInPeriod}</dd>
              </div>
              <div>
                <dt>Last activity</dt>
                <dd>
                  {project.lastActivityDate ?? "None recorded"}
                  {project.daysSinceActivity !== null
                    ? ` (${project.daysSinceActivity} days ago)`
                    : ""}
                </dd>
              </div>
            </dl>
            <p className="dh-review-guide__project-next">
              {project.nextAction ? (
                <>
                  <span className="dh-review-guide__label">Next action</span>{" "}
                  {project.nextAction.title}
                </>
              ) : (
                <>
                  <span className="dh-review-guide__label">Next action</span> No
                  next action visible here.{" "}
                  <Link to={`/tasks?project=${encodeURIComponent(project.id)}`}>
                    Open its Tasks
                  </Link>
                </>
              )}
            </p>
            <p className="dh-review-guide__project-actions">
              <Link
                className="dh-btn dh-btn--ghost"
                to={`/projects/${encodeURIComponent(project.id)}`}
              >
                Open Project
              </Link>
              <Link
                className="dh-btn dh-btn--ghost"
                to={`/projects/${encodeURIComponent(project.id)}?tab=settings`}
              >
                Change status
              </Link>
            </p>
          </li>
        ))}
      </ul>
      {projects.hasMore ? (
        <p className="dh-review-guide__note">
          This step shows the Projects most worth a look first. Your workspace
          has more — <Link to="/projects">open Projects</Link> for the full
          list, then come back; your place in the Review is kept.
        </p>
      ) : null}
      <p className="dh-review-guide__note">
        Ordered by what most likely needs a decision: blocked or at-risk work
        first, then overdue work, then Projects with no visible next action,
        then recently active ones, then anything completed during this period.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Step 4 — Goals and Areas                                                    */
/* -------------------------------------------------------------------------- */

export function AlignmentStep({
  alignment,
}: {
  readonly alignment: ReviewAlignmentContext;
}) {
  if (alignment.unavailable) return <Unavailable what="your Goals and Areas" />;

  return (
    <div className="dh-review-guide__stack">
      <section aria-labelledby="guide-goals-heading">
        <h3 id="guide-goals-heading">Goals</h3>
        {alignment.goals.length === 0 ? (
          <p className="dh-review-muted">
            No Goals yet. Projects can sit directly under an Area — a Goal is an
            offer, never a requirement. <Link to="/goals">Open Goals</Link>
          </p>
        ) : (
          <ul className="dh-review-guide__goals">
            {alignment.goals.map((goal) => (
              <li key={goal.id}>
                <Link to={`/goals/${encodeURIComponent(goal.id)}`}>
                  {goal.title}
                </Link>
                <AlignmentIndicator alignment={goal.alignment} showReason />
                <span className="dh-review-guide__note">
                  {goal.contributingProjects === 0
                    ? "No active Project currently contributes to this Goal"
                    : `${goal.activeContributingProjects} of ${goal.contributingProjects} contributing Projects are active`}
                </span>
              </li>
            ))}
          </ul>
        )}
        {alignment.goalsHasMore ? (
          <p className="dh-review-guide__note">
            The Goals most worth a look are shown first.{" "}
            <Link to="/goals">Open Goals</Link> for the rest.
          </p>
        ) : null}
      </section>

      <section aria-labelledby="guide-areas-heading">
        <h3 id="guide-areas-heading">Areas</h3>
        {alignment.areas.length === 0 ? (
          <p className="dh-review-muted">
            No Areas yet. <Link to="/areas">Open Areas</Link>
          </p>
        ) : (
          <ul className="dh-review-guide__areas">
            {alignment.areas.map((area) => (
              <li key={area.id}>
                <Link to={`/areas/${encodeURIComponent(area.id)}`}>
                  {area.title}
                </Link>
                <span className="dh-review-guide__note">
                  {area.attended
                    ? `${area.activeProjects} active ${area.activeProjects === 1 ? "Project" : "Projects"}`
                    : "No supporting activity recorded this period"}
                </span>
              </li>
            ))}
          </ul>
        )}
        {alignment.areasHasMore ? (
          <p className="dh-review-guide__note">
            More Areas exist than this step shows.{" "}
            <Link to="/areas">Open Areas</Link>.
          </p>
        ) : null}
      </section>

      <p className="dh-review-guide__note">
        {alignment.activeProjectsConsidered === 0
          ? "No active Projects to align yet."
          : alignment.projectsWithoutGoal === 0
            ? "Every active Project is linked to a Goal."
            : `${alignment.projectsWithoutGoal} of ${alignment.activeProjectsConsidered} active Projects have no Goal linked.`}{" "}
        This is derived live from your Goals, Projects and Activity. Nothing
        here is scored or stored.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Step 5 — Reflect                                                            */
/* -------------------------------------------------------------------------- */

export function ReflectionStep({
  review,
  step,
  readOnly,
  onSaved,
}: {
  readonly review: SerializedReview;
  readonly step: WeeklyReviewStepDefinition;
  readonly readOnly: boolean;
  readonly onSaved: () => void;
}) {
  const prompts = reviewGuidePrompts(review, step.sectionIds);
  const compact = useCompactViewport();
  const [index, setIndex] = useState(0);
  const position =
    prompts.length === 0 ? 0 : Math.min(index, prompts.length - 1);
  const current: ReviewGuidePrompt | undefined = prompts[position];

  if (prompts.length === 0 || !current) {
    return (
      <p className="dh-review-muted">
        This Review’s template ({review.templateId}) defines no reflection
        prompts for this step.
      </p>
    );
  }

  return (
    <div className="dh-review-guide__stack">
      {/*
        The prompt sub-navigation. On desktop it is a visible list, so the larger
        reflection workspace can jump straight to a prompt; on a phone it is
        omitted and the previous/next controls below carry the sequence. Both use
        the SAME order and the SAME responses — the order is the Review's own
        stored template's, never a second list.
      */}
      {!compact ? (
        <nav
          aria-label="Reflection prompts"
          className="dh-review-guide__prompts-nav"
        >
          <ol>
            {prompts.map((prompt, promptIndex) => (
              <li key={prompt.sectionId}>
                <button
                  type="button"
                  aria-current={promptIndex === position ? "true" : undefined}
                  onClick={() => setIndex(promptIndex)}
                >
                  <span className="dh-review-guide__prompt-nav-label">
                    {prompt.label}
                  </span>
                  <span className="dh-review-guide__prompt-nav-state">
                    {prompt.answered ? "Answered" : "Not answered"}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
      ) : null}

      <p className="dh-review-guide__queue">
        Prompt {position + 1} of {prompts.length}
      </p>

      <ReviewPromptEditor
        key={current.sectionId}
        reviewId={review.id}
        prompt={current}
        readOnly={readOnly}
        rows={compact ? 10 : 14}
        onSaved={onSaved}
      />

      <div className="dh-review-guide__prompt-move">
        <FormButton
          type="button"
          variant="secondary"
          disabled={position === 0}
          onClick={() => setIndex(position - 1)}
        >
          Previous prompt
        </FormButton>
        <FormButton
          type="button"
          variant="secondary"
          disabled={position >= prompts.length - 1}
          onClick={() => setIndex(position + 1)}
        >
          Next prompt
        </FormButton>
      </div>
      <p className="dh-review-guide__note">
        Moving between prompts never marks one answered — only what you write
        does. Everything is saved into this Review’s own sections, so it reads
        the same on the full record, on your phone and after you finish.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Step 6 — Next week's focus                                                  */
/* -------------------------------------------------------------------------- */

export function FocusStep({
  review,
  step,
  readOnly,
  priorFocus,
  onSaved,
  aiAvailability,
}: {
  readonly review: SerializedReview;
  readonly step: WeeklyReviewStepDefinition;
  readonly readOnly: boolean;
  readonly priorFocus: SerializedPriorFocus | null;
  readonly onSaved: () => void;
  readonly aiAvailability: AiSurfaceAvailability | null;
}) {
  const prompts = reviewGuidePrompts(review, step.sectionIds);
  const current = prompts[0];
  // AI-01 — accepted assistant text is appended to what the owner has written,
  // and still requires their own save. Nothing here writes to the Review.
  const [appendRequest, setAppendRequest] = useState<{
    text: string;
    nonce: number;
  } | null>(null);

  return (
    <div className="dh-review-guide__stack">
      {priorFocus ? (
        <section
          className="dh-review-guide__prior-focus"
          aria-labelledby="guide-prior-focus-heading"
        >
          <h3 id="guide-prior-focus-heading">Last week you wrote</h3>
          <div className="dh-review-section-readonly">
            <pre>{priorFocus.body}</pre>
          </div>
          <p className="dh-review-guide__note">
            From{" "}
            <Link to={reviewRecordPath(priorFocus.reviewId)}>
              {priorFocus.reviewTitle}
            </Link>{" "}
            ({priorFocus.periodLabel}). It is read from that Review, never
            copied into this one — completing this Review replaces it as the
            current focus.
          </p>
        </section>
      ) : (
        <p className="dh-review-guide__note">
          No completed weekly Review has recorded a focus before this period
          yet.
        </p>
      )}

      {aiAvailability !== null && !readOnly ? (
        <AiWeeklyReviewSurface
          reviewId={review.id}
          availability={aiAvailability}
          onAccept={(text) =>
            setAppendRequest((previous) => ({
              text,
              nonce: (previous?.nonce ?? 0) + 1,
            }))
          }
        />
      ) : null}

      {current ? (
        <ReviewPromptEditor
          reviewId={review.id}
          prompt={current}
          readOnly={readOnly}
          rows={10}
          onSaved={onSaved}
          appendRequest={appendRequest}
        />
      ) : (
        <p className="dh-review-muted">
          This Review’s template ({review.templateId}) has no focus section.
        </p>
      )}

      <p className="dh-review-guide__note">
        Up to three outcomes, the Projects you want to move, and anything you
        are waiting on. Write it however you like — it is ordinary Markdown in
        this Review’s next-period focus section.
      </p>

      <section aria-labelledby="guide-close-out-heading">
        <h3 id="guide-close-out-heading">Set it up</h3>
        <p className="dh-review-guide__close-out">
          {/*
           * PLAN-01 — the REVIEW → PLAN handoff, as a link and nothing more.
           *
           * A Review is retrospective and changes nothing; Weekly Planning is
           * where the owner places real work on real days. Making that the FIRST
           * action here is the whole of the handoff: no Task is created from this
           * prose, no date is chosen for anybody, and the Review is not modified
           * by following it (the planner only READS the focus this step wrote).
           * Completing the Review is deliberately NOT dependent on planning —
           * "complete and leave" stays a first-class ending.
           */}
          <Link className="dh-btn dh-btn--primary" to="/plan?week=next">
            Plan next week
          </Link>
          <Link className="dh-btn dh-btn--ghost" to="/today">
            Open Today
          </Link>
          <Link className="dh-btn dh-btn--ghost" to="/tasks?system=inbox">
            Capture a Task
          </Link>
          <Link className="dh-btn dh-btn--ghost" to="/projects">
            Open Projects
          </Link>
        </p>
        <p className="dh-review-guide__note">
          Nothing is scheduled or changed for you. Writing a focus never creates
          a Task or edits a Project — and Weekly planning shows this focus beside
          the week without copying it, so you decide what happens next.
        </p>
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Step 7 — Complete                                                           */
/* -------------------------------------------------------------------------- */

export function CompleteStep({
  review,
  progress,
  inboxRemaining,
  reflectionSectionIds,
  focusSectionIds,
  blocked,
  revision,
}: {
  readonly review: SerializedReview;
  readonly progress: WeeklyReviewProgress;
  readonly inboxRemaining: number | null;
  readonly reflectionSectionIds: WeeklyReviewStepDefinition["sectionIds"];
  readonly focusSectionIds: WeeklyReviewStepDefinition["sectionIds"];
  readonly blocked: boolean;
  readonly revision: number;
}) {
  const summary = reviewCompletionSummary({
    progress,
    review,
    inboxRemaining,
    reflectionSectionIds,
    focusSectionIds,
  });
  const blockersRef = useRef<HTMLDivElement | null>(null);

  // When completion is refused, the reason takes focus — a blocked action that
  // says nothing where the user is looking is the same as no message at all.
  useEffect(() => {
    if (blocked) blockersRef.current?.focus();
  }, [blocked]);

  const completed = review.status === "completed";

  return (
    <div className="dh-review-guide__stack">
      <dl className="dh-review-guide__summary">
        {summary.map((line) => (
          <div key={line.id} data-outstanding={line.outstanding}>
            <dt>{line.label}</dt>
            <dd>{line.value}</dd>
          </div>
        ))}
      </dl>

      {progress.blockers.length > 0 ? (
        <div
          className="dh-review-guide__blockers"
          role={blocked ? "alert" : "group"}
          tabIndex={-1}
          ref={blockersRef}
          aria-labelledby="guide-blockers-heading"
        >
          <h3 id="guide-blockers-heading">Before completing</h3>
          <ul>
            {progress.blockers.map((blocker) => (
              <li key={blocker.stepId}>{blocker.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {completed ? (
        <p className="dh-review-guide__note">
          Completed {review.completedLabel}. Reopening restores editing and
          keeps the earlier completion in this Review’s Activity.
        </p>
      ) : (
        <p className="dh-review-guide__note">
          Completing makes this Review’s reflection read-only and records one
          completion event in its Activity. An Inbox that is not empty and
          unanswered optional prompts never block it.
        </p>
      )}

      <form method="post" className="dh-review-guide__complete-actions">
        <input type="hidden" name="step" value="complete" />
        <input type="hidden" name="revision" value={revision} />
        {completed ? (
          <button
            className="dh-btn dh-btn--secondary"
            type="submit"
            name="intent"
            value="reopen"
          >
            Reopen Review
          </button>
        ) : (
          <button
            className="dh-btn dh-btn--primary"
            type="submit"
            name="intent"
            value="complete"
            disabled={!progress.canComplete}
          >
            Complete Review
          </button>
        )}
        {/*
         * PLAN-01 — the second door onto planning, at the END of the flow.
         *
         * The Review is finished here, and "what now?" is the question the screen
         * leaves the owner with. It is a plain link out, not a step: completing
         * the Review neither requires nor triggers planning, and leaving is still
         * a complete ending.
         */}
        <Link className="dh-btn dh-btn--secondary" to="/plan?week=next">
          Plan next week
        </Link>
        <Link className="dh-btn dh-btn--ghost" to={reviewRecordPath(review.id)}>
          Open the full Review
        </Link>
      </form>
    </div>
  );
}
