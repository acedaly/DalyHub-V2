/**
 * PWA-04 — the seven-day snapshot, built from REAL workspace repositories.
 *
 * This is where the retention boundaries stop being arithmetic and start being a
 * query: a task scheduled eight days out must NOT reach the device, an overdue
 * one from three weeks ago MUST, and neither answer can be verified without the
 * real repositories the online loaders use.
 *
 * It also holds the data-minimisation contract. The strongest form of that test
 * is not "the fields I expected are present" but "no field I did not expect is",
 * so the snapshot is walked and asserted against an allow-list — which is what
 * catches a future field being added to a repository projection and silently
 * flowing onto every owner's device.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { buildOfflineSnapshot } from "~/platform/offline";
import type { WorkspaceScope } from "~/platform/workspaces";

import {
  makeContext,
  makeDiaryRepository,
  makeLinkRepository,
  makeMeetingRepository,
  makeNoteRepository,
  makeNoteDetailsRepository,
  makeRepository,
  makeSpineRepository,
  makeTaskRepository,
  resetTables,
} from "./support";

const WS = "offline_snapshot_ws";
const SUBJECT = "offline-subject";
const SYDNEY = "Australia/Sydney";

/** 2 August 2026, 09:00 in Sydney — which is still 1 August in UTC. */
const NOW = new Date("2026-08-01T23:00:00.000Z");

/** Only the repositories the snapshot builder actually reads. */
function scope(): WorkspaceScope {
  const context = makeContext(WS);
  return {
    context,
    tasks: makeTaskRepository(context),
    notes: makeNoteRepository(context),
    diary: makeDiaryRepository(context),
    meetings: makeMeetingRepository(context),
    entityLinks: makeLinkRepository(context),
  } as unknown as WorkspaceScope;
}

async function build() {
  return buildOfflineSnapshot({
    scope: scope(),
    subject: SUBJECT,
    identityLabel: "owner@example.test",
    workspaceLabel: "DalyHub",
    timezone: SYDNEY,
    now: NOW,
  });
}

describe("the seven-day snapshot — D1", () => {
  beforeEach(async () => {
    await resetTables([WS]);
  });

  it("resolves its window in the OWNER's timezone, not the runtime's", async () => {
    const snapshot = await build();
    // The runtime instant is 1 August in UTC; the owner's calendar day is the 2nd.
    expect(NOW.toISOString().slice(0, 10)).toBe("2026-08-01");
    expect(snapshot.window.todayIso).toBe("2026-08-02");
    expect(snapshot.window.startIso).toBe("2026-07-26");
    expect(snapshot.window.endIso).toBe("2026-08-09");
    expect(snapshot.window.timezone).toBe(SYDNEY);
  });

  it("identifies itself by an opaque namespace, never by the workspace id", async () => {
    const snapshot = await build();
    expect(snapshot.namespace).toMatch(/^dh1-\d+-[0-9a-f]{32}$/);
    expect(JSON.stringify(snapshot)).not.toContain(WS);
    expect(JSON.stringify(snapshot)).not.toContain(SUBJECT);
  });

  it("keeps tasks inside the window and drops the ones beyond it", async () => {
    const tasks = makeTaskRepository(makeContext(WS));
    const inside = await tasks.createTask({
      title: "Inside the window",
      parent: null,
      scheduledDate: "2026-08-05",
    });
    const beyond = await tasks.createTask({
      title: "Beyond the window",
      parent: null,
      scheduledDate: "2026-08-20",
    });

    const snapshot = await build();
    const ids = snapshot.tasks.map((task) => task.id);
    expect(ids).toContain(inside.id);
    expect(ids).not.toContain(beyond.id);
  });

  it("keeps an OPEN overdue task however old it is", async () => {
    // An overdue task is still owed. Dropping it because it fell out of the
    // seven-day window would hide exactly the work the owner most needs offline.
    const tasks = makeTaskRepository(makeContext(WS));
    const ancient = await tasks.createTask({
      title: "Long overdue",
      parent: null,
      scheduledDate: "2026-06-01",
    });
    const snapshot = await build();
    expect(snapshot.tasks.map((task) => task.id)).toContain(ancient.id);
    expect(snapshot.today.overdueCount).toBeGreaterThanOrEqual(1);
  });

  it("keeps the boundary days and excludes the day either side", async () => {
    const tasks = makeTaskRepository(makeContext(WS));
    const lastDay = await tasks.createTask({
      title: "Final retained day",
      parent: null,
      scheduledDate: "2026-08-09",
    });
    const dayAfter = await tasks.createTask({
      title: "One day too far",
      parent: null,
      scheduledDate: "2026-08-10",
    });
    const snapshot = await build();
    const ids = snapshot.tasks.map((task) => task.id);
    expect(ids).toContain(lastDay.id);
    expect(ids).not.toContain(dayAfter.id);
  });

  it("carries the tasks the owner is WAITING on, which planning excludes", async () => {
    // `listPlanningTasks` deliberately omits waiting tasks — Today separates
    // "what I can do" from "what I am blocked on". Offline has no such
    // separation: a task blocked on someone else is exactly what an owner needs
    // to see when they cannot reach DalyHub. Without the second read this
    // section would quietly claim there was no blocked work at all.
    const tasks = makeTaskRepository(makeContext(WS));
    const blocked = await tasks.createTask({
      title: "Waiting on the builder",
      parent: null,
      scheduledDate: "2026-08-05",
    });
    await tasks.setWaiting(blocked.id, {
      target: { kind: "text", note: "Quote promised Friday" },
    });

    const snapshot = await build();
    const stored = snapshot.tasks.find((task) => task.id === blocked.id);
    expect(stored).toBeDefined();
    expect(stored?.waiting).toBe(true);
  });

  it("never stores a waiting task twice", async () => {
    const tasks = makeTaskRepository(makeContext(WS));
    const blocked = await tasks.createTask({
      title: "Waiting once",
      parent: null,
      scheduledDate: "2026-08-05",
    });
    await tasks.setWaiting(blocked.id, {
      target: { kind: "text", note: "Someone else" },
    });
    const snapshot = await build();
    const occurrences = snapshot.tasks.filter(
      (task) => task.id === blocked.id,
    ).length;
    expect(occurrences).toBe(1);
  });

  it("applies the SAME window rule to waiting work as to everything else", async () => {
    const tasks = makeTaskRepository(makeContext(WS));
    const beyond = await tasks.createTask({
      title: "Waiting, far beyond the window",
      parent: null,
      scheduledDate: "2026-09-30",
    });
    await tasks.setWaiting(beyond.id, {
      target: { kind: "text", note: "Not soon" },
    });
    const snapshot = await build();
    expect(snapshot.tasks.map((task) => task.id)).not.toContain(beyond.id);
  });

  it("loses only the waiting tasks, not the whole section, if that read fails", async () => {
    const base = scope();
    const planned = await makeTaskRepository(makeContext(WS)).createTask({
      title: "Still planned",
      parent: null,
      scheduledDate: "2026-08-05",
    });
    const broken = {
      ...base,
      tasks: {
        ...base.tasks,
        listPlanningTasks: base.tasks.listPlanningTasks.bind(base.tasks),
        listWaitingTasks: async () => {
          throw new Error("D1 was unavailable");
        },
      },
    } as unknown as WorkspaceScope;

    const snapshot = await buildOfflineSnapshot({
      scope: broken,
      subject: SUBJECT,
      identityLabel: "owner@example.test",
      workspaceLabel: "DalyHub",
      timezone: SYDNEY,
      now: NOW,
    });
    expect(snapshot.tasks.map((task) => task.id)).toContain(planned.id);
  });

  it("stores only the minimised task fields", async () => {
    const tasks = makeTaskRepository(makeContext(WS));
    await tasks.createTask({
      title: "Minimal",
      parent: null,
      scheduledDate: "2026-08-02",
      priority: "p1",
    });
    const snapshot = await build();
    const task = snapshot.tasks[0];
    // The allow-list. A new field on the repository projection must be a
    // DELIBERATE decision to put it on every owner's device, not a side effect.
    expect(Object.keys(task).sort()).toEqual(
      [
        "completedAt",
        "dueDate",
        "id",
        "parentId",
        "parentLabel",
        "priority",
        "scheduledDate",
        "status",
        "timeSector",
        "title",
        "updatedAt",
        "waiting",
      ].sort(),
    );
  });

  it("stores a note as a bounded excerpt, never its full Markdown body", async () => {
    const context = makeContext(WS);
    const entities = makeRepository(context);
    const details = makeNoteDetailsRepository(context);
    const note = await entities.create({ type: "note", title: "A long note" });
    await details.update(note.id, "Sensitive detail. ".repeat(200));

    const snapshot = await build();
    const stored = snapshot.notes.find((item) => item.id === note.id);
    expect(stored).toBeDefined();
    expect(Object.keys(stored!).sort()).toEqual(
      ["excerpt", "id", "tags", "title", "truncated", "updatedAt"].sort(),
    );
    // The stored text is bounded and is NOT the note's body, and the record says
    // so — a short excerpt must never read as a complete note.
    expect(stored!.truncated).toBe(true);
    expect(stored!.excerpt.length).toBeLessThanOrEqual(600);
    expect(stored!.excerpt.length).toBeLessThan(
      "Sensitive detail. ".repeat(200).length,
    );
  });

  it("keeps diary entries inside the window and stores them as excerpts", async () => {
    const diary = makeDiaryRepository(makeContext(WS));
    const inside = await diary.create({
      entryType: "note",
      title: "Today's moment",
      body: "Body text.",
      timezone: SYDNEY,
      occurredAt: new Date("2026-08-01T23:30:00.000Z"),
    });
    const outside = await diary.create({
      entryType: "note",
      title: "Last month",
      body: "Old.",
      timezone: SYDNEY,
      occurredAt: new Date("2026-06-01T00:00:00.000Z"),
    });

    const snapshot = await build();
    const ids = snapshot.diary.map((entry) => entry.id);
    expect(ids).toContain(inside.id);
    expect(ids).not.toContain(outside.id);
    expect(Object.keys(snapshot.diary[0]).sort()).toEqual(
      ["entryType", "excerpt", "id", "occurredAt", "title", "truncated"].sort(),
    );
  });

  it("keeps meetings inside the window and drops the ones beyond it", async () => {
    const meetings = makeMeetingRepository(makeContext(WS));
    const soon = await meetings.create({
      title: "This week",
      startsAt: "2026-08-04T01:00:00.000Z",
      timezone: SYDNEY,
    });
    const distant = await meetings.create({
      title: "Next month",
      startsAt: "2026-09-15T01:00:00.000Z",
      timezone: SYDNEY,
    });

    const snapshot = await build();
    const ids = snapshot.meetings.map((meeting) => meeting.id);
    expect(ids).toContain(soon.id);
    expect(ids).not.toContain(distant.id);
    expect(Object.keys(snapshot.meetings[0]).sort()).toEqual(
      ["attendeeLabels", "heldAt", "id", "startsAt", "title"].sort(),
    );
  });

  it("copies no Projects or Areas the retained records do not reference", async () => {
    const context = makeContext(WS);
    const spine = makeSpineRepository(context);
    const tasks = makeTaskRepository(context);

    const area = await spine.createArea({ title: "Referenced area" });
    await spine.createArea({ title: "Unreferenced area" });
    await tasks.createTask({
      title: "Task in an area",
      parent: { kind: "area", id: area.id },
      scheduledDate: "2026-08-02",
    });

    const snapshot = await build();
    const labels = snapshot.references.map((reference) => reference.label);
    expect(labels).toContain("Referenced area");
    // The bulk copy this milestone forbids would have brought this along.
    expect(labels).not.toContain("Unreferenced area");
    expect(Object.keys(snapshot.references[0]).sort()).toEqual([
      "id",
      "kind",
      "label",
    ]);
  });

  it("carries no credential, token, header or Activity anywhere in the payload", async () => {
    const tasks = makeTaskRepository(makeContext(WS));
    await tasks.createTask({
      title: "Anything",
      parent: null,
      scheduledDate: "2026-08-02",
    });
    const serialised = JSON.stringify(await build()).toLowerCase();
    for (const forbidden of [
      "token",
      "jwt",
      "cookie",
      "authorization",
      "cf-access",
      "activity",
      "deletedat",
      "workspaceid",
    ]) {
      expect(serialised).not.toContain(forbidden);
    }
  });

  it("still produces a usable snapshot for an empty workspace", async () => {
    const snapshot = await build();
    expect(snapshot.tasks).toEqual([]);
    expect(snapshot.notes).toEqual([]);
    expect(snapshot.diary).toEqual([]);
    expect(snapshot.meetings).toEqual([]);
    expect(snapshot.bounded).toBe(false);
    expect(snapshot.today).toEqual({
      dueTodayCount: 0,
      overdueCount: 0,
      upcomingCount: 0,
      completedRecentlyCount: 0,
      meetingsTodayCount: 0,
    });
  });

  it("degrades to an empty section rather than failing the whole snapshot", async () => {
    // A device with five of six sections is far better than a device with none.
    const broken = {
      ...scope(),
      diary: {
        list: async () => {
          throw new Error("D1 was unavailable");
        },
      },
    } as unknown as WorkspaceScope;

    const snapshot = await buildOfflineSnapshot({
      scope: broken,
      subject: SUBJECT,
      identityLabel: "owner@example.test",
      workspaceLabel: "DalyHub",
      timezone: SYDNEY,
      now: NOW,
    });
    expect(snapshot.diary).toEqual([]);
    expect(snapshot.window.todayIso).toBe("2026-08-02");
  });
});
