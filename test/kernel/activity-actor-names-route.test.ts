import { env } from "cloudflare:test";
import { RouterContextProvider } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";

import type { AuthenticatedSession } from "~/kernel/auth";
import { parseWorkspaceId } from "~/kernel/workspaces";
import { TASK_RELATES_TO } from "~/shared/task-record/task-view";
import { convertMeetingItemToTask } from "~/platform/meetings";
import { loader as todayActivityLoader } from "~/modules/today/routes/activity";
import { loader as taskActivityLoader } from "~/modules/tasks/routes/task-activity";
import {
  provisionMemberSafely,
  setAuthenticatedSession,
} from "~/platform/request";
import { createWorkspaceMemberRepository } from "~/platform/storage/d1";
import {
  resolveAuthenticatedWorkspaceScope,
  resolveWorkspaceScope,
} from "~/platform/workspaces";

import { makeContext, makeWorkspaceRepository, resetTables } from "./support";

/**
 * IDENT-01 — the bug end to end, in the real Workers runtime over real D1.
 *
 * Production activity read `Someone · Added diary entry — …` for events the
 * authenticated owner had performed. These tests drive the ACTUAL route loaders
 * that render those feeds and assert every event names the real person: diary
 * capture, task creation, a meeting item converted to a task, entity links and a
 * People link, on both the workspace feed and a record Timeline.
 */

const WS = "test-default-workspace";
const SUB = "access-sub-aidan";
const EMAIL = "aidan@daly.id.au";

function session(displayName: string | null = null): AuthenticatedSession {
  return {
    user: { subject: SUB, email: EMAIL, displayName },
    issuedAt: new Date(0),
    expiresAt: new Date(Date.parse("2999-01-01")),
  };
}

function authedContext(s: AuthenticatedSession = session()) {
  const context = new RouterContextProvider();
  setAuthenticatedSession(context, s);
  return context;
}

const boundaryEnv = { DB: env.DB, DEFAULT_WORKSPACE_ID: WS };

async function scope() {
  return resolveAuthenticatedWorkspaceScope(boundaryEnv, session());
}

async function readTodayFeed() {
  const response = await todayActivityLoader({
    request: new Request("https://app.test/today/activity"),
    context: authedContext(),
    params: {},
  } as unknown as Parameters<typeof todayActivityLoader>[0]);
  return (await (response as Response).json()) as {
    items: {
      type: string;
      isKnownType: boolean;
      actor: { label: string; initials: string; kind: string; source: string };
      presentation: { segments: { kind: string; text?: string }[] };
    }[];
  };
}

/** The visible sentence for an item, exactly as the shared renderer composes it. */
function line(item: {
  actor: { label: string };
  presentation: { segments: { kind: string; text?: string }[] };
}): string {
  return item.presentation.segments
    .map((segment) =>
      segment.kind === "actor"
        ? item.actor.label
        : (segment.text ?? "«record»"),
    )
    .join("");
}

/**
 * Do one of each of the user-initiated mutations named in the bug report, all
 * through the SAME authenticated composition a request uses.
 */
async function seedTheReportedActivity() {
  const s = await scope();

  const area = await s.spine.createArea({ title: "NSW RFS" });
  const project = await s.spine.createProject({
    title: "Need to finalise the OpO Module pathways",
    parent: { kind: "area", id: area.id },
  });
  await s.diary.create({
    entryType: "meeting",
    title: "Handover with Vaughn completed",
  });
  const task = await s.spine.createTask({
    title: "Draft the pathway matrix",
    parent: { kind: "project", id: project.id },
  });
  const person = await s.people.create({ title: "Vaughn Reed", email: EMAIL });
  const meeting = await s.meetings.create({
    title: "Team Catch up",
    startsAt: "2026-08-01T09:00:00.000Z",
    timezone: "UTC",
  });

  // The two link shapes from the report, plus a People link.
  await s.entityLinks.create({
    type: TASK_RELATES_TO,
    sourceEntityId: project.id,
    targetEntityId: meeting.id,
  });
  await s.entityLinks.create({
    type: "person.linked_project",
    sourceEntityId: person.id,
    targetEntityId: project.id,
  });

  // The meeting item conversion — the event that rendered as unrecognised.
  const item = await s.meetings.addItem(meeting.id, "agenda", "Chase the OpO");
  await convertMeetingItemToTask(s, meeting.id, item.id, {
    title: "Chase the OpO",
    parent: { kind: "area", id: area.id },
  });

  return { area, project, task, person, meeting };
}

describe("authenticated activity shows the real user's name", () => {
  beforeEach(async () => {
    await resetTables();
    await makeWorkspaceRepository().create({ id: parseWorkspaceId(WS) });
  });

  it("names the owner on every reported event type, and recognises them all", async () => {
    // The request boundary provisions membership; the owner's Person record is
    // linked, exactly as the production repair leaves it.
    await provisionMemberSafely(boundaryEnv, session());
    const seeded = await seedTheReportedActivity();
    await createWorkspaceMemberRepository(env.DB, makeContext(WS)).linkPerson(
      SUB,
      seeded.person.id,
    );

    const feed = await readTodayFeed();
    expect(feed.items.length).toBeGreaterThan(8);

    for (const item of feed.items) {
      expect(item.actor.label, item.type).toBe("Vaughn Reed");
      expect(item.actor.label, item.type).not.toBe("Someone");
      expect(item.actor.kind, item.type).toBe("person");
      expect(item.actor.initials, item.type).toBe("VR");
      // Every persisted type has a formatter, so nothing renders as
      // "Unrecognised event" any more.
      expect(item.isKnownType, item.type).toBe(true);
      expect(line(item), item.type).not.toContain("Someone");
    }

    // The specific lines from the bug report now read as sentences.
    const types = feed.items.map((item) => item.type);
    expect(types).toContain("diary_entry.created");
    expect(types).toContain("meeting.item_converted_to_task");
    expect(types).toContain("entity_link.created");

    const conversion = feed.items.find(
      (item) => item.type === "meeting.item_converted_to_task",
    )!;
    expect(line(conversion)).toContain("Vaughn Reed");
    expect(line(conversion)).not.toContain("meeting.item_converted_to_task");

    const diary = feed.items.find(
      (item) => item.type === "diary_entry.created",
    )!;
    expect(line(diary).startsWith("Vaughn Reed")).toBe(true);
  });

  it("uses the same name on a record Timeline as on the workspace feed", async () => {
    await provisionMemberSafely(boundaryEnv, session("Aidan Daly"));
    const seeded = await seedTheReportedActivity();

    const response = await taskActivityLoader({
      request: new Request(`https://app.test/task/${seeded.task.id}/activity`),
      context: authedContext(),
      params: { taskId: seeded.task.id },
    } as unknown as Parameters<typeof taskActivityLoader>[0]);
    const timeline = (await (response as Response).json()) as {
      items: { actor: { label: string; source: string } }[];
    };

    expect(timeline.items.length).toBeGreaterThan(0);
    for (const item of timeline.items) {
      // No Person link here, so the provider display name is used — the SAME
      // canonical rule, one step further down the order.
      expect(item.actor.label).toBe("Aidan Daly");
      expect(item.actor.source).toBe("auth_name");
    }

    const feed = await readTodayFeed();
    expect(new Set(feed.items.map((item) => item.actor.label))).toEqual(
      new Set(["Aidan Daly"]),
    );
  });

  it("falls back to the verified email, never to an anonymous placeholder", async () => {
    await provisionMemberSafely(boundaryEnv, session());
    await seedTheReportedActivity();

    const feed = await readTodayFeed();
    for (const item of feed.items) {
      expect(item.actor.label).toBe(EMAIL);
      expect(item.actor.source).toBe("email");
    }
  });

  it("shows Unknown user when an actor has no membership at all", async () => {
    // No provisioning: the events carry a stable actor id nothing can resolve.
    await seedTheReportedActivity();

    const feed = await readTodayFeed();
    for (const item of feed.items) {
      expect(item.actor.label).toBe("Unknown user");
      expect(item.actor.kind).toBe("unknown");
    }
  });

  it("shows System for genuinely system-initiated activity", async () => {
    const systemScope = await resolveWorkspaceScope(boundaryEnv);
    await systemScope.entities.create({
      type: "widget",
      title: "a scheduled thing",
    });

    const feed = await readTodayFeed();
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0]!.actor.label).toBe("System");
    expect(feed.items[0]!.actor.kind).toBe("system");
    expect(feed.items[0]!.actor.initials).toBe("");
  });

  it("keeps the actor on the record through the repository and API layers", async () => {
    await provisionMemberSafely(boundaryEnv, session("Aidan Daly"));
    await seedTheReportedActivity();

    // The repository read still carries the trusted actor…
    const s = await scope();
    const page = await s.activity.listForWorkspace();
    for (const record of page.items) {
      expect(record.actor).toEqual({ type: "user", id: SUB });
    }

    // …and the serialised API payload carries the resolved identity, while never
    // exposing the Access subject to the client.
    const feed = await readTodayFeed();
    expect(JSON.stringify(feed)).not.toContain(SUB);
    for (const item of feed.items) {
      expect(item.actor.label).toBe("Aidan Daly");
    }
  });
});
