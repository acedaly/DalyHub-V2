/**
 * AREA-02 — the Goals view-model matrix: contribution progress presentation
 * (including the exact zero-denominator case), target-date display states, and
 * explicit completion kept entirely separate from derived progress.
 */

import { describe, expect, it } from "vitest";

import {
  goalContributionProgress,
  goalProjectStateLabel,
  goalStateLabel,
  isGoalComplete,
  targetDatePresentation,
  type SerializedGoalProjectContribution,
} from "~/modules/goals/goal-view";

function contribution(
  overrides: Partial<SerializedGoalProjectContribution> = {},
): SerializedGoalProjectContribution {
  return {
    total: 0,
    completed: 0,
    incomplete: 0,
    active: 0,
    planned: 0,
    onHold: 0,
    archived: 0,
    ...overrides,
  };
}

describe("goalContributionProgress", () => {
  it("presents the honest empty state for zero linked Projects — never a misleading 0% bar", () => {
    const result = goalContributionProgress(contribution());
    expect(result.has).toBe(false);
    expect(result.total).toBe(0);
    expect(result.summary).toBe("No Projects contributing yet");
  });

  it("presents a partial contribution with the exact percentage and summary", () => {
    const result = goalContributionProgress(
      contribution({ total: 4, completed: 1, incomplete: 3 }),
    );
    expect(result.has).toBe(true);
    expect(result.percent).toBe(25);
    expect(result.summary).toBe("1 of 4 Projects complete");
  });

  it("presents a complete contribution (100%) without implying Goal completion", () => {
    const result = goalContributionProgress(
      contribution({ total: 3, completed: 3 }),
    );
    expect(result.percent).toBe(100);
    expect(result.summary).toBe("3 of 3 Projects complete");
    // The presentation object carries no completion verdict at all.
    expect(result).not.toHaveProperty("goalComplete");
  });

  it("uses singular 'Project' for exactly one", () => {
    const result = goalContributionProgress(
      contribution({ total: 1, completed: 0 }),
    );
    expect(result.summary).toBe("0 of 1 Project complete");
  });
});

describe("isGoalComplete / goalStateLabel — explicit completion, never derived", () => {
  it("is false when completedAt is null, regardless of 100% derived progress", () => {
    expect(isGoalComplete({ completedAt: null })).toBe(false);
    expect(goalStateLabel({ completedAt: null })).toEqual({
      label: "Open",
      tone: "neutral",
    });
  });

  it("is true only when completedAt is set — the explicit spine signal", () => {
    expect(isGoalComplete({ completedAt: "2026-07-20T00:00:00.000Z" })).toBe(
      true,
    );
    expect(goalStateLabel({ completedAt: "2026-07-20T00:00:00.000Z" })).toEqual(
      { label: "Completed", tone: "success" },
    );
  });
});

describe("targetDatePresentation", () => {
  const TODAY = "2026-07-22";

  it("is 'unset' when there is no target date", () => {
    expect(targetDatePresentation(null, TODAY)).toEqual({
      state: "unset",
      formatted: null,
      raw: null,
    });
  });

  it("is 'overdue' for a target date before today", () => {
    const result = targetDatePresentation("2026-07-01", TODAY);
    expect(result.state).toBe("overdue");
    expect(result.formatted).toBe("1 Jul 2026");
    expect(result.raw).toBe("2026-07-01");
  });

  it("is 'upcoming' for a target date today or later", () => {
    expect(targetDatePresentation(TODAY, TODAY).state).toBe("upcoming");
    expect(targetDatePresentation("2026-08-01", TODAY).state).toBe("upcoming");
  });

  it("never uses the target date to imply completion — the type carries no such field", () => {
    const result = targetDatePresentation("2026-07-01", TODAY);
    expect(result).not.toHaveProperty("goalComplete");
    expect(result).not.toHaveProperty("completed");
  });
});

describe("goalProjectStateLabel — Archived precedes Completed", () => {
  it("labels an open, active-status Project by its workflow status", () => {
    expect(
      goalProjectStateLabel({
        completedAt: null,
        archivedAt: null,
        status: "active",
      }),
    ).toEqual({ label: "Active", tone: "neutral" });
  });

  it("labels a completed Project as Completed", () => {
    expect(
      goalProjectStateLabel({
        completedAt: "2026-07-01T00:00:00.000Z",
        archivedAt: null,
        status: "active",
      }),
    ).toEqual({ label: "Completed", tone: "success" });
  });

  it("labels a completed AND archived Project as Archived (precedence)", () => {
    expect(
      goalProjectStateLabel({
        completedAt: "2026-07-01T00:00:00.000Z",
        archivedAt: "2026-07-05T00:00:00.000Z",
        status: "active",
      }),
    ).toEqual({ label: "Archived", tone: "neutral" });
  });
});
