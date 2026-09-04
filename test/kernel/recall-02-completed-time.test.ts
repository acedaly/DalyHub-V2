/**
 * V2.7 RECALL-02 — history answers by completion TIME. The repository proof.
 *
 * Every assertion here runs against the REAL D1 (the Workers test pool), because
 * every claim is about SQL: which column decides the order, which instants bound
 * the window, how many statements it costs, whether a keyset page can skip or
 * repeat a row, and which workspace's rows can come back. A fake repository
 * could satisfy none of them.
 *
 * The one completion-time authority is `spine_records.completed_at`
 * (ADR-114 decision 4). The Activity `task.completed` event is the audit trail
 * and is never queried here: it survives a reopen, so counting from it would
 * report work the owner has explicitly un-finished.
 *
 * What this file proves, in the order the roadmap asks for it:
 *
 *   1. **Completed order truth.** A Task completed yesterday leads a Task
 *      completed earlier and EDITED since — falsified by running the same
 *      fixture under `sort: "updated"`, which reverses it.
 *   2. **Owner-day boundaries.** A completion at 23:50 owner-local yesterday is
 *      in "yesterday"; the SAME UTC instant is outside it for an owner in
 *      another zone.
 *   3. **The owner's week.** "This week" starts on the owner's own first day.
 *   4. **Reopen.** Reopening clears a Task out of a completion window.
 *   5. **Recurrence.** The completed occurrence is in the window; its successor
 *      is not.
 *   6. **Keyset pagination.** Seeded past one page, deterministic, duplicate-
 *      free, complete, and stable when several Tasks share a `completed_at`.
 *   7. **Workspace isolation.** Hostile rows in a second workspace never appear.
 *   8. **Saved views.** The sort and the window round-trip, and the restored
 *      view returns the same records in the same order.
 *   9. **Analytics parity.** The completed count Analytics states for a period
 *      equals the count the LINKED Tasks view returns for the same period —
 *      compared as machine values, through the link the panel actually renders.
 *  10. **Query budget.** The completion sort and its window cost exactly the
 *      statements and the binds the comparable existing sort does.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { evaluateAnalytics, insightWindowDays } from "~/kernel/analytics";
import type { PeriodCountRequest } from "~/kernel/review-insights";
import type { TaskSort, WorkspaceTaskFilters } from "~/kernel/tasks";
import {
  DEFAULT_TASK_VIEW_CONFIG,
  completedRangeTasksHref,
  completedWindowBounds,
  findTaskSystemView,
  toWorkspaceFilters,
  type TaskViewConfig,
} from "~/kernel/task-views";
import {
  configFromParams,
  paramsFromConfig,
} from "~/modules/tasks/tasks-url-state";
import { createTaskRepository } from "~/platform/storage/d1";
import { parseWorkspaceId } from "~/kernel/workspaces";
import { ownerDayStartInstant } from "~/shared/datetime";

import {
  FakeClock,
  makeContext,
  makeReviewInsightRepository,
  makeSpineRepository,
  makeTaskRepository,
  makeTaskViewRepository,
  makeWorkspaceRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "test-default-workspace";
const HOSTILE = "recall02-hostile-workspace";
const OWNER = "owner-recall-02";

const SYDNEY = "Australia/Sydney";
const LOS_ANGELES = "America/Los_Angeles";

const nextEntityId = sequentialIds("r02e");
const nextActivityId = sequentialIds("r02a");
const nextViewId = sequentialIds("r02v");

function spineRepo(ws: string, at: string) {
  return makeSpineRepository(makeContext(ws), {
    clock: new FakeClock(at).now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  });
}

function taskRepo(ws: string, at: string) {
  return makeTaskRepository(makeContext(ws), {
    clock: new FakeClock(at).now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  });
}

/** An Area to hang the fixtures from, created once per workspace. */
async function seedArea(ws: string, at: string, title = "Ops") {
  return spineRepo(ws, at).createArea({ title });
}

/** Create a Task at one instant and complete it at another. */
async function completeAt(
  ws: string,
  areaId: string,
  title: string,
  createdAt: string,
  completedAt: string,
): Promise<string> {
  const task = await taskRepo(ws, createdAt).createTask({
    title,
    parent: { kind: "area", id: areaId },
  });
  await taskRepo(ws, completedAt).completeTask(task.id);
  return task.id;
}

/** Read `spine_records.completed_at` directly — the authority, unmediated. */
async function storedCompletedAt(
  ws: string,
  taskId: string,
): Promise<string | null> {
  const row = await env.DB.prepare(
    "SELECT completed_at FROM spine_records WHERE workspace_id = ? AND entity_id = ?",
  )
    .bind(ws, taskId)
    .first<{ readonly completed_at: string | null }>();
  return row?.completed_at ?? null;
}

/** The whole of a query's result, walked page by page through the keyset cursor. */
async function readAllPages(
  tasks: ReturnType<typeof makeTaskRepository>,
  input: {
    readonly sort: TaskSort;
    readonly filters: WorkspaceTaskFilters;
    readonly todayIso: string;
    readonly timezone: string;
    readonly view?: "all" | "completed";
    readonly limit?: number;
  },
): Promise<{ readonly ids: string[]; readonly pages: number }> {
  const ids: string[] = [];
  let cursor: string | undefined;
  let pages = 0;
  do {
    const page = await tasks.listWorkspaceTasks({
      view: input.view ?? "completed",
      sort: input.sort,
      filters: input.filters,
      todayIso: input.todayIso,
      timezone: input.timezone,
      limit: input.limit,
      cursor,
    });
    pages += 1;
    ids.push(...page.items.map((item) => item.id));
    cursor = page.nextCursor ?? undefined;
    // A runaway cursor must fail the test, never the runner.
    expect(pages).toBeLessThan(50);
  } while (cursor !== undefined);
  return { ids, pages };
}

/** The Tasks query a `/tasks?…` link resolves to, through the module's own codec. */
function queryForHref(href: string): {
  readonly config: TaskViewConfig;
  readonly filters: WorkspaceTaskFilters;
} {
  const params = new URLSearchParams(href.slice(href.indexOf("?") + 1));
  const named = findTaskSystemView("completed");
  const config = configFromParams(
    params,
    named?.config ?? DEFAULT_TASK_VIEW_CONFIG,
  );
  return { config, filters: toWorkspaceFilters(config) };
}

/** A D1 proxy that counts prepared statements and the binds each one takes. */
function countedDb(): {
  readonly db: D1Database;
  readonly statements: () => number;
  readonly binds: () => number;
  readonly reset: () => void;
} {
  let statements = 0;
  let binds = 0;
  const db = new Proxy(env.DB, {
    get(target, property, receiver) {
      if (property === "prepare") {
        return (query: string) => {
          statements += 1;
          const prepared = target.prepare(query);
          return new Proxy(prepared, {
            get(stmtTarget, stmtProperty, stmtReceiver) {
              if (stmtProperty === "bind") {
                return (...values: unknown[]) => {
                  binds += values.length;
                  return stmtTarget.bind(...values);
                };
              }
              const value = Reflect.get(stmtTarget, stmtProperty, stmtReceiver);
              return typeof value === "function"
                ? value.bind(stmtTarget)
                : value;
            },
          });
        };
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as D1Database;
  return {
    db,
    statements: () => statements,
    binds: () => binds,
    reset: () => {
      statements = 0;
      binds = 0;
    },
  };
}

/** The harness seeds the default workspace; a hostile one is created on demand. */
async function seedWorkspace(workspaceId: string): Promise<void> {
  try {
    await makeWorkspaceRepository().create({
      id: parseWorkspaceId(workspaceId),
    });
  } catch {
    // Already present — the kernel harness seeds the configured default.
  }
}

beforeEach(async () => {
  await resetTables([WS, HOSTILE]);
});

/* -------------------------------------------------------------------------- */
/* 1. Completed order truth                                                    */
/* -------------------------------------------------------------------------- */

describe("the completed sort orders by completion, not by edit", () => {
  /**
   * The DEBT-230 fixture, exactly as the roadmap specifies it:
   *
   *   - Task A was completed yesterday;
   *   - Task B was completed earlier (four days ago);
   *   - Task B was EDITED after A was completed.
   *
   * Under the completion authority A leads. Under `updated` — the sort the
   * Completed view used to carry — B leads, because a retitle moved its edit
   * time past A's completion. The second assertion is the falsification: it
   * fails the moment someone puts `sort: "updated"` back.
   */
  async function seedCompletedThenEdited() {
    const area = await seedArea(WS, "2026-08-20T00:00:00.000Z");
    const b = await completeAt(
      WS,
      area.id,
      "B — completed four days ago",
      "2026-08-20T01:00:00.000Z",
      "2026-08-26T02:00:00.000Z",
    );
    const a = await completeAt(
      WS,
      area.id,
      "A — completed yesterday",
      "2026-08-20T02:00:00.000Z",
      "2026-08-29T03:00:00.000Z",
    );
    // B is edited AFTER A was completed. Nothing about its completion moves.
    await taskRepo(WS, "2026-08-30T04:00:00.000Z").updateTask(b, {
      title: "B — completed four days ago, retitled today",
    });
    return { a, b };
  }

  it("puts the most recently completed Task first", async () => {
    const { a, b } = await seedCompletedThenEdited();
    const page = await taskRepo(
      WS,
      "2026-08-30T05:00:00.000Z",
    ).listWorkspaceTasks({
      view: "completed",
      sort: "completed",
      todayIso: "2026-08-30",
      timezone: SYDNEY,
    });
    expect(page.items.map((item) => item.id)).toEqual([a, b]);
  });

  it("is REVERSED by the `updated` sort the view used to carry", async () => {
    const { a, b } = await seedCompletedThenEdited();
    const page = await taskRepo(
      WS,
      "2026-08-30T05:00:00.000Z",
    ).listWorkspaceTasks({
      view: "completed",
      sort: "updated",
      todayIso: "2026-08-30",
      timezone: SYDNEY,
    });
    expect(page.items.map((item) => item.id)).toEqual([b, a]);
  });

  it("keeps a never-completed Task last under BOTH directions", async () => {
    const area = await seedArea(WS, "2026-08-20T00:00:00.000Z");
    const done = await completeAt(
      WS,
      area.id,
      "Finished",
      "2026-08-20T01:00:00.000Z",
      "2026-08-28T01:00:00.000Z",
    );
    const open = (
      await taskRepo(WS, "2026-08-20T02:00:00.000Z").createTask({
        title: "Still open",
        parent: { kind: "area", id: area.id },
      })
    ).id;

    const tasks = taskRepo(WS, "2026-08-30T05:00:00.000Z");
    for (const direction of ["natural", "desc", "asc"] as const) {
      const page = await tasks.listWorkspaceTasks({
        view: "all",
        sort: "completed",
        direction,
        todayIso: "2026-08-30",
        timezone: SYDNEY,
      });
      expect(
        page.items.map((item) => item.id),
        `direction ${direction}`,
      ).toEqual([done, open]);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 2. Owner-day boundaries                                                     */
/* -------------------------------------------------------------------------- */

describe("the completion window is the OWNER's day, not the UTC day", () => {
  /**
   * ONE instant, two owners, two different answers — which is the whole claim.
   *
   * `2026-08-30T06:50:00.000Z` reads as **23:50 on 29 August** for an owner in
   * Los Angeles (UTC−7) and as **16:50 on 30 August** for an owner in Sydney
   * (UTC+10). With both owners' "today" being 30 August, it is in the Los
   * Angeles owner's YESTERDAY and in the Sydney owner's TODAY.
   *
   * It is also the instant that FALSIFIES a UTC-day window: its UTC calendar
   * date is the 30th, so a naïve `>= '2026-08-29T00:00:00Z'` bound drops it out
   * of Los Angeles' yesterday and the first test below goes red. (The second
   * test is the roadmap's "same instant, other timezone" clause and is a
   * corollary rather than an independent falsifier — under a UTC window it
   * happens to give the same answer. The zone conversion is falsified by its
   * three siblings: this one, `completedWithin`, and the owner's-week case.)
   */
  const LATE_LOCAL = "2026-08-30T06:50:00.000Z";

  async function seedOneCompletion() {
    const area = await seedArea(WS, "2026-08-20T00:00:00.000Z");
    return completeAt(
      WS,
      area.id,
      "Finished at ten to midnight",
      "2026-08-20T01:00:00.000Z",
      LATE_LOCAL,
    );
  }

  const YESTERDAY = { completedFrom: "2026-08-29", completedTo: "2026-08-29" };

  it("includes a Task completed at 23:50 owner-local yesterday", async () => {
    const id = await seedOneCompletion();
    // The stored authority is the UTC instant; only the READING of it is zoned.
    expect(await storedCompletedAt(WS, id)).toBe(LATE_LOCAL);

    const bounds = completedWindowBounds("yesterday", "2026-08-30", "monday");
    expect(bounds).toEqual({ from: "2026-08-29", to: "2026-08-29" });

    const page = await taskRepo(
      WS,
      "2026-08-30T20:00:00.000Z",
    ).listWorkspaceTasks({
      view: "completed",
      sort: "completed",
      filters: { completedFrom: bounds.from, completedTo: bounds.to },
      todayIso: "2026-08-30",
      timezone: LOS_ANGELES,
    });
    expect(page.items.map((item) => item.id)).toEqual([id]);
  });

  it("puts the SAME UTC instant outside yesterday for an owner in another zone", async () => {
    const id = await seedOneCompletion();
    const page = await taskRepo(
      WS,
      "2026-08-30T20:00:00.000Z",
    ).listWorkspaceTasks({
      view: "completed",
      sort: "completed",
      filters: YESTERDAY,
      todayIso: "2026-08-30",
      timezone: SYDNEY,
    });
    // For the Sydney owner this is 16:50 TODAY, so it cannot answer a question
    // about yesterday — and it is still there under their today's window.
    expect(page.items).toEqual([]);
    const today = await taskRepo(
      WS,
      "2026-08-30T20:00:00.000Z",
    ).listWorkspaceTasks({
      view: "completed",
      sort: "completed",
      filters: { completedFrom: "2026-08-30", completedTo: "2026-08-30" },
      todayIso: "2026-08-30",
      timezone: SYDNEY,
    });
    expect(today.items.map((item) => item.id)).toEqual([id]);
  });

  it("includes the whole of the LAST day of the window", async () => {
    // 23:50 Sydney on the window's closing day. A `<=` against the START of that
    // day — the obvious wrong bound — would drop it.
    const area = await seedArea(WS, "2026-08-20T00:00:00.000Z");
    const id = await completeAt(
      WS,
      area.id,
      "Finished at the very end of the window",
      "2026-08-20T01:00:00.000Z",
      "2026-08-29T13:50:00.000Z",
    );
    const page = await taskRepo(
      WS,
      "2026-08-30T05:00:00.000Z",
    ).listWorkspaceTasks({
      view: "completed",
      sort: "completed",
      filters: { completedFrom: "2026-08-24", completedTo: "2026-08-29" },
      todayIso: "2026-08-30",
      timezone: SYDNEY,
    });
    expect(page.items.map((item) => item.id)).toEqual([id]);
  });

  it("resolves `completedWithin` against the owner's day too", async () => {
    // 2026-08-29T20:00:00Z is 06:00 on the owner's 30 August in Sydney — inside
    // their today, and BEFORE UTC midnight, so a UTC-day window would miss it.
    const area = await seedArea(WS, "2026-08-20T00:00:00.000Z");
    const id = await completeAt(
      WS,
      area.id,
      "Finished first thing this morning",
      "2026-08-20T01:00:00.000Z",
      "2026-08-29T20:00:00.000Z",
    );
    const page = await taskRepo(
      WS,
      "2026-08-30T05:00:00.000Z",
    ).listWorkspaceTasks({
      view: "completed",
      sort: "completed",
      filters: { completedWithin: "1d" },
      todayIso: "2026-08-30",
      timezone: SYDNEY,
    });
    expect(page.items.map((item) => item.id)).toEqual([id]);
  });
});

/* -------------------------------------------------------------------------- */
/* 3. The owner's week                                                         */
/* -------------------------------------------------------------------------- */

describe("`this week` starts on the owner's own first day", () => {
  // 2026-08-30 is a SUNDAY. A Monday-start owner's week began on the 24th; a
  // Sunday-start owner's week began that very morning.
  it("bounds the week by the owner's first-day-of-week preference", () => {
    expect(completedWindowBounds("this-week", "2026-08-30", "monday")).toEqual({
      from: "2026-08-24",
      to: "2026-08-30",
    });
    expect(completedWindowBounds("this-week", "2026-08-30", "sunday")).toEqual({
      from: "2026-08-30",
      to: "2026-09-05",
    });
  });

  it("returns different records for the two preferences", async () => {
    const area = await seedArea(WS, "2026-08-20T00:00:00.000Z");
    // Completed on Wednesday 26 August, Sydney-local mid-morning.
    const midweek = await completeAt(
      WS,
      area.id,
      "Finished on Wednesday",
      "2026-08-20T01:00:00.000Z",
      "2026-08-25T23:00:00.000Z",
    );
    // Completed on Sunday 30 August, Sydney-local mid-morning.
    const sunday = await completeAt(
      WS,
      area.id,
      "Finished on Sunday",
      "2026-08-20T02:00:00.000Z",
      "2026-08-29T23:00:00.000Z",
    );

    const tasks = taskRepo(WS, "2026-08-30T05:00:00.000Z");
    const read = async (firstDayOfWeek: "monday" | "sunday") => {
      const bounds = completedWindowBounds(
        "this-week",
        "2026-08-30",
        firstDayOfWeek,
      );
      const page = await tasks.listWorkspaceTasks({
        view: "completed",
        sort: "completed",
        filters: { completedFrom: bounds.from, completedTo: bounds.to },
        todayIso: "2026-08-30",
        timezone: SYDNEY,
      });
      return page.items.map((item) => item.id);
    };

    // Monday start: the week holds both. Sunday start: only Sunday's.
    expect(await read("monday")).toEqual([sunday, midweek]);
    expect(await read("sunday")).toEqual([sunday]);
  });
});

/* -------------------------------------------------------------------------- */
/* 4. Reopen                                                                   */
/* -------------------------------------------------------------------------- */

describe("reopening clears a Task out of the completion window", () => {
  it("removes it from the window and from the completed order", async () => {
    const area = await seedArea(WS, "2026-08-20T00:00:00.000Z");
    const id = await completeAt(
      WS,
      area.id,
      "Finished, then reopened",
      "2026-08-20T01:00:00.000Z",
      "2026-08-29T03:00:00.000Z",
    );

    const window = { completedFrom: "2026-08-29", completedTo: "2026-08-29" };
    const before = await taskRepo(
      WS,
      "2026-08-30T05:00:00.000Z",
    ).listWorkspaceTasks({
      view: "completed",
      sort: "completed",
      filters: window,
      todayIso: "2026-08-30",
      timezone: SYDNEY,
    });
    expect(before.items.map((item) => item.id)).toEqual([id]);

    await taskRepo(WS, "2026-08-30T06:00:00.000Z").reopenTask(id);
    // The authority itself is cleared — there is nothing else to reconcile.
    expect(await storedCompletedAt(WS, id)).toBeNull();

    const after = await taskRepo(
      WS,
      "2026-08-30T07:00:00.000Z",
    ).listWorkspaceTasks({
      view: "completed",
      sort: "completed",
      filters: window,
      todayIso: "2026-08-30",
      timezone: SYDNEY,
    });
    expect(after.items).toEqual([]);

    /*
     * And the Activity event SURVIVES — which is exactly why it is the audit
     * trail and never the query authority (ADR-114 decision 4). Counting from
     * it here would report work the owner has explicitly un-finished.
     */
    const events = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM activities WHERE workspace_id = ? AND type = 'task.completed'",
    )
      .bind(WS)
      .first<{ readonly n: number }>();
    expect(Number(events?.n ?? 0)).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */
/* 5. Recurrence                                                               */
/* -------------------------------------------------------------------------- */

describe("recurrence keeps its existing semantics", () => {
  it("shows the completed occurrence and NOT its successor", async () => {
    const area = await seedArea(WS, "2026-08-20T00:00:00.000Z");
    const occurrence = await taskRepo(
      WS,
      "2026-08-20T01:00:00.000Z",
    ).createTask({
      title: "Water the garden",
      parent: { kind: "area", id: area.id },
      scheduledDate: "2026-08-29",
    });
    await taskRepo(WS, "2026-08-20T02:00:00.000Z").setTaskRecurrence(
      occurrence.id,
      { frequency: "week", dateKind: "scheduled" },
    );

    const result = await taskRepo(WS, "2026-08-29T03:00:00.000Z").completeTask(
      occurrence.id,
      { ownerTodayIso: "2026-08-29" },
    );
    const successor = result.successor;
    expect(successor).not.toBeNull();
    expect(successor?.completedAt).toBeNull();

    const page = await taskRepo(
      WS,
      "2026-08-30T05:00:00.000Z",
    ).listWorkspaceTasks({
      view: "completed",
      sort: "completed",
      filters: { completedFrom: "2026-08-29", completedTo: "2026-08-29" },
      todayIso: "2026-08-30",
      timezone: SYDNEY,
    });
    expect(page.items.map((item) => item.id)).toEqual([occurrence.id]);
    expect(page.items.map((item) => item.id)).not.toContain(successor?.id);
  });
});

/* -------------------------------------------------------------------------- */
/* 6. Keyset pagination, and 7. workspace isolation                            */
/* -------------------------------------------------------------------------- */

describe("keyset pagination over the completed sort", () => {
  /**
   * Twenty-five completions across five days, five of them sharing one instant
   * exactly — the case a keyset over `completed_at` alone would page wrongly,
   * and the reason the cursor carries `(created_at, id)` behind the sort value.
   */
  async function seedManyCompletions(ws: string, prefix: string) {
    const area = await seedArea(
      ws,
      "2026-08-01T00:00:00.000Z",
      `${prefix} Ops`,
    );
    const ids: string[] = [];
    for (let day = 0; day < 5; day += 1) {
      for (let n = 0; n < 5; n += 1) {
        const completedAt =
          day === 2
            ? // Five Tasks completed at the SAME instant.
              "2026-08-23T03:00:00.000Z"
            : `2026-08-2${1 + day}T0${n}:00:00.000Z`;
        ids.push(
          await completeAt(
            ws,
            area.id,
            `${prefix} task ${day}-${n}`,
            `2026-08-01T0${n}:00:00.000Z`,
            completedAt,
          ),
        );
      }
    }
    return ids;
  }

  it("pages deterministically with no duplicates and no omissions", async () => {
    const seeded = await seedManyCompletions(WS, "page");
    const tasks = taskRepo(WS, "2026-08-30T05:00:00.000Z");
    const walk = () =>
      readAllPages(tasks, {
        sort: "completed",
        filters: { completedFrom: "2026-08-21", completedTo: "2026-08-29" },
        todayIso: "2026-08-30",
        timezone: SYDNEY,
        limit: 7,
      });

    const first = await walk();
    expect(first.pages).toBeGreaterThan(1);
    expect(first.ids).toHaveLength(seeded.length);
    expect(new Set(first.ids).size).toBe(seeded.length);
    expect([...first.ids].sort()).toEqual([...seeded].sort());

    // Deterministic: the same walk, and a walk at a different page size, produce
    // the same ORDER — which is what makes the ties safe.
    const second = await walk();
    expect(second.ids).toEqual(first.ids);
    const wider = await readAllPages(tasks, {
      sort: "completed",
      filters: { completedFrom: "2026-08-21", completedTo: "2026-08-29" },
      todayIso: "2026-08-30",
      timezone: SYDNEY,
      limit: 11,
    });
    expect(wider.ids).toEqual(first.ids);

    // Descending by completion: every step is non-increasing.
    const completions = await Promise.all(
      first.ids.map((id) => storedCompletedAt(WS, id)),
    );
    for (let i = 1; i < completions.length; i += 1) {
      expect(String(completions[i - 1]) >= String(completions[i])).toBe(true);
    }
  });

  it("never returns another workspace's rows", async () => {
    await seedWorkspace(HOSTILE);
    const mine = await seedManyCompletions(WS, "mine");
    const theirs = await seedManyCompletions(HOSTILE, "theirs");

    const page = await readAllPages(taskRepo(WS, "2026-08-30T05:00:00.000Z"), {
      sort: "completed",
      filters: { completedFrom: "2026-08-21", completedTo: "2026-08-29" },
      todayIso: "2026-08-30",
      timezone: SYDNEY,
      limit: 7,
    });
    expect([...page.ids].sort()).toEqual([...mine].sort());
    for (const hostile of theirs) {
      expect(page.ids).not.toContain(hostile);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 8. Saved views                                                              */
/* -------------------------------------------------------------------------- */

describe("the completion sort and window round-trip through a saved view", () => {
  it("restores the same machine config, and the same records in the same order", async () => {
    const area = await seedArea(WS, "2026-08-20T00:00:00.000Z");
    const later = await completeAt(
      WS,
      area.id,
      "Finished on the 29th",
      "2026-08-20T01:00:00.000Z",
      "2026-08-29T03:00:00.000Z",
    );
    const earlier = await completeAt(
      WS,
      area.id,
      "Finished on the 25th",
      "2026-08-20T02:00:00.000Z",
      "2026-08-25T03:00:00.000Z",
    );
    // Outside the window, so a view that ignored the bounds would return three.
    await completeAt(
      WS,
      area.id,
      "Finished in July",
      "2026-08-20T03:00:00.000Z",
      "2026-07-30T03:00:00.000Z",
    );

    const config: TaskViewConfig = {
      ...DEFAULT_TASK_VIEW_CONFIG,
      systemView: "completed",
      sort: "completed",
      filters: {
        completedWithin: "30d",
        completedFrom: "2026-08-24",
        completedTo: "2026-08-30",
      },
    };

    const views = makeTaskViewRepository(makeContext(WS), {
      clock: new FakeClock("2026-08-30T00:00:00.000Z").now,
      idGenerator: nextViewId,
    });
    const saved = await views.create(OWNER, {
      name: "Finished this week",
      config,
    });

    // Restored from storage — a fresh repository, so nothing is served from a
    // cache the write left behind.
    const restored = await makeTaskViewRepository(makeContext(WS), {
      clock: new FakeClock("2026-08-31T00:00:00.000Z").now,
      idGenerator: nextViewId,
    }).get(OWNER, saved.id);
    expect(restored?.config).toEqual(config);
    expect(restored?.config.sort).toBe("completed");
    expect(restored?.config.filters.completedFrom).toBe("2026-08-24");
    expect(restored?.config.filters.completedTo).toBe("2026-08-30");
    expect(restored?.config.filters.completedWithin).toBe("30d");

    // The restored config produces the same query — same records, same order.
    const tasks = taskRepo(WS, "2026-08-30T05:00:00.000Z");
    const run = async (from: TaskViewConfig) =>
      (
        await tasks.listWorkspaceTasks({
          view: from.systemView,
          sort: from.sort,
          direction: from.direction,
          filters: toWorkspaceFilters(from),
          todayIso: "2026-08-30",
          timezone: SYDNEY,
        })
      ).items.map((item) => item.id);

    expect(await run(config)).toEqual([later, earlier]);
    expect(await run(restored!.config)).toEqual([later, earlier]);

    // And it round-trips through the URL codec too — a saved view and a copied
    // link mean the same thing.
    expect(configFromParams(paramsFromConfig(config))).toEqual(config);
  });
});

/* -------------------------------------------------------------------------- */
/* 9. Analytics parity                                                         */
/* -------------------------------------------------------------------------- */

describe("Analytics' completed figure and the list its link opens agree", () => {
  const timezone = SYDNEY;
  const todayIso = "2026-08-30";

  /**
   * The span's own half-open owner-day window, built exactly as
   * `analytics-context.ts` builds it, so the parity assertion is over the
   * boundaries the surface actually uses rather than over a restatement of them.
   */
  function spanWindow(span: { startIso: string; endIso: string }) {
    return {
      key: "current",
      startsAt: ownerDayStartInstant(span.startIso, timezone),
      // Half-open: the instant the day AFTER the span's last day begins.
      endsAt: ownerDayStartInstant("2026-08-31", timezone),
    };
  }

  /**
   * The fixture the whole parity claim rests on, and it deliberately contains
   * the two lifecycle cases that used to break it:
   *
   *   - a Task completed inside the span and later REOPENED — its
   *     `task.completed` Activity event survives, its `completed_at` does not;
   *   - a Task completed inside the span and later SOFT-DELETED — the event
   *     survives (HARDEN-06C F-07 removed the liveness predicate on purpose),
   *     the Completed collection excludes it.
   *
   * Neither is exotic: reopening is an ordinary control and deleting is the
   * ordinary tidy-up. An Activity-counted figure states 6 here while the list
   * behind it holds 4, which is the defect Codex found on this branch.
   */
  async function seedSpanFixture() {
    const area = await seedArea(WS, "2026-08-01T00:00:00.000Z");
    // Inside the seven-day span (2026-08-24 … 2026-08-30, owner-local).
    const inside = [
      "2026-08-24T02:00:00.000Z", // noon on the 24th, Sydney
      "2026-08-26T09:00:00.000Z",
      "2026-08-29T13:50:00.000Z", // 23:50 on the 29th, Sydney
      "2026-08-30T02:00:00.000Z", // noon on the 30th, Sydney
    ];
    // Outside it: the last moment of the 23rd, and a completion in July.
    const outside = ["2026-08-23T13:50:00.000Z", "2026-07-30T02:00:00.000Z"];
    let n = 0;
    for (const at of [...inside, ...outside]) {
      n += 1;
      await completeAt(
        WS,
        area.id,
        `Analytics fixture ${n}`,
        "2026-08-01T00:30:00.000Z",
        at,
      );
    }

    const reopened = await completeAt(
      WS,
      area.id,
      "Completed inside the span, then reopened",
      "2026-08-01T00:30:00.000Z",
      "2026-08-25T02:00:00.000Z",
    );
    await taskRepo(WS, "2026-08-30T10:00:00.000Z").reopenTask(reopened);

    const deleted = await completeAt(
      WS,
      area.id,
      "Completed inside the span, then deleted",
      "2026-08-01T00:30:00.000Z",
      "2026-08-27T02:00:00.000Z",
    );
    await taskRepo(WS, "2026-08-30T11:00:00.000Z").deleteTasks([deleted]);

    return { expected: inside.length, reopened, deleted };
  }

  it("states the same machine count for the same period", async () => {
    const { expected, reopened, deleted } = await seedSpanFixture();

    const span = insightWindowDays("this-week", todayIso);
    const counted = await makeTaskRepository(makeContext(WS), {
      clock: new FakeClock("2026-08-30T20:00:00.000Z").now,
    }).countCompletedTasksInWindows([spanWindow(span)]);
    const current = {
      tasksCompleted: counted[0]?.completed ?? 0,
      projectsCompleted: 0,
      goalsCompleted: 0,
    };

    const model = evaluateAnalytics({
      window: "this-week",
      grain: "day",
      span,
      // No buckets and no series: this test is about the FIGURE and the link
      // beneath it, and a trend the assertions never read would only be a
      // second copy of the bucketer's rules in the wrong file.
      buckets: [],
      current,
      previous: null,
      series: [],
      areas: [],
      areasBounded: false,
      areasAvailable: true,
      goals: null,
      overdueSeries: [],
      overduePrevious: null,
      overdueAvailable: false,
      measuredGoals: [],
      measuredGoalsBounded: false,
      measuredGoalsAvailable: true,
      goalContributions: [],
      seriesBounded: false,
      seriesBound: null,
      overdueMoments: 0,
    });
    const metric = model.metrics.find((entry) => entry.id === "tasks");
    expect(metric?.value).toBe(expected);

    /*
     * The parity assertion, over the LINK the panel actually renders. It is
     * resolved through the Tasks module's own URL codec, so a link that named a
     * different sort, a different view or a different window would fail here
     * rather than merely look right.
     */
    expect(metric?.to).toBe(
      completedRangeTasksHref({ from: span.startIso, to: span.endIso }),
    );
    const linked = queryForHref(metric?.to ?? "");
    expect(linked.config.sort).toBe("completed");
    expect(linked.config.systemView).toBe("completed");

    const listed = await readAllPages(
      taskRepo(WS, "2026-08-30T20:00:00.000Z"),
      {
        view: linked.config.systemView === "completed" ? "completed" : "all",
        sort: linked.config.sort,
        filters: linked.filters,
        todayIso,
        timezone,
        limit: 3,
      },
    );
    // Machine values, not sentences: the figure Analytics states IS the number
    // of records the linked list returns for the same period — a reopened Task
    // and a deleted one included, which is where an event count would diverge.
    expect(listed.ids).toHaveLength(metric?.value ?? -1);
    expect(listed.ids).not.toContain(reopened);
    expect(listed.ids).not.toContain(deleted);
  });

  /**
   * The falsification, stated as its own assertion rather than left implicit:
   * the Activity-derived read — which is still the right answer for the
   * question the REVIEW asks, and is untouched — counts the reopened and the
   * deleted Task, so it does NOT equal what the linked list returns. That is
   * why the Task figure reads the completion authority instead.
   */
  it("would NOT agree if the figure counted Activity events", async () => {
    const { expected } = await seedSpanFixture();
    const span = insightWindowDays("this-week", todayIso);
    const window = spanWindow(span);

    const requests: PeriodCountRequest[] = [
      {
        key: "current",
        window: {
          periodStart: span.startIso,
          periodEnd: span.endIso,
          startInstantIso: window.startsAt.toISOString(),
          endInstantIso: window.endsAt.toISOString(),
        },
      },
    ];
    const events = await makeReviewInsightRepository(
      makeContext(WS),
    ).countPeriodCompletions(requests);
    const live = await makeTaskRepository(makeContext(WS), {
      clock: new FakeClock("2026-08-30T20:00:00.000Z").now,
    }).countCompletedTasksInWindows([window]);

    expect(live[0]?.completed).toBe(expected);
    // Two more: the reopened Task and the deleted one, both of whose events
    // survive by design.
    expect(events[0]?.tasksCompleted).toBe(expected + 2);
  });
});

/* -------------------------------------------------------------------------- */
/* 10. Query budget                                                            */
/* -------------------------------------------------------------------------- */

describe("the completion sort and window cost nothing extra", () => {
  it("is ONE statement, exactly like the comparable existing sort", async () => {
    const area = await seedArea(WS, "2026-08-20T00:00:00.000Z");
    for (let i = 0; i < 6; i += 1) {
      await completeAt(
        WS,
        area.id,
        `Budget ${i}`,
        "2026-08-20T01:00:00.000Z",
        `2026-08-2${3 + (i % 5)}T03:00:00.000Z`,
      );
    }

    const counter = countedDb();
    const repo = createTaskRepository(counter.db, makeContext(WS), {
      clock: new FakeClock("2026-08-30T05:00:00.000Z").now,
    });

    const read = async (
      sort: TaskSort,
      filters: WorkspaceTaskFilters,
    ): Promise<{ statements: number; binds: number }> => {
      counter.reset();
      await repo.listWorkspaceTasks({
        view: "completed",
        sort,
        filters,
        todayIso: "2026-08-30",
        timezone: SYDNEY,
      });
      return { statements: counter.statements(), binds: counter.binds() };
    };

    // The baseline: the `updated` sort with no window, which is what the
    // Completed view cost before this item.
    const baseline = await read("updated", {});
    expect(baseline.statements).toBe(1);

    // Same statement count for the new sort, and for the new sort with the
    // window applied. The collection's read budget is unchanged.
    const sorted = await read("completed", {});
    expect(sorted.statements).toBe(baseline.statements);
    expect(sorted.binds).toBe(baseline.binds);

    const windowed = await read("completed", {
      completedFrom: "2026-08-24",
      completedTo: "2026-08-30",
    });
    expect(windowed.statements).toBe(baseline.statements);
    // The window is exactly TWO more binds — one instant per bound — and the
    // recency form exactly one.
    expect(windowed.binds).toBe(baseline.binds + 2);

    const within = await read("completed", { completedWithin: "7d" });
    expect(within.statements).toBe(baseline.statements);
    expect(within.binds).toBe(baseline.binds + 1);
  });

  it("counts many completion windows in ONE statement", async () => {
    // Analytics asks for every bucket plus its two totals — nine windows on the
    // seven-day range. That must cost ONE index range, not nine queries, or the
    // convergence onto the completion authority would have bought truth with a
    // per-bucket read.
    const area = await seedArea(WS, "2026-08-20T00:00:00.000Z");
    for (let i = 0; i < 6; i += 1) {
      await completeAt(
        WS,
        area.id,
        `Window ${i}`,
        "2026-08-20T01:00:00.000Z",
        `2026-08-2${3 + (i % 5)}T03:00:00.000Z`,
      );
    }

    const counter = countedDb();
    const repo = createTaskRepository(counter.db, makeContext(WS), {
      clock: new FakeClock("2026-08-30T05:00:00.000Z").now,
    });
    const windows = Array.from({ length: 9 }, (_value, index) => ({
      key: `w${index}`,
      startsAt: new Date(`2026-08-2${1 + (index % 9)}T00:00:00.000Z`),
      endsAt: new Date(`2026-08-2${1 + (index % 9)}T23:59:59.000Z`),
    }));

    counter.reset();
    const rows = await repo.countCompletedTasksInWindows(windows);
    expect(counter.statements()).toBe(1);
    expect(rows).toHaveLength(windows.length);
    expect(rows.map((row) => row.key)).toEqual(windows.map((w) => w.key));

    // An empty ask costs NOTHING — the same rule every bounded read here holds.
    counter.reset();
    expect(await repo.countCompletedTasksInWindows([])).toEqual([]);
    expect(counter.statements()).toBe(0);
  });
});
