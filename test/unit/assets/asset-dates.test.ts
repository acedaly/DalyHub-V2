/**
 * ASSET-01 — the canonical date-status evaluator unit tests. One source of due-date
 * truth for the collection and record; overdue / due-soon / today / future /
 * historical classification is compared as integers (never through `Date`), and the
 * "next meaningful date" always picks the soonest.
 */

import { describe, expect, it } from "vitest";

import {
  daysBetween,
  evaluateDueDate,
  evaluatePastDate,
  formatAssetDate,
  nextMeaningfulDate,
} from "~/modules/assets/asset-dates";

const TODAY = "2026-07-20";

describe("evaluateDueDate", () => {
  it("classifies due dates relative to today", () => {
    expect(evaluateDueDate("2026-07-10", TODAY)).toBe("overdue");
    expect(evaluateDueDate("2026-07-20", TODAY)).toBe("today");
    expect(evaluateDueDate("2026-08-01", TODAY)).toBe("due_soon");
    expect(evaluateDueDate("2027-01-01", TODAY)).toBe("future");
    expect(evaluateDueDate(null, TODAY)).toBe("none");
    expect(evaluateDueDate("nonsense", TODAY)).toBe("none");
  });
});

describe("evaluatePastDate", () => {
  it("classifies past-event dates", () => {
    expect(evaluatePastDate("2026-07-10", TODAY)).toBe("historical");
    expect(evaluatePastDate("2026-07-20", TODAY)).toBe("historical");
    expect(evaluatePastDate("2026-08-01", TODAY)).toBe("future");
  });
});

describe("daysBetween", () => {
  it("counts whole calendar days without timezone drift", () => {
    expect(daysBetween("2026-07-20", "2026-07-30")).toBe(10);
    expect(daysBetween("2026-07-30", "2026-07-20")).toBe(-10);
    // Across a DST boundary in the owner zone, still exactly N days.
    expect(daysBetween("2026-04-01", "2026-04-08")).toBe(7);
  });
});

describe("nextMeaningfulDate", () => {
  it("picks the soonest of warranty / renewal / service", () => {
    const asset = {
      warrantyExpiry: "2026-12-01",
      renewalDate: "2026-08-01",
      nextServiceDate: "2026-09-15",
    };
    const next = nextMeaningfulDate(asset, TODAY);
    expect(next?.kind).toBe("renewal");
    expect(next?.status).toBe("due_soon");
    expect(next?.text).toMatch(/Renewal due in \d+ days/);
  });

  it("phrases overdue and future explicitly (never colour alone)", () => {
    expect(
      nextMeaningfulDate(
        { warrantyExpiry: "2026-07-10", renewalDate: null, nextServiceDate: null },
        TODAY,
      )?.text,
    ).toBe("Warranty expired");
    expect(
      nextMeaningfulDate(
        { warrantyExpiry: null, renewalDate: null, nextServiceDate: "2026-07-01" },
        TODAY,
      )?.text,
    ).toBe("Service overdue");
    const future = nextMeaningfulDate(
      { warrantyExpiry: null, renewalDate: "2027-09-12", nextServiceDate: null },
      TODAY,
    );
    expect(future?.status).toBe("future");
    expect(future?.text).toMatch(/^Renewal due /);
  });

  it("returns null when there is no meaningful date", () => {
    expect(
      nextMeaningfulDate(
        { warrantyExpiry: null, renewalDate: null, nextServiceDate: null },
        TODAY,
      ),
    ).toBeNull();
  });
});

describe("formatAssetDate", () => {
  it("formats a calendar date, or null when unset/malformed", () => {
    expect(formatAssetDate("2026-09-12")).toBe("12 September 2026");
    expect(formatAssetDate(null)).toBeNull();
    expect(formatAssetDate("not-a-date")).toBeNull();
  });
});
