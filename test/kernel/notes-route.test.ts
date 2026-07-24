import { beforeEach, describe, expect, it } from "vitest";
import { RouterContextProvider } from "react-router";

import type { AuthenticatedSession } from "~/kernel/auth";
import { setAuthenticatedSession } from "~/platform/request";
import { loader as indexLoader } from "~/modules/notes/routes/index";
import { loader as detailLoader } from "~/modules/notes/routes/detail";
import { action as newAction } from "~/modules/notes/routes/new";
import { action as mutateAction } from "~/modules/notes/routes/mutate";
import { loader as activityLoader } from "~/modules/notes/routes/activity";
import type { CreateNoteResult } from "~/modules/notes/routes/new";
import type { NoteMutationResult } from "~/modules/notes/routes/mutate";

import {
  countNoteDetailRows,
  FakeClock,
  makeActivityRepository,
  makeContext,
  makeRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "test-default-workspace";
const OTHER = "ws_notes_route_other";
const nextEntityId = sequentialIds("noteent");

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

function entities(ws = WS) {
  return makeRepository(makeContext(ws), {
    clock: new FakeClock().now,
    idGenerator: nextEntityId,
  });
}

function formData(entries: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(entries)) form.set(key, value);
  return form;
}

async function runIndex(cursor?: string) {
  const url = cursor
    ? `https://app.test/notes?cursor=${encodeURIComponent(cursor)}`
    : "https://app.test/notes";
  return indexLoader({
    request: new Request(url),
    context: authedContext(),
    params: {},
  } as unknown as Parameters<typeof indexLoader>[0]);
}

async function runNew(form: FormData, method = "POST"): Promise<Response> {
  return newAction({
    request: new Request("https://app.test/notes/new", {
      method,
      body: method === "POST" ? form : undefined,
    }),
    context: authedContext(),
    params: {},
  } as unknown as Parameters<typeof newAction>[0]) as Promise<Response>;
}

async function runMutate(
  noteId: string,
  form: FormData,
  method = "POST",
): Promise<Response> {
  return mutateAction({
    request: new Request(
      `https://app.test/notes/${noteId}/mutate`,
      method === "POST" ? { method, body: form } : { method },
    ),
    context: authedContext(),
    params: { noteId },
  } as unknown as Parameters<typeof mutateAction>[0]) as Promise<Response>;
}

function runDetail(noteId: string) {
  return detailLoader({
    request: new Request(`https://app.test/notes/${noteId}`),
    context: authedContext(),
    params: { noteId },
  } as unknown as Parameters<typeof detailLoader>[0]);
}

async function runActivity(noteId: string): Promise<Response> {
  return activityLoader({
    request: new Request(`https://app.test/notes/${noteId}/activity`),
    context: authedContext(),
    params: { noteId },
  } as unknown as Parameters<typeof activityLoader>[0]) as Promise<Response>;
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

describe("Notes routes", () => {
  it("creates a Note through the trusted /notes/new action and lands on the canonical record", async () => {
    const response = await runNew(formData({ title: "Reading list" }));
    const body = (await response.json()) as CreateNoteResult;
    expect(body.ok).toBe(true);
    if (!body.ok) return;

    const detail = await runDetail(body.noteId);
    expect(detail.overview.title).toBe("Reading list");
    // NOTES-01A: creation writes no `note_details` row for an empty body.
    expect(detail.details.content).toBe("");
    expect(detail.details.contentUpdatedAt).toBeNull();
    expect(await countNoteDetailRows()).toBe(0);
  });

  it("validates a required title and writes nothing on failure", async () => {
    const response = await runNew(formData({ title: "   " }));
    const body = (await response.json()) as CreateNoteResult;
    expect(body.ok).toBe(false);

    const page = await runIndex();
    expect(page.notes).toHaveLength(0);
  });

  it("returns a real 405 for a non-POST create request", async () => {
    await expect(
      runNew(formData({ title: "Note" }), "GET"),
    ).rejects.toMatchObject({ status: 405 });
  });

  it("lists only active Notes in the bound workspace, deterministically ordered", async () => {
    const e = entities();
    const first = await e.create({ type: "note", title: "First" });
    const second = await e.create({ type: "note", title: "Second" });
    const deleted = await e.create({ type: "note", title: "Deleted" });
    await e.softDelete(deleted.id);
    // A different entity type must never leak into the Notes collection.
    await e.create({ type: "widget", title: "Not a note" });
    // A Note in another workspace must never leak into this one.
    await entities(OTHER).create({ type: "note", title: "Other workspace" });

    const page = await runIndex();
    expect(page.failed).toBe(false);
    expect(page.notes.map((n) => n.id).sort()).toEqual(
      [first.id, second.id].sort(),
    );
  });

  it("renames a Note and records Activity — title stays owned by the generic EntityRepository", async () => {
    const note = await entities().create({ type: "note", title: "Old" });

    const response = await runMutate(
      note.id,
      formData({ intent: "rename", title: "New title" }),
    );
    const body = (await response.json()) as NoteMutationResult;
    expect(body).toEqual({ kind: "rename", ok: true });

    const detail = await runDetail(note.id);
    expect(detail.overview.title).toBe("New title");

    const activity = await makeActivityRepository(
      makeContext(WS),
    ).listForEntity(note.id);
    expect(activity.items.some((item) => item.type === "entity.updated")).toBe(
      true,
    );
  });

  it("updates Markdown content via the mutate route, preserving the exact source", async () => {
    const note = await entities().create({ type: "note", title: "Note" });
    const source = "# Heading\n\n- one\n- two\n\nTrailing whitespace  \n\n\n";

    const response = await runMutate(
      note.id,
      formData({ intent: "update_content", content: source }),
    );
    const body = (await response.json()) as NoteMutationResult;
    expect(body).toEqual({ kind: "update_content", ok: true });

    const detail = await runDetail(note.id);
    expect(detail.details.content).toBe(source);
    expect(detail.details.contentUpdatedAt).not.toBeNull();
  });

  it("preserves whitespace-only and empty content exactly", async () => {
    const note = await entities().create({ type: "note", title: "Note" });

    await runMutate(
      note.id,
      formData({ intent: "update_content", content: "   \n  " }),
    );
    let detail = await runDetail(note.id);
    expect(detail.details.content).toBe("   \n  ");

    await runMutate(
      note.id,
      formData({ intent: "update_content", content: "" }),
    );
    detail = await runDetail(note.id);
    expect(detail.details.content).toBe("");
  });

  it("does not add a duplicate Activity event when saving unchanged content", async () => {
    const note = await entities().create({ type: "note", title: "Note" });
    await runMutate(
      note.id,
      formData({ intent: "update_content", content: "Same content" }),
    );
    const activityRepo = makeActivityRepository(makeContext(WS));
    const before = await activityRepo.listForEntity(note.id);
    const beforeCount = before.items.filter(
      (item) => item.type === "note.content_updated",
    ).length;
    expect(beforeCount).toBe(1);

    // Saving the exact same content again must be a no-op — no second event.
    await runMutate(
      note.id,
      formData({ intent: "update_content", content: "Same content" }),
    );
    const after = await activityRepo.listForEntity(note.id);
    const afterCount = after.items.filter(
      (item) => item.type === "note.content_updated",
    ).length;
    expect(afterCount).toBe(1);
  });

  it("returns a typed validation error for oversized content, writing nothing", async () => {
    const note = await entities().create({ type: "note", title: "Note" });
    const tooLarge = "a".repeat(1024 * 1024 + 1);

    const response = await runMutate(
      note.id,
      formData({ intent: "update_content", content: tooLarge }),
    );
    const body = (await response.json()) as NoteMutationResult;
    expect(body.kind).toBe("update_content");
    expect(body.ok).toBe(false);
    if (body.kind === "update_content" && !body.ok) {
      expect(body.fieldErrors?.content).toBeTruthy();
    }

    const detail = await runDetail(note.id);
    expect(detail.details.content).toBe("");
  });

  it("rejects an unknown mutation intent with a calm typed error, mutating nothing", async () => {
    const note = await entities().create({ type: "note", title: "Note" });
    const response = await runMutate(note.id, formData({ intent: "bogus" }));
    expect(response.status).toBe(400);
    const body = (await response.json()) as NoteMutationResult;
    expect(body.ok).toBe(false);
  });

  it("returns a real 405 for a non-POST mutate request", async () => {
    const note = await entities().create({ type: "note", title: "Note" });
    await expect(
      runMutate(note.id, formData({ intent: "rename" }), "GET"),
    ).rejects.toMatchObject({ status: 405 });
  });

  it("fails closed with a calm 404 for missing, deleted, wrong-type and cross-workspace Note ids (detail, mutate, activity)", async () => {
    const e = entities();
    const note = await e.create({ type: "note", title: "Deleted" });
    const wrongType = await e.create({ type: "widget", title: "Not a note" });
    await e.softDelete(note.id);
    const otherNote = await entities(OTHER).create({
      type: "note",
      title: "Other",
    });

    for (const id of ["nonexistent", note.id, wrongType.id, otherNote.id]) {
      await expect(runDetail(id)).rejects.toMatchObject({ status: 404 });
      const activity = await runActivity(id);
      expect(activity.status).toBe(404);
      await expect(
        runMutate(id, formData({ intent: "rename", title: "X" })),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        runMutate(id, formData({ intent: "update_content", content: "X" })),
      ).rejects.toMatchObject({ status: 404 });
    }
  });

  it("returns bounded Activity pages containing creation, rename and content-update events", async () => {
    const response = await runNew(formData({ title: "Note" }));
    const body = (await response.json()) as CreateNoteResult;
    expect(body.ok).toBe(true);
    if (!body.ok) return;

    await runMutate(
      body.noteId,
      formData({ intent: "rename", title: "Renamed" }),
    );
    await runMutate(
      body.noteId,
      formData({ intent: "update_content", content: "Hello" }),
    );

    const activity = await runActivity(body.noteId);
    expect(activity.status).toBe(200);
    const page = (await activity.json()) as {
      items: readonly { type: string }[];
    };
    const types = page.items.map((item) => item.type);
    expect(types).toContain("entity.created");
    expect(types).toContain("entity.updated");
    expect(types).toContain("note.content_updated");
  });
});
