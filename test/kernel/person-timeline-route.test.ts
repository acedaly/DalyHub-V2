import { beforeEach, describe, expect, it } from "vitest";
import { RouterContextProvider } from "react-router";

import type { AuthenticatedSession } from "~/kernel/auth";
import { setAuthenticatedSession } from "~/platform/request";
import { action as createAction } from "~/modules/people/routes/create";
import type { CreatePersonResult } from "~/modules/people/routes/create";
import { loader as activityLoader } from "~/modules/people/routes/activity";
import { action as mutateAction } from "~/modules/people/routes/mutate";
import type { PersonActivityPage } from "~/modules/people/person-activity";
import { MAX_PERSON_TIMELINE_RELATED_RECORDS } from "~/modules/people/person-timeline-anchors";

import {
  makeContext,
  makeLinkRepository,
  makeRepository,
  resetTables,
} from "./support";

/**
 * PEOPLE-02 — `GET /person/:personId/activity` is the ONE Person history surface
 * and now serves the UNIFIED relationship timeline: the Person's own record events
 * plus the events of the records they are linked to, read from the one FND-05
 * stream through the kernel's multi-anchor listing.
 *
 * These are real Workers/D1 integration tests over the actual loader: workspace
 * isolation, linked-record lifecycle (link → appears, unlink/delete → leaves),
 * stable ordering, pagination and privacy-safe output.
 */

const WS = "test-default-workspace";
const OTHER = "ws_person_timeline_other";
const CTX = makeContext(WS);
const CTX_OTHER = makeContext(OTHER);

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

async function readTimeline(
  personId: string,
  cursor?: string,
): Promise<{ status: number; body: PersonActivityPage & { error?: string } }> {
  const url = new URL(`https://app.test/person/${personId}/activity`);
  if (cursor) url.searchParams.set("cursor", cursor);
  const response = (await activityLoader({
    request: new Request(url),
    context: authedContext(),
    params: { personId },
  } as unknown as Parameters<typeof activityLoader>[0])) as Response;
  return {
    status: response.status,
    body: (await response.json()) as PersonActivityPage & { error?: string },
  };
}

/** Every entity id named as a subject anywhere on the page. */
function subjectIds(page: PersonActivityPage): Set<string> {
  const ids = new Set<string>();
  for (const item of page.items) {
    for (const subject of item.subjects) ids.add(subject.entityId);
  }
  return ids;
}

describe("GET /person/:personId/activity — the unified relationship timeline", () => {
  let entities: ReturnType<typeof makeRepository>;
  let links: ReturnType<typeof makeLinkRepository>;

  beforeEach(async () => {
    await resetTables([WS, OTHER]);
    entities = makeRepository(CTX);
    links = makeLinkRepository(CTX);
  });

  it("serves the Person's own record events for an unlinked Person", async () => {
    const personId = await createPerson("Ada");
    const { status, body } = await readTimeline(personId);

    expect(status).toBe(200);
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.map((item) => item.type)).toContain("person.created");
    expect(body.relatedRecordCount).toBe(0);
    expect(body.relatedRecordsTruncated).toBe(false);
  });

  it("includes a linked record's OWN events, by reference not by copy", async () => {
    const personId = await createPerson("Ada");
    const note = await entities.create({
      type: "note",
      title: "Ada's preferences",
    });
    await links.create({
      sourceEntityId: note.id,
      targetEntityId: personId,
      type: "link.related",
    });
    await entities.update(note.id, { title: "Ada's preferences (v2)" });

    const { body } = await readTimeline(personId);

    // The note's own creation and rename are on the Person's history…
    expect(body.items.map((item) => item.type)).toEqual(
      expect.arrayContaining([
        "entity.created",
        "entity.updated",
        "entity_link.created",
        "person.created",
      ]),
    );
    expect(subjectIds(body)).toContain(note.id);
    expect(body.relatedRecordCount).toBe(1);

    // …referenced as the canonical record (id + resolved title), never copied.
    const created = body.items.find(
      (item) =>
        item.type === "entity.created" &&
        item.subjects.some((subject) => subject.entityId === note.id),
    );
    expect(created?.subjects[0]?.entity?.label).toBe("Ada's preferences (v2)");
    expect(created?.subjects[0]?.entity?.entityType).toBe("note");
  });

  it("orders the merged history newest-first and stably", async () => {
    const personId = await createPerson("Ada");
    for (let index = 0; index < 3; index += 1) {
      const note = await entities.create({
        type: "note",
        title: `Note ${index}`,
      });
      await links.create({
        sourceEntityId: note.id,
        targetEntityId: personId,
        type: "link.related",
      });
    }

    const { body } = await readTimeline(personId);
    const times = body.items.map((item) => Date.parse(item.occurredAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));

    // Equal timestamps break by descending id, so repeated reads are identical.
    const again = await readTimeline(personId);
    expect(again.body.items.map((item) => item.id)).toEqual(
      body.items.map((item) => item.id),
    );
  });

  it("drops a record's events when the relationship is removed", async () => {
    const personId = await createPerson("Ada");
    const note = await entities.create({ type: "note", title: "Shared note" });
    const link = await links.create({
      sourceEntityId: note.id,
      targetEntityId: personId,
      type: "link.related",
    });

    const linked = await readTimeline(personId);
    expect(subjectIds(linked.body)).toContain(note.id);

    await links.unlink(link.link.id);

    const unlinked = await readTimeline(personId);
    expect(unlinked.body.relatedRecordCount).toBe(0);
    // The note's own lifecycle events are gone; only the link events (which name
    // the Person as a subject in their own right) remain.
    expect(
      unlinked.body.items.filter(
        (item) =>
          item.type === "entity.created" &&
          item.subjects.some((subject) => subject.entityId === note.id),
      ),
    ).toHaveLength(0);
  });

  it("drops a linked record's events when the record is soft-deleted", async () => {
    const personId = await createPerson("Ada");
    const note = await entities.create({ type: "note", title: "Shared note" });
    await links.create({
      sourceEntityId: note.id,
      targetEntityId: personId,
      type: "link.related",
    });
    await entities.softDelete(note.id);

    const { body } = await readTimeline(personId);
    expect(body.relatedRecordCount).toBe(0);
  });

  it("still serves a soft-deleted Person's own history", async () => {
    const personId = await createPerson("Ada");
    await entities.softDelete(personId);

    const { status, body } = await readTimeline(personId);
    expect(status).toBe(200);
    expect(body.items.map((item) => item.type)).toContain("person.created");
    expect(body.relatedRecordCount).toBe(0);
  });

  it("never leaks another workspace's records into the stream", async () => {
    const personId = await createPerson("Ada");
    const foreign = makeRepository(CTX_OTHER);
    const theirNote = await foreign.create({
      type: "note",
      title: "Their secret",
    });
    // A cross-workspace link cannot even be created (the kernel refuses), so the
    // foreign record can never become an anchor.
    await expect(
      links.create({
        sourceEntityId: theirNote.id,
        targetEntityId: personId,
        type: "link.related",
      }),
    ).rejects.toBeInstanceOf(Error);

    const { body } = await readTimeline(personId);
    expect(subjectIds(body)).not.toContain(theirNote.id);
    expect(JSON.stringify(body)).not.toContain("Their secret");
  });

  it("paginates the merged stream without duplicates or omissions", async () => {
    const personId = await createPerson("Ada");
    // Enough linked records that their events exceed one page (page size 30).
    for (let index = 0; index < 12; index += 1) {
      const note = await entities.create({
        type: "note",
        title: `Note ${index}`,
      });
      await links.create({
        sourceEntityId: note.id,
        targetEntityId: personId,
        type: "link.related",
      });
      await entities.update(note.id, { title: `Note ${index}!` });
    }

    const seen: string[] = [];
    let cursor: string | undefined;
    let guard = 0;
    do {
      const { body } = await readTimeline(personId, cursor);
      seen.push(...body.items.map((item) => item.id));
      cursor = body.nextCursor ?? undefined;
      guard += 1;
    } while (cursor && guard < 10);

    expect(guard).toBeGreaterThan(1);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("keeps the anchor set stable across pages even if links change mid-read", async () => {
    const personId = await createPerson("Ada");
    for (let index = 0; index < 12; index += 1) {
      const note = await entities.create({
        type: "note",
        title: `Note ${index}`,
      });
      await links.create({
        sourceEntityId: note.id,
        targetEntityId: personId,
        type: "link.related",
      });
      await entities.update(note.id, { title: `Note ${index}!` });
    }

    const first = await readTimeline(personId);
    expect(first.body.nextCursor).not.toBeNull();

    // A new relationship appears between pages. Page two must still resolve
    // against the snapshot the first page was read at.
    const late = await entities.create({ type: "note", title: "Late note" });
    await links.create({
      sourceEntityId: late.id,
      targetEntityId: personId,
      type: "link.related",
    });

    const second = await readTimeline(personId, first.body.nextCursor!);
    expect(second.status).toBe(200);
    expect(subjectIds(second.body)).not.toContain(late.id);

    // The next FIRST-page read picks the new relationship up.
    const refreshed = await readTimeline(personId);
    expect(subjectIds(refreshed.body)).toContain(late.id);
  });

  it("rejects a cursor issued for another Person, and any garbage cursor", async () => {
    const adaId = await createPerson("Ada");
    const graceId = await createPerson("Grace");
    for (let index = 0; index < 12; index += 1) {
      const note = await entities.create({
        type: "note",
        title: `Note ${index}`,
      });
      await links.create({
        sourceEntityId: note.id,
        targetEntityId: adaId,
        type: "link.related",
      });
      await entities.update(note.id, { title: `Note ${index}!` });
    }

    const { body } = await readTimeline(adaId);
    expect(body.nextCursor).not.toBeNull();

    const replayed = await readTimeline(graceId, body.nextCursor!);
    expect(replayed.status).toBe(400);
    expect(replayed.body.error).toBe("invalid_cursor");

    const garbage = await readTimeline(adaId, "not-a-cursor");
    expect(garbage.status).toBe(400);
  });

  it("fails closed for a missing, wrong-type or cross-workspace id", async () => {
    const missing = await readTimeline("no-such-person");
    expect(missing.status).toBe(404);

    const note = await entities.create({ type: "note", title: "Not a person" });
    const wrongType = await readTimeline(note.id);
    expect(wrongType.status).toBe(404);

    const foreign = makeRepository(CTX_OTHER);
    const theirs = await foreign.create({ type: "note", title: "Theirs" });
    expect((await readTimeline(theirs.id)).status).toBe(404);
  });

  it("discloses (never silently applies) a relationship bound", async () => {
    const personId = await createPerson("Ada");
    for (
      let index = 0;
      index < MAX_PERSON_TIMELINE_RELATED_RECORDS + 2;
      index += 1
    ) {
      const note = await entities.create({
        type: "note",
        title: `Note ${index}`,
      });
      await links.create({
        sourceEntityId: note.id,
        targetEntityId: personId,
        type: "link.related",
      });
    }

    const { body } = await readTimeline(personId);
    expect(body.relatedRecordCount).toBe(MAX_PERSON_TIMELINE_RELATED_RECORDS);
    expect(body.relatedRecordsTruncated).toBe(true);
  });

  it("surfaces no private field of the Person or of a linked record", async () => {
    const personId = await createPerson("Ada");
    // A Person's private detail fields must never reach the timeline payload.
    const form = new FormData();
    form.set("intent", "update");
    form.set("email", "ada@example.test");
    form.set("mobile", "+61400000000");
    form.set("notes", "Loves cryptic crosswords");
    await mutateAction({
      request: new Request(`https://app.test/person/${personId}/mutate`, {
        method: "POST",
        body: form,
      }),
      context: authedContext(),
      params: { personId },
    } as unknown as Parameters<typeof mutateAction>[0]);

    const page = await readTimeline(personId);
    const serialised = JSON.stringify(page.body);
    expect(serialised).not.toContain("ada@example.test");
    expect(serialised).not.toContain("+61400000000");
    expect(serialised).not.toContain("cryptic crosswords");

    // The `person.updated` event is present — it carries only WHICH fields moved.
    expect(page.body.items.map((item) => item.type)).toContain(
      "person.updated",
    );
    // …and the timeline renders no payload metadata for it at all.
    const updated = page.body.items.find(
      (item) => item.type === "person.updated",
    );
    expect(updated?.presentation.metadata ?? []).toHaveLength(0);
  });
});
