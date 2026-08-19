/**
 * TASKS-07 — the recurrence AUTHORING model.
 *
 * These are the pure translations between the owner's vocabulary and the kernel's
 * typed rule. They matter because the previous authoring surface could DISPLAY any
 * rule but only WRITE seven of them (DEBT-66), and the failure mode of a lossy
 * translation is silent: a rule that reads correctly, is re-committed by an ordinary
 * interaction, and comes back flattened.
 *
 * So the round trip is asserted in both directions, and the label the owner reads
 * before saving is asserted to be the SAME label every read-only surface shows.
 */

import { describe, expect, it } from "vitest";

import {
  EMPTY_RECURRENCE_DRAFT,
  RECURRENCE_PRESETS,
  draftFromRule,
  presetOf,
  recurrenceDraftError,
  recurrenceFormFields,
  recurrenceUnitLabel,
  ruleForPreset,
  ruleFromDraft,
  type RecurrenceDraft,
} from "~/shared/task-record/recurrence-authoring";
import { taskRecurrenceLabel } from "~/shared/task-record/task-view";
import { validateTaskRecurrenceRule } from "~/kernel/tasks";

const rule = (over: Partial<Parameters<typeof presetOf>[0]> = {}) => ({
  frequency: "week" as const,
  interval: 1,
  weekdays: [] as readonly number[],
  mode: "fixed" as const,
  ...over,
});

const draft = (over: Partial<RecurrenceDraft> = {}): RecurrenceDraft => ({
  ...EMPTY_RECURRENCE_DRAFT,
  preset: "custom",
  ...over,
});

describe("presets", () => {
  it("names every ordinary rule, and nothing else", () => {
    expect(presetOf(null)).toBe("none");
    expect(presetOf(rule({ frequency: "day" }))).toBe("daily");
    expect(presetOf(rule({ frequency: "weekday" }))).toBe("weekdays");
    expect(presetOf(rule({ frequency: "week" }))).toBe("weekly");
    expect(presetOf(rule({ frequency: "month" }))).toBe("monthly");
    expect(presetOf(rule({ frequency: "year" }))).toBe("yearly");
  });

  it("reports a CUSTOM interval as custom rather than the nearest preset", () => {
    // "Every 3 weeks" is a valid stored rule with no preset. Calling it "Weekly"
    // would let the next interaction rewrite it to interval 1.
    expect(presetOf(rule({ interval: 3 }))).toBe("custom");
  });

  it("reports a WEEKDAY-PINNED weekly rule as custom", () => {
    // "Every Monday" is week:1 + weekdays [1]. Reporting it as plain "Weekly" is
    // exactly how the Monday used to get dropped (V2.0.1).
    expect(presetOf(rule({ weekdays: [1] }))).toBe("custom");
  });

  it("reports an AFTER-COMPLETION rule as custom — every preset is a schedule", () => {
    expect(presetOf(rule({ mode: "after_completion" }))).toBe("custom");
  });

  it("round-trips every preset through its rule and back", () => {
    for (const preset of RECURRENCE_PRESETS) {
      const built = ruleForPreset(preset, "scheduled");
      if (preset === "custom") {
        expect(built).toBeUndefined();
        continue;
      }
      if (preset === "none") {
        expect(built).toBeNull();
        continue;
      }
      // The kernel must accept it unchanged, and reading it back must name the same
      // preset — otherwise choosing an option would not mean what it says. Monthly and
      // yearly anchors come from the TASK's own date (`resolveTaskRecurrenceRule`), so
      // they are supplied here as that resolution would.
      const validated = validateTaskRecurrenceRule({
        ...built!,
        anchorDay:
          built!.frequency === "month" || built!.frequency === "year"
            ? 15
            : null,
        anchorMonth: built!.frequency === "year" ? 6 : null,
      });
      expect(presetOf(validated)).toBe(preset);
      expect(validated.mode).toBe("fixed");
      expect(validated.interval).toBe(1);
    }
  });
});

describe("loading a stored rule into the editor", () => {
  it("shows an unset repeat as 'does not repeat', anchored where the caller says", () => {
    expect(draftFromRule(null, "due")).toEqual({
      ...EMPTY_RECURRENCE_DRAFT,
      dateKind: "due",
    });
  });

  it("loads a custom rule field by field", () => {
    const loaded = draftFromRule({
      frequency: "week",
      interval: 2,
      weekdays: [1, 4],
      mode: "fixed",
      dateKind: "due",
    });
    expect(loaded).toEqual({
      preset: "custom",
      unit: "week",
      interval: "2",
      weekdays: [1, 4],
      mode: "fixed",
      dateKind: "due",
      // TASKS-12 — a rule with no advanced part loads with every advanced
      // control at the value that means "not used", so opening the editor on an
      // old rule changes nothing about it.
      monthlyShape: "day",
      ordinal: "first",
      weekendRule: "allow",
      ends: "never",
      endsAfterCount: "12",
      endsOnDate: "",
    });
  });

  it("gives 'Every weekday' a sensible unit to switch away to", () => {
    // `weekday` (Mon–Fri) has no custom form. Leaving the unit as an invalid value
    // would break the very first interaction after switching to Custom.
    expect(
      draftFromRule({
        ...rule({ frequency: "weekday" }),
        dateKind: "scheduled",
      }).unit,
    ).toBe("week");
  });
});

describe("building a rule from the draft", () => {
  it("builds a plain custom interval", () => {
    expect(ruleFromDraft(draft({ unit: "month", interval: "3" }))).toEqual({
      frequency: "month",
      interval: 3,
      dateKind: "scheduled",
      mode: "fixed",
      weekdays: [],
      // TASKS-12 — explicitly absent rather than omitted, so switching a rule
      // back from an advanced form CLEARS the advanced part instead of leaving
      // half of it behind.
      ordinal: null,
      weekendRule: "allow",
      endsAfterCount: null,
      endsOnDate: null,
    });
  });

  it("sorts and keeps selected weekdays for a fixed WEEKLY rule", () => {
    expect(
      ruleFromDraft(draft({ unit: "week", interval: "2", weekdays: [4, 1] })),
    ).toMatchObject({ frequency: "week", interval: 2, weekdays: [1, 4] });
  });

  it("DROPS weekdays the kernel would refuse rather than smuggling them through", () => {
    // Weekdays only mean something for a weekly schedule. Carrying them into a
    // monthly rule, or into an after-completion interval, would be rejected at the
    // boundary — so the builder discards them here and the editor's controls hide
    // them, which keeps the two in agreement.
    expect(
      ruleFromDraft(draft({ unit: "month", interval: "1", weekdays: [1] })),
    ).toMatchObject({ weekdays: [] });
    expect(
      ruleFromDraft(
        draft({
          unit: "week",
          interval: "1",
          weekdays: [],
          mode: "after_completion",
        }),
      ),
    ).toMatchObject({ mode: "after_completion", weekdays: [] });
  });

  it("refuses an interval outside 1–99, and says so in the owner's words", () => {
    for (const interval of ["", "0", "100", "abc", "2.5"]) {
      const bad = draft({ interval });
      expect(recurrenceDraftError(bad)).toMatch(/1 to 99/);
      expect(ruleFromDraft(bad)).toBeUndefined();
    }
    expect(recurrenceDraftError(draft({ interval: "99" }))).toBeNull();
  });

  it("refuses weekdays on an after-completion interval", () => {
    const bad = draft({
      unit: "week",
      interval: "2",
      weekdays: [1],
      mode: "after_completion",
    });
    expect(recurrenceDraftError(bad)).toMatch(/weekdays/);
  });

  it("never validates a PRESET draft as if it were custom", () => {
    // A preset carries no interval of its own, so a stale custom interval in the
    // draft must not be able to block it.
    expect(
      recurrenceDraftError(draft({ preset: "weekly", interval: "" })),
    ).toBeNull();
    expect(
      ruleFromDraft(draft({ preset: "weekly", interval: "" })),
    ).toMatchObject({ frequency: "week", interval: 1 });
  });

  it("produces rules the KERNEL accepts unchanged", () => {
    const cases: readonly RecurrenceDraft[] = [
      draft({ unit: "day", interval: "1" }),
      draft({ unit: "day", interval: "30", mode: "after_completion" }),
      draft({ unit: "week", interval: "2", weekdays: [1, 4] }),
      draft({ unit: "month", interval: "3", dateKind: "due" }),
      draft({ unit: "year", interval: "1" }),
      draft({ preset: "weekdays" }),
    ];
    for (const candidate of cases) {
      const built = ruleFromDraft(candidate);
      expect(built).toBeDefined();
      // Monthly/yearly anchors are derived from the task's own date by
      // `resolveTaskRecurrenceRule`, so the builder deliberately supplies none; the
      // structural validator is what this asserts.
      expect(() =>
        validateTaskRecurrenceRule({
          ...built!,
          anchorDay:
            built!.frequency === "month" || built!.frequency === "year"
              ? 15
              : null,
          anchorMonth: built!.frequency === "year" ? 6 : null,
        }),
      ).not.toThrow();
    }
  });
});

describe("what the owner reads before saving", () => {
  it("is the SAME sentence every read-only surface shows", () => {
    const built = ruleFromDraft(
      draft({ unit: "week", interval: "2", weekdays: [1, 4] }),
    )!;
    const label = taskRecurrenceLabel({
      frequency: built.frequency,
      interval: built.interval!,
      dateKind: built.dateKind,
      mode: built.mode!,
      weekdays: built.weekdays!,
    });
    expect(label).toBe("Every Monday, Thursday, every 2 weeks");
  });

  it("words an after-completion rule as an interval, not a schedule", () => {
    expect(
      taskRecurrenceLabel({
        frequency: "day",
        interval: 30,
        dateKind: "scheduled",
        mode: "after_completion",
        weekdays: [],
      }),
    ).toBe("30 days after completion");
    expect(
      taskRecurrenceLabel({
        frequency: "week",
        interval: 1,
        dateKind: "scheduled",
        mode: "after_completion",
        weekdays: [],
      }),
    ).toBe("1 week after completion");
  });

  it("treats a rule with NO stored mode as the documented fixed default", () => {
    // Every rule written before TASKS-07 has no mode. It must read as the schedule it
    // always was, never as an interval.
    expect(
      taskRecurrenceLabel({
        frequency: "week",
        interval: 3,
        dateKind: "scheduled",
        weekdays: [],
      }),
    ).toBe("Every 3 weeks");
  });
});

describe("the wire form", () => {
  it("sends nothing but the intent to STOP a repeat", () => {
    expect(recurrenceFormFields(null)).toEqual({ intent: "set_recurrence" });
  });

  it("sends every field the canonical mutation validates", () => {
    expect(
      recurrenceFormFields(
        ruleFromDraft(
          draft({ unit: "week", interval: "2", weekdays: [1, 4] }),
        )!,
      ),
    ).toEqual({
      intent: "set_recurrence",
      frequency: "week",
      interval: "2",
      dateKind: "scheduled",
      mode: "fixed",
      weekdays: "1,4",
      // TASKS-12 — every advanced field is SENT, empty when unused, so turning
      // one off is a real change rather than an absent key the action ignores.
      ordinal: "",
      weekendRule: "allow",
      endsAfterCount: "",
      endsOnDate: "",
    });
  });
});

describe("unit wording", () => {
  it("agrees with the number beside it", () => {
    expect(recurrenceUnitLabel("day", 1)).toBe("day");
    expect(recurrenceUnitLabel("day", 2)).toBe("days");
    expect(recurrenceUnitLabel("month", 3)).toBe("months");
  });
});
