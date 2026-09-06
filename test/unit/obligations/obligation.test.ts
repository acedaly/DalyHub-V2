/**
 * V2.10 LIFE-00 — the pure obligation domain, with no Asset anywhere.
 *
 * This file imports `~/kernel/obligations` and NOTHING ELSE from the product.
 * That is the item's whole claim: the arithmetic that decides what "overdue"
 * means, how a recurrence advances, and what an obligation's urgency is carries
 * no Asset assumption, so a tax return with no subject at all is evaluated by
 * exactly the code a registration renewal is.
 *
 * The meter — an odometer is a property of a vehicle — stays with Assets, and
 * its interaction with this evaluator is proven in
 * `test/unit/assets/asset-obligation.test.ts`. If an import of `~/kernel/assets`
 * ever appears here, the domain has stopped being general.
 */

import { describe, expect, it } from "vitest";

import {
  addObligationDays as addDays,
  addObligationMonths as addMonths,
  describeObligationRecurrence,
  evaluateObligation,
  isIsoDate,
  nextObligationDate,
  obligationCategoryLabel,
  obligationDaysBetween as daysBetween,
  isObligationCategory,
  isObligationRecurrenceKind,
  isObligationStatus,
  nextObligationDate as advance,
  ObligationValidationError,
  OBLIGATION_CATEGORIES,
  OBLIGATION_RECURRENCE_KINDS,
  OBLIGATION_STATUSES,
  type Obligation,
} from "~/kernel/obligations";

const TODAY = "2026-07-01";

/** A minimal open obligation for the evaluator. No subject, no meter. */
function obligation(
  overrides: Partial<Pick<Obligation, "status" | "dueDate" | "leadDays">> = {},
) {
  return {
    status: "open" as const,
    dueDate: null,
    leadDays: 14,
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/* Calendar arithmetic                                                        */
/* -------------------------------------------------------------------------- */

describe("calendar arithmetic", () => {
  it("validates real calendar dates and rejects impossible ones", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2024-02-29")).toBe(true);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("not-a-date")).toBe(false);
  });

  it("adds days and months, clamping into short months", () => {
    expect(addDays("2026-07-01", 30)).toBe("2026-07-31");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    // 31 January + 1 month is 28 February, not 3 March.
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-07-15", 6)).toBe("2027-01-15");
    expect(addMonths("2026-07-15", 12)).toBe("2027-07-15");
  });

  it("counts whole days between calendar dates, signed", () => {
    expect(daysBetween("2026-07-01", "2026-07-15")).toBe(14);
    expect(daysBetween("2026-07-15", "2026-07-01")).toBe(-14);
    expect(daysBetween("2026-07-01", "2026-07-01")).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Recurrence                                                                 */
/* -------------------------------------------------------------------------- */

describe("nextObligationDate", () => {
  it("advances by days, weeks, months and years", () => {
    expect(nextObligationDate("2026-07-01", "days", 10)).toBe("2026-07-11");
    expect(nextObligationDate("2026-07-01", "weeks", 2)).toBe("2026-07-15");
    expect(nextObligationDate("2026-07-01", "months", 6)).toBe("2027-01-01");
    expect(nextObligationDate("2026-07-01", "years", 1)).toBe("2027-07-01");
  });

  it("returns null for a one-off or a meter-only rule", () => {
    expect(nextObligationDate("2026-07-01", "none", null)).toBeNull();
    expect(nextObligationDate("2026-07-01", "meter", null)).toBeNull();
  });

  it("rejects an interval that could never advance, or is absurd", () => {
    expect(() => nextObligationDate("2026-07-01", "months", 0)).toThrow(
      ObligationValidationError,
    );
    expect(() => nextObligationDate("2026-07-01", "months", 1000)).toThrow(
      ObligationValidationError,
    );
    expect(() => nextObligationDate("2026-07-01", "days", -1)).toThrow(
      ObligationValidationError,
    );
  });

  it("rejects an anchor that is not a real date", () => {
    expect(() => nextObligationDate("2026-02-30", "months", 1)).toThrow(
      ObligationValidationError,
    );
  });

  it("describes a rule in plain words", () => {
    expect(describeObligationRecurrence("none", null)).toBe("Does not repeat");
    expect(describeObligationRecurrence("months", 6)).toBe("Every 6 months");
    expect(describeObligationRecurrence("years", 1)).toBe("Every year");
    expect(describeObligationRecurrence("meter", null, "10,000 km")).toBe(
      "Every 10,000 km",
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Meters                                                                     */
/* -------------------------------------------------------------------------- */

describe("evaluateObligation — date-based", () => {
  it("is upcoming outside the lead window", () => {
    const result = evaluateObligation(
      obligation({ dueDate: "2026-09-30", leadDays: 14 }),
      TODAY,
      null,
    );
    expect(result.state).toBe("upcoming");
    expect(result.needsAttention).toBe(false);
    expect(result.text).toBe("Due 30 September");
  });

  it("becomes due inside the lead window", () => {
    const result = evaluateObligation(
      obligation({ dueDate: "2026-07-10", leadDays: 14 }),
      TODAY,
      null,
    );
    expect(result.state).toBe("due");
    expect(result.needsAttention).toBe(true);
    expect(result.text).toBe("Due in 9 days");
  });

  it("honours a custom lead time in both directions", () => {
    const short = evaluateObligation(
      obligation({ dueDate: "2026-07-20", leadDays: 3 }),
      TODAY,
      null,
    );
    expect(short.state).toBe("upcoming");
    const long = evaluateObligation(
      obligation({ dueDate: "2026-07-20", leadDays: 60 }),
      TODAY,
      null,
    );
    expect(long.state).toBe("due");
  });

  it("reads today and tomorrow in words, not as day counts", () => {
    expect(
      evaluateObligation(obligation({ dueDate: TODAY }), TODAY, null).text,
    ).toBe("Due today");
    expect(
      evaluateObligation(obligation({ dueDate: "2026-07-02" }), TODAY, null)
        .text,
    ).toBe("Due tomorrow");
  });

  it("is overdue in the past, and says by how much", () => {
    const oneDay = evaluateObligation(
      obligation({ dueDate: "2026-06-30" }),
      TODAY,
      null,
    );
    expect(oneDay.state).toBe("overdue");
    expect(oneDay.text).toBe("Overdue by 1 day");

    const longer = evaluateObligation(
      obligation({ dueDate: "2026-06-01" }),
      TODAY,
      null,
    );
    expect(longer.text).toBe("Overdue by 30 days");
  });
});

describe("evaluateObligation — the stored lifecycle showing through", () => {
  it("reports completed, dismissed and on hold, and never needs attention", () => {
    for (const [status, label] of [
      ["completed", "Completed"],
      ["dismissed", "Dismissed"],
      ["on_hold", "On hold"],
    ] as const) {
      const result = evaluateObligation(
        obligation({ status, dueDate: "2026-01-01" }),
        TODAY,
        null,
      );
      expect(result.text).toBe(label);
      expect(result.needsAttention).toBe(false);
    }
  });

  it("never reports a completed obligation as overdue, however old", () => {
    const result = evaluateObligation(
      obligation({ status: "completed", dueDate: "2020-01-01" }),
      TODAY,
      null,
    );
    expect(result.state).toBe("completed");
  });
});

/* -------------------------------------------------------------------------- */
/* Category mappings                                                          */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* The rules V2.10 must not lose                                              */
/* -------------------------------------------------------------------------- */

describe("the completion anchor", () => {
  /*
   * The successor is due a full interval after THE DAY THE WORK WAS DONE, not
   * after the day it was originally due. A service done two months late
   * schedules the next one six months after the work; anchoring on the due date
   * would compound the lateness forever, and the owner would find their car
   * service permanently drifting earlier in the year.
   */
  it("advances from the completion day, so lateness never compounds", () => {
    const originallyDue = "2026-01-15";
    const actuallyDone = "2026-03-15";

    expect(advance(actuallyDone, "months", 6)).toBe("2026-09-15");
    expect(advance(originallyDue, "months", 6)).toBe("2026-07-15");
    expect(advance(actuallyDone, "months", 6)).not.toBe(
      advance(originallyDue, "months", 6),
    );
  });

  it("clamps into a short month rather than rolling into the next one", () => {
    expect(advance("2026-01-31", "months", 1)).toBe("2026-02-28");
    expect(advance("2026-08-31", "months", 1)).toBe("2026-09-30");
  });

  it("lands on 28 February in a common year and 29 in a leap year", () => {
    expect(advance("2024-02-29", "years", 1)).toBe("2025-02-28");
    expect(advance("2024-02-29", "years", 4)).toBe("2028-02-29");
    expect(advance("2027-02-28", "years", 1)).toBe("2028-02-28");
  });

  it("crosses a leap day when counting whole days", () => {
    expect(daysBetween("2024-02-28", "2024-03-01")).toBe(2);
    expect(daysBetween("2026-02-28", "2026-03-01")).toBe(1);
  });
});

describe("the vocabularies are closed", () => {
  it("accepts only its own categories, statuses and recurrence kinds", () => {
    for (const category of OBLIGATION_CATEGORIES) {
      expect(isObligationCategory(category)).toBe(true);
      expect(obligationCategoryLabel(category)).toBeTruthy();
    }
    for (const status of OBLIGATION_STATUSES) {
      expect(isObligationStatus(status)).toBe(true);
    }
    for (const kind of OBLIGATION_RECURRENCE_KINDS) {
      expect(isObligationRecurrenceKind(kind)).toBe(true);
    }

    expect(isObligationCategory("bill")).toBe(false);
    expect(isObligationCategory("")).toBe(false);
    expect(isObligationStatus("done")).toBe(false);
    expect(isObligationRecurrenceKind("cron")).toBe(false);
    expect(obligationCategoryLabel("not-a-category")).toBeNull();
    expect(obligationCategoryLabel(null)).toBeNull();
  });
});

describe("an obligation about nothing at all", () => {
  /*
   * The whole point of LIFE-00. Nothing in this file names an Asset, and the
   * evaluator never asks for one: a tax return with a date and no subject is
   * overdue, due or upcoming by exactly the rule a rego renewal is.
   */
  it("is evaluated by the same rule as one about a thing", () => {
    const taxReturn = evaluateObligation(
      obligation({ dueDate: "2026-06-20", leadDays: 14 }),
      TODAY,
      null,
    );

    expect(taxReturn.state).toBe("overdue");
    expect(taxReturn.text).toBe("Overdue by 11 days");
    expect(taxReturn.needsAttention).toBe(true);
    expect(taxReturn.meterState).toBeNull();
  });

  it("never claims a meter state it was not given", () => {
    const result = evaluateObligation(
      obligation({ dueDate: "2026-07-10" }),
      TODAY,
      null,
    );
    expect(result.meterState).toBeNull();
    expect(result.meterRemaining).toBeNull();
  });
});

describe("a refusal names its field", () => {
  it("refuses an impossible anchor and an absurd interval", () => {
    expect(() => nextObligationDate("2026-02-30", "months", 1)).toThrow(
      ObligationValidationError,
    );
    expect(() => nextObligationDate(TODAY, "months", 0)).toThrow(
      ObligationValidationError,
    );
    expect(() => nextObligationDate(TODAY, "months", 1000)).toThrow(
      ObligationValidationError,
    );

    try {
      nextObligationDate(TODAY, "days", -1);
      expect.unreachable("expected a refusal");
    } catch (cause) {
      expect(cause).toBeInstanceOf(ObligationValidationError);
      expect((cause as ObligationValidationError).field).toBe(
        "recurrenceInterval",
      );
    }
  });
});
