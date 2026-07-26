import { describe, expect, it } from "vitest";

import {
  areaDependencyBlockers,
  areaStateLabel,
  rollupProgress,
  serializeAreaRollup,
  toAreaCardData,
} from "~/modules/areas/area-view";
import type { AreaRollup } from "~/kernel/spine";

const rollup: AreaRollup = {
  kind: "area",
  goals: { total: 2, completed: 1, ratio: 0.5 },
  projects: { total: 3, completed: 1, ratio: 1 / 3 },
  tasks: { total: 4, completed: 2, ratio: 0.5 },
};

describe("Area view model", () => {
  it("serializes rollups without changing completion semantics", () => {
    expect(serializeAreaRollup(rollup)).toEqual({
      kind: "area",
      goals: { total: 2, completed: 1, ratio: 0.5 },
      projects: { total: 3, completed: 1, ratio: 1 / 3 },
      tasks: { total: 4, completed: 2, ratio: 0.5 },
    });
  });

  it("presents empty rollups as empty, never complete", () => {
    expect(
      rollupProgress({ total: 0, completed: 0, ratio: null }, "task"),
    ).toEqual({
      has: false,
      total: 0,
      completed: 0,
      percent: 0,
      summary: "No tasks yet",
    });
  });

  it("labels Areas as permanent, not completable", () => {
    expect(areaStateLabel()).toEqual({ label: "Permanent", tone: "neutral" });
  });

  it("labels an archived Area as Archived (state carried by text, not colour)", () => {
    expect(areaStateLabel(true)).toEqual({
      label: "Archived",
      tone: "neutral",
    });
  });

  it("builds grouped, plural-correct, non-zero dependency blockers with links where practical", () => {
    const blockers = areaDependencyBlockers({
      areaId: "a1",
      goals: 1,
      projects: 2,
      tasks: 0,
      notes: 3,
      diary: 0,
      other: 0,
    });
    expect(blockers.map((b) => b.label)).toEqual([
      "1 Goal",
      "2 Projects",
      "3 linked Notes",
    ]);
    // Goals/Projects link to the Area's own tabs; a zero-count kind is omitted.
    expect(blockers[0]?.href).toBe("/areas/a1?tab=goals");
    expect(blockers.some((b) => b.id === "tasks")).toBe(false);
  });

  it("maps long Area card data with deterministic progress summaries", () => {
    const card = toAreaCardData({
      id: "area-long",
      title: "A very long Area title that should wrap across several lines",
      createdAt: "2026-07-18T00:00:00.000Z",
      updatedAt: "2026-07-20T00:00:00.000Z",
      rollup: serializeAreaRollup(rollup),
      activeProjectCount: 2,
      completedProjectCount: 1,
    });
    expect(card.title).toContain("very long Area");
    expect(card.tasks.summary).toBe("2 of 4 tasks");
    expect(card.updatedLabel).toMatch(/Updated/);
  });
});
