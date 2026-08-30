import type { WorkspaceId } from "~/kernel/workspaces";

export const REVIEW_TYPES = [
  "weekly",
  "monthly",
  "quarterly",
  "annual",
  "custom",
] as const;
export type ReviewType = (typeof REVIEW_TYPES)[number];

export const STANDARD_REVIEW_TYPES = [
  "weekly",
  "monthly",
  "quarterly",
  "annual",
] as const;
export type StandardReviewType = (typeof STANDARD_REVIEW_TYPES)[number];

export const REVIEW_STATUSES = ["draft", "in_progress", "completed"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const REVIEW_SECTION_IDS = [
  "summary.overall",
  "summary.highlights",
  "summary.challenges",
  "summary.lessons",
  "summary.decisions",
  "summary.next_focus",
  "progress.commentary",
  "tasks.commentary",
  "diary.commentary",
  "people_meetings.commentary",
] as const;
export type ReviewSectionId = (typeof REVIEW_SECTION_IDS)[number];

export interface ReviewSection {
  readonly sectionId: ReviewSectionId;
  readonly body: string;
  readonly updatedAt: Date;
}

export interface Review {
  readonly id: string;
  readonly workspaceId: WorkspaceId;
  readonly title: string;
  readonly type: ReviewType;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly status: ReviewStatus;
  readonly templateId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly completedAt: Date | null;
  readonly archivedAt: Date | null;
  readonly deletedAt: Date | null;
  readonly sections: readonly ReviewSection[];
}

/**
 * RECALL-01 — WHERE a Review search hit matched: the Review's `title`, or the
 * `section` reflection the owner wrote inside it.
 */
export type ReviewMatchSource = "title" | "section";

/**
 * RECALL-01 — the bounded Search projection for a Review.
 *
 * Deliberately NOT a {@link Review}: a search row needs the identity, the type
 * and the period it covers, the honest match source and a bounded excerpt — not
 * the authored Markdown of ten sections. Reading those would cost a second
 * statement per page and ship whole reflections to a result row, which is
 * exactly what the excerpt contract exists to prevent. One row per Review,
 * however many of its sections matched.
 */
export interface ReviewSearchHit {
  readonly id: string;
  readonly title: string;
  readonly type: ReviewType;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly status: ReviewStatus;
  readonly archived: boolean;
  readonly matchSource: ReviewMatchSource;
  /** Which section matched, when the match source is `section`. */
  readonly sectionId: ReviewSectionId | null;
  /** A bounded, syntax-free window around a section match; empty otherwise. */
  readonly excerpt: string;
}

/**
 * STEER-05 — the smallest honest answer to *"is there a Review for this
 * period?"*.
 *
 * Deliberately NOT a {@link Review}. A surface that only needs to offer a door
 * needs the id, the name, the period it covers and whether it is finished — it
 * does not need the authored Markdown of ten sections, and reading them would
 * cost a second statement to answer a yes/no question. This shape is what makes
 * the existence read exactly one bounded statement.
 */
export interface ReviewPeriodEntry {
  readonly id: string;
  readonly title: string;
  readonly type: ReviewType;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly status: ReviewStatus;
  /** Archived Reviews are read-only until restored; a door must not lead there. */
  readonly archived: boolean;
}

export type ReviewView = "current" | "in_progress" | "completed" | "archived";
export type ReviewSort = "recent" | "period";

export interface CreateReviewInput {
  readonly type: ReviewType;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly title?: string;
  readonly templateId?: string;
}

export interface CreateReviewResult {
  readonly review: Review;
  readonly outcome: "created" | "existing" | "existing_restored";
}

export interface ListReviewsInput {
  readonly view?: ReviewView;
  readonly type?: ReviewType | "all";
  readonly query?: string;
  readonly sort?: ReviewSort;
  readonly limit?: number;
  readonly cursor?: string;
  readonly today?: string;
}

export interface ReviewPage {
  readonly items: readonly Review[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

export interface ReviewChangeResult {
  readonly review: Review;
  readonly changed: boolean;
}

/**
 * REVIEW-02 — options for an authored-section write.
 *
 * `expectedUpdatedAt` is the section `updatedAt` the caller loaded. Supplying it
 * turns the write into a compare-and-set: if the stored row changed in between —
 * a second tab, a phone, another window — the write is refused with
 * `ReviewConflictError` and the newer text survives. Omitting it keeps the
 * original behaviour for callers with no base version to quote.
 */
export interface UpdateReviewSectionOptions {
  readonly expectedUpdatedAt?: Date;
}

export interface ReviewLifecycleResult {
  readonly review: Review;
  readonly changed: boolean;
  readonly outcome:
    | "completed"
    | "reopened"
    | "archived"
    | "restored"
    | "already_completed"
    | "already_open"
    | "already_archived"
    | "already_active";
}

/**
 * Result of a permanent (hard) delete attempt.
 *
 * Mirrors `AssetDeleteResult` so both guarded purge paths report the same shape
 * (AUDIT-04 / DEBT-80). `deleted: false` covers three honest outcomes, told apart
 * by `blockedReason`: the Review was already gone (idempotent no-op, no reason),
 * a concurrent purge won the race (also no reason), or an ACTIVE relationship
 * still references it (`"has_links"` plus the count the caller shows the user).
 */
export interface ReviewDeleteResult {
  readonly deleted: boolean;
  /** When `deleted` is false, the reason the delete was refused. */
  readonly blockedReason?: "has_links";
  /** How many active relationships block a guarded delete. */
  readonly linkCount?: number;
}
