import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import {
  createAreaRepository,
  createDiaryRepository,
  createGoalRepository,
  createMeetingRepository,
  createProjectRepository,
  createTaskRepository,
} from "~/platform/storage/d1";
import { parseWorkspaceId } from "~/kernel/workspaces";

import {
  makeContext,
  makeDiaryRepository,
  makeMeetingRepository,
  makeSpineRepository,
  makeTaskRepository,
  makeWorkspaceRepository,
  resetTables,
} from "./support";

const WS = "test-default-workspace";
const OTHER = "search-projection-other";

function countedDb(): {
  readonly db: D1Database;
  readonly count: () => number;
  readonly reset: () => void;
} {
  let statements = 0;
  return {
    db: new Proxy(env.DB, {
      get(target, property, receiver) {
        if (property === "prepare") {
          return (query: string) => {
            statements += 1;
            return target.prepare(query);
          };
        }
        const value = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as D1Database,
    count: () => statements,
    reset: () => {
      statements = 0;
    },
  };
}

async function seedWorkspace(workspaceId: string): Promise<void> {
  try {
    await makeWorkspaceRepository().create({
      id: parseWorkspaceId(workspaceId),
    });
  } catch {
    // The Workers kernel harness seeds the configured default workspace already.
  }
}

describe("global Search D1 projections", () => {
  beforeEach(async () => {
    await resetTables([WS, OTHER]);
    await seedWorkspace(WS);
    await seedWorkspace(OTHER);
  });

  it("searches new spine/diary projections in one bounded statement each", async () => {
    const context = makeContext(WS);
    const spine = makeSpineRepository(context);
    const area = await spine.createArea({ title: "Projection Area" });
    const goal = await spine.createGoal({
      title: "Projection Goal",
      areaId: area.id,
    });
    const project = await spine.createProject({
      title: "Projection Project",
      parent: { kind: "goal", id: goal.id },
    });
    const task = await spine.createTask({
      title: "Projection Task",
      parent: { kind: "project", id: project.id },
    });
    await makeTaskRepository(context).updateTask(task.id, {
      priority: "p2",
      scheduledDate: "2026-07-29",
    });
    await makeDiaryRepository(context).create({
      entryType: "reflection",
      title: "Projection Diary",
      body: "Projection diary private body",
    });

    const counter = countedDb();
    const cases = [
      () =>
        createAreaRepository(counter.db, context).searchAreas({
          text: "Projection",
        }),
      () =>
        createGoalRepository(counter.db, context).searchGoals({
          text: "Projection",
        }),
      () =>
        createProjectRepository(counter.db, context).searchProjects({
          text: "Projection",
        }),
      () =>
        createTaskRepository(counter.db, context).searchTasks({
          text: "Projection",
        }),
      () =>
        createDiaryRepository(counter.db, context).search({
          text: "Projection",
        }),
    ];

    for (const run of cases) {
      counter.reset();
      const hits = await run();
      expect(hits.length).toBeGreaterThan(0);
      expect(counter.count()).toBe(1);
    }
  });

  it("keeps task search query count fixed for one match and fifty matches", async () => {
    const context = makeContext(WS);
    const spine = makeSpineRepository(context);
    const area = await spine.createArea({ title: "Task Area" });
    const project = await spine.createProject({
      title: "Task Project",
      parent: { kind: "area", id: area.id },
    });
    await spine.createTask({
      title: "Bounded Search Task 00",
      parent: { kind: "project", id: project.id },
    });
    for (let index = 1; index <= 50; index += 1) {
      await spine.createTask({
        title: `Bounded Search Task ${String(index).padStart(2, "0")}`,
        parent: { kind: "project", id: project.id },
      });
    }

    const counter = countedDb();
    const repo = createTaskRepository(counter.db, context);
    counter.reset();
    await repo.searchTasks({ text: "Bounded Search Task 00", limit: 50 });
    const oneMatchStatements = counter.count();
    counter.reset();
    const many = await repo.searchTasks({
      text: "Bounded Search Task",
      limit: 50,
    });
    expect(many).toHaveLength(50);
    expect(counter.count()).toBe(oneMatchStatements);
    expect(counter.count()).toBe(1);
  });

  /*
   * RECALL-01 reversed half of this test on purpose, and the reversal is the
   * decision worth reading: ADR-114 decision 2 makes an EXPLICIT owner query the
   * retrieval privacy boundary, so a Diary body IS matched when the owner types
   * a phrase from it. What did not move is the rest — no cross-workspace hit, no
   * body prose returned for a TITLE match, and nothing at all without a query.
   * The unbidden empty-query list still excludes Diary entirely (FIND-01).
   */
  it("matches a Diary body under an explicit query, and never across workspaces", async () => {
    await makeDiaryRepository(makeContext(WS)).create({
      entryType: "reflection",
      title: "Public diary title",
      // A synthetic distinctive phrase — never realistic private prose.
      body: "Zappadocious quintlebrace reflection.",
    });
    await makeDiaryRepository(makeContext(OTHER)).create({
      entryType: "reflection",
      title: "Foreign diary title",
      body: "Zappadocious quintlebrace reflection.",
    });

    const repo = createDiaryRepository(env.DB, makeContext(WS));
    await expect(
      repo.search({ text: "x".repeat(500), limit: 5 }),
    ).resolves.toEqual([]);
    // No query, no statement, no body: the boundary is solicitation.
    expect(await repo.search({ text: "   " })).toEqual([]);

    const bodyHits = await repo.search({ text: "quintlebrace" });
    expect(bodyHits).toHaveLength(1);
    expect(bodyHits[0]?.title).toBe("Public diary title");
    expect(bodyHits[0]?.matchSource).toBe("body");
    expect(bodyHits[0]?.excerpt).toContain("quintlebrace");

    // A title match carries no body excerpt at all.
    const titleHits = await repo.search({ text: "Public diary title" });
    expect(titleHits).toHaveLength(1);
    expect(titleHits[0]?.matchSource).toBe("title");
    expect(titleHits[0]?.excerpt).toBe("");
  });

  it("finds UPCOMING meetings as well as recent ones, ordered by proximity (V2.0.1)", async () => {
    // Seed relative to the real clock — the defect this guards against survived
    // precisely because every meeting fixture pinned a hard-coded past date.
    const context = makeContext(WS);
    const meetings = makeMeetingRepository(context);
    const day = 24 * 60 * 60 * 1000;
    await meetings.create({
      title: "Projection meeting next week",
      startsAt: new Date(Date.now() + 7 * day).toISOString(),
      timezone: "UTC",
    });
    await meetings.create({
      title: "Projection meeting tomorrow",
      startsAt: new Date(Date.now() + 1 * day).toISOString(),
      timezone: "UTC",
    });
    await meetings.create({
      title: "Projection meeting last month",
      startsAt: new Date(Date.now() - 30 * day).toISOString(),
      timezone: "UTC",
    });
    await meetings.create({
      title: "Projection meeting yesterday",
      startsAt: new Date(Date.now() - 1 * day).toISOString(),
      timezone: "UTC",
    });

    const repo = createMeetingRepository(env.DB, context);
    const hits = await repo.searchMeetings({ text: "Projection meeting" });
    // Upcoming soonest-first, then past newest-first — and each meeting exactly
    // once (one query, no overlapping windows).
    expect(hits.map((hit) => hit.title)).toEqual([
      "Projection meeting tomorrow",
      "Projection meeting next week",
      "Projection meeting yesterday",
      "Projection meeting last month",
    ]);
    expect(new Set(hits.map((hit) => hit.id)).size).toBe(hits.length);
  });

  it("keeps searchMeetings lifecycle-honest and workspace-isolated", async () => {
    const context = makeContext(WS);
    const meetings = makeMeetingRepository(context);
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const archived = await meetings.create({
      title: "Lifecycle archived meeting",
      startsAt: future,
      timezone: "UTC",
    });
    await meetings.archive(archived.id);
    await makeMeetingRepository(makeContext(OTHER)).create({
      title: "Lifecycle foreign meeting",
      startsAt: future,
      timezone: "UTC",
    });

    const repo = createMeetingRepository(env.DB, context);
    expect(await repo.searchMeetings({ text: "Lifecycle" })).toEqual([]);
    // Bounded like every repository-backed search: an oversized input returns
    // an empty page rather than failing the statement.
    await expect(
      repo.searchMeetings({ text: "x".repeat(500), limit: 5 }),
    ).resolves.toEqual([]);
  });

  it("keeps meeting search bounded and treats backslashes as literal text", async () => {
    const context = makeContext(WS);
    await makeMeetingRepository(context).create({
      title: "Meeting with trailing slash \\",
      startsAt: "2000-01-01T09:00:00.000Z",
      timezone: "UTC",
    });

    const repo = createMeetingRepository(env.DB, context);
    await expect(
      repo.list({ view: "recent", query: "x".repeat(500), limit: 5 }),
    ).resolves.toMatchObject({ items: [] });
    const hits = await repo.list({ view: "recent", query: "\\", limit: 5 });
    expect(hits.items.map((meeting) => meeting.title)).toEqual([
      "Meeting with trailing slash \\",
    ]);
  });
});
