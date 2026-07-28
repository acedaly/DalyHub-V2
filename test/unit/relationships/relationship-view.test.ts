import { describe, expect, it } from "vitest";

import type {
  PersonRelationship,
  RelationshipCadence,
  RelationshipReason,
} from "~/kernel/relationships";
import {
  cadencePhrase,
  formatRelationshipDate,
  lastInteractionPhrase,
  relationshipReasonText,
  relationshipToneToCardTone,
  relationshipToneToSummaryTone,
  relativeDayPhrase,
} from "~/shared/relationships";

/**
 * PEOPLE-03 — the shared relationship WORDING. The rules are tested against
 * structured fields in `person-relationship.test.ts`; this file covers only how
 * those structured fields become calm English, including the tone rules from
 * AGENTS.md §5 (a duration is a fact, never a failure).
 */

function cadence(
  overrides: Partial<RelationshipCadence> = {},
): RelationshipCadence {
  return {
    daysSinceLastInteraction: null,
    averageIntervalDays: null,
    longestGapDays: null,
    interactionDays: 0,
    observedSpanDays: null,
    interactionsPerMonth: null,
    expectedIntervalDays: null,
    expectedIntervalSource: null,
    sampleTruncated: false,
    ...overrides,
  };
}

function reason(overrides: Partial<RelationshipReason>): RelationshipReason {
  return {
    code: "recent_interaction",
    tone: "success",
    summary: "fallback summary",
    ...overrides,
  } as RelationshipReason;
}

describe("relativeDayPhrase", () => {
  it("uses human words for the near past", () => {
    expect(relativeDayPhrase(0)).toBe("today");
    expect(relativeDayPhrase(1)).toBe("yesterday");
    expect(relativeDayPhrase(3)).toBe("3 days ago");
  });

  it("approximates longer durations, and says that it is approximating", () => {
    expect(relativeDayPhrase(21)).toBe("about 3 weeks ago");
    expect(relativeDayPhrase(90)).toBe("about 3 months ago");
    expect(relativeDayPhrase(400)).toMatch(/^about 1\.1 years ago$/);
  });

  it("never renders a negative duration", () => {
    expect(relativeDayPhrase(-5)).toBe("today");
  });
});

describe("cadencePhrase", () => {
  it("describes a rhythm in the owner's language, not a number", () => {
    expect(cadencePhrase(cadence({ averageIntervalDays: 7 }))).toBe(
      "about weekly",
    );
    expect(cadencePhrase(cadence({ averageIntervalDays: 14 }))).toBe(
      "about once a fortnight",
    );
    expect(cadencePhrase(cadence({ averageIntervalDays: 30 }))).toBe(
      "about once a month",
    );
    expect(cadencePhrase(cadence({ averageIntervalDays: 365 }))).toBe(
      "about once a year",
    );
  });

  it("says nothing at all when there is no rhythm to claim", () => {
    expect(cadencePhrase(cadence())).toBeNull();
    expect(cadencePhrase(cadence({ averageIntervalDays: 0 }))).toBeNull();
  });
});

describe("formatRelationshipDate", () => {
  it("formats a calendar date warmly, in the owner's locale", () => {
    expect(formatRelationshipDate("2026-07-28")).toBe("28 July 2026");
  });

  it("returns null for anything that is not a calendar date", () => {
    expect(formatRelationshipDate(null)).toBeNull();
    expect(formatRelationshipDate("28/07/2026")).toBeNull();
    expect(formatRelationshipDate("2026-07-28T00:00:00Z")).toBeNull();
  });
});

describe("relationshipReasonText", () => {
  it("prefers warm phrasing derived from the structured fields", () => {
    expect(
      relationshipReasonText(reason({ code: "recent_interaction", days: 1 })),
    ).toBe("You shared something yesterday.");
  });

  it("names the date for an extended absence rather than counting days at the owner", () => {
    const text = relationshipReasonText(
      reason({
        code: "extended_absence",
        tone: "info",
        days: 240,
        date: "2025-12-01",
      }),
    );
    expect(text).toBe("Nothing shared since 1 December 2025.");
    expect(text).not.toMatch(/overdue|lapsed|should|failed/i);
  });

  it("falls back to the evaluator's factual summary when it has nothing better", () => {
    expect(
      relationshipReasonText(
        reason({
          code: "no_interactions",
          tone: "neutral",
          summary: "Nothing shared yet.",
        }),
      ),
    ).toBe("Nothing shared yet.");
    expect(
      relationshipReasonText(
        reason({
          code: "extended_absence",
          tone: "info",
          summary: "No shared activity.",
        }),
      ),
    ).toBe("No shared activity.");
  });

  it("never uses guilt language for any reason code", () => {
    const codes: RelationshipReason["code"][] = [
      "no_interactions",
      "recent_interaction",
      "steady_rhythm",
      "single_interaction",
      "cadence_elapsed",
      "follow_up_date_passed",
      "rhythm_elapsed",
      "extended_absence",
    ];
    for (const code of codes) {
      const text = relationshipReasonText(
        reason({ code, tone: "info", days: 30, date: "2026-06-28", count: 2 }),
      );
      expect(text).not.toMatch(/overdue|neglect|lapsed|failing|you should/i);
      expect(text.length).toBeGreaterThan(0);
    }
  });
});

describe("tone mapping", () => {
  it("is a lossless identity onto the Card and summary-card vocabularies", () => {
    for (const tone of ["neutral", "success", "info"] as const) {
      expect(relationshipToneToCardTone(tone)).toBe(tone);
      expect(relationshipToneToSummaryTone(tone)).toBe(tone);
    }
  });
});

describe("lastInteractionPhrase", () => {
  const base: PersonRelationship = {
    personId: "pe1",
    state: "in_touch",
    label: "In touch",
    tone: "neutral",
    reasons: [reason({ code: "steady_rhythm", tone: "neutral" })],
    summary: {
      totalInteractions: 1,
      meetings: 0,
      diaryEntries: 0,
      notes: 0,
      tasks: 0,
      openTasks: 0,
      projects: 0,
      activeProjects: 0,
      reviews: 0,
      otherRecords: 0,
      sharedRecords: 0,
      firstInteractionIso: null,
      firstInteractionDate: null,
      lastInteractionIso: null,
      lastInteractionDate: null,
    },
    cadence: cadence(),
    evaluatedAtIso: "2026-07-28T00:00:00.000Z",
  };

  it("answers 'when did I last interact' in one line", () => {
    expect(
      lastInteractionPhrase({
        ...base,
        cadence: cadence({ daysSinceLastInteraction: 3 }),
      }),
    ).toBe("3 days ago");
  });

  it("reads as an invitation, not a gap, when there is no history", () => {
    expect(lastInteractionPhrase(base)).toBe("No shared history yet");
  });
});
