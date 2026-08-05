import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { createActivityActorContext } from "~/kernel/activity";
import {
  applyProposalItems,
  resolveProposalSource,
  type AppliedItem,
  type ProposalSource,
} from "~/modules/ai/apply-proposal";
import type { WorkspaceScope } from "~/platform/workspaces";
import { TASK_RELATES_TO } from "~/shared/task-record/task-view";

import {
  FakeClock,
  countActivitiesOfType,
  countMeetingItemTaskRows,
  makeActivityRepository,
  makeContext,
  makeLinkRepository,
  makeMeetingRepository,
  makeNoteDetailsRepository,
  makeRepository,
  makeSpineRepository,
  makeTaskRepository,
  resetTables,
  sequentialIds,
} from "./support";

/**
 * AI-02 / DEBT-90 — the proposal ACCEPTANCE path, against real repositories and
 * real D1 constraints.
 *
 * These are the invariants a mock cannot prove, and they are the ones the whole
 * design rests on:
 *
 *   - an accepted Meeting Task goes through MEET-02's conversion authority, so
 *     the `meeting_item_tasks` mapping exists and the Follow-up projection
 *     reports it as converted (the DEBT-90 defect, with a before-state test);
 *   - an accepted Meeting Note is ONE ordinary Note, linked to the Meeting;
 *   - an accepted Note-derived Task keeps its source relationship;
 *   - rejection writes nothing at all;
 *   - the OWNER is the actor on every event, and AI is never one;
 *   - workspace isolation holds on every source and every target;
 *   - stale Meetings, Notes and Projects are refused truthfully rather than
 *     written against;
 *   - a partial failure is reported as a partial failure.
 */

const WS = "ws_ai_apply";
const OTHER = "ws_ai_apply_other";
const START = "2026-08-04T09:00:00.000Z";
const OWNER = "owner-subject-1";

const nextEntityId = sequentialIds("ent");
const nextActivityId = sequentialIds("act");

interface Harness {
  readonly scope: WorkspaceScope;
  readonly meetings: ReturnType<typeof makeMeetingRepository>;
  readonly tasks: ReturnType<typeof makeTaskRepository>;
  readonly entityLinks: ReturnType<typeof makeLinkRepository>;
  readonly entities: ReturnType<typeof makeRepository>;
  readonly noteDetails: ReturnType<typeof makeNoteDetailsRepository>;
  readonly activity: ReturnType<typeof makeActivityRepository>;
  readonly workspaceId: string;
}

/**
 * Compose the repositories the acceptance path reads into a scope-like object
 * bound to ONE workspace context — the same composition
 * `bindWorkspaceRepositories` performs in production, without a Worker env.
 *
 * The actor is an authenticated USER, because that is what the route resolves at
 * the request boundary. It is established at composition, never passed through a
 * method parameter, so no code below can choose one.
 */
function harness(ws: string): Harness {
  const context = makeContext(ws);
  const shared = {
    clock: new FakeClock().now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
    actorContext: createActivityActorContext({ type: "user", id: OWNER }),
  };
  const meetings = makeMeetingRepository(context, shared);
  const tasks = makeTaskRepository(context, {
    clock: shared.clock,
    activityIdGenerator: nextActivityId,
    actorContext: shared.actorContext,
  });
  const spine = makeSpineRepository(context, shared);
  const entityLinks = makeLinkRepository(context, shared);
  const entities = makeRepository(context, shared);
  const noteDetails = makeNoteDetailsRepository(context, shared);
  const activity = makeActivityRepository(context);

  const scope = {
    context,
    meetings,
    tasks,
    entityLinks,
    entities,
    noteDetails,
    spine,
  } as unknown as WorkspaceScope;

  return {
    scope,
    meetings,
    tasks,
    entityLinks,
    entities,
    noteDetails,
    activity,
    workspaceId: ws,
  };
}

/** Run one acceptance the way the route does, with the replay guard armed. */
async function accept(
  h: Harness,
  source: ProposalSource | null,
  items: readonly unknown[],
  usageId = "usage-1",
): Promise<readonly AppliedItem[]> {
  return applyProposalItems({
    scope: h.scope,
    source,
    items,
    usageId,
    receipts: {
      db: env.DB,
      workspaceId: h.workspaceId,
      ownerSubject: OWNER,
      now: new Date("2026-08-05T00:00:00.000Z"),
    },
  });
}

async function seedMeeting(h: Harness, title = "Weekly sync") {
  return h.meetings.create({ title, startsAt: START, timezone: "UTC" });
}

async function seedNote(h: Harness, title = "Migration notes") {
  return h.entities.create({ type: "note", title });
}

async function countRows(table: string, where = "1=1"): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`,
  ).first<{ n: number }>();
  return row?.n ?? 0;
}

async function activeNoteCount(): Promise<number> {
  return countRows("entities", "type='note' AND deleted_at IS NULL");
}

async function activeTaskCount(): Promise<number> {
  return countRows("entities", "type='task' AND deleted_at IS NULL");
}

/** The ids linked to `entityId`, by link type, in both directions. */
async function linkedIds(
  h: Harness,
  entityId: string,
  type: string,
): Promise<string[]> {
  const page = await h.entityLinks.listForEntity(entityId, {
    direction: "both",
  });
  return page.items
    .filter((view) => view.link.type === type)
    .map((view) =>
      view.link.sourceEntityId === entityId
        ? view.link.targetEntityId
        : view.link.sourceEntityId,
    );
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

describe("source resolution — the server decides what a record is", () => {
  it("reads the record TYPE from storage, never from the request", async () => {
    const h = harness(WS);
    const meeting = await seedMeeting(h);
    const note = await seedNote(h);

    expect(await resolveProposalSource(h.scope, meeting.id)).toMatchObject({
      kind: "meeting",
      id: meeting.id,
    });
    expect(await resolveProposalSource(h.scope, note.id)).toMatchObject({
      kind: "note",
      id: note.id,
    });
  });

  it("refuses an id that is not a live Meeting or Note", async () => {
    const h = harness(WS);
    const meeting = await seedMeeting(h);
    await h.entities.softDelete(meeting.id);

    for (const id of [meeting.id, "does-not-exist", "", null, undefined, 42]) {
      expect(await resolveProposalSource(h.scope, id)).toBeNull();
    }
  });

  it("refuses another workspace’s record", async () => {
    const other = harness(OTHER);
    const meeting = await seedMeeting(other, "Someone else’s meeting");
    const mine = harness(WS);
    expect(await resolveProposalSource(mine.scope, meeting.id)).toBeNull();
  });
});

describe("DEBT-90 — an accepted Meeting Task is a canonical conversion", () => {
  it("writes the meeting_item_tasks mapping the Follow-up tab reads", async () => {
    const h = harness(WS);
    const meeting = await seedMeeting(h);
    const source = await resolveProposalSource(h.scope, meeting.id);

    // The BEFORE state this release fixes: no mapping exists yet.
    expect(await countMeetingItemTaskRows()).toBe(0);

    const [applied] = await accept(h, source, [
      { kind: "task", title: "Send the draft to Vaughn" },
    ]);

    expect(applied.ok).toBe(true);
    expect(applied.created).toBe(true);
    expect(await countMeetingItemTaskRows()).toBe(1);

    // The Follow-up PROJECTION — what the tab actually renders from.
    const followUps = await h.meetings.listFollowUps(meeting.id);
    expect(followUps).toHaveLength(1);
    expect(followUps[0]?.taskId).toBe(applied.id);
    expect(followUps[0]?.itemId).not.toBeNull();

    // The item it converted is a real meeting action item, so the Meeting
    // records the action exactly as a hand-typed one would.
    const fresh = await h.meetings.get(meeting.id);
    const item = fresh?.items.find((i) => i.id === followUps[0]?.itemId);
    expect(item?.kind).toBe("action");
    expect(item?.bodyMarkdown).toBe("Send the draft to Vaughn");

    // And the navigable relationship MEET-02 asserts is there too.
    expect(await linkedIds(h, applied.id!, TASK_RELATES_TO)).toContain(
      meeting.id,
    );
  });

  it("preserves every owner-reviewed value", async () => {
    const h = harness(WS);
    const area = await h.scope.spine.createArea({ title: "Operations" });
    const project = await h.scope.spine.createProject({
      title: "Atlas",
      parent: { kind: "area", id: area.id },
    });
    const meeting = await seedMeeting(h);
    const source = await resolveProposalSource(h.scope, meeting.id);

    const [applied] = await accept(h, source, [
      {
        kind: "task",
        title: "Book the venue",
        description: "Ring the hall and confirm the Friday slot.",
        dueDate: "2026-08-14",
        scheduledDate: "2026-08-12",
        projectId: project.id,
      },
    ]);

    expect(applied.ok).toBe(true);
    const task = await h.tasks.getTask(applied.id!);
    expect(task?.title).toBe("Book the venue");
    expect(task?.dueDate).toBe("2026-08-14");
    expect(task?.scheduledDate).toBe("2026-08-12");
    expect(task?.project?.id).toBe(project.id);
    expect(String(task?.description)).toContain("Ring the hall");
  });

  it("supports Inbox placement — a Task with no Project", async () => {
    const h = harness(WS);
    const meeting = await seedMeeting(h);
    const source = await resolveProposalSource(h.scope, meeting.id);

    const [applied] = await accept(h, source, [
      { kind: "task", title: "Think about the rollout", projectId: null },
    ]);

    expect(applied.ok).toBe(true);
    const task = await h.tasks.getTask(applied.id!);
    expect(task?.project).toBeNull();
    expect(task?.area).toBeNull();
    // Still a canonical conversion, Inbox or not.
    expect(await countMeetingItemTaskRows()).toBe(1);
  });

  /**
   * The idempotency guarantee, through the integrity constraints rather than
   * around them: the replayed acceptance finds the action item the first one
   * created, finds its live mapping, and returns the SAME Task.
   */
  it("cannot create two converted Tasks from one replayed acceptance", async () => {
    const h = harness(WS);
    const meeting = await seedMeeting(h);
    const source = await resolveProposalSource(h.scope, meeting.id);
    const items = [{ kind: "task", title: "Send the draft" }];

    const [first] = await accept(h, source, items);
    const [second] = await accept(h, source, items);
    const [third] = await accept(h, source, items, "usage-2");

    expect(first.created).toBe(true);
    expect(second.ok).toBe(true);
    expect(second.created).toBe(false);
    expect(second.id).toBe(first.id);
    // Even a DIFFERENT usage row — the owner running extraction again and
    // accepting the same action — converts the same item once.
    expect(third.id).toBe(first.id);
    expect(third.created).toBe(false);

    expect(await countMeetingItemTaskRows()).toBe(1);
    expect(await activeTaskCount()).toBe(1);
    // One meeting action item, not three.
    const fresh = await h.meetings.get(meeting.id);
    expect(fresh?.items.filter((i) => i.kind === "action")).toHaveLength(1);
  });

  it("reuses an action item the owner had already written", async () => {
    const h = harness(WS);
    const meeting = await seedMeeting(h);
    const existing = await h.meetings.addItem(
      meeting.id,
      "action",
      "Send the draft",
    );
    const source = await resolveProposalSource(h.scope, meeting.id);

    const [applied] = await accept(h, source, [
      { kind: "task", title: "Send the draft" },
    ]);

    const followUps = await h.meetings.listFollowUps(meeting.id);
    expect(followUps[0]?.itemId).toBe(existing.id);
    expect(applied.ok).toBe(true);
    const fresh = await h.meetings.get(meeting.id);
    expect(fresh?.items.filter((i) => i.kind === "action")).toHaveLength(1);
  });

  it("leaves an already-converted item converted, and does not duplicate it", async () => {
    const h = harness(WS);
    const meeting = await seedMeeting(h);
    const source = await resolveProposalSource(h.scope, meeting.id);

    const [first] = await accept(h, source, [
      { kind: "task", title: "Send the draft" },
    ]);
    const itemId = (await h.meetings.listFollowUps(meeting.id))[0]?.itemId;

    // A second, independent acceptance of the same text.
    const [second] = await accept(
      h,
      source,
      [{ kind: "task", title: "Send the draft" }],
      "usage-3",
    );

    expect(second.id).toBe(first.id);
    const followUps = await h.meetings.listFollowUps(meeting.id);
    expect(followUps).toHaveLength(1);
    expect(followUps[0]?.itemId).toBe(itemId);
  });

  it("treats a DIFFERENT reviewed title as a different action", async () => {
    const h = harness(WS);
    const meeting = await seedMeeting(h);
    const source = await resolveProposalSource(h.scope, meeting.id);

    const [first] = await accept(h, source, [
      { kind: "task", title: "Send the draft" },
    ]);
    const [second] = await accept(
      h,
      source,
      [{ kind: "task", title: "Send the draft to Vaughn" }],
      "usage-2",
    );

    expect(second.id).not.toBe(first.id);
    expect(await countMeetingItemTaskRows()).toBe(2);
  });
});

describe("stale and cross-workspace state is refused, not written against", () => {
  it("refuses a Meeting archived since the proposal was generated", async () => {
    const h = harness(WS);
    const meeting = await seedMeeting(h);
    const source = await resolveProposalSource(h.scope, meeting.id);
    await h.meetings.archive(meeting.id);

    const [applied] = await accept(h, source, [
      { kind: "task", title: "Too late" },
    ]);

    expect(applied.ok).toBe(false);
    expect(applied.message).toContain("archived");
    expect(await countMeetingItemTaskRows()).toBe(0);
    expect(await activeTaskCount()).toBe(0);
    // No stray action item was appended to the archived Meeting either.
    const fresh = await h.meetings.get(meeting.id);
    expect(fresh?.items).toHaveLength(0);
  });

  it("refuses a Meeting deleted since the proposal was generated", async () => {
    const h = harness(WS);
    const meeting = await seedMeeting(h);
    const source = await resolveProposalSource(h.scope, meeting.id);
    await h.entities.softDelete(meeting.id);

    const [applied] = await accept(h, source, [
      { kind: "task", title: "Too late" },
    ]);

    expect(applied.ok).toBe(false);
    expect(applied.message).toContain("no longer available");
    expect(await activeTaskCount()).toBe(0);
  });

  it("refuses a Project archived since the proposal was generated", async () => {
    const h = harness(WS);
    const area = await h.scope.spine.createArea({ title: "Operations" });
    const project = await h.scope.spine.createProject({
      title: "Atlas",
      parent: { kind: "area", id: area.id },
    });
    const meeting = await seedMeeting(h);
    const source = await resolveProposalSource(h.scope, meeting.id);
    await h.scope.spine.softDelete(project.id);

    const [applied] = await accept(h, source, [
      { kind: "task", title: "Book the venue", projectId: project.id },
    ]);

    expect(applied.ok).toBe(false);
    expect(applied.message).toContain("no longer available");
    expect(await activeTaskCount()).toBe(0);
    expect(await countMeetingItemTaskRows()).toBe(0);
  });

  it("refuses a Project id the browser invented", async () => {
    const h = harness(WS);
    const meeting = await seedMeeting(h);
    const source = await resolveProposalSource(h.scope, meeting.id);

    const [applied] = await accept(h, source, [
      { kind: "task", title: "Book the venue", projectId: "project-invented" },
    ]);

    expect(applied.ok).toBe(false);
    expect(await activeTaskCount()).toBe(0);
  });

  it("refuses another workspace’s Project", async () => {
    const other = harness(OTHER);
    const otherArea = await other.scope.spine.createArea({ title: "Theirs" });
    const otherProject = await other.scope.spine.createProject({
      title: "Their Atlas",
      parent: { kind: "area", id: otherArea.id },
    });

    const h = harness(WS);
    const meeting = await seedMeeting(h);
    const source = await resolveProposalSource(h.scope, meeting.id);

    const [applied] = await accept(h, source, [
      { kind: "task", title: "Cross-workspace", projectId: otherProject.id },
    ]);

    expect(applied.ok).toBe(false);
    expect(
      await countRows("entities", `workspace_id='${WS}' AND type='task'`),
    ).toBe(0);
  });

  it("refuses an impossible date and creates nothing", async () => {
    const h = harness(WS);
    const meeting = await seedMeeting(h);
    const source = await resolveProposalSource(h.scope, meeting.id);

    const [applied] = await accept(h, source, [
      { kind: "task", title: "Book the venue", dueDate: "2026-02-30" },
    ]);

    expect(applied.ok).toBe(false);
    expect(applied.message).toContain("real calendar date");
    expect(await activeTaskCount()).toBe(0);
  });
});

describe("AI-02 — an accepted Meeting Note becomes an ordinary linked Note", () => {
  const note = {
    kind: "note",
    title: "Decisions from the sync",
    body: "We agreed to ship on Friday.\n\n- Vaughn owns the release notes.",
  };

  it("creates ONE canonical Note with the owner’s Markdown", async () => {
    const h = harness(WS);
    const meeting = await seedMeeting(h);
    const source = await resolveProposalSource(h.scope, meeting.id);

    const [applied] = await accept(h, source, [note]);

    expect(applied.ok).toBe(true);
    expect(applied.kind).toBe("note");
    expect(await activeNoteCount()).toBe(1);

    const entity = await h.entities.getById(applied.id!);
    expect(entity?.type).toBe("note");
    expect(entity?.title).toBe("Decisions from the sync");

    const details = await h.noteDetails.get(applied.id!);
    // Stored EXACTLY as reviewed — no reflow, no trimming, no rewriting.
    expect(details?.content).toBe(note.body);
  });

  it("links the new Note to its source Meeting through the canonical link", async () => {
    const h = harness(WS);
    const meeting = await seedMeeting(h);
    const source = await resolveProposalSource(h.scope, meeting.id);

    const [applied] = await accept(h, source, [note]);

    // `link.related` is the universal relationship the Linked Items surfaces
    // read — the same one "New Note from this Meeting" creates.
    expect(await linkedIds(h, applied.id!, "link.related")).toEqual([
      meeting.id,
    ]);
    expect(await linkedIds(h, meeting.id, "link.related")).toEqual([
      applied.id,
    ]);
  });

  it("does not create a Note when the owner did not accept one", async () => {
    const h = harness(WS);
    const meeting = await seedMeeting(h);
    const source = await resolveProposalSource(h.scope, meeting.id);

    await accept(h, source, [{ kind: "task", title: "Send the draft" }]);

    expect(await activeNoteCount()).toBe(0);
  });

  it("cannot silently create repeated identical Notes on a retry", async () => {
    const h = harness(WS);
    const meeting = await seedMeeting(h);
    const source = await resolveProposalSource(h.scope, meeting.id);

    const [first] = await accept(h, source, [note]);
    const [second] = await accept(h, source, [note]);

    expect(second.ok).toBe(true);
    expect(second.id).toBe(first.id);
    expect(second.created).toBe(false);
    expect(await activeNoteCount()).toBe(1);
    // And the link was not duplicated either.
    expect(await linkedIds(h, first.id!, "link.related")).toEqual([meeting.id]);
  });

  it("refuses a Note whose source Meeting was deleted since the proposal", async () => {
    const h = harness(WS);
    const meeting = await seedMeeting(h);
    const source = await resolveProposalSource(h.scope, meeting.id);
    await h.entities.softDelete(meeting.id);

    const [applied] = await accept(h, source, [note]);

    expect(applied.ok).toBe(false);
    expect(applied.message).toContain("no longer available");
    expect(await activeNoteCount()).toBe(0);
  });

  it("refuses a Note proposal with no source at all", async () => {
    const h = harness(WS);
    const [applied] = await accept(h, null, [note]);
    expect(applied.ok).toBe(false);
    expect(await activeNoteCount()).toBe(0);
  });

  it("refuses a Note proposed from a NOTE source — Notes do not propose Notes", async () => {
    const h = harness(WS);
    const sourceNote = await seedNote(h);
    const source = await resolveProposalSource(h.scope, sourceNote.id);

    const [applied] = await accept(h, source, [note]);

    expect(applied.ok).toBe(false);
    expect(await activeNoteCount()).toBe(1); // only the source note
  });

  it("re-validates the owner’s edited fields server-side", async () => {
    const h = harness(WS);
    const meeting = await seedMeeting(h);
    const source = await resolveProposalSource(h.scope, meeting.id);

    const results = await accept(h, source, [
      { kind: "note", title: "   ", body: "Something." },
      { kind: "note", title: "x".repeat(121), body: "Something." },
      { kind: "note", title: "Fine", body: "y".repeat(4001) },
    ]);

    expect(results.every((entry) => !entry.ok)).toBe(true);
    expect(results[0]?.message).toContain("title is required");
    expect(results[1]?.message).toContain("too long");
    expect(results[2]?.message).toContain("too long");
    expect(await activeNoteCount()).toBe(0);
  });
});

describe("AI-02 — an accepted Note-derived Task keeps its source", () => {
  it("creates the Task and links it back to the Note", async () => {
    const h = harness(WS);
    const sourceNote = await seedNote(h);
    const source = await resolveProposalSource(h.scope, sourceNote.id);

    const [applied] = await accept(h, source, [
      { kind: "task", title: "Draft the migration plan" },
    ]);

    expect(applied.ok).toBe(true);
    const task = await h.tasks.getTask(applied.id!);
    expect(task?.title).toBe("Draft the migration plan");
    // Inbox creation is preserved — a Note-derived Task needs no Project.
    expect(task?.project).toBeNull();
    expect(task?.area).toBeNull();
    expect(await linkedIds(h, applied.id!, TASK_RELATES_TO)).toEqual([
      sourceNote.id,
    ]);

    // And it is visible from the NOTE's side as an incoming reference — which is
    // what makes the source relationship reachable from the Note's own
    // Backlinks surface rather than only from the Task.
    const incoming = await h.entityLinks.listForEntity(sourceNote.id, {
      direction: "incoming",
    });
    expect(
      incoming.items.map((view) => ({
        type: view.link.type,
        id: view.counterpart.id,
      })),
    ).toEqual([{ type: TASK_RELATES_TO, id: applied.id }]);
  });

  it("does NOT route a Note-derived Task through the Meeting authority", async () => {
    const h = harness(WS);
    const sourceNote = await seedNote(h);
    const source = await resolveProposalSource(h.scope, sourceNote.id);

    await accept(h, source, [{ kind: "task", title: "Draft the plan" }]);

    // No meeting mapping, and no meeting Activity, because no Meeting is
    // involved in any way.
    expect(await countMeetingItemTaskRows()).toBe(0);
    expect(await countActivitiesOfType("meeting.item_converted_to_task")).toBe(
      0,
    );
  });

  it("does not duplicate the source link on a retry", async () => {
    const h = harness(WS);
    const sourceNote = await seedNote(h);
    const source = await resolveProposalSource(h.scope, sourceNote.id);
    const items = [{ kind: "task", title: "Draft the migration plan" }];

    const [first] = await accept(h, source, items);
    const [second] = await accept(h, source, items);

    expect(second.id).toBe(first.id);
    expect(await activeTaskCount()).toBe(1);
    expect(await linkedIds(h, first.id!, TASK_RELATES_TO)).toEqual([
      sourceNote.id,
    ]);
  });

  it("refuses a Task whose source Note was deleted since the proposal", async () => {
    const h = harness(WS);
    const sourceNote = await seedNote(h);
    const source = await resolveProposalSource(h.scope, sourceNote.id);
    await h.entities.softDelete(sourceNote.id);

    const [applied] = await accept(h, source, [
      { kind: "task", title: "Draft the plan" },
    ]);

    // The Task cannot keep a relationship to a record that is gone, so it is
    // compensated and the failure reported rather than a half-result kept.
    expect(applied.ok).toBe(false);
    expect(await activeTaskCount()).toBe(0);
  });
});

describe("the owner is the actor, and AI never is", () => {
  it("records the ordinary events an owner-created record produces", async () => {
    const h = harness(WS);
    const meeting = await seedMeeting(h);
    const source = await resolveProposalSource(h.scope, meeting.id);

    await accept(h, source, [
      { kind: "task", title: "Send the draft" },
      {
        kind: "note",
        title: "Decisions",
        body: "We agreed to ship on Friday.",
      },
    ]);

    const feed = await h.activity.listForWorkspace({ limit: 100 });
    expect(feed.items.length).toBeGreaterThan(0);

    for (const item of feed.items) {
      expect(item.actor.type, item.type).toBe("user");
      expect(item.actor.id, item.type).toBe(OWNER);
      // The one thing that must never be true.
      expect(item.actor.type, item.type).not.toBe("ai");
    }

    // The events are the ordinary ones. Nothing announces that AI was involved.
    const types = feed.items.map((item) => String(item.type));
    expect(types).toContain("meeting.item_converted_to_task");
    expect(types).toContain("entity.created");
    expect(types.some((type) => type.includes("ai"))).toBe(false);
  });

  it("writes NO Task, Note, EntityLink or Activity when nothing is accepted", async () => {
    const h = harness(WS);
    const meeting = await seedMeeting(h);
    const source = await resolveProposalSource(h.scope, meeting.id);

    const before = await h.activity.listForWorkspace({ limit: 100 });
    const applied = await accept(h, source, []);

    expect(applied).toEqual([]);
    expect(await activeTaskCount()).toBe(0);
    expect(await activeNoteCount()).toBe(0);
    expect(await countMeetingItemTaskRows()).toBe(0);
    expect(await countRows("entity_links")).toBe(0);
    const after = await h.activity.listForWorkspace({ limit: 100 });
    expect(after.items).toHaveLength(before.items.length);
  });
});

describe("a partial failure is reported as a partial failure", () => {
  it("saves what it can and reports each item honestly", async () => {
    const h = harness(WS);
    const meeting = await seedMeeting(h);
    const source = await resolveProposalSource(h.scope, meeting.id);

    const results = await accept(h, source, [
      { kind: "task", title: "This one works" },
      { kind: "task", title: "Bad date", dueDate: "2026-13-01" },
      { kind: "note", title: "This note works", body: "Kept." },
      { kind: "note", title: "", body: "Never kept." },
    ]);

    expect(results.map((entry) => entry.ok)).toEqual([
      true,
      false,
      true,
      false,
    ]);
    // Exactly what succeeded exists, and nothing else.
    expect(await activeTaskCount()).toBe(1);
    expect(await activeNoteCount()).toBe(1);
    expect(await countMeetingItemTaskRows()).toBe(1);
  });

  it("never lets a failed item’s message carry storage or SQL text", async () => {
    const h = harness(WS);
    const meeting = await seedMeeting(h);
    const source = await resolveProposalSource(h.scope, meeting.id);
    await h.meetings.archive(meeting.id);

    const results = await accept(h, source, [
      { kind: "task", title: "Refused" },
      { kind: "note", title: "Refused", body: "Refused." },
      { kind: "task", title: "", projectId: "nope" },
    ]);

    for (const entry of results) {
      const message = entry.message ?? "";
      for (const forbidden of [
        "D1_",
        "SQLITE",
        "SELECT ",
        "INSERT ",
        "constraint",
        "meeting_item_tasks",
        "at Object.",
        "sk-",
      ]) {
        expect(message).not.toContain(forbidden);
      }
    }
  });
});

describe("ordinary behaviour is unchanged", () => {
  it("still creates a plain Task when a proposal has no source record", async () => {
    const h = harness(WS);
    const [applied] = await accept(h, null, [
      { kind: "task", title: "A Task with no source" },
    ]);

    expect(applied.ok).toBe(true);
    const task = await h.tasks.getTask(applied.id!);
    expect(task?.title).toBe("A Task with no source");
    expect(await countMeetingItemTaskRows()).toBe(0);
    expect(await countRows("entity_links")).toBe(0);
  });

  it("still creates suggested links, and is idempotent about it", async () => {
    const h = harness(WS);
    const meeting = await seedMeeting(h);
    const target = await seedNote(h, "A linked note");
    const source = await resolveProposalSource(h.scope, meeting.id);
    const items = [{ kind: "link", targetEntityId: target.id }];

    const [first] = await accept(h, source, items);
    const [second] = await accept(h, source, items);

    expect(first.ok).toBe(true);
    expect(first.created).toBe(true);
    expect(second.ok).toBe(true);
    expect(second.created).toBe(false);
    expect(await countRows("entity_links")).toBe(1);
    expect(await linkedIds(h, meeting.id, "link.related")).toEqual([target.id]);
  });

  it("refuses a link to a record that no longer exists", async () => {
    const h = harness(WS);
    const meeting = await seedMeeting(h);
    const target = await seedNote(h, "A linked note");
    const source = await resolveProposalSource(h.scope, meeting.id);
    await h.entities.softDelete(target.id);

    const [applied] = await accept(h, source, [
      { kind: "link", targetEntityId: target.id },
    ]);

    expect(applied.ok).toBe(false);
    expect(await countRows("entity_links")).toBe(0);
  });

  it("refuses an item that is not an object at all", async () => {
    const h = harness(WS);
    const results = await accept(h, null, ["a task please", null, 7]);
    expect(results.every((entry) => !entry.ok)).toBe(true);
    expect(await activeTaskCount()).toBe(0);
  });
});
