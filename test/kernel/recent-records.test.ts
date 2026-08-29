/**
 * FIND-01 — the recency rule against REAL D1.
 *
 * `test/unit/search/recent-records.test.ts` proves the RULE over synthetic rows.
 * This file proves the half only a database can prove: that the Activity the
 * product's own canonical paths actually write, read back through the
 * repository, produces the list the surface shows — and that the things which
 * must NOT reach it do not.
 *
 * Every record here is created through the CANONICAL repositories
 * (`createArea`, `createProject`, `createTask`, `notes.create`, `diary.create`,
 * `people.create`), never by hand-writing an `activities` row. If a future
 * change alters what those paths record, this file fails, which is exactly what
 * it is for — a recency source asserted against hand-written Activity would pass
 * for the wrong reason forever.
 *
 * Query counting uses the shared `countingDb`, following REVIEW-03's, FOLLOW-01's
 * and STEER-03's precedent: one prepared statement is one unit, because what
 * costs a round trip is running a statement.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { createActivityActorContext } from "~/kernel/activity";
import {
  RECENCY_EXCLUDED_TYPES,
  RECENCY_LISTABLE_TYPES,
  RECENT_ACTIVITY_SCAN_LIMIT,
  RECENT_RECORD_LIMIT,
} from "~/kernel/recent-records";
import { recentRecordsOutcome } from "~/shared/search/recent-outcome";
import { entityDestination } from "~/shared/entity/destination";
import { ENTITY_TYPES } from "~/shared/entity/identity";
import { createRecentRecordsRepository } from "~/platform/storage/d1";
import { bindWorkspaceRepositories } from "~/platform/workspaces";
import type { WorkspaceScope } from "~/platform/workspaces";

import {
  countingDb,
  ensureWorkspace,
  makeContext,
  resetTables,
} from "./support";

const WS = "test-recency-workspace";
const OTHER = "test-recency-other";

function scopeFor(workspaceId = WS, db: D1Database = env.DB): WorkspaceScope {
  return bindWorkspaceRepositories(
    { DB: db },
    makeContext(workspaceId),
    createActivityActorContext({ type: "user", id: "owner-1" }),
  );
}

function recencyFor(workspaceId = WS, db: D1Database = env.DB) {
  return createRecentRecordsRepository(db, makeContext(workspaceId));
}

/** Titles in list order — what the owner actually sees, top to bottom. */
async function titles(workspaceId = WS, db: D1Database = env.DB) {
  const rows = await recencyFor(workspaceId, db).listRecentlyWorkedOn();
  return rows.map((row) => row.title);
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
  await ensureWorkspace(WS);
  await ensureWorkspace(OTHER);
});

describe("FIND-01 — an empty query has something true to answer with", () => {
  it("lists records the owner worked on, newest first", async () => {
    const s = scopeFor();
    // Created in this order, so Activity lands in this order.
    const area = await s.spine.createArea({ title: "Health" });
    const project = await s.spine.createProject({
      title: "Half marathon plan",
      parent: { kind: "area", id: area.id },
    });
    await s.spine.createTask({
      title: "Monday: 5km easy",
      parent: { kind: "project", id: project.id },
    });

    const list = await titles();

    // Newest first: the Task was created last, the Area first.
    expect(list[0]).toBe("Monday: 5km easy");
    expect(list).toContain("Half marathon plan");
    expect(list).toContain("Health");
  });

  it("re-orders a record to the top when it is worked on again", async () => {
    const s = scopeFor();
    const area = await s.spine.createArea({ title: "Career" });
    await s.spine.createProject({
      title: "Ship V2.6",
      parent: { kind: "area", id: area.id },
    });
    expect((await titles())[0]).toBe("Ship V2.6");

    // Touch the OLDER record through a canonical mutation.
    await s.spine.rename(area.id, "Career and craft");

    const list = await titles();
    expect(list[0]).toBe("Career and craft");
    expect(list[1]).toBe("Ship V2.6");
  });

  it("is a DATE and not a frequency — many old touches never outrank one new one", async () => {
    const s = scopeFor();
    const busy = await s.spine.createArea({ title: "Touched constantly" });
    // Twelve mutations on one record.
    for (let n = 0; n < 12; n += 1) {
      await s.spine.rename(busy.id, `Touched constantly ${n}`);
    }
    // ONE mutation on another, afterwards.
    await s.spine.createArea({ title: "Touched once" });

    const list = await titles();

    /*
     * This is the assertion that would fail if `MAX(occurred_at)` ever became
     * `COUNT(*)`, or if a count crept into the ORDER BY as a tie-break. The busy
     * record has thirteen events to the quiet one's one, and it must still lose:
     * recency is a date, and ADR-112 decision 5 forbids frequency weighting
     * anywhere in retrieval.
     */
    expect(list[0]).toBe("Touched once");
    expect(list[1]).toBe("Touched constantly 11");
  });

  it("orders a real tie by what the owner just made, and repeats it exactly", async () => {
    const s = scopeFor();
    const area = await s.spine.createArea({ title: "Home" });
    /*
     * One owner action that touches TWO records inside one transaction. ADR-012
     * makes Activity atomic with the mutation, so both events carry the same
     * ISO millisecond — a real tie, and the COMMON one, not a contrived case.
     */
    await s.spine.createProject({
      title: "Kitchen",
      parent: { kind: "area", id: area.id },
    });

    const first = await titles();
    /*
     * The Project the owner just created leads its Area. This assertion was
     * FALSE under the first version of the rule, which broke ties on the
     * entity id alone: the winner was then whichever random id sorted higher,
     * so this test failed about half the time. That flakiness is what found the
     * defect, and the `createdAt` tie-break is what fixed it.
     */
    expect(first[0]).toBe("Kitchen");
    expect(first[1]).toBe("Home");

    // And it is stable: the same workspace renders the same list every time.
    expect(await titles()).toEqual(first);
    expect(await titles()).toEqual(first);
  });

  it("never lists another workspace's records", async () => {
    const mine = scopeFor(WS);
    const theirs = scopeFor(OTHER);
    await mine.spine.createArea({ title: "Mine only" });
    await theirs.spine.createArea({ title: "Theirs only" });

    expect(await titles(WS)).toEqual(["Mine only"]);
    expect(await titles(OTHER)).toEqual(["Theirs only"]);
  });

  it("bounds the list, however much history the workspace has", async () => {
    const s = scopeFor();
    const area = await s.spine.createArea({ title: "Bulk" });
    for (let n = 0; n < RECENT_RECORD_LIMIT + 6; n += 1) {
      await s.spine.createProject({
        title: `Project ${String(n).padStart(2, "0")}`,
        parent: { kind: "area", id: area.id },
      });
    }

    const rows = await recencyFor().listRecentlyWorkedOn();
    expect(rows).toHaveLength(RECENT_RECORD_LIMIT);
  });

  it("honours an explicit smaller limit", async () => {
    const s = scopeFor();
    const area = await s.spine.createArea({ title: "Area" });
    await s.spine.createProject({
      title: "One",
      parent: { kind: "area", id: area.id },
    });
    await s.spine.createProject({
      title: "Two",
      parent: { kind: "area", id: area.id },
    });

    const rows = await recencyFor().listRecentlyWorkedOn({ limit: 2 });
    expect(rows).toHaveLength(2);
  });

  it("returns nothing at all for a workspace with no history", async () => {
    expect(await recencyFor().listRecentlyWorkedOn()).toEqual([]);
  });

  it("omits a soft-deleted record even though its history survives", async () => {
    const s = scopeFor();
    const area = await s.spine.createArea({ title: "Keep" });
    const doomed = await s.spine.createProject({
      title: "Delete me",
      parent: { kind: "area", id: area.id },
    });
    // The Project leads: it ties with its Area (one transaction touches both)
    // and is the more recently created of the two.
    expect((await titles())[0]).toBe("Delete me");

    await s.spine.softDelete(doomed.id);

    /*
     * `activity_subjects` deliberately outlives soft-delete (migration 0004), so
     * without the `deleted_at IS NULL` filter the deletion itself — the newest
     * event of all — would put the deleted record at the TOP of the list.
     */
    const list = await titles();
    expect(list).not.toContain("Delete me");
    expect(list).toContain("Keep");
  });

  it("lists a Habit, and does not let unopenable types eat the limit", async () => {
    const s = scopeFor();
    const area = await s.spine.createArea({ title: "An openable Area" });
    expect(area.id).toBeTruthy();
    // More Habits than the limit, all NEWER than the Area.
    for (let n = 0; n < RECENT_RECORD_LIMIT + 2; n += 1) {
      await s.habits.create({
        title: `Habit ${String(n).padStart(2, "0")}`,
        schedule: { kind: "daily" },
      });
    }

    const rows = await recencyFor().listRecentlyWorkedOn();
    const outcome = recentRecordsOutcome(rows);

    /*
     * REGRESSION — the defect this test exists for, found in review on the
     * first version of this item and reproduced before it was fixed.
     *
     * `habit` had no entry in the shared destination map, so every one of these
     * rows came back from SQL, filled the eight-row limit, and was then dropped
     * by `recentRecordsOutcome` for having nowhere to open. The rendered result
     * was ZERO — the calm empty state, shown to an owner whose workspace was
     * full of history, with the openable Area sitting just behind the limit and
     * never reached.
     *
     * Two things now prevent it: `habit` HAS a destination (its record page has
     * existed since HABITS-01), and the query selects only listable types, so
     * the limit cannot be spent on rows the surface will discard.
     */
    expect(rows).toHaveLength(RECENT_RECORD_LIMIT);
    expect(outcome.totalCount).toBe(RECENT_RECORD_LIMIT);
    expect(outcome.groups).toHaveLength(1);

    // Every row is openable — nothing is dropped between SQL and the surface.
    expect(outcome.groups[0].results).toHaveLength(rows.length);
    const habitRow = outcome.groups[0].results.find(
      (r) => r.entityType === "habit",
    );
    expect(habitRow?.target).toEqual({
      kind: "route",
      to: `/habits/${rows.find((r) => r.type === "habit")?.id}`,
    });
  });

  it("never selects a type the surface cannot open, so the LIMIT stays honest", async () => {
    const s = scopeFor();
    const area = await s.spine.createArea({ title: "Openable, and older" });

    /*
     * The structural guarantee, proven behaviourally.
     *
     * Every entity type the product registers today HAS a record destination —
     * `habit` was the last gap and this item closed it — so the allow-list and
     * a deny-list are currently indistinguishable by behaviour alone. That is
     * precisely why this test writes a type the product does not have: it is
     * the only way to prove the query filters by what is RENDERABLE rather than
     * by a hard-coded list of today's exclusions.
     *
     * `entities.type` is free-form TEXT validated by the kernel rather than by
     * the database (migration 0001), so a future entity type with no record
     * page would look exactly like this. Without the allow-list these rows are
     * selected, spend the limit, and are dropped afterwards — leaving the owner
     * an empty list with the Area below sitting unreached.
     */
    const now = new Date().toISOString();
    for (let n = 0; n < RECENT_RECORD_LIMIT + 2; n += 1) {
      const id = `routeless-${n}`;
      const activityId = `routeless-activity-${n}`;
      await env.DB.prepare(
        `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
         VALUES (?, ?, 'not_a_real_record_type', ?, ?, ?, NULL)`,
      )
        .bind(id, WS, `Routeless ${n}`, now, now)
        .run();
      await env.DB.prepare(
        `INSERT INTO activities (id, workspace_id, type, actor_type, actor_id, occurred_at, payload_json)
         VALUES (?, ?, 'entity.created', 'user', 'owner-1', ?, '{}')`,
      )
        .bind(activityId, WS, now)
        .run();
      await env.DB.prepare(
        `INSERT INTO activity_subjects (workspace_id, activity_id, entity_id, role)
         VALUES (?, ?, ?, 'primary')`,
      )
        .bind(WS, activityId, id)
        .run();
    }

    const rows = await recencyFor().listRecentlyWorkedOn();

    // Not one routeless row was fetched...
    expect(rows.some((row) => row.title.startsWith("Routeless"))).toBe(false);
    // ...so the Area behind them is reached, and every row survives to render.
    expect(rows.map((row) => row.title)).toContain("Openable, and older");
    expect(recentRecordsOutcome(rows).totalCount).toBe(rows.length);
    expect(area.id).toBeTruthy();
  });

  it("classifies every registered entity type as listable or excluded", () => {
    /*
     * The guard that makes the above impossible to reintroduce by accident. A
     * new entity type must either gain a record destination (becoming listable)
     * or be excluded on purpose. One that is neither — the shape of the Habit
     * defect — fails here, at the rule, rather than as an empty Search panel.
     */
    for (const type of ENTITY_TYPES) {
      const classified =
        RECENCY_LISTABLE_TYPES.includes(type) ||
        RECENCY_EXCLUDED_TYPES.has(type);
      expect(classified, `${type} is neither listable nor excluded`).toBe(true);
    }
    // And nothing listable is unopenable — the other direction of the same rule.
    for (const type of RECENCY_LISTABLE_TYPES) {
      expect(
        entityDestination(type, "some-id"),
        `${type} is listable but has no destination`,
      ).not.toBeNull();
    }
  });

  it("reaches PAST an excluded type to fill the list", async () => {
    const s = scopeFor();
    const area = await s.spine.createArea({ title: "Older but openable" });
    expect(area.id).toBeTruthy();
    // Diary entries are excluded AND newer. They must not consume the limit
    // either — the same class of bug as the Habit case above, on the other
    // half of the rule.
    for (let n = 0; n < RECENT_RECORD_LIMIT + 2; n += 1) {
      await s.diary.create({
        entryType: "reflection",
        title: `Private ${n}`,
      });
    }

    const list = await titles();
    expect(list).toContain("Older but openable");
    expect(list.some((title) => title.startsWith("Private"))).toBe(false);
  });

  it("never lists a Diary entry, in a workspace that has one", async () => {
    const s = scopeFor();
    await s.spine.createArea({ title: "An ordinary Area" });
    await s.diary.create({
      entryType: "reflection",
      title: "A private thing I wrote down",
    });

    const list = await titles();

    /*
     * Criterion 4, proven against a workspace that CONTAINS the excluded
     * category rather than one that happens not to. The Diary entry is the most
     * recent record in this workspace, so it would be first if it were listable.
     */
    expect(list).not.toContain("A private thing I wrote down");
    expect(list).toContain("An ordinary Area");
  });

  it("lists People, with no subtitle or body anywhere in the payload", async () => {
    const s = scopeFor();
    await s.people.create({ title: "Vaughn Reed", email: "v@example.com" });

    const rows = await recencyFor().listRecentlyWorkedOn();
    const person = rows.find((row) => row.title === "Vaughn Reed");
    expect(person).toBeDefined();
    // The privacy property is STRUCTURAL: a recent record has no field that
    // could carry a record's contents, whatever its type.
    expect(Object.keys(person ?? {}).sort()).toEqual([
      "createdAt",
      "id",
      "lastWorkedAt",
      "title",
      "type",
    ]);
  });
});

describe("FIND-01 — the query budget", () => {
  it("costs exactly ONE statement", async () => {
    const s = scopeFor();
    const area = await s.spine.createArea({ title: "Area" });
    await s.spine.createProject({
      title: "Project",
      parent: { kind: "area", id: area.id },
    });

    const counting = countingDb(env.DB);
    counting.reset();
    await recencyFor(WS, counting.db).listRecentlyWorkedOn();

    expect(counting.prepareCount()).toBe(1);
  });

  it("costs the SAME one statement in a workspace ten times the size", async () => {
    const s = scopeFor();
    const area = await s.spine.createArea({ title: "Area" });
    for (let n = 0; n < 30; n += 1) {
      await s.spine.createProject({
        title: `Project ${n}`,
        parent: { kind: "area", id: area.id },
      });
    }

    const counting = countingDb(env.DB);
    counting.reset();
    await recencyFor(WS, counting.db).listRecentlyWorkedOn();

    // Flat: not one statement per record, and not one per type.
    expect(counting.prepareCount()).toBe(1);
  });

  it("looks back over a BOUNDED slice of history, not all of it", async () => {
    const s = scopeFor();
    const area = await s.spine.createArea({ title: "The oldest record" });

    /*
     * Push the Area's only event beyond the scan horizon with a scan limit small
     * enough to reach in a test. This pins the horizon as a DELIBERATE property:
     * it is what makes the read flat in workspace size rather than merely flat
     * in statement count, and a future change that silently removed the
     * `LIMIT` — making the query scan every event the workspace ever recorded —
     * would fail here.
     */
    const recent = await s.spine.createProject({
      title: "Newer",
      parent: { kind: "area", id: area.id },
    });
    for (let n = 0; n < 6; n += 1) {
      await s.spine.rename(recent.id, `Newer ${n}`);
    }

    const narrow = await recencyFor().listRecentlyWorkedOn({ scanLimit: 2 });
    expect(narrow.map((row) => row.title)).toEqual(["Newer 5"]);

    // At the real horizon the same workspace shows everything it has.
    const full = await recencyFor().listRecentlyWorkedOn();
    expect(full.map((row) => row.title)).toContain("The oldest record");
    expect(RECENT_ACTIVITY_SCAN_LIMIT).toBeGreaterThan(2);
  });
});
