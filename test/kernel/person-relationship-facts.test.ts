import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";

import {
  RELATIONSHIP_INTERACTION_SAMPLE_LIMIT,
  evaluatePersonRelationship,
  type RelationshipEvaluationContext,
} from "~/kernel/relationships";
import { createRelationshipRepository } from "~/platform/storage/d1";

import {
  FakeClock,
  countingDb,
  makeContext,
  makeDiaryRepository,
  makeLinkRepository,
  makeMeetingRepository,
  makePersonRepository,
  makeRelationshipRepository,
  makeRepository,
  makeSpineRepository,
  makeReviewRepository,
  resetTables,
  sequentialIds,
} from "./support";

/**
 * PEOPLE-03 — the derived relationship-facts projection (`RelationshipRepository`)
 * over real D1 in the Workers runtime.
 *
 * These tests prove the facts are DERIVED from live links and the one Activity
 * stream (never stored, never backfilled), that the interaction vocabulary is
 * honest (a Person's own contact-card edits are not interactions), that lifecycle
 * changes self-heal, that the read is workspace-isolated, and — the requirement
 * that motivated the batch contract — that gathering a whole PAGE of People costs a
 * FIXED number of queries rather than one per Person.
 */

const WS = "test-default-workspace";
const OTHER = "ws_relationship_other";
const CTX = makeContext(WS);
const CTX_OTHER = makeContext(OTHER);

/** A world sharing ONE clock, so Activity timestamps are coherent. */
function world(ws: string, start = "2026-01-01T00:00:00.000Z") {
  const clock = new FakeClock(start);
  const ctx = makeContext(ws);
  return {
    clock,
    ctx,
    entities: makeRepository(ctx, {
      clock: clock.now,
      idGenerator: sequentialIds(`${ws}-e`),
      activityIdGenerator: sequentialIds(`${ws}-a`),
    }),
    links: makeLinkRepository(ctx, {
      clock: clock.now,
      idGenerator: sequentialIds(`${ws}-l`),
      activityIdGenerator: sequentialIds(`${ws}-la`),
    }),
    people: makePersonRepository(ctx, {
      clock: clock.now,
      idGenerator: sequentialIds(`${ws}-p`),
      activityIdGenerator: sequentialIds(`${ws}-pa`),
    }),
    spine: makeSpineRepository(ctx, {
      clock: clock.now,
      idGenerator: sequentialIds(`${ws}-s`),
      activityIdGenerator: sequentialIds(`${ws}-sa`),
    }),
    meetings: makeMeetingRepository(ctx, {
      clock: clock.now,
      idGenerator: sequentialIds(`${ws}-m`),
      activityIdGenerator: sequentialIds(`${ws}-ma`),
    }),
    diary: makeDiaryRepository(ctx, {
      clock: clock.now,
      idGenerator: sequentialIds(`${ws}-d`),
      activityIdGenerator: sequentialIds(`${ws}-da`),
    }),
    reviews: makeReviewRepository(ctx, {
      clock: clock.now,
      idGenerator: sequentialIds(`${ws}-r`),
      activityIdGenerator: sequentialIds(`${ws}-ra`),
    }),
    relationships: makeRelationshipRepository(ctx),
  };
}

type World = ReturnType<typeof world>;

/** Link two records with the shared generic relationship (FND-04). */
async function link(
  w: World,
  sourceEntityId: string,
  targetEntityId: string,
  type = "link.related",
) {
  const result = await w.links.create({ sourceEntityId, targetEntityId, type });
  return result.link;
}

async function makeMeeting(w: World, title: string) {
  return w.meetings.create({
    title,
    startsAt: w.clock.now().toISOString(),
    timezone: "Australia/Sydney",
  });
}

async function makeDiaryEntry(w: World, title: string) {
  return w.diary.create({ entryType: "note", title });
}

async function makeReview(w: World, title: string) {
  const result = await w.reviews.create({
    type: "weekly",
    title,
    periodStart: "2026-01-01",
    periodEnd: "2026-01-07",
  });
  return result.review;
}

/** An Area to hang spine records from — Tasks and Projects always have a parent. */
async function makeArea(w: World, title = "Work") {
  return w.spine.createArea({ title });
}

function ctxAt(todayIso: string): RelationshipEvaluationContext {
  return {
    now: new Date(`${todayIso}T00:00:00.000Z`),
    todayIso,
    calendarIsoOf: (instant) => instant.toISOString().slice(0, 10),
    followUpFrequency: null,
    nextFollowUpIso: null,
  };
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

describe("RelationshipRepository — the shared-record inventory", () => {
  it("counts each linked record kind, derived from live EntityLinks", async () => {
    const w = world(WS);
    const person = await w.people.create({ title: "Ada" });
    const note = await w.entities.create({ type: "note", title: "Brief" });
    const meeting = await makeMeeting(w, "Weekly sync");
    const entry = await makeDiaryEntry(w, "Monday");
    const review = await makeReview(w, "July review");
    const area = await makeArea(w);
    const task = await w.spine.createTask({
      title: "Send the deck",
      parent: { kind: "area", id: area.id },
    });
    const project = await w.spine.createProject({
      title: "Relaunch",
      parent: { kind: "area", id: area.id },
    });

    for (const target of [
      note.id,
      meeting.id,
      entry.id,
      review.id,
      task.id,
      project.id,
    ]) {
      await link(w, person.id, target);
    }

    const facts = await w.relationships.getPersonRelationshipFacts(person.id);

    expect(facts.records).toMatchObject({
      meetings: 1,
      diaryEntries: 1,
      notes: 1,
      reviews: 1,
      tasks: 1,
      projects: 1,
      total: 6,
    });
  });

  it("counts a link made in EITHER direction, exactly once", async () => {
    const w = world(WS);
    const person = await w.people.create({ title: "Ada" });
    const meeting = await makeMeeting(w, "Weekly sync");

    // Meeting → Person (the direction MEET-01 attendee linking uses).
    await link(w, meeting.id, person.id, "meeting.attendee");
    // And a second, redundant relationship the other way.
    await link(w, person.id, meeting.id);

    const facts = await w.relationships.getPersonRelationshipFacts(person.id);
    expect(facts.records.meetings).toBe(1);
    expect(facts.records.total).toBe(1);
  });

  it("separates OPEN tasks and ACTIVE projects from the totals", async () => {
    const w = world(WS);
    const person = await w.people.create({ title: "Ada" });
    const area = await makeArea(w);
    const parent = { kind: "area", id: area.id } as const;
    const openTask = await w.spine.createTask({ title: "Open", parent });
    const doneTask = await w.spine.createTask({ title: "Done", parent });
    const liveProject = await w.spine.createProject({ title: "Live", parent });
    const doneProject = await w.spine.createProject({
      title: "Shipped",
      parent,
    });

    for (const id of [
      openTask.id,
      doneTask.id,
      liveProject.id,
      doneProject.id,
    ]) {
      await link(w, person.id, id);
    }
    await w.spine.complete(doneTask.id);
    await w.spine.complete(doneProject.id);

    const facts = await w.relationships.getPersonRelationshipFacts(person.id);
    expect(facts.records.tasks).toBe(2);
    expect(facts.records.openTasks).toBe(1);
    expect(facts.records.projects).toBe(2);
    expect(facts.records.activeProjects).toBe(1);
  });

  it("drops a record the moment it is unlinked or soft-deleted — nothing to clean up", async () => {
    const w = world(WS);
    const person = await w.people.create({ title: "Ada" });
    const note = await w.entities.create({ type: "note", title: "Brief" });
    const meeting = await makeMeeting(w, "Sync");
    const noteLink = await link(w, person.id, note.id);
    await link(w, person.id, meeting.id, "meeting.attendee");

    expect(
      (await w.relationships.getPersonRelationshipFacts(person.id)).records
        .total,
    ).toBe(2);

    await w.links.unlink(noteLink.id);
    await w.entities.softDelete(meeting.id);

    const after = await w.relationships.getPersonRelationshipFacts(person.id);
    expect(after.records.total).toBe(0);
    expect(after.records.notes).toBe(0);
    expect(after.records.meetings).toBe(0);
  });

  it("files an unrecognised record kind under 'other' rather than losing it", async () => {
    const w = world(WS);
    const person = await w.people.create({ title: "Ada" });
    // A generic entity type no relationship card names by itself.
    const other = await w.entities.create({ type: "bookmark", title: "Link" });
    await link(w, person.id, other.id);

    const facts = await w.relationships.getPersonRelationshipFacts(person.id);
    expect(facts.records.otherRecords).toBe(1);
    expect(facts.records.total).toBe(1);
  });
});

describe("RelationshipRepository — the interaction history", () => {
  it("counts the events of linked records, never the Person's own record edits", async () => {
    const w = world(WS);
    const person = await w.people.create({ title: "Ada" });

    // Person-record maintenance only: no interaction has happened.
    await w.people.update(person.id, { organisation: "Analytical Engines" });
    await w.entities.update(person.id, { title: "Ada Lovelace" });

    const before = await w.relationships.getPersonRelationshipFacts(person.id);
    expect(before.totalInteractions).toBe(0);
    expect(before.lastInteractionAt).toBeNull();

    // A real shared moment: a meeting they attended.
    const meeting = await makeMeeting(w, "Weekly sync");
    await link(w, meeting.id, person.id, "meeting.attendee");

    const after = await w.relationships.getPersonRelationshipFacts(person.id);
    expect(after.totalInteractions).toBe(1);
    expect(after.lastInteractionAt).not.toBeNull();
  });

  it("counts a relationship link itself as bookkeeping, not as contact", async () => {
    const w = world(WS);
    const person = await w.people.create({ title: "Ada" });
    const note = await w.entities.create({ type: "note", title: "Brief" });
    await link(w, person.id, note.id);

    const facts = await w.relationships.getPersonRelationshipFacts(person.id);
    // The note's own `entity.created` is the one interaction; the `entity_link.created`
    // event is deliberately not one.
    expect(facts.totalInteractions).toBe(1);
  });

  it("resolves the first and last interaction across every linked record", async () => {
    const w = world(WS, "2026-01-01T00:00:00.000Z");
    const person = await w.people.create({ title: "Ada" });

    const note = await w.entities.create({ type: "note", title: "Brief" });
    w.clock.advance(30 * 86_400_000);
    const meeting = await makeMeeting(w, "Sync");

    for (const id of [note.id, meeting.id]) {
      await link(w, person.id, id);
    }

    const facts = await w.relationships.getPersonRelationshipFacts(person.id);
    expect(facts.firstInteractionAt?.toISOString().slice(0, 10)).toBe(
      "2026-01-01",
    );
    expect(facts.lastInteractionAt?.toISOString().slice(0, 10)).toBe(
      "2026-01-31",
    );
    expect(facts.totalInteractions).toBe(2);
  });

  it("counts an event naming several linked records exactly once", async () => {
    const w = world(WS);
    const person = await w.people.create({ title: "Ada" });
    const area = await makeArea(w);
    const project = await w.spine.createProject({
      title: "Relaunch",
      parent: { kind: "area", id: area.id },
    });
    // A task created UNDER the project — one creation event each, never four.
    const task = await w.spine.createTask({
      title: "Send the deck",
      parent: { kind: "project", id: project.id },
    });

    for (const id of [project.id, task.id]) {
      await link(w, person.id, id);
    }

    const facts = await w.relationships.getPersonRelationshipFacts(person.id);
    // Two records, two distinct creation events — never four.
    expect(facts.totalInteractions).toBe(2);
  });

  it("returns a bounded interaction sample and says when it bounded one", async () => {
    const w = world(WS);
    const person = await w.people.create({ title: "Ada" });
    const note = await w.entities.create({ type: "note", title: "Brief" });
    await link(w, person.id, note.id);

    const facts = await w.relationships.getPersonRelationshipFacts(person.id);
    expect(facts.interactionSample.length).toBeLessThanOrEqual(
      RELATIONSHIP_INTERACTION_SAMPLE_LIMIT,
    );
    expect(facts.interactionSampleTruncated).toBe(false);
  });

  it("returns the sample newest-first, so cadence reads the recent rhythm", async () => {
    const w = world(WS, "2026-01-01T00:00:00.000Z");
    const person = await w.people.create({ title: "Ada" });
    for (let i = 0; i < 3; i += 1) {
      const note = await w.entities.create({
        type: "note",
        title: `Note ${i}`,
      });
      await link(w, person.id, note.id);
      w.clock.advance(7 * 86_400_000);
    }

    const facts = await w.relationships.getPersonRelationshipFacts(person.id);
    const times = facts.interactionSample.map((d) => d.getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });
});

describe("RelationshipRepository — isolation and fail-closed behaviour", () => {
  it("never reads across workspaces", async () => {
    const here = world(WS);
    const there = world(OTHER);

    const person = await here.people.create({ title: "Ada" });
    const mine = await here.entities.create({ type: "note", title: "Mine" });
    await link(here, person.id, mine.id);
    const theirs = await there.entities.create({
      type: "note",
      title: "Theirs",
    });
    const grace = await there.people.create({ title: "Grace" });
    await link(there, grace.id, theirs.id);

    const facts = await here.relationships.getPersonRelationshipFacts(
      person.id,
    );
    expect(facts.records.notes).toBe(1);

    // The SAME person id read from the other workspace has nothing at all.
    const acrossTheWall = await there.relationships.getPersonRelationshipFacts(
      person.id,
    );
    expect(acrossTheWall.records.total).toBe(0);
    expect(acrossTheWall.totalInteractions).toBe(0);
    expect(CTX.workspaceId).not.toBe(CTX_OTHER.workspaceId);
  });

  it("returns the honest zero shape for an id that does not exist", async () => {
    const w = world(WS);
    const facts = await w.relationships.getPersonRelationshipFacts("nope");

    expect(facts.personId).toBe("nope");
    expect(facts.records.total).toBe(0);
    expect(facts.totalInteractions).toBe(0);
    expect(facts.interactionSample).toEqual([]);
  });

  it("omits a Person with no relationships from a batched read", async () => {
    const w = world(WS);
    const lonely = await w.people.create({ title: "Lonely" });
    const connected = await w.people.create({ title: "Connected" });
    const note = await w.entities.create({ type: "note", title: "Brief" });
    await link(w, connected.id, note.id);

    const map = await w.relationships.listPersonRelationshipFacts([
      lonely.id,
      connected.id,
    ]);
    expect(map.has(lonely.id)).toBe(false);
    expect(map.get(connected.id)?.records.notes).toBe(1);
  });

  it("rejects a malformed id at the boundary rather than binding it", async () => {
    const w = world(WS);
    await expect(
      w.relationships.getPersonRelationshipFacts(""),
    ).rejects.toThrow();
  });
});

describe("RelationshipRepository — batching (no N+1)", () => {
  it("costs a FIXED number of queries for a whole page of People", async () => {
    const w = world(WS);
    const ids: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      const person = await w.people.create({ title: `Person ${i}` });
      const note = await w.entities.create({
        type: "note",
        title: `Note ${i}`,
      });
      await link(w, person.id, note.id);
      ids.push(person.id);
    }

    const counted = countingDb(env.DB);
    const repo = createRelationshipRepository(counted.db, w.ctx);

    counted.reset();
    await repo.listPersonRelationshipFacts(ids.slice(0, 1));
    const forOne = counted.prepareCount();

    counted.reset();
    const many = await repo.listPersonRelationshipFacts(ids);
    const forTwelve = counted.prepareCount();

    expect(many.size).toBe(12);
    // One Person and twelve People cost the SAME three grouped statements — the
    // whole point of the batch contract.
    expect(forOne).toBe(3);
    expect(forTwelve).toBe(3);
  });

  it("chunks a page larger than the bind limit without becoming per-Person", async () => {
    const w = world(WS);
    const ids: string[] = [];
    for (let i = 0; i < 30; i += 1) {
      const person = await w.people.create({ title: `Person ${i}` });
      const note = await w.entities.create({
        type: "note",
        title: `Note ${i}`,
      });
      await link(w, person.id, note.id);
      ids.push(person.id);
    }

    const counted = countingDb(env.DB);
    const repo = createRelationshipRepository(counted.db, w.ctx);
    counted.reset();
    const map = await repo.listPersonRelationshipFacts(ids);

    expect(map.size).toBe(30);
    // Two chunks of ≤25 → six statements. Far below the 30 a per-Person read
    // would need for the inventory alone.
    expect(counted.prepareCount()).toBe(6);
  });
});

describe("The full derivation, end to end", () => {
  it("turns real records into an answer the Person record can show", async () => {
    const w = world(WS, "2026-01-05T09:00:00.000Z");
    const person = await w.people.create({ title: "Ada" });

    const meeting = await makeMeeting(w, "Kickoff");
    await link(w, meeting.id, person.id, "meeting.attendee");

    w.clock.advance(14 * 86_400_000);
    const entry = await makeDiaryEntry(w, "Coffee with Ada");
    await link(w, person.id, entry.id);

    w.clock.advance(14 * 86_400_000);
    const area = await makeArea(w);
    const task = await w.spine.createTask({
      title: "Send Ada the deck",
      parent: { kind: "area", id: area.id },
    });
    await link(w, person.id, task.id, "task.relates_to");

    const facts = await w.relationships.getPersonRelationshipFacts(person.id);
    const relationship = evaluatePersonRelationship(facts, ctxAt("2026-02-05"));

    expect(relationship.summary).toMatchObject({
      meetings: 1,
      diaryEntries: 1,
      tasks: 1,
      openTasks: 1,
      totalInteractions: 3,
      firstInteractionDate: "2026-01-05",
      lastInteractionDate: "2026-02-02",
    });
    expect(relationship.cadence.interactionDays).toBe(3);
    expect(relationship.cadence.averageIntervalDays).toBe(14);
    expect(relationship.cadence.longestGapDays).toBe(14);
    expect(relationship.cadence.daysSinceLastInteraction).toBe(3);
    expect(relationship.state).toBe("recently_connected");
  });
});
