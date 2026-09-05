/**
 * V2.7 RECALL-03 — commitments return when due. The repository proof.
 *
 * Every assertion here runs against the REAL D1 (the Workers test pool), because
 * every claim is about SQL: which column decides membership, which calendar day
 * it is compared against, how many statements and binds it costs, whether a
 * keyset page can skip or repeat a row, and which workspace's rows can come
 * back. A fake repository could satisfy none of them.
 *
 * The one follow-up authority is `task_details.follow_up_on` — a wall-calendar
 * date on the Task's DELEGATION group — read through the one declarative
 * `followUp` dimension (ADR-114 decision 5). There is no new Task status, no new
 * notification kind and no reminder engine anywhere in this file, by design.
 *
 * What it proves, in the order the roadmap asks for it:
 *
 *   1. **One fixture, three surfaces.** A delegated waiting Task with
 *      `followUpOn = today` appears in the declarative filter, in Today's
 *      attention fact and in that day's digest — compared as MACHINE VALUES,
 *      never as display prose. Falsified by dropping `followUpOn` from the due
 *      predicate and by pointing the digest at the generic waiting count.
 *   2. **Date states.** Yesterday is overdue and due; today is due today and
 *      due; tomorrow is neither; a Task with no date answers only `none`.
 *   3. **Owner day.** The SAME stored date and the SAME instant resolve
 *      differently for owners in different zones — a naïve UTC day is falsified.
 *   4. **Workspace isolation.** Hostile follow-ups in a second workspace reach
 *      neither the filter, the count, the Today fact, the digest nor Waiting.
 *   5. **Waiting pages.** 150 waiting Tasks, walked by keyset cursor: row 101 is
 *      reachable, every row appears exactly once, none is omitted, and the
 *      cursor is rejected under another scope.
 *   6. **Export → restore.** The date survives the round trip AND the restored
 *      commitment is found by the new filter — live again, not merely stored.
 *   7. **Reopen.** Reopening leaves `followUpOn` untouched and still answering.
 *   8. **Recurrence.** The successor inherits per the EXISTING
 *      delegation-inheritance rule, recorded here so RECALL-03 cannot change it.
 *   9. **Round trips.** The dimension survives a URL and a saved view.
 *  10. **Cost.** The filter adds no statement and at most the budgeted binds;
 *      the shared facts layer adds exactly one bounded count read.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { createActivityActorContext } from "~/kernel/activity";
import type { WorkspaceSnapshotV1 } from "~/kernel/export";
import { renderDigest } from "~/kernel/notifications";
import type { TaskFollowUpState, WorkspaceTaskFilters } from "~/kernel/tasks";
import {
  DEFAULT_TASK_VIEW_CONFIG,
  parseTaskViewConfig,
  serialiseTaskViewConfig,
  toWorkspaceFilters,
  type TaskViewConfig,
} from "~/kernel/task-views";
import { buildAttention } from "~/modules/today/day/attention-view";
import {
  configFromParams,
  paramsFromConfig,
} from "~/modules/tasks/tasks-url-state";
import {
  parseWaitingFollowUp,
  waitingFollowUpHref,
} from "~/modules/today/waiting-destination";
import { taskFollowUpPresentation } from "~/shared/task-record/task-view";
import {
  WAITING_LIMIT,
  readWaiting,
} from "~/platform/attention/attention-facts.server";
import {
  buildWorkspaceSnapshot,
  buildStructuredExportArchive,
} from "~/platform/export";
import { readDigestFacts } from "~/platform/notifications/digest-facts.server";
import { applyRestore, prepareRestore } from "~/platform/restore";
import {
  createTaskRepository,
  createWorkspaceRestoreRepository,
  createWorkspaceSnapshotRepository,
} from "~/platform/storage/d1";
import { bindWorkspaceRepositories } from "~/platform/workspaces";

import {
  FakeClock,
  ensureWorkspace,
  makeContext,
  makeSpineRepository,
  makeTaskRepository,
  makeTaskViewRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "test-default-workspace";
const HOSTILE = "recall03-hostile-workspace";
const RESTORE_TARGET = "recall03-restore-target";
const OWNER = "owner-recall-03";

const SYDNEY = "Australia/Sydney";
const LOS_ANGELES = "America/Los_Angeles";

/** The owner's day every fixture is written against. */
const TODAY = "2026-08-31";
const YESTERDAY = "2026-08-30";
const TOMORROW = "2026-09-01";

const nextEntityId = sequentialIds("r03e");
const nextActivityId = sequentialIds("r03a");
const nextViewId = sequentialIds("r03v");

function spineRepo(ws: string, at = "2026-08-20T00:00:00.000Z") {
  return makeSpineRepository(makeContext(ws), {
    clock: new FakeClock(at).now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  });
}

function taskRepo(ws: string, at = "2026-08-20T00:00:00.000Z") {
  return makeTaskRepository(makeContext(ws), {
    clock: new FakeClock(at).now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  });
}

function scopeFor(db: D1Database = env.DB, ws = WS) {
  return bindWorkspaceRepositories(
    { DB: db },
    makeContext(ws),
    createActivityActorContext({ type: "user", id: OWNER }),
  );
}

/**
 * Seed one DELEGATED, WAITING Task carrying a follow-up date.
 *
 * The realistic shape of the commitment RECALL-03 exists for: work handed to
 * someone else, blocked on them, with the day the owner said they would chase
 * it. Every fixture below is this Task with one fact changed.
 */
async function seedFollowUp(
  ws: string,
  areaId: string,
  title: string,
  followUpOn: string | null,
  at = "2026-08-20T00:00:00.000Z",
): Promise<string> {
  const tasks = taskRepo(ws, at);
  const task = await tasks.createTask({
    title,
    parent: { kind: "area", id: areaId },
  });
  await tasks.updateTask(task.id, {
    delegation: { to: "Sam", delegatedOn: "2026-08-20", followUpOn },
  });
  await tasks.setWaiting(task.id, {
    target: { kind: "text", note: `${title} — with Sam` },
  });
  return task.id;
}

/** Every id the declarative filter returns, walked page by page. */
async function filterIds(
  ws: string,
  filters: WorkspaceTaskFilters,
  options: { readonly todayIso?: string; readonly timezone?: string } = {},
): Promise<string[]> {
  const tasks = taskRepo(ws);
  const ids: string[] = [];
  let cursor: string | undefined;
  let pages = 0;
  do {
    const page = await tasks.listWorkspaceTasks({
      view: "all",
      sort: "smart",
      filters,
      todayIso: options.todayIso ?? TODAY,
      timezone: options.timezone ?? SYDNEY,
      cursor,
    });
    pages += 1;
    ids.push(...page.items.map((item) => item.id));
    cursor = page.nextCursor ?? undefined;
    expect(pages).toBeLessThan(50);
  } while (cursor !== undefined);
  return ids;
}

/** The whole Waiting collection, walked page by page through its keyset cursor. */
async function waitingIds(
  ws: string,
  input: {
    readonly limit?: number;
    readonly followUp?: TaskFollowUpState;
    readonly todayIso?: string;
  } = {},
): Promise<{ readonly ids: string[]; readonly pages: number }> {
  const tasks = taskRepo(ws);
  const ids: string[] = [];
  let cursor: string | undefined;
  let pages = 0;
  do {
    const page = await tasks.listWaitingTasks({
      limit: input.limit,
      todayIso: input.todayIso ?? TODAY,
      followUp: input.followUp,
      cursor,
    });
    pages += 1;
    ids.push(...page.items.map((item) => item.id));
    cursor = page.nextCursor ?? undefined;
    expect(pages).toBeLessThan(30);
  } while (cursor !== undefined);
  return { ids, pages };
}

/** The declarative config a `/tasks?…` or `/today/waiting?…` link resolves to. */
function filtersForTasksHref(href: string): WorkspaceTaskFilters {
  const params = new URLSearchParams(href.slice(href.indexOf("?") + 1));
  return toWorkspaceFilters(configFromParams(params));
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

beforeEach(async () => {
  await resetTables([WS, HOSTILE, RESTORE_TARGET]);
});

/* -------------------------------------------------------------------------- */
/* A. One fixture, three surfaces                                              */
/* -------------------------------------------------------------------------- */

describe("one seeded commitment reaches the filter, Today and the digest", () => {
  /**
   * The roadmap's defining fixture: ONE delegated Task with `followUpOn` today,
   * beside waiting work that carries no follow-up at all. The second and third
   * Tasks exist so the three surfaces have something to be WRONG about — a fact
   * that simply counted "waiting" would report 3 everywhere and the parity
   * assertions below would pass for nothing.
   */
  async function seedThreeSurfaceFixture() {
    const area = await spineRepo(WS).createArea({ title: "Ops" });
    const due = await seedFollowUp(
      WS,
      area.id,
      "Chase the signed contract",
      TODAY,
    );
    const later = await seedFollowUp(
      WS,
      area.id,
      "Chase the invoice",
      TOMORROW,
    );
    const none = await seedFollowUp(WS, area.id, "Awaiting a callback", null);
    return { areaId: area.id, due, later, none };
  }

  const digestInput = {
    now: new Date(`${TODAY}T23:00:00.000Z`),
    timeZone: SYDNEY,
    localDate: TODAY,
  };

  it("agrees as machine values across all three", async () => {
    const { due } = await seedThreeSurfaceFixture();
    const scope = scopeFor();

    // 1. The declarative filter.
    const filtered = await filterIds(WS, { followUp: "due" });
    expect(filtered).toEqual([due]);

    // 2. Today's attention fact, from the SHARED facts layer the rail reads.
    const waiting = await readWaiting(scope, TODAY, SYDNEY);
    expect(waiting.count).toBe(3);
    expect(waiting.followUpDue).toBe(1);

    // 3. That day's digest, from the same layer through the digest's own read.
    const digestFacts = await readDigestFacts(scope, digestInput);
    expect(digestFacts.waiting.followUpDue).toBe(1);

    // The parity claim, stated as MACHINE VALUES rather than as prose: one
    // population, three surfaces, one number.
    expect(waiting.followUpDue).toBe(filtered.length);
    expect(digestFacts.waiting.followUpDue).toBe(filtered.length);

    // …and the linked destination returns exactly that population, so the count
    // and the list it opens cannot describe different Tasks.
    const linked = waitingFollowUpHref("due");
    expect(
      parseWaitingFollowUp(
        new URL(linked, "https://x").searchParams.get("followUp"),
      ),
    ).toBe("due");
    const linkedIds = await waitingIds(WS, { followUp: "due" });
    expect(linkedIds.ids).toEqual([due]);
  });

  it("states the fact on the EXISTING waiting row, linked to the filtered surface", async () => {
    await seedThreeSurfaceFixture();
    const waiting = await readWaiting(scopeFor(), TODAY, SYDNEY);

    const rail = buildAttention({
      inboxCount: 0,
      waiting,
      assets: { visibleCount: 0, trackedAsTasksCount: 0, first: null },
      projects: [],
      goals: [],
    });

    // No new card, no new band: ONE row, the one that already existed.
    expect(rail.map((item) => item.id)).toEqual(["waiting"]);
    const row = rail[0];
    expect(row.detail).toContain("3 waiting items");
    // The two facts stay distinct, and the follow-up count links to the
    // FILTERED surface — never to the unfiltered waiting list.
    expect(row.href).toBe("/today/waiting");
    expect(row.detailAction).toEqual({
      label: "1 follow-up due",
      href: "/today/waiting?followUp=due",
    });
  });

  it("renders exactly one digest line, and none when nothing is due", async () => {
    const { areaId } = await seedThreeSurfaceFixture();
    const scope = scopeFor();

    const withDue = renderDigest(await readDigestFacts(scope, digestInput));
    const lines = withDue?.body.split("\n") ?? [];
    expect(lines.filter((line) => line.includes("follow-up"))).toEqual([
      "1 follow-up due",
    ]);

    // Move the only due follow-up into the future: the LINE disappears while
    // the waiting line stays, which is the digest's existing suppression rule
    // applied to a new fact rather than a new rule invented for it.
    const dueId = (await filterIds(WS, { followUp: "due" }))[0];
    await taskRepo(WS).updateTask(dueId, {
      delegation: {
        to: "Sam",
        delegatedOn: "2026-08-20",
        followUpOn: TOMORROW,
      },
    });
    const quiet = renderDigest(await readDigestFacts(scope, digestInput));
    expect(quiet?.body).toContain("waiting items");
    expect(quiet?.body).not.toContain("follow-up");
    expect(areaId).toBeTruthy();
  });

  /**
   * FALSIFICATION 1 — drop `followUpOn` from the due predicate.
   *
   * A "due" filter that ignored the date would return every waiting Task. The
   * assertion below is the shape that catches it: the fact must be a STRICT
   * subset of the waiting count on a fixture where two of the three Tasks are
   * not due. Running the same query with no follow-up filter proves the two
   * populations are genuinely different, so a predicate that lost the column
   * would fail the parity test above rather than quietly agree with it.
   */
  it("falsifies a due predicate that ignores the date", async () => {
    await seedThreeSurfaceFixture();
    const all = await waitingIds(WS);
    const due = await waitingIds(WS, { followUp: "due" });
    expect(all.ids).toHaveLength(3);
    expect(due.ids).toHaveLength(1);
    expect(due.ids.length).toBeLessThan(all.ids.length);

    const facts = await readWaiting(scopeFor(), TODAY, SYDNEY);
    // The exact substitution the falsification names: `followUpDue = count`.
    expect(facts.followUpDue).not.toBe(facts.count);
  });
});

/* -------------------------------------------------------------------------- */
/* A1. V2.8 CONV-02 — the ROW states the same machine value                   */
/* -------------------------------------------------------------------------- */

describe("the shared row's follow-up state is the filter's, the rail's and the digest's", () => {
  /**
   * RECALL-03's three-surface parity, EXTENDED to the fourth consumer the
   * Waiting surface gained in V2.8 CONV-02: the shared `TaskRow`'s optional
   * waiting fact, whose follow-up state is `taskFollowUpPresentation` over the
   * same `followUpOn` the Waiting read returns, against the same owner-day.
   *
   * The claim is stated as MACHINE VALUES — the row's `state` against the
   * declarative filter's membership, the count and the digest — never as
   * prose. One fixture, every date state, so a row that called an upcoming
   * chase "due" (or a due one "upcoming") disagrees with the filter that
   * would return it, and the assertion names the row.
   */
  async function seedEveryState() {
    const area = await spineRepo(WS).createArea({ title: "Ops" });
    return {
      yesterday: await seedFollowUp(WS, area.id, "Yesterday", YESTERDAY),
      today: await seedFollowUp(WS, area.id, "Today", TODAY),
      tomorrow: await seedFollowUp(WS, area.id, "Tomorrow", TOMORROW),
      none: await seedFollowUp(WS, area.id, "None", null),
    };
  }

  /** Every waiting row, with the state the row would draw for it. */
  async function rowStates() {
    const page = await taskRepo(WS).listWaitingTasks({
      limit: 50,
      todayIso: TODAY,
    });
    return new Map(
      page.items.map((item) => [
        item.id,
        taskFollowUpPresentation(item.followUpOn, TODAY)?.state ?? null,
      ]),
    );
  }

  it("agrees with the declarative filter for every state, as machine values", async () => {
    const seeded = await seedEveryState();
    const rows = await rowStates();
    expect(rows.size).toBe(4);
    // Each row's state is exactly the filter that returns it.
    expect(rows.get(seeded.yesterday)).toBe("overdue");
    expect(rows.get(seeded.today)).toBe("due_today");
    expect(rows.get(seeded.tomorrow)).toBe("upcoming");
    expect(rows.get(seeded.none)).toBeNull();
    const withState = (state: string | null) =>
      [...rows.entries()]
        .filter(([, value]) => value === state)
        .map(([id]) => id)
        .sort();
    expect((await filterIds(WS, { followUp: "overdue" })).sort()).toEqual(
      withState("overdue"),
    );
    expect((await filterIds(WS, { followUp: "due_today" })).sort()).toEqual(
      withState("due_today"),
    );
    expect((await filterIds(WS, { followUp: "upcoming" })).sort()).toEqual(
      withState("upcoming"),
    );
    expect((await filterIds(WS, { followUp: "none" })).sort()).toEqual(
      withState(null),
    );
    // `due` is the union of the two actionable states — the rows that read
    // "Follow up overdue" and "Follow up due" are exactly the filter's `due`.
    expect((await filterIds(WS, { followUp: "due" })).sort()).toEqual(
      [...withState("overdue"), ...withState("due_today")].sort(),
    );
  });

  it("agrees with Today's attention fact and the digest, as one number", async () => {
    await seedEveryState();
    const rows = await rowStates();
    const dueRows = [...rows.values()].filter(
      (state) => state === "overdue" || state === "due_today",
    ).length;
    expect(dueRows).toBe(2);

    const scope = scopeFor();
    const waiting = await readWaiting(scope, TODAY, SYDNEY);
    const digest = await readDigestFacts(scope, {
      now: new Date(`${TODAY}T23:00:00.000Z`),
      timeZone: SYDNEY,
      localDate: TODAY,
    });
    expect(waiting.followUpDue).toBe(dueRows);
    expect(digest.waiting.followUpDue).toBe(dueRows);
    expect(waiting.count).toBe(rows.size);
    // …and the surface the rail links to shows exactly the rows that read
    // as due, in the row's own state.
    const linked = await waitingIds(WS, { followUp: "due" });
    expect(linked.ids.every((id) => rows.get(id) !== "upcoming")).toBe(true);
    expect(linked.ids.every((id) => rows.get(id) !== null)).toBe(true);
    expect(linked.ids).toHaveLength(dueRows);
  });

  it("moves with the owner's day exactly as the filter does", async () => {
    const seeded = await seedEveryState();
    // Read on the owner's NEXT day: today's chase is now overdue, tomorrow's
    // is due today — and the filter says the same of the same rows.
    const page = await taskRepo(WS).listWaitingTasks({
      limit: 50,
      todayIso: TOMORROW,
    });
    const states = new Map(
      page.items.map((item) => [
        item.id,
        taskFollowUpPresentation(item.followUpOn, TOMORROW)?.state ?? null,
      ]),
    );
    expect(states.get(seeded.today)).toBe("overdue");
    expect(states.get(seeded.tomorrow)).toBe("due_today");
    expect(
      (
        await filterIds(WS, { followUp: "overdue" }, { todayIso: TOMORROW })
      ).sort(),
    ).toEqual([seeded.yesterday, seeded.today].sort());
    expect(
      await filterIds(WS, { followUp: "due_today" }, { todayIso: TOMORROW }),
    ).toEqual([seeded.tomorrow]);
  });
});

/* -------------------------------------------------------------------------- */
/* A2. The two waiting facts cannot contradict each other                      */
/* -------------------------------------------------------------------------- */

describe("the waiting total and the follow-ups due are one population", () => {
  /**
   * The defect a review of this branch (Codex, P2) found, as a regression.
   *
   * Today's rail read its waiting COUNT from a page bounded at `WAITING_LIMIT`
   * (50) while the follow-up count was an unbounded aggregate. Above that bound
   * the two disagree in a way that is not merely wrong but IMPOSSIBLE — "50
   * waiting items · 60 follow-ups due" — and it directly contradicts the subset
   * relationship the fact is documented to have.
   *
   * The fixture is deliberately just over the bound: 60 waiting Tasks, every one
   * of them with a follow-up due today. Before the fix `count` is 50 and
   * `followUpDue` is 60; after it, both are 60, because both are counted over
   * the same rows of one statement.
   */
  const SEEDED = 60;

  async function seedPastTheRailsPageSize() {
    const area = await spineRepo(WS).createArea({ title: "Ops" });
    const clock = new FakeClock("2026-08-01T00:00:00.000Z");
    const tasks = makeTaskRepository(makeContext(WS), {
      clock: clock.now,
      idGenerator: nextEntityId,
      activityIdGenerator: nextActivityId,
    });
    for (let i = 0; i < SEEDED; i += 1) {
      const task = await tasks.createTask({
        title: `Chase ${String(i).padStart(3, "0")}`,
        parent: { kind: "area", id: area.id },
      });
      await tasks.updateTask(task.id, {
        delegation: { to: "Sam", delegatedOn: "2026-08-01", followUpOn: TODAY },
      });
      await tasks.setWaiting(task.id, {
        target: { kind: "text", note: `party ${i}` },
      });
      clock.advance(60_000);
    }
  }

  it("never states more follow-ups due than there are waiting items", async () => {
    await seedPastTheRailsPageSize();
    const facts = await readWaiting(scopeFor(), TODAY, SYDNEY);

    // Both are the WHOLE population, not the rail's page.
    expect(facts.count).toBe(SEEDED);
    expect(facts.followUpDue).toBe(SEEDED);
    // The documented relationship, asserted as an inequality so it holds for
    // every fixture rather than only for this one.
    expect(facts.followUpDue).toBeLessThanOrEqual(facts.count);
    // And the specific sentence that must never be printable.
    expect(facts.count).toBeGreaterThan(WAITING_LIMIT);
  });

  it("says the same thing in the digest, from the same read", async () => {
    await seedPastTheRailsPageSize();
    const digest = await readDigestFacts(scopeFor(), {
      now: new Date(`${TODAY}T23:00:00.000Z`),
      timeZone: SYDNEY,
      localDate: TODAY,
    });
    expect(digest.waiting.count).toBe(SEEDED);
    expect(digest.waiting.followUpDue).toBe(SEEDED);
    expect(digest.waiting.followUpDue).toBeLessThanOrEqual(
      digest.waiting.count,
    );
  });

  it("counts both facts in ONE statement, over the same rows", async () => {
    await seedPastTheRailsPageSize();
    const counter = countedDb();
    const repo = createTaskRepository(counter.db, makeContext(WS), {});
    counter.reset();
    const counts = await repo.countWaitingTasks({ todayIso: TODAY });
    // One statement is what makes the subset relationship a property of the SQL
    // rather than of a convention two call sites have to remember.
    expect(counter.statements()).toBe(1);
    expect(counter.binds()).toBe(2);
    expect(counts).toEqual({ total: SEEDED, followUpDue: SEEDED });
  });

  it("keeps the subset strict when only some are due", async () => {
    const area = await spineRepo(WS).createArea({ title: "Ops" });
    await seedFollowUp(WS, area.id, "Due", TODAY);
    await seedFollowUp(WS, area.id, "Later", TOMORROW);
    await seedFollowUp(WS, area.id, "None", null);
    const counts = await taskRepo(WS).countWaitingTasks({ todayIso: TODAY });
    expect(counts).toEqual({ total: 3, followUpDue: 1 });
  });
});

/* -------------------------------------------------------------------------- */
/* B. Date states                                                              */
/* -------------------------------------------------------------------------- */

describe("the follow-up states partition the workspace by the owner's day", () => {
  async function seedEveryDateState() {
    const area = await spineRepo(WS).createArea({ title: "Ops" });
    return {
      yesterday: await seedFollowUp(WS, area.id, "Yesterday", YESTERDAY),
      today: await seedFollowUp(WS, area.id, "Today", TODAY),
      tomorrow: await seedFollowUp(WS, area.id, "Tomorrow", TOMORROW),
      none: await seedFollowUp(WS, area.id, "None", null),
    };
  }

  it("answers due / due today / overdue / upcoming / none", async () => {
    const seeded = await seedEveryDateState();

    expect(await filterIds(WS, { followUp: "overdue" })).toEqual([
      seeded.yesterday,
    ]);
    expect(await filterIds(WS, { followUp: "due_today" })).toEqual([
      seeded.today,
    ]);
    // `due` is the union of the two — the actionable question, and the one the
    // attention fact and the digest read.
    expect((await filterIds(WS, { followUp: "due" })).sort()).toEqual(
      [seeded.yesterday, seeded.today].sort(),
    );
    expect(await filterIds(WS, { followUp: "upcoming" })).toEqual([
      seeded.tomorrow,
    ]);
    expect(await filterIds(WS, { followUp: "none" })).toEqual([seeded.none]);

    // Tomorrow's follow-up is NOT due — the rule the whole item rests on.
    expect(await filterIds(WS, { followUp: "due" })).not.toContain(
      seeded.tomorrow,
    );
  });

  it("reads the explicit window in the due/planned range grammar", async () => {
    const seeded = await seedEveryDateState();

    // A closed window, both bounds inclusive, exactly like `dueFrom`/`dueTo`.
    expect(
      (
        await filterIds(WS, {
          followUpFrom: YESTERDAY,
          followUpTo: TODAY,
        })
      ).sort(),
    ).toEqual([seeded.yesterday, seeded.today].sort());

    // A Task with no follow-up date is inside NO window — the rule that stops a
    // window quietly returning the whole backlog.
    expect(
      await filterIds(WS, {
        followUpFrom: "2000-01-01",
        followUpTo: "2100-01-01",
      }),
    ).not.toContain(seeded.none);
  });

  it("is a filter, not a status: the Tasks keep the status they had", async () => {
    const seeded = await seedEveryDateState();
    const task = await taskRepo(WS).getTask(seeded.yesterday);
    // No new lifecycle state anywhere: an overdue chase is an ordinary `todo`
    // Task that happens to carry a date (ADR-114 decision 5).
    expect(task?.status).toBe("todo");
    expect(task?.completedAt).toBeNull();
    expect(task?.delegation?.followUpOn).toBe(YESTERDAY);
  });
});

/* -------------------------------------------------------------------------- */
/* C. The owner's day, not UTC                                                 */
/* -------------------------------------------------------------------------- */

describe("due is resolved against the OWNER's calendar day", () => {
  /**
   * The boundary fixture, comparable to RECALL-02's.
   *
   * One instant — 2026-08-31T13:00Z — is 31 August 23:00 in Sydney and 31
   * August 06:00 in Los Angeles, so both owners agree. Twelve hours earlier,
   * 2026-08-31T01:00Z, is 31 August 11:00 in Sydney but STILL 30 August 18:00
   * in Los Angeles — and a follow-up dated 31 August is due for the Sydney
   * owner and not yet due for the Californian one, from the same row.
   *
   * `todayIso` is the owner's calendar day, resolved by the ONE timezone
   * authority before it reaches the repository, which is exactly why this test
   * passes the two different days rather than two different zones to a query
   * that computes its own.
   */
  it("resolves the same stored date differently for two owners", async () => {
    const area = await spineRepo(WS).createArea({ title: "Ops" });
    const task = await seedFollowUp(WS, area.id, "Chase Sam", TODAY);

    // The Sydney owner is already living on 31 August.
    expect(
      await filterIds(
        WS,
        { followUp: "due" },
        { todayIso: TODAY, timezone: SYDNEY },
      ),
    ).toEqual([task]);

    // The Californian owner is still on 30 August: the same row is upcoming.
    expect(
      await filterIds(
        WS,
        { followUp: "due" },
        { todayIso: YESTERDAY, timezone: LOS_ANGELES },
      ),
    ).toEqual([]);
    expect(
      await filterIds(
        WS,
        { followUp: "upcoming" },
        { todayIso: YESTERDAY, timezone: LOS_ANGELES },
      ),
    ).toEqual([task]);

    // The Waiting surface and the count agree with the collection, because all
    // three resolve the same predicate against the same supplied owner-day.
    expect(
      (await waitingIds(WS, { followUp: "due", todayIso: TODAY })).ids,
    ).toEqual([task]);
    expect(
      (await waitingIds(WS, { followUp: "due", todayIso: YESTERDAY })).ids,
    ).toEqual([]);
    expect(
      (await taskRepo(WS).countWaitingTasks({ todayIso: YESTERDAY }))
        .followUpDue,
    ).toBe(0);
    expect(
      (await taskRepo(WS).countWaitingTasks({ todayIso: TODAY })).followUpDue,
    ).toBe(1);
  });

  it("never compares against a naïve UTC day", async () => {
    const area = await spineRepo(WS).createArea({ title: "Ops" });
    await seedFollowUp(WS, area.id, "Chase Sam", TODAY);
    const scope = scopeFor();

    /*
     * 2026-08-31T01:00:00Z is 31 August in Sydney and 30 August in Los Angeles.
     * If any surface read a UTC day from the clock instead of the owner's day,
     * both owners would get the same answer. They must not.
     */
    const instant = new Date("2026-08-31T01:00:00.000Z");
    const sydney = await readDigestFacts(scope, {
      now: instant,
      timeZone: SYDNEY,
      localDate: TODAY,
    });
    const california = await readDigestFacts(scope, {
      now: instant,
      timeZone: LOS_ANGELES,
      localDate: YESTERDAY,
    });
    expect(sydney.waiting.followUpDue).toBe(1);
    expect(california.waiting.followUpDue).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* D. Workspace isolation                                                      */
/* -------------------------------------------------------------------------- */

describe("hostile follow-ups in another workspace reach nothing", () => {
  it("is invisible to the filter, the count, Today, the digest and Waiting", async () => {
    await ensureWorkspace(HOSTILE);
    const hostileArea = await spineRepo(HOSTILE).createArea({
      title: "Theirs",
    });
    for (const title of ["Hostile A", "Hostile B", "Hostile C"]) {
      await seedFollowUp(HOSTILE, hostileArea.id, title, TODAY);
    }
    // The owner's own workspace holds ONE due follow-up.
    const area = await spineRepo(WS).createArea({ title: "Ops" });
    const mine = await seedFollowUp(WS, area.id, "Chase Sam", TODAY);

    expect(await filterIds(WS, { followUp: "due" })).toEqual([mine]);
    expect(
      (await taskRepo(WS).countWaitingTasks({ todayIso: TODAY })).followUpDue,
    ).toBe(1);
    expect((await waitingIds(WS, { followUp: "due" })).ids).toEqual([mine]);

    const scope = scopeFor();
    expect((await readWaiting(scope, TODAY, SYDNEY)).followUpDue).toBe(1);
    expect(
      (
        await readDigestFacts(scope, {
          now: new Date(`${TODAY}T23:00:00.000Z`),
          timeZone: SYDNEY,
          localDate: TODAY,
        })
      ).waiting.followUpDue,
    ).toBe(1);

    // And symmetrically: the hostile workspace sees only its own three.
    expect(
      (await taskRepo(HOSTILE).countWaitingTasks({ todayIso: TODAY }))
        .followUpDue,
    ).toBe(3);
    expect((await waitingIds(HOSTILE, { followUp: "due" })).ids).not.toContain(
      mine,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* E. The Waiting surface pages — the 150-row fixture                          */
/* -------------------------------------------------------------------------- */

/*
 * Time-boxed at the SUITE, the way `asset-history-scale.test.ts` and
 * `areas-route.test.ts` already time-box their seeded suites — because every
 * test in here runs `seed150()`, which is 150 Tasks created and then set to
 * waiting, one real D1 write at a time.
 *
 * Vitest's default is 5 s, and MEASURED locally these four take 1.50–1.63 s:
 * a margin of 3.1x. The kernel suite on CI runs about three times slower in
 * aggregate test time than it does here (996 s of test time against 323 s for
 * the same 3 251 tests), which puts them ON the 5 s line — and duly timed them
 * out on runs 33986004347 and, for the same reason, earlier. They are the four
 * slowest tests in this file, and they are the four that fail.
 *
 * Nothing here is weakened, because the 5 s was never part of the claim: every
 * assertion below is about which rows come back, in what order, and in how many
 * statements. A ceiling is not a budget — a passing test never spends it — and
 * a genuine hang still fails, 25 s later.
 */
describe("the Waiting collection pages past its old cap", () => {
  const SEEDED = 150;

  /**
   * 150 waiting Tasks, seeded on DISTINCT waiting instants so the documented
   * order (overdue first, then longest-waiting) is fully determined — and with
   * a run of them sharing one instant, so the `id` tiebreaker is genuinely
   * exercised rather than merely present.
   */
  async function seed150() {
    const area = await spineRepo(WS).createArea({ title: "Ops" });
    const clock = new FakeClock("2026-08-01T00:00:00.000Z");
    const tasks = makeTaskRepository(makeContext(WS), {
      clock: clock.now,
      idGenerator: nextEntityId,
      activityIdGenerator: nextActivityId,
    });
    const ids: string[] = [];
    for (let i = 0; i < SEEDED; i++) {
      const task = await tasks.createTask({
        title: `Waiting ${String(i).padStart(3, "0")}`,
        parent: { kind: "area", id: area.id },
      });
      // Every tenth Task carries a follow-up due today, so the filtered page
      // also crosses a page boundary rather than fitting in one.
      if (i % 10 === 0) {
        await tasks.updateTask(task.id, {
          delegation: {
            to: "Sam",
            delegatedOn: "2026-08-01",
            followUpOn: TODAY,
          },
        });
      }
      await tasks.setWaiting(task.id, {
        target: { kind: "text", note: `party ${i}` },
      });
      ids.push(task.id);
      // A block of ten shares one waiting instant; the rest advance.
      if (i < 40 || i >= 50) clock.advance(60_000);
    }
    return ids;
  }

  it("reaches row 101 and beyond, with no duplicate and no omission", async () => {
    const seeded = await seed150();
    const walked = await waitingIds(WS, { limit: 25 });

    // Six pages at 25 a page: the whole collection, past the old 100 cap.
    expect(walked.pages).toBe(6);
    expect(walked.ids).toHaveLength(SEEDED);
    expect(new Set(walked.ids).size).toBe(SEEDED);
    expect([...walked.ids].sort()).toEqual([...seeded].sort());
    // The specific claim DEBT-232 was raised for: row 101 exists and is reached.
    expect(walked.ids[100]).toBeDefined();
    expect(seeded).toContain(walked.ids[100]);
  });

  it("returns the same order however it is paged", async () => {
    await seed150();
    const inOnePage = await waitingIds(WS, { limit: 200 });
    const paged = await waitingIds(WS, { limit: 7 });
    // Determinism: page size cannot change WHICH rows come back or in what
    // order. A cursor tie-break that lost the `id` tiebreaker would repeat or
    // strand a row inside the block of ten that share one waiting instant, and
    // this equality is what catches it.
    expect(paged.ids).toEqual(inOnePage.ids);
  });

  it("pages the FILTERED collection too, and counts it in ONE statement", async () => {
    await seed150();
    const filtered = await waitingIds(WS, { limit: 5, followUp: "due" });
    expect(filtered.ids).toHaveLength(15);
    expect(new Set(filtered.ids).size).toBe(15);
    expect(filtered.pages).toBe(3);

    /*
     * The count is the fact Today and the digest state, and it must be the
     * WHOLE population rather than the loaded page — counting a bounded page in
     * JavaScript is exactly what made the old Waiting subtitle state a
     * truncated number as fact.
     */
    const counter = countedDb();
    const repo = createTaskRepository(counter.db, makeContext(WS), {});
    counter.reset();
    expect(
      (await repo.countWaitingTasks({ todayIso: TODAY })).followUpDue,
    ).toBe(15);
    expect(counter.statements()).toBe(1);
    // Two binds: the owner's day and the workspace. No per-Task read anywhere.
    expect(counter.binds()).toBe(2);
  });

  it("rejects a cursor issued under another scope", async () => {
    await seed150();
    const tasks = taskRepo(WS);
    const page = await tasks.listWaitingTasks({ limit: 10, todayIso: TODAY });
    expect(page.nextCursor).not.toBeNull();

    // A different follow-up filter is a different population…
    await expect(
      tasks.listWaitingTasks({
        limit: 10,
        todayIso: TODAY,
        followUp: "due",
        cursor: page.nextCursor!,
      }),
    ).rejects.toBeTruthy();
    // …a different owner-day is a different ORDER…
    await expect(
      tasks.listWaitingTasks({
        limit: 10,
        todayIso: TOMORROW,
        cursor: page.nextCursor!,
      }),
    ).rejects.toBeTruthy();
    // …and another workspace's is nobody else's.
    await ensureWorkspace(HOSTILE);
    await expect(
      taskRepo(HOSTILE).listWaitingTasks({
        limit: 10,
        todayIso: TODAY,
        cursor: page.nextCursor!,
      }),
    ).rejects.toBeTruthy();
    // A tampered cursor is rejected, never repaired.
    await expect(
      tasks.listWaitingTasks({
        limit: 10,
        todayIso: TODAY,
        cursor: "not-a-cursor",
      }),
    ).rejects.toBeTruthy();
  });
}, 30_000);

/* -------------------------------------------------------------------------- */
/* F. Export → restore, and the restored commitment is LIVE                    */
/* -------------------------------------------------------------------------- */

describe("a restored commitment becomes answerable again", () => {
  const APPLICATION = {
    name: "DalyHub",
    version: "2.0.0",
    releaseName: "Test",
    environment: "development",
    buildCommit: null,
  } as const;

  /**
   * Remove every record from a workspace, leaving the workspace row.
   *
   * The thing a backup exists for: the records are gone, the deployment is not.
   * `entities.id` is globally unique, so the source must genuinely be lost
   * before its ids can be written into the restore target — which is exactly
   * the situation the round trip is claiming to survive.
   */
  async function loseWorkspaceRecords(ws: string): Promise<void> {
    for (const table of [
      "activity_subjects",
      "activities",
      "entity_links",
      "spine_records",
      "task_details",
      "entity_tags",
      "workspace_tags",
      "entities",
    ]) {
      await env.DB.prepare(`DELETE FROM ${table} WHERE workspace_id = ?`)
        .bind(ws)
        .run();
    }
  }

  function exportSnapshot(ws: string): Promise<WorkspaceSnapshotV1> {
    return buildWorkspaceSnapshot(
      createWorkspaceSnapshotRepository(env.DB, makeContext(ws)),
      {
        ownerId: OWNER,
        exportedAt: new Date("2026-08-31T09:00:00.000Z"),
        application: APPLICATION,
      },
    );
  }

  it("round-trips the date AND finds it with the new filter", async () => {
    const area = await spineRepo(WS).createArea({ title: "Ops" });
    const task = await seedFollowUp(WS, area.id, "Chase the contract", TODAY);

    const snapshot = await exportSnapshot(WS);
    const stored = snapshot.records.taskDetails.find(
      (row) => row.entityId === task,
    );
    // The existing claim, kept true: the date survives the backup.
    expect(stored?.followUpOn).toBe(TODAY);

    const archive = (await buildStructuredExportArchive(snapshot)).bytes;
    let restoreIds = 0;
    // The workspace is lost. The archive is all that is left.
    await loseWorkspaceRecords(WS);
    await ensureWorkspace(RESTORE_TARGET);
    const context = makeContext(RESTORE_TARGET);
    const deps = {
      restore: createWorkspaceRestoreRepository(env.DB, context),
      snapshot: createWorkspaceSnapshotRepository(env.DB, context),
      workspaceId: RESTORE_TARGET,
      ownerId: OWNER,
      application: APPLICATION,
      now: () => new Date("2026-08-31T10:00:00.000Z"),
      newId: () => `recall03-restore-${++restoreIds}`,
    };
    const preview = await prepareRestore(deps, archive);
    const result = await applyRestore(deps, preview.operationId);
    expect(result.verification.passed).toBe(true);

    /*
     * The requirement the roadmap actually states: not "the date survived
     * backup" but "the restored commitment becomes LIVE again". So the new
     * dimension is run against the restored workspace, and it must find it.
     */
    expect(await filterIds(RESTORE_TARGET, { followUp: "due" })).toEqual([
      task,
    ]);
    expect(
      (await taskRepo(RESTORE_TARGET).countWaitingTasks({ todayIso: TODAY }))
        .followUpDue,
    ).toBe(1);
    const restoredWaiting = await waitingIds(RESTORE_TARGET, {
      followUp: "due",
    });
    expect(restoredWaiting.ids).toEqual([task]);
  });
});

/* -------------------------------------------------------------------------- */
/* G. Reopen                                                                   */
/* -------------------------------------------------------------------------- */

describe("reopening leaves the chase date alone", () => {
  it("does not couple followUpOn to completed_at", async () => {
    const area = await spineRepo(WS).createArea({ title: "Ops" });
    const id = await seedFollowUp(WS, area.id, "Chase the contract", YESTERDAY);
    const tasks = taskRepo(WS, "2026-08-31T02:00:00.000Z");

    await tasks.completeTask(id, { ownerTodayIso: TODAY });
    const completed = await tasks.getTask(id);
    /*
     * Completion does not touch the date either. It dates a CHASE, not a
     * finish, so the record keeps what the owner wrote — `follow_up_on` is
     * never derived from, cleared by, or otherwise coupled to `completed_at`.
     *
     * Waiting IS cleared by completion, and that is the EXISTING rule
     * (`completeTask` clears the waiting state and appends
     * `task.waiting_cleared`) rather than anything this item introduced — so a
     * completed Task leaves the waiting SURFACES while keeping its chase date.
     */
    expect(completed?.delegation?.followUpOn).toBe(YESTERDAY);
    expect(completed?.waiting).toBeNull();
    expect(
      (await taskRepo(WS).countWaitingTasks({ todayIso: TODAY })).followUpDue,
    ).toBe(0);

    await tasks.reopenTask(id);
    const reopened = await tasks.getTask(id);
    expect(reopened?.completedAt).toBeNull();
    // The chase date is UNTOUCHED by the reopen…
    expect(reopened?.delegation?.followUpOn).toBe(YESTERDAY);
    // …and it answers the filter exactly as its date says it should, with no
    // re-dating, no reset and no new state.
    expect(await filterIds(WS, { followUp: "overdue" })).toEqual([id]);
    expect(await filterIds(WS, { followUp: "due" })).toEqual([id]);
  });
});

/* -------------------------------------------------------------------------- */
/* H. Recurrence — the EXISTING inheritance rule, recorded                     */
/* -------------------------------------------------------------------------- */

describe("the recurrence successor follows the existing delegation rule", () => {
  /**
   * RECALL-03 invents no recurrence rule. It MEASURES the one already shipped
   * and pins it, so this item cannot change it by accident and a later one
   * cannot change it silently.
   *
   * The rule (`#buildSuccessorGroup`, documented in TASKS_MODULE.md): title,
   * description, parent, priority, Time Sector, commitment state, the rule and
   * the series identity carry over; completion, waiting, workflow status and
   * DELEGATION do not — they are the transient state of the occurrence that was
   * just finished. `follow_up_on` is part of the delegation group, so it is
   * reset with it.
   */
  it("does not carry the delegation, and therefore not the follow-up date", async () => {
    const area = await spineRepo(WS).createArea({ title: "Ops" });
    const tasks = taskRepo(WS, "2026-08-20T00:00:00.000Z");
    const task = await tasks.createTask({
      title: "Weekly supplier check-in",
      parent: { kind: "area", id: area.id },
    });
    await tasks.updateTask(task.id, {
      scheduledDate: "2026-08-24",
      delegation: {
        to: "Sam",
        delegatedOn: "2026-08-20",
        followUpOn: YESTERDAY,
      },
    });
    await tasks.setTaskRecurrence(task.id, {
      frequency: "week",
      dateKind: "scheduled",
    });

    const completed = await taskRepo(
      WS,
      "2026-08-31T02:00:00.000Z",
    ).completeTask(task.id, { ownerTodayIso: TODAY });
    const successor = completed.successor;
    expect(successor).not.toBeNull();

    // The recorded rule, asserted rather than assumed.
    expect(successor!.delegation).toBeNull();
    expect(successor!.delegation?.followUpOn ?? null).toBeNull();
    // The finished occurrence keeps its own chase date — its history is its own.
    const finished = await taskRepo(WS).getTask(task.id);
    expect(finished?.delegation?.followUpOn).toBe(YESTERDAY);

    // And the consequence at the query layer: the successor answers `none`,
    // the predecessor answers `overdue`.
    expect(await filterIds(WS, { followUp: "none" })).toEqual([successor!.id]);
    expect(await filterIds(WS, { followUp: "overdue" })).toEqual([task.id]);
  });
});

/* -------------------------------------------------------------------------- */
/* I. Round trips — a URL and a saved view                                     */
/* -------------------------------------------------------------------------- */

describe("the dimension round-trips like every other dimension", () => {
  it("survives the URL codec and returns the same records", async () => {
    const area = await spineRepo(WS).createArea({ title: "Ops" });
    const due = await seedFollowUp(WS, area.id, "Chase Sam", TODAY);
    await seedFollowUp(WS, area.id, "Later", TOMORROW);

    const config: TaskViewConfig = {
      ...DEFAULT_TASK_VIEW_CONFIG,
      systemView: "waiting",
      filters: { followUp: "due" },
    };
    const params = paramsFromConfig(config);
    expect(params.get("followUp")).toBe("due");
    const decoded = configFromParams(params);
    expect(decoded.filters.followUp).toBe("due");
    expect(
      await filterIds(WS, filtersForTasksHref(`/tasks?${params}`)),
    ).toEqual([due]);
  });

  it("survives a saved view, and the restored view answers identically", async () => {
    const area = await spineRepo(WS).createArea({ title: "Ops" });
    const due = await seedFollowUp(WS, area.id, "Chase Sam", TODAY);
    await seedFollowUp(WS, area.id, "Later", TOMORROW);

    const views = makeTaskViewRepository(makeContext(WS), {
      idGenerator: nextViewId,
    });
    const config: TaskViewConfig = {
      ...DEFAULT_TASK_VIEW_CONFIG,
      systemView: "waiting",
      filters: {
        followUp: "due",
        followUpFrom: "2026-08-01",
        followUpTo: TODAY,
      },
    };
    const saved = await views.create(OWNER, { name: "Chase today", config });
    const reloaded = await views.get(OWNER, saved.id);
    // Canonical serialisation, so the stored view and the live one compare as
    // one string rather than through a deep-equality helper.
    expect(serialiseTaskViewConfig(reloaded!.config)).toBe(
      serialiseTaskViewConfig(parseTaskViewConfig(config)),
    );
    expect(reloaded!.config.filters.followUp).toBe("due");
    expect(await filterIds(WS, toWorkspaceFilters(reloaded!.config))).toEqual([
      due,
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/* J. Cost                                                                     */
/* -------------------------------------------------------------------------- */

describe("the performance contract", () => {
  it("adds NO statement to the collection, and at most the budgeted binds", async () => {
    const area = await spineRepo(WS).createArea({ title: "Ops" });
    for (const [title, date] of [
      ["A", YESTERDAY],
      ["B", TODAY],
      ["C", TOMORROW],
    ] as const) {
      await seedFollowUp(WS, area.id, title, date);
    }

    const counter = countedDb();
    const repo = createTaskRepository(counter.db, makeContext(WS), {
      clock: new FakeClock(`${TODAY}T05:00:00.000Z`).now,
    });
    const read = async (
      filters: WorkspaceTaskFilters,
    ): Promise<{ statements: number; binds: number }> => {
      counter.reset();
      await repo.listWorkspaceTasks({
        view: "all",
        sort: "smart",
        filters,
        todayIso: TODAY,
        timezone: SYDNEY,
      });
      return { statements: counter.statements(), binds: counter.binds() };
    };

    const baseline = await read({});
    expect(baseline.statements).toBe(1);

    /*
     * The DERIVED state costs ZERO extra binds: `cal.today_iso` is already
     * CROSS JOINed once per query for the due and planned states, so the
     * owner's day is a joined column rather than a fifth placeholder. That is
     * the whole reason the predicate takes a `todayExpr` instead of always
     * binding.
     */
    const state = await read({ followUp: "due" });
    expect(state.statements).toBe(baseline.statements);
    expect(state.binds).toBe(baseline.binds);

    // The explicit window is exactly the TWO binds the roadmap budgets for a
    // bounded follow-up window — one per bound, and no second query.
    const windowed = await read({
      followUpFrom: "2026-08-01",
      followUpTo: TODAY,
    });
    expect(windowed.statements).toBe(baseline.statements);
    expect(windowed.binds).toBe(baseline.binds + 2);

    // Grouping applies the same scope, and stays one statement with it.
    counter.reset();
    await repo.listWorkspaceTaskGroups({
      dimension: "delegate",
      view: "all",
      filters: { followUp: "due" },
      todayIso: TODAY,
      timezone: SYDNEY,
    });
    expect(counter.statements()).toBe(1);
  });

  it("costs the shared facts layer exactly ONE additional bounded read", async () => {
    const area = await spineRepo(WS).createArea({ title: "Ops" });
    await seedFollowUp(WS, area.id, "Chase Sam", TODAY);

    const counter = countedDb();
    counter.reset();
    const facts = await readWaiting(scopeFor(counter.db), TODAY, SYDNEY);
    expect(facts.followUpDue).toBe(1);
    /*
     * TWO statements: the bounded waiting page (which the age of the oldest and
     * the count come from, unchanged) and the ONE aggregate this item added.
     * Today's own pinned budget moved 21 → 22 for exactly this read, recorded
     * in `today-review-door.test.ts`. A second follow-up read, or one per Task,
     * fails here.
     */
    expect(counter.statements()).toBe(2);
  });

  it("uses the existing workspace bounds rather than a new index", async () => {
    const area = await spineRepo(WS).createArea({ title: "Ops" });
    await seedFollowUp(WS, area.id, "Chase Sam", TODAY);

    /*
     * The measured INDEX decision (`PRODUCT_DEBT.md` DEBT-231).
     *
     * `task_details.follow_up_on` has no dedicated index, and this asserts why
     * none was added: every follow-up predicate rides a query already narrowed
     * by the workspace-scoped entity/detail keys, so the plan reaches
     * `task_details` by its primary key rather than by scanning it. A
     * `task_details(workspace_id, follow_up_on)` index would be a near-duplicate
     * of that access path, paying write amplification on every Task edit for no
     * measured read. If the plan ever degrades to a full scan of
     * `task_details`, this assertion is where it surfaces.
     */
    const plan = await env.DB.prepare(
      `EXPLAIN QUERY PLAN
       SELECT COUNT(*)
       FROM entities e
       JOIN spine_records sr
         ON sr.workspace_id = e.workspace_id AND sr.entity_id = e.id
       JOIN task_details td
         ON td.workspace_id = e.workspace_id AND td.entity_id = e.id
       CROSS JOIN (SELECT ? AS today_iso) cal
       WHERE e.workspace_id = ? AND e.type = 'task' AND e.deleted_at IS NULL
         AND sr.completed_at IS NULL AND td.waiting_since IS NOT NULL
         AND COALESCE(td.commitment_state, 'active') <> 'someday'
         AND (td.follow_up_on IS NOT NULL AND td.follow_up_on <= cal.today_iso)`,
    )
      .bind(TODAY, WS)
      .all<{ readonly detail: string }>();
    const details = (plan.results ?? []).map((row) => row.detail).join(" | ");
    /*
     * MEASURED plan (2026-08-31, real D1):
     *
     *   SEARCH e  USING INDEX entities_active_workspace_type_created_idx
     *             (workspace_id=? AND type=?)
     *   SEARCH td USING INDEX sqlite_autoindex_task_details_1
     *             (workspace_id=? AND entity_id=?)
     *   SEARCH sr USING INDEX sqlite_autoindex_spine_records_1
     *             (workspace_id=? AND entity_id=?)
     *
     * The workspace+type index narrows the candidate set and `task_details` is
     * reached by its composite PRIMARY KEY — the follow-up comparison is a
     * predicate on an already-fetched row, not a lookup of its own. A
     * `task_details(workspace_id, follow_up_on)` index would therefore buy no
     * measured read while paying write amplification on every Task edit, so
     * none was added. If this ever degrades to a SCAN of `task_details`, that
     * decision is due for re-measurement and this assertion is where it shows.
     */
    expect(details).toMatch(
      /SEARCH td USING INDEX sqlite_autoindex_task_details_1/i,
    );
    expect(details).toMatch(/SEARCH e USING INDEX entities_/i);
    expect(details).not.toMatch(/SCAN td\b/i);
  });
});
