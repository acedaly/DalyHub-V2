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
import {
  buildFactBlock,
  identifyFactBlock,
  type AiPreferences,
} from "~/kernel/ai";
import type { Review } from "~/kernel/reviews";
import { buildReviewFactBlock } from "~/modules/ai/review-facts";
import { loadReviewGuideStepData } from "~/modules/reviews/guided/review-guide-context";
import {
  EMPTY_CANDIDATES,
  buildGroundedFacts,
  resolveAiConfiguration,
  runAiRequest,
} from "~/platform/ai";
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

  /*
   * "What do I need to deal with in the next 60 days?" is a question about work
   * still owed. `readObligationPage` returns every status by default, so an
   * unfiltered read names commitments the owner has already DISMISSED or put ON
   * HOLD as though they were outstanding -- the assistant being confidently
   * wrong about something they have already dealt with, which is worse than
   * saying nothing at all.
   */
  it("names no commitment the owner has already dismissed or held", async () => {
    const obligations = makeObligationRepository(makeContext(WS));
    const live = await obligations.create({
      title: "Renew the house insurance",
      category: "insurance",
      dueDate: "2027-08-20",
    });
    const dismissed = await obligations.create({
      title: "Cancel the old gym membership",
      category: "insurance",
      dueDate: "2027-08-21",
    });
    const held = await obligations.create({
      title: "Service the mower, eventually",
      category: "insurance",
      dueDate: "2027-08-22",
    });
    await obligations.setStatus(dismissed.id, "dismissed");
    await obligations.setStatus(held.id, "on_hold");

    const block = await buildGroundedFacts(
      { intent: "obligation_horizon", days: 60, assumptions: [] },
      {
        scope: scopeFor(),
        todayIso: TODAY,
        timeZone: TIMEZONE,
        question: "what do I need to deal with?",
        now: NOW,
      },
    );

    const serialised = JSON.stringify(block);
    expect(serialised).toContain("Renew the house insurance");
    expect(serialised).not.toContain("Cancel the old gym membership");
    expect(serialised).not.toContain("Service the mower");
    // And the COUNT agrees with the names: one open commitment, not three.
    const count = block.facts.find((fact) => fact.value.kind === "count");
    expect(count?.value).toEqual({ kind: "count", count: 1 });
    expect(live.id.length).toBeGreaterThan(0);
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

/* -------------------------------------------------------------------------- */
/* The gateway, end to end                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The development provider through the REAL runtime, against real D1.
 *
 * This is what GROUND-00 exists to make possible, and it is deliberately here
 * rather than in the browser suite. `e2e/ai-assistance.spec.ts` records the
 * reason and it still holds: the off-state journeys assert that the local
 * development server has NO provider, and enabling one globally on that server
 * would make those assertions measure a fixture instead of the product. So the
 * provider path is proven where every layer of it is real except the network —
 * preference gate, feature policy, fact bounds, token estimate, budget
 * reservation, the `ai_usage_requests` row, schema validation, citation
 * validation, numeric grounding, reconciliation and release — and the browser
 * suite goes on proving the off state it was written to prove.
 */
describe("the development provider drives the real gateway", () => {
  const CONFIGURED = { AI_FAKE_PROVIDER: "1", ENVIRONMENT: "test" } as const;

  /**
   * One ledger row, read straight out of D1 by its idempotency key.
   *
   * Deliberately raw rather than through the repository: what is under test is
   * what was WRITTEN, and a projection could hide a column. Every assertion
   * over it is about metadata — a state, a code, a token count — and the
   * privacy assertion is over the serialised row exactly because a column name
   * is not the claim.
   */
  async function ledgerRow(
    key: string,
  ): Promise<Record<string, unknown> | null> {
    return env.DB.prepare(
      "SELECT * FROM ai_usage_requests WHERE idempotency_key = ?",
    )
      .bind(key)
      .first();
  }

  async function enableAi(scope: WorkspaceScope): Promise<AiPreferences> {
    const { preferences } = await scope.aiPreferences.update("owner-1", {
      enabled: true,
    });
    return preferences;
  }

  async function explain(
    scope: WorkspaceScope,
    block: Awaited<ReturnType<typeof buildReviewFactBlock>>["block"],
    options: { readonly scenario?: string; readonly key?: string } = {},
  ) {
    return runAiRequest({
      featureId: "report-explanation",
      ownerId: "owner-1",
      preferences: await enableAi(scope),
      configuration: resolveAiConfiguration(CONFIGURED, {
        fakeScenario: options.scenario,
      }),
      usage: scope.aiUsage,
      evidence: {
        items: [],
        truncated: false,
        consideredCount: 0,
        sensitiveCategories: [],
        excludedCategories: [],
        totalCharacters: 0,
      },
      candidates: EMPTY_CANDIDATES,
      factBlock: block,
      derivedFacts: "",
      idempotencyKey: options.key ?? `e2e-${Date.now()}-${Math.random()}`,
      now: NOW,
    });
  }

  async function reviewBlock(scope: WorkspaceScope) {
    await seed(WS, { projects: 2, goals: 2 });
    const review = await weeklyReview();
    const { block } = await buildReviewFactBlock(scope, reviewInput(review));
    return identifyFactBlock(block);
  }

  it("answers, validates, and writes ONE metadata-only ledger row", async () => {
    const scope = scopeFor();
    const block = await reviewBlock(scope);

    const outcome = await explain(scope, block, { key: "kernel-explain-ok" });
    expect(outcome.result.kind).toBe("grounded_explanation");
    expect(outcome.detail.factCount).toBe(block.facts.length);
    expect(outcome.detail.factBlockId).toBe(block.id);

    const row = await scope.aiUsage.get(outcome.usageId);
    expect(row?.state).toBe("succeeded");
    expect(row?.featureId).toBe("report-explanation");
    expect(row?.inputTokens).toBeGreaterThan(0);

    /*
     * Metadata only. The ledger row is serialised whole and searched for the
     * things a fact carries — a figure, a label, a currency — because the
     * privacy claim is about what is STORED, not about what a column is called.
     */
    const stored = JSON.stringify(row);
    for (const label of block.facts.map((fact) => fact.label)) {
      expect(stored).not.toContain(label);
    }
    for (const display of block.facts.map((fact) => fact.display)) {
      if (display.length < 3) continue;
      expect(stored).not.toContain(display);
    }
  });

  it("refuses a fabricated figure and records the failure honestly", async () => {
    const scope = scopeFor();
    const block = await reviewBlock(scope);

    await expect(
      explain(scope, block, {
        scenario: "fabricated_figure",
        key: "kernel-explain-fabricated",
      }),
    ).rejects.toMatchObject({ code: "provider_response_invalid" });

    const failed = await ledgerRow("kernel-explain-fabricated");
    expect(failed?.state).toBe("failed");
    expect(failed?.failure_code).toBe("provider_response_invalid");
    /*
     * The provider PERFORMED the work, so the tokens are owed whether or not
     * DalyHub liked the answer. Releasing the whole reservation here would make
     * repeated invalid answers free in the budget and expensive in the owner's
     * account, which is the one thing the budget must never get wrong.
     */
    expect(failed?.input_tokens).toBeGreaterThan(0);
  });

  it("refuses a citation of a fact it was never given", async () => {
    const scope = scopeFor();
    const block = await reviewBlock(scope);
    await expect(
      explain(scope, block, {
        scenario: "unknown_fact",
        key: "kernel-explain-unknown",
      }),
    ).rejects.toMatchObject({ code: "provider_response_invalid" });
  });

  it("releases the whole reservation when the provider performed nothing", async () => {
    const scope = scopeFor();
    const block = await reviewBlock(scope);
    await expect(
      explain(scope, block, {
        scenario: "timeout",
        key: "kernel-explain-timeout",
      }),
    ).rejects.toMatchObject({ code: "provider_timeout" });

    const failed = await ledgerRow("kernel-explain-timeout");
    expect(failed?.state).toBe("failed");
    expect(failed?.failure_code).toBe("provider_timeout");
    expect(failed?.estimated_micro_usd).toBe(0);
    expect(failed?.input_tokens).toBeNull();
  });

  it("refuses before contacting anything when AI is switched off", async () => {
    const scope = scopeFor();
    const block = await reviewBlock(scope);
    const preferences = await scope.aiPreferences.get("owner-1");

    await expect(
      runAiRequest({
        featureId: "report-explanation",
        ownerId: "owner-1",
        preferences,
        configuration: resolveAiConfiguration(CONFIGURED),
        usage: scope.aiUsage,
        evidence: {
          items: [],
          truncated: false,
          consideredCount: 0,
          sensitiveCategories: [],
          excludedCategories: [],
          totalCharacters: 0,
        },
        candidates: EMPTY_CANDIDATES,
        factBlock: block,
        derivedFacts: "",
        idempotencyKey: "kernel-explain-disabled",
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "ai_disabled" });

    // Nothing was reserved: a refusal before the provider costs nothing.
    expect(await ledgerRow("kernel-explain-disabled")).toBeNull();
  });

  it("refuses a grounded request with no facts, before a provider exists", async () => {
    const scope = scopeFor();
    const empty = await identifyFactBlock(
      buildFactBlock({
        intent: "report_explanation",
        question: "q",
        subject: "s",
        facts: [],
      }),
    );
    await expect(
      explain(scope, empty, { key: "kernel-explain-empty" }),
    ).rejects.toMatchObject({ code: "evidence_unavailable" });
  });

  /*
   * AI-04's consent boundary, over facts.
   *
   * Evidence carries a privacy category per item and the retriever filters by
   * them; a FACT carries no excerpt, so its builder declares what it read and
   * this check is the only thing standing between "why was August more
   * expensive than July?" and money leaving the workspace. `financial` is NOT
   * in the default allowed set, so the very first spending question is the case
   * that matters.
   */
  it("refuses to SEND a financial block the owner has not allowed", async () => {
    const scope = scopeFor();
    const money = await identifyFactBlock(
      buildFactBlock({
        intent: "finance_comparison",
        question: "Why was August more expensive than July?",
        subject: "Spending",
        categories: ["general", "financial"],
        facts: [
          {
            label: "Total spending in August 2027",
            value: { kind: "money", minorUnits: 241032, currencyCode: "AUD" },
            display: "A$2,410.32",
          },
        ],
      }),
    );

    await expect(
      explain(scope, money, { key: "kernel-explain-consent" }),
    ).rejects.toMatchObject({ code: "consent_required" });

    // Nothing reserved, nothing spent: the refusal happens before the budget.
    expect(await ledgerRow("kernel-explain-consent")).toBeNull();
  });

  it("sends the same block once the owner allows financial content", async () => {
    const scope = scopeFor();
    const money = await identifyFactBlock(
      buildFactBlock({
        intent: "finance_comparison",
        question: "Why was August more expensive than July?",
        subject: "Spending",
        categories: ["general", "financial"],
        facts: [
          {
            label: "Total spending in August 2027",
            value: { kind: "money", minorUnits: 241032, currencyCode: "AUD" },
            display: "A$2,410.32",
          },
        ],
      }),
    );
    await scope.aiPreferences.update("owner-1", {
      enabled: true,
      allowedCategories: ["general", "financial"],
    });
    const preferences = await scope.aiPreferences.get("owner-1");

    const outcome = await runAiRequest({
      featureId: "report-explanation",
      ownerId: "owner-1",
      preferences,
      configuration: resolveAiConfiguration(CONFIGURED),
      usage: scope.aiUsage,
      evidence: {
        items: [],
        truncated: false,
        consideredCount: 0,
        sensitiveCategories: [],
        excludedCategories: [],
        totalCharacters: 0,
      },
      candidates: EMPTY_CANDIDATES,
      factBlock: money,
      derivedFacts: "",
      idempotencyKey: "kernel-explain-consented",
      now: NOW,
    });
    expect(outcome.result.kind).toBe("grounded_explanation");
  });
});
