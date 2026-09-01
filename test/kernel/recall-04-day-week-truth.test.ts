/**
 * V2.7 RECALL-04 — the day and the week account for themselves. The repository
 * proof (DEBT-233, DEBT-234, DEBT-235).
 *
 * Every assertion here runs against the REAL D1 in the Workers pool, because
 * every claim is about a query or about two surfaces reading one value: which
 * column decides membership, which window it is compared against, how many
 * statements it costs, and whether two screens can honestly disagree about one
 * workspace. A fake repository could satisfy none of them.
 *
 * The rule the whole file is written to (V2.5's, carried into V2.7's acceptance
 * boundary): **a claim that two surfaces tell the same story is proven by
 * reading the same MACHINE VALUE from both, never by comparing sentences that
 * happen to match.**
 *
 * What it proves, in the order the roadmap asks for it:
 *
 *   1. **Meetings today (DEBT-233).** Three Meetings, all already in the past,
 *      and the schedule, Today and the digest agree on the count as a value.
 *      Falsified by deriving the fact from what is UPCOMING.
 *   2. **One measurement predicate (DEBT-234).** Over the whole GOAL-02 status
 *      matrix, the `/goals` lens SQL, the `/goals` lens count, the pure kernel
 *      predicate and Today's own read classify every Goal identically —
 *      `achieved` included, which is the decision this item took. Falsified by
 *      giving one surface a different set.
 *   3. **Bounds (DEBT-234).** A workspace with more open Goals than Today shows
 *      makes Today's figures say which set they describe.
 *   4. **No-health Projects (DEBT-234).** An absent reading is stored as an
 *      absence and produces no transition in either direction. Falsified by
 *      restoring the `"on_track"` default.
 *   5. **The Review period (DEBT-235).** A Review across a month boundary with
 *      60+ in-period completions lists the period's completions in completion
 *      order, bounded after the predicate and honest about the bound — with
 *      before/after/edited-later rows proving each clause. Diary and Meetings
 *      likewise, to the owner-calendar boundary.
 *   6. **Cost.** Today gains no statement; each period list is one statement.
 *   7. **The week-account decision (part 4).** Today keeps the door and gains
 *      no account of its own.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { createActivityActorContext } from "~/kernel/activity";
import {
  GOAL_MEASUREMENT_ON_TRACK_STATUSES,
  UNMEASURED_GOAL,
  goalMatchesCollectionView,
  type GoalDetailsRecord,
  type GoalProgressStatus,
} from "~/kernel/goals";
import { PROJECT_HEALTH_UNAVAILABLE_LABEL } from "~/kernel/project-health";
import { currentReviewPeriod, reviewTemplateId } from "~/kernel/reviews";
import {
  buildReviewInsightSnapshot,
  classifyProjectHealthChange,
  parseReviewInsightSnapshot,
  serializeReviewInsightSnapshot,
  type ReviewInsightFacts,
} from "~/kernel/review-insights";
import { meetingsTodayFact } from "~/modules/today/day/day-view";
import { loadTodayDay } from "~/modules/today/day/load";
import { todayMeasures } from "~/modules/today/day/measures";
import { projectStateFact } from "~/modules/reviews/insights/review-insights-context";
import {
  REVIEW_PERIOD_CONTEXT_LIMIT,
  loadReviewPeriodContext,
} from "~/modules/reviews/review-period-context";
import {
  loadScheduleWindow,
  scheduleForDate,
} from "~/platform/calendar/schedule-load.server";
import { readDigestFacts } from "~/platform/notifications/digest-facts.server";
import { bindWorkspaceRepositories } from "~/platform/workspaces";
import {
  GOAL_PROGRESS_STATUS_LABELS,
  evaluateGoalFromSummary,
  goalIsOnTrack,
  loadGoalSummaries,
} from "~/shared/goal-progress";
import { createOwnerAlignmentContext } from "~/shared/alignment";
import { ownerCalendarIso } from "~/shared/datetime";

import {
  FakeClock,
  countingDb,
  makeContext,
  makeDiaryRepository,
  makeGoalDetailsRepository,
  makeGoalMeasurementRepository,
  makeMeetingRepository,
  makeSpineRepository,
  makeTaskRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "test-default-workspace";
const HOSTILE = "recall04-hostile-workspace";
const OWNER = "owner-recall-04";
const SYDNEY = "Australia/Sydney";

/* Module-level, so ids stay unique across every test in the file. */
const nextEntityId = sequentialIds("r04e");
const nextActivityId = sequentialIds("r04a");
const nextDetailId = sequentialIds("r04d");

/**
 * The owner's day every fixture is written against.
 *
 * Fixed, and deliberately in the PAST relative to any real clock: the Meetings
 * `recent` view is `starts_at < now()` against the runtime clock, so a "today"
 * whose meetings have all already started has to be a real past day for the
 * read under test to be the read the product makes.
 */
const TODAY = "2026-08-31";
/** 19:00 in Sydney on that day — after every meeting the fixture seeds. */
const NOW = new Date("2026-08-31T09:00:00.000Z");

function scopeFor(db: D1Database = env.DB, ws = WS) {
  return bindWorkspaceRepositories(
    { DB: db },
    makeContext(ws),
    createActivityActorContext({ type: "user", id: OWNER }),
  );
}

function todayFacts() {
  return {
    now: NOW,
    timezone: SYDNEY,
    todayIso: TODAY,
    dateLong: "Monday 31 August 2026",
    hour: 19,
    ownerName: null,
    firstDayOfWeek: "monday" as const,
    dateFormat: "d_mmm_yyyy" as const,
  };
}

beforeEach(async () => {
  await resetTables([WS, HOSTILE]);
});

/* -------------------------------------------------------------------------- */
/* 1. The meetings-today fact (DEBT-233)                                       */
/* -------------------------------------------------------------------------- */

/** Seed one DalyHub Meeting at an instant, in the given workspace. */
async function seedMeeting(
  ws: string,
  title: string,
  startsAtIso: string,
): Promise<string> {
  const meetings = makeMeetingRepository(makeContext(ws), {
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  });
  const meeting = await meetings.create({
    title,
    startsAt: startsAtIso,
    timezone: SYDNEY,
  });
  return meeting.id;
}

describe("Today states the day's meetings, and says the same number the digest does", () => {
  /**
   * The DEBT-233 fixture, exactly as the roadmap specifies it: three Meetings
   * on the owner's today, ALL of them already started. This is the moment the
   * defect appears — `nextUp` has fallen through to tasks, the Schedule panel
   * still draws three rows, and before RECALL-04 nothing on the screen said the
   * day had held three meetings while the morning digest said so with times.
   */
  async function seedThreePastMeetings() {
    return [
      // 09:00, 12:00 and 15:00 Sydney on 2026-08-31 — all before NOW (19:00).
      await seedMeeting(WS, "Standup", "2026-08-30T23:00:00.000Z"),
      await seedMeeting(WS, "Design review", "2026-08-31T02:00:00.000Z"),
      await seedMeeting(WS, "One-to-one", "2026-08-31T05:00:00.000Z"),
    ];
  }

  it("agrees with the schedule and the digest as VALUES, with every meeting in the past", async () => {
    const ids = await seedThreePastMeetings();
    const scope = scopeFor();

    // (a) The schedule read itself.
    const window = await loadScheduleWindow(scope, {
      fromDateIso: TODAY,
      toDateIso: TODAY,
      timeZone: SYDNEY,
    });
    const schedule = scheduleForDate(window, {
      dateIso: TODAY,
      timeZone: SYDNEY,
      now: NOW,
      isToday: true,
    });

    // (b) Today's own payload, through the real loader.
    const day = await loadTodayDay(scope, todayFacts());

    // (c) The digest's facts, through the real notification read.
    const digest = await readDigestFacts(scope, {
      now: NOW,
      timeZone: SYDNEY,
      localDate: TODAY,
    });

    // Every meeting really is in the past — the state the fact must survive.
    expect(day.meetings.map((meeting) => meeting.upcoming)).toEqual([
      false,
      false,
      false,
    ]);
    expect([...day.meetings].map((meeting) => meeting.id).sort()).toEqual(
      [...ids].sort(),
    );

    // Four readings of one fact, compared as VALUES rather than as sentences.
    const stated = meetingsTodayFact(day.meetings);
    expect(schedule.count).toBe(3);
    expect(day.meetings.length).toBe(3);
    expect(stated?.count).toBe(3);
    expect(digest.events.length).toBe(3);
    expect(
      new Set([
        schedule.count,
        day.meetings.length,
        stated?.count,
        digest.events.length,
      ]).size,
    ).toBe(1);

    // The words the panel prints, from the one helper that owns them.
    expect(stated?.label).toBe("3 meetings today");
  });

  it("is falsified by deriving the fact from what is still UPCOMING", async () => {
    await seedThreePastMeetings();
    const day = await loadTodayDay(scopeFor(), todayFacts());

    /*
     * The rejected implementation, written out so the difference is a measured
     * number rather than an argument: a fact built from the meetings still
     * ahead states ZERO on exactly the day the owner wants to look back at.
     */
    const upcomingOnly = day.meetings.filter((meeting) => meeting.upcoming);
    expect(meetingsTodayFact(upcomingOnly)).toBeNull();
    expect(meetingsTodayFact(day.meetings)?.count).toBe(3);
  });

  it("keeps a hostile workspace's meetings out of the count", async () => {
    await seedThreePastMeetings();
    await seedMeeting(HOSTILE, "Not yours", "2026-08-31T03:00:00.000Z");

    const day = await loadTodayDay(scopeFor(), todayFacts());
    expect(meetingsTodayFact(day.meetings)?.count).toBe(3);
  });
});

/* -------------------------------------------------------------------------- */
/* 2. One measurement predicate, everywhere (DEBT-234)                         */
/* -------------------------------------------------------------------------- */

/** The Goal-seeding world, over the real repositories. */
function goalWorld(ws: string, start = "2026-01-05T00:00:00.000Z") {
  const clock = new FakeClock(start);
  const ctx = makeContext(ws);
  return {
    ctx,
    spine: makeSpineRepository(ctx, {
      clock: clock.now,
      idGenerator: nextEntityId,
      activityIdGenerator: nextActivityId,
    }),
    details: makeGoalDetailsRepository(ctx, {
      clock: clock.now,
      idGenerator: nextDetailId,
    }),
    measurements: makeGoalMeasurementRepository(ctx, {
      clock: clock.now,
      idGenerator: nextDetailId,
    }),
  };
}

type GoalWorld = ReturnType<typeof goalWorld>;

async function seedGoal(
  w: GoalWorld,
  areaId: string,
  spec: {
    readonly title: string;
    readonly measurement?: Parameters<
      typeof w.details.update
    >[1]["measurement"];
    readonly targetDate?: string | null;
    readonly readings?: readonly { value: number; measuredOn: string }[];
    readonly milestones?: readonly { title: string; completed: boolean }[];
    readonly completed?: boolean;
  },
) {
  const goal = await w.spine.createGoal({ title: spec.title, areaId });
  if (spec.measurement !== undefined || spec.targetDate !== undefined) {
    await w.details.update(goal.id, {
      ...(spec.measurement !== undefined
        ? { measurement: spec.measurement }
        : {}),
      ...(spec.targetDate !== undefined ? { targetDate: spec.targetDate } : {}),
    });
  }
  for (const reading of spec.readings ?? []) {
    await w.measurements.createMeasurement(goal.id, {
      value: reading.value,
      measuredOn: reading.measuredOn,
    });
  }
  for (const stage of spec.milestones ?? []) {
    const created = await w.measurements.createMilestone(goal.id, {
      title: stage.title,
    });
    if (stage.completed) {
      await w.measurements.updateMilestone(created.id, { completed: true });
    }
  }
  if (spec.completed) await w.spine.complete(goal.id);
  return goal.id;
}

/**
 * The measurement-status matrix the acceptance criteria name: on track, ahead,
 * achieved, off track (needs attention) and at risk (overdue), plus a Goal with
 * no measurement at all — the state that must never be swept in by a negation.
 *
 * Seeded through the real repositories, so the SQL derivation and the kernel
 * evaluator read the rows the product writes.
 */
async function seedMeasurementMatrix(ws: string) {
  const w = goalWorld(ws);
  const area = await w.spine.createArea({ title: "Health" });
  const ids = {
    unmeasured: await seedGoal(w, area.id, { title: "Unmeasured" }),
    onTrack: await seedGoal(w, area.id, {
      title: "On track",
      measurement: { type: "milestone" },
      targetDate: "2026-12-31",
      milestones: [
        { title: "One", completed: true },
        { title: "Two", completed: true },
        { title: "Three", completed: true },
        { title: "Four", completed: true },
        { title: "Five", completed: true },
        { title: "Six", completed: false },
        { title: "Seven", completed: false },
        { title: "Eight", completed: false },
      ],
    }),
    ahead: await seedGoal(w, area.id, {
      title: "Ahead",
      measurement: { type: "accumulation", targetValue: 100 },
      targetDate: "2026-12-31",
      readings: [{ value: 90, measuredOn: "2026-08-18" }],
    }),
    achieved: await seedGoal(w, area.id, {
      title: "Achieved",
      measurement: { type: "accumulation", targetValue: 10 },
      readings: [{ value: 10, measuredOn: "2026-08-18" }],
    }),
    needsAttention: await seedGoal(w, area.id, {
      title: "Needs attention",
      measurement: { type: "accumulation", targetValue: 100 },
      targetDate: "2026-09-30",
      readings: [{ value: 2, measuredOn: "2026-08-18" }],
    }),
    overdue: await seedGoal(w, area.id, {
      title: "Overdue",
      measurement: { type: "accumulation", targetValue: 40 },
      targetDate: "2026-08-01",
      readings: [{ value: 3, measuredOn: "2026-07-20" }],
    }),
  };
  return ids;
}

/**
 * The measurement status of every Goal in the workspace, from the KERNEL
 * evaluator over the rows the repositories hold — the expectation derived rather
 * than written down, which is the parity method the alignment and outcome
 * suites established.
 */
async function statusesFromEvaluator(
  ws = WS,
): Promise<Map<string, GoalProgressStatus>> {
  const scope = scopeFor(env.DB, ws);
  const all = await scope.goals.listGoals({ limit: 100 });
  const ids = all.items.map((goal) => goal.id);
  const [details, summaries, milestones] = await Promise.all([
    scope.goalDetails.listMany(ids),
    scope.goalMeasurements.listMeasurementSummaries(ids, {
      comparisonFromIso: "2026-01-01",
    }),
    scope.goalMeasurements.listMilestoneSummaries(ids),
  ]);
  return new Map(
    all.items.map((item) => {
      const detail: GoalDetailsRecord | undefined = details.get(item.id);
      return [
        item.id,
        evaluateGoalFromSummary({
          config: detail?.measurement ?? UNMEASURED_GOAL,
          targetDate: detail?.targetDate ?? null,
          summary: summaries.get(item.id) ?? null,
          milestones: milestones.get(item.id),
          startedOn: ownerCalendarIso(item.createdAt, SYDNEY),
          completed: item.completedAt !== null,
          todayIso: TODAY,
        }).status,
      ];
    }),
  );
}

describe("the measurement question has ONE predicate (DEBT-234)", () => {
  it("counts `achieved` — the decision this item took, stated once and used everywhere", () => {
    expect([...GOAL_MEASUREMENT_ON_TRACK_STATUSES]).toEqual([
      "on_track",
      "ahead",
      "achieved",
    ]);
  });

  it("gives Today's shared predicate and the `/goals` lens one answer for every status", () => {
    /*
     * The source-level half of the parity claim, over all NINE statuses rather
     * than over whichever ones a fixture happens to produce.
     *
     * `~/shared/goal-progress`'s `goalIsOnTrack` — the function Today's stat
     * card and its Goal panel count with — and `goalMatchesCollectionView`'s
     * `on_track` lens are one declaration with two names. Fork either (give
     * Today a local `status === "on_track" || status === "ahead"`, say, which is
     * what `/goals`' SQL used to carry) and this loop names the status they
     * disagree about.
     */
    for (const status of Object.keys(
      GOAL_PROGRESS_STATUS_LABELS,
    ) as GoalProgressStatus[]) {
      expect(goalIsOnTrack(status)).toBe(
        goalMatchesCollectionView("on_track", { completed: false, status }),
      );
    }
    // And a completed Goal is in no status lens, whatever it last read.
    for (const status of GOAL_MEASUREMENT_ON_TRACK_STATUSES) {
      expect(
        goalMatchesCollectionView("on_track", { completed: true, status }),
      ).toBe(false);
    }
  });

  it("gives the `/goals` lens, its count and the pure predicate one answer per Goal", async () => {
    const ids = await seedMeasurementMatrix(WS);
    const scope = scopeFor();
    const statuses = await statusesFromEvaluator();

    // The fixture really did produce the five statuses it claims to.
    expect(statuses.get(ids.onTrack)).toBe("on_track");
    expect(statuses.get(ids.ahead)).toBe("ahead");
    expect(statuses.get(ids.achieved)).toBe("achieved");
    expect(statuses.get(ids.needsAttention)).toBe("needs_attention");
    expect(statuses.get(ids.overdue)).toBe("overdue");
    expect(statuses.get(ids.unmeasured)).toBe("not_measured");

    // The lens, filtered IN SQL.
    const lens = await scope.goals.listGoalsByOutcome({
      todayIso: TODAY,
      timeZone: SYDNEY,
      calendarIsoOf: (instant: Date) => ownerCalendarIso(instant, SYDNEY),
      view: "on_track",
      limit: 50,
    });
    const lensIds = new Set(lens.items.map((item) => item.id));

    // Value-for-value against the pure kernel predicate, over every Goal.
    for (const [id, status] of statuses) {
      expect(lensIds.has(id)).toBe(
        goalMatchesCollectionView("on_track", { completed: false, status }),
      );
    }

    // `achieved` is IN — the clause that used to differ.
    expect(lensIds.has(ids.achieved)).toBe(true);
    // The absences are OUT — the predicate is not a negation of "needs attention".
    expect(lensIds.has(ids.unmeasured)).toBe(false);
    expect(lensIds.has(ids.needsAttention)).toBe(false);
    expect(lensIds.has(ids.overdue)).toBe(false);

    // And the workspace-true COUNT agrees with the set it describes.
    const counts = await scope.goals.countGoalsByOutcomeLens({
      todayIso: TODAY,
      calendarIsoOf: (instant: Date) => ownerCalendarIso(instant, SYDNEY),
    });
    expect(counts.on_track).toBe(lensIds.size);
    expect(counts.on_track).toBe(3);
  });

  it("classifies the SAME Goals the same way on Today and on /goals", async () => {
    /*
     * FOUR measured Goals plus one unmeasured, so every Goal that Today's panel
     * can carry is on Today's page (its cap is four) and the comparison below
     * reaches ALL of them — `achieved` included, which is the status the two
     * surfaces used to disagree about. A fixture larger than the cap would let
     * the one contested Goal fall off Today's page and the parity assertion
     * would pass without ever having compared it.
     */
    const w = goalWorld(WS);
    const area = await w.spine.createArea({ title: "Health" });
    const seeded = {
      onTrack: await seedGoal(w, area.id, {
        title: "On track",
        measurement: { type: "milestone" },
        targetDate: "2026-12-31",
        milestones: [
          { title: "One", completed: true },
          { title: "Two", completed: true },
          { title: "Three", completed: true },
          { title: "Four", completed: true },
          { title: "Five", completed: true },
          { title: "Six", completed: false },
          { title: "Seven", completed: false },
          { title: "Eight", completed: false },
        ],
      }),
      ahead: await seedGoal(w, area.id, {
        title: "Ahead",
        measurement: { type: "accumulation", targetValue: 100 },
        targetDate: "2026-12-31",
        readings: [{ value: 90, measuredOn: "2026-08-18" }],
      }),
      achieved: await seedGoal(w, area.id, {
        title: "Achieved",
        measurement: { type: "accumulation", targetValue: 10 },
        readings: [{ value: 10, measuredOn: "2026-08-18" }],
      }),
      overdue: await seedGoal(w, area.id, {
        title: "Overdue",
        measurement: { type: "accumulation", targetValue: 40 },
        targetDate: "2026-08-01",
        readings: [{ value: 3, measuredOn: "2026-07-20" }],
      }),
      unmeasured: await seedGoal(w, area.id, { title: "Unmeasured" }),
    };
    const scope = scopeFor();
    const { recentBoundaryStartIso } = createOwnerAlignmentContext(NOW, SYDNEY);

    // Today's own read, through the shared summary load its loader calls.
    const today = await loadGoalSummaries(scope, {
      now: NOW,
      timezone: SYDNEY,
      todayIso: TODAY,
      recentBoundaryStartIso,
    });

    const collectionStatuses = await statusesFromEvaluator();
    const lens = await scope.goals.listGoalsByOutcome({
      todayIso: TODAY,
      timeZone: SYDNEY,
      calendarIsoOf: (instant: Date) => ownerCalendarIso(instant, SYDNEY),
      view: "on_track",
      limit: 50,
    });
    const lensIds = new Set(lens.items.map((item) => item.id));

    /*
     * The parity assertion, per Goal, as VALUES: for every Goal Today read, the
     * status Today derived equals the status `/goals` derived in SQL, and
     * Today's on-track membership equals `/goals`' lens membership.
     *
     * Falsification: give either surface a different predicate — drop
     * `achieved` from the SQL list, or give Today its own local set — and this
     * loop names the Goal they disagree about.
     */
    // Every measured Goal really is on Today's page, so nothing is compared by
    // being absent.
    const todayIds = new Set(today.items.map((goal) => goal.id));
    for (const id of [
      seeded.onTrack,
      seeded.ahead,
      seeded.achieved,
      seeded.overdue,
    ]) {
      expect(todayIds.has(id)).toBe(true);
    }
    expect(todayIds.has(seeded.unmeasured)).toBe(false);

    expect(today.items.length).toBe(4);
    for (const goal of today.items) {
      expect(goal.progress.status).toBe(collectionStatuses.get(goal.id));
      expect(
        goalMatchesCollectionView("on_track", {
          completed: false,
          status: goal.progress.status,
        }),
      ).toBe(lensIds.has(goal.id));
    }

    // The three that go well are on track on BOTH surfaces; the overdue one on
    // neither. Stated as values, not as a loop that could pass while empty.
    expect([...lensIds].sort()).toEqual(
      [seeded.onTrack, seeded.ahead, seeded.achieved].sort(),
    );
  });
});

/* -------------------------------------------------------------------------- */
/* 3. A bounded population says which set it describes (DEBT-234)              */
/* -------------------------------------------------------------------------- */

describe("Today's Goal figures state their bound", () => {
  it("says nothing about a bound when the read saw the whole workspace", async () => {
    const w = goalWorld(WS);
    const area = await w.spine.createArea({ title: "Health" });
    await seedGoal(w, area.id, {
      title: "Only one",
      measurement: { type: "accumulation", targetValue: 100 },
      targetDate: "2026-12-31",
      readings: [{ value: 90, measuredOn: "2026-08-18" }],
    });

    const { recentBoundaryStartIso } = createOwnerAlignmentContext(NOW, SYDNEY);
    const page = await loadGoalSummaries(scopeFor(), {
      now: NOW,
      timezone: SYDNEY,
      todayIso: TODAY,
      recentBoundaryStartIso,
    });
    expect(page.bounded).toBe(false);

    const card = todayMeasures({
      trend: null,
      goals: page.items,
      goalsBounded: page.bounded,
    }).find((measure) => measure.id === "goals");
    expect(card?.note).toBe("of 1 measurable goal");
    expect(card?.note).not.toContain("shown here");
  });

  it("says which set the figures describe once the read is capped", async () => {
    // Five measured Goals with readings; the panel shows four.
    await seedMeasurementMatrix(WS);

    const { recentBoundaryStartIso } = createOwnerAlignmentContext(NOW, SYDNEY);
    const page = await loadGoalSummaries(scopeFor(), {
      now: NOW,
      timezone: SYDNEY,
      todayIso: TODAY,
      recentBoundaryStartIso,
    });
    expect(page.items.length).toBe(4);
    expect(page.bounded).toBe(true);

    const card = todayMeasures({
      trend: null,
      goals: page.items,
      goalsBounded: page.bounded,
    }).find((measure) => measure.id === "goals");
    /*
     * The claim the card used to make — "N of 4 measurable goals" beside the
     * label "Goals on track" — read as a workspace total over a sample chosen
     * attention-first. It now names its own set, the way Analytics has always
     * named the set behind its bounded Goal tile.
     */
    expect(card?.note).toBe("of the 4 measurable goals shown here");
    expect(card?.chart).toMatchObject({ kind: "meter" });
  });
});

/* -------------------------------------------------------------------------- */
/* 4. A Project with no health evidence (DEBT-234)                             */
/* -------------------------------------------------------------------------- */

describe("a Project with no health facts is unavailable, and stays that way", () => {
  it("reports the absence rather than the most flattering state", () => {
    const fact = projectStateFact({
      id: "project-1",
      title: "Kitchen renovation",
      health: null,
      tasksCompletedInPeriod: 0,
      completedInPeriod: false,
    });
    expect(fact.healthState).toBeNull();
    expect(fact.healthLabel).toBe(PROJECT_HEALTH_UNAVAILABLE_LABEL);
    // Falsification: restoring `health?.state ?? "on_track"` makes both of
    // these read as a measured, healthy Project.
    expect(fact.healthState).not.toBe("on_track");
  });

  it("stores the absence through real D1 and reads it back as an absence", async () => {
    const scope = scopeFor();
    const period = currentReviewPeriod("weekly", TODAY, "monday");
    const created = await scope.reviews.create({
      type: "weekly",
      periodStart: period.start,
      periodEnd: period.end,
      templateId: reviewTemplateId("weekly"),
    });

    const facts = {
      window: {
        periodStart: period.start,
        periodEnd: period.end,
        startsAt: new Date(`${period.start}T00:00:00.000Z`),
        endsAt: new Date(`${period.end}T23:59:59.000Z`),
      },
      history: {
        completions: {
          tasksCompleted: 0,
          projectsCompleted: 0,
          goalsCompleted: 0,
        },
        contributions: [],
        contributionsBounded: false,
        available: true,
      },
      state: {
        projects: [
          projectStateFact({
            id: "project-no-health",
            title: "No evidence",
            health: null,
            tasksCompletedInPeriod: 0,
            completedInPeriod: false,
          }),
        ],
        projectsBounded: false,
        goals: [],
        goalsBounded: false,
        areas: [],
        areasBounded: false,
        carryOver: [],
        carryOverOverdue: { value: 0, bounded: false, available: true },
        carryOverWaiting: { value: 0, bounded: false, available: true },
        available: true,
      },
      planAccount: {
        available: false,
        planned: 0,
        completed: 0,
        movedOut: 0,
        stillOpen: 0,
        addedAfterPlanning: 0,
      },
      habits: {
        available: false,
        scheduled: 0,
        completed: 0,
        windowStart: period.start,
        windowEnd: period.end,
      },
    } as unknown as ReviewInsightFacts;

    const snapshot = buildReviewInsightSnapshot(facts, () => "none");
    expect(snapshot.projects[0]?.health).toBeNull();

    // Through the real table, not merely through the builder.
    expect(
      await scope.reviewInsights.saveSnapshot(created.review.id, snapshot),
    ).toBe(true);
    const stored = await scope.reviewInsights.getSnapshot(created.review.id);
    expect(stored?.snapshot.projects[0]?.health).toBeNull();

    // And through the serialiser/parser pair the storage layer uses.
    const round = parseReviewInsightSnapshot(
      serializeReviewInsightSnapshot(snapshot),
    );
    expect(round?.projects).toEqual([
      {
        id: "project-no-health",
        health: null,
        openTasks: 0,
        overdueTasks: 0,
      },
    ]);
  });

  it("manufactures no transition between two absent readings", () => {
    /*
     * The whole point of DEBT-234's second half. With the old `"on_track"`
     * default both sides of this comparison are a state, so a Project that
     * merely BECAME readable — or stopped being readable — was announced as
     * having improved or deteriorated. Restore the default and each of these
     * four flips to a transition.
     */
    expect(classifyProjectHealthChange(null, null)).toBe("unknown");
    expect(classifyProjectHealthChange(null, "at_risk")).toBe("unknown");
    expect(classifyProjectHealthChange("at_risk", null)).toBe("unknown");
    // A Project that was not in the previous snapshot at all is still "new".
    expect(classifyProjectHealthChange(undefined, "at_risk")).toBe("new");
  });
});

/* -------------------------------------------------------------------------- */
/* 5. The Review period tells the period's truth (DEBT-235)                    */
/* -------------------------------------------------------------------------- */

/** A Review period that deliberately CROSSES a month boundary. */
const PERIOD_START = "2026-08-24";
const PERIOD_END = "2026-09-06";
/** The owner's day the Review is read ON — well after the period closed. */
const REVIEW_TODAY = "2026-09-20";

function taskRepoAt(ws: string, at: string) {
  return makeTaskRepository(makeContext(ws), {
    clock: new FakeClock(at).now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  });
}

async function completeAt(
  ws: string,
  areaId: string,
  title: string,
  createdAt: string,
  completedAt: string,
  priority?: "p1",
): Promise<string> {
  const task = await taskRepoAt(ws, createdAt).createTask({
    title,
    parent: { kind: "area", id: areaId },
    ...(priority ? { priority } : {}),
  });
  await taskRepoAt(ws, completedAt).completeTask(task.id);
  return task.id;
}

/**
 * The DEBT-235 fixture, exactly as the acceptance criteria specify it: a Review
 * across a month boundary with 60+ completions INSIDE the period, completions
 * before it, completions after it, and one completed inside it and edited long
 * afterwards.
 */
async function seedPeriodCompletions() {
  const spine = makeSpineRepository(makeContext(WS), {
    clock: new FakeClock("2026-08-01T00:00:00.000Z").now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  });
  const area = await spine.createArea({ title: "Work" });

  const inside: { id: string; completedAt: string }[] = [];
  for (let index = 0; index < 60; index += 1) {
    const completedAt = new Date(
      Date.parse("2026-08-25T00:00:00.000Z") + index * 3_600_000,
    ).toISOString();
    inside.push({
      id: await completeAt(
        WS,
        area.id,
        `Inside ${index}`,
        "2026-08-24T00:00:00.000Z",
        completedAt,
      ),
      completedAt,
    });
  }

  /*
   * Completed INSIDE the period, then retitled a week after it closed. Under an
   * `updated` order it would lead the list; under the completion authority it
   * sits exactly where its completion puts it.
   */
  const editedLater = await completeAt(
    WS,
    area.id,
    "Edited later",
    "2026-08-24T00:00:00.000Z",
    "2026-09-05T01:00:00.000Z",
  );
  await taskRepoAt(WS, "2026-09-15T00:00:00.000Z").updateTask(editedLater, {
    title: "Edited later — retitled after the period closed",
  });
  inside.push({ id: editedLater, completedAt: "2026-09-05T01:00:00.000Z" });

  const lastInPeriod = await completeAt(
    WS,
    area.id,
    "Last in period",
    "2026-08-24T00:00:00.000Z",
    "2026-09-05T02:00:00.000Z",
  );
  inside.push({ id: lastInPeriod, completedAt: "2026-09-05T02:00:00.000Z" });

  /*
   * Out of period, and deliberately P1 — so the `smart` order the old read fell
   * back to ranks them FIRST and the falsification below is a measured fact
   * rather than an argument.
   */
  const before = await completeAt(
    WS,
    area.id,
    "Before the period",
    "2026-08-01T00:00:00.000Z",
    "2026-08-23T01:00:00.000Z",
    "p1",
  );
  const after = await completeAt(
    WS,
    area.id,
    "After the period",
    "2026-08-01T00:00:00.000Z",
    "2026-09-07T01:00:00.000Z",
    "p1",
  );

  return { area, inside, editedLater, lastInPeriod, before, after };
}

function periodContext(ws = WS, db: D1Database = env.DB) {
  return loadReviewPeriodContext(scopeFor(db, ws), {
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    today: REVIEW_TODAY,
    timezone: SYDNEY,
  });
}

describe("the Review period's completed Tasks are the period's (DEBT-235)", () => {
  it("returns only in-period completions, in completion order, bounded after the filter", async () => {
    const seeded = await seedPeriodCompletions();
    const context = await periodContext();

    const insideIds = new Set(seeded.inside.map((entry) => entry.id));
    const returned = context.completedTasks.items.map((item) => item.id);

    // The bound is applied AFTER the period predicate: 62 in-period completions
    // exist and exactly the contract's 50 come back, all of them in-period.
    expect(seeded.inside.length).toBe(62);
    expect(returned.length).toBe(REVIEW_PERIOD_CONTEXT_LIMIT);
    for (const id of returned) expect(insideIds.has(id)).toBe(true);
    expect(returned).not.toContain(seeded.before);
    expect(returned).not.toContain(seeded.after);

    // And it SAYS it truncated.
    expect(context.completedTasks.bounded).toBe(true);

    // The order is completion time, most recent first — and the row edited a
    // week after the period closed did not move.
    expect(returned[0]).toBe(seeded.lastInPeriod);
    expect(returned[1]).toBe(seeded.editedLater);

    const expectedOrder = [...seeded.inside]
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
      .slice(0, REVIEW_PERIOD_CONTEXT_LIMIT)
      .map((entry) => entry.id);
    expect(returned).toEqual(expectedOrder);
  });

  it("is falsified by the history-wide, priority-ordered read it replaced", async () => {
    const seeded = await seedPeriodCompletions();

    /*
     * The read this file replaced, written out: the `completed` view at
     * `limit: 50` with no sort (so `smart`, which is priority-then-due over the
     * whole of history) and no window. Its first rows are the out-of-period P1
     * completions — which the old JS filter then threw away, spending slots the
     * period's own work needed.
     */
    const oldRead = await scopeFor().tasks.listWorkspaceTasks({
      view: "completed",
      limit: REVIEW_PERIOD_CONTEXT_LIMIT,
      todayIso: REVIEW_TODAY,
      timezone: SYDNEY,
    });
    const oldIds = oldRead.items.map((item) => item.id);
    expect(oldIds.slice(0, 2).sort()).toEqual(
      [seeded.before, seeded.after].sort(),
    );

    // The new read contains neither, because the period predicate ran in SQL.
    const context = await periodContext();
    const ids = new Set(context.completedTasks.items.map((item) => item.id));
    expect(ids.has(seeded.before)).toBe(false);
    expect(ids.has(seeded.after)).toBe(false);
  });

  it("says nothing about a bound when the period fits inside it", async () => {
    const spine = makeSpineRepository(makeContext(WS), {
      clock: new FakeClock("2026-08-01T00:00:00.000Z").now,
      idGenerator: nextEntityId,
      activityIdGenerator: nextActivityId,
    });
    const area = await spine.createArea({ title: "Work" });
    await completeAt(
      WS,
      area.id,
      "Only one",
      "2026-08-24T00:00:00.000Z",
      "2026-08-25T01:00:00.000Z",
    );
    const context = await periodContext();
    expect(context.completedTasks.items).toHaveLength(1);
    expect(context.completedTasks.bounded).toBe(false);
  });
});

describe("Diary and Meeting period reads stop at the owner's day boundary", () => {
  /**
   * Sydney is UTC+10 through this window, so the period runs from
   * 2026-08-23T14:00Z to 2026-09-06T14:00Z. Each pair below straddles one of
   * those two instants by thirty minutes — the resolution a JS filter over a
   * history-wide page could never be trusted at.
   */
  const JUST_BEFORE = "2026-08-23T13:00:00.000Z"; // 23 Aug 23:00 Sydney
  const FIRST_MOMENT = "2026-08-23T14:30:00.000Z"; // 24 Aug 00:30 Sydney
  const LAST_MOMENT = "2026-09-06T13:30:00.000Z"; // 6 Sep 23:30 Sydney
  const JUST_AFTER = "2026-09-06T14:30:00.000Z"; // 7 Sep 00:30 Sydney

  it("returns the in-period Diary entries and no others", async () => {
    const diary = makeDiaryRepository(makeContext(WS), {
      idGenerator: nextEntityId,
      activityIdGenerator: nextActivityId,
    });
    const seeded: Record<string, string> = {};
    for (const [name, at] of Object.entries({
      justBefore: JUST_BEFORE,
      firstMoment: FIRST_MOMENT,
      lastMoment: LAST_MOMENT,
      justAfter: JUST_AFTER,
    })) {
      const entry = await diary.create({
        entryType: "note",
        title: `Diary ${name}`,
        occurredAt: new Date(at),
        timezone: SYDNEY,
      });
      seeded[name] = entry.id;
    }

    const context = await periodContext();
    const ids = context.diaryEntries.items.map((item) => item.id);
    expect([...ids].sort()).toEqual(
      [seeded.firstMoment!, seeded.lastMoment!].sort(),
    );
    expect(context.diaryEntries.bounded).toBe(false);
  });

  it("returns the in-period Meetings and no others", async () => {
    const seeded = {
      justBefore: await seedMeeting(WS, "Meeting just before", JUST_BEFORE),
      firstMoment: await seedMeeting(WS, "Meeting first moment", FIRST_MOMENT),
      lastMoment: await seedMeeting(WS, "Meeting last moment", LAST_MOMENT),
      justAfter: await seedMeeting(WS, "Meeting just after", JUST_AFTER),
    };

    const context = await periodContext();
    expect(context.meetings.items.map((item) => item.id)).toEqual([
      seeded.firstMoment,
      seeded.lastMoment,
    ]);
    expect(context.meetings.bounded).toBe(false);
  });

  it("keeps a hostile workspace's records out of every period list", async () => {
    await seedMeeting(HOSTILE, "Not yours", FIRST_MOMENT);
    const hostileDiary = makeDiaryRepository(makeContext(HOSTILE), {
      idGenerator: nextEntityId,
      activityIdGenerator: nextActivityId,
    });
    await hostileDiary.create({
      entryType: "note",
      title: "Not yours",
      occurredAt: new Date(FIRST_MOMENT),
      timezone: SYDNEY,
    });

    const context = await periodContext();
    expect(context.meetings.items).toEqual([]);
    expect(context.diaryEntries.items).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* 6. Cost                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * What the Review's period context costs.
 *
 * FOUR lists, FOUR statements — one bounded, workspace-scoped, period-scoped
 * read each. The file this replaced made FIVE (it read the Meetings collection
 * twice, `recent` and `upcoming`, to reach a window neither view is anchored to)
 * and then filtered three of the five in JavaScript. So the period truth costs
 * one statement fewer than the untruth did.
 *
 * Pinned absolutely, because the failure modes this item exists to prevent all
 * show up here: a per-record read, a second Meetings query, or a JS filter that
 * needs a wider page to be trusted.
 */
const PERIOD_CONTEXT_STATEMENT_BUDGET = 4;

describe("the cost is pinned", () => {
  /**
   * RECALL-04's Part 1 and Part 2 performance contract, asserted the only way it
   * can honestly be asserted from inside one build: **neither new fact changes
   * what Today costs, and neither is per-record.**
   *
   * The absolute figure belongs to `today-review-door.test.ts` and is a figure
   * for an EMPTY workspace; a workspace with content costs more, because the
   * grouped reads behind the Goal panel and the Meetings page only run when
   * there is something to group. Measured here on this file's own fixtures:
   * **22** statements empty, **23** with a schedule (the Meetings collection's
   * one grouped items read, DEBT-65's, which existed long before this item), and
   * 23 for one meeting, three meetings or the whole Goal matrix.
   *
   * So the claim is the differential one, and it is the one that would catch the
   * mistakes this item could make: the day's meetings fact costs nothing per
   * meeting, and the Goal bound costs nothing per Goal. A schedule query for the
   * count, a count statement for the bound, or a per-Goal read all fail this.
   */
  it("adds no statement per meeting and none per Goal", async () => {
    const counting = countingDb(env.DB);
    const measure = async () => {
      counting.reset();
      const day = await loadTodayDay(scopeFor(counting.db), todayFacts());
      return { day, count: counting.prepareCount() };
    };

    // One measured Goal and one meeting: the shape both facts are present in at
    // their smallest.
    const w = goalWorld(WS);
    const area = await w.spine.createArea({ title: "Health" });
    await seedGoal(w, area.id, {
      title: "Only one",
      measurement: { type: "accumulation", targetValue: 100 },
      targetDate: "2026-12-31",
      readings: [{ value: 90, measuredOn: "2026-08-18" }],
    });
    await seedMeeting(WS, "Standup", "2026-08-30T23:00:00.000Z");
    const base = await measure();
    expect(meetingsTodayFact(base.day.meetings)?.count).toBe(1);
    expect(base.day.goalsBounded).toBe(false);

    // Two more meetings on the day. The fact grows; the cost does not.
    await seedMeeting(WS, "Design review", "2026-08-31T02:00:00.000Z");
    await seedMeeting(WS, "One-to-one", "2026-08-31T05:00:00.000Z");
    const withMeetings = await measure();
    expect(meetingsTodayFact(withMeetings.day.meetings)?.count).toBe(3);
    expect(withMeetings.count).toBe(base.count);

    // Five more measured Goals, past the panel's cap. The bound appears; the
    // cost does not move — the read is grouped, never one query per Goal.
    await seedMeasurementMatrix(WS);
    const withGoals = await measure();
    expect(withGoals.day.goalsBounded).toBe(true);
    expect(withGoals.day.goals.length).toBe(4);
    expect(withGoals.count).toBe(base.count);
  });

  it("spends one bounded, period-scoped read per period list", async () => {
    await seedPeriodCompletions();
    await seedMeeting(WS, "In period", "2026-09-01T01:00:00.000Z");

    const counting = countingDb(env.DB);
    counting.reset();
    const context = await periodContext(WS, counting.db);
    expect(counting.prepareCount()).toBe(PERIOD_CONTEXT_STATEMENT_BUDGET);

    // Every list is bounded by the contract, never by what JavaScript kept.
    for (const list of [
      context.completedTasks,
      context.openNowTasks,
      context.diaryEntries,
      context.meetings,
    ]) {
      expect(list.items.length).toBeLessThanOrEqual(
        REVIEW_PERIOD_CONTEXT_LIMIT,
      );
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 7. The week-account decision (part 4)                                       */
/* -------------------------------------------------------------------------- */

describe("Today remains the DOOR to the week's account, and not a second one", () => {
  /**
   * RECALL-04 part 4, recorded as a test rather than only as prose.
   *
   * The decision: **the door is enough.** STEER-05 made Today's week-boundary
   * surface strictly a door by design; `/plan` holds the completed-week account
   * at its foot and its own header records why it is not a dashboard; the Review
   * holds the ritual. A fourth statement of the same account on Today would be a
   * duplicate the owner has to reconcile.
   *
   * Asserted as the intended composition — the door is present, complete and
   * pointing at the ritual — rather than as a brittle "no component named X may
   * ever exist". What would fail this: a week-account field appearing on Today's
   * payload, or the door losing the link that makes the account reachable.
   */
  it("offers the ritual and states no account of its own", async () => {
    const day = await loadTodayDay(scopeFor(), todayFacts());

    expect(day.reviewDoor.state).toBe("start");
    expect(day.reviewDoor.href).toBe("/reviews/new");
    expect(day.reviewDoor.periodStart).toBe("2026-08-31");
    expect(day.reviewDoor.periodEnd).toBe("2026-09-06");

    /*
     * The payload carries the day's facts and the door — and no account of the
     * completed week. `/plan` and the Review own that, and each of these keys
     * appearing here would be the duplicate the decision refuses.
     */
    for (const key of [
      "weekAccount",
      "weekSummary",
      "completedWeek",
      "planAccount",
    ]) {
      expect(Object.hasOwn(day, key)).toBe(false);
    }
  });
});
