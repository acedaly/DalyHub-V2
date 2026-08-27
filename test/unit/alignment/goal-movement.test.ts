/**
 * FOLLOW-02 — the GOAL MOVEMENT matrix.
 *
 * The feature rests on one claim: for a named period, every Goal can truthfully
 * say whether it moved — including a Goal carrying no number at all. This file
 * is where that claim is falsifiable.
 *
 * Table-driven on purpose. Each row is a week that really happens, written as
 * the facts the bounded read returns, and each asserts the machine KEY plus the
 * evidence behind it. A rule that is wrong fails here with the scenario's name
 * attached rather than as a sentence that is subtly off on a page.
 *
 * Everything is pure: no database, no browser, no clock, no timezone database.
 * The owner's calendar mapping arrives as a function, which is what lets the
 * boundary rows drive real midnights by arithmetic.
 *
 * ── What this file does NOT test ────────────────────────────────────────────
 * WHICH stored Activity types become which movement kind is a property of the
 * repository's SQL, not of this evaluator — a rule enforced in one place cannot
 * be double-asserted honestly. `test/kernel/goal-movement.test.ts` proves it
 * against real D1, including the two refusals that matter most: a metadata-only
 * Project edit and a completion just outside the window.
 */

import { describe, expect, it } from "vitest";

import {
  buildActivityWindow,
  type ActivityWindow,
} from "~/kernel/activity-window";
import {
  GOAL_MOVEMENT_KINDS,
  emptyGoalMovementFacts,
  evaluateGoalAlignment,
  evaluateGoalMovement,
  goalMovementRecap,
  goalMovementStatement,
  goalMovementWindowLabel,
  unavailableGoalMovement,
  type GoalMovement,
  type GoalMovementFacts,
  type GoalMovementKind,
} from "~/kernel/alignment";
import { EMPTY_GOAL_PROJECT_CONTRIBUTION } from "~/kernel/goals";

/* -------------------------------------------------------------------------- */
/* The week under test                                                         */
/* -------------------------------------------------------------------------- */

/**
 * A Monday-to-Sunday week for an owner ten hours AHEAD of UTC.
 *
 * The offset is the point: local midnight on Monday 4 May is 3 May at 14:00Z, so
 * every instant here is one a Sydney owner would recognise and a naive UTC
 * comparison would get wrong. Chosen with no DST transition inside it, so a
 * boundary that moves is a bug rather than a calendar.
 */
const OFFSET_HOURS = 10;
const MON = "2026-05-04";
const SUN = "2026-05-10";

function localMidnight(dayIso: string): Date {
  return new Date(Date.parse(`${dayIso}T00:00:00Z`) - OFFSET_HOURS * 3_600_000);
}

/** An instant at `hour:minute` OWNER-LOCAL on a wall-calendar day. */
function at(dayIso: string, hour: number, minute = 0): Date {
  return new Date(
    localMidnight(dayIso).getTime() + (hour * 60 + minute) * 60_000,
  );
}

/** The owner's calendar day for an instant. Arithmetic, not a timezone database. */
function ownerDayOf(instant: Date): string {
  return new Date(instant.getTime() + OFFSET_HOURS * 3_600_000)
    .toISOString()
    .slice(0, 10);
}

const WEEK: ActivityWindow = buildActivityWindow({
  periodStart: MON,
  periodEnd: SUN,
  startOfOwnerDay: localMidnight,
});

/** A day AFTER the week, so every default assertion is about a CLOSED period. */
const AFTER = "2026-05-14";
/** A day INSIDE the week. */
const DURING = "2026-05-06";
/** A day BEFORE the week. */
const BEFORE = "2026-04-28";

function ctxFor(todayIso: string) {
  return { window: WEEK, todayIso, calendarIsoOf: ownerDayOf };
}

function facts(over: Partial<GoalMovementFacts> = {}): GoalMovementFacts {
  return { ...emptyGoalMovementFacts("g1"), ...over };
}

function movementOf(
  over: Partial<GoalMovementFacts> = {},
  todayIso = AFTER,
): GoalMovement {
  return evaluateGoalMovement(facts(over), ctxFor(todayIso));
}

/* -------------------------------------------------------------------------- */
/* What counts as movement                                                     */
/* -------------------------------------------------------------------------- */

describe("which evidence makes a Goal moved", () => {
  /**
   * Every accepted kind, on its own, moves a Goal. The table IS the vocabulary,
   * so a kind added to `GOAL_MOVEMENT_KINDS` without a rule fails the
   * exhaustiveness check below rather than silently doing nothing.
   */
  const KINDS: readonly {
    readonly kind: GoalMovementKind;
    readonly text: string;
  }[] = [
    { kind: "task_completed", text: "1 Task completed" },
    { kind: "project_completed", text: "1 Project completed" },
    { kind: "measurement_logged", text: "1 measurement recorded" },
    { kind: "milestone_completed", text: "1 milestone completed" },
    { kind: "goal_completed", text: "Goal completed" },
  ];

  it("covers every kind the vocabulary declares", () => {
    expect(KINDS.map((entry) => entry.kind)).toEqual([...GOAL_MOVEMENT_KINDS]);
  });

  for (const entry of KINDS) {
    it(`counts ${entry.kind} inside the window as movement`, () => {
      const movement = movementOf({
        counts: { [entry.kind]: 1 },
        latestMovementAt: at(DURING, 9),
      });
      expect(movement.key).toBe("moved");
      expect(movement.moved).toBe(true);
      expect(movement.eventCount).toBe(1);
      expect(goalMovementStatement(movement).detail).toContain(entry.text);
    });
  }

  it("says nothing moved when the window holds no qualifying event", () => {
    /*
     * The fact set a Goal with contributing structure and no outcome produces:
     * Projects exist, nothing happened. The answer is about the WINDOW, never
     * about the Goal's character — "no movement recorded" rather than "stalled".
     */
    const movement = movementOf({ contributingProjectCount: 2 });
    expect(movement.key).toBe("no_movement");
    expect(movement.moved).toBe(false);
    expect(movement.evidence).toEqual([]);
    expect(movement.contributingProjectCount).toBe(2);
    expect(goalMovementStatement(movement).headline).toBe(
      "No movement recorded this week.",
    );
    expect(goalMovementStatement(movement).detail).toBeNull();
  });

  it("sums several kinds into ONE result with the evidence intact", () => {
    const movement = movementOf({
      contributingProjectCount: 3,
      movedProjectCount: 2,
      counts: { task_completed: 4, project_completed: 1 },
      latestMovementAt: at(DURING, 18),
    });
    expect(movement.moved).toBe(true);
    expect(movement.eventCount).toBe(5);
    expect(movement.evidence).toEqual([
      { kind: "task_completed", count: 4 },
      { kind: "project_completed", count: 1 },
    ]);
    // The contributing denominator is printed, never implied.
    expect(goalMovementStatement(movement).detail).toBe(
      "2 of 3 Projects contributed · 4 Tasks completed · 1 Project completed",
    );
  });

  it("states a bare Project count when EVERY contributing Project moved", () => {
    const movement = movementOf({
      contributingProjectCount: 2,
      movedProjectCount: 2,
      counts: { task_completed: 2 },
      latestMovementAt: at(DURING, 9),
    });
    expect(goalMovementStatement(movement).detail).toBe(
      "2 Projects contributed · 2 Tasks completed",
    );
  });

  it("reports movement that came from the Goal itself with NO Project count", () => {
    /*
     * A reading recorded against the Goal moves it without any Project doing
     * anything, so "0 Projects contributed" must not appear — a zero with a
     * denominator that does not apply is worse than silence.
     */
    const movement = movementOf({
      contributingProjectCount: 4,
      movedProjectCount: 0,
      counts: { measurement_logged: 1 },
      latestMovementAt: at(DURING, 7),
    });
    expect(movement.directMeasurementMovement).toBe(true);
    expect(goalMovementStatement(movement).detail).toBe(
      "1 measurement recorded",
    );
  });

  it("marks the Goal's own completion inside the window", () => {
    const movement = movementOf({
      counts: { goal_completed: 1 },
      latestMovementAt: at(DURING, 12),
    });
    expect(movement.completedInWindow).toBe(true);
    expect(movement.key).toBe("moved");
  });

  it("reports the OWNER-calendar day of the most recent qualifying event", () => {
    /*
     * 08:00 owner-local on the week's last day. The owner is ten hours AHEAD, so
     * that instant is 22:00 on the PREVIOUS UTC date — a naive `toISOString()`
     * would name Saturday for something the owner did on Sunday morning, and on
     * the week's FIRST day the same slip would name a day outside the window the
     * derivation has just said the event is inside.
     */
    const sunday = movementOf({
      counts: { task_completed: 1 },
      latestMovementAt: at(SUN, 8),
    });
    expect(at(SUN, 8).toISOString().slice(0, 10)).toBe("2026-05-09");
    expect(sunday.latestMovementDay).toBe(SUN);

    const monday = movementOf({
      counts: { task_completed: 1 },
      latestMovementAt: at(MON, 8),
    });
    expect(at(MON, 8).toISOString().slice(0, 10)).toBe("2026-05-03");
    expect(monday.latestMovementDay).toBe(MON);
  });

  it("never reports a latest day for a Goal that did not move", () => {
    const movement = movementOf({ latestMovementAt: at(BEFORE, 9) });
    expect(movement.latestMovementDay).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* The window's phase decides the tense                                        */
/* -------------------------------------------------------------------------- */

describe("a period that has not happened is never counted", () => {
  it("describes a FUTURE window as not started, never as stalled", () => {
    const movement = movementOf({ contributingProjectCount: 2 }, BEFORE);
    expect(movement.phase).toBe("future");
    expect(movement.key).toBe("not_started");
    expect(movement.moved).toBe(false);
    const words = goalMovementStatement(movement).headline;
    expect(words).toBe("This week has not started.");
    expect(words).not.toMatch(/no movement/i);
  });

  it("refuses to call a FUTURE window moved even if facts claim events", () => {
    /*
     * Defence in depth against the one inversion of ADR-110 decision 5 that a
     * bug could produce: the phase wins over the fact set, always.
     */
    const movement = movementOf(
      { counts: { task_completed: 3 }, latestMovementAt: at(DURING, 9) },
      BEFORE,
    );
    expect(movement.key).toBe("not_started");
    expect(movement.moved).toBe(false);
    expect(movement.eventCount).toBe(0);
    expect(movement.evidence).toEqual([]);
  });

  it("says 'yet' while the window is still RUNNING", () => {
    const movement = movementOf({ contributingProjectCount: 1 }, DURING);
    expect(movement.phase).toBe("running");
    expect(movement.key).toBe("no_movement_yet");
    expect(goalMovementStatement(movement).headline).toBe(
      "No movement yet this week.",
    );
  });

  it("drops the 'yet' once the window has CLOSED", () => {
    const movement = movementOf({ contributingProjectCount: 1 }, AFTER);
    expect(movement.phase).toBe("closed");
    expect(goalMovementStatement(movement).headline).toBe(
      "No movement recorded this week.",
    );
  });

  it("uses the same word for movement in a running and a closed window", () => {
    const seed = {
      counts: { task_completed: 1 },
      latestMovementAt: at(MON, 9),
    };
    expect(goalMovementStatement(movementOf(seed, DURING)).headline).toBe(
      "Moved this week.",
    );
    expect(goalMovementStatement(movementOf(seed, AFTER)).headline).toBe(
      "Moved this week.",
    );
  });

  it("never says 'stalled', and never moralises", () => {
    for (const todayIso of [BEFORE, DURING, AFTER]) {
      const words = goalMovementStatement(
        movementOf({ contributingProjectCount: 3 }, todayIso),
      );
      expect(words.accessible).not.toMatch(
        /stalled|failing|poor|bad|neglected|behind|%|score|grade|streak/i,
      );
      // Every sentence names the window it covers.
      expect(words.headline).toMatch(/this week/i);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Window boundaries                                                           */
/* -------------------------------------------------------------------------- */

describe("the window's own boundaries", () => {
  it("is inclusive at the first owner-local instant", () => {
    expect(WEEK.startInstantIso).toBe(localMidnight(MON).toISOString());
  });

  it("is EXCLUSIVE at the instant that starts the day after the last", () => {
    expect(WEEK.endInstantIso).toBe(localMidnight("2026-05-11").toISOString());
  });

  it("puts an owner's 23:59 on the last day INSIDE and 00:00 next day outside", () => {
    const last = at(SUN, 23, 59).toISOString();
    const next = at("2026-05-11", 0, 0).toISOString();
    expect(last >= WEEK.startInstantIso && last < WEEK.endInstantIso).toBe(
      true,
    );
    expect(next < WEEK.endInstantIso).toBe(false);
  });

  it("builds the same window for an owner BEHIND UTC", () => {
    /*
     * The rule is owner-local midnight, not a fixed offset. For an owner five
     * hours behind, the week opens LATER in UTC than it does for Sydney — and
     * the derivation is unchanged, because it never reads a zone at all.
     */
    const behind = buildActivityWindow({
      periodStart: MON,
      periodEnd: SUN,
      startOfOwnerDay: (dayIso) =>
        new Date(Date.parse(`${dayIso}T00:00:00Z`) + 5 * 3_600_000),
    });
    expect(behind.startInstantIso).toBe("2026-05-04T05:00:00.000Z");
    expect(behind.endInstantIso).toBe("2026-05-11T05:00:00.000Z");
  });

  it("falls back to plain UTC when a local midnight does not exist", () => {
    // The one hour a DST jump skips. Losing an hour of precision once a year is
    // a far smaller error than dropping the period, which is REVIEW-03's rule.
    const dst = buildActivityWindow({
      periodStart: MON,
      periodEnd: SUN,
      startOfOwnerDay: () => null,
    });
    expect(dst.startInstantIso).toBe(`${MON}T00:00:00.000Z`);
    expect(dst.endInstantIso).toBe("2026-05-11T00:00:00.000Z");
  });

  it("names the window's days for the one surface that prints them", () => {
    const movement = movementOf();
    expect(goalMovementWindowLabel(movement, (iso) => iso)).toBe(
      `${MON} – ${SUN}`,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Failing soft                                                                */
/* -------------------------------------------------------------------------- */

describe("an unreadable movement is not a movement of zero", () => {
  it("says the read failed rather than that nothing happened", () => {
    const movement = unavailableGoalMovement("g1", {
      window: WEEK,
      todayIso: AFTER,
    });
    expect(movement.available).toBe(false);
    expect(movement.key).toBe("unavailable");
    expect(goalMovementStatement(movement).headline).toBe(
      "Movement could not be read.",
    );
    expect(goalMovementStatement(movement).headline).not.toMatch(
      /no movement/i,
    );
  });

  it("keeps its window and phase, so a surface can still name the period", () => {
    const movement = unavailableGoalMovement("g1", {
      window: WEEK,
      todayIso: DURING,
    });
    expect(movement.window).toBe(WEEK);
    expect(movement.phase).toBe("running");
  });

  it("is excluded from a page recap rather than counted as unmoved", () => {
    const recap = goalMovementRecap([
      movementOf({ counts: { task_completed: 1 } }),
      movementOf({}),
      unavailableGoalMovement("g3", { window: WEEK, todayIso: AFTER }),
    ]);
    expect(recap).toBe("1 of 2 moved this week");
  });

  it("produces no recap at all when nothing could be read", () => {
    expect(
      goalMovementRecap([
        unavailableGoalMovement("g1", { window: WEEK, todayIso: AFTER }),
      ]),
    ).toBeNull();
    expect(goalMovementRecap([])).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Composition — three answers that are allowed to disagree                    */
/* -------------------------------------------------------------------------- */

describe("alignment, measurement status and movement compose", () => {
  const alignmentCtx = {
    now: new Date(`${AFTER}T00:00:00Z`),
    todayIso: AFTER,
    calendarIsoOf: ownerDayOf,
  };

  it("lets a Goal be ALIGNED and yet have NOT moved this week", () => {
    /*
     * Alignment asks whether ANY meaningful Task activity touched the Goal in a
     * fortnight — renames and reschedules included. Movement asks whether an
     * OUTCOME happened inside seven named days. A Goal edited on Tuesday and
     * finished nothing is exactly this pair, and neither answer may overwrite
     * the other.
     */
    const alignment = evaluateGoalAlignment(
      {
        goalId: "g1",
        completedAt: null,
        contribution: {
          ...EMPTY_GOAL_PROJECT_CONTRIBUTION,
          total: 1,
          active: 1,
          incomplete: 1,
        },
        recentContributingTaskCount: 2,
        lastContributingActivityAt: at(DURING, 9),
      },
      alignmentCtx,
    );
    const movement = movementOf({ contributingProjectCount: 1 });

    expect(alignment.state).toBe("active");
    expect(movement.moved).toBe(false);
  });

  it("lets a Goal be POORLY ALIGNED and yet have moved", () => {
    /*
     * Every contributing Project archived, so alignment reads `unreachable` —
     * and a Project completed inside the window before it was archived still
     * moved the Goal. The surface must not imply this combination is impossible.
     */
    const alignment = evaluateGoalAlignment(
      {
        goalId: "g1",
        completedAt: null,
        contribution: {
          ...EMPTY_GOAL_PROJECT_CONTRIBUTION,
          total: 2,
          archived: 2,
          incomplete: 2,
        },
        recentContributingTaskCount: 0,
        lastContributingActivityAt: null,
      },
      alignmentCtx,
    );
    const movement = movementOf({
      contributingProjectCount: 2,
      movedProjectCount: 1,
      counts: { project_completed: 1 },
      latestMovementAt: at(DURING, 9),
    });

    expect(alignment.state).toBe("unreachable");
    expect(movement.moved).toBe(true);
  });

  it("never derives a measurement STATUS from movement", () => {
    /*
     * The strongest guarantee in this file: the movement result carries no
     * status, no percentage, no pace and no target — so no surface can read one
     * off it, and GOAL-02 keeps sole authority over the measurable answer.
     */
    const movement = movementOf({
      counts: { measurement_logged: 3 },
      latestMovementAt: at(DURING, 9),
    });
    const keys = Object.keys(movement);
    for (const forbidden of [
      "status",
      "progressPercent",
      "progressFraction",
      "target",
      "trend",
      "pace",
      "score",
    ]) {
      expect(keys).not.toContain(forbidden);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Defence against bad facts                                                   */
/* -------------------------------------------------------------------------- */

describe("the evaluator never emits a nonsense figure", () => {
  it("clamps negative and fractional counts rather than printing them", () => {
    const movement = movementOf({
      contributingProjectCount: -3,
      movedProjectCount: 2.7,
      counts: { task_completed: 2.4 },
      latestMovementAt: at(DURING, 9),
    });
    expect(movement.contributingProjectCount).toBe(0);
    expect(movement.movedProjectCount).toBe(2);
    expect(movement.eventCount).toBe(2);
  });

  it("omits a zero-count kind rather than listing it", () => {
    const movement = movementOf({
      counts: { task_completed: 1, project_completed: 0 },
      latestMovementAt: at(DURING, 9),
    });
    expect(movement.evidence).toEqual([{ kind: "task_completed", count: 1 }]);
  });
});
