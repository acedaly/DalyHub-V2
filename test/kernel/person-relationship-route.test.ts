import { beforeEach, describe, expect, it } from "vitest";
import { RouterContextProvider } from "react-router";

import type { AuthenticatedSession } from "~/kernel/auth";
import { setAuthenticatedSession } from "~/platform/request";
import { loader as detailLoader } from "~/modules/people/routes/detail";
import { loader as peopleLoader } from "~/modules/people/routes/index";
import { loader as archivedLoader } from "~/modules/people/routes/archived";
import { action as createAction } from "~/modules/people/routes/create";
import type { CreatePersonResult } from "~/modules/people/routes/create";
import { action as mutateAction } from "~/modules/people/routes/mutate";

import {
  makeContext,
  makeLinkRepository,
  makeMeetingRepository,
  makeRepository,
  resetTables,
} from "./support";

/**
 * PEOPLE-03 — the relationship as the Person record and collection actually serve
 * it, over real Workers/D1.
 *
 * These tests exercise the LOADERS, not the repository: that the record's derived
 * relationship reflects live links, that the collection attaches its signal from
 * ONE batched read, that an archived Person is deliberately left unsignalled, and
 * that nothing private about a linked record crosses the boundary.
 */

const WS = "test-default-workspace";
const CTX = makeContext(WS);

function sessionFor(subject = "owner-subject"): AuthenticatedSession {
  return {
    user: { subject, email: "owner@example.com" },
    issuedAt: new Date(0),
    expiresAt: new Date(Date.parse("2999-01-01")),
  };
}

function authedContext(): RouterContextProvider {
  const context = new RouterContextProvider();
  setAuthenticatedSession(context, sessionFor());
  return context;
}

async function createPerson(name: string): Promise<string> {
  const body = new FormData();
  body.set("title", name);
  const response = (await createAction({
    request: new Request("https://app.test/people/create", {
      method: "POST",
      body,
    }),
    context: authedContext(),
    params: {},
  } as unknown as Parameters<typeof createAction>[0])) as Response;
  const data = (await response.json()) as CreatePersonResult;
  if (!data.ok) throw new Error("create failed");
  return data.personId;
}

async function readPerson(personId: string) {
  return detailLoader({
    request: new Request(`https://app.test/person/${personId}`),
    context: authedContext(),
    params: { personId },
  } as unknown as Parameters<typeof detailLoader>[0]);
}

async function readCollection() {
  return peopleLoader({
    request: new Request("https://app.test/people"),
    context: authedContext(),
    params: {},
  } as unknown as Parameters<typeof peopleLoader>[0]);
}

async function archivePerson(personId: string): Promise<void> {
  const body = new FormData();
  body.set("intent", "archive");
  await mutateAction({
    request: new Request(`https://app.test/person/${personId}/mutate`, {
      method: "POST",
      body,
    }),
    context: authedContext(),
    params: { personId },
  } as unknown as Parameters<typeof mutateAction>[0]);
}

beforeEach(async () => {
  await resetTables([WS]);
});

describe("GET /person/:personId — the derived relationship", () => {
  it("serves the honest zero relationship for a brand-new Person", async () => {
    const personId = await createPerson("Ada Lovelace");
    const { relationship } = await readPerson(personId);

    expect(relationship.personId).toBe(personId);
    expect(relationship.state).toBe("no_history");
    expect(relationship.summary.totalInteractions).toBe(0);
    expect(relationship.summary.sharedRecords).toBe(0);
    expect(relationship.cadence.daysSinceLastInteraction).toBeNull();
    expect(relationship.reasons.length).toBeGreaterThan(0);
  });

  it("reflects real linked records the moment they are linked", async () => {
    const personId = await createPerson("Ada Lovelace");
    const entities = makeRepository(CTX);
    const links = makeLinkRepository(CTX);
    const meetings = makeMeetingRepository(CTX);

    const note = await entities.create({
      type: "note",
      title: "Creative brief",
    });
    const meeting = await meetings.create({
      title: "Weekly sync",
      startsAt: new Date().toISOString(),
      timezone: "Australia/Sydney",
    });
    await links.create({
      sourceEntityId: personId,
      targetEntityId: note.id,
      type: "link.related",
    });
    await links.create({
      sourceEntityId: meeting.id,
      targetEntityId: personId,
      type: "meeting.attendee",
    });

    const { relationship } = await readPerson(personId);
    expect(relationship.summary.notes).toBe(1);
    expect(relationship.summary.meetings).toBe(1);
    expect(relationship.summary.sharedRecords).toBe(2);
    expect(relationship.summary.totalInteractions).toBe(2);
    expect(relationship.state).toBe("recently_connected");
  });

  it("self-heals when a record is unlinked — nothing has to be cleaned up", async () => {
    const personId = await createPerson("Ada Lovelace");
    const entities = makeRepository(CTX);
    const links = makeLinkRepository(CTX);
    const note = await entities.create({ type: "note", title: "Brief" });
    const created = await links.create({
      sourceEntityId: personId,
      targetEntityId: note.id,
      type: "link.related",
    });

    expect((await readPerson(personId)).relationship.summary.notes).toBe(1);

    await links.unlink(created.link.id);

    const after = await readPerson(personId);
    expect(after.relationship.summary.notes).toBe(0);
    expect(after.relationship.summary.sharedRecords).toBe(0);
  });

  it("never serialises the CONTENT of a linked record", async () => {
    const personId = await createPerson("Ada Lovelace");
    const entities = makeRepository(CTX);
    const links = makeLinkRepository(CTX);
    const note = await entities.create({
      type: "note",
      title: "Confidential salary review",
    });
    await links.create({
      sourceEntityId: personId,
      targetEntityId: note.id,
      type: "link.related",
    });

    const { relationship } = await readPerson(personId);
    const serialised = JSON.stringify(relationship);

    expect(serialised).not.toContain("Confidential");
    expect(serialised).not.toContain(note.id);
  });

  it("keeps the relationship deriving for an archived Person", async () => {
    const personId = await createPerson("Ada Lovelace");
    const entities = makeRepository(CTX);
    const links = makeLinkRepository(CTX);
    const note = await entities.create({ type: "note", title: "Brief" });
    await links.create({
      sourceEntityId: personId,
      targetEntityId: note.id,
      type: "link.related",
    });
    await archivePerson(personId);

    const { person, relationship } = await readPerson(personId);
    expect(person.archived).toBe(true);
    // Archiving is a filing state, not a forgetting state.
    expect(relationship.summary.notes).toBe(1);
  });
});

describe("GET /people — the batched collection signal", () => {
  it("attaches a stay-in-touch signal to every Person on the page", async () => {
    const first = await createPerson("Ada Lovelace");
    const second = await createPerson("Grace Hopper");
    const entities = makeRepository(CTX);
    const links = makeLinkRepository(CTX);
    const note = await entities.create({ type: "note", title: "Brief" });
    await links.create({
      sourceEntityId: first,
      targetEntityId: note.id,
      type: "link.related",
    });

    const { people } = await readCollection();
    const byId = new Map(people.map((person) => [person.id, person]));

    expect(byId.get(first)?.stayInTouch?.state).toBe("recently_connected");
    expect(byId.get(second)?.stayInTouch?.state).toBe("no_history");
    for (const person of people) {
      expect(person.stayInTouch?.label).toBeTruthy();
      // Only the primary reason travels to a card.
      expect(person.stayInTouch?.reasons.length).toBeLessThanOrEqual(1);
    }
  });

  it("never sends a warning or danger tone to a card", async () => {
    await createPerson("Ada Lovelace");
    const { people } = await readCollection();
    for (const person of people) {
      expect(["neutral", "success", "info"]).toContain(
        person.stayInTouch?.tone,
      );
    }
  });

  it("deliberately leaves an archived Person unsignalled", async () => {
    const personId = await createPerson("Ada Lovelace");
    await archivePerson(personId);

    const archived = (await archivedLoader({
      request: new Request("https://app.test/people/archived"),
      context: authedContext(),
      params: {},
    } as unknown as Parameters<typeof archivedLoader>[0])) as Awaited<
      ReturnType<typeof archivedLoader>
    >;

    expect(archived.people).toHaveLength(1);
    expect(archived.people[0].stayInTouch).toBeUndefined();
  });
});
