import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import {
  MAX_MEETING_HELD_ATTENDEE_SUBJECTS,
  MEETING_ATTENDEE_LINK,
  MEETING_ATTENDEE_SUBJECT_ROLE,
  MEETING_HELD,
  MeetingArchivedError,
  MeetingNotFoundError,
} from "~/kernel/meetings";

import {
  FakeClock,
  countActivitiesOfType,
  latestActivityPayload,
  makeActivityRepository,
  makeContext,
  makeLinkRepository,
  makeMeetingRepository,
  makePersonRepository,
  makeRepository,
  resetTables,
  sequentialIds,
} from "./support";

/**
 * MEET-03 — `meeting.held`: the meaning-specific interaction event that gives a
 * Meeting a truthful place on every attendee's EXISTING Person Activity timeline.
 *
 * These are real Workers/D1 integration tests over the production repository and
 * the committed migrations. They prove the properties the feature actually rests
 * on: exactly one event, the right subjects, server-derived attendees, idempotency
 * and concurrency safety, workspace isolation, lifecycle handling, atomic rollback
 * and a payload free of private meeting content.
 */

const WS = "ws_meeting_held";
const OTHER = "ws_meeting_held_other";
const CTX = makeContext(WS);
const CTX_OTHER = makeContext(OTHER);
const START = "2026-07-27T09:00:00.000Z";

const nextEntityId = sequentialIds("ent");
const nextActivityId = sequentialIds("act");

function repos(context = CTX) {
  const shared = {
    clock: new FakeClock().now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  };
  return {
    meetings: makeMeetingRepository(context, shared),
    people: makePersonRepository(context, shared),
    links: makeLinkRepository(context, shared),
    entities: makeRepository(context, shared),
    activity: makeActivityRepository(context),
  };
}

type Repos = ReturnType<typeof repos>;

async function seedMeeting(r: Repos, title = "Weekly sync") {
  return r.meetings.create({ title, startsAt: START, timezone: "UTC" });
}

async function seedPerson(r: Repos, title = "Ada Lovelace") {
  return r.people.create({ title });
}

async function attend(r: Repos, meetingId: string, personId: string) {
  return r.links.create({
    sourceEntityId: meetingId,
    targetEntityId: personId,
    type: MEETING_ATTENDEE_LINK,
  });
}

/** The subject rows of the ONE `meeting.held` event, read straight from D1. */
async function heldSubjects(): Promise<{ entity_id: string; role: string }[]> {
  const result = await env.DB.prepare(
    `SELECT s.entity_id, s.role
       FROM activity_subjects s
       JOIN activities a ON a.workspace_id = s.workspace_id AND a.id = s.activity_id
      WHERE a.type = ?
      ORDER BY s.role, s.entity_id`,
  )
    .bind(MEETING_HELD)
    .all<{ entity_id: string; role: string }>();
  return result.results;
}

async function heldColumn(meetingId: string): Promise<string | null> {
  const row = await env.DB.prepare(
    "SELECT held_at FROM meeting_details WHERE entity_id = ?",
  )
    .bind(meetingId)
    .first<{ held_at: string | null }>();
  return row?.held_at ?? null;
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

describe("MEET-03 — marking a meeting as held", () => {
  it("records ONE event naming the meeting and every active attendee as subjects", async () => {
    const r = repos();
    const meeting = await seedMeeting(r);
    const ada = await seedPerson(r, "Ada");
    const grace = await seedPerson(r, "Grace");
    await attend(r, meeting.id, ada.id);
    await attend(r, meeting.id, grace.id);

    const result = await r.meetings.markHeld(meeting.id);

    expect(result.outcome).toBe("recorded");
    expect(result.attendeeCount).toBe(2);
    expect(result.attendeesRecorded).toBe(2);
    expect(await countActivitiesOfType(MEETING_HELD)).toBe(1);

    const subjects = await heldSubjects();
    expect(subjects).toEqual([
      { entity_id: ada.id, role: MEETING_ATTENDEE_SUBJECT_ROLE },
      { entity_id: grace.id, role: MEETING_ATTENDEE_SUBJECT_ROLE },
      { entity_id: meeting.id, role: "subject" },
    ]);
  });

  it("is ONE multi-subject event, not one copy per attendee", async () => {
    const r = repos();
    const meeting = await seedMeeting(r);
    for (const name of ["A", "B", "C"]) {
      const person = await seedPerson(r, name);
      await attend(r, meeting.id, person.id);
    }

    await r.meetings.markHeld(meeting.id);

    expect(await countActivitiesOfType(MEETING_HELD)).toBe(1);
    expect(await heldSubjects()).toHaveLength(4); // 3 attendees + the meeting
  });

  it("does NOT name people who were never attendees", async () => {
    const r = repos();
    const meeting = await seedMeeting(r);
    const attendee = await seedPerson(r, "Attendee");
    const bystander = await seedPerson(r, "Bystander");
    await attend(r, meeting.id, attendee.id);

    await r.meetings.markHeld(meeting.id);

    const ids = (await heldSubjects()).map((s) => s.entity_id);
    expect(ids).toContain(attendee.id);
    expect(ids).not.toContain(bystander.id);

    // The unrelated Person's own stream never sees the event either.
    const page = await r.activity.listForEntity(bystander.id);
    expect(page.items.some((e) => e.type === MEETING_HELD)).toBe(false);
  });

  it("puts the event on the attendee's OWN activity stream", async () => {
    const r = repos();
    const meeting = await seedMeeting(r);
    const person = await seedPerson(r);
    await attend(r, meeting.id, person.id);

    await r.meetings.markHeld(meeting.id);

    const page = await r.activity.listForEntity(person.id);
    const held = page.items.find((e) => e.type === MEETING_HELD);
    expect(held).toBeDefined();
    // The one event carries ALL its subjects, so a reader can name the meeting.
    expect(held?.subjects.map((s) => s.entityId)).toContain(meeting.id);
  });

  it("records a meeting with NO attendees as an honest meeting-only event", async () => {
    const r = repos();
    const meeting = await seedMeeting(r);

    const result = await r.meetings.markHeld(meeting.id);

    expect(result.outcome).toBe("recorded");
    expect(result.attendeeCount).toBe(0);
    expect(await countActivitiesOfType(MEETING_HELD)).toBe(1);
    expect(await heldSubjects()).toEqual([
      { entity_id: meeting.id, role: "subject" },
    ]);
  });
});

describe("MEET-03 — attendee derivation is server-side and honest", () => {
  it("excludes an attendee UNLINKED before the meeting was marked held", async () => {
    const r = repos();
    const meeting = await seedMeeting(r);
    const stayed = await seedPerson(r, "Stayed");
    const left = await seedPerson(r, "Left");
    await attend(r, meeting.id, stayed.id);
    const leftLink = await attend(r, meeting.id, left.id);
    await r.links.unlink(leftLink.link.id);

    const result = await r.meetings.markHeld(meeting.id);

    expect(result.attendeeCount).toBe(1);
    const ids = (await heldSubjects()).map((s) => s.entity_id);
    expect(ids).not.toContain(left.id);
  });

  it("does NOT retroactively add an attendee linked AFTER it was marked held", async () => {
    const r = repos();
    const meeting = await seedMeeting(r);
    const first = await seedPerson(r, "First");
    await attend(r, meeting.id, first.id);
    await r.meetings.markHeld(meeting.id);

    const late = await seedPerson(r, "Late");
    await attend(r, meeting.id, late.id);

    // The event is a historical fact: the subject set is the attendee set as at
    // the moment it was recorded, and nothing rewrites it.
    const ids = (await heldSubjects()).map((s) => s.entity_id);
    expect(ids).toContain(first.id);
    expect(ids).not.toContain(late.id);
    expect(await countActivitiesOfType(MEETING_HELD)).toBe(1);
  });

  it("keeps a recorded attendee subject when the Person is later soft-deleted", async () => {
    const r = repos();
    const meeting = await seedMeeting(r);
    const person = await seedPerson(r);
    await attend(r, meeting.id, person.id);
    await r.meetings.markHeld(meeting.id);

    await r.entities.softDelete(person.id);

    const ids = (await heldSubjects()).map((s) => s.entity_id);
    expect(ids).toContain(person.id);
    // The Person's own history stays readable (the kernel allows a deleted anchor).
    const page = await r.activity.listForEntity(person.id);
    expect(page.items.some((e) => e.type === MEETING_HELD)).toBe(true);
  });

  it("excludes an attendee whose Person was soft-deleted BEFORE it was marked held", async () => {
    const r = repos();
    const meeting = await seedMeeting(r);
    const gone = await seedPerson(r, "Gone");
    await attend(r, meeting.id, gone.id);
    await r.entities.softDelete(gone.id);

    const result = await r.meetings.markHeld(meeting.id);

    expect(result.attendeeCount).toBe(0);
    expect(await heldSubjects()).toEqual([
      { entity_id: meeting.id, role: "subject" },
    ]);
  });

  it("ignores an attendee-typed link whose target is NOT a person", async () => {
    const r = repos();
    const meeting = await seedMeeting(r);
    const person = await seedPerson(r);
    await attend(r, meeting.id, person.id);
    // A crafted link written straight to the kernel (which enforces endpoint
    // existence but not entity TYPE) must never become an Activity subject.
    const note = await r.entities.create({
      type: "note",
      title: "Not a person",
    });
    await r.links.create({
      sourceEntityId: meeting.id,
      targetEntityId: note.id,
      type: MEETING_ATTENDEE_LINK,
    });

    const result = await r.meetings.markHeld(meeting.id);

    expect(result.attendeeCount).toBe(1);
    const ids = (await heldSubjects()).map((s) => s.entity_id);
    expect(ids).not.toContain(note.id);
  });

  it("bounds the subject list and DISCLOSES the truncation rather than hiding it", async () => {
    const r = repos();
    const meeting = await seedMeeting(r);
    const total = MAX_MEETING_HELD_ATTENDEE_SUBJECTS + 2;
    for (let i = 0; i < total; i += 1) {
      const person = await seedPerson(r, `Attendee ${i}`);
      await attend(r, meeting.id, person.id);
    }

    const result = await r.meetings.markHeld(meeting.id);

    expect(result.attendeesRecorded).toBe(MAX_MEETING_HELD_ATTENDEE_SUBJECTS);
    // The TRUE total, not the bounded scan's row count — a caller must be able to
    // tell 33 attendees from 300, so the count must never saturate at the cap.
    expect(result.attendeeCount).toBe(total);
    const payload = JSON.parse(
      (await latestActivityPayload(MEETING_HELD)) ?? "{}",
    ) as Record<string, unknown>;
    expect(payload.attendeeCount).toBe(total);
    expect(payload.attendeesRecorded).toBe(MAX_MEETING_HELD_ATTENDEE_SUBJECTS);
    expect(payload.attendeesTruncated).toBe(true);
    // And only the capped number of Person subjects were actually written.
    expect(await heldSubjects()).toHaveLength(
      MAX_MEETING_HELD_ATTENDEE_SUBJECTS + 1,
    );
  });

  it("reports the true total for a meeting far beyond the cap", async () => {
    const r = repos();
    const meeting = await seedMeeting(r);
    const total = MAX_MEETING_HELD_ATTENDEE_SUBJECTS + 17;
    for (let i = 0; i < total; i += 1) {
      const person = await seedPerson(r, `Crowd ${i}`);
      await attend(r, meeting.id, person.id);
    }

    const result = await r.meetings.markHeld(meeting.id);

    expect(result.attendeeCount).toBe(total);
    expect(result.attendeesRecorded).toBe(MAX_MEETING_HELD_ATTENDEE_SUBJECTS);
  });
});

describe("MEET-03 — idempotency, concurrency and atomicity", () => {
  it("reports the ORIGINAL counts on a retry, even after attendees changed", async () => {
    const r = repos();
    const meeting = await seedMeeting(r);
    const ada = await seedPerson(r, "Ada");
    const grace = await seedPerson(r, "Grace");
    const adaLink = await attend(r, meeting.id, ada.id);
    await attend(r, meeting.id, grace.id);

    const first = await r.meetings.markHeld(meeting.id);
    expect(first.attendeeCount).toBe(2);

    // Churn the attendee links AFTER the fact: remove one, add two more.
    await r.links.unlink(adaLink.link.id);
    for (const name of ["Later A", "Later B"]) {
      const person = await seedPerson(r, name);
      await attend(r, meeting.id, person.id);
    }

    const retry = await r.meetings.markHeld(meeting.id);

    // The result describes the MOMENT IT WAS MARKED HELD, per the contract — not
    // the current links (which now total 3). Otherwise a retry would report facts
    // that contradict the immutable event.
    expect(retry.outcome).toBe("already_held");
    expect(retry.heldAt.toISOString()).toBe(first.heldAt.toISOString());
    expect(retry.attendeeCount).toBe(2);
    expect(retry.attendeesRecorded).toBe(2);
    expect(await countActivitiesOfType(MEETING_HELD)).toBe(1);
  });

  it("is idempotent: a repeated call writes nothing and reports already_held", async () => {
    const r = repos();
    const meeting = await seedMeeting(r);
    const person = await seedPerson(r);
    await attend(r, meeting.id, person.id);

    const first = await r.meetings.markHeld(meeting.id);
    const second = await r.meetings.markHeld(meeting.id);
    const third = await r.meetings.markHeld(meeting.id);

    expect(first.outcome).toBe("recorded");
    expect(second.outcome).toBe("already_held");
    expect(third.outcome).toBe("already_held");
    // The original instant is reported back, not a fresh one.
    expect(second.heldAt.toISOString()).toBe(first.heldAt.toISOString());
    expect(await countActivitiesOfType(MEETING_HELD)).toBe(1);
  });

  it("cannot create a duplicate event under CONCURRENT submissions", async () => {
    const r = repos();
    const meeting = await seedMeeting(r);
    const person = await seedPerson(r);
    await attend(r, meeting.id, person.id);

    const results = await Promise.all([
      r.meetings.markHeld(meeting.id),
      r.meetings.markHeld(meeting.id),
      r.meetings.markHeld(meeting.id),
      r.meetings.markHeld(meeting.id),
    ]);

    // Exactly one writer wins; every loser reports the truth, and there is still
    // exactly ONE event with ONE meeting subject and ONE attendee subject.
    expect(results.filter((x) => x.outcome === "recorded")).toHaveLength(1);
    expect(await countActivitiesOfType(MEETING_HELD)).toBe(1);
    expect(await heldSubjects()).toHaveLength(2);
  });

  it("rolls the domain mutation back when the Activity append fails", async () => {
    const r = repos();
    const meeting = await seedMeeting(r);
    const person = await seedPerson(r);
    await attend(r, meeting.id, person.id);

    const faulty = makeMeetingRepository(CTX, {
      activityIdGenerator: nextActivityId,
      activityFault: "after-activity",
    });
    await expect(faulty.markHeld(meeting.id)).rejects.toBeTruthy();

    // Neither the state nor the event survives — "held" and its event are one fact.
    expect(await heldColumn(meeting.id)).toBeNull();
    expect(await countActivitiesOfType(MEETING_HELD)).toBe(0);
    expect((await r.meetings.get(meeting.id))?.heldAt).toBeNull();

    // And a clean retry still works.
    const retried = await r.meetings.markHeld(meeting.id);
    expect(retried.outcome).toBe("recorded");
    expect(await countActivitiesOfType(MEETING_HELD)).toBe(1);
  });

  it("writes the held state and the event together", async () => {
    const r = repos();
    const meeting = await seedMeeting(r);

    const result = await r.meetings.markHeld(meeting.id);

    expect(await heldColumn(meeting.id)).toBe(result.heldAt.toISOString());
    expect((await r.meetings.get(meeting.id))?.heldAt?.toISOString()).toBe(
      result.heldAt.toISOString(),
    );
  });
});

describe("MEET-03 — lifecycle and isolation fail closed", () => {
  it("refuses an ARCHIVED meeting and writes nothing", async () => {
    const r = repos();
    const meeting = await seedMeeting(r);
    await r.meetings.archive(meeting.id);

    await expect(r.meetings.markHeld(meeting.id)).rejects.toBeInstanceOf(
      MeetingArchivedError,
    );
    expect(await countActivitiesOfType(MEETING_HELD)).toBe(0);
    expect(await heldColumn(meeting.id)).toBeNull();
  });

  it("refuses a SOFT-DELETED meeting", async () => {
    const r = repos();
    const meeting = await seedMeeting(r);
    await r.entities.softDelete(meeting.id);

    await expect(r.meetings.markHeld(meeting.id)).rejects.toBeInstanceOf(
      MeetingNotFoundError,
    );
    expect(await countActivitiesOfType(MEETING_HELD)).toBe(0);
  });

  it("refuses an unknown id and a WRONG-TYPE id identically", async () => {
    const r = repos();
    const note = await r.entities.create({
      type: "note",
      title: "Not a meeting",
    });

    await expect(r.meetings.markHeld("no-such-id")).rejects.toBeInstanceOf(
      MeetingNotFoundError,
    );
    await expect(r.meetings.markHeld(note.id)).rejects.toBeInstanceOf(
      MeetingNotFoundError,
    );
    expect(await countActivitiesOfType(MEETING_HELD)).toBe(0);
  });

  it("cannot mark a meeting held ACROSS workspaces", async () => {
    const mine = repos();
    const theirs = repos(CTX_OTHER);
    const meeting = await seedMeeting(theirs, "Their meeting");

    await expect(mine.meetings.markHeld(meeting.id)).rejects.toBeInstanceOf(
      MeetingNotFoundError,
    );
    expect(await countActivitiesOfType(MEETING_HELD)).toBe(0);
  });

  it("never names an attendee from ANOTHER workspace", async () => {
    const mine = repos();
    const theirs = repos(CTX_OTHER);
    const meeting = await seedMeeting(mine);
    const mineAttendee = await seedPerson(mine, "Mine");
    await attend(mine, meeting.id, mineAttendee.id);
    const foreign = await seedPerson(theirs, "Foreign");
    // A hand-written cross-workspace link is impossible at the database (the
    // composite endpoint FK), which is exactly the guarantee being relied on.
    await expect(
      env.DB.prepare(
        `INSERT INTO entity_links
           (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
      )
        .bind(
          "crafted-link",
          WS,
          meeting.id,
          foreign.id,
          MEETING_ATTENDEE_LINK,
          START,
          START,
        )
        .run(),
    ).rejects.toBeTruthy();

    const result = await mine.meetings.markHeld(meeting.id);

    expect(result.attendeeCount).toBe(1);
    const ids = (await heldSubjects()).map((s) => s.entity_id);
    expect(ids).not.toContain(foreign.id);
  });

  it("keeps the event readable after the meeting is later archived or deleted", async () => {
    const r = repos();
    const meeting = await seedMeeting(r);
    const person = await seedPerson(r);
    await attend(r, meeting.id, person.id);
    await r.meetings.markHeld(meeting.id);

    await r.meetings.archive(meeting.id);
    expect(await countActivitiesOfType(MEETING_HELD)).toBe(1);
    await expect(r.meetings.markHeld(meeting.id)).rejects.toBeInstanceOf(
      MeetingArchivedError,
    );

    await r.meetings.restore(meeting.id);
    await r.entities.softDelete(meeting.id);
    // Activity is append-only: the attendee keeps the interaction in their history.
    const page = await r.activity.listForEntity(person.id);
    expect(page.items.some((e) => e.type === MEETING_HELD)).toBe(true);
  });
});

describe("MEET-03 — privacy", () => {
  it("carries structural metadata ONLY — never meeting content or Person detail", async () => {
    const r = repos();
    const meeting = await r.meetings.create({
      title: "Board review",
      startsAt: START,
      timezone: "Australia/Brisbane",
      location: "Level 4, secret room",
      agendaMarkdown: "## Confidential agenda\nSalary review for Ada.",
    });
    await r.meetings.update(meeting.id, {
      notesMarkdown: "Private notes: Ada is unhappy.",
    });
    await r.meetings.addItem(meeting.id, "decision", "Give Ada a raise");
    await r.meetings.addItem(meeting.id, "outcome", "Ada accepted");
    const person = await r.people.create({
      title: "Ada Lovelace",
      email: "ada@example.com",
      mobile: "+61400000000",
      notes: "Loves analytical engines",
    });
    await attend(r, meeting.id, person.id);

    await r.meetings.markHeld(meeting.id);

    const raw = (await latestActivityPayload(MEETING_HELD)) ?? "";
    const payload = JSON.parse(raw) as Record<string, unknown>;

    // Exactly the structural keys, and nothing else.
    expect(Object.keys(payload).sort()).toEqual([
      "attendeeCount",
      "attendeesRecorded",
      "source",
      "startsAt",
      "timezone",
    ]);
    expect(payload).toMatchObject({
      source: "mark_held",
      timezone: "Australia/Brisbane",
      attendeeCount: 1,
      attendeesRecorded: 1,
    });

    for (const secret of [
      "Confidential agenda",
      "Salary",
      "Private notes",
      "raise",
      "accepted",
      "secret room",
      "Ada",
      "ada@example.com",
      "+61400000000",
      "analytical engines",
      "Board review",
    ]) {
      expect(raw).not.toContain(secret);
    }
  });
});
