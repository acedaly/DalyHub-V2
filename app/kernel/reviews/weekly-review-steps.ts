/**
 * REVIEW-02 — the CANONICAL guided weekly Review step model.
 *
 * One typed, ordered registry, shared by every consumer that needs to know what
 * the guided flow's steps are: the desktop step rail, the REVIEW-04 phone
 * stepper, the progress indicator, the route/action validation, the resume
 * logic, the completion summary and the tests. Step order is declared HERE and
 * nowhere else — no component may re-state it, and no route may hard-code a
 * "next step" (AGENTS.md §9.8, "shared over bespoke").
 *
 * The steps are a PRESENTATION of the existing REVIEWS-01 Review record, never a
 * second record: each one names the `review_sections` it reads and writes, or the
 * derived context it renders. There is no wizard-only copy of a Review response,
 * no wizard-only status and no wizard-only completion flag.
 *
 * This module is pure and storage-free so the whole model is unit-tested without
 * a database or a React tree.
 */

import type { ReviewSectionId } from "./review";

/* -------------------------------------------------------------------------- */
/* Vocabulary                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The stable step ids, IN ORDER. These appear in URLs (`?step=`), in the
 * persisted resume bookmark and in the acknowledgement rows, so they are a
 * closed, append-only vocabulary — renaming one is a migration, not an edit.
 */
export const WEEKLY_REVIEW_STEP_IDS = [
  "overview",
  "inbox",
  "projects",
  "alignment",
  "reflection",
  "focus",
  "complete",
] as const;
export type WeeklyReviewStepId = (typeof WEEKLY_REVIEW_STEP_IDS)[number];

/**
 * Which bounded projection a step renders. The review-context loader switches on
 * this, so a step can never quietly acquire a second data source and every step's
 * query cost is declared in one place.
 *
 * - `period`    — the bounded period facts (Tasks, Diary, Meetings, Projects).
 * - `inbox`     — the canonical Tasks Inbox page plus its authoritative count.
 * - `projects`  — the bounded Project review projection (PROJ-02 health reused).
 * - `alignment` — the AREA-03 Goal alignment projection plus Area attention.
 * - `sections`  — the Review's own stored responses only; no cross-module read.
 * - `summary`   — the completion summary: counts already gathered, no record bodies.
 */
export const WEEKLY_REVIEW_STEP_CONTEXTS = [
  "period",
  "inbox",
  "projects",
  "alignment",
  "sections",
  "summary",
] as const;
export type WeeklyReviewStepContext =
  (typeof WEEKLY_REVIEW_STEP_CONTEXTS)[number];

/**
 * How a step decides it is DONE, before the owner's explicit acknowledgement is
 * considered. Every rule is derived from live, truthful facts — nothing here is
 * a stored score or a cached count.
 *
 * - `none`          — nothing can be derived; only an explicit acknowledgement
 *                     completes it (Settle in, Projects, Goals and Areas).
 * - `inbox_clear`   — the workspace Inbox holds no Tasks. This is deliberately
 *                     DISTINCT from "the Inbox step was reviewed": an owner may
 *                     leave Inbox Tasks on purpose and acknowledge the step.
 * - `any_response`  — at least one of the step's sections has a non-empty body.
 * - `review_completed` — the Review's own lifecycle says completed.
 */
export const WEEKLY_REVIEW_STEP_COMPLETION_RULES = [
  "none",
  "inbox_clear",
  "any_response",
  "review_completed",
] as const;
export type WeeklyReviewStepCompletionRule =
  (typeof WEEKLY_REVIEW_STEP_COMPLETION_RULES)[number];

/* -------------------------------------------------------------------------- */
/* The definition                                                              */
/* -------------------------------------------------------------------------- */

export interface WeeklyReviewStepDefinition {
  /** The stable id used in URLs, storage and tests. */
  readonly id: WeeklyReviewStepId;
  /** 1-based position, so "Step 3 of 7" needs no arithmetic at the call site. */
  readonly order: number;
  /** The owner-facing label used by the desktop rail and step headings. */
  readonly label: string;
  /** The compact label the phone stepper shows beside the progress count. */
  readonly mobileLabel: string;
  /** One calm sentence saying what the step is for. */
  readonly description: string;
  /**
   * The Review sections this step presents, in canonical template order. Empty
   * for steps that only render derived context. A step NEVER invents a section:
   * every id here is part of the REVIEWS-01 closed section vocabulary.
   */
  readonly sectionIds: readonly ReviewSectionId[];
  /** The bounded projection this step reads. */
  readonly context: WeeklyReviewStepContext;
  /** How the step's completion is derived before acknowledgement. */
  readonly completion: WeeklyReviewStepCompletionRule;
  /**
   * Required steps must be complete — derived OR explicitly acknowledged — before
   * the guided flow will complete the Review. Requiring a DECISION is not the same
   * as requiring an answer: an owner who deliberately records nothing acknowledges
   * the step and is never blocked (see `weeklyReviewCompletionBlockers`).
   */
  readonly required: boolean;
  /**
   * Whether the owner may explicitly mark this step reviewed. `complete` cannot be
   * acknowledged — its only truth is the Review's lifecycle.
   */
  readonly acknowledgeable: boolean;
  /** The wording of this step's acknowledgement control, when it has one. */
  readonly acknowledgeLabel: string | null;
}

/**
 * The seven steps of a guided weekly Review. Labels use the product's existing
 * nouns (Inbox, Projects, Goals, Areas, Review) so the flow is understandable
 * without documentation, and stay calm — no urgency, no scores, no streaks.
 */
export const WEEKLY_REVIEW_STEPS: readonly WeeklyReviewStepDefinition[] = [
  {
    id: "overview",
    order: 1,
    label: "Settle in",
    mobileLabel: "Settle in",
    description: "What happened this week, and what needs attention here.",
    sectionIds: [],
    context: "period",
    completion: "none",
    required: false,
    acknowledgeable: true,
    acknowledgeLabel: "Mark this step reviewed",
  },
  {
    id: "inbox",
    order: 2,
    label: "Clear the Inbox",
    mobileLabel: "Inbox",
    description: "Give every captured Task a home, or leave it deliberately.",
    sectionIds: ["tasks.commentary"],
    context: "inbox",
    completion: "inbox_clear",
    required: false,
    acknowledgeable: true,
    acknowledgeLabel: "Mark the Inbox step reviewed",
  },
  {
    id: "projects",
    order: 3,
    label: "Review Projects",
    mobileLabel: "Projects",
    description:
      "Is each Project still active, moving, and does it have a next action?",
    sectionIds: ["progress.commentary"],
    context: "projects",
    completion: "none",
    required: false,
    acknowledgeable: true,
    acknowledgeLabel: "Mark Projects reviewed",
  },
  {
    id: "alignment",
    order: 4,
    label: "Goals and Areas",
    mobileLabel: "Alignment",
    description: "Where this week's work landed across your Goals and Areas.",
    sectionIds: [],
    context: "alignment",
    completion: "none",
    required: false,
    acknowledgeable: true,
    acknowledgeLabel: "Mark Goals and Areas reviewed",
  },
  {
    id: "reflection",
    order: 5,
    label: "Reflect",
    mobileLabel: "Reflect",
    description: "The weekly template's prompts, one at a time.",
    // The weekly template's reflection prompts, in template order. `summary.next_focus`
    // deliberately belongs to the focus step, not here.
    sectionIds: [
      "summary.overall",
      "summary.highlights",
      "summary.challenges",
      "summary.lessons",
      "summary.decisions",
      "diary.commentary",
      "people_meetings.commentary",
    ],
    context: "sections",
    completion: "any_response",
    required: true,
    acknowledgeable: true,
    acknowledgeLabel: "Continue without writing a reflection",
  },
  {
    id: "focus",
    order: 6,
    label: "Next week’s focus",
    mobileLabel: "Focus",
    description: "A small, deliberate handoff to the coming week.",
    sectionIds: ["summary.next_focus"],
    context: "sections",
    completion: "any_response",
    required: true,
    acknowledgeable: true,
    acknowledgeLabel: "Continue without recording a focus",
  },
  {
    id: "complete",
    order: 7,
    label: "Complete Review",
    mobileLabel: "Complete",
    description: "What this Review covered, and what remains open.",
    sectionIds: [],
    context: "summary",
    completion: "review_completed",
    required: true,
    acknowledgeable: false,
    acknowledgeLabel: null,
  },
];

/** How many steps the guided weekly flow has — for "Step 3 of 7". */
export const WEEKLY_REVIEW_STEP_COUNT = WEEKLY_REVIEW_STEPS.length;

/** The first step of the flow (a brand-new Review opens here). */
export const FIRST_WEEKLY_REVIEW_STEP: WeeklyReviewStepId =
  WEEKLY_REVIEW_STEPS[0].id;

/** The terminal step of the flow (a completed Review resumes here). */
export const LAST_WEEKLY_REVIEW_STEP: WeeklyReviewStepId =
  WEEKLY_REVIEW_STEPS[WEEKLY_REVIEW_STEPS.length - 1].id;

/* -------------------------------------------------------------------------- */
/* Lookup, parsing and movement                                                */
/* -------------------------------------------------------------------------- */

/** True when `value` names a step in the canonical registry. */
export function isWeeklyReviewStepId(
  value: unknown,
): value is WeeklyReviewStepId {
  return (
    typeof value === "string" &&
    (WEEKLY_REVIEW_STEP_IDS as readonly string[]).includes(value)
  );
}

/**
 * Parse an untrusted step id (a URL parameter, a form field, a stored row).
 * Returns `null` rather than throwing — an unknown step is recovered from, never
 * surfaced as an error (see `resolveWeeklyReviewStep`).
 */
export function parseWeeklyReviewStepId(
  value: unknown,
): WeeklyReviewStepId | null {
  return isWeeklyReviewStepId(value) ? value : null;
}

/** The definition for a step id. Total: every id in the union has one. */
export function weeklyReviewStep(
  id: WeeklyReviewStepId,
): WeeklyReviewStepDefinition {
  const found = WEEKLY_REVIEW_STEPS.find((step) => step.id === id);
  /* c8 ignore next -- unreachable: the union and the registry are the same set. */
  if (!found) throw new Error(`Unknown weekly review step: ${id}`);
  return found;
}

/** The step after `id`, or `null` at the end of the flow. */
export function nextWeeklyReviewStep(
  id: WeeklyReviewStepId,
): WeeklyReviewStepId | null {
  const index = WEEKLY_REVIEW_STEPS.findIndex((step) => step.id === id);
  const next = WEEKLY_REVIEW_STEPS[index + 1];
  return next ? next.id : null;
}

/** The step before `id`, or `null` at the start of the flow. */
export function previousWeeklyReviewStep(
  id: WeeklyReviewStepId,
): WeeklyReviewStepId | null {
  const index = WEEKLY_REVIEW_STEPS.findIndex((step) => step.id === id);
  if (index <= 0) return null;
  return WEEKLY_REVIEW_STEPS[index - 1].id;
}

/* -------------------------------------------------------------------------- */
/* Progress vocabulary                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The compact progress sentence a screen reader hears and the phone stepper
 * shows. Deliberately "Step 3 of 7" — a position, never a percentage or a score.
 */
export function weeklyReviewProgressLabel(id: WeeklyReviewStepId): string {
  return `Step ${weeklyReviewStep(id).order} of ${WEEKLY_REVIEW_STEP_COUNT}`;
}

/**
 * The accessible name for a step's navigation control. States the position AND
 * the label, so the completed/current/upcoming treatment is never the only way
 * to understand where you are (WCAG 2.2 AA, no meaning by colour alone).
 */
export function weeklyReviewStepAccessibleLabel(
  id: WeeklyReviewStepId,
  state?: WeeklyReviewStepState,
): string {
  const step = weeklyReviewStep(id);
  const base = `${weeklyReviewProgressLabel(id)}: ${step.label}`;
  if (!state) return base;
  return `${base}, ${WEEKLY_REVIEW_STEP_STATE_LABELS[state].toLocaleLowerCase()}`;
}

/**
 * The three display states of a step in the rail/stepper. The label is ALWAYS
 * rendered (visibly or as an accessible name) beside the visual treatment, so
 * state is never carried by colour alone.
 */
export const WEEKLY_REVIEW_STEP_STATES = [
  "complete",
  "current",
  "upcoming",
] as const;
export type WeeklyReviewStepState = (typeof WEEKLY_REVIEW_STEP_STATES)[number];

export const WEEKLY_REVIEW_STEP_STATE_LABELS: Readonly<
  Record<WeeklyReviewStepState, string>
> = {
  complete: "Done",
  current: "Current step",
  upcoming: "Not started",
};
