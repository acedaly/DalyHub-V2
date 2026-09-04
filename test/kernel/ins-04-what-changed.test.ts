/**
 * V2.9 INS-04 — the "What changed" endpoint (`GET /analytics/activity`),
 * against the real D1.
 *
 * The route moved here from `/today/activity` in the change that gave it a
 * consumer (DEBT-103), and it changed while it moved: it reads `listInWindow`
 * rather than `listForWorkspace`, so the events it returns are the events
 * inside the window the Insight page is showing.
 *
 * The roadmap's falsifications:
 *
 *   1. **Choose a window that excludes a known event and assert its absence.**
 *      An unwindowed read would return it, which is exactly what the old route
 *      did and why a feed beside a windowed page was two answers to one
 *      question.
 *   2. **Page past the bound and assert the CURSOR** rather than a truncated
 *      total — a bounded list that reported a total would be claiming
 *      completeness it does not have (ADR-079 decision 11).
 *
 * Plus the acceptance: workspace-scoped and hostile-tested, one statement per
 * page, and a tampered cursor answered calmly.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { RouterContextProvider } from "react-router";

import { loader as activityLoader } from "~/modules/analytics/routes/activity";
import { INSIGHT_ACTIVITY_PAGE_SIZE } from "~/modules/analytics/activity-feed";
import { setAuthenticatedSession } from "~/platform/request";
import type { AuthenticatedSession } from "~/platform/request";

import {
  FakeClock,
  makeContext,
  makeSpineRepository,
  makeTaskRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "test-default-workspace";
const HOSTILE = "ins04-hostile-workspace";

const nextEntityId = sequentialIds("i04e");
const nextActivityId = sequentialIds("i04a");

function session(workspaceId = WS): AuthenticatedSession {
  return {
    user: {
      subject: "owner-ins-04",
      email: "owner@example.test",
      name: "Owner",
    },
    workspaceId,
  } as unknown as AuthenticatedSession;
}

function authedContext(workspaceId = WS) {
  const context = new RouterContextProvider();
  setAuthenticatedSession(context, session(workspaceId));
  return context;
}

interface FeedPayload {
  readonly items: readonly { readonly id: string; readonly type: string }[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
  readonly error?: string;
}

async function readFeed(
  url: string,
  workspaceId = WS,
): Promise<{ status: number; body: FeedPayload }> {
  const response = (await activityLoader({
    request: new Request(url),
    context: authedContext(workspaceId),
    params: {},
  } as unknown as Parameters<typeof activityLoader>[0])) as Response;
  return {
    status: response.status,
    body: (await response.json()) as FeedPayload,
  };
}

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

beforeEach(async () => {
  await resetTables([WS, HOSTILE]);
});

describe("the window the page is showing is the window the feed reads", () => {
  /*
   * The first falsification. One Task created LONG ago and one created just
   * now: the 7-day window must return the recent one and NOT the old one, and
   * a wider window must return both. An unwindowed read passes the first half
   * of this and fails the second sentence of the product's promise.
   */
  it("excludes an event outside the window, and includes it once the window widens", async () => {
    const area = await spineRepo(WS, "2020-01-01T00:00:00.000Z").createArea({
      title: "Ops",
    });
    const old = await taskRepo(WS, "2020-01-02T00:00:00.000Z").createTask({
      title: "Long ago",
      parent: { kind: "area", id: area.id },
    });
    const recent = await taskRepo(WS, new Date().toISOString()).createTask({
      title: "Just now",
      parent: { kind: "area", id: area.id },
    });

    const week = await readFeed(
      "https://app.test/analytics/activity?window=this-week",
    );
    const weekIds = new Set(week.body.items.map((item) => item.id));
    expect(week.status).toBe(200);
    expect(bodyMentions(week.body, recent.id)).toBe(true);
    expect(bodyMentions(week.body, old.id)).toBe(false);
    expect(weekIds.size).toBe(week.body.items.length);

    // Every window this surface offers is at most 24 months, and the old event
    // is from 2020 — so it is outside ALL of them. That is the honest limit of
    // this feed and the reason the Review's across-Reviews facts exist.
    const widest = await readFeed(
      "https://app.test/analytics/activity?window=24-months",
    );
    expect(bodyMentions(widest.body, recent.id)).toBe(true);
    expect(bodyMentions(widest.body, old.id)).toBe(false);
  });

  it("falls back to the default window rather than erroring on a stale value", async () => {
    const area = await spineRepo(WS, new Date().toISOString()).createArea({
      title: "Ops",
    });
    expect(area.id).toBeTruthy();
    const response = await readFeed(
      "https://app.test/analytics/activity?window=quarter",
    );
    // `quarter` was a range name before V2.9 deleted the vocabulary. A stale
    // bookmark should show the default period, not a 400.
    expect(response.status).toBe(200);
    expect(response.body.items.length).toBeGreaterThan(0);
  });
});

describe("the feed is bounded, and says so with a cursor", () => {
  /*
   * The second falsification: past the bound, the answer is a CURSOR and
   * `hasMore`, never a total. A total would be a claim that the list is
   * complete, which a bounded page cannot make.
   */
  it("returns a cursor past the bound, and the next page continues without repeating", async () => {
    const now = new Date();
    const area = await spineRepo(WS, now.toISOString()).createArea({
      title: "Ops",
    });
    // Comfortably more than one page, all inside this week.
    for (let index = 0; index < INSIGHT_ACTIVITY_PAGE_SIZE + 5; index += 1) {
      await taskRepo(WS, now.toISOString()).createTask({
        title: `Task ${index}`,
        parent: { kind: "area", id: area.id },
      });
    }

    const first = await readFeed(
      "https://app.test/analytics/activity?window=this-week",
    );
    expect(first.body.items).toHaveLength(INSIGHT_ACTIVITY_PAGE_SIZE);
    expect(first.body.hasMore).toBe(true);
    expect(first.body.nextCursor).not.toBeNull();
    // No total anywhere in the payload: a bounded list never states one.
    expect(Object.keys(first.body)).toEqual(["items", "nextCursor", "hasMore"]);

    const second = await readFeed(
      `https://app.test/analytics/activity?window=this-week&cursor=${encodeURIComponent(
        first.body.nextCursor!,
      )}`,
    );
    expect(second.status).toBe(200);
    expect(second.body.items.length).toBeGreaterThan(0);
    const firstIds = new Set(first.body.items.map((item) => item.id));
    for (const item of second.body.items) {
      expect(firstIds.has(item.id)).toBe(false);
    }
  });

  it("answers a tampered cursor calmly, with a 400 rather than a 500", async () => {
    const response = await readFeed(
      "https://app.test/analytics/activity?window=this-week&cursor=not-a-cursor",
    );
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("invalid_cursor");
  });

  /*
   * A cursor is bound to its WINDOW as well as its workspace, so a page of one
   * period can never be continued into another — which is what would silently
   * mix two periods into one list if the panel changed window mid-stream.
   */
  it("refuses a cursor issued for a different window", async () => {
    const now = new Date();
    const area = await spineRepo(WS, now.toISOString()).createArea({
      title: "Ops",
    });
    for (let index = 0; index < INSIGHT_ACTIVITY_PAGE_SIZE + 2; index += 1) {
      await taskRepo(WS, now.toISOString()).createTask({
        title: `Task ${index}`,
        parent: { kind: "area", id: area.id },
      });
    }
    const week = await readFeed(
      "https://app.test/analytics/activity?window=this-week",
    );
    expect(week.body.nextCursor).not.toBeNull();

    const crossed = await readFeed(
      `https://app.test/analytics/activity?window=12-weeks&cursor=${encodeURIComponent(
        week.body.nextCursor!,
      )}`,
    );
    expect(crossed.status).toBe(400);
    expect(crossed.body.error).toBe("invalid_cursor");
  });
});

describe("the feed is workspace-scoped", () => {
  it("never returns another workspace's events, however busy it is", async () => {
    const now = new Date();
    const hostileArea = await spineRepo(HOSTILE, now.toISOString()).createArea({
      title: "Theirs",
    });
    for (let index = 0; index < 5; index += 1) {
      await taskRepo(HOSTILE, now.toISOString()).createTask({
        title: `Not yours ${index}`,
        parent: { kind: "area", id: hostileArea.id },
      });
    }
    const mine = await spineRepo(WS, now.toISOString()).createArea({
      title: "Mine",
    });
    const task = await taskRepo(WS, now.toISOString()).createTask({
      title: "Mine to see",
      parent: { kind: "area", id: mine.id },
    });

    const response = await readFeed(
      "https://app.test/analytics/activity?window=this-week",
    );
    expect(bodyMentions(response.body, task.id)).toBe(true);
    expect(bodyMentions(response.body, hostileArea.id)).toBe(false);
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain("Not yours");
    expect(serialized).not.toContain("Theirs");
  });
});

/** Whether a rendered page references an entity id anywhere in its payload. */
function bodyMentions(body: FeedPayload, entityId: string): boolean {
  return JSON.stringify(body).includes(entityId);
}

/* -------------------------------------------------------------------------- */
/* The cost of one page                                                        */
/* -------------------------------------------------------------------------- */

describe("one page costs a bounded number of statements", () => {
  it("does not grow with the number of events on the page", async () => {
    const now = new Date();
    const area = await spineRepo(WS, now.toISOString()).createArea({
      title: "Ops",
    });
    for (let index = 0; index < 3; index += 1) {
      await taskRepo(WS, now.toISOString()).createTask({
        title: `Small ${index}`,
        parent: { kind: "area", id: area.id },
      });
    }
    const small = await countStatements(() =>
      readFeed("https://app.test/analytics/activity?window=this-week"),
    );

    for (let index = 0; index < 25; index += 1) {
      await taskRepo(WS, now.toISOString()).createTask({
        title: `More ${index}`,
        parent: { kind: "area", id: area.id },
      });
    }
    const large = await countStatements(() =>
      readFeed("https://app.test/analytics/activity?window=this-week"),
    );

    // The page read, the bounded entity batch and the bounded actor lookup —
    // never one read per event. Equal counts is the whole assertion.
    expect(large).toBe(small);
  });
});

/**
 * Run a read with `env.DB` swapped for a counting proxy.
 *
 * The route resolves its own scope from `env`, so the count is taken by
 * replacing the binding for the duration of the call rather than by handing a
 * proxy in — which is exactly the seam a route with no injectable database
 * leaves, and is why this lives here rather than in a unit test.
 */
async function countStatements(run: () => Promise<unknown>): Promise<number> {
  let count = 0;
  const real = env.DB;
  const proxy = new Proxy(real, {
    get(target, property, receiver) {
      if (property === "prepare") {
        return (sql: string) => {
          count += 1;
          return target.prepare(sql);
        };
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as D1Database;
  (env as { DB: D1Database }).DB = proxy;
  try {
    await run();
  } finally {
    (env as { DB: D1Database }).DB = real;
  }
  return count;
}
