/**
 * HARDEN-06C (F-05) — the created/updated recency windows at the boundary where
 * the owner's calendar day and the UTC day disagree.
 *
 * The defect: `todayIso` is the OWNER's calendar day
 * (`ownerCalendarIso(now, preferences.timezone)`) and `created_at` / `updated_at`
 * are UTC instants, and the filter compared the two directly by concatenating
 * `T00:00:00.000Z` onto the window's first day. For the DEFAULT owner timezone
 * (`Australia/Sydney`, UTC+10/+11) `Created: Today` therefore silently omitted
 * everything captured before ~10 or 11 a.m. local — up to half the working day.
 * For a negative-offset owner it did the reverse, and quietly included several
 * hours of yesterday.
 *
 * The existing recency coverage never caught it because every case placed its
 * records comfortably inside the window; none put one in the ten-hour band where
 * the two calendars disagree. These do, in BOTH directions, on BOTH repositories
 * that carry the filter.
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
  VIEW_SCOPES,
  parseCrossViewConfig,
  type CrossViewQueryContext,
} from "~/kernel/views";
import { ownerCalendarIso, ownerDayStartInstant } from "~/shared/datetime";

import {
  FakeClock,
  makeContext,
  makeCrossViewQueryRepository,
  makeSpineRepository,
  makeTaskRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "test-default-workspace";
const SYDNEY = "Australia/Sydney";
const LOS_ANGELES = "America/Los_Angeles";

const nextId = sequentialIds("recency");

/**
 * The owner is in Sydney. Their 2026-01-15 begins at 2026-01-14T13:00Z, so a
 * Task captured at 09:00 local is 2026-01-14T22:00Z — an instant that reads as
 * "yesterday" in UTC and is very much today for them.
 */
const SYDNEY_MORNING = "2026-01-14T22:00:00.000Z";
const SYDNEY_TODAY = "2026-01-15";

/**
 * The owner is in Los Angeles (UTC−8). Their 2026-01-15 begins at
 * 2026-01-15T08:00Z, so an instant at 2026-01-15T02:00Z is still 2026-01-14
 * for them — 6 p.m. the previous evening — and must NOT be counted as today.
 */
const LA_LAST_EVENING = "2026-01-15T02:00:00.000Z";
const LA_TODAY = "2026-01-15";

function repos(atIso: string) {
  const context = makeContext(WS);
  const clock = new FakeClock(atIso).now;
  return {
    spine: makeSpineRepository(context, { clock, idGenerator: nextId }),
    tasks: makeTaskRepository(context, { clock, idGenerator: nextId }),
    crossView: makeCrossViewQueryRepository(context),
  };
}

function crossViewContext(
  todayIso: string,
  timezone: string,
): CrossViewQueryContext {
  const now = new Date(`${todayIso}T00:00:00.000Z`);
  return {
    now,
    todayIso,
    weekStartIso: todayIso,
    weekEndIso: todayIso,
    calendarIsoOf: (instant) => ownerCalendarIso(instant, timezone),
    dayStartInstantOf: (dayIso) => ownerDayStartInstant(dayIso, timezone),
    alignmentRecentWindowStartIso: `${todayIso}T00:00:00.000Z`,
    availableScopes: [...VIEW_SCOPES],
  };
}

beforeEach(async () => {
  await resetTables([WS]);
});

describe("HARDEN-06C — `created within` east of Greenwich", () => {
  it("includes a Task captured at nine this morning in Sydney", async () => {
    const { spine, tasks } = repos(SYDNEY_MORNING);
    const area = await spine.createArea({ title: "Work" });
    await spine.createTask({
      title: "Captured at nine this morning",
      parent: { kind: "area", id: area.id },
    });

    const page = await tasks.listWorkspaceTasks({
      view: "all",
      todayIso: SYDNEY_TODAY,
      timezone: SYDNEY,
      filters: { createdWithin: "1d" },
    });
    expect(page.items.map((item) => item.title)).toEqual([
      "Captured at nine this morning",
    ]);
  });

  it("still excludes a Task captured before the owner's day began", async () => {
    // 2026-01-14T12:00Z is 23:00 on the 14th in Sydney — the owner's YESTERDAY,
    // one hour before their 15th starts. `1d` is today alone, so it is out.
    const { spine, tasks } = repos("2026-01-14T12:00:00.000Z");
    const area = await spine.createArea({ title: "Work" });
    await spine.createTask({
      title: "Captured last night",
      parent: { kind: "area", id: area.id },
    });

    const page = await tasks.listWorkspaceTasks({
      view: "all",
      todayIso: SYDNEY_TODAY,
      timezone: SYDNEY,
      filters: { createdWithin: "1d" },
    });
    expect(page.items).toEqual([]);
  });
});

describe("HARDEN-06C — `created within` west of Greenwich", () => {
  it("excludes a Task captured yesterday evening in Los Angeles", async () => {
    const { spine, tasks } = repos(LA_LAST_EVENING);
    const area = await spine.createArea({ title: "Work" });
    await spine.createTask({
      title: "Captured yesterday evening",
      parent: { kind: "area", id: area.id },
    });

    const page = await tasks.listWorkspaceTasks({
      view: "all",
      todayIso: LA_TODAY,
      timezone: LOS_ANGELES,
      filters: { createdWithin: "1d" },
    });
    // The old construction bound `2026-01-15T00:00:00.000Z` and counted this as
    // today, quietly folding several hours of the previous evening into "today".
    expect(page.items).toEqual([]);
  });

  it("includes a Task captured after the owner's day actually began", async () => {
    const { spine, tasks } = repos("2026-01-15T17:00:00.000Z"); // 09:00 local
    const area = await spine.createArea({ title: "Work" });
    await spine.createTask({
      title: "Captured this morning",
      parent: { kind: "area", id: area.id },
    });

    const page = await tasks.listWorkspaceTasks({
      view: "all",
      todayIso: LA_TODAY,
      timezone: LOS_ANGELES,
      filters: { createdWithin: "1d" },
    });
    expect(page.items.map((item) => item.title)).toEqual([
      "Captured this morning",
    ]);
  });
});

describe("HARDEN-06C — `updated within` follows the same boundary", () => {
  it("includes a Task edited at nine this morning in Sydney", async () => {
    const { spine, tasks } = repos(SYDNEY_MORNING);
    const area = await spine.createArea({ title: "Work" });
    const task = await spine.createTask({
      title: "Edited this morning",
      parent: { kind: "area", id: area.id },
    });
    await spine.rename(task.id, "Edited this morning, then renamed");

    const page = await tasks.listWorkspaceTasks({
      view: "all",
      todayIso: SYDNEY_TODAY,
      timezone: SYDNEY,
      filters: { updatedWithin: "1d" },
    });
    expect(page.items.map((item) => item.title)).toEqual([
      "Edited this morning, then renamed",
    ]);
  });
});

describe("HARDEN-06C — the Views module carries the same window", () => {
  it("includes a record created inside the offset band", async () => {
    const { spine, crossView } = repos(SYDNEY_MORNING);
    const area = await spine.createArea({ title: "Work" });
    await spine.createTask({
      title: "Captured at nine this morning",
      parent: { kind: "area", id: area.id },
    });

    const page = await crossView.runCrossView(
      parseCrossViewConfig({
        scopes: ["task"],
        shared: { createdWithin: "today" },
        sort: "updated",
        direction: "desc",
      }),
      crossViewContext(SYDNEY_TODAY, SYDNEY),
    );
    expect(page.results.map((result) => result.title)).toEqual([
      "Captured at nine this morning",
    ]);
  });

  it("excludes a record created before the owner's day began", async () => {
    const { spine, crossView } = repos(LA_LAST_EVENING);
    const area = await spine.createArea({ title: "Work" });
    await spine.createTask({
      title: "Captured yesterday evening",
      parent: { kind: "area", id: area.id },
    });

    const page = await crossView.runCrossView(
      parseCrossViewConfig({
        scopes: ["task"],
        shared: { createdWithin: "today" },
        sort: "updated",
        direction: "desc",
      }),
      crossViewContext(LA_TODAY, LOS_ANGELES),
    );
    expect(page.results).toEqual([]);
  });
});
