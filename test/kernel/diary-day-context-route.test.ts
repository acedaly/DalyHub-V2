import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { RouterContextProvider } from "react-router";

import type { AuthenticatedSession } from "~/kernel/auth";
import { setAuthenticatedSession } from "~/platform/request";
import { loader as dayContextLoader } from "~/modules/diary/routes/day-context";
import type { DayContextResponse } from "~/modules/diary/routes/day-context";

import {
  FakeClock,
  makeContext,
  makeDiaryRepository,
  makeLinkRepository,
  makeMeetingRepository,
  makeSpineRepository,
  makeTaskRepository,
  resetTables,
  sequentialIds,
} from "./support";

/**
 * DIARY-02 — the day-context candidates, over the real Worker/D1 runtime.
 *
 * What is asserted here is exactly the product rule the surface exists to keep:
 * a same-day record is an OFFER, never a relationship. So the loader must find
 * the right records for the entry's OWNER-calendar day, exclude the ones already
 * related, exclude days that are merely adjacent — and, above all, write nothing.
 *
 * The display zone is `Australia/Sydney` (the deterministic default preference),
 * which is deliberately not UTC: a 22:00-local meeting is a 11:00 UTC instant on
 * the SAME local day, and an entry written at 23:30 local files under its local
 * day. Testing in UTC would let a whole class of off-by-a-day bugs through.
 */

const WS = "test-default-workspace";
const OTHER = "ws_day_context_other";
const TZ = "Australia/Sydney";

function authedContext(): RouterContextProvider {
  const session: AuthenticatedSession = {
    user: { subject: "owner", email: "owner@example.com", displayName: null },
    issuedAt: new Date(0),
    expiresAt: new Date(Date.parse("2999-01-01")),
  };
  const context = new RouterContextProvider();
  setAuthenticatedSession(context, session);
  return context;
}

function diary(workspaceId = WS) {
  return makeDiaryRepository(makeContext(workspaceId), {
    clock: new FakeClock().now,
    idGenerator: sequentialIds(`entry-${workspaceId}`),
  });
}

function meetings() {
  return makeMeetingRepository(makeContext(WS), {
    clock: new FakeClock().now,
    idGenerator: sequentialIds("meeting"),
  });
}

function tasks() {
  return makeTaskRepository(makeContext(WS), {
    clock: new FakeClock().now,
    idGenerator: sequentialIds("task"),
  });
}

function spine() {
  return makeSpineRepository(makeContext(WS), {
    clock: new FakeClock().now,
    idGenerator: sequentialIds("spine"),
  });
}

function links() {
  return makeLinkRepository(makeContext(WS), {
    clock: new FakeClock().now,
    idGenerator: sequentialIds("link"),
  });
}

async function loadDayContext(entryId: string): Promise<DayContextResponse> {
  const response = (await dayContextLoader({
    request: new Request(`https://app.test/diary/${entryId}/day-context`),
    context: authedContext(),
    params: { entryId },
  } as unknown as Parameters<typeof dayContextLoader>[0])) as Response;
  return (await response.json()) as DayContextResponse;
}

async function countLinks(): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM entity_links WHERE workspace_id = ?",
  )
    .bind(WS)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** 2026-05-20, 21:00 Sydney (UTC+10) — a late-evening entry on that local day. */
const ENTRY_INSTANT = new Date("2026-05-20T11:00:00.000Z");

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

describe("Diary day context finds the entry's own owner-calendar day", () => {
  it("offers a Meeting that started on that local day and excludes neighbouring days", async () => {
    const entry = await diary().create({
      entryType: "note",
      title: "Long Wednesday",
      timezone: TZ,
      occurredAt: ENTRY_INSTANT,
    });
    const m = meetings();
    // 09:30 Sydney on 20 May — the same local day as the entry.
    const sameDay = await m.create({
      title: "Team Catch up",
      startsAt: "2026-05-19T23:30:00.000Z",
      timezone: TZ,
    });
    // 09:30 Sydney on 21 May — the NEXT local day.
    await m.create({
      title: "Tomorrow's stand-up",
      startsAt: "2026-05-20T23:30:00.000Z",
      timezone: TZ,
    });
    // 09:30 Sydney on 19 May — the PREVIOUS local day.
    await m.create({
      title: "Yesterday's review",
      startsAt: "2026-05-18T23:30:00.000Z",
      timezone: TZ,
    });

    const result = await loadDayContext(entry.id);

    expect(result.dayKey).toBe("2026-05-20");
    expect(result.candidates.map((c) => c.id)).toEqual([sameDay.id]);
    expect(result.candidates[0]).toMatchObject({
      type: "meeting",
      title: "Team Catch up",
    });
  });

  it("offers a Task due on that day and excludes a Task due on another", async () => {
    const entry = await diary().create({
      entryType: "note",
      title: "Long Wednesday",
      timezone: TZ,
      occurredAt: ENTRY_INSTANT,
    });
    const t = tasks();
    const dueThatDay = await t.createTask({
      title: "Submit training brief",
      dueDate: "2026-05-20",
    });
    await t.createTask({ title: "Something else", dueDate: "2026-05-27" });
    await t.createTask({ title: "Undated" });

    const result = await loadDayContext(entry.id);

    expect(result.candidates.map((c) => c.id)).toEqual([dueThatDay.id]);
    expect(result.candidates[0]).toMatchObject({
      type: "task",
      title: "Submit training brief",
      detail: "Due this day",
    });
  });

  it("excludes a same-day record that is ALREADY related to the entry", async () => {
    const entry = await diary().create({
      entryType: "note",
      title: "Long Wednesday",
      timezone: TZ,
      occurredAt: ENTRY_INSTANT,
    });
    const meeting = await meetings().create({
      title: "Team Catch up",
      startsAt: "2026-05-19T23:30:00.000Z",
      timezone: TZ,
    });
    await links().create({
      sourceEntityId: entry.id,
      targetEntityId: meeting.id,
      type: "link.related",
    });

    const result = await loadDayContext(entry.id);

    // It is under "Related" now, so offering to link it again would misdescribe
    // the record's actual state.
    expect(result.candidates).toEqual([]);
  });
});

describe("Diary day context never writes a relationship", () => {
  it("creates no EntityLink merely because the dates match", async () => {
    const entry = await diary().create({
      entryType: "note",
      title: "Long Wednesday",
      timezone: TZ,
      occurredAt: ENTRY_INSTANT,
    });
    await meetings().create({
      title: "Team Catch up",
      startsAt: "2026-05-19T23:30:00.000Z",
      timezone: TZ,
    });
    await tasks().createTask({
      title: "Submit training brief",
      dueDate: "2026-05-20",
    });

    const before = await countLinks();
    const result = await loadDayContext(entry.id);
    expect(result.candidates.length).toBe(2);
    expect(await countLinks()).toBe(before);
  });

  it("does not treat a title that names the meeting as a relationship", async () => {
    const entry = await diary().create({
      entryType: "note",
      title: "Team Catch up",
      timezone: TZ,
      occurredAt: ENTRY_INSTANT,
    });
    const meeting = await meetings().create({
      title: "Team Catch up",
      startsAt: "2026-05-19T23:30:00.000Z",
      timezone: TZ,
    });

    const result = await loadDayContext(entry.id);

    // An identical title is NOT evidence. It stays a suggestion, and nothing is
    // written — there is no matching, no inference and no AI in this path.
    expect(result.candidates.map((c) => c.id)).toEqual([meeting.id]);
    expect(await countLinks()).toBe(0);
  });
});

describe("Diary day context is workspace-isolated", () => {
  it("returns the calm not-found for an entry in another workspace", async () => {
    const foreign = await diary(OTHER).create({
      entryType: "note",
      title: "Not yours",
      timezone: TZ,
      occurredAt: ENTRY_INSTANT,
    });

    await expect(loadDayContext(foreign.id)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("never offers a candidate from another workspace", async () => {
    const entry = await diary().create({
      entryType: "note",
      title: "Long Wednesday",
      timezone: TZ,
      occurredAt: ENTRY_INSTANT,
    });
    await makeMeetingRepository(makeContext(OTHER), {
      clock: new FakeClock().now,
      idGenerator: sequentialIds("meeting-other"),
    }).create({
      title: "Someone else's meeting",
      startsAt: "2026-05-19T23:30:00.000Z",
      timezone: TZ,
    });

    const result = await loadDayContext(entry.id);
    expect(result.candidates).toEqual([]);
  });
});

describe("Diary day context stays bounded", () => {
  it("caps the number of candidates it offers", async () => {
    const entry = await diary().create({
      entryType: "note",
      title: "A very busy day",
      timezone: TZ,
      occurredAt: ENTRY_INSTANT,
    });
    const m = meetings();
    for (let index = 0; index < 12; index += 1) {
      await m.create({
        title: `Meeting ${index}`,
        startsAt: `2026-05-19T2${index < 3 ? "1" : "3"}:${String(
          10 + index,
        ).padStart(2, "0")}:00.000Z`,
        timezone: TZ,
      });
    }

    const result = await loadDayContext(entry.id);

    // The surface is an offer beside an entry, not a collection: it is bounded
    // server-side rather than rendering everything the day contained.
    expect(result.candidates.length).toBeLessThanOrEqual(10);
    expect(result.candidates.length).toBeGreaterThan(0);
  });
});

/** Keep the spine import meaningful: a Task needs no parent, but the suite asserts
 * that an unparented (Inbox) Task still surfaces, which is the common case. */
describe("Diary day context covers Inbox tasks", () => {
  it("offers an unassigned Task due that day", async () => {
    await spine().createArea({ title: "Unrelated area" });
    const entry = await diary().create({
      entryType: "note",
      title: "Long Wednesday",
      timezone: TZ,
      occurredAt: ENTRY_INSTANT,
    });
    const task = await tasks().createTask({
      title: "Inbox task due today",
      dueDate: "2026-05-20",
    });

    const result = await loadDayContext(entry.id);
    expect(result.candidates.map((c) => c.id)).toEqual([task.id]);
  });
});
