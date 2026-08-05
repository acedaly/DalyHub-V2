/**
 * REVIEW-02 — the SMALL persisted workflow state of a guided weekly Review.
 *
 * Almost everything the guided flow shows is DERIVED from facts that already
 * exist: whether a prompt is answered comes from `review_sections`, whether the
 * Inbox is clear comes from the canonical Tasks Inbox query, whether the Review
 * is finished comes from its lifecycle. None of that is stored twice.
 *
 * Exactly two things cannot be derived truthfully, so exactly two things are
 * persisted (ADR-072):
 *
 *   1. **the resume bookmark** — where the owner was when they stopped. There is
 *      no fact anywhere in the system that answers "which step was I on"; a
 *      guess from live counts would move the owner backwards whenever a Task
 *      changed underneath them.
 *   2. **explicit step acknowledgements** — an owner's deliberate decision that
 *      a step is done even though its derived rule is not satisfied ("I looked
 *      at my Projects", "I am deliberately leaving these Inbox Tasks", "I am not
 *      recording a focus this week"). A decision is not a calculation.
 *
 * NOT persisted, and never to be: insight scores, Project health snapshots, Goal
 * alignment classifications, Task counts, or a copy of any Review response body.
 * Neither table records Activity — navigation progress is product state, not
 * meaningful history (ADR-072 §5).
 */

import type { WeeklyReviewStepId } from "./weekly-review-steps";

/**
 * The stored workflow state of one Review. A Review that has never been opened
 * in the guided flow has no row; the repository returns the documented default
 * (`currentStep: null`, no acknowledgements, `revision: 0`) rather than null, so
 * every existing Review has a sensible derived position from day one.
 */
export interface ReviewWorkflowState {
  readonly reviewId: string;
  /**
   * The resume bookmark: the last step the owner deliberately navigated to.
   * `null` means "never navigated" — the position is derived from the Review's
   * own responses and lifecycle instead.
   */
  readonly currentStep: WeeklyReviewStepId | null;
  /** Steps the owner has explicitly marked reviewed, in canonical step order. */
  readonly acknowledgedSteps: readonly WeeklyReviewStepId[];
  /**
   * Monotonic revision of the bookmark, incremented on every accepted write. A
   * caller that supplies `expectedRevision` is refused (calmly) when the stored
   * revision has moved on, so a second tab's newer position is never silently
   * overwritten.
   */
  readonly revision: number;
  /** When the bookmark last moved, or `null` when there is no row yet. */
  readonly updatedAt: Date | null;
}

/**
 * The result of a workflow-state write. `conflict` is TRUE when an
 * `expectedRevision` was supplied and did not match: nothing was written, and
 * `state` is the newer state the caller should follow. This is a calm outcome,
 * not an error — the caller re-renders at the newer position and says so.
 */
export interface ReviewWorkflowStateResult {
  readonly state: ReviewWorkflowState;
  readonly changed: boolean;
  readonly conflict: boolean;
}

/** Options for moving the resume bookmark. */
export interface SetReviewWorkflowStepOptions {
  /**
   * The revision the caller last read. Omit to move the bookmark unconditionally
   * (used only where there is no competing writer, e.g. a kernel test seeding
   * state). The guided flow always supplies it.
   */
  readonly expectedRevision?: number;
}

/** The documented default state for a Review with no stored workflow row. */
export function emptyReviewWorkflowState(
  reviewId: string,
): ReviewWorkflowState {
  return {
    reviewId,
    currentStep: null,
    acknowledgedSteps: [],
    revision: 0,
    updatedAt: null,
  };
}
