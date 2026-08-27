/**
 * STEER-01 — the `/goals` OUTCOME order, its lens filter and its workspace-true
 * counts, over real D1 in the Workers runtime.
 *
 * Three things are proven here, and each is a rule the surface would otherwise
 * be free to break quietly:
 *
 *  1. **PARITY.** The SQL rank and the pure kernel comparator cannot disagree.
 *     The suite drives BOTH over the same seeded fact matrix — every GOAL-02
 *     status plus explicit completion — and asserts identical orders. This is
 *     the `GOAL_ALIGNMENT_DISPLAY_RANK` precedent DEBT-120 asks for: the
 *     product rule lives in `GOAL_OUTCOME_DISPLAY_RANK`, and the database can
 *     never quietly grow a second one.
 *  2. **THE ORDER IS WORKSPACE-WIDE, BEFORE PAGINATION.** A Goal needing
 *     attention that was CREATED last is never stranded on page two behind
 *     healthy Goals — asserted over a workspace of more than one page, with
 *     the cursor round-tripping without a duplicate or a gap.
 *  3. **THE COUNTS AND THE LENSES ARE WORKSPACE-TRUE** (DEBT-121). Every lens
 *     count equals the number of Goals that lens actually returns across ALL
 *     its pages — asserted on a two-page workspace, which is exactly the case
 *     a page-local implementation passes on a one-page one.
 *
 * The fact matrix is seeded through the real repositories (spine, details,
 * measurements, milestones), never by writing SQL, so a change to how a
 * measurement is stored fails here too.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";

import {
  GOAL_COLLECTION_VIEWS,
  UNMEASURED_GOAL,
  evaluateGoalProgress,
  goalMatchesCollectionView,
  goalOutcomeDisplayRank,
  type GoalCollectionView,
  type GoalDetailsRecord,
} from "~/kernel/goals";
import { evaluateGoalFromSummary } from "~/shared/goal-progress";
import { ownerCalendarIso } from "~/shared/datetime";

import {
  FakeClock,
  countingDb,
  makeContext,
  makeGoalDetailsRepository,
  makeGoalMeasurementRepository,
  makeGoalRepository,
  makeSpineRepository,
  resetTables,
  sequentialIds,
} from "./support";
import { createGoalRepository } from "~/platform/storage/d1";

const WS = "test-default-workspace";
const OTHER = "ws_goal_outcome_other";
const SYDNEY = "Australia/Sydney";
/** The owner's day every assertion is made against. */
const TODAY = "2026-08-20";

function world(ws: string, start = "2026-01-05T00:00:00.000Z") {
  const clock = new FakeClock(start);
  const ctx = makeContext(ws);
  return {
    clock,
    ctx,
    spine: makeSpineRepository(ctx, {
      clock: clock.now,
      idGenerator: sequentialIds(`${ws}-e`),
      activityIdGenerator: sequentialIds(`${ws}-a`),
    }),
    goals: makeGoalRepository(ctx),
    details: makeGoalDetailsRepository(ctx, {
      clock: clock.now,
      idGenerator: sequentialIds(`${ws}-gd`),
    }),
    measurements: makeGoalMeasurementRepository(ctx, {
      clock: clock.now,
      idGenerator: sequentialIds(`${ws}-gm`),
    }),
  };
}

type World = ReturnType<typeof world>;

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

/** The outcome read's context: the owner's day and calendar conversion. */
function outcomeInput(view?: GoalCollectionView) {
  return {
    todayIso: TODAY,
    timeZone: SYDNEY,
    calendarIsoOf: (instant: Date) => ownerCalendarIso(instant, SYDNEY),
    ...(view ? { view } : {}),
  };
}

async function seedArea(w: World, title = "Area") {
  return w.spine.createArea({ title });
}

/**
 * Seed one Goal with a complete measurement fact set.
 *
 * Everything is written through the real repositories, so the SQL derivation
 * and the kernel evaluator read the same rows the product writes.
 */
async function seedGoal(
  w: World,
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
    readonly condition?: "set_aside" | null;
  },
) {
  const goal = await w.spine.createGoal({ title: spec.title, areaId });
  if (
    spec.measurement !== undefined ||
    spec.targetDate !== undefined ||
    spec.condition !== undefined
  ) {
    await w.details.update(goal.id, {
      ...(spec.measurement !== undefined
        ? { measurement: spec.measurement }
        : {}),
      ...(spec.targetDate !== undefined ? { targetDate: spec.targetDate } : {}),
      ...(spec.condition !== undefined ? { condition: spec.condition } : {}),
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
  return goal;
}

/**
 * The whole GOAL-02 status matrix, seeded in a DELIBERATELY inconvenient
 * creation order: the Goals that must LEAD are created LAST, so a read that
 * fell back to creation order (or sorted only the loaded page) fails.
 */
async function seedMatrix(w: World) {
  const area = await seedArea(w, "Health");
  const seeded: Record<string, string> = {};

  // not_measured — no configuration at all.
  seeded.unmeasured = (
    await seedGoal(w, area.id, { title: "Unmeasured" })
  ).id;

  // not_started — configured, nothing recorded.
  seeded.notStarted = (
    await seedGoal(w, area.id, {
      title: "Not started",
      measurement: { type: "accumulation", targetValue: 24 },
    })
  ).id;

  // achieved — the target has been reached.
  seeded.achieved = (
    await seedGoal(w, area.id, {
      title: "Achieved",
      measurement: { type: "accumulation", targetValue: 10 },
      readings: [{ value: 10, measuredOn: "2026-08-18" }],
    })
  ).id;

  // in_progress — moving, with no target date to compare against.
  seeded.inProgress = (
    await seedGoal(w, area.id, {
      title: "In progress",
      measurement: { type: "accumulation", targetValue: 20 },
      readings: [{ value: 8, measuredOn: "2026-08-18" }],
    })
  ).id;

  // ahead — well past the straight line to a distant target date.
  seeded.ahead = (
    await seedGoal(w, area.id, {
      title: "Ahead",
      measurement: { type: "accumulation", targetValue: 100 },
      targetDate: "2026-12-31",
      readings: [{ value: 90, measuredOn: "2026-08-18" }],
    })
  ).id;

  /*
   * on_track — level with that line. Created 2026-01-05 against a 2026-12-31
   * date, so by 2026-08-20 about 63% of the schedule has elapsed; five of
   * eight equal stages is 62.5%, comfortably inside GOAL-02's ±10-point
   * margin and outside "ahead". Eight stages rather than four because four
   * cannot express a fraction that close to the line.
   */
  seeded.onTrack = (
    await seedGoal(w, area.id, {
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
    })
  ).id;

  // stale — a reading, but nothing for well over a month.
  seeded.stale = (
    await seedGoal(w, area.id, {
      title: "Stale",
      measurement: { type: "accumulation", targetValue: 50 },
      readings: [{ value: 5, measuredOn: "2026-05-01" }],
    })
  ).id;

  // completed — the spine's explicit completion, last whatever it reads.
  seeded.completed = (
    await seedGoal(w, area.id, {
      title: "Completed",
      measurement: { type: "accumulation", targetValue: 40 },
      targetDate: "2026-01-31",
      readings: [{ value: 1, measuredOn: "2026-01-10" }],
      completed: true,
    })
  ).id;

  // needs_attention — behind its own schedule. Created SECOND-LAST.
  seeded.needsAttention = (
    await seedGoal(w, area.id, {
      title: "Needs attention",
      measurement: { type: "accumulation", targetValue: 100 },
      targetDate: "2026-09-30",
      readings: [{ value: 2, measuredOn: "2026-08-18" }],
    })
  ).id;

  // overdue — its own date has passed. Created LAST, and it must LEAD.
  seeded.overdue = (
    await seedGoal(w, area.id, {
      title: "Overdue",
      measurement: { type: "accumulation", targetValue: 30 },
      targetDate: "2026-08-01",
      readings: [{ value: 3, measuredOn: "2026-07-20" }],
    })
  ).id;

  return { area, seeded };
}

/**
 * The independently-computed expected order: every Goal evaluated by the PURE
 * kernel evaluator over the SAME reads the collection composes, ranked by
 * `goalOutcomeDisplayRank` then `(createdAt, id)`.
 *
 * This is the parity method the alignment suite established — the expectation
 * is DERIVED from the kernel rather than written down, so a change to the
 * product rule moves both sides together and a change to only one fails.
 */
async function evaluatorOrder(
  w: World,
  view: GoalCollectionView = "all",
): Promise<{ id: string; status: string; rank: number }[]> {
  const all = await w.goals.listGoals({ limit: 100 });
  const ids = all.items.map((goal) => goal.id);
  const [details, summaries, milestones] = await Promise.all([
    w.details.listMany(ids),
    w.measurements.listMeasurementSummaries(ids, {
      comparisonFromIso: "2026-01-01",
    }),
    w.measurements.listMilestoneSummaries(ids),
  ]);
  const evaluated = all.items.map((item) => {
    const detail: GoalDetailsRecord | undefined = details.get(item.id);
    const progress = evaluateGoalFromSummary({
      config: detail?.measurement ?? UNMEASURED_GOAL,
      targetDate: detail?.targetDate ?? null,
      summary: summaries.get(item.id) ?? null,
      milestones: milestones.get(item.id),
      startedOn: ownerCalendarIso(item.createdAt, SYDNEY),
      completed: item.completedAt !== null,
      todayIso: TODAY,
    });
    return {
      id: item.id,
      status: progress.status,
      completed: item.completedAt !== null,
      condition: detail?.condition ?? null,
      rank: goalOutcomeDisplayRank({
        completed: item.completedAt !== null,
        status: progress.status,
      }),
      createdAt: item.createdAt.toISOString(),
    };
  });
  return evaluated
    .filter((goal) =>
      goalMatchesCollectionView(view, {
        completed: goal.completed,
        status: goal.status as never,
        condition: goal.condition,
      }),
    )
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )
    .map((goal) => ({ id: goal.id, status: goal.status, rank: goal.rank }));
}

/** Walk every page of a lens, returning the ids in order. */
async function walkAll(
  w: World,
  view: GoalCollectionView,
  limit = 3,
): Promise<string[]> {
  const seen: string[] = [];
  let cursor: string | undefined;
  let guard = 0;
  do {
    const page = await w.goals.listGoalsByOutcome({
      ...outcomeInput(view),
      limit,
      ...(cursor ? { cursor } : {}),
    });
    seen.push(...page.items.map((item) => item.id));
    cursor = page.nextCursor ?? undefined;
    guard += 1;
  } while (cursor && guard < 20);
  return seen;
}

describe("GoalRepository.listGoalsByOutcome — the workspace-wide outcome order", () => {
  it("agrees with the pure kernel comparator for every status (SQL ↔ kernel parity)", async () => {
    const w = world(WS);
    await seedMatrix(w);

    const repoOrder = (
      await w.goals.listGoalsByOutcome({ ...outcomeInput(), limit: 50 })
    ).items.map((item) => item.id);
    const expected = await evaluatorOrder(w);

    expect(repoOrder).toEqual(expected.map((goal) => goal.id));

    // And the matrix genuinely covers the vocabulary, so parity is proven
    // ACROSS it rather than on a lucky subset.
    expect(new Set(expected.map((goal) => goal.status))).toEqual(
      new Set([
        "overdue",
        "needs_attention",
        "stale",
        "on_track",
        "ahead",
        "in_progress",
        "achieved",
        "not_started",
        "not_measured",
      ]),
    );
  });

  it("leads with the outcomes that are off their own schedule, not with creation order", async () => {
    const w = world(WS);
    const { seeded } = await seedMatrix(w);

    const page = await w.goals.listGoalsByOutcome({
      ...outcomeInput(),
      limit: 50,
    });
    const ids = page.items.map((item) => item.id);

    // The two Goals created LAST lead the workspace, because their outcomes
    // are the ones needing a decision.
    expect(ids[0]).toBe(seeded.overdue);
    expect(ids[1]).toBe(seeded.needsAttention);
    // An unmeasured Goal — created FIRST — sits below every measured one that
    // has something to report. DEBT-120's exemplar defect, inverted.
    expect(ids.indexOf(seeded.unmeasured)).toBeGreaterThan(
      ids.indexOf(seeded.onTrack),
    );
    expect(ids.indexOf(seeded.unmeasured)).toBeGreaterThan(
      ids.indexOf(seeded.stale),
    );
    // An explicitly completed Goal is last, whatever its readings implied.
    expect(ids[ids.length - 1]).toBe(seeded.completed);
  });

  it("never strands a Goal needing attention on a later page (order before pagination)", async () => {
    const w = world(WS);
    const { seeded } = await seedMatrix(w);

    // A page of THREE over ten Goals: four pages, so a page-local sort would
    // have to get the whole workspace right by luck.
    const firstPage = await w.goals.listGoalsByOutcome({
      ...outcomeInput(),
      limit: 3,
    });
    expect(firstPage.items.map((item) => item.id).slice(0, 2)).toEqual([
      seeded.overdue,
      seeded.needsAttention,
    ]);

    const walked = await walkAll(w, "all", 3);
    const single = (
      await w.goals.listGoalsByOutcome({ ...outcomeInput(), limit: 50 })
    ).items.map((item) => item.id);
    // No duplicate, no gap, and identical to the single-page global order.
    expect(walked).toHaveLength(single.length);
    expect(new Set(walked).size).toBe(walked.length);
    expect(walked).toEqual(single);
  });

  it("returns nextCursor=null exactly at the last page", async () => {
    const w = world(WS);
    await seedMatrix(w);
    const first = await w.goals.listGoalsByOutcome({
      ...outcomeInput(),
      limit: 9,
    });
    expect(first.items).toHaveLength(9);
    expect(first.nextCursor).toBeTruthy();
    const last = await w.goals.listGoalsByOutcome({
      ...outcomeInput(),
      limit: 9,
      cursor: first.nextCursor!,
    });
    expect(last.items).toHaveLength(1);
    expect(last.nextCursor).toBeNull();
  });

  it("binds the cursor to every state that changes the ordered result", async () => {
    const w = world(WS);
    await seedMatrix(w);
    const first = await w.goals.listGoalsByOutcome({
      ...outcomeInput(),
      limit: 2,
    });
    expect(first.nextCursor).toBeTruthy();
    const cursor = first.nextCursor!;

    // A different owner DAY re-ranks (overdue and stale both move on a
    // rollover), so a cursor from yesterday must be refused rather than
    // splicing yesterday's page two onto today's page one.
    await expect(
      w.goals.listGoalsByOutcome({
        ...outcomeInput(),
        todayIso: "2026-08-21",
        cursor,
      }),
    ).rejects.toThrow();

    // A different TIME ZONE re-ranks schedule origins.
    await expect(
      w.goals.listGoalsByOutcome({
        ...outcomeInput(),
        timeZone: "America/New_York",
        cursor,
      }),
    ).rejects.toThrow();

    // A different LENS is a different result set entirely.
    await expect(
      w.goals.listGoalsByOutcome({ ...outcomeInput("attention"), cursor }),
    ).rejects.toThrow();

    // Another WORKSPACE's repository must never accept it.
    const other = createGoalRepository(env.DB, makeContext(OTHER));
    await expect(
      other.listGoalsByOutcome({ ...outcomeInput(), cursor }),
    ).rejects.toThrow();

    // A cursor from the ALIGNMENT ordering is a different question.
    const alignmentCursor = (
      await w.goals.listGoalsByAlignment({
        activeBoundaryIso: "2026-08-06T00:00:00.000Z",
        limit: 1,
      })
    ).nextCursor!;
    await expect(
      w.goals.listGoalsByOutcome({ ...outcomeInput(), cursor: alignmentCursor }),
    ).rejects.toThrow();

    // Under the SAME scope it round-trips cleanly.
    const second = await w.goals.listGoalsByOutcome({
      ...outcomeInput(),
      limit: 2,
      cursor,
    });
    expect(second.items).toHaveLength(2);
  });

  it("stays workspace isolated", async () => {
    const own = world(WS);
    const other = world(OTHER);
    await seedMatrix(own);
    const otherArea = await seedArea(other, "Other area");
    await seedGoal(other, otherArea.id, { title: "Foreign" });

    const page = await own.goals.listGoalsByOutcome({
      ...outcomeInput(),
      limit: 50,
    });
    expect(page.items.map((item) => item.title)).not.toContain("Foreign");
    expect(page.items).toHaveLength(10);
  });

  it("costs a FIXED number of statements, flat in the number of Goals", async () => {
    const w = world(WS);
    const { area } = await seedMatrix(w);
    const counting = countingDb(env.DB);
    const countingGoals = createGoalRepository(counting.db, w.ctx);

    counting.reset();
    await countingGoals.listGoalsByOutcome({ ...outcomeInput(), limit: 50 });
    const forTen = counting.prepareCount();

    // Twenty more Goals, each with readings and stages — the read must not grow.
    for (let index = 0; index < 20; index += 1) {
      await seedGoal(w, area.id, {
        title: `Bulk ${index}`,
        measurement: { type: "accumulation", targetValue: 10 },
        readings: [
          { value: index, measuredOn: "2026-08-01" },
          { value: index + 1, measuredOn: "2026-08-15" },
        ],
      });
    }
    counting.reset();
    await countingGoals.listGoalsByOutcome({ ...outcomeInput(), limit: 50 });
    expect(counting.prepareCount()).toBe(forTen);
    // Two statements: the schedule-origin scan and the ranked page.
    expect(forTen).toBeLessThanOrEqual(2);
  });
});

describe("the lenses filter the WORKSPACE, and their counts are workspace-true (DEBT-121)", () => {
  it("returns a lens's complete result set across pages, not the loaded page's members", async () => {
    const w = world(WS);
    await seedMatrix(w);

    for (const view of GOAL_COLLECTION_VIEWS) {
      const expected = (await evaluatorOrder(w, view)).map((goal) => goal.id);
      // Walked at a page size of ONE, so a page-local filter cannot pass: it
      // would return only the members that happened to land on page one.
      expect(await walkAll(w, view, 1)).toEqual(expected);
    }
  });

  it("counts every lens over the WORKSPACE, agreeing exactly with its own result set", async () => {
    const w = world(WS);
    await seedMatrix(w);

    const counts = await w.goals.countGoalsByOutcomeLens({
      todayIso: TODAY,
      calendarIsoOf: (instant: Date) => ownerCalendarIso(instant, SYDNEY),
    });

    // The count and the lens agree, walked across MULTIPLE pages — the
    // property a page-local count passes on one page and fails on two.
    for (const view of ["on_track", "attention", "completed"] as const) {
      expect(counts[view]).toBe((await walkAll(w, view, 2)).length);
    }
    expect(counts.total).toBe((await walkAll(w, "all", 2)).length);

    // And they are the real figures for this matrix, not merely self-consistent.
    expect(counts.total).toBe(10);
    expect(counts.on_track).toBe(2); // on_track + ahead
    expect(counts.attention).toBe(2); // needs_attention + overdue
    expect(counts.completed).toBe(1);
    expect(counts.set_aside).toBe(0);
  });

  it("counts the owner's set-aside Goals, and keeps them in every other lens they belong to", async () => {
    const w = world(WS);
    const { seeded } = await seedMatrix(w);

    // The OVERDUE Goal is set aside. Its derived status does not change, so it
    // must stay in "Needs attention" — the condition is scope, never truth.
    await w.details.update(seeded.overdue, { condition: "set_aside" });

    const counts = await w.goals.countGoalsByOutcomeLens({
      todayIso: TODAY,
      calendarIsoOf: (instant: Date) => ownerCalendarIso(instant, SYDNEY),
    });
    expect(counts.set_aside).toBe(1);
    expect(counts.attention).toBe(2);

    expect(await walkAll(w, "set_aside", 2)).toEqual([seeded.overdue]);
    expect(await walkAll(w, "attention", 2)).toContain(seeded.overdue);
    // …and it still LEADS the collection, because its outcome is unchanged.
    const page = await w.goals.listGoalsByOutcome({
      ...outcomeInput(),
      limit: 50,
    });
    expect(page.items[0]!.id).toBe(seeded.overdue);
  });

  it("costs a FIXED number of statements for the counts, flat in the workspace", async () => {
    const w = world(WS);
    const { area } = await seedMatrix(w);
    const counting = countingDb(env.DB);
    const countingGoals = createGoalRepository(counting.db, w.ctx);
    const input = {
      todayIso: TODAY,
      calendarIsoOf: (instant: Date) => ownerCalendarIso(instant, SYDNEY),
    };

    counting.reset();
    await countingGoals.countGoalsByOutcomeLens(input);
    const forTen = counting.prepareCount();

    for (let index = 0; index < 20; index += 1) {
      await seedGoal(w, area.id, {
        title: `Bulk ${index}`,
        measurement: { type: "accumulation", targetValue: 10 },
        readings: [{ value: index, measuredOn: "2026-08-15" }],
      });
    }
    counting.reset();
    await countingGoals.countGoalsByOutcomeLens(input);
    expect(counting.prepareCount()).toBe(forTen);
    expect(forTen).toBeLessThanOrEqual(2);
  });
});

describe("the outcome rank consumes GOAL-02 and adds no derivation of its own", () => {
  it("ranks a Goal by the status the kernel evaluator would give it, for every status", () => {
    // A pure check that the rank table and the evaluator agree about what a
    // status IS — the SQL side is proven above, this is the other half.
    const statuses = [
      "overdue",
      "needs_attention",
      "stale",
      "on_track",
      "ahead",
      "in_progress",
      "achieved",
      "not_started",
      "not_measured",
    ] as const;
    const ranks = statuses.map((status) =>
      goalOutcomeDisplayRank({ completed: false, status }),
    );
    // Strictly increasing: the precedence is total, with no two statuses tied.
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(new Set(ranks).size).toBe(statuses.length);
    // Explicit completion outranks every derived status.
    for (const status of statuses) {
      expect(goalOutcomeDisplayRank({ completed: true, status })).toBeGreaterThan(
        Math.max(...ranks),
      );
    }
  });

  it("evaluates an unrecognised stored measurement type as unmeasured on BOTH sides", async () => {
    const w = world(WS);
    const area = await seedArea(w, "Health");
    const goal = await seedGoal(w, area.id, { title: "From the future" });
    // The migration-0038 degradation case, written directly because no
    // validator would let it through the front door.
    await env.DB.prepare(
      `UPDATE goal_details SET measurement_type = 'quantum_flux'
       WHERE workspace_id = ? AND entity_id = ?`,
    )
      .bind(WS, goal.id)
      .run();

    const detail = await w.details.get(goal.id);
    // The kernel reads it as unmeasured…
    expect(detail?.measurement.type).toBeNull();
    expect(
      evaluateGoalProgress(
        { config: detail?.measurement ?? UNMEASURED_GOAL, targetDate: null, measurements: [] },
        { todayIso: TODAY },
      ).status,
    ).toBe("not_measured");
    // …and so does the SQL, which is what keeps the order parity-true.
    const page = await w.goals.listGoalsByOutcome({
      ...outcomeInput(),
      limit: 50,
    });
    expect(page.items.map((item) => item.id)).toEqual([goal.id]);
    const counts = await w.goals.countGoalsByOutcomeLens({
      todayIso: TODAY,
      calendarIsoOf: (instant: Date) => ownerCalendarIso(instant, SYDNEY),
    });
    expect(counts.on_track).toBe(0);
    expect(counts.attention).toBe(0);
    expect(counts.total).toBe(1);
  });
});
