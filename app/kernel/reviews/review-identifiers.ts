/** REVIEWS-01 Reviews kernel identifiers. */

export const REVIEW_ENTITY_TYPE = "review";

export const RESERVED_REVIEW_ENTITY_TYPES: ReadonlySet<string> = new Set([
  REVIEW_ENTITY_TYPE,
]);

export function isReservedReviewEntityType(type: string): boolean {
  return RESERVED_REVIEW_ENTITY_TYPES.has(type);
}

export const REVIEW_CREATED = "review.created";
export const REVIEW_UPDATED = "review.updated";
export const REVIEW_STATUS_CHANGED = "review.status_changed";
export const REVIEW_COMPLETED = "review.completed";
export const REVIEW_REOPENED = "review.reopened";
export const REVIEW_ARCHIVED = "review.archived";
export const REVIEW_RESTORED = "review.restored";
export const REVIEW_DELETED = "review.deleted";

export const REVIEW_ACTIVITY_TYPES = [
  REVIEW_CREATED,
  REVIEW_UPDATED,
  REVIEW_STATUS_CHANGED,
  REVIEW_COMPLETED,
  REVIEW_REOPENED,
  REVIEW_ARCHIVED,
  REVIEW_RESTORED,
  REVIEW_DELETED,
] as const;
