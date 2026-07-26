/**
 * TASKS-02 — the canonical task URGENCY evaluator (`taskUrgency`), tested directly.
 *
 * Proves the distinction the 2026-07 UI/UX audit found missing (DEBT-28): Overdue,
 * Due today and Scheduled today are their own kinds, each carrying the meaning in a
 * WORD (never colour alone), a future due date is distinguishable from "due today",
 * completion neutralises the tone, and the due date takes precedence over the
 * scheduled date. Pure — no DOM, no timezone (ADR-022 date-only string compare).
 */

import { describe, expect, it } from "vitest";

import { taskUrgency } from "~/shared/task-record/task-view";

const TODAY = "2026-07-20";

function urgency(
  over: Partial<{
    completedAt: string | null;
    dueDate: string | null;
    scheduledDate: string | null;
  }> = {},
  todayIso = TODAY,
) {
  return taskUrgency(
    { completedAt: null, dueDate: null, scheduledDate: null, ...over },
    todayIso,
  );
}

describe("taskUrgency", () => {
  it("flags an open, past due date as Overdue (danger) with the word", () => {
    expect(urgency({ dueDate: "2026-07-10" })).toEqual({
      kind: "overdue",
      label: "Overdue · due 10 Jul 2026",
      tone: "danger",
    });
  });

  it("distinguishes Due today (warning) from a future due date (neutral)", () => {
    expect(urgency({ dueDate: TODAY })).toEqual({
      kind: "due_today",
      label: "Due today",
      tone: "warning",
    });
    expect(urgency({ dueDate: "2026-08-01" })).toEqual({
      kind: "due",
      label: "Due 1 Aug 2026",
      tone: "neutral",
    });
  });

  it("distinguishes Scheduled today (info) from a future scheduled date", () => {
    expect(urgency({ scheduledDate: TODAY })).toEqual({
      kind: "scheduled_today",
      label: "Scheduled today",
      tone: "info",
    });
    expect(urgency({ scheduledDate: "2026-08-05" })).toEqual({
      kind: "scheduled",
      label: "Scheduled 5 Aug 2026",
      tone: "neutral",
    });
  });

  it("prefers the due date over the scheduled date", () => {
    expect(urgency({ dueDate: "2026-08-01", scheduledDate: TODAY })?.kind).toBe(
      "due",
    );
  });

  it("neutralises the tone once completed (a completed task is not urgent)", () => {
    // A completed, past-due task falls through to the plain due label — never
    // "Overdue" — and never a danger tone.
    expect(
      urgency({ completedAt: "2026-07-21T00:00:00Z", dueDate: "2026-07-10" }),
    ).toEqual({
      kind: "due",
      label: "Due 10 Jul 2026",
      tone: "neutral",
    });
    expect(
      urgency({ completedAt: "2026-07-21T00:00:00Z", dueDate: TODAY })?.tone,
    ).toBe("neutral");
    expect(
      urgency({ completedAt: "2026-07-21T00:00:00Z", scheduledDate: TODAY })
        ?.tone,
    ).toBe("neutral");
  });

  it("returns null when there is no due or scheduled date", () => {
    expect(urgency()).toBeNull();
  });

  it("returns null for a malformed date rather than crashing", () => {
    expect(urgency({ dueDate: "2026/07/10" })).toBeNull();
  });
});
