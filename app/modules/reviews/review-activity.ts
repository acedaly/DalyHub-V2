import {
  REVIEW_ARCHIVED,
  REVIEW_COMPLETED,
  REVIEW_CREATED,
  REVIEW_DELETED,
  REVIEW_REOPENED,
  REVIEW_RESTORED,
  REVIEW_STATUS_CHANGED,
  REVIEW_UPDATED,
} from "~/kernel/reviews";
import {
  createActivityDescriptorMap,
  type ActivityDescriptionSegment,
  type ActivityDescriptorContext,
  type ActivityDescriptorMap,
  type ActivityItem,
  type ActivityItemSubject,
  type ActivityTypeDescriptor,
} from "~/shared/activity-feed/model";

export const REVIEW_ACTIVITY_PAGE_SIZE = 30;

export type SerializedReviewActivityItem = Omit<ActivityItem, "occurredAt"> & {
  readonly occurredAt: string;
};

function subjectSegment(
  subject: ActivityItemSubject | null,
): ActivityDescriptionSegment {
  return subject
    ? { kind: "entity", entityId: subject.entityId }
    : { kind: "emphasis", text: "this review" };
}

function reviewEvent(
  label: string,
  verb: string,
  tone: ActivityTypeDescriptor["tone"],
): ActivityTypeDescriptor {
  return {
    label,
    tone,
    describe: (_base, context: ActivityDescriptorContext) => ({
      segments: [
        { kind: "actor" },
        { kind: "text", text: ` ${verb} ` },
        subjectSegment(context.primarySubject),
      ],
      entityType: "review",
    }),
  };
}

export const REVIEWS_ACTIVITY_DESCRIPTORS: ActivityDescriptorMap =
  createActivityDescriptorMap({
    [REVIEW_CREATED]: reviewEvent("Review created", "created", "success"),
    [REVIEW_UPDATED]: reviewEvent("Review updated", "updated", "accent"),
    [REVIEW_STATUS_CHANGED]: reviewEvent(
      "Status changed",
      "changed the status of",
      "info",
    ),
    [REVIEW_COMPLETED]: reviewEvent("Completed", "completed", "success"),
    [REVIEW_REOPENED]: reviewEvent("Reopened", "reopened", "info"),
    [REVIEW_ARCHIVED]: reviewEvent("Archived", "archived", "warning"),
    [REVIEW_RESTORED]: reviewEvent("Restored", "restored", "info"),
    [REVIEW_DELETED]: reviewEvent("Deleted", "permanently deleted", "danger"),
  });

export interface ReviewActivityPage {
  readonly items: readonly SerializedReviewActivityItem[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}
