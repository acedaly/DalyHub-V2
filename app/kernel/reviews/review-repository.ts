import type {
  CreateReviewInput,
  CreateReviewResult,
  ListReviewsInput,
  Review,
  ReviewChangeResult,
  ReviewDeleteResult,
  ReviewLifecycleResult,
  ReviewPage,
  ReviewSectionId,
  ReviewStatus,
} from "./review";

export interface ReviewRepository {
  create(input: CreateReviewInput): Promise<CreateReviewResult>;
  get(
    id: string,
    options?: { includeDeleted?: boolean },
  ): Promise<Review | null>;
  list(input?: ListReviewsInput): Promise<ReviewPage>;
  updateTitle(id: string, title: string): Promise<ReviewChangeResult>;
  updateSection(
    id: string,
    sectionId: ReviewSectionId,
    body: string,
  ): Promise<ReviewChangeResult>;
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
