import { beforeEach, describe, expect, it } from "vitest";
import { RouterContextProvider } from "react-router";

import type { AuthenticatedSession } from "~/kernel/auth";
import { MEETING_ATTENDEE_LINK, MEETING_HELD } from "~/kernel/meetings";
import { setAuthenticatedSession } from "~/platform/request";
import { action as meetingMutate } from "~/modules/meetings/routes/mutate";
import type { MarkHeldResponse } from "~/modules/meetings/routes/mutate";
import { action as createPersonAction } from "~/modules/people/routes/create";
import type { CreatePersonResult } from "~/modules/people/routes/create";
import { loader as personActivityLoader } from "~/modules/people/routes/activity";
import type { PersonActivityPage } from "~/modules/people/person-activity";

import {
  countActivitiesOfType,
  makeContext,
  makeLinkRepository,
  makeMeetingRepository,
  resetTables,
} from "./support";

/**
 * MEET-03 — the route boundary for "Mark as held", and the proof that the event
 * reaches the attendee's EXISTING Person Activity endpoint through its existing
 * path (no new endpoint, no People-module change).
 *
 * Real Workers/D1 integration tests over the actual route handlers: authenticated
 * workspace derivation, valid/invalid intents, the archived refusal, calm errors,
 * the impossibility of steering the event's subjects from the request body, and
 * end-to-end appearance (and non-appearance) on the right Person's timeline.
 */

const WS = "test-default-workspace";
const OTHER = "ws_meeting_held_route_other";
const CTX = makeContext(WS);
const CTX_OTHER = makeContext(OTHER);
const START = "2026-07-27T09:00:00.000Z";

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

async function createPerson(name: string): Promise<string> {
  const body = new FormData();
  body.set("title", name);
  const response = (await createPersonAction({
    request: new Request("https://app.test/people/create", {
      method: "POST",
      body,
    }),
    context: authedContext(),
    params: {},
  } as unknown as Parameters<typeof createPersonAction>[0])) as Response;
  const data = (await response.json()) as CreatePersonResult;
  if (!data.ok) throw new Error("create person failed");
  return data.personId;
}

async function mutate(
  meetingId: string,
  fields: Record<string, string>,
): Promise<{ status: number; body: Record<string, unknown> }> {
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
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  };
}

async function readPersonTimeline(
  personId: string,
): Promise<PersonActivityPage> {
  const response = (await personActivityLoader({
    request: new Request(`https://app.test/person/${personId}/activity`),
    context: authedContext(),
    params: { personId },
  } as unknown as Parameters<typeof personActivityLoader>[0])) as Response;
  return (await response.json()) as PersonActivityPage;
}

describe("POST /meeting/:meetingId/mutate — mark_held", () => {
  let meetings: ReturnType<typeof makeMeetingRepository>;
  let links: ReturnType<typeof makeLinkRepository>;

  beforeEach(async () => {
    await resetTables([WS, OTHER]);
    meetings = makeMeetingRepository(CTX);
    links = makeLinkRepository(CTX);
  });

  it("records the meeting as held for the authenticated workspace", async () => {
    const meeting = await meetings.create({
      title: "Weekly sync",
      startsAt: START,
      timezone: "UTC",
    });
    const personId = await createPerson("Ada");
    await links.create({
      sourceEntityId: meeting.id,
      targetEntityId: personId,
      type: MEETING_ATTENDEE_LINK,
    });

    const { status, body } = await mutate(meeting.id, { intent: "mark_held" });

    expect(status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      outcome: "recorded",
      attendeeCount: 1,
      attendeesRecorded: 1,
    });
    expect(typeof (body as unknown as MarkHeldResponse).heldAt).toBe("string");
    expect(await countActivitiesOfType(MEETING_HELD)).toBe(1);
  });

  it("is idempotent over the route: a second submission adds no event", async () => {
    const meeting = await meetings.create({
      title: "Weekly sync",
      startsAt: START,
      timezone: "UTC",
    });

    const first = await mutate(meeting.id, { intent: "mark_held" });
    const second = await mutate(meeting.id, { intent: "mark_held" });

    expect(first.body.outcome).toBe("recorded");
    expect(second.status).toBe(200);
    expect(second.body.outcome).toBe("already_held");
    expect(second.body.heldAt).toBe(first.body.heldAt);
    expect(await countActivitiesOfType(MEETING_HELD)).toBe(1);
  });

  it("CANNOT be steered by crafted attendee ids in the submission", async () => {
    const meeting = await meetings.create({
      title: "Weekly sync",
      startsAt: START,
      timezone: "UTC",
    });
    const real = await createPerson("Real attendee");
    const outsider = await createPerson("Outsider");
    await links.create({
      sourceEntityId: meeting.id,
      targetEntityId: real.valueOf(),
      type: MEETING_ATTENDEE_LINK,
    });

    // Every plausible injection vector, all at once. None is read.
    const { status, body } = await mutate(meeting.id, {
      intent: "mark_held",
      personId: outsider,
      attendees: `${outsider},${real}`,
      attendeeIds: outsider,
      subjects: outsider,
      workspaceId: OTHER,
    });

    expect(status).toBe(200);
    expect(body.attendeeCount).toBe(1);

    // The outsider's own timeline never receives it.
    const outsiderPage = await readPersonTimeline(outsider);
    expect(outsiderPage.items.some((i) => i.type === MEETING_HELD)).toBe(false);
    const realPage = await readPersonTimeline(real);
    expect(realPage.items.some((i) => i.type === MEETING_HELD)).toBe(true);
  });

  it("refuses an ARCHIVED meeting calmly, and writes nothing", async () => {
    const meeting = await meetings.create({
      title: "Weekly sync",
      startsAt: START,
      timezone: "UTC",
    });
    await meetings.archive(meeting.id);

    const { status, body } = await mutate(meeting.id, { intent: "mark_held" });

    expect(status).toBe(409);
    expect(body.ok).toBe(false);
    expect(String(body.error)).toMatch(/archived/i);
    expect(await countActivitiesOfType(MEETING_HELD)).toBe(0);
  });

  it("404s for an unknown meeting and discloses nothing", async () => {
    let thrown: unknown;
    try {
      await mutate("no-such-meeting", { intent: "mark_held" });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(404);
    expect(await countActivitiesOfType(MEETING_HELD)).toBe(0);
  });

  it("404s across workspaces without revealing the meeting exists", async () => {
    const theirs = makeMeetingRepository(CTX_OTHER);
    const meeting = await theirs.create({
      title: "Their meeting",
      startsAt: START,
      timezone: "UTC",
    });

    let thrown: unknown;
    try {
      await mutate(meeting.id, { intent: "mark_held" });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(404);
    expect(await countActivitiesOfType(MEETING_HELD)).toBe(0);
  });

  it("treats an unknown intent as an ordinary detail update, not a held action", async () => {
    const meeting = await meetings.create({
      title: "Weekly sync",
      startsAt: START,
      timezone: "UTC",
    });

    const { status, body } = await mutate(meeting.id, { intent: "mark_HELD" });

    expect(status).toBe(200);
    // HARDEN-06B (F-01) — still exactly `{ ok: true }`: this submission changed
    // nothing, so there is no version it produced to hand back. A response that
    // grew a `detailsUpdatedAt` here would be offering the caller a version
    // some other writer wrote.
    expect(body).toEqual({ ok: true });
    expect(await countActivitiesOfType(MEETING_HELD)).toBe(0);
    expect((await meetings.get(meeting.id))?.heldAt).toBeNull();
  });

  it("rejects a non-POST request", async () => {
    const meeting = await meetings.create({
      title: "Weekly sync",
      startsAt: START,
      timezone: "UTC",
    });
    let thrown: unknown;
    try {
      await meetingMutate({
        request: new Request(`https://app.test/meeting/${meeting.id}/mutate`, {
          method: "GET",
        }),
        context: authedContext(),
        params: { meetingId: meeting.id },
      } as unknown as Parameters<typeof meetingMutate>[0]);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(405);
  });
});

describe("MEET-03 → the EXISTING Person Activity endpoint", () => {
  let meetings: ReturnType<typeof makeMeetingRepository>;
  let links: ReturnType<typeof makeLinkRepository>;

  beforeEach(async () => {
    await resetTables([WS, OTHER]);
    meetings = makeMeetingRepository(CTX);
    links = makeLinkRepository(CTX);
  });

  it("serves the event to the attendee and NOT to an unrelated Person", async () => {
    const meeting = await meetings.create({
      title: "Quarterly catch-up",
      startsAt: START,
      timezone: "UTC",
    });
    const attendee = await createPerson("Ada");
    const unrelated = await createPerson("Grace");
    await links.create({
      sourceEntityId: meeting.id,
      targetEntityId: attendee,
      type: MEETING_ATTENDEE_LINK,
    });

    await mutate(meeting.id, { intent: "mark_held" });

    const attendeePage = await readPersonTimeline(attendee);
    const held = attendeePage.items.find((i) => i.type === MEETING_HELD);
    expect(held).toBeDefined();
    // Labelled from the FND-06 module registry — the Meetings manifest's label,
    // rendered through DS-05's calm registry-derived default line.
    expect(
      held?.presentation.segments.some(
        (segment) =>
          segment.kind === "emphasis" && segment.text === "Meeting held",
      ),
    ).toBe(true);
    expect(held?.isKnownType).toBe(true);
    // Navigable to the canonical Meeting record, by reference.
    expect(held?.subjects.map((s) => s.entityId)).toContain(meeting.id);
    expect(
      held?.subjects.find((s) => s.entityId === meeting.id)?.entity?.label,
    ).toBe("Quarterly catch-up");

    const unrelatedPage = await readPersonTimeline(unrelated);
    expect(unrelatedPage.items.some((i) => i.type === MEETING_HELD)).toBe(
      false,
    );
  });

  it("renders NO payload metadata, and leaks no private meeting content", async () => {
    const meeting = await meetings.create({
      title: "Board review",
      startsAt: START,
      timezone: "Australia/Brisbane",
      agendaMarkdown: "Confidential agenda",
    });
    await meetings.update(meeting.id, { notesMarkdown: "Private notes" });
    const attendee = await createPerson("Ada");
    await links.create({
      sourceEntityId: meeting.id,
      targetEntityId: attendee,
      type: MEETING_ATTENDEE_LINK,
    });

    await mutate(meeting.id, { intent: "mark_held" });

    const page = await readPersonTimeline(attendee);
    const held = page.items.find((i) => i.type === MEETING_HELD)!;
    // A registry-derived descriptor has a label but no `describe`, so DS-05
    // RENDERS no payload metadata at all — the privacy boundary PEOPLE-02
    // established. Nothing from the payload reaches the visible line.
    expect(held.presentation.metadata ?? []).toEqual([]);
    for (const segment of held.presentation.segments) {
      if (segment.kind === "text" || segment.kind === "emphasis") {
        expect(segment.text).not.toMatch(/mark_held|attendee[CR]|Brisbane/);
      }
    }

    // The PEOPLE-02 page shape carries each event's raw `payload` alongside its
    // presentation (it does so for EVERY module's events, not just these). That is
    // exactly why a Meeting payload must stay structural: assert the whole
    // serialized page is free of private meeting content and Person detail.
    const serialized = JSON.stringify(page);
    for (const secret of [
      "Confidential agenda",
      "Private notes",
      "agendaMarkdown",
      "notesMarkdown",
    ]) {
      expect(serialized).not.toContain(secret);
    }
    // What IS present is only the structural metadata MEET-03 declares.
    expect(held.payload).toEqual({
      source: "mark_held",
      startsAt: START,
      timezone: "Australia/Brisbane",
      attendeeCount: 1,
      attendeesRecorded: 1,
    });
  });

  it("stays on the attendee's timeline after the attendee link is REMOVED", async () => {
    const meeting = await meetings.create({
      title: "One-off chat",
      startsAt: START,
      timezone: "UTC",
    });
    const attendee = await createPerson("Ada");
    const link = await links.create({
      sourceEntityId: meeting.id,
      targetEntityId: attendee,
      type: MEETING_ATTENDEE_LINK,
    });

    await mutate(meeting.id, { intent: "mark_held" });
    await links.unlink(link.link.id);

    // The Person is a SUBJECT of the event in their own right, so unlinking the
    // relationship (which removes the Meeting from the anchor set) does not erase
    // the interaction from their history.
    const page = await readPersonTimeline(attendee);
    expect(page.items.some((i) => i.type === MEETING_HELD)).toBe(true);
    expect(page.relatedRecordCount).toBe(0);
  });

  it("stays readable when the meeting is later archived or soft-deleted", async () => {
    const meeting = await meetings.create({
      title: "Retro",
      startsAt: START,
      timezone: "UTC",
    });
    const attendee = await createPerson("Ada");
    await links.create({
      sourceEntityId: meeting.id,
      targetEntityId: attendee,
      type: MEETING_ATTENDEE_LINK,
    });
    await mutate(meeting.id, { intent: "mark_held" });

    await meetings.archive(meeting.id);
    expect(
      (await readPersonTimeline(attendee)).items.some(
        (i) => i.type === MEETING_HELD,
      ),
    ).toBe(true);
  });
});
