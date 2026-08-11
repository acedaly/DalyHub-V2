/**
 * TASKS-11 — the deterministic after-completion capture grammar.
 *
 * The risk this file exists to hold down is SILENT MISINTERPRETATION, so it is
 * weighted deliberately: for every positive case there are negative cases proving the
 * same words do nothing when they are not part of a complete recognised phrase, and a
 * fixed-schedule regression block proving that the mode is never crossed by accident.
 *
 * Everything here is pure. No database, no clock, no network — the owner's calendar day
 * is passed in, exactly as every capture surface passes it (ADR-022).
 */

import { describe, expect, it } from "vitest";

import { parseQuickCapture } from "~/shared/task-record/quick-capture";

/** The owner's calendar day every case in this file is read against. A Thursday. */
const TODAY = "2026-08-13";

function parse(text: string) {
  return parseQuickCapture(text, { todayIso: TODAY });
}

describe("TASKS-11 — after-completion recurrence", () => {
  it("reads the canonical phrase into the TASKS-07 after-completion rule", () => {
    const r = parse("Service Hilux every 6 months after completion");
    expect(r.title).toBe("Service Hilux");
    expect(r.recurrence).toMatchObject({
      frequency: "month",
      interval: 6,
      mode: "after_completion",
      weekdays: [],
      dateKind: "scheduled",
      needsDate: false,
    });
    // The first occurrence starts on the owner's day — the only non-arbitrary anchor
    // for an interval measured from completion, and never a guessed future date.
    expect(r.scheduledDate).toBe(TODAY);
    expect(r.dueDate).toBeNull();
  });

  it("covers the whole positive family, with the title intact in every case", () => {
    const cases: ReadonlyArray<
      readonly [
        string,
        {
          readonly title: string;
          readonly frequency: string;
          readonly interval: number;
        },
      ]
    > = [
      [
        "Service Hilux every 6 months after completion",
        { title: "Service Hilux", frequency: "month", interval: 6 },
      ],
      [
        "Replace filter every 3 months after completion",
        { title: "Replace filter", frequency: "month", interval: 3 },
      ],
      [
        "Water plants every 7 days after completion",
        { title: "Water plants", frequency: "day", interval: 7 },
      ],
      [
        "Review plan every 2 weeks after completion",
        { title: "Review plan", frequency: "week", interval: 2 },
      ],
      [
        "Annual equipment check every year after completion",
        { title: "Annual equipment check", frequency: "year", interval: 1 },
      ],
      [
        "Change the oil every 14 days after completion",
        { title: "Change the oil", frequency: "day", interval: 14 },
      ],
      [
        "Rinse the kettle every day after completion",
        { title: "Rinse the kettle", frequency: "day", interval: 1 },
      ],
      [
        "Back up the laptop every week after completion",
        { title: "Back up the laptop", frequency: "week", interval: 1 },
      ],
      [
        "Deep clean the oven repeat every 3 months after completion",
        { title: "Deep clean the oven", frequency: "month", interval: 3 },
      ],
      [
        "Descale the coffee machine repeats every 2 months after completion",
        {
          title: "Descale the coffee machine",
          frequency: "month",
          interval: 2,
        },
      ],
    ];
    for (const [input, expected] of cases) {
      const r = parse(input);
      expect(r.title, input).toBe(expected.title);
      expect(r.recurrence, input).toMatchObject({
        frequency: expected.frequency,
        interval: expected.interval,
        mode: "after_completion",
      });
    }
  });

  it("accepts the six recognised after-completion suffixes and nothing else", () => {
    const recognised = [
      "Service Hilux every 6 months after completion",
      "Service Hilux every 6 months after completed",
      "Service Hilux every 6 months after completing",
      "Service Hilux every 6 months after finishing",
      "Service Hilux every 6 months after I complete it",
      "Service Hilux every 6 months after I finish it",
    ];
    for (const input of recognised) {
      const r = parse(input);
      expect(r.title, input).toBe("Service Hilux");
      expect(r.recurrence?.mode, input).toBe("after_completion");
      expect(r.recurrence?.interval, input).toBe(6);
    }

    // Near-misses are NOT the grammar. The fixed schedule that genuinely IS there is
    // still read, and every word the suffix did not claim stays in the title.
    const nearMisses: ReadonlyArray<readonly [string, string]> = [
      [
        "Service Hilux every 6 months after the service",
        "Service Hilux after the service",
      ],
      [
        "Service Hilux every 6 months after completions",
        "Service Hilux after completions",
      ],
      [
        "Service Hilux every 6 months once complete",
        "Service Hilux once complete",
      ],
      [
        "Service Hilux every 6 months after we complete it",
        "Service Hilux after we complete it",
      ],
    ];
    for (const [input, title] of nearMisses) {
      const r = parse(input);
      expect(r.recurrence?.mode, input).toBe("fixed");
      expect(r.title, input).toBe(title);
    }
  });

  it("is case-insensitive, like the rest of the vocabulary", () => {
    const r = parse("Service Hilux EVERY 6 MONTHS AFTER COMPLETION");
    expect(r.title).toBe("Service Hilux");
    expect(r.recurrence).toMatchObject({
      frequency: "month",
      interval: 6,
      mode: "after_completion",
    });
  });

  it("labels the chip through the ONE shared recurrence formatter", () => {
    const r = parse("Service Hilux every 6 months after completion");
    const chip = r.tokens.find((token) => token.kind === "recurrence");
    expect(chip?.label).toBe("Repeat: 6 months after completion");
    expect(chip?.raw).toBe("every 6 months after completion");

    const fixed = parse("Deep clean every 2 weeks");
    expect(
      fixed.tokens.find((token) => token.kind === "recurrence")?.label,
    ).toBe("Repeat: Every 2 weeks");
  });

  it("restores the words when the recurrence chip is removed before saving", () => {
    const r = parse("Service Hilux every 6 months after completion");
    const chip = r.tokens.find((token) => token.kind === "recurrence")!;
    const ignored = parseQuickCapture(
      "Service Hilux every 6 months after completion",
      { todayIso: TODAY, ignoredTokenIds: new Set([chip.id]) },
    );
    expect(ignored.title).toBe("Service Hilux every 6 months after completion");
    expect(ignored.recurrence).toBeNull();
    // The anchor the rule would have used is not left behind either.
    expect(ignored.scheduledDate).toBeNull();
  });
});

describe("TASKS-11 — the fixed schedule is never crossed by accident", () => {
  it("keeps every pre-TASKS-11 recurrence phrase on a FIXED schedule", () => {
    const cases = [
      "Pay rent every month",
      "Stretch every day",
      "Stand-up every weekday",
      "Groceries every week",
      "Deep clean every 2 weeks",
      "Renew domain every year",
      "Submit timesheet every Friday",
      "Service water filter every 3 months",
    ];
    for (const input of cases) {
      const r = parse(input);
      expect(r.recurrence, input).not.toBeNull();
      expect(r.recurrence?.mode, input).toBe("fixed");
    }
  });

  it("distinguishes the two readings of the same routine", () => {
    const fixed = parse("Pay rent every month");
    expect(fixed.title).toBe("Pay rent");
    expect(fixed.recurrence).toMatchObject({
      frequency: "month",
      interval: 1,
      mode: "fixed",
      // No date in the capture, so a FIXED monthly rule is surfaced WITHOUT an
      // invented anchor and is dropped at submission rather than pinned to a day.
      dateKind: null,
      needsDate: true,
    });
    expect(fixed.scheduledDate).toBeNull();

    const afterCompletion = parse(
      "Service water filter every 3 months after completion",
    );
    expect(afterCompletion.title).toBe("Service water filter");
    expect(afterCompletion.recurrence).toMatchObject({
      frequency: "month",
      interval: 3,
      mode: "after_completion",
      dateKind: "scheduled",
      needsDate: false,
    });
  });

  it("refuses an after-completion suffix on the shapes the kernel refuses", () => {
    // `every weekday` and a weekday-pinned weekly rule are SCHEDULE concepts. Rather
    // than store a schedule the owner did not ask for — or, worse, keep the schedule
    // and leave "after completion" stranded in the title — the WHOLE phrase is left
    // as ordinary words.
    const weekday = parse("Stand-up every weekday after completion");
    expect(weekday.title).toBe("Stand-up every weekday after completion");
    expect(weekday.recurrence).toBeNull();

    const pinned = parse("Check the oil every Monday after completion");
    expect(pinned.title).toBe("Check the oil every Monday after completion");
    expect(pinned.recurrence).toBeNull();
    expect(pinned.scheduledDate).toBeNull();
  });
});

describe("TASKS-11 — composition with the other signals", () => {
  it("reads a date AND an after-completion repeat from one capture", () => {
    const r = parse("Service Hilux tomorrow every 6 months after completion");
    expect(r.title).toBe("Service Hilux");
    expect(r.scheduledDate).toBe("2026-08-14");
    expect(r.recurrence).toMatchObject({
      frequency: "month",
      interval: 6,
      mode: "after_completion",
      dateKind: "scheduled",
      needsDate: false,
    });
  });

  it("reads a priority AND an after-completion repeat from one capture", () => {
    const r = parse("Change water filter P2 every 3 months after completion");
    expect(r.title).toBe("Change water filter");
    expect(r.priority).toBe("p2");
    expect(r.recurrence).toMatchObject({
      frequency: "month",
      interval: 3,
      mode: "after_completion",
    });
  });

  it("reads a priority, a date AND an after-completion repeat together", () => {
    const r = parse(
      "Service the generator p1 tomorrow every 2 weeks after completion",
    );
    expect(r.title).toBe("Service the generator");
    expect(r.priority).toBe("p1");
    expect(r.scheduledDate).toBe("2026-08-14");
    expect(r.recurrence).toMatchObject({
      frequency: "week",
      interval: 2,
      mode: "after_completion",
    });
  });

  it("keeps an explicit due date as the date the rule advances", () => {
    const r = parse(
      "Renew the certificate due 15/11 every 12 months after completion",
    );
    expect(r.title).toBe("Renew the certificate");
    expect(r.dueDate).toBe("2026-11-15");
    expect(r.scheduledDate).toBeNull();
    expect(r.recurrence).toMatchObject({
      frequency: "month",
      interval: 12,
      mode: "after_completion",
      dateKind: "due",
      needsDate: false,
    });
  });

  it("reads a date and a priority with no recurrence at all", () => {
    const r = parse("Submit report Friday P1");
    expect(r.title).toBe("Submit report");
    expect(r.priority).toBe("p1");
    expect(r.scheduledDate).toBe("2026-08-14");
    expect(r.recurrence).toBeNull();
  });
});

describe("TASKS-11 — the canonical interval bounds", () => {
  it("accepts the whole canonical 1–99 range and nothing outside it", () => {
    expect(
      parse("Flush the tank every 1 month after completion").recurrence,
    ).toMatchObject({ interval: 1, frequency: "month" });
    expect(
      parse("Flush the tank every 99 months after completion").recurrence,
    ).toMatchObject({ interval: 99, frequency: "month" });

    // Out of range is NOT a rule — and, critically, not a clamped one either.
    for (const input of [
      "Flush the tank every 0 months after completion",
      "Flush the tank every 100 months after completion",
      "Flush the tank every 999999 months after completion",
    ]) {
      const r = parse(input);
      expect(r.recurrence, input).toBeNull();
      expect(r.title, input).toBe(input);
      expect(r.scheduledDate, input).toBeNull();
    }
  });

  it("refuses a number that is not a plain whole number", () => {
    for (const input of [
      "Flush the tank every 6.5 months after completion",
      "Flush the tank every -6 months after completion",
      "Flush the tank every six months after completion",
    ]) {
      const r = parse(input);
      expect(r.recurrence, input).toBeNull();
      expect(r.title, input).toBe(input);
    }
  });

  it("refuses a count against a unit the recurrence model does not count", () => {
    const r = parse("Stand up every 3 weekdays after completion");
    expect(r.recurrence).toBeNull();
    expect(r.title).toBe("Stand up every 3 weekdays after completion");
  });
});

describe("TASKS-11 — false positives are the expensive failure", () => {
  it("leaves ordinary sentences that merely resemble the vocabulary alone", () => {
    const cases = [
      "Discuss monthly report format",
      "Research six month service intervals",
      "Write notes about recurring tasks",
      "Review tomorrow's agenda",
      "Send the invoice after completion",
      "Ask Sam what happens after completion",
      "Read the every-day carry review",
      "Plan the year after completion of the build",
    ];
    for (const input of cases) {
      const r = parse(input);
      expect(r.title, input).toBe(input);
      expect(r.recurrence, input).toBeNull();
      expect(r.scheduledDate, input).toBeNull();
      expect(r.dueDate, input).toBeNull();
    }
  });

  it("invents no recurrence for vague repetition language", () => {
    const cases = [
      "Regularly check the camper",
      "Service Hilux when needed",
      "Do this every so often",
      "Service the mower occasionally",
      "Check the smoke alarms from time to time",
    ];
    for (const input of cases) {
      const r = parse(input);
      expect(r.recurrence, input).toBeNull();
      expect(r.title, input).toBe(input);
    }
  });

  it("invents no date, Project, Area or Goal for an ambiguous capture", () => {
    const r = parse("Do this sometime next month");
    // `next month` is the EXISTING Time Sector token and stays one — TASKS-11 does not
    // reinterpret it. What matters here is that nothing structured was fabricated.
    expect(r.recurrence).toBeNull();
    expect(r.scheduledDate).toBeNull();
    expect(r.dueDate).toBeNull();
    expect(r.title).toBe("Do this sometime");
  });

  it("keeps a capture that is ONLY a recurrence phrase as plain text", () => {
    const r = parse("every 6 months after completion");
    expect(r.title).toBe("every 6 months after completion");
    expect(r.recurrence).toBeNull();
    expect(r.scheduledDate).toBeNull();
  });

  it("recognises no recurrence at all without the owner's calendar day", () => {
    // The parser refuses to read calendar or recurrence grammar it cannot anchor.
    const r = parseQuickCapture(
      "Service Hilux every 6 months after completion",
    );
    expect(r.title).toBe("Service Hilux every 6 months after completion");
    expect(r.recurrence).toBeNull();
  });
});

describe("TASKS-11 — the counted-unit grammar", () => {
  it("counts days, weeks, months and years in both modes", () => {
    const units: ReadonlyArray<readonly [string, string]> = [
      ["3 days", "day"],
      ["3 day", "day"],
      ["3 weeks", "week"],
      ["3 week", "week"],
      ["3 months", "month"],
      ["3 month", "month"],
      ["3 years", "year"],
      ["3 year", "year"],
    ];
    for (const [phrase, frequency] of units) {
      const fixed = parse(`Rotate the tyres every ${phrase}`);
      expect(fixed.recurrence, phrase).toMatchObject({
        frequency,
        interval: 3,
        mode: "fixed",
      });
      expect(fixed.title, phrase).toBe("Rotate the tyres");

      const after = parse(`Rotate the tyres every ${phrase} after completion`);
      expect(after.recurrence, phrase).toMatchObject({
        frequency,
        interval: 3,
        mode: "after_completion",
      });
      expect(after.title, phrase).toBe("Rotate the tyres");
    }
  });

  it("resolves relative dates against the OWNER's day, not the machine's", () => {
    const sydney = parseQuickCapture(
      "Service Hilux tomorrow every 6 months after completion",
      { todayIso: "2026-12-31" },
    );
    expect(sydney.scheduledDate).toBe("2027-01-01");

    const utcDayBefore = parseQuickCapture(
      "Service Hilux tomorrow every 6 months after completion",
      { todayIso: "2026-12-30" },
    );
    expect(utcDayBefore.scheduledDate).toBe("2026-12-31");
  });
});
