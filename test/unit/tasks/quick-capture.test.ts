import { describe, expect, it } from "vitest";

import {
  interpretationIsMeaningful,
  parseQuickCapture,
} from "~/shared/task-record/quick-capture";

describe("parseQuickCapture", () => {
  it("returns the plain title when there are no tokens", () => {
    const r = parseQuickCapture("Finish the OpO slides");
    expect(r.title).toBe("Finish the OpO slides");
    expect(r.priority).toBeNull();
    expect(r.timeSector).toBeNull();
    expect(r.commitmentState).toBe("active");
    expect(r.waiting).toBe(false);
    expect(r.delegate).toBe(false);
    expect(r.tokens).toHaveLength(0);
    expect(interpretationIsMeaningful(r)).toBe(false);
  });

  it("extracts a priority token as a whole word", () => {
    const r = parseQuickCapture("Ship release p1");
    expect(r.title).toBe("Ship release");
    expect(r.priority).toBe("p1");
    expect(interpretationIsMeaningful(r)).toBe(true);
  });

  it("does not treat p1 inside a word or mid-sentence text as a token", () => {
    const r = parseQuickCapture("Plan the p1launch");
    expect(r.priority).toBeNull();
    expect(r.title).toBe("Plan the p1launch");
  });

  it("prefers the two-word sector phrase over a single word", () => {
    const r = parseQuickCapture("Draft budget next week");
    expect(r.timeSector).toBe("next_week");
    expect(r.title).toBe("Draft budget");
  });

  it("maps this week / this month / long term / routine", () => {
    expect(parseQuickCapture("a this week").timeSector).toBe("this_week");
    expect(parseQuickCapture("a this month").timeSector).toBe("this_month");
    expect(parseQuickCapture("a long term").timeSector).toBe("long_term");
    expect(parseQuickCapture("water plants routine").timeSector).toBe(
      "routines",
    );
  });

  it("recognises someday, waiting and delegate", () => {
    const r = parseQuickCapture("Learn cello someday");
    expect(r.commitmentState).toBe("someday");
    const w = parseQuickCapture("Sign-off waiting");
    expect(w.waiting).toBe(true);
    const d = parseQuickCapture("Redesign logo delegate");
    expect(d.delegate).toBe(true);
  });

  it("combines several tokens and strips them all from the title", () => {
    const r = parseQuickCapture("Prepare deck p1 this week");
    expect(r.title).toBe("Prepare deck");
    expect(r.priority).toBe("p1");
    expect(r.timeSector).toBe("this_week");
    expect(r.tokens.map((t) => t.kind).sort()).toEqual(["priority", "sector"]);
  });

  it("keeps the original text when tokens would empty the title", () => {
    const r = parseQuickCapture("p1 this week");
    // Removing tokens would leave nothing → keep original text, drop interpretation.
    expect(r.title).toBe("p1 this week");
    expect(r.priority).toBeNull();
    expect(r.timeSector).toBeNull();
    expect(r.tokens).toHaveLength(0);
  });

  it("is case-insensitive for tokens", () => {
    const r = parseQuickCapture("Review PR P2 Next Week");
    expect(r.priority).toBe("p2");
    expect(r.timeSector).toBe("next_week");
  });

  it("keeps an ignored chip as literal title text", () => {
    const parsed = parseQuickCapture("Write p1 launch brief next week");
    const priorityChip = parsed.tokens.find(
      (token) => token.kind === "priority",
    );
    expect(priorityChip?.id).toBe("priority:p1");

    const ignored = parseQuickCapture("Write p1 launch brief next week", {
      ignoredTokenIds: new Set(["priority:p1"]),
    });
    expect(ignored.title).toBe("Write p1 launch brief");
    expect(ignored.priority).toBeNull();
    expect(ignored.timeSector).toBe("next_week");
  });

  it("parses today, tomorrow and tonight as scheduled dates from the owner day", () => {
    const today = parseQuickCapture("Prepare slides today", {
      todayIso: "2026-07-30",
    });
    expect(today.title).toBe("Prepare slides");
    expect(today.scheduledDate).toBe("2026-07-30");

    const tomorrow = parseQuickCapture("Prepare slides tomorrow", {
      todayIso: "2026-07-30",
    });
    expect(tomorrow.scheduledDate).toBe("2026-07-31");

    const tonight = parseQuickCapture("Prepare slides tonight", {
      todayIso: "2026-07-30",
    });
    expect(tonight.scheduledDate).toBe("2026-07-30");
  });

  it("parses due date phrases separately from scheduled date phrases", () => {
    const r = parseQuickCapture("Renew registration due 15/11 p2", {
      todayIso: "2026-07-30",
    });
    expect(r.title).toBe("Renew registration");
    expect(r.dueDate).toBe("2026-11-15");
    expect(r.scheduledDate).toBeNull();
    expect(r.priority).toBe("p2");
  });

  it("parses Australian dates and rolls day-first dates into next year when needed", () => {
    expect(
      parseQuickCapture("Pay rego due 14/8", {
        todayIso: "2026-07-30",
      }).dueDate,
    ).toBe("2026-08-14");
    expect(
      parseQuickCapture("Pay rego due 14/8", {
        todayIso: "2026-09-01",
      }).dueDate,
    ).toBe("2027-08-14");
    expect(
      parseQuickCapture("Pay rego due 14/08/2026", {
        todayIso: "2026-07-30",
      }).dueDate,
    ).toBe("2026-08-14");
  });

  it("keeps next week as a Time Sector while next Friday is a calendar date", () => {
    const sector = parseQuickCapture("Draft brief next week", {
      todayIso: "2026-07-30",
    });
    expect(sector.timeSector).toBe("next_week");
    expect(sector.scheduledDate).toBeNull();

    const date = parseQuickCapture("Draft brief next Friday", {
      todayIso: "2026-07-30",
    });
    expect(date.timeSector).toBeNull();
    expect(date.scheduledDate).toBe("2026-08-07");
  });

  it("does not parse date words without an owner calendar day", () => {
    const r = parseQuickCapture("Prepare slides tomorrow");
    expect(r.title).toBe("Prepare slides tomorrow");
    expect(r.scheduledDate).toBeNull();
  });

  it("parses every Friday as weekly recurrence with the next weekday anchor", () => {
    const r = parseQuickCapture("Submit timesheet every Friday", {
      todayIso: "2026-07-30",
    });
    expect(r.title).toBe("Submit timesheet");
    expect(r.scheduledDate).toBe("2026-07-31");
    expect(r.recurrence).toMatchObject({
      frequency: "week",
      interval: 1,
      weekdays: [5],
      dateKind: "scheduled",
      needsDate: false,
    });
    expect(r.tokens.map((token) => token.kind)).toContain("recurrence");
  });

  it("keeps due-date recurrence anchored to the due date", () => {
    const r = parseQuickCapture("Pay registration due 15/11 every year", {
      todayIso: "2026-07-30",
    });
    expect(r.title).toBe("Pay registration");
    expect(r.dueDate).toBe("2026-11-15");
    expect(r.recurrence).toMatchObject({
      frequency: "year",
      interval: 1,
      dateKind: "due",
      needsDate: false,
    });
  });

  it("surfaces interval recurrence without guessing an anchor date", () => {
    const r = parseQuickCapture("Review plan every 2 weeks", {
      todayIso: "2026-07-30",
    });
    expect(r.title).toBe("Review plan");
    expect(r.scheduledDate).toBeNull();
    expect(r.recurrence).toMatchObject({
      frequency: "week",
      interval: 2,
      dateKind: null,
      needsDate: true,
    });
  });

  it("does not strip every word for a recurrence-only capture", () => {
    const r = parseQuickCapture("every Friday", {
      todayIso: "2026-07-30",
    });
    expect(r.title).toBe("every Friday");
    expect(r.recurrence).toBeNull();
    expect(r.scheduledDate).toBeNull();
  });
});
