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
  permanentlyDelete(id: string): Promise<ReviewDeleteResult>;
}
