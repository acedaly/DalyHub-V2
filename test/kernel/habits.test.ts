/**
 * HABITS-01 — Habits kernel / D1 integration tests (real Workers runtime,
 * isolated D1, committed migrations applied).
 *
 * These prove the guarantees the product actually rests on, against the real
 * database rather than a stand-in:
 *
 *   - a Habit is created ATOMICALLY with its detail row, its FIRST schedule
 *     version and one `habit.created` event, and the generic entity repository
 *     refuses to create one;
 *   - a Habit generates NO Task, ever;
 *   - workspace isolation is absolute;
 *   - a check-in counts at most once for one owner-local calendar date, even
 *     when two writes race — enforced by the PRIMARY KEY, not by the UI;
 *   - an ARCHIVED Habit cannot acquire a completion;
 *   - a FUTURE date is refused;
 *   - changing a schedule opens a new version and leaves every earlier day with
 *     the schedule it actually had;
 *   - the owner's TIMEZONE decides which calendar day a check-in lands on, and a
 *     DST transition cannot move it;
 *   - reads are bounded: a page of habits costs the same number of statements as
 *     one habit.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { ReservedEntityTypeError } from "~/kernel/entities";
import {
  HABIT_ARCHIVED,
  HABIT_CREATED,
  HABIT_ENTITY_TYPE,
  HABIT_RESTORED,
  HABIT_SCHEDULE_CHANGED,
  HABIT_UPDATED,
  HabitArchivedError,
  HabitNotFoundError,
  HabitValidationError,
  InvalidHabitCursorError,
  evaluateHabitWeek,
  scheduleVersionForDate,
} from "~/kernel/habits";

import { createHabitRepository } from "~/platform/storage/d1";

import { env } from "cloudflare:test";

import {
  countActivitiesOfType,
  countHabitCompletionRows,
  countingDb,
  ensureWorkspace,
  makeContext,
  makeHabitRepository,
  makeRepository,
  makeSpineRepository,
  resetTables,
} from "./support";

const WS = "ws-habits";
const OTHER = "ws-habits-other";

/** A fixed instant whose Sydney calendar date is 2026-08-19 (a Wednesday). */
const AT = new Date("2026-08-19T02:00:00.000Z");

function repo(
  workspace = WS,
  options: Parameters<typeof makeHabitRepository>[1] = {},
) {
  return makeHabitRepository(makeContext(workspace), {
    clock: () => AT,
    ownerTimeZone: async () => "UTC",
    ...options,
  });
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

/* -------------------------------------------------------------------------- */
/* Create                                                                     */
/* -------------------------------------------------------------------------- */

describe("creating a Habit", () => {
  it("writes the entity, its detail slice, its first schedule version and one event", async () => {
    const habits = repo();
    const habit = await habits.create({
      title: "Strength training",
      notes: "Three sessions, any days.",
      schedule: { kind: "weekly_count", timesPerWeek: 3 },
    });

    expect(habit.title).toBe("Strength training");
    expect(habit.notes).toBe("Three sessions, any days.");
    expect(habit.schedule).toEqual({ kind: "weekly_count", timesPerWeek: 3 });
    expect(habit.versions).toHaveLength(1);
    // The first version begins on the OWNER's calendar day, never the runtime's.
    expect(habit.versions[0]!.effectiveFrom).toBe("2026-08-19");
    expect(habit.versions[0]!.effectiveTo).toBeNull();
    expect(await countActivitiesOfType(HABIT_CREATED)).toBe(1);

    const row = await env.DB.prepare("SELECT type FROM entities WHERE id = ?")
      .bind(habit.id)
      .first<{ type: string }>();
    expect(row?.type).toBe(HABIT_ENTITY_TYPE);
  });

  it("generates NO Task — a Habit is a behaviour, not an obligation", async () => {
    const habits = repo();
    await habits.create({
      title: "Read",
      schedule: { kind: "daily" },
    });
    await habits.checkIn((await habits.list()).items[0]!.id, "2026-08-19");
    const tasks = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM entities WHERE type = 'task'",
    ).first<{ n: number }>();
    expect(tasks?.n ?? 0).toBe(0);
    const details = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM task_details",
    ).first<{ n: number }>();
    expect(details?.n ?? 0).toBe(0);
  });

  it("is REFUSED by the generic entity repository", async () => {
    // A Habit can never exist without a cadence, so only the Habit repository
    // may create one — the same reservation People and Diary carry.
    await expect(
      makeRepository(makeContext(WS)).create({
        type: HABIT_ENTITY_TYPE,
        title: "Sneaky",
      }),
    ).rejects.toBeInstanceOf(ReservedEntityTypeError);
  });

  it("writes NOTHING when the schedule is invalid", async () => {
    const before = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM entities",
    ).first<{ n: number }>();
    await expect(
      repo().create({
        title: "Nope",
        schedule: { kind: "monthly" } as never,
      }),
    ).rejects.toBeInstanceOf(HabitValidationError);
    const after = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM entities",
    ).first<{ n: number }>();
    expect(after?.n).toBe(before?.n);
  });

  it("rolls the WHOLE create back when a later statement fails", async () => {
    const faulty = repo(WS, { createFault: "after-details" });
    await expect(
      faulty.create({ title: "Doomed", schedule: { kind: "daily" } }),
    ).rejects.toBeTruthy();
    const rows = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM entities WHERE workspace_id = ?",
    )
      .bind(WS)
      .first<{ n: number }>();
    expect(rows?.n ?? 0).toBe(0);
    expect(await countActivitiesOfType(HABIT_CREATED)).toBe(0);
  });

  it("links a Goal and an Area in the SAME transaction", async () => {
    const spine = makeSpineRepository(makeContext(WS));
    const area = await spine.createArea({ title: "Health" });
    const goal = await spine.createGoal({
      title: "Reach 70 kg",
      areaId: area.id,
    });
    const habit = await repo().create({
      title: "Strength training",
      schedule: { kind: "weekly_count", timesPerWeek: 3 },
      areaId: area.id,
      goalId: goal.id,
    });
    expect(habit.area?.title).toBe("Health");
    expect(habit.goal?.title).toBe("Reach 70 kg");
  });

  it("creates the Habit WITHOUT a relationship when the target does not exist", async () => {
    // Naming a Goal that is not there must not cost the owner the Habit.
    const habit = await repo().create({
      title: "Read",
      schedule: { kind: "daily" },
      goalId: "missing-goal",
    });
    expect(habit.goal).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Isolation                                                                  */
/* -------------------------------------------------------------------------- */

describe("workspace isolation", () => {
  it("never reads, lists or mutates another workspace's Habit", async () => {
    const mine = await repo(WS).create({
      title: "Mine",
      schedule: { kind: "daily" },
    });
    const theirs = repo(OTHER);
    expect(await theirs.get(mine.id)).toBeNull();
    expect((await theirs.list()).items).toEqual([]);
    await expect(theirs.archive(mine.id)).rejects.toBeInstanceOf(
      HabitNotFoundError,
    );
    await expect(theirs.checkIn(mine.id, "2026-08-19")).rejects.toBeInstanceOf(
      HabitNotFoundError,
    );
    // The completion table stays empty for the other workspace, and the
    // original Habit is untouched.
    expect(await countHabitCompletionRows()).toBe(0);
  });

  it("refuses a cursor issued for a different scope", async () => {
    await repo().create({ title: "A", schedule: { kind: "daily" } });
    await repo().create({ title: "B", schedule: { kind: "daily" } });
    const page = await repo().list({ limit: 1 });
    expect(page.nextCursor).not.toBeNull();
    await expect(
      repo().list({ limit: 1, status: "archived", cursor: page.nextCursor! }),
    ).rejects.toBeInstanceOf(InvalidHabitCursorError);
  });
});

/* -------------------------------------------------------------------------- */
/* Check-ins                                                                  */
/* -------------------------------------------------------------------------- */

describe("check-ins", () => {
  it("records one completion, and a second call for the same day is a no-op", async () => {
    const habits = repo();
    const habit = await habits.create({
      title: "Read",
      schedule: { kind: "daily" },
    });
    const first = await habits.checkIn(habit.id, "2026-08-19");
    expect(first).toMatchObject({ outcome: "recorded", changed: true });
    const second = await habits.checkIn(habit.id, "2026-08-19");
    expect(second).toMatchObject({
      outcome: "already_recorded",
      changed: false,
    });
    expect(await countHabitCompletionRows()).toBe(1);
  });

  it("produces ONE completion when two check-ins race", async () => {
    /*
     * The invariant the primary key exists for. Both writes are issued without
     * awaiting the first, which is what a double tap on a phone actually does.
     * The database arbitrates; application code never has to.
     */
    const habits = repo();
    const habit = await habits.create({
      title: "Meditate",
      schedule: { kind: "daily" },
    });
    const [a, b] = await Promise.all([
      habits.checkIn(habit.id, "2026-08-19"),
      habits.checkIn(habit.id, "2026-08-19"),
    ]);
    expect(await countHabitCompletionRows()).toBe(1);
    expect([a.changed, b.changed].filter(Boolean)).toHaveLength(1);
  });

  it("removes exactly the day it was asked to remove", async () => {
    const habits = repo();
    const habit = await habits.create({
      title: "Read",
      schedule: { kind: "daily" },
    });
    await habits.checkIn(habit.id, "2026-08-17");
    await habits.checkIn(habit.id, "2026-08-18");
    await habits.checkIn(habit.id, "2026-08-19");

    const removed = await habits.undoCheckIn(habit.id, "2026-08-18");
    expect(removed).toMatchObject({ outcome: "removed", changed: true });
    const remaining = await habits.listCompletionsInRange({
      habitIds: [habit.id],
      fromIso: "2026-08-01",
      toIso: "2026-08-19",
    });
    expect(remaining.map((row) => row.completedOn)).toEqual([
      "2026-08-17",
      "2026-08-19",
    ]);
    // Undoing a day that holds nothing is an honest no-op, not an error.
    expect(await habits.undoCheckIn(habit.id, "2026-08-18")).toMatchObject({
      outcome: "already_absent",
      changed: false,
    });
  });

  it("REFUSES a future date", async () => {
    const habits = repo();
    const habit = await habits.create({
      title: "Read",
      schedule: { kind: "daily" },
    });
    await expect(habits.checkIn(habit.id, "2026-08-20")).rejects.toBeInstanceOf(
      HabitValidationError,
    );
    expect(await countHabitCompletionRows()).toBe(0);
  });

  it("REFUSES a check-in against an archived Habit", async () => {
    const habits = repo();
    const habit = await habits.create({
      title: "Cold shower",
      schedule: { kind: "daily" },
    });
    await habits.checkIn(habit.id, "2026-08-18");
    await habits.archive(habit.id);

    await expect(habits.checkIn(habit.id, "2026-08-19")).rejects.toBeInstanceOf(
      HabitArchivedError,
    );
    // Archiving keeps the history it earned; it does not delete it.
    expect(await countHabitCompletionRows()).toBe(1);
  });

  it("records NO Activity for a check-in", async () => {
    /*
     * ADR-102 §7. A daily Habit would put hundreds of one-bit rows a year into
     * the one shared stream. The Habit's own history is `habit_completions`.
     */
    const habits = repo();
    const habit = await habits.create({
      title: "Read",
      schedule: { kind: "daily" },
    });
    const before = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM activities",
    ).first<{ n: number }>();
    await habits.checkIn(habit.id, "2026-08-19");
    await habits.undoCheckIn(habit.id, "2026-08-19");
    const after = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM activities",
    ).first<{ n: number }>();
    expect(after?.n).toBe(before?.n);
  });
});

/* -------------------------------------------------------------------------- */
/* The owner's calendar                                                       */
/* -------------------------------------------------------------------------- */

describe("the owner's calendar decides the day", () => {
  it("resolves the check-in date in the OWNER's timezone, not the runtime's", async () => {
    /*
     * 2026-08-19T02:00Z is still 2026-08-18 in Los Angeles and already
     * 2026-08-19 in Sydney. The default date a check-in takes is the owner's,
     * which is exactly the AUDIT-14 defect this repository is wired to avoid.
     */
    const sydney = repo(WS, { ownerTimeZone: async () => "Australia/Sydney" });
    const habit = await sydney.create({
      title: "Read",
      schedule: { kind: "daily" },
    });
    expect(habit.versions[0]!.effectiveFrom).toBe("2026-08-19");

    const la = makeHabitRepository(makeContext(OTHER), {
      clock: () => AT,
      ownerTimeZone: async () => "America/Los_Angeles",
    });
    const other = await la.create({
      title: "Read",
      schedule: { kind: "daily" },
    });
    expect(other.versions[0]!.effectiveFrom).toBe("2026-08-18");
  });

  it("refuses tomorrow in the OWNER's calendar, not the runtime's", async () => {
    const la = makeHabitRepository(makeContext(WS), {
      clock: () => AT,
      ownerTimeZone: async () => "America/Los_Angeles",
    });
    const habit = await la.create({
      title: "Read",
      schedule: { kind: "daily" },
    });
    // 2026-08-19 is TOMORROW for this owner, even though it is today in UTC.
    await expect(la.checkIn(habit.id, "2026-08-19")).rejects.toBeInstanceOf(
      HabitValidationError,
    );
    await expect(la.checkIn(habit.id, "2026-08-18")).resolves.toMatchObject({
      changed: true,
    });
  });

  it("keeps a completion on its own day across a DST transition", async () => {
    /*
     * Australia's 2026 spring-forward is 2026-10-04. A completion recorded on
     * the 3rd and one on the 4th are two different calendar dates and stay two
     * different calendar dates: the date is STORED, never re-derived from an
     * instant, so there is nothing for a shifting offset to move.
     */
    const clock = { at: new Date("2026-09-20T01:00:00.000Z") };
    const habits = makeHabitRepository(makeContext(WS), {
      clock: () => clock.at,
      ownerTimeZone: async () => "Australia/Sydney",
    });
    const habit = await habits.create({
      title: "Walk",
      schedule: { kind: "daily" },
    });
    // Move the owner's clock past the transition, then record the two days
    // either side of it.
    clock.at = new Date("2026-10-05T01:00:00.000Z");
    await habits.checkIn(habit.id, "2026-10-03");
    await habits.checkIn(habit.id, "2026-10-04");
    const rows = await habits.listCompletionsInRange({
      habitIds: [habit.id],
      fromIso: "2026-10-01",
      toIso: "2026-10-05",
    });
    expect(rows.map((row) => row.completedOn)).toEqual([
      "2026-10-03",
      "2026-10-04",
    ]);
    // And the week they fall in is seven wall-calendar days, not 7×24 hours.
    const reading = evaluateHabitWeek(
      {
        versions: habit.versions,
        completedDates: new Set(rows.map((row) => row.completedOn)),
        archivedOnIso: null,
      },
      { todayIso: "2026-10-05", firstDayOfWeek: "monday" },
      "2026-09-28",
    );
    expect(reading.startIso).toBe("2026-09-28");
    expect(reading.endIso).toBe("2026-10-04");
    expect(reading.completed).toBe(2);
  });
});

/* -------------------------------------------------------------------------- */
/* Schedule versioning                                                        */
/* -------------------------------------------------------------------------- */

describe("changing a schedule", () => {
  it("closes the current version at yesterday and opens a new one TODAY", async () => {
    const clock = { at: new Date("2026-08-01T00:00:00.000Z") };
    const habits = makeHabitRepository(makeContext(WS), {
      clock: () => clock.at,
      ownerTimeZone: async () => "UTC",
    });
    const habit = await habits.create({
      title: "Strength training",
      schedule: { kind: "weekdays", weekdays: [1, 3, 5] },
    });

    clock.at = new Date("2026-08-19T00:00:00.000Z");
    const result = await habits.changeSchedule(habit.id, {
      kind: "weekdays",
      weekdays: [2, 4],
    });
    expect(result.outcome).toBe("versioned");

    const versions = result.habit.versions;
    expect(versions).toHaveLength(2);
    expect(versions[0]).toMatchObject({
      effectiveFrom: "2026-08-01",
      effectiveTo: "2026-08-18",
    });
    expect(versions[1]).toMatchObject({
      effectiveFrom: "2026-08-19",
      effectiveTo: null,
    });

    // THE INVARIANT: an earlier day still resolves to the schedule it had.
    expect(scheduleVersionForDate(versions, "2026-08-10")?.schedule).toEqual({
      kind: "weekdays",
      weekdays: [1, 3, 5],
    });
    expect(scheduleVersionForDate(versions, "2026-08-19")?.schedule).toEqual({
      kind: "weekdays",
      weekdays: [2, 4],
    });
    expect(await countActivitiesOfType(HABIT_SCHEDULE_CHANGED)).toBe(1);
  });

  it("does NOT rewrite a past week's expectation", async () => {
    const clock = { at: new Date("2026-08-01T00:00:00.000Z") };
    const habits = makeHabitRepository(makeContext(WS), {
      clock: () => clock.at,
      ownerTimeZone: async () => "UTC",
    });
    const habit = await habits.create({
      title: "Strength training",
      schedule: { kind: "weekly_count", timesPerWeek: 3 },
    });
    // The owner lives through the week of 3 August and does all three sessions.
    clock.at = new Date("2026-08-09T00:00:00.000Z");
    await habits.checkIn(habit.id, "2026-08-03");
    await habits.checkIn(habit.id, "2026-08-05");
    await habits.checkIn(habit.id, "2026-08-07");

    const calendar = {
      todayIso: "2026-08-19",
      firstDayOfWeek: "monday",
    } as const;
    const before = evaluateHabitWeek(
      {
        versions: habit.versions,
        completedDates: new Set(["2026-08-03", "2026-08-05", "2026-08-07"]),
        archivedOnIso: null,
      },
      calendar,
      "2026-08-03",
    );
    expect(before).toMatchObject({ expected: 3, completed: 3, met: true });

    clock.at = new Date("2026-08-19T00:00:00.000Z");
    const changed = await habits.changeSchedule(habit.id, {
      kind: "weekly_count",
      timesPerWeek: 2,
    });

    const after = evaluateHabitWeek(
      {
        versions: changed.habit.versions,
        completedDates: new Set(["2026-08-03", "2026-08-05", "2026-08-07"]),
        archivedOnIso: null,
      },
      calendar,
      "2026-08-03",
    );
    // The week of 3 August still asked for THREE, because that is what it asked
    // for. Lowering the target today cannot retroactively make an earlier week
    // easier — or an earlier miss into a success.
    expect(after).toMatchObject({ expected: 3, completed: 3 });
  });

  it("AMENDS today's version in place rather than leaving a zero-length one", async () => {
    const habits = repo();
    const habit = await habits.create({
      title: "Read",
      schedule: { kind: "daily" },
    });
    const first = await habits.changeSchedule(habit.id, {
      kind: "weekdays",
      weekdays: [1, 2, 3, 4, 5],
    });
    expect(first.outcome).toBe("amended");
    expect(first.habit.versions).toHaveLength(1);
    expect(first.habit.versions[0]!.effectiveFrom).toBe("2026-08-19");
  });

  /*
   * HARDEN-06D (F-13) — the owner's calendar day can move BACKWARDS.
   *
   * A westward timezone-preference change (or travel) makes `todayIso` EARLIER
   * than the day the version in force begins on. Closing that version at
   * `todayIso − 1` then produces `effective_to < effective_from`, which the
   * schema's own `habit_schedules_ordered` CHECK refuses — correctly. The
   * application half was missing: the owner saw "A habit storage error
   * occurred." and could not change that Habit's cadence at all until their
   * local date caught up.
   */
  it("amends a version that has not begun yet when the owner's day moves backwards", async () => {
    // Sydney: 2026-08-19. The first schedule version therefore starts then.
    const sydney = repo(WS, {
      ownerTimeZone: async () => "Australia/Sydney",
    });
    const habit = await sydney.create({
      title: "Read",
      schedule: { kind: "daily" },
    });
    expect(habit.versions[0]!.effectiveFrom).toBe("2026-08-19");

    // The owner flies to Los Angeles and changes their timezone preference. At
    // the same instant, their calendar day is now 2026-08-18.
    const losAngeles = repo(WS, {
      ownerTimeZone: async () => "America/Los_Angeles",
    });
    const result = await losAngeles.changeSchedule(habit.id, {
      kind: "weekdays",
      weekdays: [1, 2, 3, 4, 5],
    });

    expect(result).toMatchObject({ outcome: "amended", changed: true });
    // One version, still starting on the day it started: nothing is rewritten,
    // and the chain stays contiguous.
    expect(result.habit.versions).toHaveLength(1);
    expect(result.habit.versions[0]!.effectiveFrom).toBe("2026-08-19");
    expect(result.habit.versions[0]!.schedule).toMatchObject({
      kind: "weekdays",
    });
  });

  it("does nothing when the requested schedule is already in force", async () => {
    const habits = repo();
    const habit = await habits.create({
      title: "Read",
      schedule: { kind: "daily" },
    });
    const result = await habits.changeSchedule(habit.id, { kind: "daily" });
    expect(result).toMatchObject({ outcome: "unchanged", changed: false });
    expect(await countActivitiesOfType(HABIT_SCHEDULE_CHANGED)).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Lifecycle and relationships                                                */
/* -------------------------------------------------------------------------- */

describe("lifecycle", () => {
  it("archives and restores, idempotently, with one event each", async () => {
    const habits = repo();
    const habit = await habits.create({
      title: "Cold shower",
      schedule: { kind: "daily" },
    });

    expect(await habits.archive(habit.id)).toMatchObject({
      outcome: "archived",
      changed: true,
    });
    expect(await habits.archive(habit.id)).toMatchObject({
      outcome: "already_archived",
      changed: false,
    });
    expect(await countActivitiesOfType(HABIT_ARCHIVED)).toBe(1);

    // The archived date is the OWNER's calendar day, stored rather than derived.
    const archived = await habits.get(habit.id);
    expect(archived?.archivedOn).toBe("2026-08-19");

    expect(await habits.restore(habit.id)).toMatchObject({
      outcome: "restored",
      changed: true,
    });
    expect(await habits.restore(habit.id)).toMatchObject({
      outcome: "already_active",
      changed: false,
    });
    expect(await countActivitiesOfType(HABIT_RESTORED)).toBe(1);

    const restored = await habits.get(habit.id);
    expect(restored?.archivedAt).toBeNull();
    expect(restored?.archivedOn).toBeNull();
    // And it can be checked in again.
    await expect(habits.checkIn(habit.id, "2026-08-19")).resolves.toMatchObject(
      { changed: true },
    );
  });

  it("splits the collection by lifecycle", async () => {
    const habits = repo();
    const kept = await habits.create({
      title: "Read",
      schedule: { kind: "daily" },
    });
    const put = await habits.create({
      title: "Cold shower",
      schedule: { kind: "daily" },
    });
    await habits.archive(put.id);

    expect(
      (await habits.list({ status: "active" })).items.map((h) => h.id),
    ).toEqual([kept.id]);
    expect(
      (await habits.list({ status: "archived" })).items.map((h) => h.id),
    ).toEqual([put.id]);
    expect((await habits.list({ status: "all" })).items).toHaveLength(2);
  });

  it("updates title, notes and relationships, and is a no-op when nothing changed", async () => {
    const spine = makeSpineRepository(makeContext(WS));
    const area = await spine.createArea({ title: "Health" });
    const habits = repo();
    const habit = await habits.create({
      title: "Read",
      schedule: { kind: "daily" },
    });

    const changed = await habits.update(habit.id, {
      title: "Read every day",
      notes: "Twenty pages.",
      areaId: area.id,
    });
    expect(changed.changed).toBe(true);
    expect(changed.habit.title).toBe("Read every day");
    expect(changed.habit.area?.title).toBe("Health");
    expect(await countActivitiesOfType(HABIT_UPDATED)).toBe(1);

    const again = await habits.update(habit.id, { title: "Read every day" });
    expect(again.changed).toBe(false);
    expect(await countActivitiesOfType(HABIT_UPDATED)).toBe(1);

    // Clearing a relationship retires the link rather than leaving two active.
    const cleared = await habits.update(habit.id, { areaId: null });
    expect(cleared.habit.area).toBeNull();
    const links = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM entity_links
        WHERE workspace_id = ? AND source_entity_id = ? AND deleted_at IS NULL`,
    )
      .bind(WS, habit.id)
      .first<{ n: number }>();
    expect(links?.n ?? 0).toBe(0);
  });

  it("finds supporting Habits for a set of Goals in one grouped read", async () => {
    const spine = makeSpineRepository(makeContext(WS));
    const area = await spine.createArea({ title: "Health" });
    const goalA = await spine.createGoal({ title: "Goal A", areaId: area.id });
    const goalB = await spine.createGoal({ title: "Goal B", areaId: area.id });
    const habits = repo();
    await habits.create({
      title: "Lift",
      schedule: { kind: "daily" },
      goalId: goalA.id,
    });
    await habits.create({
      title: "Run",
      schedule: { kind: "daily" },
      goalId: goalB.id,
    });
    const archived = await habits.create({
      title: "Old",
      schedule: { kind: "daily" },
      goalId: goalA.id,
    });
    await habits.archive(archived.id);

    const grouped = await habits.listSupportingHabits({
      anchorIds: [goalA.id, goalB.id],
      relation: "goal",
    });
    expect(grouped.get(goalA.id)?.map((h) => h.title)).toEqual(["Lift"]);
    expect(grouped.get(goalB.id)?.map((h) => h.title)).toEqual(["Run"]);
  });

  it("keeps supporting Habits inside the workspace", async () => {
    const spine = makeSpineRepository(makeContext(WS));
    const area = await spine.createArea({ title: "Health" });
    const goal = await spine.createGoal({ title: "Goal", areaId: area.id });
    await repo(WS).create({
      title: "Lift",
      schedule: { kind: "daily" },
      goalId: goal.id,
    });
    await ensureWorkspace(OTHER);
    const grouped = await repo(OTHER).listSupportingHabits({
      anchorIds: [goal.id],
      relation: "goal",
    });
    expect(grouped.size).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Bounds                                                                     */
/* -------------------------------------------------------------------------- */

describe("bounded reads", () => {
  it("costs the same number of statements for twelve Habits as for one", async () => {
    const habits = repo();
    await habits.create({ title: "One", schedule: { kind: "daily" } });

    const single = countingDb(env.DB);
    await readPage(single.db);
    const forOne = single.prepareCount();

    for (let index = 0; index < 11; index += 1) {
      await habits.create({
        title: `Habit ${index}`,
        schedule: { kind: "weekly_count", timesPerWeek: 3 },
      });
    }

    const many = countingDb(env.DB);
    await readPage(many.db);
    // Two statements: the page (with its Goal/Area joins) and EVERY schedule
    // version for that page. Adding eleven Habits adds none.
    expect(many.prepareCount()).toBe(forOne);
    expect(forOne).toBeLessThanOrEqual(3);
  });

  it("reads a whole week of completions for a whole page in ONE statement", async () => {
    const habits = repo();
    const ids: string[] = [];
    for (let index = 0; index < 6; index += 1) {
      const habit = await habits.create({
        title: `Habit ${index}`,
        schedule: { kind: "daily" },
      });
      ids.push(habit.id);
      await habits.checkIn(habit.id, "2026-08-19");
    }
    const counting = countingDb(env.DB);
    const repository = makeHabitRepositoryOn(counting.db);
    const rows = await repository.listCompletionsInRange({
      habitIds: ids,
      fromIso: "2026-08-17",
      toIso: "2026-08-23",
    });
    expect(rows).toHaveLength(6);
    expect(counting.prepareCount()).toBe(1);
  });
});

/**
 * A repository bound to a SPECIFIC database, so a test can count the statements
 * a read actually issues. The composition root binds `env.DB`; this binds the
 * counting proxy around it, and nothing else about the repository changes.
 */
function makeHabitRepositoryOn(db: D1Database) {
  return createHabitRepository(db, makeContext(WS), {
    clock: () => AT,
    ownerTimeZone: async () => "UTC",
  });
}

/** Read one page the way a surface does: the habits, then their schedules. */
async function readPage(db: D1Database): Promise<void> {
  await makeHabitRepositoryOn(db).list({ status: "active", limit: 50 });
}
