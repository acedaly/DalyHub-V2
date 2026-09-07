/**
 * V2.14 GROUND-02 / GROUND-03 — the fact builders against real D1.
 *
 * These are the tests that make the builders' promises enforceable rather than
 * aspirational:
 *
 *   1. **DEBT-91's closing condition.** The Weekly Review's fact block agrees
 *      with the guided Review's own evaluators over the same period — including
 *      a non-zero stalled/at-risk case, which is precisely the number the old
 *      block hard-coded to zero — and a Goal the owner has SET ASIDE is
 *      reported as set aside rather than as neglected.
 *   2. **Workspace isolation.** Every builder is scoped, and a neighbouring
 *      workspace's Projects, Goals and commitments reach no fact.
 *   3. **A bounded cost.** The block costs the same number of statements over a
 *      small workspace and a large one — no N+1, and no read that grows with
 *      the workspace.
 *   4. **The absences, behaviourally.** No Diary entry and no Person appears in
 *      a fact, on a workspace that has both.
 *
 * Query counting wraps the real D1 binding: every executed statement (and every
 * batch) is one unit — the same instrument `review-guide-context.test.ts` uses,
 * for the same reason.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { createActivityActorContext } from "~/kernel/activity";
import type { Review } from "~/kernel/reviews";
import { buildReviewFactBlock } from "~/modules/ai/review-facts";
import { loadReviewGuideStepData } from "~/modules/reviews/guided/review-guide-context";
import { buildGroundedFacts } from "~/platform/ai";
import {
  bindWorkspaceRepositories,
  type WorkspaceScope,
} from "~/platform/workspaces";

import {
  FakeClock,
  makeContext,
  makeDiaryRepository,
  makeGoalDetailsRepository,
  makeObligationRepository,
  makePersonRepository,
  makeReviewRepository,
  makeSpineRepository,
  makeTaskRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "test-grounded-ai-workspace";
const OTHER = "test-grounded-ai-other";
/*
 * The owner's "now" is deliberately a long way after the fixtures are written,
 * so PROJ-02's evaluator has something to classify: a Project created moments
 * ago is neither stale nor at risk, and a parity test over three zeroes proves
 * nothing at all. Both surfaces receive the SAME instant, which is what makes
 * the comparison meaningful.
 */
const NOW = new Date("2027-08-03T09:00:00.000Z");
const TODAY = "2027-08-03";
const TIMEZONE = "Australia/Brisbane";

/* -------------------------------------------------------------------------- */
/* A counting D1 binding                                                       */
/* -------------------------------------------------------------------------- */

interface Counter {
  count: number;
}

function countingDatabase(counter: Counter): D1Database {
  const real = env.DB;
  function wrapStatement(statement: D1PreparedStatement): D1PreparedStatement {
    return new Proxy(statement, {
      get(target, property, receiver) {
        const value = Reflect.get(target, property, receiver);
        if (typeof value !== "function") return value;
        if (property === "bind") {
          return (...args: unknown[]) =>
            wrapStatement(
              (value as (...a: unknown[]) => D1PreparedStatement).apply(
                target,
                args,
              ),
            );
        }
        if (
          property === "first" ||
          property === "all" ||
          property === "run" ||
          property === "raw"
        ) {
          return (...args: unknown[]) => {
            counter.count += 1;
            return (value as (...a: unknown[]) => unknown).apply(target, args);
          };
        }
        return (value as (...a: unknown[]) => unknown).bind(target);
      },
    });
  }
  return new Proxy(real, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (property === "prepare") {
        return (sql: string) =>
          wrapStatement(
            (value as (s: string) => D1PreparedStatement).call(target, sql),
          );
      }
      if (property === "batch") {
        return (...args: unknown[]) => {
          counter.count += 1;
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      }
      if (typeof value === "function") {
        return (value as (...a: unknown[]) => unknown).bind(target);
      }
      return value;
    },
  }) as D1Database;
}

function scopeFor(counter?: Counter, workspaceId = WS): WorkspaceScope {
  const db = counter ? countingDatabase(counter) : env.DB;
  return bindWorkspaceRepositories(
    { DB: db },
    makeContext(workspaceId),
    createActivityActorContext({ type: "user", id: "owner-1" }),
  );
}

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

const reviewRepos = new Map<string, ReturnType<typeof makeReviewRepository>>();

function reviewsRepo(ws = WS) {
  const existing = reviewRepos.get(ws);
  if (existing) return existing;
  const repo = makeReviewRepository(makeContext(ws), {
    clock: new FakeClock("2027-08-03T09:00:00.000Z").now,
    idGenerator: sequentialIds(`rev-${ws}`),
  });
  reviewRepos.set(ws, repo);
  return repo;
}

async function weeklyReview(ws = WS): Promise<Review> {
  const { review } = await reviewsRepo(ws).create({
    type: "weekly",
    periodStart: "2027-07-26",
    periodEnd: "2027-08-01",
  });
  return review;
}

/**
 * A workspace with something to say.
 *
 * `stalled` Projects hold open work and no recent activity at all — which is
 * what PROJ-02's evaluator classifies as stale, and what the old fact block
 * reported as zero.
 */
async function seed(
  workspaceId: string,
  options: {
    readonly projects?: number;
    readonly stalledProjects?: number;
    readonly inboxTasks?: number;
    readonly goals?: number;
  } = {},
): Promise<{ readonly setAsideGoalId: string }> {
  const spine = makeSpineRepository(makeContext(workspaceId));
  const tasks = makeTaskRepository(makeContext(workspaceId));
  const details = makeGoalDetailsRepository(makeContext(workspaceId));

  const area = await spine.createArea({ title: `Area ${workspaceId}` });
  const goalIds: string[] = [];
  for (let index = 0; index < (options.goals ?? 2); index += 1) {
    const goal = await spine.createGoal({
      title: `Goal ${index} ${workspaceId}`,
      areaId: area.id,
    });
    goalIds.push(goal.id);
  }

  for (let index = 0; index < (options.projects ?? 2); index += 1) {
    const project = await spine.createProject({
      title: `Project ${index} ${workspaceId}`,
      parent: { kind: "goal", id: goalIds[0] as string },
    });
    await tasks.createTask({
      title: `Open task ${index} ${workspaceId}`,
      parent: { kind: "project", id: project.id },
    });
  }

  for (let index = 0; index < (options.stalledProjects ?? 0); index += 1) {
    const project = await spine.createProject({
      title: `Stalled ${index} ${workspaceId}`,
      parent: { kind: "area", id: area.id },
    });
    await tasks.createTask({
      title: `Forgotten ${index} ${workspaceId}`,
      parent: { kind: "project", id: project.id },
    });
  }

  for (let index = 0; index < (options.inboxTasks ?? 0); index += 1) {
    await tasks.createTask({ title: `Inbox ${index} ${workspaceId}` });
  }

  /*
   * The owner's own recorded judgement (STEER-02). It is the case DEBT-91's
   * V2.6 amendment widened the closing condition for: an assistant without it
   * describes a Goal the owner deliberately put down as neglected.
   */
  const setAsideGoalId = goalIds[goalIds.length - 1] as string;
  await details.update(setAsideGoalId, { condition: "set_aside" });
  return { setAsideGoalId };
}

function reviewInput(review: Review) {
  return {
    reviewId: review.id,
    periodStart: review.periodStart,
    periodEnd: review.periodEnd,
    todayIso: TODAY,
    timezone: TIMEZONE,
    now: NOW,
  };
}

function guideInput(review: Review) {
  return {
    review,
    stepId: "projects" as const,
    now: NOW,
    timezone: TIMEZONE,
    todayIso: TODAY,
    formatDate: (iso: string) => iso,
  };
}

beforeEach(async () => {
  reviewRepos.clear();
  await resetTables([WS, OTHER]);
});

/* -------------------------------------------------------------------------- */
/* DEBT-91                                                                     */
/* -------------------------------------------------------------------------- */

describe("the Weekly Review fact block agrees with the guided Review", () => {
  it("reports a NON-ZERO stalled count, where the old block hard-coded zero", async () => {
    await seed(WS, { projects: 2, stalledProjects: 3 });
    const review = await weeklyReview();
    const scope = scopeFor();

    const { facts } = await buildReviewFactBlock(scope, reviewInput(review));
    const step = await loadReviewGuideStepData(scope, guideInput(review), 0);
    if (step.kind !== "projects") throw new Error("unreachable");

    // The guided Review's own evaluator, over the same period.
    const stalledInStep = step.projects.projects.filter(
      (project) => project.health?.state === "stale",
    ).length;

    expect(stalledInStep).toBeGreaterThan(0);
    expect(facts.stalledProjects).toBe(stalledInStep);
  });

  it("agrees on at-risk, open Projects and the period's completions", async () => {
    await seed(WS, { projects: 3, stalledProjects: 2 });
    const review = await weeklyReview();
    const scope = scopeFor();

    const { facts } = await buildReviewFactBlock(scope, reviewInput(review));
    const step = await loadReviewGuideStepData(scope, guideInput(review), 0);
    if (step.kind !== "projects") throw new Error("unreachable");

    const atRiskInStep = step.projects.projects.filter(
      (project) =>
        project.health?.state === "at_risk" ||
        project.health?.state === "blocked",
    ).length;
    expect(facts.projectsAtRisk).toBe(atRiskInStep);

    // Both surfaces read the same bounded page of open Projects.
    expect(facts.activeProjects).toBe(
      step.projects.projects.filter((project) => !project.completedInThisPeriod)
        .length,
    );
  });

  it("sees a next action wherever the guided Review's step sees one", async () => {
    /*
     * The fact block asks STEER-04's canonical per-Project read; the step scans
     * a bounded page of the most actionable work. The canonical read is a
     * SUPERSET by construction, so the honest relation is containment rather
     * than equality — and a Project the step can see a next action for must
     * never be one the block calls stuck.
     */
    await seed(WS, { projects: 4 });
    const review = await weeklyReview();
    const scope = scopeFor();

    const { facts } = await buildReviewFactBlock(scope, reviewInput(review));
    const step = await loadReviewGuideStepData(scope, guideInput(review), 0);
    if (step.kind !== "projects") throw new Error("unreachable");

    const withoutInStep = step.projects.projects.filter(
      (project) => project.openTasks > 0 && project.nextAction === null,
    ).length;
    expect(facts.projectsWithoutNextAction).toBeLessThanOrEqual(withoutInStep);
  });

  it("reports a SET ASIDE Goal as set aside, never as neglected", async () => {
    const { setAsideGoalId } = await seed(WS, { goals: 3 });
    const review = await weeklyReview();

    const { block, facts } = await buildReviewFactBlock(
      scopeFor(),
      reviewInput(review),
    );

    expect(facts.goalsSetAside).toBe(1);
    const counted = block.facts.find((fact) =>
      fact.label.includes("deliberately set aside"),
    );
    expect(counted?.display).toBe("1");
    expect(counted?.note).toContain("recorded this decision");

    const named = block.facts.filter(
      (fact) => fact.reference?.id === setAsideGoalId,
    );
    expect(named.length).toBeGreaterThan(0);
    expect(
      named.some((fact) => (fact.note ?? "").includes("deliberately set")),
    ).toBe(true);
    /*
     * No fact LABEL judges the owner. The notes deliberately use the word
     * "neglect" — to forbid it — so the scan is over what the block ASSERTS
     * rather than over what it warns against.
     */
    const labels = block.facts
      .map((fact) => fact.label.toLowerCase())
      .join(" ");
    for (const word of ["neglect", "abandon", "failed", "lazy", "behind"]) {
      expect(labels, word).not.toContain(word);
    }
  });

  it("counts what the period actually holds, not what is merely open", async () => {
    await seed(WS, { projects: 1, inboxTasks: 4 });
    const review = await weeklyReview();
    const { facts } = await buildReviewFactBlock(
      scopeFor(),
      reviewInput(review),
    );
    expect(facts.inboxRemaining).toBe(4);
    expect(facts.tasksCompleted).toBe(0);
    expect(facts.periodStart).toBe(review.periodStart);
    expect(facts.periodEnd).toBe(review.periodEnd);
  });
});

/* -------------------------------------------------------------------------- */
/* The absences                                                                */
/* -------------------------------------------------------------------------- */

describe("what a fact block never contains", () => {
  it("carries no Diary entry and no Person, on a workspace that has both", async () => {
    await seed(WS, { projects: 2 });
    const diary = makeDiaryRepository(makeContext(WS));
    const people = makePersonRepository(makeContext(WS));
    await diary.create({
      entryType: "note",
      title: "A private reflection nobody else should read",
      body: "Nothing here belongs in a prompt.",
    });
    await people.create({ title: "Someone Private" });

    const review = await weeklyReview();
    const { block } = await buildReviewFactBlock(
      scopeFor(),
      reviewInput(review),
    );
    const serialised = JSON.stringify(block);
    expect(serialised).not.toContain("private reflection");
    expect(serialised).not.toContain("belongs in a prompt");
    expect(serialised).not.toContain("Someone Private");
    expect(block.facts.every((fact) => fact.reference?.kind !== "review")).toBe(
      true,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Workspace isolation                                                         */
/* -------------------------------------------------------------------------- */

describe("a neighbouring workspace reaches no fact", () => {
  it("keeps the Weekly Review block inside its own workspace", async () => {
    await seed(WS, { projects: 2, stalledProjects: 1 });
    await seed(OTHER, { projects: 5, stalledProjects: 5, inboxTasks: 9 });
    const review = await weeklyReview(WS);

    const { block, facts } = await buildReviewFactBlock(
      scopeFor(undefined, WS),
      reviewInput(review),
    );
    expect(JSON.stringify(block)).not.toContain(OTHER);
    expect(facts.activeProjects).toBe(3);
    expect(facts.inboxRemaining).toBe(0);
  });

  it("keeps every grounded Ask intent inside its own workspace", async () => {
    await seed(WS, { projects: 1, goals: 2 });
    await seed(OTHER, { projects: 6, goals: 6, inboxTasks: 4 });

    const obligations = makeObligationRepository(makeContext(OTHER));
    await obligations.create({
      title: `Foreign renewal ${OTHER}`,
      category: "insurance",
      dueDate: "2027-08-20",
    });

    const scope = scopeFor(undefined, WS);
    const intents = [
      { intent: "goal_movement", days: 90, assumptions: [] },
      { intent: "project_health", assumptions: [] },
      { intent: "obligation_horizon", days: 60, assumptions: [] },
      {
        intent: "finance_comparison",
        later: {
          startIso: "2027-08-01",
          endIso: "2027-08-31",
          label: "August 2027",
        },
        earlier: {
          startIso: "2027-07-01",
          endIso: "2027-07-31",
          label: "July 2027",
        },
        assumptions: [],
      },
    ] as const;

    for (const request of intents) {
      const block = await buildGroundedFacts(request, {
        scope,
        todayIso: TODAY,
        timeZone: TIMEZONE,
        question: "test",
        now: NOW,
      });
      const serialised = JSON.stringify(block);
      expect(serialised, request.intent).not.toContain(OTHER);
      expect(serialised, request.intent).not.toContain("Foreign renewal");
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Cost                                                                        */
/* -------------------------------------------------------------------------- */

describe("the block costs the same whatever the workspace holds", () => {
  it("builds the Weekly Review block with no N+1", async () => {
    await seed(WS, { projects: 3, goals: 2, inboxTasks: 2 });
    const small: Counter = { count: 0 };
    const smallReview = await weeklyReview();
    await buildReviewFactBlock(scopeFor(small), reviewInput(smallReview));

    reviewRepos.clear();
    await resetTables([WS, OTHER]);
    await seed(WS, { projects: 15, goals: 8, inboxTasks: 30 });
    const large: Counter = { count: 0 };
    const largeReview = await weeklyReview();
    await buildReviewFactBlock(scopeFor(large), reviewInput(largeReview));

    expect(large.count).toBe(small.count);
    // A bound worth stating: this is one owner action, not a page load.
    expect(small.count).toBeLessThan(40);
  });

  it("builds an obligation horizon in a flat number of statements", async () => {
    const obligations = makeObligationRepository(makeContext(WS));
    for (let index = 0; index < 3; index += 1) {
      await obligations.create({
        title: `Renewal ${index}`,
        category: "insurance",
        dueDate: "2027-08-20",
      });
    }
    const few: Counter = { count: 0 };
    await buildGroundedFacts(
      { intent: "obligation_horizon", days: 60, assumptions: [] },
      {
        scope: scopeFor(few),
        todayIso: TODAY,
        timeZone: TIMEZONE,
        question: "what falls due?",
        now: NOW,
      },
    );

    for (let index = 3; index < 20; index += 1) {
      await obligations.create({
        title: `Renewal ${index}`,
        category: "insurance",
        dueDate: "2027-08-21",
      });
    }
    const many: Counter = { count: 0 };
    await buildGroundedFacts(
      { intent: "obligation_horizon", days: 60, assumptions: [] },
      {
        scope: scopeFor(many),
        todayIso: TODAY,
        timeZone: TIMEZONE,
        question: "what falls due?",
        now: NOW,
      },
    );

    expect(many.count).toBe(few.count);
  });
});
