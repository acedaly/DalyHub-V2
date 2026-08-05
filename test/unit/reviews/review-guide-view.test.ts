/**
 * REVIEW-02 — the guided flow's URL contract, prompt sequence and completion
 * summary.
 */

import { describe, expect, it } from "vitest";

import {
  deriveWeeklyReviewProgress,
  weeklyReviewStep,
  type WeeklyReviewProgressFacts,
} from "~/kernel/reviews";
import {
  REVIEW_GUIDE_STEP_PARAM,
  completedStepsLabel,
  mobileProgressLabel,
  reviewCompletionSummary,
  reviewGuidePath,
  reviewGuidePrompts,
  reviewRecordPath,
} from "~/modules/reviews/guided/review-guide-view";
import { serializeReview } from "~/modules/reviews/review-view";
import type { Review } from "~/kernel/reviews";

const SECTION_IDS = [
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

function review(
  bodies: Partial<Record<(typeof SECTION_IDS)[number], string>> = {},
  overrides: Partial<Review> = {},
): Review {
  return {
    id: "rev-1",
    workspaceId: "ws" as Review["workspaceId"],
    title: "Weekly Review — 27 July–2 August 2026",
    type: "weekly",
    periodStart: "2026-07-27",
    periodEnd: "2026-08-02",
    status: "in_progress",
    templateId: "review.weekly.v1",
    createdAt: new Date("2026-07-27T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    completedAt: null,
    archivedAt: null,
    deletedAt: null,
    sections: SECTION_IDS.map((sectionId) => ({
      sectionId,
      body: bodies[sectionId] ?? "",
      updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    })),
    ...overrides,
  };
}

function facts(
  overrides: Partial<WeeklyReviewProgressFacts> = {},
): WeeklyReviewProgressFacts {
  return {
    status: "in_progress",
    answeredSectionIds: [],
    inboxRemaining: 0,
    acknowledgedSteps: [],
    bookmarkedStep: null,
    ...overrides,
  };
}

describe("the URL contract", () => {
  it("builds one canonical guide path, with and without a step", () => {
    expect(reviewGuidePath("rev-1")).toBe("/reviews/rev-1/guide");
    expect(reviewGuidePath("rev-1", "inbox")).toBe(
      "/reviews/rev-1/guide?step=inbox",
    );
    expect(REVIEW_GUIDE_STEP_PARAM).toBe("step");
  });

  it("escapes an id that needs it, so a link can never be forged from one", () => {
    expect(reviewGuidePath("a/b?c=d", "focus")).toBe(
      "/reviews/a%2Fb%3Fc%3Dd/guide?step=focus",
    );
  });

  it("keeps the canonical record path unchanged", () => {
    expect(reviewRecordPath("rev-1")).toBe("/reviews/rev-1");
    expect(reviewRecordPath("rev-1", "settings")).toBe(
      "/reviews/rev-1?tab=settings",
    );
  });
});

describe("prompt sequence", () => {
  it("presents the Review's own stored template's prompts, in its order", () => {
    const prompts = reviewGuidePrompts(
      serializeReview(review({ "summary.lessons": "Learned" }), "d_mmm_yyyy"),
      weeklyReviewStep("reflection").sectionIds,
    );
    expect(prompts.map((p) => p.sectionId)).toEqual([
      "summary.overall",
      "summary.highlights",
      "summary.challenges",
      "summary.lessons",
      "summary.decisions",
      "diary.commentary",
      "people_meetings.commentary",
    ]);
    expect(
      prompts.find((p) => p.sectionId === "summary.lessons")?.answered,
    ).toBe(true);
    expect(
      prompts.find((p) => p.sectionId === "summary.overall")?.answered,
    ).toBe(false);
  });

  it("carries the weekly template's question for the prompts that have one", () => {
    const prompts = reviewGuidePrompts(
      serializeReview(review(), "d_mmm_yyyy"),
      weeklyReviewStep("reflection").sectionIds,
    );
    expect(prompts[0].prompt).toBe("What went well? What was difficult?");
  });

  it("gives the focus step exactly the next-period focus section", () => {
    const prompts = reviewGuidePrompts(
      serializeReview(review(), "d_mmm_yyyy"),
      weeklyReviewStep("focus").sectionIds,
    );
    expect(prompts.map((p) => p.sectionId)).toEqual(["summary.next_focus"]);
  });

  it("quotes each section's stored version, so a save can be a compare-and-set", () => {
    const prompts = reviewGuidePrompts(
      serializeReview(review(), "d_mmm_yyyy"),
      weeklyReviewStep("focus").sectionIds,
    );
    expect(prompts[0].updatedAt).toBe("2026-08-01T00:00:00.000Z");
  });

  it("treats whitespace as unanswered", () => {
    const prompts = reviewGuidePrompts(
      serializeReview(review({ "summary.next_focus": "  \n " }), "d_mmm_yyyy"),
      weeklyReviewStep("focus").sectionIds,
    );
    expect(prompts[0].answered).toBe(false);
  });
});

describe("progress labels", () => {
  it("says where you are, on a phone, in one line", () => {
    expect(mobileProgressLabel("projects", "Projects")).toBe(
      "Step 3 of 7 · Projects",
    );
  });

  it("counts done steps as a position, never a percentage", () => {
    expect(completedStepsLabel(deriveWeeklyReviewProgress(facts()))).toBe(
      "1 of 7 steps done",
    );
  });
});

describe("the completion summary", () => {
  const reflectionSections = weeklyReviewStep("reflection").sectionIds;
  const focusSections = weeklyReviewStep("focus").sectionIds;

  it("reports a cleared Inbox, answered prompts and a recorded focus", () => {
    const serialized = serializeReview(
      review({
        "summary.overall": "Good week",
        "summary.next_focus": "Ship it",
      }),
      "d_mmm_yyyy",
    );
    const summary = reviewCompletionSummary({
      progress: deriveWeeklyReviewProgress(
        facts({
          inboxRemaining: 0,
          answeredSectionIds: ["summary.overall", "summary.next_focus"],
          acknowledgedSteps: ["projects", "alignment"],
        }),
      ),
      review: serialized,
      inboxRemaining: 0,
      reflectionSectionIds: reflectionSections,
      focusSectionIds: focusSections,
    });
    const byId = new Map(summary.map((line) => [line.id, line]));
    expect(byId.get("inbox")?.value).toBe("Cleared");
    expect(byId.get("projects")?.value).toBe("Reviewed");
    expect(byId.get("alignment")?.value).toBe("Considered");
    expect(byId.get("reflection")?.value).toBe("1 of 7 answered");
    expect(byId.get("focus")?.value).toBe("Recorded");
  });

  it("says plainly what remains, without scolding", () => {
    const summary = reviewCompletionSummary({
      progress: deriveWeeklyReviewProgress(facts({ inboxRemaining: 6 })),
      review: serializeReview(review(), "d_mmm_yyyy"),
      inboxRemaining: 6,
      reflectionSectionIds: reflectionSections,
      focusSectionIds: focusSections,
    });
    const byId = new Map(summary.map((line) => [line.id, line]));
    expect(byId.get("inbox")?.value).toBe("6 still waiting");
    expect(byId.get("inbox")?.outstanding).toBe(true);
    expect(byId.get("focus")?.value).toBe("Not recorded");
    expect(byId.get("projects")?.value).toBe("Not marked reviewed");
  });

  it("distinguishes a deliberate decision from an untouched step", () => {
    const summary = reviewCompletionSummary({
      progress: deriveWeeklyReviewProgress(
        facts({ inboxRemaining: 6, acknowledgedSteps: ["inbox", "focus"] }),
      ),
      review: serializeReview(review(), "d_mmm_yyyy"),
      inboxRemaining: 6,
      reflectionSectionIds: reflectionSections,
      focusSectionIds: focusSections,
    });
    const byId = new Map(summary.map((line) => [line.id, line]));
    expect(byId.get("inbox")?.value).toBe("6 left, deliberately");
    expect(byId.get("focus")?.value).toBe("Deliberately not recorded");
    expect(byId.get("acknowledged")?.value).toContain("Clear the Inbox");
  });

  it("stays honest when the Inbox could not be read", () => {
    const summary = reviewCompletionSummary({
      progress: deriveWeeklyReviewProgress(facts({ inboxRemaining: null })),
      review: serializeReview(review(), "d_mmm_yyyy"),
      inboxRemaining: null,
      reflectionSectionIds: reflectionSections,
      focusSectionIds: focusSections,
    });
    const inbox = summary.find((line) => line.id === "inbox");
    expect(inbox?.value).toBe("Couldn’t be read just now");
    expect(inbox?.outstanding).toBe(false);
  });
});
