/**
 * REVIEW-02 / REVIEW-04 — the guided weekly Review shell.
 *
 * One component, two genuinely different shapes:
 *
 *   - **Desktop** uses the space it has: a persistent step rail beside the step's
 *     content, the Review's status and period always visible, and the reflection
 *     workspace kept to a comfortable reading measure rather than stretched across
 *     the window. It is not a giant phone wizard.
 *   - **Phone** shows ONE step at a time with a compact progress header, Back and
 *     Continue within thumb reach above the safe area, and a step sheet for direct
 *     navigation. It is not a desktop rail squeezed narrow.
 *
 * Both render the same steps, in the same order, from the same canonical registry,
 * against the same Review.
 *
 * Navigation is a real POST → redirect → GET: the step lives in the URL, so Back
 * and Forward work, a refresh is safe, and the deliberate move is what updates the
 * resume bookmark. Simply deep-linking to a step does not — the bookmark records
 * where the owner CHOSE to be.
 */

import { useEffect, useRef, useState } from "react";
import { Form, Link } from "react-router";

import {
  WEEKLY_REVIEW_STEP_STATE_LABELS,
  nextWeeklyReviewStep,
  previousWeeklyReviewStep,
  weeklyReviewProgressLabel,
  weeklyReviewStep,
  weeklyReviewStepAccessibleLabel,
  type WeeklyReviewProgress,
  type WeeklyReviewStepDefinition,
  type WeeklyReviewStepId,
} from "~/kernel/reviews";
import { Sheet, SheetOptionList } from "~/shared/sheet";
import { useCompactViewport } from "~/shared/viewport";

import type { SerializedReview } from "../review-view";
import {
  AlignmentStep,
  CompleteStep,
  FocusStep,
  type AiSurfaceAvailability,
  InboxStep,
  OverviewStep,
  ProjectsStep,
  ReflectionStep,
} from "./ReviewGuideSteps";
import type { ReviewGuideStepData } from "./review-guide-context";
import {
  completedStepsLabel,
  mobileProgressLabel,
  reviewRecordPath,
} from "./review-guide-view";

export interface ReviewGuideProps {
  readonly review: SerializedReview;
  readonly stepId: WeeklyReviewStepId;
  readonly step: WeeklyReviewStepDefinition;
  readonly progress: WeeklyReviewProgress;
  readonly stepData: ReviewGuideStepData;
  readonly inboxRemaining: number | null;
  readonly workflowRevision: number;
  readonly todayIso: string;
  readonly notice: string | null;
  readonly onNoticeDismissed: () => void;
  /** AI-01 — whether the Weekly Review assistant can run. Never a credential. */
  readonly aiAvailability: AiSurfaceAvailability | null;
}

export function ReviewGuide({
  review,
  stepId,
  step,
  progress,
  stepData,
  inboxRemaining,
  workflowRevision,
  todayIso,
  notice,
  aiAvailability,
  onNoticeDismissed,
}: ReviewGuideProps) {
  const compact = useCompactViewport();
  const [stepsOpen, setStepsOpen] = useState(false);
  const stepsButtonRef = useRef<HTMLButtonElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const mounted = useRef(false);

  const readOnly = review.status === "completed" || review.archived;
  const blocked = notice === "blocked";
  const previous = previousWeeklyReviewStep(stepId);
  const next = nextWeeklyReviewStep(stepId);
  const currentProgress = progress.steps.find((item) => item.id === stepId);

  /*
   * Focus moves to the step heading after a DELIBERATE move, never on first
   * paint. A fresh load (or a refresh at a deep link) leaves focus where the
   * browser put it, so nothing is stolen from a user who has just arrived.
   */
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    headingRef.current?.focus();
  }, [stepId]);

  // The notice is a one-shot. Clearing it from the URL after it has been
  // announced means Back, Forward and refresh never replay a stale message.
  useEffect(() => {
    if (notice === null) return;
    const timer = setTimeout(onNoticeDismissed, 4000);
    return () => clearTimeout(timer);
  }, [notice, onNoticeDismissed]);

  return (
    <div className="dh-review-guide">
      <header className="dh-review-guide__header">
        <p className="dh-review-guide__breadcrumb">
          <Link to="/reviews">Reviews</Link>
        </p>
        <h1>{review.title}</h1>
        <p className="dh-review-guide__meta">
          <span className="dh-review-guide__status" data-status={review.status}>
            {review.statusLabel}
          </span>
          <span>{review.periodLabel}</span>
          <span>Updated {review.updatedLabel}</span>
        </p>
        <p className="dh-review-guide__exit">
          <Link
            className="dh-btn dh-btn--ghost"
            to={reviewRecordPath(review.id)}
          >
            Open the full Review
          </Link>
          <Link className="dh-btn dh-btn--ghost" to="/reviews">
            Save and exit
          </Link>
        </p>
      </header>

      {/* Every navigation, acknowledgement and completion posts through here. */}
      <p className="dh-visually-hidden" role="status">
        {notice !== null && notice !== "blocked" ? notice : ""}
      </p>

      <div className="dh-review-guide__body">
        {/*
          The desktop rail. It is a real list of real submit buttons inside one
          form, so every step is keyboard-operable, and the state of each is
          carried by a text label (Done / Current step / Not started) as well as
          its treatment — never by colour alone.
        */}
        <Form
          method="post"
          className="dh-review-guide__rail"
          aria-label="Review steps"
        >
          <input type="hidden" name="intent" value="go" />
          <input type="hidden" name="revision" value={workflowRevision} />
          <p className="dh-review-guide__rail-progress">
            {completedStepsLabel(progress)}
          </p>
          <ol>
            {progress.steps.map((item) => (
              <li key={item.id}>
                <button
                  type="submit"
                  name="step"
                  value={item.id}
                  className="dh-review-guide__rail-step"
                  data-state={item.state}
                  aria-current={item.current ? "step" : undefined}
                  aria-label={weeklyReviewStepAccessibleLabel(
                    item.id,
                    item.state,
                  )}
                >
                  <span
                    className="dh-review-guide__rail-order"
                    aria-hidden="true"
                  >
                    {item.order}
                  </span>
                  <span className="dh-review-guide__rail-text">
                    <span className="dh-review-guide__rail-label">
                      {item.label}
                    </span>
                    <span className="dh-review-guide__rail-state">
                      {WEEKLY_REVIEW_STEP_STATE_LABELS[item.state]}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </Form>

        <section
          className="dh-review-guide__panel"
          aria-labelledby="dh-review-guide-step-heading"
        >
          {/* REVIEW-04 — the phone stepper's compact progress header. */}
          <div className="dh-review-guide__stepper">
            <p className="dh-review-guide__stepper-progress">
              {mobileProgressLabel(stepId, step.mobileLabel)}
            </p>
            <div
              className="dh-review-guide__stepper-track"
              role="progressbar"
              aria-label="Review progress"
              aria-valuemin={1}
              aria-valuemax={progress.totalCount}
              aria-valuenow={step.order}
              aria-valuetext={weeklyReviewProgressLabel(stepId)}
            >
              <span
                className="dh-review-guide__stepper-fill"
                style={{
                  inlineSize: `${(step.order / progress.totalCount) * 100}%`,
                }}
              />
            </div>
            <button
              type="button"
              className="dh-btn dh-btn--ghost dh-review-guide__stepper-menu"
              ref={stepsButtonRef}
              onClick={() => setStepsOpen(true)}
            >
              All steps
            </button>
          </div>

          <h2 id="dh-review-guide-step-heading" tabIndex={-1} ref={headingRef}>
            {step.label}
          </h2>
          <p className="dh-review-guide__step-description">
            {step.description}
          </p>

          <StepBody
            review={review}
            step={step}
            stepData={stepData}
            progress={progress}
            inboxRemaining={inboxRemaining}
            todayIso={todayIso}
            readOnly={readOnly}
            blocked={blocked}
            revision={workflowRevision}
            acknowledged={currentProgress?.acknowledged === true}
            aiAvailability={aiAvailability}
          />

          {/*
            The step's own controls. Acknowledgement is a SEPARATE, explicit
            decision from moving on: continuing never marks a step done, so a
            step the owner merely walked past is never reported as reviewed.
          */}
          {step.acknowledgeable && !readOnly ? (
            <Form method="post" className="dh-review-guide__acknowledge">
              <input type="hidden" name="step" value={stepId} />
              <input type="hidden" name="target" value={stepId} />
              <button
                className="dh-btn dh-btn--secondary"
                type="submit"
                name="intent"
                value={
                  currentProgress?.acknowledged === true
                    ? "unacknowledge"
                    : "acknowledge"
                }
              >
                {currentProgress?.acknowledged === true
                  ? "Undo ‘reviewed’"
                  : (step.acknowledgeLabel ?? "Mark this step reviewed")}
              </button>
              {currentProgress?.derivedComplete === true ? (
                <span className="dh-review-guide__note">
                  This step is already done from what you have recorded.
                </span>
              ) : null}
            </Form>
          ) : null}

          <Form method="post" className="dh-review-guide__nav">
            <input type="hidden" name="intent" value="go" />
            <input type="hidden" name="revision" value={workflowRevision} />
            {previous ? (
              <button
                className="dh-btn dh-btn--secondary"
                type="submit"
                name="step"
                value={previous}
              >
                Back: {weeklyReviewStep(previous).mobileLabel}
              </button>
            ) : (
              <span />
            )}
            {next ? (
              <button
                className="dh-btn dh-btn--primary"
                type="submit"
                name="step"
                value={next}
              >
                Continue: {weeklyReviewStep(next).mobileLabel}
              </button>
            ) : (
              <span />
            )}
          </Form>
        </section>
      </div>

      {compact && stepsOpen ? (
        <Sheet
          title="Review steps"
          description={completedStepsLabel(progress)}
          opener={stepsButtonRef.current}
          onClose={() => setStepsOpen(false)}
        >
          <Form
            method="post"
            onSubmit={() => setStepsOpen(false)}
            aria-label="Go to a Review step"
          >
            <input type="hidden" name="intent" value="go" />
            <input type="hidden" name="revision" value={workflowRevision} />
            <SheetOptionList label="Review steps">
              {progress.steps.map((item) => (
                <SheetStepOption
                  key={item.id}
                  id={item.id}
                  label={`${item.order}. ${item.label}`}
                  description={WEEKLY_REVIEW_STEP_STATE_LABELS[item.state]}
                  selected={item.current}
                />
              ))}
            </SheetOptionList>
          </Form>
        </Sheet>
      ) : null}
    </div>
  );
}

/**
 * A step row inside the phone sheet. It is a real submit button in the sheet's
 * form (rather than `SheetOption`'s click handler) so navigation stays one POST →
 * redirect → GET and works identically to the rail.
 */
function SheetStepOption({
  id,
  label,
  description,
  selected,
}: {
  readonly id: WeeklyReviewStepId;
  readonly label: string;
  readonly description: string;
  readonly selected: boolean;
}) {
  return (
    <button
      type="submit"
      name="step"
      value={id}
      className="dh-sheet-option"
      aria-pressed={selected}
    >
      <span className="dh-sheet-option__text">
        <span className="dh-sheet-option__label">{label}</span>
        <span className="dh-sheet-option__description">{description}</span>
      </span>
    </button>
  );
}

function StepBody({
  review,
  step,
  stepData,
  progress,
  inboxRemaining,
  todayIso,
  readOnly,
  blocked,
  aiAvailability,
  revision,
  acknowledged,
}: {
  readonly review: SerializedReview;
  readonly step: WeeklyReviewStepDefinition;
  readonly stepData: ReviewGuideStepData;
  readonly progress: WeeklyReviewProgress;
  readonly inboxRemaining: number | null;
  readonly todayIso: string;
  readonly readOnly: boolean;
  readonly blocked: boolean;
  readonly aiAvailability: AiSurfaceAvailability | null;
  readonly revision: number;
  readonly acknowledged: boolean;
}) {
  switch (stepData.kind) {
    case "period":
      return (
        <OverviewStep
          review={review}
          period={stepData.period}
          inboxRemaining={inboxRemaining}
        />
      );
    case "inbox":
      return (
        <InboxStep
          inbox={stepData.inbox}
          todayIso={todayIso}
          acknowledged={acknowledged}
        />
      );
    case "projects":
      return <ProjectsStep projects={stepData.projects} />;
    case "alignment":
      return <AlignmentStep alignment={stepData.alignment} />;
    case "sections":
      return (
        <ReflectionStep
          review={review}
          step={step}
          readOnly={readOnly}
          onSaved={() => undefined}
        />
      );
    case "focus":
      return (
        <FocusStep
          review={review}
          step={step}
          readOnly={readOnly}
          priorFocus={stepData.priorFocus}
          onSaved={() => undefined}
          aiAvailability={aiAvailability}
        />
      );
    case "summary":
      return (
        <CompleteStep
          review={review}
          progress={progress}
          inboxRemaining={inboxRemaining}
          reflectionSectionIds={weeklyReviewStep("reflection").sectionIds}
          focusSectionIds={weeklyReviewStep("focus").sectionIds}
          blocked={blocked}
          revision={revision}
        />
      );
  }
}
