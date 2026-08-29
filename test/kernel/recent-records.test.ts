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
  RECENT_ACTIVITY_SCAN_LIMIT,
  RECENT_RECORD_LIMIT,
} from "~/kernel/recent-records";
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
