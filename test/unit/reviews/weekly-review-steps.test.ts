/**
 * REVIEW-02 — the canonical step registry and the pure progress model.
 *
 * These assert BEHAVIOUR through structured values (step ids, states, blocker
 * codes), never by parsing display prose, so they survive a wording change and
 * fail on a rule change.
 */

import { describe, expect, it } from "vitest";

import {
  FIRST_WEEKLY_REVIEW_STEP,
  LAST_WEEKLY_REVIEW_STEP,
  WEEKLY_REVIEW_STEPS,
  WEEKLY_REVIEW_STEP_COUNT,
  WEEKLY_REVIEW_STEP_IDS,
  WEEKLY_REVIEW_STEP_STATE_LABELS,
  answeredReviewSectionIds,
  deriveWeeklyReviewProgress,
  isWeeklyReviewStepId,
  nextWeeklyReviewStep,
  parseWeeklyReviewStepId,
  previousWeeklyReviewStep,
  resolveWeeklyReviewStep,
  weeklyReviewProgressLabel,
  weeklyReviewStep,
  weeklyReviewStepAccessibleLabel,
  type ReviewSectionId,
  type WeeklyReviewProgressFacts,
  type WeeklyReviewStepId,
} from "~/kernel/reviews";

function facts(
  overrides: Partial<WeeklyReviewProgressFacts> = {},
): WeeklyReviewProgressFacts {
  return {
    status: "in_progress",
    answeredSectionIds: [],
    inboxRemaining: 3,
    acknowledgedSteps: [],
    bookmarkedStep: null,
    ...overrides,
  };
}

describe("the canonical weekly review step registry", () => {
  it("declares seven steps in one place, in order, with unique ids", () => {
    expect(WEEKLY_REVIEW_STEP_COUNT).toBe(7);
    expect(WEEKLY_REVIEW_STEPS.map((step) => step.id)).toEqual([
      ...WEEKLY_REVIEW_STEP_IDS,
    ]);
    expect(new Set(WEEKLY_REVIEW_STEP_IDS).size).toBe(
      WEEKLY_REVIEW_STEP_IDS.length,
    );
    expect(WEEKLY_REVIEW_STEPS.map((step) => step.order)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
  });

  it("gives every step the metadata every consumer needs", () => {
    for (const step of WEEKLY_REVIEW_STEPS) {
      expect(step.label.length).toBeGreaterThan(0);
      expect(step.mobileLabel.length).toBeGreaterThan(0);
      expect(step.description.length).toBeGreaterThan(0);
      // An acknowledgeable step always states the wording of its control.
      expect(step.acknowledgeable).toBe(step.acknowledgeLabel !== null);
    }
  });

  it("only names sections that exist in the closed Review vocabulary", () => {
    const known: readonly ReviewSectionId[] = [
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
    ];
    for (const step of WEEKLY_REVIEW_STEPS) {
      for (const sectionId of step.sectionIds) {
        expect(known).toContain(sectionId);
      }
    }
  });

  it("never lists the same section in two steps", () => {
    const seen = new Set<string>();
    for (const step of WEEKLY_REVIEW_STEPS) {
      for (const sectionId of step.sectionIds) {
        expect(seen.has(sectionId)).toBe(false);
        seen.add(sectionId);
      }
    }
  });

  it("moves forwards and backwards, and stops at both ends", () => {
    expect(FIRST_WEEKLY_REVIEW_STEP).toBe("overview");
    expect(LAST_WEEKLY_REVIEW_STEP).toBe("complete");
    expect(previousWeeklyReviewStep("overview")).toBeNull();
    expect(nextWeeklyReviewStep("complete")).toBeNull();
    expect(nextWeeklyReviewStep("inbox")).toBe("projects");
    expect(previousWeeklyReviewStep("projects")).toBe("inbox");
  });

  it("parses only known step ids and never throws on rubbish", () => {
    expect(parseWeeklyReviewStepId("inbox")).toBe("inbox");
    expect(parseWeeklyReviewStepId("INBOX")).toBeNull();
    expect(parseWeeklyReviewStepId("")).toBeNull();
    expect(parseWeeklyReviewStepId(null)).toBeNull();
    expect(parseWeeklyReviewStepId(7)).toBeNull();
    expect(parseWeeklyReviewStepId({ id: "inbox" })).toBeNull();
    expect(isWeeklyReviewStepId("focus")).toBe(true);
    expect(isWeeklyReviewStepId("nope")).toBe(false);
  });

  it("labels progress as a position, never a score", () => {
    expect(weeklyReviewProgressLabel("projects")).toBe("Step 3 of 7");
    expect(weeklyReviewStepAccessibleLabel("projects")).toBe(
      "Step 3 of 7: Review Projects",
    );
    expect(weeklyReviewStepAccessibleLabel("projects", "complete")).toBe(
      "Step 3 of 7: Review Projects, done",
    );
  });

  it("labels every display state in words, so colour is never the only signal", () => {
    expect(WEEKLY_REVIEW_STEP_STATE_LABELS.complete).toBe("Done");
    expect(WEEKLY_REVIEW_STEP_STATE_LABELS.current).toBe("Current step");
    expect(WEEKLY_REVIEW_STEP_STATE_LABELS.upcoming).toBe("Not started");
  });
});

describe("answeredReviewSectionIds", () => {
  it("treats whitespace as unanswered", () => {
    expect(
      answeredReviewSectionIds([
        { sectionId: "summary.overall", body: "  \n " },
        { sectionId: "summary.lessons", body: "Learned something" },
      ]),
    ).toEqual(["summary.lessons"]);
  });
});

describe("derived progress", () => {
  it("marks the Inbox step done only when the Inbox is genuinely clear", () => {
    const clear = deriveWeeklyReviewProgress(facts({ inboxRemaining: 0 }));
    expect(clear.steps.find((s) => s.id === "inbox")?.derivedComplete).toBe(
      true,
    );

    const notClear = deriveWeeklyReviewProgress(facts({ inboxRemaining: 4 }));
    expect(notClear.steps.find((s) => s.id === "inbox")?.derivedComplete).toBe(
      false,
    );
  });

  it("never reads an unavailable Inbox count as cleared", () => {
    const unknown = deriveWeeklyReviewProgress(facts({ inboxRemaining: null }));
    expect(unknown.steps.find((s) => s.id === "inbox")?.complete).toBe(false);
  });

  it("distinguishes 'Inbox cleared' from 'Inbox step reviewed'", () => {
    const acknowledged = deriveWeeklyReviewProgress(
      facts({ inboxRemaining: 5, acknowledgedSteps: ["inbox"] }),
    );
    const inbox = acknowledged.steps.find((s) => s.id === "inbox");
    expect(inbox?.derivedComplete).toBe(false);
    expect(inbox?.acknowledged).toBe(true);
    expect(inbox?.complete).toBe(true);
  });

  it("completes the reflection step from ANY answered prompt", () => {
    const progress = deriveWeeklyReviewProgress(
      facts({ answeredSectionIds: ["summary.lessons"] }),
    );
    expect(progress.steps.find((s) => s.id === "reflection")?.complete).toBe(
      true,
    );
    // The focus prompt belongs to its own step and is untouched by this.
    expect(progress.steps.find((s) => s.id === "focus")?.complete).toBe(false);
  });

  it("completes the focus step from the next-period focus section", () => {
    const progress = deriveWeeklyReviewProgress(
      facts({ answeredSectionIds: ["summary.next_focus"] }),
    );
    expect(progress.steps.find((s) => s.id === "focus")?.complete).toBe(true);
  });

  it("marks the final step complete only from the Review's own lifecycle", () => {
    expect(
      deriveWeeklyReviewProgress(facts({ status: "completed" })).steps.find(
        (s) => s.id === "complete",
      )?.complete,
    ).toBe(true);
    expect(
      deriveWeeklyReviewProgress(facts({ status: "draft" })).steps.find(
        (s) => s.id === "complete",
      )?.complete,
    ).toBe(false);
  });

  it("counts completed steps for the progress line", () => {
    const progress = deriveWeeklyReviewProgress(
      facts({
        inboxRemaining: 0,
        answeredSectionIds: ["summary.overall", "summary.next_focus"],
        acknowledgedSteps: ["overview"],
      }),
    );
    expect(progress.completedCount).toBe(4);
    expect(progress.totalCount).toBe(7);
  });

  it("exposes exactly one current step, and shows it as current even when done", () => {
    const progress = deriveWeeklyReviewProgress(
      facts({ bookmarkedStep: "inbox", inboxRemaining: 0 }),
    );
    expect(progress.steps.filter((s) => s.state === "current")).toHaveLength(1);
    const inbox = progress.steps.find((s) => s.id === "inbox");
    expect(inbox?.state).toBe("current");
    expect(inbox?.complete).toBe(true);
  });
});

describe("required steps and completion blockers", () => {
  it("blocks completion while a required step is neither done nor acknowledged", () => {
    const progress = deriveWeeklyReviewProgress(facts());
    expect(progress.canComplete).toBe(false);
    expect(progress.blockers.map((b) => b.stepId)).toEqual([
      "reflection",
      "focus",
    ]);
  });

  it("never blocks on the Inbox, on Projects, or on unanswered optional prompts", () => {
    const progress = deriveWeeklyReviewProgress(
      facts({
        inboxRemaining: 42,
        answeredSectionIds: ["summary.overall", "summary.next_focus"],
      }),
    );
    expect(progress.canComplete).toBe(true);
    expect(progress.blockers).toEqual([]);
  });

  it("accepts a deliberate acknowledgement in place of an answer", () => {
    const progress = deriveWeeklyReviewProgress(
      facts({ acknowledgedSteps: ["reflection", "focus"] }),
    );
    expect(progress.canComplete).toBe(true);
  });

  it("does not list the final step as its own blocker", () => {
    const progress = deriveWeeklyReviewProgress(facts());
    expect(progress.blockers.map((b) => b.stepId)).not.toContain("complete");
  });
});

describe("resume", () => {
  it("honours the persisted bookmark, so live counts never move the owner back", () => {
    const progress = deriveWeeklyReviewProgress(
      facts({ bookmarkedStep: "reflection", inboxRemaining: 99 }),
    );
    expect(progress.currentStepId).toBe("reflection");
  });

  it("opens a brand-new Review at the first step", () => {
    const progress = deriveWeeklyReviewProgress(
      facts({ status: "draft", inboxRemaining: 3 }),
    );
    expect(progress.currentStepId).toBe("overview");
  });

  it("falls back to the first incomplete step for a Review with no bookmark", () => {
    // An existing Review created before the guided flow: Inbox already clear and
    // "Settle in" acknowledged, so the first thing left to do is the Projects check.
    const progress = deriveWeeklyReviewProgress(
      facts({
        inboxRemaining: 0,
        acknowledgedSteps: ["overview"],
      }),
    );
    expect(progress.currentStepId).toBe("projects");
  });

  it("always opens a completed Review on its final step", () => {
    const progress = deriveWeeklyReviewProgress(
      facts({ status: "completed", bookmarkedStep: "inbox" }),
    );
    expect(progress.currentStepId).toBe("complete");
  });
});

describe("unknown-step recovery", () => {
  const progress = deriveWeeklyReviewProgress(
    facts({ bookmarkedStep: "projects" }),
  );

  it("recovers an unknown, missing or malformed step to the current one", () => {
    for (const requested of [null, undefined, "", "wizard", 3, {}]) {
      const resolved = resolveWeeklyReviewStep(requested, progress);
      expect(resolved.stepId).toBe("projects");
      expect(resolved.recovered).toBe(true);
    }
  });

  it("accepts every known step, including ones ahead of the current one", () => {
    for (const stepId of WEEKLY_REVIEW_STEP_IDS) {
      const resolved = resolveWeeklyReviewStep(stepId, progress);
      expect(resolved.stepId).toBe(stepId);
      expect(resolved.recovered).toBe(false);
    }
  });

  it("does not let jumping ahead bypass the completion prerequisites", () => {
    const resolved = resolveWeeklyReviewStep("complete", progress);
    expect(resolved.stepId).toBe("complete");
    // Reaching the final step is allowed; completing from it is still refused.
    expect(progress.canComplete).toBe(false);
  });
});

describe("step lookup", () => {
  it("resolves every id in the union", () => {
    for (const id of WEEKLY_REVIEW_STEP_IDS) {
      expect(weeklyReviewStep(id as WeeklyReviewStepId).id).toBe(id);
    }
  });
});
