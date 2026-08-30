/**
 * X-02 — real Workers/D1 integration tests for the cross-module query engine.
 *
 * The workspace is seeded ONCE with a small but complete world — an Area, a Goal,
 * two Projects, several Tasks, a Note, a Meeting with an open action, and two
 * Reviews (one completed, with its REVIEW-03 insight snapshot) — and each test
 * proves that a representative combined query returns EXACTLY the right records.
 * Exactly, not approximately: an assertion that only checks "contains" would pass
 * for a query that has quietly widened.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";

import { REVIEW_INSIGHT_SNAPSHOT_VERSION } from "~/kernel/review-insights";
import {
  GOAL_BELONGS_TO_AREA,
  PROJECT_ADVANCES_GOAL,
  PROJECT_BELONGS_TO_AREA,
  TASK_BELONGS_TO_AREA,
  TASK_BELONGS_TO_PROJECT,
} from "~/kernel/spine";
import { UNIVERSAL_RELATED_LINK } from "~/platform/entity-links";
import {
  CROSS_VIEW_SYSTEM_VIEWS,
  parseCrossViewConfig,
  VIEW_SCOPES,
  type CrossViewConfig,
  type CrossViewQueryContext,
  type ViewScope,
} from "~/kernel/views";

import {
  countingDb,
  makeContext,
  makeCrossViewQueryRepository,
  resetTables,
  seedEntityTags,
} from "./support";
import { createCrossViewQueryRepository } from "~/platform/storage/d1";

const WS = "ws_cross_query";
const OTHER = "ws_cross_query_other";

const TODAY = "2026-08-08";
const WEEK_START = "2026-08-03";
const WEEK_END = "2026-08-09";

const NOW = new Date("2026-08-08T02:00:00.000Z");

function ts(day: string, hour = "00"): string {
  return `${day}T${hour}:00:00.000Z`;
}

const context: CrossViewQueryContext = {
  now: NOW,
  todayIso: TODAY,
  weekStartIso: WEEK_START,
  weekEndIso: WEEK_END,
  calendarIsoOf: (instant) => instant.toISOString().slice(0, 10),
  // This suite's owner IS in UTC, so the day boundary is UTC midnight — stated
  // explicitly rather than assumed, which is what F-05 was about.
  dayStartInstantOf: (dayIso) => new Date(`${dayIso}T00:00:00.000Z`),
  alignmentRecentWindowStartIso: ts("2026-07-25"),
  availableScopes: [...VIEW_SCOPES],
};

/* -------------------------------------------------------------------------- */
/* Seeding — direct SQL, so the world under test is exact and deterministic    */
/* -------------------------------------------------------------------------- */

async function entity(
  ws: string,
  id: string,
  type: string,
  title: string,
  options: {
    readonly createdAt?: string;
    readonly updatedAt?: string;
    readonly deletedAt?: string | null;
  } = {},
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      ws,
      type,
      title,
      options.createdAt ?? ts("2026-07-01"),
      options.updatedAt ?? ts("2026-08-06"),
      options.deletedAt ?? null,
    )
    .run();
}

async function spine(
  ws: string,
  id: string,
  kind: string,
  completedAt: string | null = null,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO spine_records (workspace_id, entity_id, kind, completed_at)
     VALUES (?, ?, ?, ?)`,
  )
    .bind(ws, id, kind, completedAt)
    .run();
}

let linkSeq = 0;
async function link(
  ws: string,
  source: string,
  target: string,
  type: string,
): Promise<void> {
  linkSeq += 1;
  await env.DB.prepare(
    `INSERT INTO entity_links
       (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      `lnk_${linkSeq}`,
      ws,
      source,
      target,
      type,
      ts("2026-07-01"),
      ts("2026-07-01"),
    )
    .run();
}

async function taskDetails(
  ws: string,
  id: string,
  fields: {
    readonly status?: string;
    readonly priority?: string | null;
    readonly dueDate?: string | null;
    readonly waitingSince?: string | null;
    readonly commitmentState?: string;
  } = {},
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO task_details
       (workspace_id, entity_id, status, priority, due_date, waiting_since, commitment_state, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      ws,
      id,
      fields.status ?? "todo",
      fields.priority ?? null,
      fields.dueDate ?? null,
      fields.waitingSince ?? null,
      fields.commitmentState ?? "active",
      ts("2026-08-06"),
    )
    .run();
}

async function projectDetails(
  ws: string,
  id: string,
  status = "active",
  archivedAt: string | null = null,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO project_details (workspace_id, entity_id, status, archived_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(ws, id, status, archivedAt, ts("2026-08-06"))
    .run();
}

async function noteDetails(
  ws: string,
  id: string,
  tags: readonly string[] = [],
  archivedAt: string | null = null,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO note_details (workspace_id, entity_id, content, archived_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(ws, id, "# Note", archivedAt, ts("2026-08-06"))
    .run();
  // V2.6 FIND-02 — tags are the workspace vocabulary, not a column on the Note.
  await seedEntityTags(ws, id, tags, ts("2026-08-06"));
}

async function meetingDetails(
  ws: string,
  id: string,
  startsAt: string,
  status = "planned",
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO meeting_details
       (workspace_id, entity_id, starts_at, timezone, status, archived_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, ?)`,
  )
    .bind(ws, id, startsAt, "Australia/Sydney", status, ts("2026-08-06"))
    .run();
}

async function meetingAction(
  ws: string,
  meetingId: string,
  itemId: string,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO meeting_items
       (workspace_id, id, meeting_id, kind, body_markdown, position, created_at, updated_at)
     VALUES (?, ?, ?, 'action', 'Chase the quote', 0, ?, ?)`,
  )
    .bind(ws, itemId, meetingId, ts("2026-08-06"), ts("2026-08-06"))
    .run();
}

async function reviewDetails(
  ws: string,
  id: string,
  fields: {
    readonly reviewType?: string;
    readonly periodStart: string;
    readonly periodEnd: string;
    readonly status?: string;
    readonly completedAt?: string | null;
  },
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO review_details
       (workspace_id, entity_id, review_type, period_start, period_end, status,
        template_id, completed_at, archived_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'review.weekly.v1', ?, NULL, ?)`,
  )
    .bind(
      ws,
      id,
      fields.reviewType ?? "weekly",
      fields.periodStart,
      fields.periodEnd,
      fields.status ?? "draft",
      fields.completedAt ?? null,
      ts("2026-08-06"),
    )
    .run();
}

/**
 * Seed a complete world in one workspace:
 *
 *   Area "Home"
 *     Goal "Settle in"
 *       Project "Kitchen"      (active, open)   — Task overdue, Task waiting,
 *                                                 Task done, Note, Meeting
 *     Project "Garage"         (archived)       — Task due today
 *   Task "Loose end"           (directly in the Area, no due date)
 *   Review "last week"         (completed, with a REVIEW-03 snapshot)
 *   Review "this week"         (draft, period already ended)
 *   Note "Filed away"          (archived)
 *   Task "Deleted"             (soft-deleted — must never appear)
 */
async function seedWorld(ws: string, prefix = ""): Promise<void> {
  const q = (id: string) => `${prefix}${id}`;
  await entity(ws, q("area-home"), "area", "Home");
  await spine(ws, q("area-home"), "area");

  await entity(ws, q("goal-settle"), "goal", "Settle in");
  await spine(ws, q("goal-settle"), "goal");
  await link(ws, q("goal-settle"), q("area-home"), GOAL_BELONGS_TO_AREA);

  await entity(ws, q("proj-kitchen"), "project", "Kitchen");
  await spine(ws, q("proj-kitchen"), "project");
  await projectDetails(ws, q("proj-kitchen"));
  await link(ws, q("proj-kitchen"), q("goal-settle"), PROJECT_ADVANCES_GOAL);

  await entity(ws, q("proj-garage"), "project", "Garage");
  await spine(ws, q("proj-garage"), "project");
  await projectDetails(ws, q("proj-garage"), "on_hold", ts("2026-08-01"));
  await link(ws, q("proj-garage"), q("area-home"), PROJECT_BELONGS_TO_AREA);

  await entity(ws, q("task-overdue"), "task", "Order the benchtop");
  await spine(ws, q("task-overdue"), "task");
  await taskDetails(ws, q("task-overdue"), {
    dueDate: "2026-08-01",
    priority: "p1",
  });
  await link(ws, q("task-overdue"), q("proj-kitchen"), TASK_BELONGS_TO_PROJECT);

  await entity(ws, q("task-waiting"), "task", "Waiting on the plumber");
  await spine(ws, q("task-waiting"), "task");
  await taskDetails(ws, q("task-waiting"), { waitingSince: ts("2026-07-20") });
  await link(ws, q("task-waiting"), q("proj-kitchen"), TASK_BELONGS_TO_PROJECT);

  await entity(ws, q("task-done"), "task", "Measure the space");
  await spine(ws, q("task-done"), "task", ts("2026-08-05"));
  await taskDetails(ws, q("task-done"), { dueDate: "2026-08-04" });
  await link(ws, q("task-done"), q("proj-kitchen"), TASK_BELONGS_TO_PROJECT);

  await entity(ws, q("task-garage"), "task", "Clear the shelves");
  await spine(ws, q("task-garage"), "task");
  await taskDetails(ws, q("task-garage"), { dueDate: TODAY });
  await link(ws, q("task-garage"), q("proj-garage"), TASK_BELONGS_TO_PROJECT);

  await entity(ws, q("task-loose"), "task", "Loose end");
  await spine(ws, q("task-loose"), "task");
  await taskDetails(ws, q("task-loose"));
  await link(ws, q("task-loose"), q("area-home"), TASK_BELONGS_TO_AREA);

  await entity(ws, q("task-deleted"), "task", "Deleted task", {
    deletedAt: ts("2026-08-02"),
  });
  await spine(ws, q("task-deleted"), "task");
  await taskDetails(ws, q("task-deleted"), { dueDate: "2026-08-01" });
  await link(ws, q("task-deleted"), q("proj-kitchen"), TASK_BELONGS_TO_PROJECT);

  await entity(ws, q("note-kitchen"), "note", "Benchtop options");
  await noteDetails(ws, q("note-kitchen"), ["kitchen"]);
  await link(ws, q("note-kitchen"), q("proj-kitchen"), UNIVERSAL_RELATED_LINK);

  await entity(ws, q("note-filed"), "note", "Filed away");
  await noteDetails(ws, q("note-filed"), [], ts("2026-07-30"));

  await entity(ws, q("meet-kitchen"), "meeting", "Kitchen walkthrough");
  await meetingDetails(
    ws,
    q("meet-kitchen"),
    ts("2026-08-05", "01"),
    "completed",
  );
  await meetingAction(ws, q("meet-kitchen"), q("mi-1"));
  await link(ws, q("meet-kitchen"), q("proj-kitchen"), UNIVERSAL_RELATED_LINK);

  await entity(ws, q("review-last"), "review", "Week to 2 Aug", {
    updatedAt: ts("2026-08-02"),
  });
  await reviewDetails(ws, q("review-last"), {
    periodStart: "2026-07-27",
    periodEnd: "2026-08-02",
    status: "completed",
    completedAt: ts("2026-08-02", "09"),
  });

  await entity(ws, q("review-open"), "review", "Week to 9 Aug");
  await reviewDetails(ws, q("review-open"), {
    periodStart: "2026-08-03",
    periodEnd: "2026-08-09",
    status: "in_progress",
  });
}

/** REVIEW-03's own snapshot for the completed Review, written as it writes it. */
async function seedSnapshot(
  ws: string,
  projectHealth: readonly { readonly id: string; readonly health: string }[],
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO review_insight_snapshots
       (workspace_id, review_id, version, period_start, period_end, captured_at, facts_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      ws,
      "review-last",
      REVIEW_INSIGHT_SNAPSHOT_VERSION,
      "2026-07-27",
      "2026-08-02",
      ts("2026-08-02", "09"),
      JSON.stringify({
        version: REVIEW_INSIGHT_SNAPSHOT_VERSION,
        periodStart: "2026-07-27",
        periodEnd: "2026-08-02",
        tasksCompleted: 1,
        projectsCompleted: 0,
        goalsCompleted: 0,
        overdueCarryOver: 0,
        waitingCarryOver: 1,
        projects: projectHealth.map((project) => ({
          id: project.id,
          health: project.health,
          openTasks: 2,
          overdueTasks: 0,
        })),
        projectsBounded: false,
        goals: [],
        goalsBounded: false,
        areas: [],
        areasBounded: false,
        carryOverTaskIds: [],
        carryOverBounded: false,
      }),
    )
    .run();
}

function config(raw: Record<string, unknown>): CrossViewConfig {
  return parseCrossViewConfig(raw);
}

async function run(
  raw: Record<string, unknown>,
  overrides: Partial<CrossViewQueryContext> = {},
) {
  const repository = makeCrossViewQueryRepository(makeContext(WS));
  return repository.runCrossView(config(raw), { ...context, ...overrides });
}

const ids = (page: { readonly results: readonly { readonly id: string }[] }) =>
  page.results.map((result) => result.id).sort();

beforeEach(async () => {
  await resetTables([WS, OTHER]);
  linkSeq = 0;
  await seedWorld(WS);
});

/* -------------------------------------------------------------------------- */

describe("cross-module results", () => {
  it("returns records from several modules in one page, each keeping its identity", async () => {
    const page = await run({
      scopes: ["task", "project", "note", "meeting", "review"],
      shared: { projectId: "proj-kitchen" },
    });
    expect(ids(page)).toEqual([
      "meet-kitchen",
      "note-kitchen",
      "task-done",
      "task-overdue",
      "task-waiting",
    ]);
    const byId = new Map(page.results.map((result) => [result.id, result]));
    expect(byId.get("task-overdue")?.entityType).toBe("task");
    expect(byId.get("note-kitchen")?.detail.kind).toBe("note");
    expect(byId.get("meet-kitchen")?.detail).toMatchObject({
      kind: "meeting",
      openActions: 1,
    });
  });

  it("resolves the Area anchor through the spine, including a Task's grandparent", async () => {
    const page = await run({
      scopes: ["task"],
      shared: { projectId: "proj-kitchen" },
    });
    const overdue = page.results.find((result) => result.id === "task-overdue");
    expect(overdue?.project).toEqual({ id: "proj-kitchen", title: "Kitchen" });
    expect(overdue?.goal).toEqual({ id: "goal-settle", title: "Settle in" });
    expect(overdue?.area).toEqual({ id: "area-home", title: "Home" });
  });

  it("never returns a soft-deleted record", async () => {
    const page = await run({ scopes: [...VIEW_SCOPES] });
    expect(ids(page)).not.toContain("task-deleted");
  });
});

describe("the structural anchors behave the same wherever the relationship exists", () => {
  it("filters by Area across Tasks, Projects, Goals, Notes and Meetings", async () => {
    const page = await run({
      scopes: ["task", "project", "goal", "note", "meeting"],
      shared: { areaId: "area-home", archived: "include" },
    });
    // Tasks reach the Area through their parent Project OR directly; the Project
    // under a Goal reaches it through the Goal; Notes/Meetings through the link
    // graph (neither is linked to the Area itself, so neither appears).
    expect(ids(page)).toEqual([
      "goal-settle",
      "proj-garage",
      "proj-kitchen",
      "task-garage",
      "task-loose",
    ]);
  });

  it("filters by Goal for the records that can belong to one", async () => {
    const page = await run({
      scopes: ["task", "project"],
      shared: { goalId: "goal-settle" },
    });
    expect(ids(page)).toEqual([
      "proj-kitchen",
      "task-done",
      "task-overdue",
      "task-waiting",
    ]);
  });

  it("removes a scope that cannot answer the Goal dimension, and says so", async () => {
    const page = await run({
      scopes: ["task", "project", "note"],
      shared: { goalId: "goal-settle" },
    });
    expect(ids(page)).not.toContain("note-kitchen");
    expect(page.unavailable).toEqual([
      { scope: "note", reason: "unsupported_dimension", dimension: "goalId" },
    ]);
  });
});

describe("lifecycle", () => {
  it("excludes archived records by default", async () => {
    const page = await run({ scopes: ["project", "note"] });
    expect(ids(page)).toEqual(["note-kitchen", "proj-kitchen"]);
  });

  it("includes them when the view asks", async () => {
    const page = await run({
      scopes: ["project", "note"],
      shared: { archived: "include" },
    });
    expect(ids(page)).toEqual([
      "note-filed",
      "note-kitchen",
      "proj-garage",
      "proj-kitchen",
    ]);
  });

  it("shows only archived records, and only from scopes that have an archive", async () => {
    const page = await run({
      scopes: ["task", "project", "note"],
      shared: { archived: "only" },
    });
    expect(ids(page)).toEqual(["note-filed", "proj-garage"]);
    expect(page.unavailable).toEqual([
      { scope: "task", reason: "unsupported_dimension", dimension: "archived" },
    ]);
  });

  it("separates open from finished work", async () => {
    const open = await run({ scopes: ["task"], shared: { state: "open" } });
    expect(ids(open)).toEqual([
      "task-garage",
      "task-loose",
      "task-overdue",
      "task-waiting",
    ]);
    const closed = await run({ scopes: ["task"], shared: { state: "closed" } });
    expect(ids(closed)).toEqual(["task-done"]);
  });
});

describe("needs attention", () => {
  it("answers the built-in question across modules", async () => {
    const page = await run(
      CROSS_VIEW_SYSTEM_VIEWS[0].config as unknown as Record<string, unknown>,
    );
    // Overdue and waiting Tasks, the Meeting with an open action, and the Review
    // whose period has ended and is not complete. The archived Project's Task is
    // still an open, due Task, so it is genuinely attention-worthy.
    // `proj-kitchen` is included only if PROJ-02 rates it stale/at-risk/blocked,
    // which it does: nothing meaningful has happened on it recently.
    expect(ids(page)).toEqual(
      expect.arrayContaining([
        "meet-kitchen",
        "task-garage",
        "task-overdue",
        "task-waiting",
      ]),
    );
    expect(ids(page)).not.toContain("task-done");
    expect(ids(page)).not.toContain("task-loose");
    expect(ids(page)).not.toContain("review-last");
  });

  it("orders by due date with undated records last", async () => {
    const page = await run({
      scopes: ["task"],
      shared: { state: "open" },
      sort: "due",
      direction: "asc",
    });
    expect(page.results.map((result) => result.id)).toEqual([
      "task-overdue",
      "task-garage",
      "task-loose",
      "task-waiting",
    ]);
  });
});

describe("REVIEW-03 integration", () => {
  it("resolves 'changed since my last Review' from the stored snapshot", async () => {
    await seedSnapshot(WS, [{ id: "proj-kitchen", health: "on_track" }]);
    const page = await run({
      scopes: ["task", "project", "note"],
      shared: { changedSince: "last_review" },
    });
    expect(page.changeBoundary).toEqual({
      periodEnd: "2026-08-02",
      reviewId: "review-last",
    });
    // Everything seeded was updated on 6 August, after the 2 August boundary —
    // except the Review record itself, which is not in scope here.
    expect(ids(page)).toEqual([
      "note-kitchen",
      "proj-kitchen",
      "task-done",
      "task-garage",
      "task-loose",
      "task-overdue",
      "task-waiting",
    ]);
  });

  it("returns nothing rather than widening when there is no completed Review", async () => {
    const page = await run({
      scopes: ["task", "project"],
      shared: { changedSince: "last_review" },
    });
    expect(page.results).toEqual([]);
    expect(page.changeBoundary).toBeNull();
  });

  it("finds the Projects whose health MOVED since the last Review", async () => {
    // The snapshot recorded the Kitchen as on track. It is not on track today, so
    // the comparison — REVIEW-03's own — reports movement.
    await seedSnapshot(WS, [{ id: "proj-kitchen", health: "on_track" }]);
    const page = await run({
      scopes: ["project"],
      modules: { project: { healthMovedSinceLastReview: true } },
    });
    expect(ids(page)).toEqual(["proj-kitchen"]);
    const project = page.results[0];
    expect(project.detail).toMatchObject({
      kind: "project",
      healthSinceLastReview: "on_track",
    });
    expect(
      project.detail.kind === "project" ? project.detail.health : null,
    ).not.toBe("on_track");
  });

  it("reports no movement when the snapshot already agrees with today", async () => {
    const live = await run({
      scopes: ["project"],
      shared: { attention: true },
    });
    const health =
      live.results[0]?.detail.kind === "project"
        ? live.results[0].detail.health
        : null;
    expect(health).not.toBeNull();
    await seedSnapshot(WS, [{ id: "proj-kitchen", health: health! }]);

    const page = await run({
      scopes: ["project"],
      modules: { project: { healthMovedSinceLastReview: true } },
    });
    expect(page.results).toEqual([]);
  });
});

describe("module visibility", () => {
  it("never reads a hidden module's records, and reports the omission", async () => {
    const page = await run(
      {
        scopes: ["task", "note", "meeting"],
        shared: { projectId: "proj-kitchen" },
      },
      { availableScopes: ["task", "meeting"] },
    );
    expect(ids(page)).toEqual([
      "meet-kitchen",
      "task-done",
      "task-overdue",
      "task-waiting",
    ]);
    expect(page.unavailable).toEqual([
      { scope: "note", reason: "module_hidden" },
    ]);
  });

  it("still answers with the scopes that remain", async () => {
    const page = await run(
      { scopes: ["task", "project"], shared: { areaId: "area-home" } },
      { availableScopes: ["project"] },
    );
    expect(ids(page)).toEqual(["proj-kitchen"]);
  });
});

describe("workspace isolation", () => {
  it("never returns another workspace's records", async () => {
    await seedWorld(OTHER, "o-");
    const page = await run({ scopes: [...VIEW_SCOPES] });
    const rows = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM entities WHERE workspace_id = ?",
    )
      .bind(OTHER)
      .first<{ readonly total: number }>();
    expect(rows?.total).toBeGreaterThan(0);
    // Every returned id resolves inside THIS workspace.
    for (const result of page.results) {
      const owner = await env.DB.prepare(
        "SELECT workspace_id FROM entities WHERE id = ? AND workspace_id = ?",
      )
        .bind(result.id, WS)
        .first<{ readonly workspace_id: string }>();
      expect(owner?.workspace_id).toBe(WS);
    }
  });

  it("cannot be pointed at another workspace by a filter value", async () => {
    await seedWorld(OTHER, "o-");
    // Each workspace holds the same world. Asking THIS workspace for the other
    // one's Project id must return nothing at all — not the equivalent local rows,
    // and certainly not the other workspace's.
    const leak = await run({
      scopes: ["task"],
      shared: { projectId: "o-proj-kitchen" },
    });
    expect(leak.results).toEqual([]);

    const mine = await run({
      scopes: ["task"],
      shared: { projectId: "proj-kitchen" },
    });
    expect(ids(mine)).toEqual(["task-done", "task-overdue", "task-waiting"]);

    const other = makeCrossViewQueryRepository(makeContext(OTHER));
    const otherPage = await other.runCrossView(
      config({ scopes: ["task"], shared: { projectId: "o-proj-kitchen" } }),
      context,
    );
    expect(otherPage.results.map((r) => r.id).sort()).toEqual([
      "o-task-done",
      "o-task-overdue",
      "o-task-waiting",
    ]);
  });
});

describe("query cost", () => {
  it("stays bounded and N+1-free for a five-module view", async () => {
    const counting = countingDb(env.DB);
    const repository = createCrossViewQueryRepository(
      counting.db,
      makeContext(WS),
    );
    counting.reset();
    const page = await repository.runCrossView(
      config({
        scopes: ["task", "project", "goal", "note", "meeting"],
        shared: { areaId: "area-home", archived: "include" },
      }),
      context,
    );
    expect(page.results.length).toBeGreaterThan(0);
    // Five scope reads plus a fixed anchor-resolution tail — never one query per
    // returned record. The exact number is asserted so a regression that
    // reintroduces per-row work fails loudly rather than quietly slowing down.
    expect(counting.prepareCount()).toBe(8);
  });
});

/* -------------------------------------------------------------------------- */
/* RECALL-00-B (DEBT-223) — bind safety and the honest bound at the            */
/* adversarial population the audit never built: a FULL page of Notes and     */
/* Meetings, every row with link anchors to resolve, plus hostile rows in a   */
/* second workspace.                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Wrap a `D1Database` so every prepared statement's bind count is recorded.
 * The point of chunking is that NO statement exceeds D1's 100-bind cap, and the
 * local test database may be laxer than production D1 — so the cap is asserted
 * directly rather than trusted to error.
 */
function bindCountingDb(db: D1Database): {
  db: D1Database;
  maxBinds: () => number;
  statements: () => number;
} {
  let max = 0;
  let statements = 0;
  const proxy = new Proxy(db, {
    get(target, prop, receiver) {
      if (prop === "prepare") {
        return (query: string) => {
          statements += 1;
          const statement = target.prepare(query);
          return new Proxy(statement, {
            get(stmtTarget, stmtProp, stmtReceiver) {
              if (stmtProp === "bind") {
                return (...values: unknown[]) => {
                  max = Math.max(max, values.length);
                  return stmtTarget.bind(...values);
                };
              }
              const value = Reflect.get(stmtTarget, stmtProp, stmtReceiver);
              return typeof value === "function"
                ? value.bind(stmtTarget)
                : value;
            },
          });
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as D1Database;
  return {
    db: proxy,
    maxBinds: () => max,
    statements: () => statements,
  };
}

/**
 * Seed `count` Notes and `count` Meetings that ALL match a plain note+meeting
 * view, EACH linked to its own Project which belongs to its own Area — so the
 * anchor resolution has one link-anchor, one parent and two titles to resolve
 * per row. This is the population under which the unchunked helpers failed:
 * `#resolveLinkAnchors` bound `2 + 2×60 = 122` parameters for a full page, and
 * `#resolveTitles` up to `1 + 120` once every row carried a distinct anchor.
 */
async function seedAdversarialLinkedRows(
  ws: string,
  count: number,
  prefix = "",
): Promise<void> {
  const q = (id: string) => `${prefix}${id}`;
  for (let index = 0; index < count; index += 1) {
    const n = String(index).padStart(3, "0");
    // Distinct, descending update instants make the `updated DESC` page exact.
    const minute = String(59 - Math.floor(index / 2)).padStart(2, "0");
    const second = String((index % 2) * 30 + 10).padStart(2, "0");
    const updated = `2026-08-06T10:${minute}:${second}.000Z`;
    const noteId = q(`adv-note-${n}`);
    const meetingId = q(`adv-meet-${n}`);

    await entity(ws, noteId, "note", `${prefix}Adversarial note ${n}`, {
      updatedAt: updated,
    });
    await noteDetails(ws, noteId);

    await entity(
      ws,
      meetingId,
      "meeting",
      `${prefix}Adversarial meeting ${n}`,
      {
        updatedAt: updated.replace(".000Z", ".500Z"),
      },
    );
    await meetingDetails(ws, meetingId, ts("2026-08-05", "01"), "completed");

    // A DISTINCT project + area per row, so a 60-row page carries 120 anchor
    // ids into the title read — past `entities.getByIds`' 90-id chunk, which
    // makes the chunking load-bearing rather than incidental.
    for (const [recordId, kind] of [
      [noteId, "note"],
      [meetingId, "meet"],
    ] as const) {
      const projectId = q(`adv-proj-${kind}-${n}`);
      const areaId = q(`adv-area-${kind}-${n}`);
      await entity(
        ws,
        projectId,
        "project",
        `${prefix}Adversarial project ${kind} ${n}`,
      );
      await entity(
        ws,
        areaId,
        "area",
        `${prefix}Adversarial area ${kind} ${n}`,
      );
      await link(ws, projectId, areaId, PROJECT_BELONGS_TO_AREA);
      await link(ws, recordId, projectId, UNIVERSAL_RELATED_LINK);
    }
  }
}

describe("RECALL-00-B — a full page of linked Notes/Meetings is bind-safe and honestly bounded", () => {
  it("returns the 60-row page with correct anchors, within budget and the bind cap, and states the bound", async () => {
    // 36 + 36 = 72 matching candidates: more than the 60-row page, fewer than
    // the 120-per-scope candidate cap — the exact population the old code
    // truncated SILENTLY (`bounded` stayed false) when it did not fail outright
    // on the 122-bind anchor statement.
    await seedAdversarialLinkedRows(WS, 36);
    // Hostile rows: the same shape in a second workspace. None of them — rows
    // or anchors — may ever appear in this workspace's page.
    await seedAdversarialLinkedRows(OTHER, 3, "HOSTILE-");

    const counting = bindCountingDb(env.DB);
    const repository = createCrossViewQueryRepository(
      counting.db,
      makeContext(WS),
    );
    const page = await repository.runCrossView(
      config({ scopes: ["note", "meeting"] }),
      context,
    );

    // The full page arrives — no statement error at the realistic population.
    expect(page.results).toHaveLength(60);

    // The bound is STATED: 74 candidates were read (72 adversarial rows plus
    // the base world's one live note and one meeting), the page holds 60, and
    // no scope's candidate read saturated (37 < 120 per scope) — this is the
    // page-slice truncation the old flag missed. Falsification: restore
    // `bounded = any scope saturated` and this fails.
    expect(page.bounded).toBe(true);
    expect(page.readCount).toBe(74);
    expect(page.saturatedScopes).toEqual([]);

    // EVERY row resolved its anchors — including rows past the 45-id chunk
    // boundary of the link-anchor read and the 90-id chunk boundary of the
    // title read, which is where an incorrect merge would lose them. Anchor
    // titles resolve to THIS workspace's records.
    for (const result of page.results) {
      const n = result.id.slice(-3);
      const kind = result.scope === "note" ? "note" : "meet";
      expect(result.project).toEqual({
        id: `adv-proj-${kind}-${n}`,
        title: `Adversarial project ${kind} ${n}`,
      });
      expect(result.area).toEqual({
        id: `adv-area-${kind}-${n}`,
        title: `Adversarial area ${kind} ${n}`,
      });
    }

    // Workspace isolation, against a workspace that CONTAINS matching rows:
    // no hostile row and no hostile anchor is ever returned.
    for (const result of page.results) {
      expect(result.id).not.toContain("HOSTILE");
      expect(result.title).not.toContain("HOSTILE");
      expect(result.project?.title ?? "").not.toContain("HOSTILE");
      expect(result.area?.title ?? "").not.toContain("HOSTILE");
    }

    /*
     * The pinned query budget (ROADMAP_V2_7 RECALL-00-B): flat in workspace
     * size, every statement within D1's 100-bind cap.
     *
     *   2  scope reads (note, meeting; no Project scope → no boundary read)
     *   2  link-anchor reads   (60 ids ÷ 45-id chunks, 2 + 2×45 = 92 binds max)
     *   1  parent read         (60 project ids ÷ 90-id chunks)
     *   2  title reads         (120 anchor ids ÷ 90-id chunks via
     *                           `entities.getByIds`)
     *   —
     *   7  statements
     *
     * Exact, not `lessThan`: un-chunking a helper REDUCES the count (and blows
     * the bind cap), a reintroduced per-row read raises it — either way this
     * fails loudly.
     */
    expect(counting.statements()).toBe(7);
    expect(counting.maxBinds()).toBeLessThanOrEqual(100);
  });

  it("states per-scope saturation when even the candidate read was bounded", async () => {
    // 125 notes: the note scope's candidate read caps at 120, so the surface
    // must say the READ itself was bounded for that scope — not merely that
    // the page truncated.
    for (let index = 0; index < 125; index += 1) {
      const n = String(index).padStart(3, "0");
      await entity(WS, `sat-note-${n}`, "note", `Saturation note ${n}`, {
        updatedAt: new Date(Date.UTC(2026, 7, 6, 1, 0, index)).toISOString(),
      });
      await noteDetails(WS, `sat-note-${n}`);
    }

    const page = await run({ scopes: ["note"] });
    expect(page.results.length).toBe(60);
    expect(page.bounded).toBe(true);
    expect(page.readCount).toBe(120);
    expect(page.saturatedScopes).toEqual(["note"]);
  });
});

describe("scope coverage", () => {
  it("knows every declared scope", () => {
    const scopes: readonly ViewScope[] = VIEW_SCOPES;
    expect(scopes).toEqual([
      "task",
      "project",
      "goal",
      "note",
      "meeting",
      "review",
    ]);
  });
});
