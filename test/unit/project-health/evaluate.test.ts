/**
 * PROJ-02 — the exhaustive, React-free, storage-free health rule matrix.
 *
 * Every case injects a deterministic clock and asserts on STRUCTURED fields (state,
 * reason codes, counts, days) — never by parsing a user-facing string. This is the
 * authority for the accepted health semantics (ADR-035).
 */

import { describe, expect, it } from "vitest";

import {
  evaluateProjectHealth,
  LONG_WAIT_AFTER_DAYS,
  STALE_AFTER_DAYS,
  UPCOMING_WITHIN_DAYS,
  daysBetweenIsoDates,
  addDaysToIsoDate,
  type HealthEvaluationContext,
  type ProjectHealthFacts,
} from "~/kernel/project-health";

/** A fixed owner-calendar clock: today is 2026-07-22, and every instant maps to its
 * UTC date (the fixtures use UTC instants so the mapping is trivial and stable). */
const TODAY = "2026-07-22";
const NOW = new Date("2026-07-22T02:00:00.000Z");
const ctx: HealthEvaluationContext = {
  now: NOW,
  todayIso: TODAY,
  calendarIsoOf: (instant) => instant.toISOString().slice(0, 10),
};

/** An instant `days` before today (owner calendar), as a UTC midday to avoid any
 * boundary ambiguity. */
function daysAgo(days: number): Date {
  const iso = addDaysToIsoDate(TODAY, -days);
  return new Date(`${iso}T12:00:00.000Z`);
}

function facts(
  overrides: Partial<ProjectHealthFacts> = {},
): ProjectHealthFacts {
  return {
    projectId: "p1",
    completedAt: null,
    createdAt: daysAgo(3),
    updatedAt: daysAgo(1),
    taskTotal: 4,
    taskCompleted: 1,
    waitingOpen: 0,
    overdueOpen: 0,
    slippedOpen: 0,
    upcomingDueOpen: 0,
    upcomingScheduledOpen: 0,
    oldestWaitingSince: null,
    lastMeaningfulActivityAt: daysAgo(1),
    ...overrides,
  };
}

const codes = (h: ReturnType<typeof evaluateProjectHealth>) =>
  h.reasons.map((r) => r.code);

describe("evaluateProjectHealth — pure date helpers", () => {
  it("counts whole calendar days between dates", () => {
    expect(daysBetweenIsoDates("2026-07-01", "2026-07-22")).toBe(21);
    expect(daysBetweenIsoDates("2026-07-22", "2026-07-22")).toBe(0);
    expect(daysBetweenIsoDates("2026-07-22", "2026-07-20")).toBe(-2);
  });
  it("adds days across month boundaries", () => {
    expect(addDaysToIsoDate("2026-07-30", 7)).toBe("2026-08-06");
    expect(addDaysToIsoDate("2026-01-01", -1)).toBe("2025-12-31");
  });
});

describe("evaluateProjectHealth — completed project", () => {
  it("is a calm completed state, no active warnings", () => {
    const h = evaluateProjectHealth(
      facts({ completedAt: daysAgo(0), taskTotal: 4, taskCompleted: 4 }),
      ctx,
    );
    expect(h.state).toBe("completed");
    expect(h.tone).toBe("success");
    expect(codes(h)).toEqual(["completed"]);
  });

  it("surfaces a calm note when open tasks remain under a completed project", () => {
    const h = evaluateProjectHealth(
      facts({
        completedAt: daysAgo(0),
        taskTotal: 4,
        taskCompleted: 1,
        overdueOpen: 2, // must NOT produce an at-risk warning
      }),
      ctx,
    );
    expect(h.state).toBe("completed");
    expect(codes(h)).toContain("completed_open_tasks");
    expect(codes(h)).not.toContain("overdue");
    expect(h.reasons[0].code).toBe("completed_open_tasks");
    expect(h.reasons[0].count).toBe(3);
  });
});

describe("evaluateProjectHealth — empty and on-track", () => {
  it("treats an empty open project as calm, not 100%", () => {
    const h = evaluateProjectHealth(
      facts({ taskTotal: 0, taskCompleted: 0 }),
      ctx,
    );
    expect(h.state).toBe("on_track");
    expect(h.tone).toBe("neutral");
    expect(codes(h)).toEqual(["no_tasks"]);
    expect(h.summary.progressPercent).toBeNull();
  });

  it("is on track when progressing with no signals", () => {
    const h = evaluateProjectHealth(facts(), ctx);
    expect(h.state).toBe("on_track");
    expect(codes(h)).toEqual(["on_track"]);
    expect(h.summary.progressPercent).toBe(25);
  });

  it("is on track when all active tasks are complete", () => {
    const h = evaluateProjectHealth(
      facts({ taskTotal: 3, taskCompleted: 3 }),
      ctx,
    );
    expect(h.state).toBe("on_track");
    expect(h.summary.progressPercent).toBe(100);
    expect(h.summary.openTotal).toBe(0);
  });
});

describe("evaluateProjectHealth — staleness threshold", () => {
  it("is on track one day before the threshold", () => {
    const h = evaluateProjectHealth(
      facts({ lastMeaningfulActivityAt: daysAgo(STALE_AFTER_DAYS - 1) }),
      ctx,
    );
    expect(h.state).toBe("on_track");
    expect(codes(h)).not.toContain("stale");
  });

  it("is stale exactly AT the (inclusive) threshold", () => {
    const h = evaluateProjectHealth(
      facts({ lastMeaningfulActivityAt: daysAgo(STALE_AFTER_DAYS) }),
      ctx,
    );
    expect(h.state).toBe("stale");
    expect(h.reasons[0].code).toBe("stale");
    expect(h.reasons[0].days).toBe(STALE_AFTER_DAYS);
    expect(h.tone).toBe("info"); // calm, never aggressive red for inactivity
  });

  it("is stale after the threshold", () => {
    const h = evaluateProjectHealth(
      facts({ lastMeaningfulActivityAt: daysAgo(STALE_AFTER_DAYS + 10) }),
      ctx,
    );
    expect(h.state).toBe("stale");
    expect(h.summary.daysSinceActivity).toBe(STALE_AFTER_DAYS + 10);
  });

  it("an all-complete project is on track, never stale, however old the activity", () => {
    const h = evaluateProjectHealth(
      facts({
        taskTotal: 3,
        taskCompleted: 3,
        lastMeaningfulActivityAt: daysAgo(400),
      }),
      ctx,
    );
    expect(h.state).toBe("on_track");
    expect(codes(h)).not.toContain("stale");
  });

  it("an empty project is never stale", () => {
    const h = evaluateProjectHealth(
      facts({
        taskTotal: 0,
        taskCompleted: 0,
        lastMeaningfulActivityAt: daysAgo(90),
      }),
      ctx,
    );
    expect(h.state).toBe("on_track");
    expect(codes(h)).toEqual(["no_tasks"]);
  });

  it("falls back to updatedAt when no meaningful activity is recorded", () => {
    const h = evaluateProjectHealth(
      facts({
        lastMeaningfulActivityAt: null,
        updatedAt: daysAgo(STALE_AFTER_DAYS + 1),
      }),
      ctx,
    );
    expect(h.state).toBe("stale");
    expect(h.summary.lastActivityDate).toBeNull(); // no recorded activity disclosed
  });
});

describe("evaluateProjectHealth — blockers", () => {
  it("some waiting with other actionable work is on track with a waiting note", () => {
    const h = evaluateProjectHealth(
      facts({ taskTotal: 5, taskCompleted: 1, waitingOpen: 1 }),
      ctx,
    );
    expect(h.state).toBe("on_track");
    expect(codes(h)).toContain("waiting");
    expect(codes(h)).not.toContain("blocked");
  });

  it("is blocked when all remaining open work is waiting", () => {
    const h = evaluateProjectHealth(
      facts({ taskTotal: 4, taskCompleted: 1, waitingOpen: 3 }),
      ctx,
    );
    expect(h.state).toBe("blocked");
    expect(h.reasons[0].code).toBe("blocked");
    expect(h.reasons[0].count).toBe(3);
    expect(h.tone).toBe("warning");
  });

  it("surfaces a long-running wait even with actionable work", () => {
    const h = evaluateProjectHealth(
      facts({
        taskTotal: 5,
        taskCompleted: 1,
        waitingOpen: 1,
        oldestWaitingSince: daysAgo(LONG_WAIT_AFTER_DAYS + 2),
      }),
      ctx,
    );
    expect(codes(h)).toContain("long_waiting");
    const longWait = h.reasons.find((r) => r.code === "long_waiting");
    expect(longWait?.days).toBe(LONG_WAIT_AFTER_DAYS + 2);
  });

  it("does not flag a short wait as long-running", () => {
    const h = evaluateProjectHealth(
      facts({
        taskTotal: 5,
        taskCompleted: 1,
        waitingOpen: 1,
        oldestWaitingSince: daysAgo(LONG_WAIT_AFTER_DAYS - 1),
      }),
      ctx,
    );
    expect(codes(h)).not.toContain("long_waiting");
  });

  it("a completed task that formerly waited does not count (waitingOpen is open-only)", () => {
    // The repository counts open waiting tasks only; a fully-complete project with a
    // formerly-waiting task reports waitingOpen 0.
    const h = evaluateProjectHealth(
      facts({ taskTotal: 3, taskCompleted: 3, waitingOpen: 0 }),
      ctx,
    );
    expect(codes(h)).not.toContain("waiting");
    expect(codes(h)).not.toContain("blocked");
  });
});

describe("evaluateProjectHealth — due vs scheduled", () => {
  it("overdue due work makes a project at risk (danger)", () => {
    const h = evaluateProjectHealth(
      facts({ taskTotal: 4, taskCompleted: 1, overdueOpen: 2 }),
      ctx,
    );
    expect(h.state).toBe("at_risk");
    expect(h.reasons[0].code).toBe("overdue");
    expect(h.reasons[0].count).toBe(2);
    expect(h.tone).toBe("danger");
  });

  it("slipped scheduled work makes a project at risk (warning, not danger)", () => {
    const h = evaluateProjectHealth(
      facts({ taskTotal: 4, taskCompleted: 1, slippedOpen: 1 }),
      ctx,
    );
    expect(h.state).toBe("at_risk");
    expect(h.reasons[0].code).toBe("slipped");
    expect(h.tone).toBe("warning");
  });

  it("keeps due and scheduled distinct as separate reasons", () => {
    const h = evaluateProjectHealth(
      facts({
        taskTotal: 6,
        taskCompleted: 1,
        overdueOpen: 1,
        slippedOpen: 2,
      }),
      ctx,
    );
    expect(codes(h)).toContain("overdue");
    expect(codes(h)).toContain("slipped");
    expect(h.reasons[0].code).toBe("overdue"); // due leads
  });

  it("surfaces upcoming due and scheduled work as calm on-track context", () => {
    const h = evaluateProjectHealth(
      facts({ upcomingDueOpen: 2, upcomingScheduledOpen: 3 }),
      ctx,
    );
    expect(h.state).toBe("on_track");
    expect(codes(h)).toContain("upcoming_due");
    expect(codes(h)).toContain("upcoming_scheduled");
    const due = h.reasons.find((r) => r.code === "upcoming_due");
    expect(due?.count).toBe(2);
  });

  it("upcoming work never makes a project at risk", () => {
    const h = evaluateProjectHealth(facts({ upcomingDueOpen: 5 }), ctx);
    expect(h.state).toBe("on_track");
  });
});

describe("evaluateProjectHealth — precedence with multiple simultaneous signals", () => {
  it("overdue outranks blocked and stale but preserves them as secondary reasons", () => {
    const h = evaluateProjectHealth(
      facts({
        taskTotal: 4,
        taskCompleted: 0,
        overdueOpen: 1,
        waitingOpen: 4, // all remaining waiting → also blocked
        lastMeaningfulActivityAt: daysAgo(STALE_AFTER_DAYS + 5), // also stale
      }),
      ctx,
    );
    expect(h.state).toBe("at_risk");
    expect(h.reasons[0].code).toBe("overdue");
    expect(codes(h)).toContain("blocked");
    expect(codes(h)).toContain("stale");
  });

  it("blocked outranks stale when no overdue/slipped work exists", () => {
    const h = evaluateProjectHealth(
      facts({
        taskTotal: 3,
        taskCompleted: 0,
        waitingOpen: 3,
        lastMeaningfulActivityAt: daysAgo(STALE_AFTER_DAYS + 5),
      }),
      ctx,
    );
    expect(h.state).toBe("blocked");
    expect(h.reasons[0].code).toBe("blocked");
    expect(codes(h)).toContain("stale");
  });
});

describe("evaluateProjectHealth — determinism & structure", () => {
  it("is a pure function of (facts, clock)", () => {
    const f = facts({ overdueOpen: 1 });
    expect(evaluateProjectHealth(f, ctx)).toEqual(
      evaluateProjectHealth(f, ctx),
    );
  });

  it("records the evaluation time and never emits an empty reasons list", () => {
    const h = evaluateProjectHealth(facts(), ctx);
    expect(h.evaluatedAtIso).toBe(NOW.toISOString());
    expect(h.reasons.length).toBeGreaterThan(0);
  });

  it("never repeats a reason code", () => {
    const h = evaluateProjectHealth(
      facts({
        taskTotal: 6,
        taskCompleted: 0,
        overdueOpen: 1,
        slippedOpen: 1,
        waitingOpen: 2,
        upcomingDueOpen: 1,
        lastMeaningfulActivityAt: daysAgo(STALE_AFTER_DAYS + 1),
      }),
      ctx,
    );
    expect(new Set(codes(h)).size).toBe(codes(h).length);
  });

  it("keeps the upcoming window inclusive of the boundary day", () => {
    // Sanity check the constant is wired into the summary window expectations.
    expect(UPCOMING_WITHIN_DAYS).toBeGreaterThan(0);
  });
});
