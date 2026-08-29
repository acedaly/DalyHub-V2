import type {
  CreateReviewInput,
  CreateReviewResult,
  ListReviewsInput,
  Review,
  ReviewChangeResult,
  ReviewDeleteResult,
  ReviewLifecycleResult,
  ReviewPage,
  ReviewPeriodEntry,
  ReviewSectionId,
  ReviewStatus,
  ReviewType,
  UpdateReviewSectionOptions,
} from "./review";
import type {
  ReviewWorkflowState,
  ReviewWorkflowStateResult,
  SetReviewWorkflowStepOptions,
} from "./review-workflow";
import type { WeeklyReviewStepId } from "./weekly-review-steps";

export interface ReviewRepository {
  create(input: CreateReviewInput): Promise<CreateReviewResult>;
  get(
    id: string,
    options?: { includeDeleted?: boolean },
  ): Promise<Review | null>;
  list(input?: ListReviewsInput): Promise<ReviewPage>;

  /**
   * STEER-05 — the Review covering EXACTLY this period, or null.
   *
   * The same lookup {@link ReviewRepository.create} already performs to stay
   * idempotent, exposed on the contract because a surface that offers a door to
   * this week's Review has to ask the same question creation asks — otherwise
   * "start one" and "one already exists" are two rules that can disagree.
   *
   * It answers with a {@link ReviewPeriodEntry} rather than a `Review`: one
   * bounded statement, no section bodies. `custom` is excluded because a custom
   * period is not unique and creation does not deduplicate it.
   */
  findPeriodEntry(
    type: Exclude<ReviewType, "custom">,
    periodStart: string,
    periodEnd: string,
  ): Promise<ReviewPeriodEntry | null>;
  updateTitle(id: string, title: string): Promise<ReviewChangeResult>;
  /**
   * Write one authored Markdown section.
   *
   * REVIEW-02 added OPTIMISTIC CONCURRENCY to this path, and only to this path.
   * Authored reflection is the one thing in a Review that a second tab, a phone
   * and a desktop can all be holding an older copy of, and a blind write loses
   * writing the owner cannot get back. Supply `options.expectedUpdatedAt` — the
   * `updatedAt` the caller loaded for that section — and the write is refused
   * with `ReviewConflictError` when the stored row has moved on since. Omitting
   * it preserves the original last-write-wins behaviour for callers that have no
   * base version to quote (the Review record's own editors, unchanged).
   */
  updateSection(
    id: string,
    sectionId: ReviewSectionId,
    body: string,
    options?: UpdateReviewSectionOptions,
  ): Promise<ReviewChangeResult>;

  /**
   * REVIEW-02 — read the guided flow's small persisted workflow state (the
   * resume bookmark and the owner's explicit step acknowledgements). A Review
   * that has never been opened in the guided flow has no row; this returns the
   * documented default rather than null, so every pre-existing Review has a
   * sensible derived position. Never records Activity.
   */
  getWorkflowState(reviewId: string): Promise<ReviewWorkflowState>;

  /**
   * REVIEW-02 — move the resume bookmark. When `options.expectedRevision` is
   * supplied and the stored revision has already moved on, NOTHING is written
   * and the result reports `conflict: true` with the newer state, so a second
   * tab's position is never silently overwritten. Never records Activity.
   */
  setWorkflowStep(
    reviewId: string,
    stepId: WeeklyReviewStepId,
    options?: SetReviewWorkflowStepOptions,
  ): Promise<ReviewWorkflowStateResult>;

  /**
   * REVIEW-02 — record or withdraw the owner's explicit "I have reviewed this
   * step" decision. Additive and idempotent, so two tabs can never conflict over
   * it. Never records Activity.
   */
  setStepAcknowledged(
    reviewId: string,
    stepId: WeeklyReviewStepId,
    acknowledged: boolean,
  ): Promise<ReviewWorkflowStateResult>;
  setStatus(id: string, status: ReviewStatus): Promise<ReviewLifecycleResult>;
  complete(id: string): Promise<ReviewLifecycleResult>;
  reopen(id: string): Promise<ReviewLifecycleResult>;
  archive(id: string): Promise<ReviewLifecycleResult>;
  restore(id: string): Promise<ReviewLifecycleResult>;
  /**
   * Permanently (hard) delete a Review — the guarded destructive path. Refuses
   * (returns `{ deleted: false, blockedReason: "has_links", linkCount }`) while
   * any ACTIVE relationship references the Review, so a linked Area/Project/Note
   * is never silently orphaned; the caller unlinks first. Never touches a linked
   * record.
   *
   * On success the Review's whole footprint — links, subject pointers, sections,
   * the detail row and the entity row — is removed child-first in ONE atomic
   * batch, and exactly one SUBJECT-LESS `review.deleted` tombstone is appended
   * carrying `{ reviewId, title }`. Existing `activities` rows about the Review
   * are RETAINED (append-only, ADR-012); only their `activity_subjects` pointers
   * to the vanishing entity go.
   *
   * Idempotent and race-safe: an already-gone Review returns `{ deleted: false }`
   * having written nothing, and the loser of two concurrent purges returns the
   * same no-op rather than raising a foreign-key error — exactly one tombstone
   * can ever exist per destroyed Review.
   */
  permanentlyDelete(id: string): Promise<ReviewDeleteResult>;
}
