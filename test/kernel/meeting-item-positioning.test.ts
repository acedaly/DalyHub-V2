import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { RouterContextProvider } from "react-router";

import type { AuthenticatedSession } from "~/kernel/auth";
import {
  MEETING_UPDATED,
  MeetingArchivedError,
  MeetingItemConflictError,
  MeetingNotFoundError,
  MeetingStorageError,
  MeetingValidationError,
  type Meeting,
  type MeetingItem,
  type MeetingItemKind,
  type MeetingRepository,
} from "~/kernel/meetings";
import { createMeetingRepository } from "~/platform/storage/d1";
import { setAuthenticatedSession } from "~/platform/request";
import { action as meetingMutate } from "~/modules/meetings/routes/mutate";

import {
  FakeClock,
  countActivitiesOfType,
  makeContext,
  makeMeetingRepository,
  resetTables,
  sequentialIds,
} from "./support";

/**
 * AUDIT-FIX-02 — structured meeting-item POSITION ALLOCATION, against real
 * Workers/D1 and the committed migrations.
 *
 * The reported defect: `addItem` derived a new item's `position` from the COUNT of
 * surviving items of that kind, while `removeItem` (correctly) never renumbers. So
 * removing a NON-LAST item left a gap, the count then named a position a later
 * item still held, and the insert violated
 * `UNIQUE (workspace_id, meeting_id, kind, position)` — that kind became
 * un-addable until every trailing item was removed too.
 *
 * The correction allocates `MAX(position) + 1`, scoped to workspace + meeting +
 * kind, INSIDE the insert statement. These tests pin the properties that makes
 * true: the ordinal is always strictly greater than every LIVE ordinal of its
 * kind (so an interior gap is skipped and a freed tail ordinal is safely reused),
 * existing items are never disturbed, kinds allocate independently, workspaces are
 * isolated, the append and its Activity are atomic, contention is safe, and no raw
 * storage text ever reaches a response.
 */

const WS = "test-default-workspace";
const OTHER = "ws_meeting_positions_other";
const START = "2026-07-27T09:00:00.000Z";

const nextEntityId = sequentialIds("mpos");
const nextActivityId = sequentialIds("mposact");

/** Every kind the meeting domain defines — nothing here is agenda-specific. */
const ALL_KINDS: readonly MeetingItemKind[] = [
  "agenda",
  "decision",
  "outcome",
  "action",
];

function repository(workspaceId: string): MeetingRepository {
  return makeMeetingRepository(makeContext(workspaceId), {
    clock: new FakeClock().now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  });
}

async function seedMeeting(
  repo: MeetingRepository,
  title = "Weekly sync",
): Promise<Meeting> {
  return repo.create({ title, startsAt: START, timezone: "UTC" });
}

/** The repository's own view of one kind's items, in display order. */
async function itemsOfKind(
  repo: MeetingRepository,
  meetingId: string,
  kind: MeetingItemKind,
): Promise<readonly MeetingItem[]> {
  const meeting = await repo.get(meetingId);
  return (meeting?.items ?? []).filter((item) => item.kind === kind);
}

async function positionsOfKind(
  repo: MeetingRepository,
  meetingId: string,
  kind: MeetingItemKind,
): Promise<number[]> {
  return (await itemsOfKind(repo, meetingId, kind)).map(
    (item) => item.position,
  );
}

/**
 * Direct SQL, for the ONE invariant the public repository view cannot express:
 * that no two live rows share a `(meeting, kind, position)` slot. Everything
 * behavioural is asserted through the repository API.
 */
async function duplicatePositionCount(): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM (
       SELECT workspace_id, meeting_id, kind, position
         FROM meeting_items
        GROUP BY workspace_id, meeting_id, kind, position
       HAVING COUNT(*) > 1)`,
  ).first<{ n: number }>();
  return row?.n ?? 0;
}

async function itemRowCount(): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM meeting_items",
  ).first<{ n: number }>();
  return row?.n ?? 0;
}

/**
 * A `D1Database` that runs `interfere` ONCE, immediately before the first
 * `batch()` — i.e. after a repository method has read the meeting but before its
 * guarded write executes. That is exactly the window a second tab (or another
 * device) can archive or delete the meeting in, and it is the only way to reach
 * the guard's refusal path deterministically. Only `batch` is proxied.
 */
function raceDb(
  interfere: () => Promise<void>,
  /**
   * Optional second interference, run once immediately AFTER the guarded write —
   * i.e. in the window before the repository diagnoses its own refusal. Used to
   * reproduce archive-then-restore, where the refusal is real but the meeting no
   * longer looks refusing by the time it is inspected.
   */
  afterWrite?: () => Promise<void>,
): D1Database {
  let armed = true;
  return new Proxy(env.DB, {
    get(target, prop, receiver) {
      if (prop === "batch") {
        return async (statements: D1PreparedStatement[]) => {
          const first = armed;
          if (first) {
            armed = false;
            await interfere();
          }
          const results = await target.batch(statements);
          if (first && afterWrite) await afterWrite();
          return results;
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as D1Database;
}

/** Archive a meeting through raw SQL, adding no lifecycle Activity of its own. */
async function archiveDirectly(meetingId: string): Promise<void> {
  await env.DB.prepare(
    "UPDATE meeting_details SET archived_at = ? WHERE entity_id = ?",
  )
    .bind("2026-07-27T10:00:00.000Z", meetingId)
    .run();
}

/** Un-archive a meeting through raw SQL, for the same reason. */
async function restoreDirectly(meetingId: string): Promise<void> {
  await env.DB.prepare(
    "UPDATE meeting_details SET archived_at = NULL WHERE entity_id = ?",
  )
    .bind(meetingId)
    .run();
}

/** Soft-delete a meeting's entity row through raw SQL, for the same reason. */
async function softDeleteDirectly(meetingId: string): Promise<void> {
  await env.DB.prepare("UPDATE entities SET deleted_at = ? WHERE id = ?")
    .bind("2026-07-27T10:00:00.000Z", meetingId)
    .run();
}

function authedContext(): RouterContextProvider {
  const session: AuthenticatedSession = {
    user: {
      subject: "owner-subject",
      email: "owner@example.com",
      displayName: null,
    },
    issuedAt: new Date(0),
    expiresAt: new Date(Date.parse("2999-01-01")),
  };
  const context = new RouterContextProvider();
  setAuthenticatedSession(context, session);
  return context;
}

async function mutate(
  meetingId: string,
  fields: Record<string, string>,
): Promise<{ status: number; text: string; body: Record<string, unknown> }> {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  const response = (await meetingMutate({
    request: new Request(`https://app.test/meeting/${meetingId}/mutate`, {
      method: "POST",
      body,
    }),
    context: authedContext(),
    params: { meetingId },
  } as unknown as Parameters<typeof meetingMutate>[0])) as Response;
  const text = await response.text();
  return {
    status: response.status,
    text,
    body: JSON.parse(text) as Record<string, unknown>,
  };
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

// --- Test 1 — the reported agenda regression ------------------------------------

describe("AUDIT-FIX-02 — adding after a non-last removal", () => {
  it("appends past the gap left by removing the FIRST agenda item", async () => {
    const repo = repository(WS);
    const meeting = await seedMeeting(repo);

    const first = await repo.addItem(meeting.id, "agenda", "Budget");
    const second = await repo.addItem(meeting.id, "agenda", "Hiring");
    const third = await repo.addItem(meeting.id, "agenda", "Roadmap");
    expect([first.position, second.position, third.position]).toEqual([
      0, 1, 2,
    ]);

    expect(await repo.removeItem(meeting.id, first.id)).toBe(true);
    // The survivors keep the ordinals they were given — removal never renumbers.
    expect(await positionsOfKind(repo, meeting.id, "agenda")).toEqual([1, 2]);

    // This is the operation that used to throw a raw UNIQUE-constraint error.
    const fourth = await repo.addItem(meeting.id, "agenda", "Risks");
    expect(fourth.position).toBe(3);

    const items = await itemsOfKind(repo, meeting.id, "agenda");
    expect(items.map((item) => item.id)).toEqual([
      second.id,
      third.id,
      fourth.id,
    ]);
    // Existing trailing items untouched: same ids, same bodies, same positions.
    expect(items.map((item) => item.bodyMarkdown)).toEqual([
      "Hiring",
      "Roadmap",
      "Risks",
    ]);
    expect(items.map((item) => item.position)).toEqual([1, 2, 3]);
    expect(new Set(items.map((item) => item.position)).size).toBe(3);
    expect(await duplicatePositionCount()).toBe(0);
    // The new item sorts AFTER every existing active item.
    expect(fourth.position).toBeGreaterThan(third.position);

    // One `meeting.updated` per successful item mutation: 3 adds + 1 remove + 1
    // add. Exactly one of them is this add — none duplicated, none missing.
    expect(await countActivitiesOfType(MEETING_UPDATED)).toBe(5);
  });

  it.each(ALL_KINDS)(
    "recovers the same way for %s items, not just agenda",
    async (kind) => {
      const repo = repository(WS);
      const meeting = await seedMeeting(repo);

      const first = await repo.addItem(meeting.id, kind, "One");
      await repo.addItem(meeting.id, kind, "Two");
      const third = await repo.addItem(meeting.id, kind, "Three");
      await repo.removeItem(meeting.id, first.id);

      const added = await repo.addItem(meeting.id, kind, "Four");
      expect(added.position).toBe(3);
      expect(added.position).toBeGreaterThan(third.position);
      expect(await positionsOfKind(repo, meeting.id, kind)).toEqual([1, 2, 3]);
      expect(await duplicatePositionCount()).toBe(0);
    },
  );
});

// --- Test 2 — removing a MIDDLE item --------------------------------------------

describe("AUDIT-FIX-02 — removing a middle item", () => {
  it("leaves the interior gap vacant and appends after the last item", async () => {
    const repo = repository(WS);
    const meeting = await seedMeeting(repo);

    const created = [];
    for (const body of ["A", "B", "C", "D"]) {
      created.push(await repo.addItem(meeting.id, "decision", body));
    }
    expect(created.map((item) => item.position)).toEqual([0, 1, 2, 3]);

    const middle = created[1]!;
    expect(await repo.removeItem(meeting.id, middle.id)).toBe(true);

    const added = await repo.addItem(meeting.id, "decision", "E");
    // Appended past the tail — NOT into the vacated slot, and colliding with none.
    expect(added.position).toBe(4);

    const items = await itemsOfKind(repo, meeting.id, "decision");
    expect(items.map((item) => item.bodyMarkdown)).toEqual([
      "A",
      "C",
      "D",
      "E",
    ]);
    // Display order is ascending by position, and every survivor is unchanged.
    expect(items.map((item) => item.position)).toEqual([0, 2, 3, 4]);
    expect(items.map((item) => item.id)).toEqual([
      created[0]!.id,
      created[2]!.id,
      created[3]!.id,
      added.id,
    ]);
    expect(await duplicatePositionCount()).toBe(0);
  });
});

// --- Test 3 — kinds allocate independently ---------------------------------------

describe("AUDIT-FIX-02 — item kinds are independent", () => {
  it("scopes allocation per kind, so one kind's gap never moves another", async () => {
    const repo = repository(WS);
    const meeting = await seedMeeting(repo);

    // Three of every kind, interleaved so no kind is written contiguously.
    const created = new Map<MeetingItemKind, MeetingItem[]>();
    for (const round of ["1", "2", "3"]) {
      for (const kind of ALL_KINDS) {
        const item = await repo.addItem(meeting.id, kind, `${kind} ${round}`);
        created.set(kind, [...(created.get(kind) ?? []), item]);
      }
    }
    for (const kind of ALL_KINDS) {
      expect(created.get(kind)!.map((item) => item.position)).toEqual([
        0, 1, 2,
      ]);
    }

    // Create a gap in ONE kind only.
    await repo.removeItem(meeting.id, created.get("agenda")![0]!.id);
    expect(await positionsOfKind(repo, meeting.id, "agenda")).toEqual([1, 2]);
    for (const kind of ALL_KINDS.filter((k) => k !== "agenda")) {
      expect(await positionsOfKind(repo, meeting.id, kind)).toEqual([0, 1, 2]);
    }

    // Every kind then allocates from its OWN maximum.
    for (const kind of ALL_KINDS) {
      const added = await repo.addItem(meeting.id, kind, `${kind} next`);
      expect(added.position).toBe(3);
    }
    for (const kind of ALL_KINDS) {
      expect(await positionsOfKind(repo, meeting.id, kind)).toEqual(
        kind === "agenda" ? [1, 2, 3] : [0, 1, 2, 3],
      );
    }
    expect(await duplicatePositionCount()).toBe(0);
  });
});

// --- Test 4 — removing the LAST item ---------------------------------------------

describe("AUDIT-FIX-02 — removing the last item", () => {
  it("reuses the freed tail ordinal, per the documented MAX(position)+1 contract", async () => {
    const repo = repository(WS);
    const meeting = await seedMeeting(repo);

    const first = await repo.addItem(meeting.id, "outcome", "One");
    const second = await repo.addItem(meeting.id, "outcome", "Two");
    expect(second.position).toBe(1);
    expect(await repo.removeItem(meeting.id, second.id)).toBe(true);
    expect(await positionsOfKind(repo, meeting.id, "outcome")).toEqual([0]);

    // The contract is "strictly greater than every LIVE ordinal of this kind".
    // Removing the TAIL lowers the maximum, so ordinal 1 is free again and is
    // reused — safe by construction, because no live row holds it. (Removing an
    // INTERIOR item behaves differently; that is Tests 1 and 2.)
    const third = await repo.addItem(meeting.id, "outcome", "Three");
    expect(third.position).toBe(1);
    expect(third.position).toBeGreaterThan(first.position);

    const items = await itemsOfKind(repo, meeting.id, "outcome");
    expect(items.map((item) => item.bodyMarkdown)).toEqual(["One", "Three"]);
    expect(items.map((item) => item.position)).toEqual([0, 1]);
    expect(await duplicatePositionCount()).toBe(0);
  });

  it("starts a kind back at 0 once ALL of its items are gone", async () => {
    const repo = repository(WS);
    const meeting = await seedMeeting(repo);
    const only = await repo.addItem(meeting.id, "action", "Only");
    await repo.removeItem(meeting.id, only.id);

    const fresh = await repo.addItem(meeting.id, "action", "Fresh");
    expect(fresh.position).toBe(0);
    expect(await duplicatePositionCount()).toBe(0);
  });
});

// --- Test 5 — repeated add/remove cycles -----------------------------------------

describe("AUDIT-FIX-02 — repeated add/remove cycles", () => {
  it("never makes a kind un-addable and leaves no orphaned rows", async () => {
    const repo = repository(WS);
    const meeting = await seedMeeting(repo);
    let successfulMutations = 0;

    for (const kind of ALL_KINDS) {
      await repo.addItem(meeting.id, kind, `${kind} anchor`);
      successfulMutations += 1;
    }

    for (let cycle = 0; cycle < 5; cycle++) {
      for (const kind of ALL_KINDS) {
        const before = await itemsOfKind(repo, meeting.id, kind);
        const added = await repo.addItem(meeting.id, kind, `${kind} ${cycle}`);
        successfulMutations += 1;
        // Deterministic ordering: each add lands strictly after the current tail.
        expect(added.position).toBe(before.at(-1)!.position + 1);

        // Remove the FIRST surviving item — always a non-last removal, which is
        // exactly the sequence that used to make the kind permanently un-addable.
        expect(await repo.removeItem(meeting.id, before[0]!.id)).toBe(true);
        successfulMutations += 1;

        const after = await itemsOfKind(repo, meeting.id, kind);
        expect(new Set(after.map((item) => item.position)).size).toBe(
          after.length,
        );
        expect([...after].sort((a, b) => a.position - b.position)).toEqual([
          ...after,
        ]);
      }
      expect(await duplicatePositionCount()).toBe(0);
    }

    // No orphans: the live rows are exactly what the repository reports, and one
    // truthful `meeting.updated` exists per successful mutation.
    const live = (await repo.get(meeting.id))!.items;
    expect(await itemRowCount()).toBe(live.length);
    expect(await countActivitiesOfType(MEETING_UPDATED)).toBe(
      successfulMutations,
    );
  });

  it("treats removing an already-removed item as a no-op with no event", async () => {
    const repo = repository(WS);
    const meeting = await seedMeeting(repo);
    const item = await repo.addItem(meeting.id, "agenda", "Once");

    expect(await repo.removeItem(meeting.id, item.id)).toBe(true);
    const eventsAfterFirst = await countActivitiesOfType(MEETING_UPDATED);
    expect(await repo.removeItem(meeting.id, item.id)).toBe(false);
    expect(await countActivitiesOfType(MEETING_UPDATED)).toBe(eventsAfterFirst);
  });
});

// --- Test 6 — workspace isolation -------------------------------------------------

describe("AUDIT-FIX-02 — workspace isolation", () => {
  it("refuses another workspace's meeting for both add and remove", async () => {
    const mine = repository(WS);
    const theirs = repository(OTHER);
    const meeting = await seedMeeting(mine);
    const item = await mine.addItem(meeting.id, "agenda", "Mine");

    await expect(
      theirs.addItem(meeting.id, "agenda", "Theirs"),
    ).rejects.toBeInstanceOf(MeetingNotFoundError);
    await expect(theirs.removeItem(meeting.id, item.id)).rejects.toBeInstanceOf(
      MeetingNotFoundError,
    );

    // Nothing crossed the boundary in either direction.
    expect(await positionsOfKind(mine, meeting.id, "agenda")).toEqual([0]);
    expect(await itemRowCount()).toBe(1);
  });

  it("never lets another workspace's items influence allocation", async () => {
    const mine = repository(WS);
    const theirs = repository(OTHER);
    const myMeeting = await seedMeeting(mine, "Ours");
    const theirMeeting = await seedMeeting(theirs, "Theirs");

    // The other workspace runs far ahead on the same kind…
    for (const body of ["a", "b", "c", "d", "e"]) {
      await theirs.addItem(theirMeeting.id, "agenda", body);
    }
    expect(await positionsOfKind(theirs, theirMeeting.id, "agenda")).toEqual([
      0, 1, 2, 3, 4,
    ]);

    // …and cannot move ours, which still starts at 0.
    const ours = await mine.addItem(myMeeting.id, "agenda", "ours");
    expect(ours.position).toBe(0);

    // A gap in ours does not change theirs, and vice versa.
    expect(await mine.removeItem(myMeeting.id, ours.id)).toBe(true);
    expect(await positionsOfKind(theirs, theirMeeting.id, "agenda")).toEqual([
      0, 1, 2, 3, 4,
    ]);
    // Every remaining row is still the other workspace's, and none is duplicated.
    const rows = await env.DB.prepare(
      "SELECT workspace_id, meeting_id FROM meeting_items",
    ).all<{ workspace_id: string; meeting_id: string }>();
    expect(rows.results).toHaveLength(5);
    expect(
      rows.results.every(
        (row) =>
          row.workspace_id === OTHER && row.meeting_id === theirMeeting.id,
      ),
    ).toBe(true);
    expect(await duplicatePositionCount()).toBe(0);
  });
});

// --- Test 7 — atomic failure --------------------------------------------------------

describe("AUDIT-FIX-02 — atomicity of an item mutation", () => {
  it("rolls the item row back when the Activity append fails", async () => {
    const context = makeContext(WS);
    const healthy = createMeetingRepository(env.DB, context, {
      clock: new FakeClock().now,
      idGenerator: nextEntityId,
      activityIdGenerator: nextActivityId,
    });
    const meeting = await seedMeeting(healthy);
    const anchor = await healthy.addItem(meeting.id, "agenda", "Anchor");
    const baselineEvents = await countActivitiesOfType(MEETING_UPDATED);

    const faulty = createMeetingRepository(env.DB, context, {
      clock: new FakeClock().now,
      idGenerator: nextEntityId,
      activityIdGenerator: nextActivityId,
      itemFault: "after-domain",
    });
    await expect(
      faulty.addItem(meeting.id, "agenda", "Never committed"),
    ).rejects.toBeTruthy();

    // No item row, no add activity, nothing partially written.
    expect(await itemRowCount()).toBe(1);
    expect(await positionsOfKind(healthy, meeting.id, "agenda")).toEqual([0]);
    expect(await countActivitiesOfType(MEETING_UPDATED)).toBe(baselineEvents);

    // And the failure is typed, not a raw storage error.
    await expect(
      faulty.addItem(meeting.id, "agenda", "Never committed"),
    ).rejects.toBeInstanceOf(MeetingStorageError);

    // The ordinal the failed attempts would have taken is still free.
    const recovered = await healthy.addItem(meeting.id, "agenda", "Committed");
    expect(recovered.position).toBe(anchor.position + 1);
  });

  it("rolls a removal back when its Activity append fails", async () => {
    const context = makeContext(WS);
    const healthy = createMeetingRepository(env.DB, context, {
      clock: new FakeClock().now,
      idGenerator: nextEntityId,
      activityIdGenerator: nextActivityId,
    });
    const meeting = await seedMeeting(healthy);
    const item = await healthy.addItem(meeting.id, "decision", "Keep me");
    const baselineEvents = await countActivitiesOfType(MEETING_UPDATED);

    const faulty = createMeetingRepository(env.DB, context, {
      clock: new FakeClock().now,
      idGenerator: nextEntityId,
      activityIdGenerator: nextActivityId,
      itemFault: "after-domain",
    });
    await expect(faulty.removeItem(meeting.id, item.id)).rejects.toBeTruthy();

    expect(await itemRowCount()).toBe(1);
    expect(await countActivitiesOfType(MEETING_UPDATED)).toBe(baselineEvents);
  });
});

// --- A guard that refuses mid-flight must not read as "already done" ------------------

describe("AUDIT-FIX-02 — the meeting changing under an item mutation", () => {
  it("reports the archive rather than a silent no-op removal", async () => {
    const context = makeContext(WS);
    const repo = repository(WS);
    const meeting = await seedMeeting(repo);
    const item = await repo.addItem(meeting.id, "agenda", "Still here");
    const baselineEvents = await countActivitiesOfType(MEETING_UPDATED);

    // Archive the meeting AFTER `removeItem` has read it but BEFORE its guarded
    // DELETE runs — the two-tab race. Raw SQL, so this seeds the state without
    // adding lifecycle Activity of its own.
    const racing = createMeetingRepository(
      raceDb(() => archiveDirectly(meeting.id)),
      context,
      {
        clock: new FakeClock().now,
        idGenerator: nextEntityId,
        activityIdGenerator: nextActivityId,
      },
    );

    // The guard matched no row. That must NOT be reported as `false` — a caller
    // would read that as "already removed" while the item is still there.
    await expect(racing.removeItem(meeting.id, item.id)).rejects.toBeInstanceOf(
      MeetingArchivedError,
    );
    expect(await itemRowCount()).toBe(1);
    expect(await countActivitiesOfType(MEETING_UPDATED)).toBe(baselineEvents);
  });

  it("reports a meeting deleted mid-flight rather than a silent no-op removal", async () => {
    const context = makeContext(WS);
    const repo = repository(WS);
    const meeting = await seedMeeting(repo);
    const item = await repo.addItem(meeting.id, "decision", "Still here");

    const racing = createMeetingRepository(
      raceDb(() => softDeleteDirectly(meeting.id)),
      context,
      {
        clock: new FakeClock().now,
        idGenerator: nextEntityId,
        activityIdGenerator: nextActivityId,
      },
    );

    await expect(racing.removeItem(meeting.id, item.id)).rejects.toBeInstanceOf(
      MeetingNotFoundError,
    );
    expect(await itemRowCount()).toBe(1);
  });

  it("never reports a removal as done when the archive was reverted before the diagnosis", async () => {
    // The sharpest form of the question: the guard refuses the DELETE because the
    // meeting is archived, and the meeting is RESTORED again before the refusal is
    // diagnosed. A diagnosis that inspected the meeting's later state would see a
    // healthy meeting and answer `false` — "already removed" — while the item is
    // still on it. Reading the ITEM row back is what makes that impossible.
    const context = makeContext(WS);
    const repo = repository(WS);
    const meeting = await seedMeeting(repo);
    const item = await repo.addItem(meeting.id, "agenda", "Still here");
    const baselineEvents = await countActivitiesOfType(MEETING_UPDATED);

    const racing = createMeetingRepository(
      raceDb(
        () => archiveDirectly(meeting.id),
        () => restoreDirectly(meeting.id),
      ),
      context,
      {
        clock: new FakeClock().now,
        idGenerator: nextEntityId,
        activityIdGenerator: nextActivityId,
      },
    );

    await expect(racing.removeItem(meeting.id, item.id)).rejects.toBeInstanceOf(
      MeetingItemConflictError,
    );
    // The item really is still there — which is exactly why `false` would lie.
    expect(await itemRowCount()).toBe(1);
    expect((await repo.get(meeting.id))!.items.map((i) => i.id)).toEqual([
      item.id,
    ]);
    expect(await countActivitiesOfType(MEETING_UPDATED)).toBe(baselineEvents);
  });

  it("never reports an append as done when the archive was reverted before the diagnosis", async () => {
    const context = makeContext(WS);
    const repo = repository(WS);
    const meeting = await seedMeeting(repo);
    const baselineEvents = await countActivitiesOfType(MEETING_UPDATED);

    const racing = createMeetingRepository(
      raceDb(
        () => archiveDirectly(meeting.id),
        () => restoreDirectly(meeting.id),
      ),
      context,
      {
        clock: new FakeClock().now,
        idGenerator: nextEntityId,
        activityIdGenerator: nextActivityId,
      },
    );

    await expect(
      racing.addItem(meeting.id, "decision", "Never committed"),
    ).rejects.toBeInstanceOf(MeetingItemConflictError);
    expect(await itemRowCount()).toBe(0);
    expect(await countActivitiesOfType(MEETING_UPDATED)).toBe(baselineEvents);
  });

  it("still returns a plain false when the item is simply already gone", async () => {
    const repo = repository(WS);
    const meeting = await seedMeeting(repo);
    const item = await repo.addItem(meeting.id, "outcome", "Once");
    expect(await repo.removeItem(meeting.id, item.id)).toBe(true);

    // The meeting is alive and unarchived, so `false` is the truthful answer and
    // no error is raised.
    expect(await repo.removeItem(meeting.id, item.id)).toBe(false);
  });

  it("refuses an append whose meeting is archived mid-flight", async () => {
    const context = makeContext(WS);
    const repo = repository(WS);
    const meeting = await seedMeeting(repo);
    const baselineEvents = await countActivitiesOfType(MEETING_UPDATED);

    const racing = createMeetingRepository(
      raceDb(() => archiveDirectly(meeting.id)),
      context,
      {
        clock: new FakeClock().now,
        idGenerator: nextEntityId,
        activityIdGenerator: nextActivityId,
      },
    );

    await expect(
      racing.addItem(meeting.id, "agenda", "Too late"),
    ).rejects.toBeInstanceOf(MeetingArchivedError);
    expect(await itemRowCount()).toBe(0);
    expect(await countActivitiesOfType(MEETING_UPDATED)).toBe(baselineEvents);
  });
});

// --- Test 8 — concurrency ------------------------------------------------------------

describe("AUDIT-FIX-02 — concurrent same-kind additions", () => {
  it("gives two near-simultaneous adds distinct positions and one event each", async () => {
    const repo = repository(WS);
    const meeting = await seedMeeting(repo);
    const anchor = await repo.addItem(meeting.id, "action", "Anchor");
    const baselineEvents = await countActivitiesOfType(MEETING_UPDATED);

    const [left, right] = await Promise.all([
      repo.addItem(meeting.id, "action", "Left"),
      repo.addItem(meeting.id, "action", "Right"),
    ]);

    // Both committed, at distinct ordinals past the anchor — no raw D1 error, no
    // overwrite of the other user's item.
    expect(left.position).not.toBe(right.position);
    expect(left.position).toBeGreaterThan(anchor.position);
    expect(right.position).toBeGreaterThan(anchor.position);
    expect(await positionsOfKind(repo, meeting.id, "action")).toEqual([
      0, 1, 2,
    ]);
    expect(await duplicatePositionCount()).toBe(0);
    // Exactly one event per committed add — a retry must never double-log.
    expect(await countActivitiesOfType(MEETING_UPDATED)).toBe(
      baselineEvents + 2,
    );
  });

  it("keeps a burst of same-kind adds unique across every kind", async () => {
    const repo = repository(WS);
    const meeting = await seedMeeting(repo);
    const baselineEvents = await countActivitiesOfType(MEETING_UPDATED);

    await Promise.all(
      ALL_KINDS.flatMap((kind) =>
        [0, 1, 2, 3].map((n) => repo.addItem(meeting.id, kind, `${kind} ${n}`)),
      ),
    );

    for (const kind of ALL_KINDS) {
      expect(await positionsOfKind(repo, meeting.id, kind)).toEqual([
        0, 1, 2, 3,
      ]);
    }
    expect(await duplicatePositionCount()).toBe(0);
    expect(await countActivitiesOfType(MEETING_UPDATED)).toBe(
      baselineEvents + 16,
    );
  });
});

// --- Typed failures the caller can act on ---------------------------------------------

describe("AUDIT-FIX-02 — typed item errors", () => {
  it("rejects an unknown kind and an empty body as validation failures", async () => {
    const repo = repository(WS);
    const meeting = await seedMeeting(repo);

    await expect(
      repo.addItem(meeting.id, "nonsense" as MeetingItemKind, "Body"),
    ).rejects.toBeInstanceOf(MeetingValidationError);
    await expect(
      repo.addItem(meeting.id, "agenda", "   "),
    ).rejects.toBeInstanceOf(MeetingValidationError);
    expect(await itemRowCount()).toBe(0);
  });

  it("refuses item mutations on an archived meeting with a named error", async () => {
    const repo = repository(WS);
    const meeting = await seedMeeting(repo);
    const item = await repo.addItem(meeting.id, "agenda", "Before archive");
    await repo.archive(meeting.id);

    await expect(
      repo.addItem(meeting.id, "agenda", "After archive"),
    ).rejects.toBeInstanceOf(MeetingArchivedError);
    await expect(repo.removeItem(meeting.id, item.id)).rejects.toBeInstanceOf(
      MeetingArchivedError,
    );
    expect(await itemRowCount()).toBe(1);
  });

  it("refuses a missing meeting indistinguishably from a foreign one", async () => {
    const repo = repository(WS);
    await expect(
      repo.addItem("no-such-meeting", "agenda", "Body"),
    ).rejects.toBeInstanceOf(MeetingNotFoundError);
    await expect(
      repo.removeItem("no-such-meeting", "no-such-item"),
    ).rejects.toBeInstanceOf(MeetingNotFoundError);
  });
});

// --- Route boundary — the surface the defect was reported through ----------------------

describe("AUDIT-FIX-02 — the meeting mutate route", () => {
  it("returns a normal success for remove-then-add of the same kind", async () => {
    const repo = repository(WS);
    const meeting = await seedMeeting(repo);
    const first = await repo.addItem(meeting.id, "agenda", "One");
    await repo.addItem(meeting.id, "agenda", "Two");
    await repo.addItem(meeting.id, "agenda", "Three");

    const removal = await mutate(meeting.id, {
      intent: "remove_item",
      itemId: first.id,
    });
    expect(removal.status).toBe(200);
    expect(removal.body).toEqual({ ok: true });

    // The request that previously failed with an unhandled storage error.
    const addition = await mutate(meeting.id, {
      intent: "add_item",
      kind: "agenda",
      body: "Four",
    });
    expect(addition.status).toBe(200);
    expect(addition.body).toEqual({ ok: true });
    expect(await positionsOfKind(repo, meeting.id, "agenda")).toEqual([
      1, 2, 3,
    ]);
    expect(await duplicatePositionCount()).toBe(0);
  });

  it.each(ALL_KINDS)(
    "handles remove-then-add through the route for %s items",
    async (kind) => {
      const repo = repository(WS);
      const meeting = await seedMeeting(repo);
      const first = await repo.addItem(meeting.id, kind, "One");
      await repo.addItem(meeting.id, kind, "Two");
      await mutate(meeting.id, { intent: "remove_item", itemId: first.id });

      const addition = await mutate(meeting.id, {
        intent: "add_item",
        kind,
        body: "Three",
      });
      expect(addition.status).toBe(200);
      expect(await positionsOfKind(repo, meeting.id, kind)).toEqual([1, 2]);
    },
  );

  it("answers an expected item failure with a calm, storage-free message", async () => {
    const repo = repository(WS);
    const meeting = await seedMeeting(repo);
    await repo.addItem(meeting.id, "agenda", "Before archive");
    await repo.archive(meeting.id);

    const response = await mutate(meeting.id, {
      intent: "add_item",
      kind: "agenda",
      body: "After archive",
    });

    // A handled, user-legible refusal — never a 5xx, never an unhandled throw.
    expect(response.status).toBe(409);
    expect(response.status).toBeLessThan(500);
    expect(response.body.ok).toBe(false);
    expect(String(response.body.error)).toBe(
      "This meeting is archived — restore it to make changes.",
    );
    // No SQLite/D1 vocabulary anywhere in the response body.
    for (const leak of [
      "UNIQUE",
      "constraint",
      "SQLITE",
      "D1_ERROR",
      "meeting_items",
      "position",
      "INSERT",
      "SELECT",
    ]) {
      expect(response.text).not.toContain(leak);
    }
  });

  it("answers an invalid item kind with a 400 and no storage detail", async () => {
    const repo = repository(WS);
    const meeting = await seedMeeting(repo);

    const response = await mutate(meeting.id, {
      intent: "add_item",
      kind: "nonsense",
      body: "Body",
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      ok: false,
      error: "That change couldn’t be saved.",
    });
    expect(response.text).not.toContain("constraint");
    expect(await itemRowCount()).toBe(0);
  });
});
