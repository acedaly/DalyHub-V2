/**
 * STEER-03 — ONE Goal, ONE story, across every surface that tells it.
 *
 * ADR-111 decision 6 says parity between surfaces is *"proven by reading the
 * same machine value from each, never by comparing sentences"*. That is exactly
 * what these tests do: they drive the REAL loaders of `/goals`, the Area record
 * and the guided Review's Goals step over one seeded workspace, project each
 * one's Goal through the SAME `goalStoryFacts`, and demand equality.
 *
 * The seeded matrix is deliberately the hard one:
 *
 *   - a MEASURED Goal with readings, a target and a target date;
 *   - an UNMEASURED Goal, which must have no percentage anywhere;
 *   - a SET-ASIDE Goal, whose derived facts must be identical to what they
 *     would be if the owner had said nothing;
 *   - MOVEMENT present on one Goal and absent on another.
 *
 * It also proves the cost: the shared read is EIGHT statements, flat in the
 * number of Goals, and never one per Goal.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { RouterContextProvider } from "react-router";

import { createActivityActorContext } from "~/kernel/activity";
import { addCalendarDays } from "~/kernel/datetime";
import { ownerCalendarIso } from "~/shared/datetime";
import type { AuthenticatedSession } from "~/kernel/auth";
import { setAuthenticatedSession } from "~/platform/request";
import { bindWorkspaceRepositories } from "~/platform/workspaces";
import { loader as goalsLoader } from "~/modules/goals/routes/index";
import { loader as areaLoader } from "~/modules/areas/routes/detail";
import { goalListStory } from "~/modules/goals/goal-view";
import { loadReviewGuideStepData } from "~/modules/reviews/guided/review-guide-context";
import { REVIEW_GUIDE_QUERY_BUDGET } from "~/modules/reviews/guided/review-guide-context";
import { createOwnerAlignmentContext } from "~/shared/alignment";
import { goalStoryFacts, type GoalStory } from "~/shared/goal-progress";
import { loadGoalStories } from "~/shared/goal-progress/goal-story-load.server";
import type { Review } from "~/kernel/reviews";

import {
  FakeClock,
  countingDb,
  makeContext,
  makeGoalDetailsRepository,
  makeGoalMeasurementRepository,
  makeReviewRepository,
  makeSpineRepository,
  makeTaskRepository,
  resetTables,
  sequentialIds,
} from "./support";

/** The route loaders resolve the DEFAULT workspace, so the fixture uses it. */
const WS = "test-default-workspace";
const OTHER = "ws_goal_story_other";

const nextEntityId = sequentialIds("gst-e");
const nextActivityId = sequentialIds("gst-a");
const nextDetailsId = sequentialIds("gst-d");
const nextMeasurementId = sequentialIds("gst-m");
const nextReviewId = sequentialIds("gst-r");

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

function spine(ws = WS) {
  return makeSpineRepository(makeContext(ws), {
    clock: () => new Date(),
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  });
}

function tasks(ws = WS) {
  return makeTaskRepository(makeContext(ws), {
    clock: () => new Date(),
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  });
}

function details(ws = WS) {
  return makeGoalDetailsRepository(makeContext(ws), {
    clock: () => new Date(),
    idGenerator: nextDetailsId,
  });
}

function measurements(ws = WS) {
  return makeGoalMeasurementRepository(makeContext(ws), {
    clock: new FakeClock().now,
    idGenerator: nextMeasurementId,
  });
}

function scopeFor(db: D1Database = env.DB, ws = WS) {
  return bindWorkspaceRepositories(
    { DB: db },
    makeContext(ws),
    createActivityActorContext({ type: "user", id: "owner-1" }),
  );
}

/** The one timezone this file's owner lives in. Stated once. */
const STORY_TIMEZONE = "Australia/Brisbane";

/**
 * A day relative to the OWNER's calendar day, in the timezone this file
 * declares — not the UTC day.
 *
 * It used to be `new Date(...).toISOString().slice(0, 10)`, which is the UTC
 * day, while every surface under test resolves the owner's day through the
 * product from `Australia/Brisbane`. From 14:00 UTC those are different dates,
 * and when that difference crosses a week boundary — Sunday afternoon UTC, with
 * a Monday week start — the Review was handed one week and the Goals collection
 * computed another, so "every surface tells the same Goal story" failed on the
 * one thing all three surfaces agreed about.
 *
 * Pre-existing: reproduced at `bd471f1` with identical figures
 * (`2026-09-07…13` against `2026-08-31…09-06`). It is a defect in the TEST, not
 * in the product: `goalMovementWindow` is one function and all three surfaces
 * call it — they simply were not given the same day.
 */
function isoDaysFromToday(days: number): string {
  return addCalendarDays(ownerCalendarIso(new Date(), STORY_TIMEZONE), days);
}

function runGoals(url = "https://app.test/goals") {
  return goalsLoader({
    request: new Request(url),
    context: authedContext(),
    params: {},
  } as unknown as Parameters<typeof goalsLoader>[0]);
}

function runArea(areaId: string) {
  return areaLoader({
    request: new Request(`https://app.test/areas/${areaId}?tab=goals`),
    context: authedContext(),
    params: { areaId },
  } as unknown as Parameters<typeof areaLoader>[0]);
}

async function weeklyReview(ws = WS): Promise<Review> {
  const repo = makeReviewRepository(makeContext(ws), {
    clock: () => new Date(),
    idGenerator: nextReviewId,
  });
  const today = isoDaysFromToday(0);
  const { review } = await repo.create({
    type: "weekly",
    periodStart: isoDaysFromToday(-6),
    periodEnd: today,
  });
  return review;
}

/**
 * The seeded matrix. Four Goals under one Area, chosen so every branch of the
 * story is exercised on a real surface rather than in a fixture.
 */
async function seedStoryWorkspace(ws = WS) {
  const s = spine(ws);
  const t = tasks(ws);
  const area = await s.createArea({ title: "Health" });

  // 1. MEASURED, with readings, a target and a target date — and MOVEMENT, from
  //    a Task completed under a contributing Project inside this week.
  const measured = await s.createGoal({
    title: "Reach 70 kg",
    areaId: area.id,
  });
  await details(ws).update(measured.id, {
    measurement: { type: "target_value", baselineValue: 85, targetValue: 70 },
    targetDate: isoDaysFromToday(120),
  });
  for (const [value, offset] of [
    [85, -40],
    [79, -2],
  ] as const) {
    await measurements(ws).createMeasurement(measured.id, {
      value,
      measuredOn: isoDaysFromToday(offset),
    });
  }
  const project = await s.createProject({
    title: "Training block",
    parent: { kind: "goal", id: measured.id },
  });
  const done = await t.createTask({
    title: "Monday 5km",
    parent: { kind: "project", id: project.id },
  });
  await t.completeTask(done.id);
  await t.createTask({
    title: "Tuesday intervals",
    parent: { kind: "project", id: project.id },
  });

  // 2. UNMEASURED — no configuration at all. It must never carry a percentage.
  const unmeasured = await s.createGoal({
    title: "Be a better cook",
    areaId: area.id,
  });

  // 3. SET ASIDE by the owner, and otherwise identical to (2).
  const setAside = await s.createGoal({
    title: "Learn the cello",
    areaId: area.id,
  });
  await details(ws).update(setAside.id, { condition: "set_aside" });

  // 4. MEASURED but with nothing recorded — the "configured, no reading" case.
  const unstarted = await s.createGoal({
    title: "Read 12 books",
    areaId: area.id,
  });
  await details(ws).update(unstarted.id, {
    measurement: { type: "accumulation", targetValue: 12 },
  });

  return {
    areaId: area.id,
    measuredId: measured.id,
    unmeasuredId: unmeasured.id,
    setAsideId: setAside.id,
    unstartedId: unstarted.id,
    projectId: project.id,
  };
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

/* -------------------------------------------------------------------------- */
/* Cross-surface parity                                                        */
/* -------------------------------------------------------------------------- */

describe("every surface tells the same Goal story", () => {
  it("states identical machine facts on /goals, the Area record and the Review", async () => {
    const seeded = await seedStoryWorkspace();

    const goalsPage = await runGoals();
    const areaPage = await runArea(seeded.areaId);
    const review = await weeklyReview();
    const reviewStep = await loadReviewGuideStepData(
      scopeFor(),
      {
        review,
        stepId: "alignment",
        now: new Date(),
        timezone: STORY_TIMEZONE,
        todayIso: isoDaysFromToday(0),
        formatDate: (iso: string) => iso,
      },
      0,
    );
    expect(reviewStep.kind).toBe("alignment");
    if (reviewStep.kind !== "alignment") return;

    const collectionFacts = new Map(
      goalsPage.goals.map((goal) => [
        goal.id,
        goalStoryFacts(goalListStory(goal)),
      ]),
    );
    const areaFacts = new Map(
      areaPage.goals
        .filter((goal) => goal.story !== null)
        .map((goal) => [goal.id, goalStoryFacts(goal.story as GoalStory)]),
    );
    const reviewFacts = new Map(
      reviewStep.alignment.goals.map((goal) => [
        goal.id,
        goalStoryFacts(goal.story),
      ]),
    );

    // The matrix must actually reach all three surfaces, or "they agree" is a
    // statement about empty sets.
    expect(collectionFacts.size).toBe(4);
    expect(areaFacts.size).toBe(4);
    expect(reviewFacts.size).toBe(4);

    for (const goalId of [
      seeded.measuredId,
      seeded.unmeasuredId,
      seeded.setAsideId,
      seeded.unstartedId,
    ]) {
      const collection = collectionFacts.get(goalId);
      expect({ goalId, area: areaFacts.get(goalId) }).toEqual({
        goalId,
        area: collection,
      });
      expect({ goalId, review: reviewFacts.get(goalId) }).toEqual({
        goalId,
        review: collection,
      });
    }
  });

  it("gives an unmeasured Goal no percentage on any surface", async () => {
    const seeded = await seedStoryWorkspace();
    const goalsPage = await runGoals();
    const areaPage = await runArea(seeded.areaId);

    for (const goalId of [seeded.unmeasuredId, seeded.unstartedId]) {
      const row = goalsPage.goals.find((goal) => goal.id === goalId)!;
      const areaGoal = areaPage.goals.find((goal) => goal.id === goalId)!;
      expect(row.progress.progressPercent).toBeNull();
      expect(areaGoal.story!.progress.progressPercent).toBeNull();
      // …and the Area record's Task roll-up is NOT quietly standing in for one.
      expect(areaGoal.story!.progress.measured).toBe(
        goalId === seeded.unstartedId,
      );
    }
  });

  it("keeps every derived fact identical when the owner sets a Goal aside", async () => {
    const seeded = await seedStoryWorkspace();
    const before = await runGoals();
    const beforeFacts = goalStoryFacts(
      goalListStory(before.goals.find((g) => g.id === seeded.unmeasuredId)!),
    );

    await details().update(seeded.unmeasuredId, { condition: "set_aside" });

    const after = await runGoals();
    const afterFacts = goalStoryFacts(
      goalListStory(after.goals.find((g) => g.id === seeded.unmeasuredId)!),
    );

    // ONE key changes, and it is the owner's own.
    expect(afterFacts.condition).toBe("set_aside");
    expect(beforeFacts.condition).toBe("pursuing");
    const { condition: _before, ...beforeDerived } = beforeFacts;
    const { condition: _after, ...afterDerived } = afterFacts;
    expect(afterDerived).toEqual(beforeDerived);
  });

  it("carries movement on both propagated surfaces, from the ONE derivation", async () => {
    const seeded = await seedStoryWorkspace();
    const goalsPage = await runGoals();
    const areaPage = await runArea(seeded.areaId);

    const row = goalsPage.goals.find((g) => g.id === seeded.measuredId)!;
    const areaGoal = areaPage.goals.find((g) => g.id === seeded.measuredId)!;
    expect(row.movement?.available).toBe(true);
    expect(row.movement?.moved).toBe(true);
    // Byte-for-byte the same window and the same verdict.
    expect(areaGoal.story!.movement).toEqual(row.movement);

    const still = goalsPage.goals.find((g) => g.id === seeded.unmeasuredId)!;
    expect(still.movement?.available).toBe(true);
    expect(still.movement?.moved).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Bounds                                                                      */
/* -------------------------------------------------------------------------- */

describe("the shared story read is bounded", () => {
  it("costs the same eight statements for ten Goals as for two", async () => {
    const s = spine();
    const area = await s.createArea({ title: "Health" });
    const created: { id: string; title: string; createdAt: Date }[] = [];
    for (let index = 0; index < 10; index += 1) {
      const goal = await s.createGoal({
        title: `Goal ${index}`,
        areaId: area.id,
      });
      created.push({
        id: goal.id,
        title: goal.title,
        createdAt: goal.createdAt,
      });
    }

    const counting = countingDb(env.DB);
    const scope = scopeFor(counting.db);
    const now = new Date();
    const { evaluation, recentWindowStartIso } = createOwnerAlignmentContext(
      now,
      STORY_TIMEZONE,
    );
    const factsInput = {
      now,
      timezone: STORY_TIMEZONE,
      todayIso: evaluation.todayIso,
      firstDayOfWeek: "monday" as const,
      evaluation,
      recentWindowStartIso,
    };
    const subjects = created.map((goal) => ({ ...goal, completedAt: null }));

    counting.reset();
    await loadGoalStories(scope, subjects.slice(0, 2), factsInput);
    const few = counting.prepareCount();

    counting.reset();
    await loadGoalStories(scope, subjects, factsInput);
    const many = counting.prepareCount();

    expect(few).toBe(8);
    expect(many).toBe(few);
  });

  it("never returns another workspace's Goal", async () => {
    await seedStoryWorkspace(WS);
    const theirs = await seedStoryWorkspace(OTHER);
    const scope = scopeFor(env.DB, WS);
    const now = new Date();
    const { evaluation, recentWindowStartIso } = createOwnerAlignmentContext(
      now,
      "UTC",
    );
    const stories = await loadGoalStories(
      scope,
      [
        {
          id: theirs.measuredId,
          title: "Reach 70 kg",
          createdAt: now,
          completedAt: null,
        },
      ],
      {
        now,
        timezone: "UTC",
        todayIso: evaluation.todayIso,
        firstDayOfWeek: "monday",
        evaluation,
        recentWindowStartIso,
      },
    );
    // Every requested id gets an entry, but the OTHER workspace's Goal resolves
    // to the honest empty story rather than to that workspace's facts.
    const story = stories.get(theirs.measuredId)!;
    expect(story.progress.measured).toBe(false);
    expect(story.contribution).toEqual({ total: 0, completed: 0, active: 0 });
  });

  it("keeps the Review's alignment step inside its DECLARED budget", async () => {
    await seedStoryWorkspace();
    const review = await weeklyReview();
    const counting = countingDb(env.DB);
    await loadReviewGuideStepData(
      scopeFor(counting.db),
      {
        review,
        stepId: "alignment",
        now: new Date(),
        timezone: STORY_TIMEZONE,
        todayIso: isoDaysFromToday(0),
        formatDate: (iso: string) => iso,
      },
      0,
    );
    // The step's own declared number, minus the shared Inbox aggregate that
    // `loadReviewGuideContext` pays and this entry point does not.
    expect(counting.prepareCount()).toBe(
      REVIEW_GUIDE_QUERY_BUDGET.alignment - 1,
    );
  });
});
