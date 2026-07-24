/**
 * AREA-02 — Goal-details validation: target-date parsing/serialisation and
 * definition-of-done normalisation. Pure, kernel-owned, dependency-free.
 */

import { describe, expect, it } from "vitest";

import {
  GOAL_DEFINITION_OF_DONE_MAX_LENGTH,
  GoalDetailsValidationError,
  isValidGoalTargetDate,
  normalizeGoalDefinitionOfDone,
  validateGoalTargetDate,
} from "~/kernel/goals";

describe("validateGoalTargetDate", () => {
  it("returns null for null, undefined and an empty/whitespace string", () => {
    expect(validateGoalTargetDate(null)).toBeNull();
    expect(validateGoalTargetDate(undefined)).toBeNull();
    expect(validateGoalTargetDate("")).toBeNull();
    expect(validateGoalTargetDate("   ")).toBeNull();
  });

  it("accepts and returns a real calendar date unchanged, stored as the literal string", () => {
    expect(validateGoalTargetDate("2026-08-15")).toBe("2026-08-15");
  });

  it("trims surrounding whitespace before validating", () => {
    expect(validateGoalTargetDate("  2026-08-15  ")).toBe("2026-08-15");
  });

  it("accepts a leap-year 29 February and rejects a non-leap-year 29 February", () => {
    expect(validateGoalTargetDate("2028-02-29")).toBe("2028-02-29");
    expect(() => validateGoalTargetDate("2026-02-29")).toThrow(
      GoalDetailsValidationError,
    );
  });

  it("rejects a malformed shape", () => {
    expect(() => validateGoalTargetDate("15-08-2026")).toThrow(
      GoalDetailsValidationError,
    );
    expect(() => validateGoalTargetDate("2026/08/15")).toThrow(
      GoalDetailsValidationError,
    );
  });

  it("rejects an out-of-range month or day", () => {
    expect(() => validateGoalTargetDate("2026-13-01")).toThrow(
      GoalDetailsValidationError,
    );
    expect(() => validateGoalTargetDate("2026-04-31")).toThrow(
      GoalDetailsValidationError,
    );
  });

  it("rejects a non-string value", () => {
    expect(() => validateGoalTargetDate(20260815)).toThrow(
      GoalDetailsValidationError,
    );
  });

  it("never routes the value through `Date` — no UTC conversion, no implicit midnight", () => {
    // A value that would be misinterpreted if ever passed through `new Date()`
    // in a non-UTC-safe way is returned as the EXACT literal string.
    expect(validateGoalTargetDate("2026-01-01")).toBe("2026-01-01");
    expect(validateGoalTargetDate("2026-12-31")).toBe("2026-12-31");
  });
});

describe("isValidGoalTargetDate", () => {
  it("is true for a real calendar date and false for a malformed/impossible one", () => {
    expect(isValidGoalTargetDate("2026-08-15")).toBe(true);
    expect(isValidGoalTargetDate("2026-02-30")).toBe(false);
    expect(isValidGoalTargetDate("not-a-date")).toBe(false);
  });
});

describe("normalizeGoalDefinitionOfDone", () => {
  it("returns null for null, undefined and a whitespace-only string", () => {
    expect(normalizeGoalDefinitionOfDone(null)).toBeNull();
    expect(normalizeGoalDefinitionOfDone(undefined)).toBeNull();
    expect(normalizeGoalDefinitionOfDone("   \n\t  ")).toBeNull();
  });

  it("trims surrounding whitespace and preserves internal line breaks", () => {
    expect(
      normalizeGoalDefinitionOfDone("  Ship it.\nThen tell the team.  "),
    ).toBe("Ship it.\nThen tell the team.");
  });

  it("accepts content up to the maximum length", () => {
    const atMax = "a".repeat(GOAL_DEFINITION_OF_DONE_MAX_LENGTH);
    expect(normalizeGoalDefinitionOfDone(atMax)).toBe(atMax);
  });

  it("rejects content over the maximum length", () => {
    const tooLong = "a".repeat(GOAL_DEFINITION_OF_DONE_MAX_LENGTH + 1);
    expect(() => normalizeGoalDefinitionOfDone(tooLong)).toThrow(
      GoalDetailsValidationError,
    );
  });

  it("rejects a non-string value", () => {
    expect(() => normalizeGoalDefinitionOfDone(42)).toThrow(
      GoalDetailsValidationError,
    );
  });
});
