/**
 * REVIEW-02 — the bounded review-context projection against real D1.
 *
 * These are the tests that make the projection's promises enforceable rather
 * than aspirational: a FIXED query count per step, no N+1 as the workspace grows,
 * workspace isolation on every read, honest bounds, and the derived prior-period
 * focus.
 *
 * Query counting wraps the real D1 binding: every executed statement (and every
 * batch) is one unit. It is deliberately execution-based rather than
 * `prepare`-based, because what costs a round trip is running a statement.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { createActivityActorContext } from "~/kernel/activity";
import { bindWorkspaceRepositories } from "~/platform/workspaces";
import type { WorkspaceScope } from "~/platform/workspaces";
import {
  REVIEW_GUIDE_LIMITS,
  REVIEW_GUIDE_QUERY_BUDGET,
  loadReviewGuideContext,
  loadReviewGuideStepData,
  readReviewInboxRemaining,
} from "~/modules/reviews/guided/review-guide-context";
import type { Review, WeeklyReviewStepId } from "~/kernel/reviews";

import {
  makeContext,
  makeReviewRepository,
  makeSpineRepository,
  makeTaskRepository,
  resetTables,
  FakeClock,
  sequentialIds,
} from "./support";

const WS = "test-guide-context-workspace";
const OTHER = "test-guide-context-other";
const NOW = new Date("2026-08-03T09:00:00.000Z");
const TODAY = "2026-08-03";

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
        if (property === "first" || property === "all" || property === "run" || property === "raw") {
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

/**
 * ONE repository instance per workspace per test. The sequential id generator is
 * stateful, so a fresh repository would restart at `-1` and collide.
 */
const reviewRepos = new Map<string, ReturnType<typeof makeReviewRepository>>();

function reviewsRepo(ws = WS) {
  const existing = reviewRepos.get(ws);
  if (existing) return existing;
  const repo = makeReviewRepository(makeContext(ws), {
    clock: new FakeClock("2026-08-03T09:00:00.000Z").now,
    idGenerator: sequentialIds(`rev-${ws}`),
  });
  reviewRepos.set(ws, repo);
  return repo;
}

async function weeklyReview(ws = WS): Promise<Review> {
  const { review } = await reviewsRepo(ws).create({
    type: "weekly",
    periodStart: "2026-07-27",
    periodEnd: "2026-08-02",
  });
  return review;
}

async function seedWorkspace(
  workspaceId: string,
  options: { readonly projects: number; readonly inboxTasks: number },
) {
  const spine = makeSpineRepository(makeContext(workspaceId));
  const tasks = makeTaskRepository(makeContext(workspaceId));
  const area = await spine.createArea({ title: `Area ${workspaceId}` });
  const goal = await spine.createGoal({
    title: `Goal ${workspaceId}`,
    areaId: area.id,
  });
  for (let index = 0; index < options.projects; index += 1) {
    const project = await spine.createProject({
      title: `Project ${index} ${workspaceId}`,
      parent:
        index % 2 === 0
          ? { kind: "goal", id: goal.id }
          : { kind: "area", id: area.id },
    });
    await tasks.createTask({
      title: `Open task ${index} ${workspaceId}`,
      parent: { kind: "project", id: project.id },
    });
  }
  for (let index = 0; index < options.inboxTasks; index += 1) {
    await tasks.createTask({ title: `Inbox ${index} ${workspaceId}` });
  }
}

function contextInput(review: Review, stepId: WeeklyReviewStepId) {
  return {
    review,
    stepId,
    now: NOW,
    timezone: "Australia/Brisbane",
    todayIso: TODAY,
    formatDate: (iso: string) => iso,
  };
}

beforeEach(async () => {
  reviewRepos.clear();
  await resetTables([WS, OTHER]);
});

/* -------------------------------------------------------------------------- */
/* Bounded, N+1-free queries                                                   */
/* -------------------------------------------------------------------------- */

describe("query bounds", () => {
  it("costs the same number of queries whether the workspace is small or large", async () => {
    await seedWorkspace(WS, { projects: 3, inboxTasks: 2 });
    const review = await weeklyReview();

    const small: Counter = { count: 0 };
    await loadReviewGuideStepData(
      scopeFor(small),
      contextInput(review, "projects"),
      2,
    );

    await resetTables([WS, OTHER]);
    await seedWorkspace(WS, { projects: 15, inboxTasks: 30 });
    const bigReview = await weeklyReview();

    const large: Counter = { count: 0 };
    await loadReviewGuideStepData(
      scopeFor(large),
      contextInput(bigReview, "projects"),
      30,
    );

    expect(large.count).toBe(small.count);
  });

  it("keeps the alignment step N+1-free as Goals and Areas multiply", async () => {
    const spine = makeSpineRepository(makeContext(WS));
    const area = await spine.createArea({ title: "Area" });
    for (let index = 0; index < 3; index += 1) {
      await spine.createGoal({ title: `Goal ${index}`, areaId: area.id });
    }
    const review = await weeklyReview();
    const few: Counter = { count: 0 };
    await loadReviewGuideStepData(
      scopeFor(few),
      contextInput(review, "alignment"),
      0,
    );

    for (let index = 3; index < 10; index += 1) {
      await spine.createGoal({ title: `Goal ${index}`, areaId: area.id });
      await spine.createArea({ title: `Area ${index}` });
    }
    const many: Counter = { count: 0 };
    await loadReviewGuideStepData(
      scopeFor(many),
      contextInput(review, "alignment"),
      0,
    );

    expect(many.count).toBe(few.count);
  });

  it("stays within the declared per-step query budget", async () => {
    await seedWorkspace(WS, { projects: 4, inboxTasks: 3 });
    const review = await weeklyReview();
    for (const stepId of Object.keys(
      REVIEW_GUIDE_QUERY_BUDGET,
    ) as WeeklyReviewStepId[]) {
      const counter: Counter = { count: 0 };
      await loadReviewGuideContext(
        scopeFor(counter),
        contextInput(review, stepId),
      );
      expect({ stepId, count: counter.count }).toEqual({
        stepId,
        count: REVIEW_GUIDE_QUERY_BUDGET[stepId],
      });
    }
  });

  it("never returns more records than its declared bound", async () => {
    await seedWorkspace(WS, {
      projects: REVIEW_GUIDE_LIMITS.projects + 5,
      inboxTasks: REVIEW_GUIDE_LIMITS.inboxPage + 7,
    });
    const review = await weeklyReview();
    const scope = scopeFor();

    const inbox = await loadReviewGuideStepData(
      scope,
      contextInput(review, "inbox"),
      REVIEW_GUIDE_LIMITS.inboxPage + 7,
    );
    expect(inbox.kind).toBe("inbox");
    if (inbox.kind === "inbox") {
      expect(inbox.inbox.tasks.length).toBeLessThanOrEqual(
        REVIEW_GUIDE_LIMITS.inboxPage,
      );
      // The bound never hides the truth: the remaining total is authoritative.
      expect(inbox.inbox.remaining).toBe(REVIEW_GUIDE_LIMITS.inboxPage + 7);
      expect(inbox.inbox.nextCursor).not.toBeNull();
    }

    const projects = await loadReviewGuideStepData(
      scope,
      contextInput(review, "projects"),
      0,
    );
    if (projects.kind === "projects") {
      expect(projects.projects.projects.length).toBeLessThanOrEqual(
        REVIEW_GUIDE_LIMITS.projects,
      );
      expect(projects.projects.hasMore).toBe(true);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Workspace isolation                                                         */
/* -------------------------------------------------------------------------- */

describe("workspace isolation", () => {
  it("never lets another workspace's records into the context", async () => {
    await seedWorkspace(WS, { projects: 2, inboxTasks: 2 });
    await seedWorkspace(OTHER, { projects: 5, inboxTasks: 9 });
    const review = await weeklyReview();
    const scope = scopeFor();

    expect(await readReviewInboxRemaining(scope, TODAY)).toBe(2);

    const projects = await loadReviewGuideStepData(
      scope,
      contextInput(review, "projects"),
      2,
    );
    if (projects.kind === "projects") {
      for (const project of projects.projects.projects) {
        expect(project.title).toContain(WS);
      }
      expect(projects.projects.projects).toHaveLength(2);
    }

    const inbox = await loadReviewGuideStepData(
      scope,
      contextInput(review, "inbox"),
      2,
    );
    if (inbox.kind === "inbox") {
      for (const task of inbox.inbox.tasks) {
        expect(task.title).toContain(WS);
      }
    }

    const alignment = await loadReviewGuideStepData(
      scope,
      contextInput(review, "alignment"),
      2,
    );
    if (alignment.kind === "alignment") {
      for (const goal of alignment.alignment.goals) {
        expect(goal.title).toContain(WS);
      }
      for (const area of alignment.alignment.areas) {
        expect(area.title).toContain(WS);
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* The Project review projection                                               */
/* -------------------------------------------------------------------------- */

describe("the Project review projection", () => {
  it("resolves Area/Goal context, derived health and a deterministic next action", async () => {
    const spine = makeSpineRepository(makeContext(WS));
    const tasks = makeTaskRepository(makeContext(WS));
    const area = await spine.createArea({ title: "Career" });
    const goal = await spine.createGoal({
      title: "Ship V2.1",
      areaId: area.id,
    });
    const project = await spine.createProject({
      title: "Guided review",
      parent: { kind: "goal", id: goal.id },
    });
    const first = await tasks.createTask({
      title: "Design the step model",
      parent: { kind: "project", id: project.id },
      priority: "p1",
    });
    await tasks.createTask({
      title: "Write the docs",
      parent: { kind: "project", id: project.id },
      priority: "p4",
    });

    const review = await weeklyReview();
    const data = await loadReviewGuideStepData(
      scopeFor(),
      contextInput(review, "projects"),
      0,
    );
    expect(data.kind).toBe("projects");
    if (data.kind !== "projects") return;
    const summary = data.projects.projects.find((p) => p.id === project.id);
    expect(summary).toBeDefined();
    expect(summary?.areaTitle).toBe("Career");
    expect(summary?.goalTitle).toBe("Ship V2.1");
    expect(summary?.health).not.toBeNull();
    expect(summary?.openTasks).toBe(2);
    // The documented rule: the highest-ranked actionable Task, never invented.
    expect(summary?.nextAction?.id).toBe(first.id);
  });

  it("reports no next action rather than inventing one", async () => {
    const spine = makeSpineRepository(makeContext(WS));
    await spine.createProject({
      title: "Empty project",
      parent: {
        kind: "area",
        id: (await spine.createArea({ title: "Home" })).id,
      },
    });
    const review = await weeklyReview();
    const data = await loadReviewGuideStepData(
      scopeFor(),
      contextInput(review, "projects"),
      0,
    );
    if (data.kind !== "projects") throw new Error("expected projects");
    expect(data.projects.projects[0]?.nextAction).toBeNull();
    expect(data.projects.projects[0]?.openTasks).toBe(0);
  });

  it("orders blocked or overdue work ahead of quiet work", async () => {
    const spine = makeSpineRepository(makeContext(WS));
    const tasks = makeTaskRepository(makeContext(WS));
    const area = await spine.createArea({ title: "Home" });
    const quiet = await spine.createProject({
      title: "Quiet project",
      parent: { kind: "area", id: area.id },
    });
    await tasks.createTask({
      title: "Someday thing",
      parent: { kind: "project", id: quiet.id },
    });
    const overdue = await spine.createProject({
      title: "Overdue project",
      parent: { kind: "area", id: area.id },
    });
    await tasks.createTask({
      title: "Late thing",
      parent: { kind: "project", id: overdue.id },
      dueDate: "2026-07-01",
    });

    const review = await weeklyReview();
    const data = await loadReviewGuideStepData(
      scopeFor(),
      contextInput(review, "projects"),
      0,
    );
    if (data.kind !== "projects") throw new Error("expected projects");
    const ids = data.projects.projects.map((p) => p.id);
    expect(ids.indexOf(overdue.id)).toBeLessThan(ids.indexOf(quiet.id));
  });

  it("copes calmly with a Project that has no Tasks and a Goal that has none", async () => {
    const spine = makeSpineRepository(makeContext(WS));
    const area = await spine.createArea({ title: "Finance" });
    await spine.createGoal({ title: "Goal with no Projects", areaId: area.id });
    await spine.createProject({
      title: "Project with no Tasks",
      parent: { kind: "area", id: area.id },
    });
    const review = await weeklyReview();
    const scope = scopeFor();

    const projects = await loadReviewGuideStepData(
      scope,
      contextInput(review, "projects"),
      0,
    );
    if (projects.kind !== "projects") throw new Error("expected projects");
    expect(projects.projects.unavailable).toBe(false);
    expect(projects.projects.projects[0]?.openTasks).toBe(0);

    const alignment = await loadReviewGuideStepData(
      scope,
      contextInput(review, "alignment"),
      0,
    );
    if (alignment.kind !== "alignment") throw new Error("expected alignment");
    expect(alignment.alignment.goals[0]?.contributingProjects).toBe(0);
    expect(alignment.alignment.projectsWithoutGoal).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Empty workspace                                                             */
/* -------------------------------------------------------------------------- */

describe("an empty workspace", () => {
  it("returns calm zeroes for every step rather than failing", async () => {
    const review = await weeklyReview();
    const scope = scopeFor();
    expect(await readReviewInboxRemaining(scope, TODAY)).toBe(0);

    for (const stepId of [
      "overview",
      "inbox",
      "projects",
      "alignment",
      "reflection",
      "focus",
      "complete",
    ] as WeeklyReviewStepId[]) {
      const data = await loadReviewGuideStepData(
        scope,
        contextInput(review, stepId),
        0,
      );
      expect(data.kind).toBeDefined();
      if (data.kind === "period") {
        expect(data.period.tasksCompleted.value).toBe(0);
        expect(data.period.meetings.value).toBe(0);
      }
      if (data.kind === "inbox") {
        expect(data.inbox.tasks).toEqual([]);
        expect(data.inbox.unavailable).toBe(false);
      }
      if (data.kind === "projects") {
        expect(data.projects.projects).toEqual([]);
      }
      if (data.kind === "alignment") {
        expect(data.alignment.goals).toEqual([]);
        expect(data.alignment.areas).toEqual([]);
      }
      if (data.kind === "focus") {
        expect(data.priorFocus).toBeNull();
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Prior-period focus                                                          */
/* -------------------------------------------------------------------------- */

describe("prior-period focus handoff", () => {
  async function completedWeekWithFocus(
    periodStart: string,
    periodEnd: string,
    focus: string,
  ) {
    const repo = reviewsRepo();
    const { review } = await repo.create({
      type: "weekly",
      periodStart,
      periodEnd,
    });
    await repo.updateSection(review.id, "summary.next_focus", focus);
    await repo.complete(review.id);
    return review;
  }

  it("reads the latest completed weekly Review's focus, never a copy", async () => {
    await completedWeekWithFocus("2026-07-13", "2026-07-19", "Older focus");
    const latest = await completedWeekWithFocus(
      "2026-07-20",
      "2026-07-26",
      "Newer focus",
    );
    const current = await weeklyReview();

    const data = await loadReviewGuideStepData(
      scopeFor(),
      contextInput(current, "focus"),
      0,
    );
    if (data.kind !== "focus") throw new Error("expected focus");
    expect(data.priorFocus?.reviewId).toBe(latest.id);
    expect(data.priorFocus?.body).toBe("Newer focus");
    // Nothing was written into the current Review.
    const stored = await reviewsRepo().get(current.id);
    expect(
      stored?.sections.find((s) => s.sectionId === "summary.next_focus")?.body,
    ).toBe("");
  });

  it("stops offering a focus the moment its Review is reopened", async () => {
    const prior = await completedWeekWithFocus(
      "2026-07-20",
      "2026-07-26",
      "Was the focus",
    );
    const current = await weeklyReview();
    const scope = scopeFor();

    let data = await loadReviewGuideStepData(
      scope,
      contextInput(current, "focus"),
      0,
    );
    if (data.kind !== "focus") throw new Error("expected focus");
    expect(data.priorFocus?.reviewId).toBe(prior.id);

    await reviewsRepo().reopen(prior.id);
    data = await loadReviewGuideStepData(
      scope,
      contextInput(current, "focus"),
      0,
    );
    if (data.kind !== "focus") throw new Error("expected focus");
    expect(data.priorFocus).toBeNull();
  });

  it("returns nothing when no Review is complete", async () => {
    const current = await weeklyReview();
    const data = await loadReviewGuideStepData(
      scopeFor(),
      contextInput(current, "focus"),
      0,
    );
    if (data.kind !== "focus") throw new Error("expected focus");
    expect(data.priorFocus).toBeNull();
  });

  it("never lets another workspace's completed Review supply the focus", async () => {
    const otherRepo = reviewsRepo(OTHER);
    const { review: otherReview } = await otherRepo.create({
      type: "weekly",
      periodStart: "2026-07-20",
      periodEnd: "2026-07-26",
    });
    await otherRepo.updateSection(
      otherReview.id,
      "summary.next_focus",
      "Someone else’s focus",
    );
    await otherRepo.complete(otherReview.id);

    const current = await weeklyReview();
    const data = await loadReviewGuideStepData(
      scopeFor(),
      contextInput(current, "focus"),
      0,
    );
    if (data.kind !== "focus") throw new Error("expected focus");
    expect(data.priorFocus).toBeNull();
  });
});
