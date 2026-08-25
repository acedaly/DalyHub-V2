/**
 * REVIEW-02 — the React-free view model of the guided weekly Review.
 *
 * The seam between the kernel's pure progress model plus the bounded context
 * projection, and the components that render them. It owns only display
 * derivations — the URL contract, the prompt sequence, the completion summary's
 * sentences — so all of it is unit-tested without a React tree.
 *
 * Two invariants live here:
 *
 *   - the prompt sequence comes from the Review's OWN stored template version, so
 *     a Review created under an older template keeps its own prompts and is never
 *     rewritten to the current one;
 *   - the step's URL is built in exactly one place, so the route, the rail, the
 *     phone stepper and the tests can never disagree about what a step's link is.
 */

import {
  resolveReviewTemplateForId,
  weeklyReviewProgressLabel,
  type ReviewSectionId,
  type WeeklyReviewProgress,
  type WeeklyReviewStepId,
} from "~/kernel/reviews";

import type { SerializedReview, SerializedReviewSection } from "../review-view";
import {
  TASK_COMPLETION_FALLBACK_ERROR,
  taskCompletionOutcome,
  type TaskCompletionOutcome,
} from "~/shared/task-record/task-completion-outcome";

/* -------------------------------------------------------------------------- */
/* The URL contract                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The guided flow's canonical path. The Review keeps ONE id and ONE record; the
 * guide is a second PRESENTATION of it at a stable sub-path, so:
 *
 *   - `/reviews/:reviewId`            — the existing general-purpose record, unchanged;
 *   - `/reviews/:reviewId/guide`      — the guided flow, which resolves the owner's
 *                                        current step and redirects to it;
 *   - `/reviews/:reviewId/guide?step=inbox` — one step, deep-linkable, refreshable,
 *                                        and correct under browser Back/Forward.
 *
 * The step lives in the query string rather than the path because it is a VIEW of
 * one record, not a different record — the same reasoning the Review record's own
 * `?tab=` uses. An unknown, missing or malformed `step` is recovered to the
 * current step by redirect, so the canonical URL always names a real step and a
 * stale bookmark never dead-ends.
 */
export const REVIEW_GUIDE_STEP_PARAM = "step";

export function reviewGuidePath(
  reviewId: string,
  stepId?: WeeklyReviewStepId,
): string {
  const base = `/reviews/${encodeURIComponent(reviewId)}/guide`;
  return stepId
    ? `${base}?${REVIEW_GUIDE_STEP_PARAM}=${encodeURIComponent(stepId)}`
    : base;
}

/** The canonical record route — where "Open the full Review" always goes. */
export function reviewRecordPath(reviewId: string, tab?: string): string {
  const base = `/reviews/${encodeURIComponent(reviewId)}`;
  return tab ? `${base}?tab=${encodeURIComponent(tab)}` : base;
}

/* -------------------------------------------------------------------------- */
/* Prompts                                                                     */
/* -------------------------------------------------------------------------- */

/** One reflection prompt, resolved against the Review's own template version. */
export interface ReviewGuidePrompt {
  readonly sectionId: ReviewSectionId;
  readonly label: string;
  /** The template's question, when it has one for this section. */
  readonly prompt: string | null;
  readonly body: string;
  /** The section's stored `updatedAt`, quoted back on save for concurrency. */
  readonly updatedAt: string;
  readonly answered: boolean;
}

/**
 * The prompts a step presents, in the Review's own template order.
 *
 * Sections the stored template does not define are OMITTED rather than invented,
 * and sections the template defines that this build's step model does not list
 * are simply not part of this step — neither case rewrites the Review.
 */
export function reviewGuidePrompts(
  review: SerializedReview,
  sectionIds: readonly ReviewSectionId[],
): readonly ReviewGuidePrompt[] {
  const template = resolveReviewTemplateForId(review.templateId, review.type);
  const bySection = new Map<ReviewSectionId, SerializedReviewSection>(
    review.sections.map((section) => [section.sectionId, section]),
  );
  const prompts: ReviewGuidePrompt[] = [];
  for (const templateSection of template.sections) {
    if (!sectionIds.includes(templateSection.id)) continue;
    const stored = bySection.get(templateSection.id);
    if (!stored) continue;
    prompts.push({
      sectionId: templateSection.id,
      label: templateSection.label,
      prompt: templateSection.prompt ?? null,
      body: stored.body,
      updatedAt: stored.updatedAt,
      answered: stored.body.trim().length > 0,
    });
  }
  return prompts;
}

/* -------------------------------------------------------------------------- */
/* Progress presentation                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The phone stepper's progress line: position first, because that is what a
 * person on a small screen needs to know, then the step's short label. Matches
 * `weeklyReviewProgressLabel` exactly so the screen-reader announcement and the
 * visible text are the same sentence.
 */
export function mobileProgressLabel(
  stepId: WeeklyReviewStepId,
  mobileLabel: string,
): string {
  return `${weeklyReviewProgressLabel(stepId)} · ${mobileLabel}`;
}

/** "3 of 7 steps done" — a position, never a score and never a percentage. */
export function completedStepsLabel(progress: WeeklyReviewProgress): string {
  return `${progress.completedCount} of ${progress.totalCount} steps done`;
}

/* -------------------------------------------------------------------------- */
/* The completion summary                                                      */
/* -------------------------------------------------------------------------- */

export interface ReviewCompletionSummaryLine {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  /** True when this line is something the owner may still want to act on. */
  readonly outstanding: boolean;
}

export interface ReviewCompletionSummaryInput {
  readonly progress: WeeklyReviewProgress;
  readonly review: SerializedReview;
  readonly inboxRemaining: number | null;
  readonly reflectionSectionIds: readonly ReviewSectionId[];
  readonly focusSectionIds: readonly ReviewSectionId[];
}

/**
 * The concise "here is what this Review covered" summary shown before completing.
 * Every line is a fact, calmly stated. An unfinished optional step is reported,
 * never scolded, and nothing here blocks completion on its own — the blockers are
 * the kernel's, and they are shown separately.
 */
export function reviewCompletionSummary(
  input: ReviewCompletionSummaryInput,
): readonly ReviewCompletionSummaryLine[] {
  const { progress, review, inboxRemaining } = input;
  const answered = new Set(
    review.sections
      .filter((section) => section.body.trim().length > 0)
      .map((section) => section.sectionId),
  );
  const stepById = new Map(progress.steps.map((step) => [step.id, step]));

  const reflectionAnswered = input.reflectionSectionIds.filter((id) =>
    answered.has(id),
  ).length;
  const reflectionTotal = input.reflectionSectionIds.length;
  const focusRecorded = input.focusSectionIds.some((id) => answered.has(id));

  const inboxStep = stepById.get("inbox");
  const inboxValue =
    inboxRemaining === null
      ? "Couldn’t be read just now"
      : inboxRemaining === 0
        ? "Cleared"
        : inboxStep?.acknowledged === true
          ? `${inboxRemaining} left, deliberately`
          : `${inboxRemaining} still waiting`;

  const lines: ReviewCompletionSummaryLine[] = [
    {
      id: "inbox",
      label: "Inbox",
      value: inboxValue,
      outstanding: inboxRemaining !== null && inboxRemaining > 0,
    },
    {
      id: "projects",
      label: "Projects",
      value:
        stepById.get("projects")?.complete === true
          ? "Reviewed"
          : "Not marked reviewed",
      outstanding: stepById.get("projects")?.complete !== true,
    },
    {
      id: "alignment",
      label: "Goals and Areas",
      value:
        stepById.get("alignment")?.complete === true
          ? "Considered"
          : "Not marked reviewed",
      outstanding: stepById.get("alignment")?.complete !== true,
    },
    {
      id: "reflection",
      label: "Reflection prompts",
      value: `${reflectionAnswered} of ${reflectionTotal} answered`,
      outstanding: reflectionAnswered < reflectionTotal,
    },
    {
      id: "focus",
      label: "Next week’s focus",
      value: focusRecorded
        ? "Recorded"
        : stepById.get("focus")?.acknowledged === true
          ? "Deliberately not recorded"
          : "Not recorded",
      outstanding: !focusRecorded,
    },
  ];

  const skipped = progress.steps
    .filter((step) => step.acknowledged && !step.derivedComplete)
    .map((step) => step.label);
  if (skipped.length > 0) {
    lines.push({
      id: "acknowledged",
      label: "Marked reviewed",
      value: skipped.join(", "),
      outstanding: false,
    });
  }

  return lines;
}

/* -------------------------------------------------------------------------- */
/* Inbox completion outcome                                                    */
/* -------------------------------------------------------------------------- */

/*
 * DEBT-89 — this decision moved to `~/shared/task-record`.
 *
 * It is a fact about what the canonical TASK route answered, not about a
 * Review, and the TASKS-04 Review Inbox had the same defect and could not reach
 * a Reviews-module helper to fix it. The names below are kept so every existing
 * caller and test still reads in the Review's words; the rule is one function.
 */
export type InboxCompletionOutcome = TaskCompletionOutcome;
export const INBOX_COMPLETION_FALLBACK_ERROR = TASK_COMPLETION_FALLBACK_ERROR;
export const inboxCompletionOutcome = taskCompletionOutcome;
