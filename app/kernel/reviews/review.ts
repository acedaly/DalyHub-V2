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

export interface ReviewDeleteResult {
  readonly deleted: boolean;
}
