/**
 * AREA-03 — the React-free Alignment presentation view-model (ADR-040).
 *
 * Covers the display-order sort (state precedence, then recency, then a
 * deterministic id tiebreak), the accessible summary text, the evidence date
 * label, and the owner-calendar context builder. Mirrors
 * `health-view.test.ts`'s style.
 */

import { describe, expect, it } from "vitest";

import {
  alignmentAccessibleSummary,
  alignmentNeedsAttention,
  alignmentToneToCardTone,
  compareAlignmentForDisplay,
  createOwnerAlignmentContext,
  evidenceDateLabel,
} from "~/shared/alignment";
import type { GoalAlignment } from "~/kernel/alignment";

function alignment(overrides: Partial<GoalAlignment> = {}): GoalAlignment {
  return {
    state: "neglected",
    label: "No recent action",
    tone: "info",
    reasons: [
      {
        code: "structure_without_recent_activity",
        tone: "info",
        summary: "Projects exist, but no recent Task activity was found.",
      },
    ],
    evaluatedAtIso: "2026-07-24T00:00:00.000Z",
    ...overrides,
  };
}

describe("compareAlignmentForDisplay", () => {
  it("orders neglected before active before unreachable before no_structure before completed", () => {
    const items = [
      { alignment: alignment({ state: "completed" }), createdAt: "a", id: "1" },
      {
        alignment: alignment({ state: "no_structure" }),
        createdAt: "a",
        id: "2",
      },
      {
        alignment: alignment({ state: "unreachable" }),
        createdAt: "a",
        id: "3",
      },
      { alignment: alignment({ state: "active" }), createdAt: "a", id: "4" },
      { alignment: alignment({ state: "neglected" }), createdAt: "a", id: "5" },
    ];
    const sorted = [...items].sort(compareAlignmentForDisplay);
    expect(sorted.map((i) => i.id)).toEqual(["5", "4", "3", "2", "1"]);
  });

  it("breaks ties within the same state by creation order, then id", () => {
    const items = [
      {
        alignment: alignment({ state: "neglected" }),
        createdAt: "2026-07-02",
        id: "b",
      },
      {
        alignment: alignment({ state: "neglected" }),
        createdAt: "2026-07-01",
        id: "a",
      },
      {
        alignment: alignment({ state: "neglected" }),
        createdAt: "2026-07-01",
        id: "z",
      },
    ];
    const sorted = [...items].sort(compareAlignmentForDisplay);
    expect(sorted.map((i) => i.id)).toEqual(["a", "z", "b"]);
  });

  it("is a stable, deterministic ordering across repeated sorts", () => {
    const items = [
      {
        alignment: alignment({ state: "active" }),
        createdAt: "2026-07-01",
        id: "a",
      },
      {
        alignment: alignment({ state: "neglected" }),
        createdAt: "2026-07-02",
        id: "b",
      },
      {
        alignment: alignment({ state: "no_structure" }),
        createdAt: "2026-07-03",
        id: "c",
      },
    ];
    const first = [...items].sort(compareAlignmentForDisplay).map((i) => i.id);
    const second = [...items].sort(compareAlignmentForDisplay).map((i) => i.id);
    expect(second).toEqual(first);
  });
});

describe("alignmentAccessibleSummary", () => {
  it("combines the label and the primary reason", () => {
    const summary = alignmentAccessibleSummary(alignment());
    expect(summary).toBe(
      "No recent action — Projects exist, but no recent Task activity was found.",
    );
  });

  it("avoids a redundant echo when the reason text equals the label", () => {
    const summary = alignmentAccessibleSummary(
      alignment({
        label: "Completed",
        reasons: [{ code: "completed", tone: "neutral", summary: "Completed" }],
      }),
    );
    expect(summary).toBe("Completed");
  });
});

describe("alignmentNeedsAttention", () => {
  it("flags ONLY the neglected state as needing attention", () => {
    expect(alignmentNeedsAttention(alignment({ state: "neglected" }))).toBe(
      true,
    );
    for (const state of [
      "active",
      "completed",
      "no_structure",
      "unreachable",
    ] as const) {
      expect(alignmentNeedsAttention(alignment({ state }))).toBe(false);
    }
  });
});

describe("alignmentToneToCardTone", () => {
  it("is a lossless identity mapping", () => {
    expect(alignmentToneToCardTone("success")).toBe("success");
    expect(alignmentToneToCardTone("info")).toBe("info");
    expect(alignmentToneToCardTone("neutral")).toBe("neutral");
  });
});

describe("evidenceDateLabel", () => {
  it("labels today's date", () => {
    expect(
      evidenceDateLabel("2026-07-24T10:00:00.000Z", "2026-07-24"),
    ).toContain("(today)");
  });

  it("labels yesterday's date", () => {
    expect(
      evidenceDateLabel("2026-07-23T10:00:00.000Z", "2026-07-24"),
    ).toContain("(yesterday)");
  });

  it("labels an older date with an exact day count", () => {
    expect(
      evidenceDateLabel("2026-07-10T10:00:00.000Z", "2026-07-24"),
    ).toContain("(14 days ago)");
  });

  it("uses the owner's Sydney calendar day, not the UTC day, near UTC midnight (regression)", () => {
    // 2026-07-23T15:00:00.000Z is winter in Sydney (AEST, UTC+10, no DST) —
    // 2026-07-24T01:00 locally. A naive UTC-date slice would read this as
    // "2026-07-23" (yesterday, relative to todayIso "2026-07-24"); the
    // owner-calendar conversion correctly reads it as "today", matching how
    // the alignment STATE itself (via `calendarIsoOf`) would classify the
    // same instant.
    expect(
      evidenceDateLabel("2026-07-23T15:00:00.000Z", "2026-07-24"),
    ).toContain("(today)");
  });

  it("keeps a genuinely-earlier-Sydney-day instant labelled correctly near midnight", () => {
    // 2026-07-23T05:00:00.000Z -> 2026-07-23T15:00 Sydney (AEST) -- still
    // "yesterday" relative to todayIso "2026-07-24", proving the fix is not
    // simply always advancing the date.
    expect(
      evidenceDateLabel("2026-07-23T05:00:00.000Z", "2026-07-24"),
    ).toContain("(yesterday)");
  });
});

describe("createOwnerAlignmentContext", () => {
  it("derives todayIso and the approximate recent-window start from the same instant", () => {
    const { evaluation, recentWindowStartIso } = createOwnerAlignmentContext(
      new Date("2026-07-24T03:00:00.000Z"),
    );
    expect(evaluation.todayIso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(recentWindowStartIso).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/);
    // The window start must be strictly before today.
    expect(recentWindowStartIso.slice(0, 10) < evaluation.todayIso).toBe(true);
  });
});
