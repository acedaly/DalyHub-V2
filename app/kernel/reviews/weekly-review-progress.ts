/**
 * REVIEW-02 — the PURE guided-weekly-Review progress model.
 *
 * Given a small bag of truthful facts (which sections have a body, whether the
 * Inbox is clear, the Review's lifecycle status, and the owner's explicit
 * acknowledgements), this module answers every question the guided flow asks:
 *
 *   - which steps are complete, current and upcoming;
 *   - where a returning owner should resume;
 *   - which requested step id is safe to render;
 *   - what still blocks completion, in owner-facing words.
 *
 * It is a pure function of its input — no clock, no database, no React — so the
 * whole rule matrix is unit-tested directly, and the desktop rail, the phone
 * stepper, the route validation and the completion summary can never disagree.
 */

import type { ReviewSectionId, ReviewStatus } from "./review";
import {
  FIRST_WEEKLY_REVIEW_STEP,
  LAST_WEEKLY_REVIEW_STEP,
  WEEKLY_REVIEW_STEPS,
  WEEKLY_REVIEW_STEP_COUNT,
  parseWeeklyReviewStepId,
  type WeeklyReviewStepDefinition,
  type WeeklyReviewStepId,
  type WeeklyReviewStepState,
} from "./weekly-review-steps";

/* -------------------------------------------------------------------------- */
/* Facts in                                                                    */
/* -------------------------------------------------------------------------- */

export interface WeeklyReviewProgressFacts {
  /** The Review's own lifecycle status — the authority for the final step. */
  readonly status: ReviewStatus;
  /** Section ids whose stored body is non-empty once trimmed. */
  readonly answeredSectionIds: readonly ReviewSectionId[];
  /**
   * How many Tasks remain in the canonical workspace Inbox. `null` when the
   * Inbox could not be read — an unavailable count must never be mistaken for
   * "cleared", so the Inbox step simply stays underived and the owner decides.
   */
  readonly inboxRemaining: number | null;
  /** Steps the owner has explicitly marked reviewed. */
  readonly acknowledgedSteps: readonly WeeklyReviewStepId[];
  /** The persisted resume bookmark, or `null` when there is none. */
  readonly bookmarkedStep: WeeklyReviewStepId | null;
}

/* -------------------------------------------------------------------------- */
/* Facts out                                                                   */
/* -------------------------------------------------------------------------- */

export interface WeeklyReviewStepProgress {
  readonly id: WeeklyReviewStepId;
  readonly order: number;
  readonly label: string;
  readonly mobileLabel: string;
  readonly description: string;
  readonly required: boolean;
  readonly acknowledgeable: boolean;
  readonly acknowledgeLabel: string | null;
  /** Display state relative to the current step. */
  readonly state: WeeklyReviewStepState;
  /** True when the step's own rule OR an acknowledgement says it is done. */
  readonly complete: boolean;
  /** True when the step's DERIVED rule alone says it is done. */
  readonly derivedComplete: boolean;
  /** True when the owner explicitly marked it reviewed. */
  readonly acknowledged: boolean;
  /** Whether this step is the one currently being shown. */
  readonly current: boolean;
}

export interface WeeklyReviewCompletionBlocker {
  readonly stepId: WeeklyReviewStepId;
  /** A calm, factual sentence naming what remains. Never a reprimand. */
  readonly message: string;
}

export interface WeeklyReviewProgress {
  readonly steps: readonly WeeklyReviewStepProgress[];
  readonly currentStepId: WeeklyReviewStepId;
  /** How many steps are complete, for "3 of 7 done". */
  readonly completedCount: number;
  readonly totalCount: number;
  /** The steps that still prevent the guided flow from completing the Review. */
  readonly blockers: readonly WeeklyReviewCompletionBlocker[];
  /** True when the guided flow will accept a completion right now. */
  readonly canComplete: boolean;
}

/* -------------------------------------------------------------------------- */
/* Derivation                                                                  */
/* -------------------------------------------------------------------------- */

function derivedComplete(
  step: WeeklyReviewStepDefinition,
  facts: WeeklyReviewProgressFacts,
): boolean {
  switch (step.completion) {
    case "none":
      return false;
    case "inbox_clear":
      return facts.inboxRemaining === 0;
    case "any_response":
      return step.sectionIds.some((id) =>
        facts.answeredSectionIds.includes(id),
      );
    case "review_completed":
      return facts.status === "completed";
  }
}

/**
 * Where a returning owner lands.
 *
 * 1. A completed Review always opens on its final step — reopening it is a
 *    deliberate lifecycle action taken from there, not an implied one.
 * 2. Otherwise the persisted bookmark wins, unconditionally. It is the owner's
 *    own last deliberate position, so a Task completed in another tab or an
 *    Inbox that filled up again can never move them backwards.
 * 3. With no bookmark (an existing Review that predates the guided flow, or one
 *    never opened in it), fall back to the first step that is not complete —
 *    which for a brand-new draft is simply "Settle in", and for a Review whose
 *    work is already written is the final step.
 */
function resolveCurrentStep(
  facts: WeeklyReviewProgressFacts,
  completeById: ReadonlyMap<WeeklyReviewStepId, boolean>,
): WeeklyReviewStepId {
  if (facts.status === "completed") return LAST_WEEKLY_REVIEW_STEP;
  if (facts.bookmarkedStep !== null) return facts.bookmarkedStep;
  const firstIncomplete = WEEKLY_REVIEW_STEPS.find(
    (step) => completeById.get(step.id) !== true,
  );
  return firstIncomplete ? firstIncomplete.id : FIRST_WEEKLY_REVIEW_STEP;
}

function blockerMessage(step: WeeklyReviewStepDefinition): string {
  switch (step.id) {
    case "reflection":
      return "Reflect — write at least one prompt, or continue without writing a reflection.";
    case "focus":
      return "Next week’s focus — record a focus, or continue without recording one.";
    default:
      return `${step.label} — mark this step reviewed to continue.`;
  }
}

/**
 * Derive the complete progress model. Pure: the same facts always produce the
 * same result.
 */
export function deriveWeeklyReviewProgress(
  facts: WeeklyReviewProgressFacts,
): WeeklyReviewProgress {
  const acknowledged = new Set(facts.acknowledgedSteps);
  const completeById = new Map<WeeklyReviewStepId, boolean>();
  const derivedById = new Map<WeeklyReviewStepId, boolean>();

  for (const step of WEEKLY_REVIEW_STEPS) {
    const derived = derivedComplete(step, facts);
    derivedById.set(step.id, derived);
    completeById.set(
      step.id,
      derived || (step.acknowledgeable && acknowledged.has(step.id)),
    );
  }

  const currentStepId = resolveCurrentStep(facts, completeById);

  const steps = WEEKLY_REVIEW_STEPS.map<WeeklyReviewStepProgress>((step) => {
    const complete = completeById.get(step.id) === true;
    const current = step.id === currentStepId;
    // "Current" wins over "complete" for the step being shown: the owner must
    // always be able to see where they are, even on a step they have finished.
    // A step that is neither is "Not started" — including one walked past
    // without being done, which is the honest description of it.
    const state: WeeklyReviewStepState = current
      ? "current"
      : complete
        ? "complete"
        : "upcoming";
    return {
      id: step.id,
      order: step.order,
      label: step.label,
      mobileLabel: step.mobileLabel,
      description: step.description,
      required: step.required,
      acknowledgeable: step.acknowledgeable,
      acknowledgeLabel: step.acknowledgeLabel,
      state,
      complete,
      derivedComplete: derivedById.get(step.id) === true,
      acknowledged: acknowledged.has(step.id),
      current,
    };
  });

  const blockers = WEEKLY_REVIEW_STEPS.filter(
    (step) =>
      step.required &&
      step.id !== LAST_WEEKLY_REVIEW_STEP &&
      completeById.get(step.id) !== true,
  ).map<WeeklyReviewCompletionBlocker>((step) => ({
    stepId: step.id,
    message: blockerMessage(step),
  }));

  return {
    steps,
    currentStepId,
    completedCount: steps.filter((step) => step.complete).length,
    totalCount: WEEKLY_REVIEW_STEP_COUNT,
    blockers,
    canComplete: blockers.length === 0,
  };
}

/**
 * Resolve an untrusted requested step id against the derived progress.
 *
 * Any KNOWN step is reachable: deliberate navigation backwards is a requirement,
 * and jumping ahead to look at something is not a way to skip work — the final
 * step still refuses to complete a Review whose required steps are outstanding.
 * An unknown, missing or malformed id recovers silently to the current step
 * rather than 404-ing the owner out of their own Review.
 */
export function resolveWeeklyReviewStep(
  requested: unknown,
  progress: WeeklyReviewProgress,
): { readonly stepId: WeeklyReviewStepId; readonly recovered: boolean } {
  const parsed = parseWeeklyReviewStepId(requested);
  if (parsed === null) {
    return { stepId: progress.currentStepId, recovered: true };
  }
  return { stepId: parsed, recovered: false };
}

/**
 * The section ids of a Review whose stored body is non-empty. Trimming is the
 * same "authored" test the Review record's own completion label already uses, so
 * whitespace never reads as an answer.
 */
export function answeredReviewSectionIds(
  sections: readonly {
    readonly sectionId: ReviewSectionId;
    readonly body: string;
  }[],
): readonly ReviewSectionId[] {
  return sections
    .filter((section) => section.body.trim().length > 0)
    .map((section) => section.sectionId);
}
