import { beforeEach, describe, expect, it } from "vitest";

import {
  NoteDetailsNotFoundError,
  NoteDetailsValidationError,
} from "~/kernel/notes";

import {
  countActivitiesOfType,
  countNoteDetailRows,
  FakeClock,
  makeContext,
  makeNoteDetailsRepository,
  makeRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "test-default-workspace";
const OTHER = "ws_note_details_other";

function entities(ws = WS, prefix = "nd") {
  return makeRepository(makeContext(ws), {
    clock: new FakeClock().now,
    idGenerator: sequentialIds(prefix),
  });
}

function details(options?: Parameters<typeof makeNoteDetailsRepository>[1]) {
  return makeNoteDetailsRepository(makeContext(WS), {
    clock: new FakeClock().now,
    ...options,
  });
}

async function seedNote(repo: ReturnType<typeof entities>) {
  return repo.create({ type: "note", title: "My note" });
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

describe("NoteDetailsRepository.get", () => {
  it("returns exact empty Markdown content for an active Note with no details row", async () => {
    const note = await seedNote(entities());
    const record = await details().get(note.id);
    expect(record).toMatchObject({
      id: note.id,
      content: "",
      contentUpdatedAt: null,
    });
    expect(await countNoteDetailRows()).toBe(0);
  });

  it("fails closed (null) for missing, deleted, wrong-type and cross-workspace ids", async () => {
    const e = entities();
    const note = await seedNote(e);
    const wrongType = await e.create({ type: "widget", title: "Not a note" });
    await e.softDelete(note.id);

    const otherEntities = entities(OTHER, "other");
    const otherNote = await seedNote(otherEntities);

    const repo = details();
    for (const id of ["nonexistent", note.id, wrongType.id, otherNote.id]) {
      expect(await repo.get(id)).toBeNull();
    }
  });
});

describe("NoteDetailsRepository.update", () => {
  it("first content save inserts the detail row and records note.content_updated exactly once", async () => {
    const note = await seedNote(entities());
    const repo = details();

    const result = await repo.update(note.id, "# Hello\n\nSome text.");
    expect(result.changed).toBe(true);
    expect(result.details.content).toBe("# Hello\n\nSome text.");
    expect(result.details.contentUpdatedAt).toBeInstanceOf(Date);
    expect(await countNoteDetailRows()).toBe(1);
    expect(await countActivitiesOfType("note.content_updated")).toBe(1);
  });

  it("title stays entity-owned: updating content never changes the Note's title", async () => {
    const e = entities();
    const note = await seedNote(e);
    await details().update(note.id, "content");
    const record = await e.getById(note.id);
    expect(record?.title).toBe("My note");
  });

  it("content is read back byte-for-byte, preserving whitespace, line endings and raw HTML", async () => {
    const note = await seedNote(entities());
    const repo = details();
    const source =
      '  leading space\r\nCRLF line\n<div class="x">raw html</div>\n\ttab\n   ';
    await repo.update(note.id, source);
    const record = await repo.get(note.id);
    expect(record?.content).toBe(source);
  });

  it("clearing content to the empty string keeps the row and advances the content timestamp", async () => {
    const note = await seedNote(entities());
    const repo = details();
    const clock = new FakeClock();
    const firstRepo = details({ clock: clock.now });
    await firstRepo.update(note.id, "Hello");
    clock.advance(1000);
    const cleared = await firstRepo.update(note.id, "");
    expect(cleared.changed).toBe(true);
    expect(cleared.details.content).toBe("");
    expect(await countNoteDetailRows()).toBe(1);

    const after = await repo.get(note.id);
    expect(after?.content).toBe("");
    expect(after?.contentUpdatedAt?.getTime()).toBe(
      cleared.details.contentUpdatedAt?.getTime(),
    );
  });

  it("is an idempotent no-op (no write, no Activity) when resubmitting the exact stored content", async () => {
    const note = await seedNote(entities());
    const repo = details();
    await repo.update(note.id, "Stable content");
    const before = await countActivitiesOfType("note.content_updated");
    const result = await repo.update(note.id, "Stable content");
    expect(result.changed).toBe(false);
    expect(await countActivitiesOfType("note.content_updated")).toBe(before);
  });

  it("is an idempotent no-op for a Note with no row when submitting the empty string", async () => {
    const note = await seedNote(entities());
    const repo = details();
    const result = await repo.update(note.id, "");
    expect(result.changed).toBe(false);
    expect(await countNoteDetailRows()).toBe(0);
    expect(await countActivitiesOfType("note.content_updated")).toBe(0);
  });

  it("rejects a disallowed control character honestly, writing nothing", async () => {
    const note = await seedNote(entities());
    const repo = details();
    await expect(
      repo.update(note.id, "bad \u0000 content"),
    ).rejects.toBeInstanceOf(NoteDetailsValidationError);
    expect(await countNoteDetailRows()).toBe(0);
  });

  it("rejects content over the 1 MiB UTF-8 byte limit, writing nothing", async () => {
    const note = await seedNote(entities());
    const repo = details();
    const tooLarge = "a".repeat(1024 * 1024 + 1);
    await expect(repo.update(note.id, tooLarge)).rejects.toBeInstanceOf(
      NoteDetailsValidationError,
    );
    expect(await countNoteDetailRows()).toBe(0);
  });

  it("fails closed for a missing, deleted, wrong-type or cross-workspace Note id, writing nothing", async () => {
    const e = entities();
    const note = await seedNote(e);
    const wrongType = await e.create({ type: "widget", title: "Not a note" });
    await e.softDelete(note.id);

    const otherEntities = entities(OTHER, "other");
    const otherNote = await seedNote(otherEntities);

    const repo = details();
    for (const id of ["nonexistent", note.id, wrongType.id, otherNote.id]) {
      await expect(repo.update(id, "new content")).rejects.toBeInstanceOf(
        NoteDetailsNotFoundError,
      );
    }
    expect(await countNoteDetailRows()).toBe(0);
  });

  it("repeated writes to the same Note never create a second row (idempotent PK)", async () => {
    const note = await seedNote(entities());
    const repo = details();
    await repo.update(note.id, "first");
    await repo.update(note.id, "second");
    await repo.update(note.id, "third");
    expect(await countNoteDetailRows()).toBe(1);
    expect((await repo.get(note.id))?.content).toBe("third");
  });

  it("concurrent writes to the same Note never create a second row", async () => {
    const note = await seedNote(entities());
    const repo = details();
    await Promise.all([
      repo.update(note.id, "alpha"),
      repo.update(note.id, "beta"),
      repo.update(note.id, "gamma"),
    ]);
    expect(await countNoteDetailRows()).toBe(1);
    const final = await repo.get(note.id);
    expect(["alpha", "beta", "gamma"]).toContain(final?.content);
  });

  it("concurrent identical-content submissions append exactly one Activity event", async () => {
    const note = await seedNote(entities());
    const repo = details();
    const results = await Promise.all([
      repo.update(note.id, "same content"),
      repo.update(note.id, "same content"),
      repo.update(note.id, "same content"),
    ]);
    expect(results.filter((r) => r.changed)).toHaveLength(1);
    expect(await countNoteDetailRows()).toBe(1);
    expect(await countActivitiesOfType("note.content_updated")).toBe(1);
    expect((await repo.get(note.id))?.content).toBe("same content");
  });
});

describe("Activity atomicity — the content write and its event are all-or-nothing", () => {
  it("an Activity-insert failure rolls the content write back too", async () => {
    const note = await seedNote(entities());
    const repo = details({ mutationFault: "after-domain" });
    await expect(repo.update(note.id, "content")).rejects.toThrow();
    expect(await countNoteDetailRows()).toBe(0);
    expect(await countActivitiesOfType("note.content_updated")).toBe(0);
  });

  it("a genuine no-op never reaches the armed fault", async () => {
    const note = await seedNote(entities());
    const repo = details({ mutationFault: "after-domain" });
    const result = await repo.update(note.id, "");
    expect(result.changed).toBe(false);
  });
});
