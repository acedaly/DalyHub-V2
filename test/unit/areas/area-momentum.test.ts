import { describe, expect, it } from "vitest";

import {
  evaluateAreaMomentum,
  type AreaMomentumFacts,
  type AreaMomentumProjectFacts,
} from "~/kernel/areas";

import { stubHealth } from "../../support/project-health";

const EVALUATED = { evaluatedAtIso: "2026-07-22T02:00:00.000Z" };

function facts(overrides: Partial<AreaMomentumFacts> = {}): AreaMomentumFacts {
  return {
    goals: { openTotal: 0, completedTotal: 0 },
    directTasks: { unfinishedTotal: 0, completedTotal: 0 },
    projects: [],
    ...overrides,
  };
}

function project(
  overrides: Partial<AreaMomentumProjectFacts> = {},
): AreaMomentumProjectFacts {
  return {
    id: "p1",
    status: "active",
    completedAt: null,
    archivedAt: null,
    ...overrides,
  };
}

/** Assert no reason in the result ever reports a zero count. */
function expectNoZeroCountReason(
  momentum: ReturnType<typeof evaluateAreaMomentum>,
) {
  for (const reason of momentum.reasons) {
    if (reason.count !== undefined) {
      expect(reason.count).toBeGreaterThan(0);
    }
  }
}

describe("Area momentum", () => {
  it("labels a completely empty Area as no active work, never healthy", () => {
    const momentum = evaluateAreaMomentum(facts(), EVALUATED);
    expect(momentum.state).toBe("empty");
    expect(momentum.label).toBe("No active work");
    expect(momentum.reasons).toEqual([
      { code: "no_active_work", summary: expect.any(String) },
    ]);
    expectNoZeroCountReason(momentum);
  });

  it("treats an Area with only completed Goals as no active work", () => {
    const momentum = evaluateAreaMomentum(
      facts({ goals: { openTotal: 0, completedTotal: 1 } }),
      EVALUATED,
    );
    expect(momentum.state).toBe("empty");
    expect(momentum.reasons.map((r) => r.code)).toEqual(["no_active_work"]);
    expectNoZeroCountReason(momentum);
  });

  it("treats an Area with only completed direct Tasks as no active work", () => {
    const momentum = evaluateAreaMomentum(
      facts({ directTasks: { unfinishedTotal: 0, completedTotal: 2 } }),
      EVALUATED,
    );
    expect(momentum.state).toBe("empty");
    expect(momentum.reasons.map((r) => r.code)).toEqual(["no_active_work"]);
    expectNoZeroCountReason(momentum);
  });

  it("treats a completed Project with only completed Project Tasks as no active work", () => {
    // The Project itself is complete; its tasks (also complete) must never surface
    // as a "direct Area Task" reason and must not make the Area look active.
    const momentum = evaluateAreaMomentum(
      facts({
        projects: [project({ completedAt: "2026-07-20T00:00:00.000Z" })],
      }),
      EVALUATED,
    );
    expect(momentum.state).toBe("empty");
    expect(momentum.reasons.map((r) => r.code)).toEqual([
      "no_active_work",
      "completed_projects_ignored",
    ]);
    expectNoZeroCountReason(momentum);
  });

  it("gives honest, non-zero wording for one open Goal with no Projects or Tasks", () => {
    const momentum = evaluateAreaMomentum(
      facts({ goals: { openTotal: 1, completedTotal: 0 } }),
      EVALUATED,
    );
    expect(momentum.state).toBe("watch");
    expect(momentum.reasons[0]).toMatchObject({ code: "open_goals", count: 1 });
    expect(momentum.reasons.map((r) => r.code)).not.toContain(
      "active_projects",
    );
    expect(momentum.reasons.map((r) => r.code)).not.toContain(
      "unfinished_direct_tasks",
    );
    expectNoZeroCountReason(momentum);
  });

  it("reports one unfinished direct Area Task as steady, correctly attributed", () => {
    const momentum = evaluateAreaMomentum(
      facts({ directTasks: { unfinishedTotal: 1, completedTotal: 0 } }),
      EVALUATED,
    );
    expect(momentum.state).toBe("steady");
    expect(momentum.reasons[0]).toMatchObject({
      code: "unfinished_direct_tasks",
      count: 1,
    });
    expect(momentum.reasons[0]?.summary).toMatch(/direct Area Task/);
    expectNoZeroCountReason(momentum);
  });

  it("never describes a Planned-only Project as active momentum", () => {
    const momentum = evaluateAreaMomentum(
      facts({ projects: [project({ status: "planned" })] }),
      EVALUATED,
    );
    expect(momentum.state).toBe("watch");
    expect(momentum.label).toBe("Work planned");
    expect(momentum.reasons[0]).toMatchObject({
      code: "planned_projects",
      count: 1,
    });
    expectNoZeroCountReason(momentum);
  });

  it("labels an On-hold-only Project as mostly paused, not active", () => {
    const momentum = evaluateAreaMomentum(
      facts({ projects: [project({ status: "on_hold" })] }),
      EVALUATED,
    );
    expect(momentum.state).toBe("watch");
    expect(momentum.label).toBe("Mostly paused");
    expect(momentum.reasons[0]).toMatchObject({
      code: "on_hold_projects",
      count: 1,
    });
    expectNoZeroCountReason(momentum);
  });

  it("never lets an On-hold Project suppress a genuinely unfinished direct Area Task", () => {
    const momentum = evaluateAreaMomentum(
      facts({
        directTasks: { unfinishedTotal: 1, completedTotal: 0 },
        projects: [project({ status: "on_hold" })],
      }),
      EVALUATED,
    );
    expect(momentum.state).toBe("steady");
    expect(momentum.label).not.toBe("Mostly paused");
    expect(momentum.reasons[0]).toMatchObject({
      code: "unfinished_direct_tasks",
      count: 1,
    });
    expectNoZeroCountReason(momentum);
  });

  it("never lets an On-hold Project suppress a genuine open Goal", () => {
    const momentum = evaluateAreaMomentum(
      facts({
        goals: { openTotal: 1, completedTotal: 0 },
        projects: [project({ status: "on_hold" })],
      }),
      EVALUATED,
    );
    expect(momentum.state).toBe("watch");
    expect(momentum.label).not.toBe("Mostly paused");
    expect(momentum.reasons[0]).toMatchObject({ code: "open_goals", count: 1 });
    expectNoZeroCountReason(momentum);
  });

  it("prefers On-hold-only wording over Planned-only when both coexist with no active work", () => {
    const momentum = evaluateAreaMomentum(
      facts({
        projects: [
          project({ id: "p-hold", status: "on_hold" }),
          project({ id: "p-planned", status: "planned" }),
        ],
      }),
      EVALUATED,
    );
    expect(momentum.state).toBe("watch");
    expect(momentum.label).toBe("Mostly paused");
    expect(momentum.reasons[0]).toMatchObject({
      code: "on_hold_projects",
      count: 1,
    });
    expectNoZeroCountReason(momentum);
  });

  it("reports one healthy active Project as steady momentum", () => {
    const momentum = evaluateAreaMomentum(
      facts({ projects: [project({ health: stubHealth() })] }),
      EVALUATED,
    );
    expect(momentum.state).toBe("steady");
    expect(momentum.reasons[0]).toMatchObject({
      code: "active_projects",
      count: 1,
    });
    expectNoZeroCountReason(momentum);
  });

  it("prioritises at-risk over blocked and stale active Projects", () => {
    const momentum = evaluateAreaMomentum(
      facts({
        projects: [
          project({ id: "p-risk", health: stubHealth({ overdueOpen: 1 }) }),
          project({
            id: "p-blocked",
            health: stubHealth({
              taskTotal: 2,
              taskCompleted: 0,
              waitingOpen: 2,
            }),
          }),
          project({
            id: "p-stale",
            health: stubHealth({
              lastMeaningfulActivityAt: new Date("2026-07-01T00:00:00.000Z"),
            }),
          }),
        ],
      }),
      EVALUATED,
    );
    expect(momentum.state).toBe("needs_attention");
    expect(momentum.reasons[0]?.code).toBe("at_risk_projects");
    expect(momentum.reasons[0]?.count).toBe(1);
  });

  it("labels a blocked active Project as needs_attention when no at-risk Project exists", () => {
    const momentum = evaluateAreaMomentum(
      facts({
        projects: [
          project({
            health: stubHealth({
              taskTotal: 2,
              taskCompleted: 0,
              waitingOpen: 2,
            }),
          }),
        ],
      }),
      EVALUATED,
    );
    expect(momentum.state).toBe("needs_attention");
    expect(momentum.reasons[0]?.code).toBe("blocked_projects");
  });

  it("labels a stale active Project as watch when no at-risk or blocked Project exists", () => {
    const momentum = evaluateAreaMomentum(
      facts({
        projects: [
          project({
            health: stubHealth({
              lastMeaningfulActivityAt: new Date("2026-07-01T00:00:00.000Z"),
            }),
          }),
        ],
      }),
      EVALUATED,
    );
    expect(momentum.state).toBe("watch");
    expect(momentum.reasons[0]?.code).toBe("stale_projects");
  });

  it("ignores a completed Project's warning facts entirely", () => {
    const momentum = evaluateAreaMomentum(
      facts({
        projects: [
          project({
            completedAt: "2026-07-20T00:00:00.000Z",
            health: stubHealth({ overdueOpen: 5 }),
          }),
        ],
      }),
      EVALUATED,
    );
    expect(momentum.state).toBe("empty");
    expect(momentum.reasons.map((r) => r.code)).toEqual([
      "no_active_work",
      "completed_projects_ignored",
    ]);
  });

  it("ignores an archived Project's warning facts entirely", () => {
    const momentum = evaluateAreaMomentum(
      facts({
        projects: [
          project({
            archivedAt: "2026-07-21T00:00:00.000Z",
            health: stubHealth({ overdueOpen: 5 }),
          }),
        ],
      }),
      EVALUATED,
    );
    expect(momentum.state).toBe("empty");
    expect(momentum.reasons.map((r) => r.code)).toEqual([
      "no_active_work",
      "archived_projects_ignored",
    ]);
  });

  it("classifies a Project that is both completed and archived as archived, matching card presentation", () => {
    // Area Project cards give Archived precedence over Completed
    // (`projectStateLabel` in area-view.ts); the momentum evaluator must agree.
    const momentum = evaluateAreaMomentum(
      facts({
        projects: [
          project({
            completedAt: "2026-07-19T00:00:00.000Z",
            archivedAt: "2026-07-21T00:00:00.000Z",
          }),
        ],
      }),
      EVALUATED,
    );
    expect(momentum.state).toBe("empty");
    expect(momentum.reasons.map((r) => r.code)).toEqual([
      "no_active_work",
      "archived_projects_ignored",
    ]);
    expect(momentum.reasons.map((r) => r.code)).not.toContain(
      "completed_projects_ignored",
    );
  });

  it("prefers an active Project over mixed Planned and On-hold Projects", () => {
    const momentum = evaluateAreaMomentum(
      facts({
        projects: [
          project({ id: "p-active", health: stubHealth() }),
          project({ id: "p-planned", status: "planned" }),
          project({ id: "p-onhold", status: "on_hold" }),
        ],
      }),
      EVALUATED,
    );
    expect(momentum.state).toBe("steady");
    expect(momentum.reasons[0]).toMatchObject({
      code: "active_projects",
      count: 1,
    });
    expectNoZeroCountReason(momentum);
  });

  it("keeps completed and archived Projects as context, never a warning", () => {
    const momentum = evaluateAreaMomentum(
      facts({
        goals: { openTotal: 0, completedTotal: 0 },
        directTasks: { unfinishedTotal: 1, completedTotal: 0 },
        projects: [
          project({ id: "done", completedAt: "2026-07-20T00:00:00.000Z" }),
          project({ id: "gone", archivedAt: "2026-07-21T00:00:00.000Z" }),
        ],
      }),
      EVALUATED,
    );
    expect(momentum.state).toBe("steady");
    expect(momentum.reasons.map((r) => r.code)).toEqual([
      "unfinished_direct_tasks",
      "completed_projects_ignored",
      "archived_projects_ignored",
    ]);
    expectNoZeroCountReason(momentum);
  });

  it("never reports a zero-count positive reason across every state", () => {
    const scenarios: AreaMomentumFacts[] = [
      facts(),
      facts({ goals: { openTotal: 0, completedTotal: 3 } }),
      facts({ directTasks: { unfinishedTotal: 0, completedTotal: 3 } }),
      facts({ goals: { openTotal: 1, completedTotal: 2 } }),
      facts({ directTasks: { unfinishedTotal: 1, completedTotal: 0 } }),
      facts({ projects: [project({ status: "planned" })] }),
      facts({ projects: [project({ status: "on_hold" })] }),
      facts({ projects: [project({ health: stubHealth() })] }),
      facts({
        projects: [
          project({ health: stubHealth({ overdueOpen: 1 }) }),
          project({ completedAt: "2026-07-20T00:00:00.000Z" }),
          project({ archivedAt: "2026-07-21T00:00:00.000Z" }),
        ],
      }),
    ];
    for (const scenario of scenarios) {
      expectNoZeroCountReason(evaluateAreaMomentum(scenario, EVALUATED));
    }
  });

  it("evaluates deterministically from the injected clock only", () => {
    const input = facts({ projects: [project({ health: stubHealth() })] });
    const first = evaluateAreaMomentum(input, {
      evaluatedAtIso: "2026-01-01T00:00:00.000Z",
    });
    const second = evaluateAreaMomentum(input, {
      evaluatedAtIso: "2026-01-01T00:00:00.000Z",
    });
    expect(first).toEqual(second);
    expect(first.evaluatedAtIso).toBe("2026-01-01T00:00:00.000Z");

    const third = evaluateAreaMomentum(input, {
      evaluatedAtIso: "2099-12-31T23:59:59.000Z",
    });
    expect(third.evaluatedAtIso).toBe("2099-12-31T23:59:59.000Z");
    expect(third.state).toBe(first.state);
  });
});
