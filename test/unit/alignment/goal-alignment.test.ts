/**
 * AREA-03 — the pure Goal alignment evaluator matrix (ADR-040).
 *
 * Every case asserts on STRUCTURED state/reason codes, never a rendered
 * string, mirroring `goal-progress.test.ts`/`area-momentum.test.ts`. No
 * reason ever reports a meaningless zero count; ordering/classification is
 * deterministic for the same facts + clock.
 */

import { describe, expect, it } from "vitest";

import {
  RECENT_ACTION_WINDOW_DAYS,
  composeGoalAlignmentFacts,
  deduplicateGoalIds,
  evaluateGoalAlignment,
  type AlignmentEvaluationContext,
  type GoalAlignment,
  type GoalAlignmentFacts,
} from "~/kernel/alignment";
import { EMPTY_GOAL_PROJECT_CONTRIBUTION } from "~/kernel/goals";
import type { GoalProjectContribution } from "~/kernel/goals";

const CTX: AlignmentEvaluationContext = {
  now: new Date("2026-07-24T09:00:00.000Z"),
  todayIso: "2026-07-24",
  calendarIsoOf: (instant) => instant.toISOString().slice(0, 10),
};

function contribution(
  overrides: Partial<GoalProjectContribution> = {},
): GoalProjectContribution {
  return { ...EMPTY_GOAL_PROJECT_CONTRIBUTION, ...overrides };
}

function facts(
  overrides: Partial<GoalAlignmentFacts> = {},
): GoalAlignmentFacts {
  return {
    goalId: "g1",
    completedAt: null,
    contribution: contribution(),
    recentContributingTaskCount: 0,
    lastContributingActivityAt: null,
    ...overrides,
  };
}

/** Assert no reason in the result ever reports a zero count. */
function expectNoZeroCountReason(alignment: GoalAlignment) {
  for (const reason of alignment.reasons) {
    if (reason.count !== undefined) {
      expect(reason.count).toBeGreaterThan(0);
    }
  }
}

/** Assert every reason code in the result is unique (no duplicate codes). */
function expectUniqueReasonCodes(alignment: GoalAlignment) {
  const codes = alignment.reasons.map((r) => r.code);
  expect(new Set(codes).size).toBe(codes.length);
}

describe("evaluateGoalAlignment", () => {
  it("classifies a Goal with no linked Projects as no_structure", () => {
    const alignment = evaluateGoalAlignment(
      facts({ contribution: contribution({ total: 0 }) }),
      CTX,
    );
    expect(alignment.state).toBe("no_structure");
    expect(alignment.tone).toBe("neutral");
    expect(alignment.reasons.map((r) => r.code)).toEqual(["no_structure"]);
    expectNoZeroCountReason(alignment);
    expectUniqueReasonCodes(alignment);
  });

  it("classifies an explicitly completed Goal as completed regardless of activity", () => {
    const alignment = evaluateGoalAlignment(
      facts({
        completedAt: new Date("2026-07-01T00:00:00.000Z"),
        contribution: contribution({ total: 0 }),
        lastContributingActivityAt: null,
      }),
      CTX,
    );
    expect(alignment.state).toBe("completed");
    expect(alignment.label).toBe("Completed");
    expect(alignment.reasons).toEqual([
      { code: "completed", tone: "neutral", summary: expect.any(String) },
    ]);
  });

  it("completed always wins even with recent contributing activity", () => {
    const alignment = evaluateGoalAlignment(
      facts({
        completedAt: new Date("2026-07-20T00:00:00.000Z"),
        contribution: contribution({ total: 1, active: 1 }),
        recentContributingTaskCount: 3,
        lastContributingActivityAt: new Date("2026-07-24T00:00:00.000Z"),
      }),
      CTX,
    );
    expect(alignment.state).toBe("completed");
  });

  it("classifies a Goal whose every linked Project is archived as unreachable", () => {
    const alignment = evaluateGoalAlignment(
      facts({
        contribution: contribution({ total: 2, archived: 2, completed: 1 }),
      }),
      CTX,
    );
    expect(alignment.state).toBe("unreachable");
    expect(alignment.reasons).toEqual([
      {
        code: "unreachable_archived",
        tone: "neutral",
        summary: "All 2 Projects linked to this Goal are archived.",
        count: 2,
      },
    ]);
    expectNoZeroCountReason(alignment);
  });

  it("uses singular phrasing for exactly one archived Project", () => {
    const alignment = evaluateGoalAlignment(
      facts({ contribution: contribution({ total: 1, archived: 1 }) }),
      CTX,
    );
    expect(alignment.state).toBe("unreachable");
    expect(alignment.reasons[0]?.summary).toBe(
      "The one Project linked to this Goal is archived.",
    );
  });

  it("does NOT classify unreachable when Projects exist but only some are archived", () => {
    const alignment = evaluateGoalAlignment(
      facts({
        contribution: contribution({ total: 2, archived: 1, planned: 1 }),
      }),
      CTX,
    );
    expect(alignment.state).not.toBe("unreachable");
  });

  it("does NOT classify unreachable for a completed-but-not-archived Project — it can still receive new work", () => {
    const alignment = evaluateGoalAlignment(
      facts({
        contribution: contribution({ total: 1, completed: 1, archived: 0 }),
      }),
      CTX,
    );
    expect(alignment.state).not.toBe("unreachable");
    expect(alignment.state).toBe("neglected");
  });

  it("classifies a Goal with a contribution path but no recorded activity as neglected, with an honest no-activity reason", () => {
    const alignment = evaluateGoalAlignment(
      facts({
        contribution: contribution({ total: 1, active: 1 }),
        lastContributingActivityAt: null,
      }),
      CTX,
    );
    expect(alignment.state).toBe("neglected");
    expect(alignment.tone).toBe("info");
    expect(alignment.reasons.map((r) => r.code)).toEqual([
      "structure_without_recent_activity",
      "no_contribution_recorded",
      "contributing_projects",
    ]);
    expectNoZeroCountReason(alignment);
    expectUniqueReasonCodes(alignment);
  });

  it("classifies a Goal with a contribution path and OLD activity as neglected, reporting exact days", () => {
    const alignment = evaluateGoalAlignment(
      facts({
        contribution: contribution({ total: 1, active: 1 }),
        lastContributingActivityAt: new Date("2026-07-01T00:00:00.000Z"),
      }),
      CTX,
    );
    expect(alignment.state).toBe("neglected");
    const lastContribution = alignment.reasons.find(
      (r) => r.code === "last_contribution",
    );
    expect(lastContribution?.days).toBe(23);
    expect(lastContribution?.summary).toContain("23 days ago");
    expectNoZeroCountReason(alignment);
  });

  it("classifies a Goal with recent contributing Task activity as active", () => {
    const alignment = evaluateGoalAlignment(
      facts({
        contribution: contribution({ total: 1, active: 1 }),
        recentContributingTaskCount: 3,
        lastContributingActivityAt: new Date("2026-07-22T00:00:00.000Z"),
      }),
      CTX,
    );
    expect(alignment.state).toBe("active");
    expect(alignment.tone).toBe("success");
    expect(alignment.reasons.map((r) => r.code)).toEqual([
      "last_contribution",
      "recent_activity",
      "contributing_projects",
    ]);
    expect(
      alignment.reasons.find((r) => r.code === "recent_activity")?.count,
    ).toBe(3);
    expectNoZeroCountReason(alignment);
    expectUniqueReasonCodes(alignment);
  });

  it("omits the recent_activity count reason when the supporting count is zero, even while active", () => {
    // A defensive edge case: the approximate SQL count window is always at
    // least as wide as the precise state boundary (ADR-040 §40.4), so this
    // should not occur in production data, but the evaluator must never show
    // a "0 Tasks" reason regardless.
    const alignment = evaluateGoalAlignment(
      facts({
        contribution: contribution({ total: 1, active: 1 }),
        recentContributingTaskCount: 0,
        lastContributingActivityAt: new Date("2026-07-22T00:00:00.000Z"),
      }),
      CTX,
    );
    expect(alignment.state).toBe("active");
    expect(alignment.reasons.map((r) => r.code)).not.toContain(
      "recent_activity",
    );
    expectNoZeroCountReason(alignment);
  });

  it("omits the contributing_projects reason when no bucket is currently able to advance the Goal (all linked Projects completed, none archived)", () => {
    const alignment = evaluateGoalAlignment(
      facts({
        contribution: contribution({ total: 2, completed: 2, archived: 0 }),
        lastContributingActivityAt: new Date("2026-07-01T00:00:00.000Z"),
      }),
      CTX,
    );
    expect(alignment.state).toBe("neglected");
    expect(alignment.reasons.map((r) => r.code)).not.toContain(
      "contributing_projects",
    );
    expectNoZeroCountReason(alignment);
  });

  describe("the recent-action window boundary (inclusive, ADR-040 §40.4)", () => {
    it(`treats activity ${RECENT_ACTION_WINDOW_DAYS - 1} days ago as active (just inside the window)`, () => {
      const lastAt = new Date(CTX.now);
      lastAt.setUTCDate(lastAt.getUTCDate() - (RECENT_ACTION_WINDOW_DAYS - 1));
      const alignment = evaluateGoalAlignment(
        facts({
          contribution: contribution({ total: 1, active: 1 }),
          lastContributingActivityAt: lastAt,
        }),
        CTX,
      );
      expect(alignment.state).toBe("active");
    });

    it(`treats activity EXACTLY ${RECENT_ACTION_WINDOW_DAYS} days ago as neglected (the boundary itself is outside the window)`, () => {
      const lastAt = new Date(CTX.now);
      lastAt.setUTCDate(lastAt.getUTCDate() - RECENT_ACTION_WINDOW_DAYS);
      const alignment = evaluateGoalAlignment(
        facts({
          contribution: contribution({ total: 1, active: 1 }),
          lastContributingActivityAt: lastAt,
        }),
        CTX,
      );
      expect(alignment.state).toBe("neglected");
    });

    it(`treats activity ${RECENT_ACTION_WINDOW_DAYS + 1} days ago as neglected`, () => {
      const lastAt = new Date(CTX.now);
      lastAt.setUTCDate(lastAt.getUTCDate() - (RECENT_ACTION_WINDOW_DAYS + 1));
      const alignment = evaluateGoalAlignment(
        facts({
          contribution: contribution({ total: 1, active: 1 }),
          lastContributingActivityAt: lastAt,
        }),
        CTX,
      );
      expect(alignment.state).toBe("neglected");
    });

    it("treats activity recorded today as active with a calm 'today' phrasing", () => {
      const alignment = evaluateGoalAlignment(
        facts({
          contribution: contribution({ total: 1, active: 1 }),
          lastContributingActivityAt: new Date(CTX.now),
        }),
        CTX,
      );
      expect(alignment.state).toBe("active");
      expect(alignment.reasons[0]?.summary).toBe(
        "Contributing Task activity was recorded today.",
      );
    });

    it("treats activity recorded yesterday with calm 'yesterday' phrasing", () => {
      const yesterday = new Date(CTX.now);
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      const alignment = evaluateGoalAlignment(
        facts({
          contribution: contribution({ total: 1, active: 1 }),
          lastContributingActivityAt: yesterday,
        }),
        CTX,
      );
      expect(alignment.state).toBe("active");
      expect(alignment.reasons[0]?.summary).toBe(
        "Contributing Task activity was recorded yesterday.",
      );
    });
  });

  it("reflects multiple Projects advancing one Goal via the exact contribution counts (no recomputation)", () => {
    const alignment = evaluateGoalAlignment(
      facts({
        contribution: contribution({
          total: 3,
          active: 1,
          planned: 1,
          onHold: 1,
        }),
        lastContributingActivityAt: new Date("2026-07-23T00:00:00.000Z"),
      }),
      CTX,
    );
    expect(alignment.state).toBe("active");
    const contributingReason = alignment.reasons.find(
      (r) => r.code === "contributing_projects",
    );
    expect(contributingReason?.count).toBe(3);
    expect(contributingReason?.summary).toBe(
      "3 Projects are currently able to advance this Goal.",
    );
  });

  it("never uses a warning or danger tone for any state, even long neglect", () => {
    const veryOld = new Date("2020-01-01T00:00:00.000Z");
    const states: GoalAlignmentFacts[] = [
      facts({ completedAt: new Date("2026-01-01") }),
      facts({ contribution: contribution({ total: 0 }) }),
      facts({ contribution: contribution({ total: 1, archived: 1 }) }),
      facts({
        contribution: contribution({ total: 1, active: 1 }),
        lastContributingActivityAt: veryOld,
      }),
      facts({
        contribution: contribution({ total: 1, active: 1 }),
        lastContributingActivityAt: new Date(CTX.now),
        recentContributingTaskCount: 1,
      }),
    ];
    for (const input of states) {
      const alignment = evaluateGoalAlignment(input, CTX);
      expect(alignment.tone).not.toBe("warning");
      expect(alignment.tone).not.toBe("danger");
      for (const reason of alignment.reasons) {
        expect(reason.tone).not.toBe("warning");
        expect(reason.tone).not.toBe("danger");
      }
    }
  });

  it("is a deterministic pure function of (facts, clock) — same input, same output", () => {
    const input = facts({
      contribution: contribution({ total: 2, active: 1, planned: 1 }),
      lastContributingActivityAt: new Date("2026-07-10T00:00:00.000Z"),
      recentContributingTaskCount: 0,
    });
    const first = evaluateGoalAlignment(input, CTX);
    const second = evaluateGoalAlignment(input, CTX);
    expect(second).toEqual(first);
  });
});

describe("composeGoalAlignmentFacts", () => {
  it("composes the honest zero/null shape when no activity facts were gathered", () => {
    const composed = composeGoalAlignmentFacts({
      goalId: "g1",
      completedAt: null,
      contribution: contribution({ total: 1, active: 1 }),
      activity: undefined,
    });
    expect(composed).toEqual({
      goalId: "g1",
      completedAt: null,
      contribution: contribution({ total: 1, active: 1 }),
      recentContributingTaskCount: 0,
      lastContributingActivityAt: null,
    });
  });

  it("composes real activity facts unchanged when present", () => {
    const lastAt = new Date("2026-07-20T00:00:00.000Z");
    const composed = composeGoalAlignmentFacts({
      goalId: "g1",
      completedAt: null,
      contribution: contribution({ total: 1, active: 1 }),
      activity: {
        goalId: "g1",
        recentContributingTaskCount: 4,
        lastContributingActivityAt: lastAt,
      },
    });
    expect(composed.recentContributingTaskCount).toBe(4);
    expect(composed.lastContributingActivityAt).toBe(lastAt);
  });
});

describe("deduplicateGoalIds", () => {
  it("removes duplicate ids while preserving first-seen order — defence in depth for the spine's one-active-parent invariant", () => {
    // The spine's partial unique index makes "one Project advancing two
    // Goals" structurally impossible (SPINE_MODEL.md), so this scenario never
    // occurs with real data; this proves the evaluator layer never trusts
    // that invariant blindly.
    expect(deduplicateGoalIds(["g1", "g2", "g1", "g3", "g2"])).toEqual([
      "g1",
      "g2",
      "g3",
    ]);
  });
});
