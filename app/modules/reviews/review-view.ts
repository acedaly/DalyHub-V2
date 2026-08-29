import {
  formatPreferenceDate,
  type DateFormat,
  type FirstDayOfWeek,
} from "~/kernel/preferences";
import {
  REVIEW_SECTION_IDS,
  defaultReviewTitle,
  resolveReviewTemplate,
  reviewPeriodLabel,
  reviewSectionLabel,
  type Review,
  type ReviewSectionId,
  type ReviewStatus,
  type ReviewType,
} from "~/kernel/reviews";

export interface SerializedReviewSection {
  readonly sectionId: ReviewSectionId;
  readonly label: string;
  readonly body: string;
  readonly updatedAt: string;
}

export interface SerializedReview {
  readonly id: string;
  readonly title: string;
  readonly type: ReviewType;
  readonly typeLabel: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly periodLabel: string;
  readonly status: ReviewStatus;
  readonly statusLabel: string;
  readonly templateId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly updatedLabel: string;
  readonly completedAt: string | null;
  readonly completedLabel: string;
  readonly archivedAt: string | null;
  readonly archived: boolean;
  readonly authoredSections: number;
  readonly totalSections: number;
  readonly completionLabel: string;
  readonly sections: readonly SerializedReviewSection[];
}

export const REVIEW_TYPE_LABELS: Record<ReviewType, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
  custom: "Custom",
};

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  draft: "Draft",
  in_progress: "In progress",
  completed: "Completed",
};

/*
 * STEER-05 — the period label moved to `~/kernel/reviews` and is re-exported
 * here so every existing call site is unchanged.
 *
 * Today now names the week it is offering, and a module may not import another
 * module's internals. This file used to carry the rule plus private `monthYear`
 * and `quarterLabel` helpers that duplicated the kernel's own — two
 * implementations of one label, which is exactly how the Reviews collection and
 * Today would come to print two different names for one week.
 */
export { reviewPeriodLabel };

export function serializeReview(
  review: Review,
  dateFormat: DateFormat,
): SerializedReview {
  const sectionMap = new Map(
    review.sections.map((section) => [section.sectionId, section]),
  );
  const template = resolveReviewTemplate(review.type);
  const sections = REVIEW_SECTION_IDS.map((sectionId) => {
    const stored = sectionMap.get(sectionId);
    const templateSection = template.sections.find((s) => s.id === sectionId);
    return {
      sectionId,
      label: templateSection?.label ?? reviewSectionLabel(sectionId),
      body: stored?.body ?? "",
      updatedAt: (stored?.updatedAt ?? new Date(0)).toISOString(),
    };
  });
  const authoredSections = sections.filter((section) =>
    section.body.trim(),
  ).length;
  return {
    id: review.id,
    title: review.title,
    type: review.type,
    typeLabel: REVIEW_TYPE_LABELS[review.type],
    periodStart: review.periodStart,
    periodEnd: review.periodEnd,
    periodLabel: reviewPeriodLabel(
      review.type,
      review.periodStart,
      review.periodEnd,
      dateFormat,
    ),
    status: review.status,
    statusLabel: REVIEW_STATUS_LABELS[review.status],
    templateId: review.templateId,
    createdAt: review.createdAt.toISOString(),
    updatedAt: review.updatedAt.toISOString(),
    updatedLabel: formatPreferenceDate(
      review.updatedAt.toISOString().slice(0, 10),
      dateFormat,
    ),
    completedAt: review.completedAt?.toISOString() ?? null,
    completedLabel: review.completedAt
      ? formatPreferenceDate(
          review.completedAt.toISOString().slice(0, 10),
          dateFormat,
        )
      : "Not completed",
    archivedAt: review.archivedAt?.toISOString() ?? null,
    archived: review.archivedAt !== null,
    authoredSections,
    totalSections: REVIEW_SECTION_IDS.length,
    completionLabel: `${authoredSections} of ${REVIEW_SECTION_IDS.length} sections authored`,
    sections,
  };
}

export function defaultReviewDraftTitle(input: {
  readonly type: ReviewType;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly dateFormat: DateFormat;
}): string {
  return defaultReviewTitle(input);
}

export interface ReviewCreationDefaults {
  readonly today: string;
  readonly firstDayOfWeek: FirstDayOfWeek;
  readonly dateFormat: DateFormat;
  readonly timezone: string;
}
