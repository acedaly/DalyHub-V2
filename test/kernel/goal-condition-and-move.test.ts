/**
 * STEER-02 — the owner's hand: the owner-set CONDITION and the Goal MOVE,
 * over real D1 in the Workers runtime.
 *
 * The suite is organised around the two rules that would be easiest to break
 * quietly, and each is asserted from BOTH sides:
 *
 *  - **Stored judgement and derived fact never produce each other**
 *    (ADR-111 decision 1). The condition is written only by the owner's intent
 *    and read only by presentation and scope; the three evaluators keep
 *    signatures that cannot see it, and every derived value on a Goal is
 *    byte-identical under each condition value.
 *  - **A moved Goal is the SAME record** (DEBT-184). Its id, its Activity, its
 *    measurements, its milestones and its advancing Projects survive, both
 *    Areas' rollups agree afterwards, and the move is recorded in the
 *    repository's own link vocabulary rather than a new audit mechanism.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { RouterContextProvider } from "react-router";

import type { AuthenticatedSession } from "~/kernel/auth";
import {
  GOAL_CONDITION_CHANGED,
  GOAL_CONDITIONS,
  evaluateGoalProgress,
  parseGoalCondition,
  validateGoalConditionInput,
  GoalDetailsValidationError,
} from "~/kernel/goals";
import {
  composeGoalAlignmentFacts,
  evaluateGoalAlignment,
  evaluateGoalMovement,
} from "~/kernel/alignment";
import { setAuthenticatedSession } from "~/platform/request";
import { action as mutateAction } from "~/modules/goals/routes/mutate";
import { loader as areaOptionsLoader } from "~/modules/goals/routes/area-options";
import type { GoalMutationResult } from "~/modules/goals/routes/mutate";
import { ownerCalendarIso } from "~/shared/datetime";

import {
  FakeClock,
  makeActivityRepository,
  makeAreaSettingsRepository,
  makeContext,
  makeGoalDetailsRepository,
  makeGoalMeasurementRepository,
  makeGoalRepository,
  makeSpineRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "test-default-workspace";
const OTHER = "ws_goal_condition_other";
const SYDNEY = "Australia/Sydney";
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
    activity: makeActivityRepository(ctx),
    goals: makeGoalRepository(ctx),
    details: makeGoalDetailsRepository(ctx, {
      clock: clock.now,
      idGenerator: sequentialIds(`${ws}-gd`),
    }),
    measurements: makeGoalMeasurementRepository(ctx, {
      clock: clock.now,
      idGenerator: sequentialIds(`${ws}-gm`),
    }),
    areaSettings: makeAreaSettingsRepository(ctx, {
      clock: clock.now,
      idGenerator: sequentialIds(`${ws}-as`),
    }),
  };
}

type World = ReturnType<typeof world>;

/** The Area rollup, narrowed from the spine's union so a failure reads clearly. */
async function areaRollup(w: World, areaId: string) {
  const rollup = await w.spine.getRollup(areaId);
  if (rollup.kind !== "area") throw new Error("expected an Area rollup");
  return rollup;
}

function sessionFor(subject = "owner-subject"): AuthenticatedSession {
  return {
    user: { subject, email: "owner@example.com", displayName: null },
    issuedAt: new Date(0),
    expiresAt: new Date(Date.parse("2999-01-01")),
  };
}

function authedContext(): RouterContextProvider {
  const context = new RouterContextProvider();
  setAuthenticatedSession(context, sessionFor());
  return context;
}

function formData(entries: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(entries)) form.set(key, value);
  return form;
}

async function mutate(
  goalId: string,
  entries: Record<string, string>,
): Promise<GoalMutationResult> {
  const response = (await mutateAction({
    request: new Request(`https://app.test/goals/${goalId}/mutate`, {
      method: "POST",
      body: formData(entries),
    }),
    context: authedContext(),
    params: { goalId },
  } as unknown as Parameters<typeof mutateAction>[0])) as Response;
  return (await response.json()) as GoalMutationResult;
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

/* -------------------------------------------------------------------------- */
/* The condition                                                              */
/* -------------------------------------------------------------------------- */

describe("the owner-set Goal condition (DEBT-183)", () => {
  it("states INTENT only — the vocabulary contains no verdict a derivation computes", () => {
    // ADR-111 decision 2, asserted structurally rather than by review. An
    // owner-set "on track" beside GOAL-02's computed one would be two
    // authorities for one word, so the members are enumerated here and the
    // forbidden ones named.
    expect([...GOAL_CONDITIONS]).toEqual(["set_aside"]);
    for (const forbidden of [
      "on_track",
      "off_track",
      "healthy",
      "at_risk",
      "stalled",
      "failing",
      "neglected",
      "achieved",
      "overdue",
    ]) {
      expect(GOAL_CONDITIONS as readonly string[]).not.toContain(forbidden);
      // …and the write boundary refuses them, so one cannot arrive by post.
      expect(() => validateGoalConditionInput(forbidden)).toThrow(
        GoalDetailsValidationError,
      );
    }
  });

  it("creates, changes and clears through the canonical mutate path", async () => {
    const w = world(WS);
    const area = await w.spine.createArea({ title: "Health" });
    const goal = await w.spine.createGoal({ title: "Reach 70 kg", areaId: area.id });

    // Default: no row at all reads as "pursuing".
    expect((await w.details.get(goal.id))?.condition ?? null).toBeNull();

    const set = await mutate(goal.id, {
      intent: "set_condition",
      condition: "set_aside",
    });
    expect(set).toEqual({
      kind: "set_condition",
      ok: true,
      condition: "set_aside",
    });
    expect((await w.details.get(goal.id))?.condition).toBe("set_aside");

    // Cleared with the empty wire form every other Goal field uses.
    const cleared = await mutate(goal.id, {
      intent: "set_condition",
      condition: "",
    });
    expect(cleared).toEqual({
      kind: "set_condition",
      ok: true,
      condition: null,
    });
    expect((await w.details.get(goal.id))?.condition ?? null).toBeNull();
  });

  it("refuses a value outside the vocabulary and writes nothing", async () => {
    const w = world(WS);
    const area = await w.spine.createArea({ title: "Health" });
    const goal = await w.spine.createGoal({ title: "Reach 70 kg", areaId: area.id });
    await mutate(goal.id, { intent: "set_condition", condition: "set_aside" });

    const refused = await mutate(goal.id, {
      intent: "set_condition",
      condition: "on_track",
    });
    expect(refused.ok).toBe(false);
    expect(refused.kind).toBe("set_condition");
    // The previous value survives — a refusal never half-writes.
    expect((await w.details.get(goal.id))?.condition).toBe("set_aside");
  });

  it("records the change in Activity with BOTH directions, and never free text", async () => {
    const w = world(WS);
    const area = await w.spine.createArea({ title: "Health" });
    const goal = await w.spine.createGoal({ title: "Reach 70 kg", areaId: area.id });

    await mutate(goal.id, { intent: "set_condition", condition: "set_aside" });
    await mutate(goal.id, { intent: "set_condition", condition: "" });

    const page = await w.activity.listForEntity(goal.id, { limit: 50 });
    const events = page.items.filter(
      (item) => item.type === GOAL_CONDITION_CHANGED,
    );
    expect(events).toHaveLength(2);
    // Newest first: the clear, then the set. Each states what it changed FROM,
    // so history can be read in both directions (ADR-110's FOLLOW-01 lesson).
    expect(events[0]!.payload).toEqual({
      condition: null,
      previous: "set_aside",
    });
    expect(events[1]!.payload).toEqual({
      condition: "set_aside",
      previous: null,
    });
    // The Goal's title and any free text stay out of the log.
    expect(JSON.stringify(events.map((event) => event.payload))).not.toContain(
      "Reach 70 kg",
    );
  });

  it("is an idempotent no-op when nothing changes — no write, no event", async () => {
    const w = world(WS);
    const area = await w.spine.createArea({ title: "Health" });
    const goal = await w.spine.createGoal({ title: "Reach 70 kg", areaId: area.id });
    await mutate(goal.id, { intent: "set_condition", condition: "set_aside" });
    const before = (await w.activity.listForEntity(goal.id, { limit: 50 })).items
      .length;

    await mutate(goal.id, { intent: "set_condition", condition: "set_aside" });
    const after = (await w.activity.listForEntity(goal.id, { limit: 50 })).items
      .length;
    expect(after).toBe(before);
  });

  it("degrades an unrecognised stored value to 'pursuing' rather than throwing", async () => {
    const w = world(WS);
    const area = await w.spine.createArea({ title: "Health" });
    const goal = await w.spine.createGoal({ title: "Reach 70 kg", areaId: area.id });
    await mutate(goal.id, { intent: "set_condition", condition: "set_aside" });
    // The migration-0038 lesson: the column carries no CHECK, so a value from a
    // future release must read as an absence rather than break the record.
    await env.DB.prepare(
      `UPDATE goal_details SET condition = 'hibernating'
       WHERE workspace_id = ? AND entity_id = ?`,
    )
      .bind(WS, goal.id)
      .run();

    expect(parseGoalCondition("hibernating")).toBeNull();
    const details = await w.details.get(goal.id);
    expect(details?.condition ?? null).toBeNull();
  });

  it("is never an input to a derived evaluator — the signatures cannot see it", () => {
    /*
     * ADR-111 decision 1, asserted at the type AND the value level: the three
     * evaluators are pure functions of their own fact shapes, so passing a
     * condition simply has nowhere to go. Feeding one in (a falsifier this
     * suite was checked against) cannot change an answer, because there is no
     * parameter for it — and if a future change added one, this test's fact
     * objects would no longer type-check.
     */
    const facts = {
      config: {
        type: "accumulation" as const,
        unit: null,
        direction: "increase" as const,
        baselineValue: 0,
        targetValue: 10,
      },
      targetDate: "2026-09-01",
      measurements: [{ value: 2, measuredOn: "2026-08-01" }],
    };
    const progressKeys = Object.keys(facts).sort();
    expect(progressKeys).not.toContain("condition");
    expect(
      evaluateGoalProgress(facts, { todayIso: TODAY }).status,
    ).toBeTypeOf("string");

    const alignmentFacts = composeGoalAlignmentFacts({
      goalId: "g-1",
      completedAt: null,
      contribution: {
        total: 1,
        completed: 0,
        incomplete: 1,
        active: 1,
        planned: 0,
        onHold: 0,
        archived: 0,
      },
      activity: undefined,
    });
    expect(Object.keys(alignmentFacts)).not.toContain("condition");
    expect(
      evaluateGoalAlignment(alignmentFacts, {
        now: new Date(`${TODAY}T00:00:00.000Z`),
        todayIso: TODAY,
        calendarIsoOf: (instant: Date) => ownerCalendarIso(instant, SYDNEY),
      }).state,
    ).toBeTypeOf("string");

    const movement = evaluateGoalMovement(
      {
        goalId: "g-1",
        contributingProjectCount: 1,
        movedProjectCount: 0,
        counts: {},
        latestMovementAt: null,
      },
      {
        window: {
          periodStart: "2026-08-17",
          periodEnd: "2026-08-23",
          startInstantIso: "2026-08-16T14:00:00.000Z",
          endInstantIso: "2026-08-23T14:00:00.000Z",
        },
        todayIso: TODAY,
        calendarIsoOf: (instant: Date) => ownerCalendarIso(instant, SYDNEY),
      },
    );
    expect(Object.keys(movement)).not.toContain("condition");
  });

  it("changes no derived fact about the Goal when it changes", async () => {
    const w = world(WS);
    const area = await w.spine.createArea({ title: "Health" });
    const goal = await w.spine.createGoal({ title: "Reach 70 kg", areaId: area.id });
    await w.details.update(goal.id, {
      measurement: { type: "accumulation", targetValue: 40 },
      targetDate: "2026-09-30",
    });
    await w.measurements.createMeasurement(goal.id, {
      value: 5,
      measuredOn: "2026-08-18",
    });

    const derived = async () => {
      const details = await w.details.get(goal.id);
      const contribution = await w.goals.getGoalProjectContribution(goal.id);
      const summaries = await w.measurements.listMeasurementSummaries(
        [goal.id],
        { comparisonFromIso: "2026-01-01" },
      );
      return JSON.stringify({
        progress: evaluateGoalProgress(
          {
            config: details!.measurement,
            targetDate: details!.targetDate,
            measurements: [{ value: 5, measuredOn: "2026-08-18" }],
          },
          { todayIso: TODAY },
        ),
        contribution,
        summary: summaries.get(goal.id) ?? null,
      });
    };

    const pursuing = await derived();
    await mutate(goal.id, { intent: "set_condition", condition: "set_aside" });
    const setAside = await derived();
    await mutate(goal.id, { intent: "set_condition", condition: "" });
    const backToPursuing = await derived();

    // Byte-identical: the owner's judgement neither hides nor re-tones a fact.
    expect(setAside).toBe(pursuing);
    expect(backToPursuing).toBe(pursuing);
  });

  it("leaves attention-scoped reads while staying in the collection's own read", async () => {
    const w = world(WS);
    const area = await w.spine.createArea({ title: "Health" });
    const pursued = await w.spine.createGoal({ title: "Pursued", areaId: area.id });
    const rested = await w.spine.createGoal({ title: "Rested", areaId: area.id });
    await w.details.update(rested.id, { condition: "set_aside" });

    const boundary = "2026-08-06T00:00:00.000Z";
    // The attention scope (Today's Goal panel reads with this flag).
    const attention = await w.goals.listGoalsByAlignment({
      activeBoundaryIso: boundary,
      omitSetAside: true,
    });
    expect(attention.items.map((item) => item.id)).toEqual([pursued.id]);

    // Every other consumer's read is unchanged — the Review, insights and
    // Analytics ask a different question and their selection must not move.
    const everything = await w.goals.listGoalsByAlignment({
      activeBoundaryIso: boundary,
    });
    expect(everything.items.map((item) => item.id).sort()).toEqual(
      [pursued.id, rested.id].sort(),
    );

    // …and the collection still shows it, with its facts intact.
    const collection = await w.goals.listGoalsByOutcome({
      todayIso: TODAY,
      timeZone: SYDNEY,
      calendarIsoOf: (instant: Date) => ownerCalendarIso(instant, SYDNEY),
    });
    expect(collection.items.map((item) => item.id)).toContain(rested.id);
  });

  it("excludes set-aside Goals BEFORE the page boundary, never after it", async () => {
    // The ordering bug a JS filter would produce: a workspace whose highest-
    // ranked Goals are all set aside must still surface the pursued ones,
    // rather than returning a short page (or an empty one).
    const w = world(WS);
    const area = await w.spine.createArea({ title: "Health" });
    const setAside: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const goal = await w.spine.createGoal({
        title: `Rested ${index}`,
        areaId: area.id,
      });
      await w.details.update(goal.id, { condition: "set_aside" });
      setAside.push(goal.id);
    }
    const pursued = await w.spine.createGoal({ title: "Pursued", areaId: area.id });

    const page = await w.goals.listGoalsByAlignment({
      activeBoundaryIso: "2026-08-06T00:00:00.000Z",
      limit: 2,
      omitSetAside: true,
    });
    expect(page.items.map((item) => item.id)).toEqual([pursued.id]);
    expect(setAside).toHaveLength(3);
  });
});

/* -------------------------------------------------------------------------- */
/* The move                                                                   */
/* -------------------------------------------------------------------------- */

/** A Goal with a full history: measurements, a stage, a Project and a Task. */
async function seedGoalWithHistory(w: World, areaId: string) {
  const goal = await w.spine.createGoal({ title: "Reach 70 kg", areaId });
  await w.details.update(goal.id, {
    measurement: { type: "target_value", baselineValue: 85, targetValue: 70 },
    targetDate: "2026-12-31",
  });
  await w.measurements.createMeasurement(goal.id, {
    value: 85,
    measuredOn: "2026-02-01",
  });
  await w.measurements.createMeasurement(goal.id, {
    value: 79,
    measuredOn: "2026-08-01",
  });
  const stage = await w.measurements.createMilestone(goal.id, {
    title: "First 5 kg",
  });
  const project = await w.spine.createProject({
    title: "Weight loss journey",
    parent: { kind: "goal", id: goal.id },
  });
  const task = await w.spine.createTask({
    title: "Monday run",
    parent: { kind: "project", id: project.id },
  });
  await w.spine.complete(task.id);
  return { goal, project, task, stage };
}

describe("moving a Goal between Areas (DEBT-184)", () => {
  it("keeps the SAME record, with its history, measurements and Projects", async () => {
    const w = world(WS);
    const health = await w.spine.createArea({ title: "Health" });
    const fitness = await w.spine.createArea({ title: "Fitness" });
    const { goal, project, task } = await seedGoalWithHistory(w, health.id);

    const before = await w.goals.getGoalOverview(goal.id);
    const activityBefore = await w.activity.listForEntity(goal.id, {
      limit: 100,
    });
    const measurementsBefore = await w.measurements.listMeasurements(goal.id);

    const result = await mutate(goal.id, {
      intent: "move",
      areaId: fitness.id,
    });
    expect(result).toEqual({ kind: "move", ok: true, outcome: "moved" });

    const after = await w.goals.getGoalOverview(goal.id);
    // The SAME record: same id, same title, same creation instant. Nothing was
    // recreated, so nothing could have been lost in the recreation.
    expect(after!.id).toBe(before!.id);
    expect(after!.title).toBe(before!.title);
    expect(after!.createdAt.toISOString()).toBe(before!.createdAt.toISOString());
    // …under the NEW Area.
    expect(after!.area.id).toBe(fitness.id);
    expect(after!.area.title).toBe("Fitness");

    // Its measurement history is untouched, so its progress still derives.
    const measurementsAfter = await w.measurements.listMeasurements(goal.id);
    expect(measurementsAfter.map((item) => item.value)).toEqual(
      measurementsBefore.map((item) => item.value),
    );
    expect((await w.details.get(goal.id))?.targetDate).toBe("2026-12-31");
    expect(await w.measurements.listMilestones(goal.id)).toHaveLength(1);

    // Its contributing Project travels with it by construction — the Project
    // parents to the GOAL, not to the Area — and so does the Task beneath it.
    const contribution = await w.goals.getGoalProjectContribution(goal.id);
    expect(contribution.total).toBe(1);
    const projects = await w.goals.listGoalProjects({ goalId: goal.id });
    expect(projects.items.map((item) => item.id)).toEqual([project.id]);
    expect(projects.items[0]!.taskCompleted).toBe(1);
    const movedProject = await w.spine.getById(project.id);
    expect(movedProject!.parent?.id).toBe(goal.id);
    const movedTask = await w.spine.getById(task.id);
    expect(movedTask!.parent?.id).toBe(project.id);

    // Its Activity SURVIVES and GROWS — the earlier events are all still there.
    const activityAfter = await w.activity.listForEntity(goal.id, {
      limit: 100,
    });
    for (const event of activityBefore.items) {
      expect(activityAfter.items.map((item) => item.id)).toContain(event.id);
    }
    expect(activityAfter.items.length).toBeGreaterThan(
      activityBefore.items.length,
    );
  });

  it("records the move in the repository's OWN link vocabulary, not a new mechanism", async () => {
    const w = world(WS);
    const health = await w.spine.createArea({ title: "Health" });
    const fitness = await w.spine.createArea({ title: "Fitness" });
    const { goal } = await seedGoalWithHistory(w, health.id);

    const before = await w.activity.listForEntity(goal.id, { limit: 100 });
    await mutate(goal.id, { intent: "move", areaId: fitness.id });
    const after = await w.activity.listForEntity(goal.id, { limit: 100 });

    const added = after.items.filter(
      (item) => !before.items.some((seen) => seen.id === item.id),
    );
    // Exactly the two link mutations `SpineRepository.move` writes for every
    // Project move — no bespoke `goal.moved` verb, no second audit mechanism.
    expect(added.map((item) => item.type).sort()).toEqual(
      ["entity_link.created", "entity_link.unlinked"].sort(),
    );
    const created = added.find((item) => item.type === "entity_link.created")!;
    expect(created.payload.targetEntityId).toBe(fitness.id);
    expect(created.payload.linkType).toBe("goal.belongs_to_area");
  });

  it("moves the Goal's whole subtree between both Areas' rollups", async () => {
    const w = world(WS);
    const health = await w.spine.createArea({ title: "Health" });
    const fitness = await w.spine.createArea({ title: "Fitness" });
    const { goal } = await seedGoalWithHistory(w, health.id);

    const healthBefore = await areaRollup(w, health.id);
    expect(healthBefore.goals.total).toBe(1);
    expect(healthBefore.projects.total).toBe(1);
    expect(healthBefore.tasks.total).toBe(1);

    await mutate(goal.id, { intent: "move", areaId: fitness.id });

    const healthAfter = await areaRollup(w, health.id);
    const fitnessAfter = await areaRollup(w, fitness.id);
    // The old Area no longer owns it…
    expect(healthAfter.goals.total).toBe(0);
    expect(healthAfter.projects.total).toBe(0);
    expect(healthAfter.tasks.total).toBe(0);
    // …and the new one does, with the subtree that travelled with it.
    expect(fitnessAfter.goals.total).toBe(1);
    expect(fitnessAfter.projects.total).toBe(1);
    expect(fitnessAfter.tasks.total).toBe(1);
    expect(fitnessAfter.tasks.completed).toBe(1);
  });

  it("keeps the derivations working, and follows the new Area's identity", async () => {
    const w = world(WS);
    const health = await w.spine.createArea({ title: "Health" });
    const fitness = await w.spine.createArea({ title: "Fitness" });
    const { goal } = await seedGoalWithHistory(w, health.id);

    const beforeArea = (await w.goals.getGoalOverview(goal.id))!.area;
    await mutate(goal.id, { intent: "move", areaId: fitness.id });
    const afterArea = (await w.goals.getGoalOverview(goal.id))!.area;

    // A Goal with no identity of its own inherits the NEW Area's, which is a
    // real consequence of the move rather than a bug: the mark follows the file.
    expect(afterArea.colourRank).not.toBe(beforeArea.colourRank);

    // The outcome ordering still classifies it — the derivations read the same
    // Goal-owned facts, which the move did not touch.
    const page = await w.goals.listGoalsByOutcome({
      todayIso: TODAY,
      timeZone: SYDNEY,
      calendarIsoOf: (instant: Date) => ownerCalendarIso(instant, SYDNEY),
    });
    expect(page.items.map((item) => item.id)).toContain(goal.id);
    const alignment = await w.goals.listGoalsByAlignment({
      activeBoundaryIso: "2026-08-06T00:00:00.000Z",
    });
    expect(alignment.items.map((item) => item.id)).toContain(goal.id);
  });

  it("is an idempotent no-op when the Goal is already in that Area", async () => {
    const w = world(WS);
    const health = await w.spine.createArea({ title: "Health" });
    const { goal } = await seedGoalWithHistory(w, health.id);
    const before = await w.activity.listForEntity(goal.id, { limit: 100 });

    const result = await mutate(goal.id, {
      intent: "move",
      areaId: health.id,
    });
    expect(result).toEqual({ kind: "move", ok: true, outcome: "unchanged" });
    const after = await w.activity.listForEntity(goal.id, { limit: 100 });
    expect(after.items).toHaveLength(before.items.length);
  });

  it("fails closed for a missing, wrong-kind, archived or cross-workspace destination", async () => {
    const w = world(WS);
    const other = world(OTHER);
    const health = await w.spine.createArea({ title: "Health" });
    const { goal, project } = await seedGoalWithHistory(w, health.id);
    const archived = await w.spine.createArea({ title: "Archived" });
    await w.areaSettings.archive(archived.id);
    const foreign = await other.spine.createArea({ title: "Foreign" });

    for (const areaId of ["nope", project.id, archived.id, foreign.id]) {
      const result = await mutate(goal.id, { intent: "move", areaId });
      expect(result).toEqual({
        kind: "move",
        ok: false,
        outcome: "invalid",
        // One calm outcome for every refusal — never a message that discloses
        // whether an id exists in another workspace.
        formError: "Choose an available Area.",
      });
    }
    // Nothing moved.
    expect((await w.goals.getGoalOverview(goal.id))!.area.id).toBe(health.id);
  });

  it("offers only active, non-archived Areas as destinations", async () => {
    const w = world(WS);
    const health = await w.spine.createArea({ title: "Health" });
    const fitness = await w.spine.createArea({ title: "Fitness" });
    const archived = await w.spine.createArea({ title: "Fitness archive" });
    await w.areaSettings.archive(archived.id);
    const goal = await w.spine.createGoal({ title: "A goal", areaId: health.id });

    const response = (await areaOptionsLoader({
      request: new Request("https://app.test/goals/area-options?q=fit"),
      context: authedContext(),
      params: {},
    } as unknown as Parameters<typeof areaOptionsLoader>[0])) as Response;
    const body = (await response.json()) as {
      readonly options: readonly { value: string; label: string }[];
    };
    expect(body.options.map((option) => option.value)).toEqual([fitness.id]);
    // A Goal is never offered — the spine allows one parent kind for a Goal.
    expect(body.options.map((option) => option.value)).not.toContain(goal.id);
  });

  it("leaves other Goals and other workspaces untouched", async () => {
    const w = world(WS);
    const other = world(OTHER);
    const health = await w.spine.createArea({ title: "Health" });
    const fitness = await w.spine.createArea({ title: "Fitness" });
    const { goal } = await seedGoalWithHistory(w, health.id);
    const bystander = await w.spine.createGoal({
      title: "Bystander",
      areaId: health.id,
    });
    const otherArea = await other.spine.createArea({ title: "Other" });
    const otherGoal = await other.spine.createGoal({
      title: "Foreign",
      areaId: otherArea.id,
    });

    await mutate(goal.id, { intent: "move", areaId: fitness.id });

    expect((await w.goals.getGoalOverview(bystander.id))!.area.id).toBe(
      health.id,
    );
    expect((await other.goals.getGoalOverview(otherGoal.id))!.area.id).toBe(
      otherArea.id,
    );
    expect((await areaRollup(other, otherArea.id)).goals.total).toBe(1);
  });

  it("refuses to move a Goal that is not this workspace's", async () => {
    const w = world(WS);
    const other = world(OTHER);
    const health = await w.spine.createArea({ title: "Health" });
    const otherArea = await other.spine.createArea({ title: "Other" });
    const foreignGoal = await other.spine.createGoal({
      title: "Foreign",
      areaId: otherArea.id,
    });

    // The mutate route anchors on an ACTIVE GOAL in the trusted workspace, so a
    // cross-workspace id is the calm 404 every Goal path gives.
    await expect(
      mutate(foreignGoal.id, { intent: "move", areaId: health.id }),
    ).rejects.toMatchObject({ status: 404 });
    expect((await other.goals.getGoalOverview(foreignGoal.id))!.area.id).toBe(
      otherArea.id,
    );
  });
});
