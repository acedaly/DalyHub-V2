/**
 * FOLLOW-01 — the HISTORY MATRIX.
 *
 * The whole feature rests on one claim: given the Activity a week actually
 * produced, DalyHub can say what became of the work that week's plan held —
 * truthfully, and without a second stored record. This file is where that claim
 * is falsifiable.
 *
 * It is table-driven on purpose. Each row is a week that really happens, written
 * as the events the product's own planning paths write, and each asserts the
 * OUTCOME plus the facts behind it. A rule that is wrong fails here with the
 * scenario's name attached rather than as a number that is off by one on a page.
 *
 * Everything is pure: no database, no browser, no clock, no timezone database.
 * The owner's calendar day arrives as a function, which is what lets the last
 * three rows drive real midnight boundaries by arithmetic.
 */

import { describe, expect, it } from "vitest";

import {
  activityWindowPhase,
  buildActivityWindow,
  derivePeriodPlanAccount,
  entryReason,
  isCompletedOutcome,
  planAccountFacts,
  planAccountStatement,
  resolvePlanAtWindowOpen,
  TASK_PLAN_OUTCOMES,
  unavailablePlanAccount,
  type ActivityWindow,
  type TaskPlanEvent,
  type TaskPlanOutcome,
  type TaskPlanSubject,
} from "~/kernel/activity-window";

/* -------------------------------------------------------------------------- */
/* The week under test                                                         */
/* -------------------------------------------------------------------------- */

/**
 * A Monday-to-Sunday week for an owner ten hours AHEAD of UTC.
 *
 * The offset is the point: local midnight on Monday 4 May is 3 May at 14:00Z, so
 * every instant in this file is one an owner in Sydney would recognise and a
 * naive UTC comparison would get wrong. Chosen with no DST transition inside it,
 * so a boundary that moves is a bug rather than a calendar.
 */
const OFFSET_HOURS = 10;
const MON = "2026-05-04";
const SUN = "2026-05-10";

/** The owner's local midnight for a wall-calendar day, as an instant. */
function localMidnight(dayIso: string): Date {
  return new Date(Date.parse(`${dayIso}T00:00:00Z`) - OFFSET_HOURS * 3_600_000);
}

/** An instant at `hour:minute` OWNER-LOCAL on a wall-calendar day. */
function at(dayIso: string, hour: number, minute = 0): string {
  return new Date(
    localMidnight(dayIso).getTime() + (hour * 60 + minute) * 60_000,
  ).toISOString();
}

/** The owner's calendar day for an instant — the resolver the derivation takes. */
function ownerDayOf(instantIso: string): string {
  return new Date(Date.parse(instantIso) + OFFSET_HOURS * 3_600_000)
    .toISOString()
    .slice(0, 10);
}

const WEEK: ActivityWindow = buildActivityWindow({
  periodStart: MON,
  periodEnd: SUN,
  startOfOwnerDay: localMidnight,
});

/** Day N of the week, zero-based: `day(0)` is Monday. */
function day(index: number): string {
  return new Date(Date.parse(`${MON}T00:00:00Z`) + index * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/* -------------------------------------------------------------------------- */
/* Builders                                                                    */
/* -------------------------------------------------------------------------- */

const TASK_ID = "t1";

function subject(overrides: Partial<TaskPlanSubject> = {}): TaskPlanSubject {
  return {
    id: TASK_ID,
    title: "Write the thing",
    scheduledDate: null,
    completedAtIso: null,
    abandonedNow: false,
    parent: null,
    ...overrides,
  };
}

function planned(occurredAtIso: string, to: string): TaskPlanEvent {
  return {
    taskId: TASK_ID,
    kind: "planned",
    occurredAtIso,
    planBefore: null,
    planAfter: to,
  };
}

function moved(occurredAtIso: string, from: string, to: string): TaskPlanEvent {
  return {
    taskId: TASK_ID,
    kind: "rescheduled",
    occurredAtIso,
    planBefore: from,
    planAfter: to,
  };
}

function cleared(occurredAtIso: string, from: string): TaskPlanEvent {
  return {
    taskId: TASK_ID,
    kind: "cleared",
    occurredAtIso,
    planBefore: from,
    planAfter: null,
  };
}

function completed(occurredAtIso: string): TaskPlanEvent {
  return {
    taskId: TASK_ID,
    kind: "completed",
    occurredAtIso,
    planBefore: null,
    planAfter: null,
  };
}

function reopened(occurredAtIso: string): TaskPlanEvent {
  return {
    taskId: TASK_ID,
    kind: "reopened",
    occurredAtIso,
    planBefore: null,
    planAfter: null,
  };
}

/** Run one scenario through the real derivation and return its single entry. */
function account(
  events: readonly TaskPlanEvent[],
  subjectOverrides: Partial<TaskPlanSubject> = {},
  todayIso = "2026-05-18",
) {
  return derivePeriodPlanAccount({
    window: WEEK,
    todayIso,
    subjects: [subject(subjectOverrides)],
    events,
    ownerDayOf,
  });
}

/* -------------------------------------------------------------------------- */
/* The matrix                                                                  */
/* -------------------------------------------------------------------------- */

interface Scenario {
  readonly name: string;
  readonly events: readonly TaskPlanEvent[];
  readonly subject?: Partial<TaskPlanSubject>;
  readonly todayIso?: string;
  readonly outcome: TaskPlanOutcome | null;
  readonly reschedules?: number;
  readonly plannedDays?: readonly string[];
  readonly judged?: string | null;
  readonly completedDay?: string | null;
  readonly movedIn?: boolean;
  readonly addedDuring?: boolean;
  readonly planStillAhead?: boolean;
}

/** The plan events that happen BEFORE the week, as the product writes them. */
const BEFORE = at("2026-05-01", 9);

const MATRIX: readonly Scenario[] = [
  {
    name: "planned Monday, completed Monday — held its day",
    events: [planned(BEFORE, day(0)), completed(at(day(0), 17))],
    subject: { scheduledDate: day(0), completedAtIso: at(day(0), 17) },
    outcome: "kept",
    reschedules: 0,
    plannedDays: [day(0)],
    judged: day(0),
    completedDay: day(0),
  },
  {
    name: "planned Monday, completed Tuesday — later than planned, and the history says so",
    events: [planned(BEFORE, day(0)), completed(at(day(1), 9))],
    subject: { scheduledDate: day(0), completedAtIso: at(day(1), 9) },
    outcome: "completed_late",
    reschedules: 0,
    judged: day(0),
    completedDay: day(1),
  },
  {
    name: "planned Friday, completed Tuesday — EARLY is not late",
    events: [planned(BEFORE, day(4)), completed(at(day(1), 9))],
    subject: { scheduledDate: day(4), completedAtIso: at(day(1), 9) },
    outcome: "completed_early",
    judged: day(4),
    completedDay: day(1),
  },
  {
    name: "planned Monday, rescheduled to Wednesday, completed Wednesday — KEPT and MOVED are different questions",
    events: [
      planned(BEFORE, day(0)),
      moved(at(day(0), 20), day(0), day(2)),
      completed(at(day(2), 11)),
    ],
    subject: { scheduledDate: day(2), completedAtIso: at(day(2), 11) },
    outcome: "kept",
    reschedules: 1,
    plannedDays: [day(0), day(2)],
    judged: day(2),
    completedDay: day(2),
  },
  {
    name: "planned Monday, rescheduled Wednesday, rescheduled Friday, never completed — the COUNT survives",
    events: [
      planned(BEFORE, day(0)),
      moved(at(day(0), 20), day(0), day(2)),
      moved(at(day(2), 20), day(2), day(4)),
    ],
    subject: { scheduledDate: day(4) },
    outcome: "carried",
    reschedules: 2,
    plannedDays: [day(0), day(2), day(4)],
    judged: day(4),
  },
  {
    name: "planned, then the plan is cleared inside the week",
    events: [planned(BEFORE, day(1)), cleared(at(day(2), 8), day(1))],
    subject: { scheduledDate: null },
    outcome: "cleared",
    reschedules: 0,
    plannedDays: [day(1)],
    judged: day(1),
  },
  {
    name: "moved INTO the target week from another week",
    events: [
      planned(at("2026-04-20", 9), "2026-04-22"),
      moved(at(day(1), 10), "2026-04-22", day(3)),
    ],
    subject: { scheduledDate: day(3) },
    outcome: "carried",
    reschedules: 1,
    plannedDays: [day(3)],
    judged: day(3),
    movedIn: true,
  },
  {
    name: "placed into the week during it, having had no plan at all",
    events: [planned(at(day(1), 10), day(3))],
    subject: { scheduledDate: day(3) },
    outcome: "carried",
    reschedules: 0,
    plannedDays: [day(3)],
    movedIn: false,
    addedDuring: true,
  },
  {
    name: "moved OUT of the target week during it",
    events: [
      planned(BEFORE, day(3)),
      moved(at(day(2), 14), day(3), "2026-05-18"),
    ],
    subject: { scheduledDate: "2026-05-18" },
    outcome: "moved_out",
    reschedules: 1,
    plannedDays: [day(3)],
    judged: day(3),
  },
  {
    name: "planned in the target week, incomplete at the period's end",
    events: [planned(BEFORE, day(2))],
    subject: { scheduledDate: day(2) },
    outcome: "carried",
    judged: day(2),
    planStillAhead: false,
  },
  {
    name: "completed in the target week but never planned there",
    events: [completed(at(day(2), 16))],
    subject: { scheduledDate: null, completedAtIso: at(day(2), 16) },
    outcome: "unplanned",
    judged: null,
    completedDay: day(2),
  },
  {
    name: "completion OUTSIDE the target window leaves the week unfinished",
    events: [planned(BEFORE, day(2))],
    subject: { scheduledDate: day(2), completedAtIso: at("2026-05-13", 9) },
    outcome: "carried",
    judged: day(2),
    completedDay: null,
  },
  {
    /*
     * The row that makes "causality, not coincidence" FALSIFIABLE.
     *
     * The plan pointed at Monday when the work was done on Monday, and moved to
     * Friday afterwards — a series move on the occurrence, or a restore. The
     * Task's date NOW says Friday, so an implementation that judged completion
     * against the date the Task carries would report this as finished four days
     * EARLY. It was finished exactly when it was planned to be.
     */
    name: "the plan moved AFTER completion — judged against the plan in force at the time",
    events: [
      planned(BEFORE, day(0)),
      completed(at(day(0), 17)),
      moved(at(day(2), 9), day(0), day(4)),
    ],
    subject: { scheduledDate: day(4), completedAtIso: at(day(0), 17) },
    outcome: "kept",
    judged: day(0),
    completedDay: day(0),
  },
  {
    name: "completed then REOPENED inside the week — the week did not finish it",
    events: [
      planned(BEFORE, day(2)),
      completed(at(day(2), 12)),
      reopened(at(day(3), 12)),
    ],
    subject: { scheduledDate: day(2) },
    outcome: "carried",
    completedDay: null,
  },
  {
    name: "MULTIPLE plan events in one day still count each move",
    events: [
      planned(BEFORE, day(0)),
      moved(at(day(0), 8), day(0), day(1)),
      moved(at(day(0), 9), day(1), day(2)),
      moved(at(day(0), 10), day(2), day(3)),
    ],
    subject: { scheduledDate: day(3) },
    outcome: "carried",
    reschedules: 3,
    plannedDays: [day(0), day(1), day(2), day(3)],
  },
  {
    name: "the plan was withdrawn AFTER the week closed — the week still held it",
    events: [
      planned(BEFORE, day(4)),
      moved(at("2026-05-11", 9), day(4), "2026-05-20"),
    ],
    subject: { scheduledDate: "2026-05-20" },
    outcome: "carried",
    // The post-window move is not applied inside the window: at the week's close
    // the plan still pointed at Friday.
    plannedDays: [day(4)],
    judged: day(4),
    reschedules: 0,
  },
  {
    name: "cancelled since — no longer being done, not 'left unfinished'",
    events: [planned(BEFORE, day(2))],
    subject: { scheduledDate: day(2), abandonedNow: true },
    outcome: "dropped",
  },
  {
    name: "a Task the week never touched and never planned is not in the account",
    events: [],
    subject: { scheduledDate: "2026-06-01" },
    outcome: null,
  },
  {
    name: "already finished BEFORE the week opened, and untouched by it",
    events: [],
    subject: { scheduledDate: day(2), completedAtIso: at("2026-05-01", 9) },
    outcome: null,
  },
  /* ── Owner-local midnight boundaries ─────────────────────────────────────── */
  {
    name: "completed at 23:59 owner-local on the period's LAST day is inside it",
    events: [planned(BEFORE, day(6)), completed(at(day(6), 23, 59))],
    subject: { scheduledDate: day(6), completedAtIso: at(day(6), 23, 59) },
    outcome: "kept",
    completedDay: day(6),
  },
  {
    name: "completed at 00:01 owner-local the day AFTER is outside it",
    events: [planned(BEFORE, day(6))],
    subject: {
      scheduledDate: day(6),
      completedAtIso: at("2026-05-11", 0, 1),
    },
    outcome: "carried",
    completedDay: null,
  },
  {
    name: "completed at 00:01 owner-local on the FIRST day is inside it",
    events: [planned(BEFORE, day(0)), completed(at(day(0), 0, 1))],
    subject: { scheduledDate: day(0), completedAtIso: at(day(0), 0, 1) },
    outcome: "kept",
    completedDay: day(0),
  },
  {
    name: "finished at 23:59 owner-local the day BEFORE — the week never held it as owed",
    events: [planned(BEFORE, day(0)), completed(at("2026-05-03", 23, 59))],
    subject: {
      scheduledDate: day(0),
      completedAtIso: at("2026-05-03", 23, 59),
    },
    // One minute earlier than the window opens. Nothing about this Task happened
    // inside the period, so it is not the period's business — reporting it as
    // "left unfinished" would be false, and reporting it as this week's
    // completion would be worse.
    outcome: null,
  },
  {
    name: "a plan move at 23:59 owner-local the day BEFORE is not a move INTO the week",
    events: [
      planned(at("2026-04-20", 9), "2026-04-22"),
      moved(at("2026-05-03", 23, 59), "2026-04-22", day(2)),
    ],
    subject: { scheduledDate: day(2) },
    // The plan already pointed inside the week when it opened, so nothing moved
    // in DURING it. One minute later and the next row says the opposite.
    outcome: "carried",
    movedIn: false,
    reschedules: 0,
    plannedDays: [day(2)],
  },
  {
    name: "a plan move at 00:01 owner-local on the FIRST day is a move into the week",
    events: [
      planned(at("2026-04-20", 9), "2026-04-22"),
      moved(at(day(0), 0, 1), "2026-04-22", day(2)),
    ],
    subject: { scheduledDate: day(2) },
    outcome: "carried",
    movedIn: true,
    reschedules: 1,
    plannedDays: [day(2)],
  },
];

describe("what became of a week's plan", () => {
  for (const scenario of MATRIX) {
    it(scenario.name, () => {
      const result = account(
        scenario.events,
        scenario.subject,
        scenario.todayIso,
      );
      if (scenario.outcome === null) {
        expect(result.entries).toHaveLength(0);
        expect(result.counts.planned).toBe(0);
        return;
      }
      expect(result.entries).toHaveLength(1);
      const entry = result.entries[0];
      expect(entry.outcome).toBe(scenario.outcome);
      if (scenario.reschedules !== undefined) {
        expect(entry.reschedules).toBe(scenario.reschedules);
      }
      if (scenario.plannedDays !== undefined) {
        expect(entry.plannedDays).toEqual(scenario.plannedDays);
      }
      if (scenario.judged !== undefined) {
        expect(entry.plannedDayJudged).toBe(scenario.judged);
      }
      if (scenario.completedDay !== undefined) {
        expect(entry.completedDay).toBe(scenario.completedDay);
      }
      if (scenario.movedIn !== undefined) {
        expect(entry.movedIn).toBe(scenario.movedIn);
      }
      if (scenario.addedDuring !== undefined) {
        expect(entry.addedDuring).toBe(scenario.addedDuring);
      }
      if (scenario.planStillAhead !== undefined) {
        expect(entry.planStillAhead).toBe(scenario.planStillAhead);
      }
    });
  }
});

/* -------------------------------------------------------------------------- */
/* The claims the matrix rows exist to protect                                 */
/* -------------------------------------------------------------------------- */

describe("the two questions the account keeps apart", () => {
  it("counts a Task completed on its planned day after a move as kept AND as moved", () => {
    const result = account(
      [
        planned(BEFORE, day(0)),
        moved(at(day(0), 20), day(0), day(2)),
        completed(at(day(2), 11)),
      ],
      { scheduledDate: day(2), completedAtIso: at(day(2), 11) },
    );
    expect(result.counts.kept).toBe(1);
    expect(result.counts.rescheduled).toBe(1);
    expect(result.counts.reschedules).toBe(1);
    // And the wording says both, rather than picking one.
    const words = planAccountStatement(result, { periodNoun: "week" });
    expect(words.headline).toContain("1 done on the day planned");
    expect(words.movement).toContain("moved to another day");
  });

  it("does NOT call a Task late because it carries an old date", () => {
    /*
     * The plan was moved FORWARD on Tuesday and the work was finished on the new
     * Thursday. Reading the Task's date at the end of the week would say "planned
     * Thursday, done Thursday" either way; what makes this test meaningful is the
     * mirror case below, where the date is identical and the HISTORY differs.
     */
    const late = account([planned(BEFORE, day(0)), completed(at(day(3), 9))], {
      scheduledDate: day(0),
      completedAtIso: at(day(3), 9),
    });
    const onTime = account(
      [
        planned(BEFORE, day(0)),
        moved(at(day(1), 9), day(0), day(3)),
        completed(at(day(3), 9)),
      ],
      { scheduledDate: day(3), completedAtIso: at(day(3), 9) },
    );
    expect(late.entries[0].outcome).toBe("completed_late");
    expect(onTime.entries[0].outcome).toBe("kept");
  });

  it("reconstructs the plan at the window's open from the EVENT, not the Task", () => {
    // The Task now says 20 May. The first in-window event says it was Wednesday.
    const events = [moved(at(day(2), 9), day(2), "2026-05-20")];
    expect(
      resolvePlanAtWindowOpen(
        WEEK,
        events,
        subject({ scheduledDate: "2026-05-20" }),
      ),
    ).toBe(day(2));
  });

  it("falls back to the Task's own date ONLY when no event speaks", () => {
    expect(
      resolvePlanAtWindowOpen(WEEK, [], subject({ scheduledDate: day(2) })),
    ).toBe(day(2));
  });
});

describe("a period that has not happened", () => {
  const openWeek = { ...WEEK };

  it("never describes a future day as unfinished", () => {
    const result = derivePeriodPlanAccount({
      window: openWeek,
      todayIso: day(2),
      subjects: [
        subject({ id: "past", scheduledDate: day(0) }),
        subject({ id: "future", scheduledDate: day(5) }),
      ],
      events: [
        { ...planned(BEFORE, day(0)), taskId: "past" },
        { ...planned(BEFORE, day(5)), taskId: "future" },
      ],
      ownerDayOf,
    });
    expect(result.phase).toBe("running");
    expect(result.counts.carried).toBe(1);
    expect(result.counts.carriedAhead).toBe(1);
    const words = planAccountStatement(result, { periodNoun: "week" });
    expect(words.headline).toContain("1 still to come");
    expect(words.headline).toContain("1 still open");
    expect(words.headline).not.toContain("left unfinished");
  });

  it("phases a window by the owner's own day", () => {
    expect(activityWindowPhase(WEEK, "2026-05-01")).toBe("future");
    expect(activityWindowPhase(WEEK, MON)).toBe("running");
    expect(activityWindowPhase(WEEK, SUN)).toBe("running");
    expect(activityWindowPhase(WEEK, "2026-05-11")).toBe("closed");
  });
});

describe("a week with no plan at all", () => {
  it("produces ONE honest sentence, never a zero-filled table", () => {
    const result = derivePeriodPlanAccount({
      window: WEEK,
      todayIso: "2026-05-18",
      subjects: [],
      events: [],
      ownerDayOf,
    });
    const words = planAccountStatement(result, { periodNoun: "week" });
    expect(words.empty).toBe(true);
    expect(words.facts).toHaveLength(0);
    expect(words.movement).toBeNull();
    expect(words.headline).toBe("Nothing was planned for this week.");
  });

  it("says so in the FUTURE tense for a week that has not started", () => {
    const result = derivePeriodPlanAccount({
      window: WEEK,
      todayIso: "2026-04-28",
      subjects: [],
      events: [],
      ownerDayOf,
    });
    expect(planAccountStatement(result, { periodNoun: "week" }).headline).toBe(
      "Nothing is planned for this week yet.",
    );
  });

  it("distinguishes a failed read from an empty week", () => {
    const unavailable = unavailablePlanAccount(WEEK, "2026-05-18");
    expect(unavailable.available).toBe(false);
    const words = planAccountStatement(unavailable, { periodNoun: "week" });
    expect(words.empty).toBe(false);
    expect(words.headline).toContain("could not be read");
  });
});

describe("the words", () => {
  it("omits every zero", () => {
    const result = account([planned(BEFORE, day(2))], {
      scheduledDate: day(2),
    });
    const facts = planAccountFacts(result, { periodNoun: "week" });
    expect(facts.map((fact) => fact.key)).toEqual(["open"]);
    expect(facts.every((fact) => fact.count > 0)).toBe(true);
  });

  it("never says a percentage, a score, a grade or a streak", () => {
    const result = derivePeriodPlanAccount({
      window: WEEK,
      todayIso: "2026-05-18",
      subjects: [
        subject({
          id: "a",
          scheduledDate: day(0),
          completedAtIso: at(day(0), 9),
        }),
        subject({ id: "b", scheduledDate: day(1) }),
      ],
      events: [
        { ...planned(BEFORE, day(0)), taskId: "a" },
        { ...completed(at(day(0), 9)), taskId: "a" },
        { ...planned(BEFORE, day(1)), taskId: "b" },
      ],
      ownerDayOf,
    });
    const words = planAccountStatement(result, { periodNoun: "week" });
    const everything = [
      words.headline,
      words.movement ?? "",
      ...words.facts.map((fact) => fact.label),
      ...result.entries.map((entry) =>
        entryReason(entry, (iso) => iso, "week"),
      ),
    ].join(" ");
    expect(everything).not.toMatch(/%/);
    expect(everything).not.toMatch(
      /\b(score|grade|streak|adherence|productiv|failed|good week|bad week)\b/i,
    );
  });

  it("states a move COUNT rather than a boolean", () => {
    const once = account(
      [planned(BEFORE, day(0)), moved(at(day(1), 9), day(0), day(2))],
      { scheduledDate: day(2) },
    );
    const thrice = account(
      [
        planned(BEFORE, day(0)),
        moved(at(day(1), 9), day(0), day(2)),
        moved(at(day(2), 9), day(2), day(3)),
        moved(at(day(3), 9), day(3), day(4)),
      ],
      { scheduledDate: day(4) },
    );
    expect(entryReason(once.entries[0], (iso) => iso, "week")).toContain(
      "after moving once",
    );
    expect(entryReason(thrice.entries[0], (iso) => iso, "week")).toContain(
      "after moving 3 times",
    );
  });

  it("covers every outcome in the vocabulary with a reason", () => {
    // A guard against a future outcome being added and quietly rendering
    // `undefined` on a surface.
    for (const outcome of TASK_PLAN_OUTCOMES) {
      const reason = entryReason(
        {
          taskId: "x",
          title: "x",
          outcome,
          plannedDayAtOpen: day(0),
          plannedDayAtClose: day(0),
          plannedDayJudged: day(0),
          completedDay: day(1),
          plannedDays: [day(0)],
          reschedules: 0,
          planChanges: 0,
          movedIn: false,
          addedDuring: false,
          planStillAhead: false,
          parent: null,
        },
        (iso) => iso,
        "week",
      );
      expect(reason, outcome).toBeTruthy();
      expect(reason, outcome).not.toContain("undefined");
    }
  });

  it("agrees with `isCompletedOutcome` about what finished", () => {
    expect(TASK_PLAN_OUTCOMES.filter(isCompletedOutcome)).toEqual([
      "kept",
      "completed_late",
      "completed_early",
      "unplanned",
    ]);
  });
});

describe("the window's boundaries", () => {
  it("is inclusive in DAYS and half-open in INSTANTS", () => {
    expect(WEEK.periodStart).toBe(MON);
    expect(WEEK.periodEnd).toBe(SUN);
    expect(WEEK.startInstantIso).toBe("2026-05-03T14:00:00.000Z");
    // The owner's local midnight that starts the day AFTER the last day.
    expect(WEEK.endInstantIso).toBe("2026-05-10T14:00:00.000Z");
  });

  it("refuses anything that is not a wall-calendar day", () => {
    expect(() =>
      buildActivityWindow({
        periodStart: "2026-05-04T00:00:00Z",
        periodEnd: SUN,
        startOfOwnerDay: localMidnight,
      }),
    ).toThrow(TypeError);
  });

  it("falls back to UTC rather than dropping a period it cannot resolve", () => {
    const window = buildActivityWindow({
      periodStart: MON,
      periodEnd: SUN,
      startOfOwnerDay: () => null,
    });
    expect(window.startInstantIso).toBe("2026-05-04T00:00:00.000Z");
    expect(window.endInstantIso).toBe("2026-05-11T00:00:00.000Z");
  });
});
