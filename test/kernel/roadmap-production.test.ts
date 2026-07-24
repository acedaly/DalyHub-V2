import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { createSystemActorContext } from "~/kernel/activity";
import { bindWorkspaceRepositories } from "~/platform/workspaces/composition";
import {
  runRoadmapPlan,
  type RoadmapItemInput,
  type RoadmapRunInput,
} from "../../scripts/roadmap-production-worker";

import {
  countActivities,
  countLinkRows,
  countRows,
  countSpineRows,
  ensureWorkspace,
  makeContext,
  resetTables,
} from "./support";

const WS = "ws_roadmap_production";
const OTHER_WS = "ws_roadmap_production_other";

const OPEN_ITEMS: readonly RoadmapItemInput[] = [
  {
    id: "AREA-04",
    title: "Mobile",
    phase: "Areas & Goals",
    purpose: "Mobile-complete Areas & Goals.",
    dependencies: "DS-11, AREA-01.",
    expectedOutcome: "Areas/Goals usable on a phone.",
    priority: "P3",
    operationalBucket: "Current / Next",
  },
  {
    id: "NOTES-01",
    title: "Note record & Markdown editor",
    phase: "Notes",
    purpose: "Notes as first-class Markdown records.",
    dependencies: "FND-08, DS-02, DS-06.",
    expectedOutcome: "Create/edit/read Markdown notes.",
    priority: "P1",
    operationalBucket: "Current / Next",
  },
  {
    id: "SET-02",
    title: "Backup & restore",
    phase: "Settings & Platform",
    purpose: "Trustworthy backup and restore.",
    dependencies: "FND-02, X-04.",
    expectedOutcome: "Documented, tested backup and restore.",
    priority: "P1",
    operationalBucket: "Later",
  },
];

const COMPLETED_IDS = [
  "FND-01",
  "FND-02",
  "FND-03",
  "FND-04",
  "FND-05",
  "FND-06",
  "FND-07",
  "FND-08",
  "FND-09",
  "DS-01",
  "DS-02",
  "PX-02",
  "TODAY-01",
  "TODAY-02",
  "PROJ-01",
  "PROJ-02",
  "PROJ-04",
  "PROJ-05",
  "PROJ-06",
  "AREA-01",
  "AREA-02",
  "AREA-03",
] as const;

function input(mode: "dry-run" | "apply"): RoadmapRunInput {
  return {
    mode,
    expectedWorkspaceId: WS,
    roadmapHash: "roadmap-hash",
    roadmapCommit: "roadmap-commit",
    openItems: OPEN_ITEMS,
    completedIds: COMPLETED_IDS,
    confirmation: mode === "apply" ? "CREATE DALYHUB ROADMAP" : undefined,
  };
}

function scope(workspaceId = WS) {
  const context = makeContext(workspaceId);
  return bindWorkspaceRepositories(
    { DB: env.DB, DEFAULT_WORKSPACE_ID: workspaceId },
    context,
    createSystemActorContext(),
  );
}

async function counts() {
  return {
    entities: await countRows(),
    links: await countLinkRows(),
    spine: await countSpineRows(),
    activities: await countActivities(),
  };
}

beforeEach(async () => {
  await resetTables([WS, OTHER_WS]);
});

describe("production roadmap runner", () => {
  it("is read-only in dry-run mode", async () => {
    const before = await counts();
    const report = await runRoadmapPlan(scope(), input("dry-run"));

    expect(report.mode).toBe("dry-run");
    expect(report.validation.openTasks).toBe(OPEN_ITEMS.length);
    expect(report.records.some((record) => record.action === "created")).toBe(
      true,
    );
    expect(await counts()).toEqual(before);
  });

  it("creates the hierarchy through trusted repositories and is idempotent", async () => {
    const first = await runRoadmapPlan(scope(), input("apply"));
    const afterFirst = await counts();
    const second = await runRoadmapPlan(scope(), input("apply"));
    const afterSecond = await counts();

    expect(first.validation.projectWorkflowStatus).toBe("active");
    expect(first.validation.projectToGoalLink).toBe("verified");
    expect(first.validation.openTasks).toBe(OPEN_ITEMS.length);
    expect(first.validation.completedMilestones).toBe(5);
    expect(first.validation.totalTasks).toBe(OPEN_ITEMS.length + 5);
    expect(second.records.every((record) => record.action !== "created")).toBe(
      true,
    );
    expect(afterSecond).toEqual(afterFirst);

    const projectId = first.validation.project.id;
    expect(projectId).not.toBeNull();
    const tasks = await scope().tasks.listProjectTasks(projectId!, {
      state: "all",
      limit: 100,
    });
    expect(tasks.items).toHaveLength(OPEN_ITEMS.length + 5);
    expect(new Set(tasks.items.map((task) => task.title)).size).toBe(
      tasks.items.length,
    );

    const next = tasks.items.find((task) => task.title.startsWith("AREA-04 —"));
    expect(next).toBeDefined();
    expect((await scope().tasks.getTask(next!.id))?.status).toBe("in_progress");
    expect((await scope().tasks.getTask(next!.id))?.scheduledDate).toBeNull();
  });

  it("fails closed before writes when the expected workspace does not match", async () => {
    const before = await counts();

    await expect(
      runRoadmapPlan(scope(OTHER_WS), input("apply")),
    ).rejects.toThrow("Workspace mismatch");
    expect(await counts()).toEqual(before);
  });

  it("recovers safely after an injected interruption without duplicating records", async () => {
    await expect(
      runRoadmapPlan(scope(), input("apply"), {
        afterMutation(label) {
          if (label === "project.created") {
            throw new Error("injected interruption");
          }
        },
      }),
    ).rejects.toThrow("injected interruption");

    const recovered = await runRoadmapPlan(scope(), input("apply"));
    const rerun = await runRoadmapPlan(scope(), input("apply"));

    expect(recovered.validation.duplicateCheck).toBe("passed");
    expect(rerun.records.every((record) => record.action !== "created")).toBe(
      true,
    );
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS n
       FROM entities
       WHERE workspace_id = ?
         AND title IN (?, ?, ?)`,
    )
      .bind(
        WS,
        "Personal Systems & Development",
        "Complete DalyHub V2",
        "DalyHub V2 Development Roadmap",
      )
      .first<{ n: number }>();
    expect(row?.n).toBe(3);
  });

  it("never creates a second workspace", async () => {
    await ensureWorkspace(WS);
    await runRoadmapPlan(scope(), input("apply"));

    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM workspaces",
    ).first<{ n: number }>();
    expect(row?.n).toBe(2);
  });
});
