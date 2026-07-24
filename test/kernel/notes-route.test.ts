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

async function runIndex(cursor?: string, state?: "active" | "deleted") {
  const url = new URL("https://app.test/notes");
  if (cursor) url.searchParams.set("cursor", cursor);
  if (state) url.searchParams.set("state", state);
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

  describe("Note lifecycle — soft-delete & restore (NOTES-01C)", () => {
    it("deletes through the generic EntityRepository.softDelete, disappears from the active collection, and appears in the deleted-only collection", async () => {
      const note = await entities().create({
        type: "note",
        title: "Doomed",
      });
      await entities().create({ type: "note", title: "Survivor" });

      const response = await runMutate(note.id, formData({ intent: "delete" }));
      const body = (await response.json()) as NoteMutationResult;
      expect(body).toEqual({ kind: "delete", ok: true });

      const active = await runIndex(undefined, "active");
      expect(active.notes.map((n) => n.id)).not.toContain(note.id);

      const deleted = await runIndex(undefined, "deleted");
      expect(deleted.notes.map((n) => n.id)).toEqual([note.id]);
    });

    it("restores through EntityRepository.restore, returning to the active collection and out of deleted", async () => {
      const note = await entities().create({ type: "note", title: "Back" });
      await runMutate(note.id, formData({ intent: "delete" }));

      const response = await runMutate(
        note.id,
        formData({ intent: "restore" }),
      );
      const body = (await response.json()) as NoteMutationResult;
      expect(body).toEqual({ kind: "restore", ok: true });

      const active = await runIndex(undefined, "active");
      expect(active.notes.map((n) => n.id)).toContain(note.id);
      const deleted = await runIndex(undefined, "deleted");
      expect(deleted.notes.map((n) => n.id)).not.toContain(note.id);
    });

    it("a deleted Note's canonical route fails closed (404) — never editable through it", async () => {
      const note = await entities().create({ type: "note", title: "Gone" });
      await runMutate(note.id, formData({ intent: "delete" }));

      await expect(runDetail(note.id)).rejects.toMatchObject({ status: 404 });
      const activity = await runActivity(note.id);
      expect(activity.status).toBe(404);
      await expect(
        runMutate(note.id, formData({ intent: "rename", title: "X" })),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        runMutate(note.id, formData({ intent: "update_content", content: "X" })),
      ).rejects.toMatchObject({ status: 404 });
    });

    it("restored content and links survive delete→restore exactly, including whitespace-only content", async () => {
      const note = await entities().create({ type: "note", title: "Note" });
      const source = "  \n\ttrailing whitespace preserved  \n\n";
      await runMutate(
        note.id,
        formData({ intent: "update_content", content: source }),
      );

      await runMutate(note.id, formData({ intent: "delete" }));
      await runMutate(note.id, formData({ intent: "restore" }));

      const detail = await runDetail(note.id);
      expect(detail.details.content).toBe(source);
      expect(detail.overview.title).toBe("Note");
    });

    it("delete and restore are idempotent — repeating either is a calm no-op, never an error", async () => {
      const note = await entities().create({ type: "note", title: "Note" });

      const first = await runMutate(note.id, formData({ intent: "delete" }));
      expect(((await first.json()) as NoteMutationResult).ok).toBe(true);
      const second = await runMutate(note.id, formData({ intent: "delete" }));
      expect(((await second.json()) as NoteMutationResult).ok).toBe(true);

      const restore1 = await runMutate(
        note.id,
        formData({ intent: "restore" }),
      );
      expect(((await restore1.json()) as NoteMutationResult).ok).toBe(true);
      const restore2 = await runMutate(
        note.id,
        formData({ intent: "restore" }),
      );
      expect(((await restore2.json()) as NoteMutationResult).ok).toBe(true);

      const detail = await runDetail(note.id);
      expect(detail.overview.title).toBe("Note");
    });

    it("fails closed with a calm 404 for missing, wrong-type and cross-workspace ids on delete/restore alike", async () => {
      const e = entities();
      const wrongType = await e.create({ type: "widget", title: "Not a note" });
      const otherNote = await entities(OTHER).create({
        type: "note",
        title: "Other",
      });

      for (const id of ["nonexistent", wrongType.id, otherNote.id]) {
        await expect(
          runMutate(id, formData({ intent: "delete" })),
        ).rejects.toMatchObject({ status: 404 });
        await expect(
          runMutate(id, formData({ intent: "restore" })),
        ).rejects.toMatchObject({ status: 404 });
      }
      // Cross-workspace note is genuinely untouched by workspace A's attempts.
      const stillThere = await entities(OTHER).getById(otherNote.id);
      expect(stillThere?.deletedAt).toBeNull();
    });

    it("records the kernel-reserved entity.deleted/entity.restored Activity events — no duplicate note.deleted event", async () => {
      const note = await entities().create({ type: "note", title: "Note" });
      await runMutate(note.id, formData({ intent: "delete" }));
      await runMutate(note.id, formData({ intent: "restore" }));

      const activity = await makeActivityRepository(
        makeContext(WS),
      ).listForEntity(note.id);
      const types = activity.items.map((item) => item.type);
      expect(types).toContain("entity.deleted");
      expect(types).toContain("entity.restored");
      expect(types).not.toContain("note.deleted");
    });

    it("the active collection never leaks a deleted Note; the deleted collection never leaks an active one (truthful, bounded)", async () => {
      const e = entities();
      const active1 = await e.create({ type: "note", title: "Active 1" });
      const active2 = await e.create({ type: "note", title: "Active 2" });
      const deleted1 = await e.create({ type: "note", title: "Deleted 1" });
      await e.softDelete(deleted1.id);

      const activePage = await runIndex(undefined, "active");
      expect(activePage.notes.map((n) => n.id).sort()).toEqual(
        [active1.id, active2.id].sort(),
      );
      expect(activePage.failed).toBe(false);

      const deletedPage = await runIndex(undefined, "deleted");
      expect(deletedPage.notes.map((n) => n.id)).toEqual([deleted1.id]);
      expect(deletedPage.failed).toBe(false);
    });
  });
});
