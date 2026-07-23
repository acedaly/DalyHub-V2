import { describe, expect, it } from "vitest";

import { evaluateAreaMomentum } from "~/kernel/areas";
import type { AreaRollup } from "~/kernel/spine";

import { stubHealth } from "../../support/project-health";

const EVALUATED = { evaluatedAtIso: "2026-07-22T02:00:00.000Z" };

function areaRollup(overrides: Partial<AreaRollup> = {}): AreaRollup {
  return {
    kind: "area",
    goals: { total: 0, completed: 0, ratio: null },
    projects: { total: 0, completed: 0, ratio: null },
    tasks: { total: 0, completed: 0, ratio: null },
    ...overrides,
  };
}

describe("Area momentum", () => {
  it("does not label an empty Area as healthy", () => {
    const momentum = evaluateAreaMomentum(
      { rollup: areaRollup(), projects: [] },
      EVALUATED,
    );
    expect(momentum.state).toBe("empty");
    expect(momentum.label).toBe("No active work");
    expect(momentum.reasons[0]?.code).toBe("no_active_work");
  });

  it("prioritises at-risk, blocked, then stale active projects", () => {
    const base = areaRollup({
      projects: { total: 3, completed: 0, ratio: 0 },
      tasks: { total: 6, completed: 1, ratio: 1 / 6 },
    });
    const atRisk = evaluateAreaMomentum(
      {
        rollup: base,
        projects: [
          {
            id: "p-risk",
            completedAt: null,
            archivedAt: null,
            status: "active",
            health: stubHealth({ overdueOpen: 1 }),
          },
          {
            id: "p-blocked",
            completedAt: null,
            archivedAt: null,
            status: "active",
            health: stubHealth({
              taskTotal: 2,
              taskCompleted: 0,
              waitingOpen: 2,
            }),
          },
        ],
      },
      EVALUATED,
    );
    expect(atRisk.state).toBe("needs_attention");
    expect(atRisk.reasons[0]?.code).toBe("at_risk_projects");

    const blocked = evaluateAreaMomentum(
      {
        rollup: base,
        projects: [
          {
            id: "p-blocked",
            completedAt: null,
            archivedAt: null,
            status: "active",
            health: stubHealth({
              taskTotal: 2,
              taskCompleted: 0,
              waitingOpen: 2,
            }),
          },
        ],
      },
      EVALUATED,
    );
    expect(blocked.state).toBe("needs_attention");
    expect(blocked.reasons[0]?.code).toBe("blocked_projects");

    const stale = evaluateAreaMomentum(
      {
        rollup: base,
        projects: [
          {
            id: "p-stale",
            completedAt: null,
            archivedAt: null,
            status: "active",
            health: stubHealth({
              lastMeaningfulActivityAt: new Date("2026-07-01T00:00:00.000Z"),
            }),
          },
        ],
      },
      EVALUATED,
    );
    expect(stale.state).toBe("watch");
    expect(stale.reasons[0]?.code).toBe("stale_projects");
  });

  it("ignores completed and archived projects for active warning signals", () => {
    const momentum = evaluateAreaMomentum(
      {
        rollup: areaRollup({
          projects: { total: 2, completed: 1, ratio: 0.5 },
          tasks: { total: 3, completed: 1, ratio: 1 / 3 },
        }),
        projects: [
          {
            id: "done-risk",
            completedAt: "2026-07-20T00:00:00.000Z",
            archivedAt: null,
            status: "active",
            health: stubHealth({ overdueOpen: 2 }),
          },
          {
            id: "archived-risk",
            completedAt: null,
            archivedAt: "2026-07-21T00:00:00.000Z",
            status: "active",
            health: stubHealth({ overdueOpen: 2 }),
          },
        ],
      },
      EVALUATED,
    );
    expect(momentum.state).toBe("steady");
    expect(momentum.reasons.map((reason) => reason.code)).toContain(
      "completed_projects_ignored",
    );
    expect(momentum.reasons.map((reason) => reason.code)).toContain(
      "archived_projects_ignored",
    );
  });
});
