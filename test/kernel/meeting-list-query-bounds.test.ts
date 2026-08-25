/**
 * DEBT-65 — a page of Meetings costs a FIXED number of statements.
 *
 * `MeetingRepository.list()` mapped every returned row through a private
 * `#items(id)`, so a 30-row collection page issued ~31 prepared statements
 * where two would do — the N+1 shape [AGENTS.md §16](../../AGENTS.md) exists to
 * prevent, and one the page's own 50-row cap kept from being unbounded rather
 * than making correct. It was found during V2.0.1: the `searchMeetings`
 * projection added at the time deliberately avoided the shape, and `list()`
 * kept it.
 *
 * The assertion is written as the closing condition asked for it — a query
 * COUNT that does not grow with the page — and it is asserted at two different
 * page sizes rather than one, because a single measurement cannot tell a
 * constant from a coincidence.
 *
 * The items themselves are asserted alongside, because a batched read that
 * returns the wrong items per meeting, or loses their order, would satisfy the
 * count and break the product.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import type { Meeting, MeetingRepository } from "~/kernel/meetings";

import {
  FakeClock,
  countingDb,
  makeContext,
  makeMeetingRepository,
  resetTables,
  sequentialIds,
} from "./support";
import { createMeetingRepository } from "~/platform/storage/d1";

const WS = "test-meeting-bounds-workspace";
const START = "2026-09-01T09:00:00.000Z";

const nextEntityId = sequentialIds("mbounds");
const nextActivityId = sequentialIds("mboundsact");

function repository(db: D1Database = env.DB): MeetingRepository {
  return createMeetingRepository(db, makeContext(WS), {
    clock: new FakeClock().now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  });
}

/** `count` upcoming meetings, each carrying two agenda items and one decision. */
async function seedMeetings(count: number): Promise<readonly Meeting[]> {
  const repo = makeMeetingRepository(makeContext(WS), {
    clock: new FakeClock().now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  });
  const meetings: Meeting[] = [];
  for (let index = 0; index < count; index += 1) {
    const meeting = await repo.create({
      title: `Sync ${String(index).padStart(2, "0")}`,
      // Distinct, ascending starts so the page order is deterministic.
      startsAt: new Date(Date.parse(START) + index * 3_600_000).toISOString(),
      timezone: "UTC",
    });
    await repo.addItem(meeting.id, "agenda", `Agenda A for ${meeting.title}`);
    await repo.addItem(meeting.id, "agenda", `Agenda B for ${meeting.title}`);
    await repo.addItem(meeting.id, "decision", `Decision for ${meeting.title}`);
    meetings.push(meeting);
  }
  return meetings;
}

describe("DEBT-65 — listing Meetings is bounded, not one read per row", () => {
  beforeEach(async () => {
    await resetTables([WS]);
  });

  it("issues the same number of statements for 4 rows as for 20", async () => {
    await seedMeetings(20);
    const counting = countingDb(env.DB);
    const repo = repository(counting.db);

    counting.reset();
    const small = await repo.list({ view: "upcoming", limit: 4 });
    const smallCount = counting.prepareCount();
    expect(small.items).toHaveLength(4);

    counting.reset();
    const large = await repo.list({ view: "upcoming", limit: 20 });
    const largeCount = counting.prepareCount();
    expect(large.items).toHaveLength(20);

    /*
     * The whole entry, in one line. Against the previous implementation the
     * larger page costs SIXTEEN more statements than the smaller one; the read
     * that grows with the page is exactly the defect.
     */
    expect(largeCount).toBe(smallCount);
  });

  it("costs a small, stated number of statements — not merely a constant one", async () => {
    // A constant that happens to be large would satisfy the line above. The
    // page is: one count, one rows read, one grouped items read.
    await seedMeetings(12);
    const counting = countingDb(env.DB);
    const repo = repository(counting.db);

    counting.reset();
    await repo.list({ view: "upcoming", limit: 12 });
    expect(counting.prepareCount()).toBeLessThanOrEqual(4);
  });

  it("still gives every meeting its OWN items, in order", async () => {
    // A batched read that returned the wrong rows per meeting, or lost the
    // `kind, position, id` ordering, would satisfy the counts above and break
    // the product.
    const seeded = await seedMeetings(6);
    const page = await repository().list({ view: "upcoming", limit: 6 });

    expect(page.items.map((meeting) => meeting.title)).toEqual(
      seeded.map((meeting) => meeting.title),
    );
    for (const meeting of page.items) {
      expect(meeting.items.map((item) => item.bodyMarkdown)).toEqual([
        `Agenda A for ${meeting.title}`,
        `Agenda B for ${meeting.title}`,
        `Decision for ${meeting.title}`,
      ]);
    }
  });

  it("reads exactly what the single-meeting `get` reads", async () => {
    // The grouped read and the single read must not become two answers.
    const [first] = await seedMeetings(3);
    const repo = repository();
    const listed = (await repo.list({ view: "upcoming", limit: 3 })).items.find(
      (meeting) => meeting.id === first!.id,
    );
    const fetched = await repo.get(first!.id);
    expect(listed?.items).toEqual(fetched?.items);
  });

  it("returns an empty page without issuing an items read at all", async () => {
    const counting = countingDb(env.DB);
    const repo = repository(counting.db);
    counting.reset();
    const page = await repo.list({ view: "upcoming", limit: 10 });
    expect(page.items).toEqual([]);
    // No page, no ids, no third statement.
    expect(counting.prepareCount()).toBeLessThanOrEqual(2);
  });
});
