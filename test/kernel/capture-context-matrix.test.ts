import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { RouterContextProvider } from "react-router";

import type { AuthenticatedSession } from "~/kernel/auth";
import { setAuthenticatedSession } from "~/platform/request";
import { action as taskCreateAction } from "~/modules/tasks/routes/new";
import { action as noteCreateAction } from "~/modules/notes/routes/new";
import { action as meetingCreateAction } from "~/modules/meetings/routes/create";
import { action as diaryCreateAction } from "~/modules/diary/routes/new";
import type { TasksCreateResult } from "~/modules/tasks/tasks-contract";
import type { CreateDiaryEntryResult } from "~/modules/diary/routes/new";
import type { CaptureContextContract } from "~/shared/capture/capture-context";

import {
  FakeClock,
  makeContext,
  makeLinkRepository,
  makePersonRepository,
  makeRepository,
  makeSpineRepository,
  resetTables,
  sequentialIds,
} from "./support";

/**
 * PEOPLE-04 / DEBT-45 — the contextual-capture CLOSURE matrix, over the real
 * Worker/D1 runtime.
 *
 * ADR-060 already had the contract; what it did not have was proof that all four
 * canonical creation routes keep it, that a retry cannot double a relationship,
 * and that a foreign or vanished anchor fails closed. Each capture type is
 * exercised from the SAME Person source the Person record's overflow uses, and
 * asserted on the CANONICAL relationship each one is supposed to produce:
 *
 *   Task    → `task.relates_to`  Task    → Person   (related work, never delegation)
 *   Note    → `link.related`     Note    → Person
 *   Meeting → `meeting.attendee` Meeting → Person   (Meetings own attendee semantics)
 *   Diary   → `link.related`     Diary   → Person
 *
 * The isolation cases assert the shape that matters for a security boundary: a
 * cross-workspace anchor produces NO link and discloses nothing about whether the
 * foreign record exists — it is simply a create without a context.
 */

const WS = "test-default-workspace";
const OTHER = "ws_capture_matrix_other";

function authedContext(): RouterContextProvider {
  const session: AuthenticatedSession = {
    user: { subject: "owner", email: "owner@example.com", displayName: null },
    issuedAt: new Date(0),
    expiresAt: new Date(Date.parse("2999-01-01")),
  };
  const context = new RouterContextProvider();
  setAuthenticatedSession(context, session);
  return context;
}

function people(workspaceId = WS) {
  return makePersonRepository(makeContext(workspaceId), {
    clock: new FakeClock().now,
    idGenerator: sequentialIds(`person-${workspaceId}`),
  });
}

function spine() {
  return makeSpineRepository(makeContext(WS), {
    clock: new FakeClock().now,
    idGenerator: sequentialIds("spine"),
  });
}

function personContext(person: {
  readonly id: string;
  readonly title: string;
}): string {
  const context: CaptureContextContract = {
    sourceEntityId: person.id,
    sourceEntityType: "person",
    sourceEntityTitle: person.title,
    sourceModule: "people",
    originatingRoute: `/person/${person.id}`,
    relationshipMeaning: "related",
    mode: "removable",
    returnTo: `/person/${person.id}`,
  };
  return JSON.stringify(context);
}

function formData(entries: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(entries)) form.set(key, value);
  return form;
}

type RouteAction = (args: {
  request: Request;
  context: RouterContextProvider;
  params: Record<string, string>;
}) => Promise<Response>;

async function post(
  action: unknown,
  path: string,
  entries: Record<string, string>,
): Promise<unknown> {
  const response = (await (action as RouteAction)({
    request: new Request(`https://app.test${path}`, {
      method: "POST",
      body: formData(entries),
    }),
    context: authedContext(),
    params: {},
  })) as Response;
  return await response.json();
}

/** Every live link of `type` anchored on `sourceId`, ordered deterministically. */
async function linksFrom(sourceId: string, type: string) {
  const rows = await env.DB.prepare(
    `SELECT target_entity_id AS targetEntityId
       FROM entity_links
      WHERE workspace_id = ?
        AND source_entity_id = ?
        AND type = ?
        AND deleted_at IS NULL
      ORDER BY target_entity_id`,
  )
    .bind(WS, sourceId, type)
    .all<{ targetEntityId: string }>();
  return rows.results.map((row) => row.targetEntityId);
}

/** Every live link touching `entityId` in either direction — for "no link at all". */
async function anyLinksTouching(entityId: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n
       FROM entity_links
      WHERE workspace_id = ?
        AND deleted_at IS NULL
        AND (source_entity_id = ? OR target_entity_id = ?)`,
  )
    .bind(WS, entityId, entityId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

async function createTask(entries: Record<string, string>) {
  return (await post(taskCreateAction, "/tasks/new", {
    intent: "create",
    ...entries,
  })) as TasksCreateResult;
}

async function createNote(entries: Record<string, string>) {
  return (await post(noteCreateAction, "/notes/new", entries)) as
    | { readonly ok: true; readonly noteId: string }
    | { readonly ok: false; readonly formError?: string };
}

async function createMeeting(entries: Record<string, string>) {
  return (await post(meetingCreateAction, "/meetings/create", {
    startsAtLocal: "2026-05-20T09:00",
    ...entries,
  })) as {
    readonly ok: boolean;
    readonly meetingId?: string;
    readonly formError?: string;
  };
}

async function createDiary(entries: Record<string, string>) {
  return (await post(
    diaryCreateAction,
    "/diary/new",
    entries,
  )) as CreateDiaryEntryResult;
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

describe("Person contextual capture creates the canonical relationship", () => {
  it("links a captured Task to the Person as related work", async () => {
    const person = await people().create({ title: "Vaughn Smith" });
    const result = await createTask({
      title: "Send Vaughn the brief",
      captureContext: personContext({
        id: person.id,
        title: person.title,
      }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(await linksFrom(result.taskId, "task.relates_to")).toEqual([
      person.id,
    ]);
    // Person context is RELATED work, never delegation — nothing structural is
    // invented, so the Task stays in Inbox.
    expect(await linksFrom(result.taskId, "task.belongs_to_project")).toEqual(
      [],
    );
    expect(await linksFrom(result.taskId, "task.belongs_to_area")).toEqual([]);
  });

  it("links a captured Note to the Person", async () => {
    const person = await people().create({ title: "Vaughn Smith" });
    const result = await createNote({
      title: "Notes from coffee",
      captureContext: personContext({
        id: person.id,
        title: person.title,
      }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(await linksFrom(result.noteId, "link.related")).toEqual([person.id]);
  });

  it("gives a captured Meeting the canonical attendee relationship", async () => {
    const person = await people().create({ title: "Vaughn Smith" });
    const result = await createMeeting({
      title: "Catch up",
      captureContext: personContext({
        id: person.id,
        title: person.title,
      }),
    });

    expect(result.ok).toBe(true);
    const meetingId = result.meetingId!;
    // The Meetings module owns attendee semantics; contextual capture uses THAT,
    // not a generic link that would sit outside the module's rules.
    expect(await linksFrom(meetingId, "meeting.attendee")).toEqual([person.id]);
    expect(await linksFrom(meetingId, "link.related")).toEqual([]);
  });

  it("links a captured Diary entry to the Person", async () => {
    const person = await people().create({ title: "Vaughn Smith" });
    const result = await createDiary({
      title: "Coffee with Vaughn",
      entryType: "note",
      captureContext: personContext({
        id: person.id,
        title: person.title,
      }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(await linksFrom(result.entryId, "link.related")).toEqual([
      person.id,
    ]);
  });
});

describe("Contextual capture is safe to retry", () => {
  it("does not duplicate the Meeting attendee link when the same attendee is also submitted", async () => {
    const person = await people().create({ title: "Vaughn Smith" });
    const result = await createMeeting({
      title: "Catch up",
      attendeeIds: person.id,
      captureContext: personContext({
        id: person.id,
        title: person.title,
      }),
    });

    expect(result.ok).toBe(true);
    // The attendee arrives twice — once from the picker, once from the context.
    // EntityLink creation is idempotent, so the relationship exists exactly once.
    expect(await linksFrom(result.meetingId!, "meeting.attendee")).toEqual([
      person.id,
    ]);
  });

  it("keeps exactly one relationship when the same contextual link is created twice", async () => {
    const person = await people().create({ title: "Vaughn Smith" });
    const first = await createDiary({
      title: "Coffee with Vaughn",
      entryType: "note",
      captureContext: personContext({
        id: person.id,
        title: person.title,
      }),
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    // Re-running the relationship half — what a network retry after a lost
    // response does — must be a no-op, not a second row.
    const links = makeLinkRepository(makeContext(WS), {
      clock: new FakeClock().now,
      idGenerator: sequentialIds("relink"),
    });
    await links.create({
      sourceEntityId: first.entryId,
      targetEntityId: person.id,
      type: "link.related",
    });

    expect(await linksFrom(first.entryId, "link.related")).toEqual([person.id]);
  });
});

describe("Contextual capture is workspace-isolated and revalidated", () => {
  it("refuses a Person anchor from another workspace without disclosing it", async () => {
    const foreign = await people(OTHER).create({ title: "Foreign" });

    const result = await createDiary({
      title: "Entry with a foreign anchor",
      entryType: "note",
      captureContext: personContext({
        id: foreign.id,
        title: "Foreign",
      }),
    });

    // The create SUCCEEDS — the entry is the user's own, and refusing it would
    // both lose their words and confirm that some id exists elsewhere. What must
    // not happen is a relationship crossing the isolation boundary.
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(await anyLinksTouching(result.entryId)).toBe(0);
  });

  it("refuses a source that was deleted between opening capture and submitting it", async () => {
    const person = await people().create({ title: "Gone" });
    await makeRepository(makeContext(WS), {
      clock: new FakeClock().now,
      idGenerator: sequentialIds("ent"),
    }).softDelete(person.id);

    const result = await createNote({
      title: "Note about someone deleted",
      captureContext: personContext({
        id: person.id,
        title: "Gone",
      }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(await anyLinksTouching(result.noteId)).toBe(0);
  });

  it("refuses a context whose claimed type does not match the stored record", async () => {
    const s = spine();
    const area = await s.createArea({ title: "Area" });
    const project = await s.createProject({
      title: "Real project",
      parent: { kind: "area", id: area.id },
    });

    // The client claims the project id is a Person. The server reads the entity
    // and disagrees, so no relationship is written and the Person matrix entry is
    // never reached.
    const result = await createDiary({
      title: "Mismatched context",
      entryType: "note",
      captureContext: personContext({ id: project.id, title: "Real project" }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(await anyLinksTouching(result.entryId)).toBe(0);
  });
});
