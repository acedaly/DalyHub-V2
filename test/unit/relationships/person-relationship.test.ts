import { describe, expect, it } from "vitest";

import {
  EMPTY_RELATIONSHIP_RECORD_COUNTS,
  EXTENDED_ABSENCE_AFTER_DAYS,
  FOLLOW_UP_CADENCE_DAYS,
  INTERACTION_ACTIVITY_TYPES,
  MIN_DAYS_FOR_OBSERVED_RHYTHM,
  RECENTLY_CONNECTED_WITHIN_DAYS,
  emptyPersonRelationshipFacts,
  evaluatePersonRelationship,
  relationshipDaysBetween,
  relationshipStateLabel,
  type PersonRelationshipFacts,
  type RelationshipEvaluationContext,
  type RelationshipRecordCounts,
} from "~/kernel/relationships";

/**
 * PEOPLE-03 — the pure relationship evaluator.
 *
 * These tests exercise the RULES with no database, no React and no wall clock: the
 * evaluator is a pure function of (facts, injected clock), so the whole matrix —
 * summary aggregation, cadence arithmetic, the stay-in-touch state precedence and
 * the reason codes — is asserted on STRUCTURED fields only. No test parses a
 * user-facing string to decide whether a rule fired (roadmap §10); wording lives in
 * the shared view helpers and is tested separately.
 */

const TZ_ISO = (instant: Date) => instant.toISOString().slice(0, 10);

function ctx(
  todayIso: string,
  overrides: Partial<RelationshipEvaluationContext> = {},
): RelationshipEvaluationContext {
  return {
    now: new Date(`${todayIso}T09:00:00.000Z`),
    todayIso,
    calendarIsoOf: TZ_ISO,
    followUpFrequency: null,
    nextFollowUpIso: null,
    ...overrides,
  };
}

function at(iso: string): Date {
  return new Date(`${iso}T12:00:00.000Z`);
}

function facts(
  overrides: Partial<PersonRelationshipFacts> = {},
): PersonRelationshipFacts {
  return { ...emptyPersonRelationshipFacts("pe1"), ...overrides };
}

function counts(
  overrides: Partial<RelationshipRecordCounts> = {},
): RelationshipRecordCounts {
  return { ...EMPTY_RELATIONSHIP_RECORD_COUNTS, ...overrides };
}

/** Build a facts object from a list of interaction dates (oldest → newest). */
function fromDates(
  dates: readonly string[],
  overrides: Partial<PersonRelationshipFacts> = {},
): PersonRelationshipFacts {
  const instants = dates.map(at);
  return facts({
    totalInteractions: instants.length,
    firstInteractionAt: instants[0] ?? null,
    lastInteractionAt: instants[instants.length - 1] ?? null,
    interactionSample: [...instants].reverse(),
    ...overrides,
  });
}

describe("relationshipDaysBetween", () => {
  it("counts whole calendar days, signed", () => {
    expect(relationshipDaysBetween("2026-07-01", "2026-07-08")).toBe(7);
    expect(relationshipDaysBetween("2026-07-08", "2026-07-01")).toBe(-7);
    expect(relationshipDaysBetween("2026-07-08", "2026-07-08")).toBe(0);
  });

  it("crosses month and year boundaries", () => {
    expect(relationshipDaysBetween("2026-12-31", "2027-01-01")).toBe(1);
    expect(relationshipDaysBetween("2026-02-28", "2026-03-01")).toBe(1);
  });

  it("refuses anything that is not a calendar date", () => {
    expect(() => relationshipDaysBetween("2026-7-1", "2026-07-08")).toThrow(
      RangeError,
    );
  });
});

describe("the interaction vocabulary", () => {
  it("never counts an edit to the Person's own contact card as an interaction", () => {
    for (const type of INTERACTION_ACTIVITY_TYPES) {
      expect(type.startsWith("person.")).toBe(false);
      expect(type.startsWith("entity_link.")).toBe(false);
    }
  });

  it("excludes renames, deletion and restoration (tidying, not contact)", () => {
    const excluded = ["entity.updated", "entity.deleted", "entity.restored"];
    for (const type of excluded) {
      expect(INTERACTION_ACTIVITY_TYPES).not.toContain(type);
    }
  });
});

describe("evaluatePersonRelationship — the summary", () => {
  it("reports the honest zero shape for a Person with nothing shared", () => {
    const result = evaluatePersonRelationship(facts(), ctx("2026-07-28"));

    expect(result.state).toBe("no_history");
    expect(result.tone).toBe("neutral");
    expect(result.label).toBe(relationshipStateLabel("no_history"));
    expect(result.reasons.map((r) => r.code)).toEqual(["no_interactions"]);
    expect(result.summary.totalInteractions).toBe(0);
    expect(result.summary.sharedRecords).toBe(0);
    expect(result.summary.firstInteractionIso).toBeNull();
    expect(result.summary.lastInteractionIso).toBeNull();
    expect(result.cadence.daysSinceLastInteraction).toBeNull();
    expect(result.cadence.averageIntervalDays).toBeNull();
    expect(result.cadence.longestGapDays).toBeNull();
  });

  it("carries every shared-record count through unchanged", () => {
    const result = evaluatePersonRelationship(
      fromDates(["2026-07-20"], {
        records: counts({
          meetings: 3,
          diaryEntries: 2,
          notes: 4,
          tasks: 6,
          openTasks: 2,
          projects: 3,
          activeProjects: 1,
          reviews: 1,
          otherRecords: 2,
          total: 21,
        }),
      }),
      ctx("2026-07-28"),
    );

    expect(result.summary).toMatchObject({
      meetings: 3,
      diaryEntries: 2,
      notes: 4,
      tasks: 6,
      openTasks: 2,
      projects: 3,
      activeProjects: 1,
      reviews: 1,
      otherRecords: 2,
      sharedRecords: 21,
    });
  });

  it("resolves the first and last interaction to owner-calendar dates", () => {
    const result = evaluatePersonRelationship(
      fromDates(["2025-03-04", "2026-07-20"]),
      ctx("2026-07-28"),
    );

    expect(result.summary.firstInteractionDate).toBe("2025-03-04");
    expect(result.summary.lastInteractionDate).toBe("2026-07-20");
    expect(result.summary.firstInteractionIso).toBe(
      at("2025-03-04").toISOString(),
    );
  });

  it("uses the OWNER's calendar day, not the runtime's, for days since", () => {
    // 2026-07-28T23:30Z is already 2026-07-29 in Sydney. An owner-calendar mapping
    // must therefore read zero days since, not one.
    const sydney = (instant: Date) =>
      instant.getTime() >= Date.parse("2026-07-28T14:00:00.000Z")
        ? "2026-07-29"
        : "2026-07-28";
    const result = evaluatePersonRelationship(
      facts({
        totalInteractions: 1,
        firstInteractionAt: new Date("2026-07-28T23:30:00.000Z"),
        lastInteractionAt: new Date("2026-07-28T23:30:00.000Z"),
        interactionSample: [new Date("2026-07-28T23:30:00.000Z")],
      }),
      ctx("2026-07-29", { calendarIsoOf: sydney }),
    );

    expect(result.cadence.daysSinceLastInteraction).toBe(0);
  });
});

describe("evaluatePersonRelationship — cadence arithmetic", () => {
  it("counts two events on one day as ONE day of contact", () => {
    const twice = facts({
      totalInteractions: 2,
      firstInteractionAt: new Date("2026-07-20T09:00:00.000Z"),
      lastInteractionAt: new Date("2026-07-20T17:00:00.000Z"),
      interactionSample: [
        new Date("2026-07-20T17:00:00.000Z"),
        new Date("2026-07-20T09:00:00.000Z"),
      ],
    });
    const result = evaluatePersonRelationship(twice, ctx("2026-07-28"));

    expect(result.summary.totalInteractions).toBe(2);
    expect(result.cadence.interactionDays).toBe(1);
    // One day of contact cannot imply a rhythm.
    expect(result.cadence.averageIntervalDays).toBeNull();
    expect(result.cadence.longestGapDays).toBeNull();
  });

  it("derives the average interval, the longest gap and the span", () => {
    // Gaps: 7, 21, 7 → average 11.7, longest 21, span 35.
    const result = evaluatePersonRelationship(
      fromDates(["2026-06-01", "2026-06-08", "2026-06-29", "2026-07-06"]),
      ctx("2026-07-10"),
    );

    expect(result.cadence.interactionDays).toBe(4);
    expect(result.cadence.averageIntervalDays).toBeCloseTo(11.7, 1);
    expect(result.cadence.longestGapDays).toBe(21);
    expect(result.cadence.observedSpanDays).toBe(35);
  });

  it("expresses the frequency as interactions per month", () => {
    const weekly = evaluatePersonRelationship(
      fromDates([
        "2026-06-01",
        "2026-06-08",
        "2026-06-15",
        "2026-06-22",
        "2026-06-29",
      ]),
      ctx("2026-07-01"),
    );
    // Roughly 30.44 / 7 ≈ 4.3 shared moments a month.
    expect(weekly.cadence.interactionsPerMonth).toBeCloseTo(4.3, 1);
  });

  it("reports the longest CLOSED gap, never an in-progress silence", () => {
    // Recorded gaps are 7 and 7; today is 200 days after the last one.
    const result = evaluatePersonRelationship(
      fromDates(["2026-01-01", "2026-01-08", "2026-01-15"]),
      ctx("2026-08-03"),
    );

    expect(result.cadence.longestGapDays).toBe(7);
    expect(result.cadence.daysSinceLastInteraction).toBe(200);
  });

  it("orders the sample itself — a caller cannot skew the maths by shuffling it", () => {
    const shuffled = facts({
      totalInteractions: 3,
      firstInteractionAt: at("2026-06-01"),
      lastInteractionAt: at("2026-06-15"),
      interactionSample: [at("2026-06-08"), at("2026-06-15"), at("2026-06-01")],
    });
    const result = evaluatePersonRelationship(shuffled, ctx("2026-06-16"));

    expect(result.cadence.averageIntervalDays).toBe(7);
    expect(result.cadence.longestGapDays).toBe(7);
  });

  it("discloses when the cadence was read from a bounded sample", () => {
    const result = evaluatePersonRelationship(
      fromDates(["2026-06-01", "2026-06-08"], {
        totalInteractions: 900,
        interactionSampleTruncated: true,
      }),
      ctx("2026-06-10"),
    );

    expect(result.cadence.sampleTruncated).toBe(true);
    // The exact totals stay exact even when the cadence sample is bounded.
    expect(result.summary.totalInteractions).toBe(900);
  });
});

describe("evaluatePersonRelationship — the stay-in-touch state", () => {
  it("reads as recently connected inside the recent window", () => {
    const result = evaluatePersonRelationship(
      fromDates(["2026-07-20"]),
      ctx("2026-07-28"),
    );

    expect(result.state).toBe("recently_connected");
    expect(result.tone).toBe("success");
    expect(result.reasons[0].code).toBe("recent_interaction");
    expect(result.reasons[0].days).toBe(8);
  });

  it("treats the recent-window boundary as inclusive", () => {
    const onBoundary = evaluatePersonRelationship(
      fromDates(["2026-07-14"]),
      ctx("2026-07-28"),
    );
    const pastBoundary = evaluatePersonRelationship(
      fromDates(["2026-07-13"]),
      ctx("2026-07-28"),
    );

    expect(relationshipDaysBetween("2026-07-14", "2026-07-28")).toBe(
      RECENTLY_CONNECTED_WITHIN_DAYS,
    );
    expect(onBoundary.state).toBe("recently_connected");
    expect(pastBoundary.state).toBe("in_touch");
  });

  it("reads as in touch beyond the recent window with no cadence to miss", () => {
    const result = evaluatePersonRelationship(
      fromDates(["2026-06-20"]),
      ctx("2026-07-28"),
    );

    expect(result.state).toBe("in_touch");
    expect(result.tone).toBe("neutral");
    expect(result.reasons[0].code).toBe("steady_rhythm");
  });

  it("is due for follow-up once the CHOSEN cadence has elapsed", () => {
    const result = evaluatePersonRelationship(
      fromDates(["2026-06-01"]),
      ctx("2026-07-10", { followUpFrequency: "monthly" }),
    );

    expect(result.cadence.expectedIntervalDays).toBe(
      FOLLOW_UP_CADENCE_DAYS.monthly,
    );
    expect(result.cadence.expectedIntervalSource).toBe("follow_up_frequency");
    expect(result.state).toBe("due_for_follow_up");
    expect(result.reasons.map((r) => r.code)).toContain("cadence_elapsed");
  });

  it("is NOT due while the chosen cadence still has room", () => {
    const result = evaluatePersonRelationship(
      fromDates(["2026-06-20"]),
      ctx("2026-07-10", { followUpFrequency: "quarterly" }),
    );

    expect(result.state).toBe("in_touch");
    expect(result.reasons.map((r) => r.code)).not.toContain("cadence_elapsed");
  });

  it("is due when the owner's own next-follow-up date has passed", () => {
    const result = evaluatePersonRelationship(
      fromDates(["2026-07-20"]),
      ctx("2026-07-28", { nextFollowUpIso: "2026-07-25" }),
    );

    // The date beats the recent window: the owner explicitly planned this.
    expect(result.state).toBe("due_for_follow_up");
    expect(result.reasons[0].code).toBe("follow_up_date_passed");
  });

  it("is not due on the follow-up date itself, only after it", () => {
    const result = evaluatePersonRelationship(
      fromDates(["2026-07-20"]),
      ctx("2026-07-25", { nextFollowUpIso: "2026-07-25" }),
    );

    expect(result.state).toBe("recently_connected");
  });

  it("infers a rhythm from the relationship itself when no cadence was chosen", () => {
    // A weekly rhythm (average 7 days) → expected interval max(2 × 7, 14) = 14.
    const weekly = fromDates([
      "2026-06-01",
      "2026-06-08",
      "2026-06-15",
      "2026-06-22",
    ]);

    const settled = evaluatePersonRelationship(weekly, ctx("2026-07-01"));
    expect(settled.cadence.expectedIntervalSource).toBe("observed_rhythm");
    expect(settled.cadence.expectedIntervalDays).toBe(14);
    // 9 days on, still inside its own rhythm.
    expect(settled.state).toBe("recently_connected");

    const lapsed = evaluatePersonRelationship(weekly, ctx("2026-07-10"));
    expect(lapsed.state).toBe("due_for_follow_up");
  });

  it("never invents a rhythm from too little history", () => {
    const twoDays = fromDates(["2026-01-01", "2026-01-08"]);
    const result = evaluatePersonRelationship(twoDays, ctx("2026-03-01"));

    expect(twoDays.interactionSample.length).toBeLessThan(
      MIN_DAYS_FOR_OBSERVED_RHYTHM,
    );
    expect(result.cadence.expectedIntervalDays).toBeNull();
    expect(result.cadence.expectedIntervalSource).toBeNull();
    expect(result.state).toBe("in_touch");
  });

  it("never lets a rapid rhythm produce a follow-up signal inside the recent window", () => {
    // Daily contact would imply a 2-day expectation; the floor keeps it at 14 so a
    // close relationship is never nagged after a quiet weekend.
    const daily = fromDates([
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
      "2026-07-04",
    ]);
    const result = evaluatePersonRelationship(daily, ctx("2026-07-10"));

    expect(result.cadence.expectedIntervalDays).toBe(
      RECENTLY_CONNECTED_WITHIN_DAYS,
    );
    expect(result.state).toBe("recently_connected");
  });

  it("reads as out of touch after an extended absence, whatever the cadence", () => {
    const result = evaluatePersonRelationship(
      fromDates(["2025-12-01"]),
      ctx("2026-07-28"),
    );

    expect(
      relationshipDaysBetween("2025-12-01", "2026-07-28"),
    ).toBeGreaterThanOrEqual(EXTENDED_ABSENCE_AFTER_DAYS);
    expect(result.state).toBe("out_of_touch");
    expect(result.reasons[0].code).toBe("extended_absence");
  });

  it("prefers the extended absence over an elapsed cadence, keeping both reasons", () => {
    const result = evaluatePersonRelationship(
      fromDates(["2025-12-01"]),
      ctx("2026-07-28", {
        followUpFrequency: "monthly",
        nextFollowUpIso: "2026-01-15",
      }),
    );

    expect(result.state).toBe("out_of_touch");
    const codes = result.reasons.map((r) => r.code);
    expect(codes[0]).toBe("extended_absence");
    expect(codes).toContain("follow_up_date_passed");
    expect(codes).toContain("cadence_elapsed");
  });
});

describe("evaluatePersonRelationship — tone and calmness", () => {
  it("never uses a warning or danger tone (care, not a CRM)", () => {
    const scenarios: PersonRelationshipFacts[] = [
      facts(),
      fromDates(["2026-07-27"]),
      fromDates(["2026-06-01"]),
      fromDates(["2024-01-01"]),
    ];
    for (const scenario of scenarios) {
      const result = evaluatePersonRelationship(
        scenario,
        ctx("2026-07-28", { followUpFrequency: "weekly" }),
      );
      expect(["neutral", "success", "info"]).toContain(result.tone);
      for (const reason of result.reasons) {
        expect(["neutral", "success", "info"]).toContain(reason.tone);
      }
    }
  });

  it("always produces at least one reason, and a label for every state", () => {
    const seen = new Set<string>();
    const scenarios: [
      PersonRelationshipFacts,
      RelationshipEvaluationContext,
    ][] = [
      [facts(), ctx("2026-07-28")],
      [fromDates(["2026-07-27"]), ctx("2026-07-28")],
      [fromDates(["2026-06-20"]), ctx("2026-07-28")],
      [
        fromDates(["2026-06-01"]),
        ctx("2026-07-28", { followUpFrequency: "monthly" }),
      ],
      [fromDates(["2025-01-01"]), ctx("2026-07-28")],
    ];
    for (const [scenarioFacts, scenarioCtx] of scenarios) {
      const result = evaluatePersonRelationship(scenarioFacts, scenarioCtx);
      seen.add(result.state);
      expect(result.reasons.length).toBeGreaterThan(0);
      expect(result.label).toBe(relationshipStateLabel(result.state));
      expect(result.tone).toBe(result.reasons[0].tone);
    }
    expect(seen).toEqual(
      new Set([
        "no_history",
        "recently_connected",
        "in_touch",
        "due_for_follow_up",
        "out_of_touch",
      ]),
    );
  });

  it("is deterministic and JSON-safe", () => {
    const input = fromDates(["2026-06-01", "2026-06-15", "2026-07-01"]);
    const first = evaluatePersonRelationship(input, ctx("2026-07-05"));
    const second = evaluatePersonRelationship(input, ctx("2026-07-05"));

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
  });

  it("stamps the evaluation instant from the injected clock", () => {
    const result = evaluatePersonRelationship(facts(), ctx("2026-07-28"));
    expect(result.evaluatedAtIso).toBe("2026-07-28T09:00:00.000Z");
  });
});
