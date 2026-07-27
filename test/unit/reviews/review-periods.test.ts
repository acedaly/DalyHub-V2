import { describe, expect, it } from "vitest";

import {
  REVIEW_SECTION_IDS,
  ReviewValidationError,
  annualPeriod,
  currentReviewPeriod,
  defaultReviewTitle,
  monthlyPeriod,
  parseReviewSectionId,
  parseReviewStatus,
  quarterlyPeriod,
  resolveReviewTemplate,
  reviewTemplateId,
  validateReviewPeriod,
  weeklyPeriod,
} from "~/kernel/reviews";
import { reviewPeriodLabel } from "~/modules/reviews/review-view";

describe("Review periods", () => {
  it("calculates weeks from the owner's first-day preference", () => {
    expect(weeklyPeriod("2026-07-27", "monday")).toEqual({
      start: "2026-07-27",
      end: "2026-08-02",
    });
    expect(weeklyPeriod("2026-07-27", "sunday")).toEqual({
      start: "2026-07-26",
      end: "2026-08-01",
    });
  });

  it("handles month, quarter, annual, leap-year and year-boundary periods", () => {
    expect(monthlyPeriod("2024-02-10")).toEqual({
      start: "2024-02-01",
      end: "2024-02-29",
    });
    expect(quarterlyPeriod("2026-12-31")).toEqual({
      start: "2026-10-01",
      end: "2026-12-31",
    });
    expect(annualPeriod("2026-07-27")).toEqual({
      start: "2026-01-01",
      end: "2026-12-31",
    });
    expect(currentReviewPeriod("weekly", "2027-01-01", "monday")).toEqual({
      start: "2026-12-28",
      end: "2027-01-03",
    });
  });

  it("rejects invalid custom ranges", () => {
    expect(() =>
      validateReviewPeriod({
        type: "custom",
        periodStart: "2026-07-27",
        periodEnd: "2026-07-26",
      }),
    ).toThrow(ReviewValidationError);
  });

  it("generates default titles without changing ISO period values", () => {
    expect(
      defaultReviewTitle({
        type: "weekly",
        periodStart: "2026-07-27",
        periodEnd: "2026-08-02",
        dateFormat: "d_mmm_yyyy",
      }),
    ).toBe("Weekly Review — 27 July–2 August 2026");
    expect(
      defaultReviewTitle({
        type: "monthly",
        periodStart: "2026-07-01",
        periodEnd: "2026-07-31",
        dateFormat: "d_mmm_yyyy",
      }),
    ).toBe("Monthly Review — July 2026");
    expect(
      defaultReviewTitle({
        type: "quarterly",
        periodStart: "2026-07-01",
        periodEnd: "2026-09-30",
        dateFormat: "d_mmm_yyyy",
      }),
    ).toBe("Quarterly Review — Q3 2026");
    expect(
      defaultReviewTitle({
        type: "annual",
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
        dateFormat: "d_mmm_yyyy",
      }),
    ).toBe("Annual Review — 2026");
  });

  it("formats view-model period labels from preferences", () => {
    expect(
      reviewPeriodLabel("custom", "2026-07-15", "2026-07-27", "dmy_slash"),
    ).toBe("15/07/2026–27/07/2026");
  });
});

describe("Review vocabulary", () => {
  it("keeps status and section identifiers closed", () => {
    expect(parseReviewStatus("draft")).toBe("draft");
    expect(parseReviewStatus("in_progress")).toBe("in_progress");
    expect(parseReviewStatus("completed")).toBe("completed");
    expect(() => parseReviewStatus("archived")).toThrow(ReviewValidationError);
    expect(parseReviewSectionId("summary.decisions")).toBe("summary.decisions");
    expect(() => parseReviewSectionId("summary.score")).toThrow(
      ReviewValidationError,
    );
  });

  it("resolves versioned internal templates for every review type", () => {
    for (const type of [
      "weekly",
      "monthly",
      "quarterly",
      "annual",
      "custom",
    ] as const) {
      const template = resolveReviewTemplate(type);
      expect(template.id).toBe(reviewTemplateId(type));
      expect(template.version).toBe(1);
      expect(template.sections.map((section) => section.id)).toEqual(
        REVIEW_SECTION_IDS,
      );
      expect(template.sections.some((section) => section.prompt)).toBe(true);
    }
  });
});
