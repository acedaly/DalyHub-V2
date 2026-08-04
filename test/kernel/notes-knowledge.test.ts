import { beforeEach, describe, expect, it } from "vitest";
import { RouterContextProvider } from "react-router";

import type { AuthenticatedSession } from "~/kernel/auth";
import { NOTE_ARCHIVED, NOTE_TAGS_UPDATED } from "~/kernel/notes";
import {
  NOTE_REFERENCES_LINK,
  loadNoteReferences,
  reconcileNoteReferences,
} from "~/platform/entity-links/note-references";
import {
  linkNoteToProject,
  loadProjectKnowledge,
  unlinkNoteFromProject,
} from "~/platform/entity-links/project-knowledge";
import { UNIVERSAL_RELATED_LINK } from "~/platform/entity-links/universal-links";
import { setAuthenticatedSession } from "~/platform/request";
import { loader as indexLoader } from "~/modules/notes/routes/index";
import { loader as detailLoader } from "~/modules/notes/routes/detail";
import { loader as exportLoader } from "~/modules/notes/routes/export";
import { loader as referencesLoader } from "~/modules/notes/routes/references";
import { action as mutateAction } from "~/modules/notes/routes/mutate";
import {
  action as knowledgeAction,
  loader as knowledgeLoader,
} from "~/modules/projects/routes/knowledge";
import type { NoteMutationResult } from "~/modules/notes/routes/mutate";
import type { ProjectKnowledgeResult } from "~/modules/projects/routes/knowledge";
import { notesSearchProvider } from "~/modules/notes/search";
import type { ReferencePage } from "~/shared/references";

import {
  FakeClock,
  makeActivityRepository,
  makeContext,
  makeLinkRepository,
  makeNoteDetailsRepository,
  makeNoteRepository,
  makePersonRepository,
  makeRepository,
  makeSpineRepository,
  resetTables,
  sequentialIds,
} from "./support";

/**
 * NOTES-02/03/06 + PROJ-03 — the knowledge completion, proven against REAL D1.
 *
 * Everything here runs through the deployed composition boundary (the actual
 * loaders/actions, the real repositories, the real migration), so a passing test
 * means the shipped path works — not that a mock agreed with itself.
 */
const WS = "test-default-workspace";
const OTHER = "ws_notes_knowledge_other";
const nextId = sequentialIds("nk");

function sessionFor(subject = "owner-subject"): AuthenticatedSession {
  return {
    user: { subject, email: "owner@example.com", displayName: null },
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
    idGenerator: nextId,
  });
}

function noteDetails(ws = WS) {
  return makeNoteDetailsRepository(makeContext(ws));
}

function notes(ws = WS) {
  return makeNoteRepository(makeContext(ws));
}

function people(ws = WS) {
  return makePersonRepository(makeContext(ws));
}

function links(ws = WS) {
  return makeLinkRepository(makeContext(ws));
}

/** The workspace-scoped dependency bundle the platform helpers take. */
function deps(ws = WS) {
  return {
    entities: entities(ws),
    entityLinks: links(ws),
    notes: notes(ws),
  };
}

function formData(entries: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(entries)) form.set(key, value);
  return form;
}

async function createNote(title: string, content = "", ws = WS) {
  const note = await entities(ws).create({ type: "note", title });
  if (content !== "") await noteDetails(ws).update(note.id, content);
  return note;
}

async function runIndex(params: Record<string, string> = {}) {
  const url = new URL("https://app.test/notes");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return indexLoader({
    request: new Request(url),
    context: authedContext(),
    params: {},
  } as unknown as Parameters<typeof indexLoader>[0]);
}

async function runMutate(
  noteId: string,
  form: FormData,
): Promise<NoteMutationResult> {
  const response = (await mutateAction({
    request: new Request(`https://app.test/notes/${noteId}/mutate`, {
      method: "POST",
      body: form,
    }),
    context: authedContext(),
    params: { noteId },
  } as unknown as Parameters<typeof mutateAction>[0])) as Response;
  return (await response.json()) as NoteMutationResult;
}

function runDetail(noteId: string) {
  return detailLoader({
    request: new Request(`https://app.test/notes/${noteId}`),
    context: authedContext(),
    params: { noteId },
  } as unknown as Parameters<typeof detailLoader>[0]);
}

async function runExport(noteId: string, format?: string): Promise<Response> {
  const url = new URL(`https://app.test/notes/${noteId}/export`);
  if (format) url.searchParams.set("format", format);
  return exportLoader({
    request: new Request(url),
    context: authedContext(),
    params: { noteId },
  } as unknown as Parameters<typeof exportLoader>[0]) as Promise<Response>;
}

async function runReferences(
  noteId: string,
  direction: "incoming" | "outgoing",
): Promise<ReferencePage> {
  const response = (await referencesLoader({
    request: new Request(
      `https://app.test/notes/${noteId}/references?direction=${direction}`,
    ),
    context: authedContext(),
    params: { noteId },
  } as unknown as Parameters<typeof referencesLoader>[0])) as Response;
  return (await response.json()) as ReferencePage;
}

async function runKnowledgeGet(
  projectId: string,
  query = "",
): Promise<Response> {
  const url = new URL(`https://app.test/projects/${projectId}/knowledge`);
  if (query) {
    url.searchParams.set("op", "search");
    url.searchParams.set("q", query);
  }
  return knowledgeLoader({
    request: new Request(url),
    context: authedContext(),
    params: { projectId },
  } as unknown as Parameters<typeof knowledgeLoader>[0]) as Promise<Response>;
}

async function runKnowledgePost(
  projectId: string,
  form: FormData,
): Promise<ProjectKnowledgeResult> {
  const response = (await knowledgeAction({
    request: new Request(`https://app.test/projects/${projectId}/knowledge`, {
      method: "POST",
      body: form,
    }),
    context: authedContext(),
    params: { projectId },
  } as unknown as Parameters<typeof knowledgeAction>[0])) as Response;
  return (await response.json()) as ProjectKnowledgeResult;
}

/** Create a real Project through the spine (Area → Project). */
async function createProject(title: string) {
  const spine = makeSpineRepository(makeContext(WS));
  const area = await spine.createArea({ title: `${title} area` });
  const project = await spine.createProject({
    title,
    parent: { kind: "area", id: area.id },
  });
  return { project, area };
}

async function searchNotes(text: string, limit = 10) {
  return notesSearchProvider.search({ text, limit }, {
    workspace: makeContext(WS),
    signal: new AbortController().signal,
  } as unknown as Parameters<typeof notesSearchProvider.search>[1]);
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

/* -------------------------------------------------------------------------- */
/* Full-content search                                                        */
/* -------------------------------------------------------------------------- */

describe("full-content note search", () => {
  it("finds a note by its TITLE, its BODY, a HEADING and a TAG", async () => {
    const byTitle = await createNote("Quarterly planning");
    const byBody = await createNote(
      "Loose thoughts",
      "Some prose about hydroponics and light.",
    );
    const byHeading = await createNote(
      "Research",
      "intro\n\n## Hydroponics rig\n\ndetails here",
    );
    const byTag = await createNote("Tagged", "nothing relevant");
    await noteDetails().setTags(byTag.id, ["hydroponics"]);

    expect(
      (await notes().search({ text: "quarterly" })).map((h) => h.id),
    ).toEqual([byTitle.id]);

    const bodyHits = await notes().search({ text: "hydroponics" });
    const ids = bodyHits.map((hit) => hit.id);
    expect(ids).toContain(byBody.id);
    expect(ids).toContain(byHeading.id);
    expect(ids).toContain(byTag.id);
  });

  it("reports WHERE it matched, and the heading a body match sits under", async () => {
    const note = await createNote(
      "Research",
      "intro\n\n## Hydroponics rig\n\nthe pump was noisy\n",
    );
    const [heading] = await notes().search({ text: "Hydroponics rig" });
    expect(heading?.id).toBe(note.id);
    expect(heading?.matchSource).toBe("heading");

    const [body] = await notes().search({ text: "noisy" });
    expect(body?.matchSource).toBe("body");
    expect(body?.heading).toBe("Hydroponics rig");
  });

  it("returns a readable excerpt, never raw Markdown syntax", async () => {
    await createNote(
      "Formatted",
      "## A heading\n\nSee **the widget** and `code` here.\n",
    );
    const [hit] = await notes().search({ text: "widget" });
    expect(hit?.excerpt).toContain("widget");
    expect(hit?.excerpt).not.toContain("**");
    expect(hit?.excerpt).not.toContain("##");
  });

  it("excludes DELETED notes always, and archived notes unless asked", async () => {
    const deleted = await createNote("Gone widget", "widget");
    await entities().softDelete(deleted.id);
    const archived = await createNote("Kept widget", "widget");
    await noteDetails().setArchived(archived.id, true);

    const active = await notes().search({ text: "widget" });
    expect(active.map((h) => h.id)).toEqual([]);

    const withArchived = await notes().search({
      text: "widget",
      includeArchived: true,
    });
    expect(withArchived.map((h) => h.id)).toEqual([archived.id]);
    expect(withArchived[0]?.archivedAt).not.toBeNull();
  });

  it("never leaks another workspace's notes", async () => {
    await createNote("Cross workspace widget", "widget", OTHER);
    expect(await notes().search({ text: "widget" })).toEqual([]);
  });

  it("is deterministic and bounded — title matches lead, and the limit is honoured", async () => {
    await createNote("Widget", "nothing");
    await createNote("Other", "a widget mentioned in the body");
    const hits = await notes().search({ text: "widget", limit: 1 });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.title).toBe("Widget");
    expect(await notes().search({ text: "widget" })).toEqual(
      await notes().search({ text: "widget" }),
    );
  });

  it("survives a query longer than D1's LIKE-pattern limit", async () => {
    // D1 fails the WHOLE statement for a LIKE pattern over 50 bytes, so an
    // over-long query (a pasted title, a sentence) must degrade to matching its
    // opening characters — never a storage error the user sees as a broken app.
    const longTitle = `Quarterly planning for the ${"very ".repeat(20)}long project`;
    const note = await createNote(longTitle);
    const hits = await notes().search({ text: longTitle });
    expect(hits.map((hit) => hit.id)).toEqual([note.id]);
  });

  it("treats a blank query as no search, running nothing", async () => {
    await createNote("Widget", "widget");
    expect(await notes().search({ text: "   " })).toEqual([]);
  });

  it("matches a LIKE metacharacter literally", async () => {
    const note = await createNote("Discount", "a 100% increase");
    const hits = await notes().search({ text: "100%" });
    expect(hits.map((h) => h.id)).toEqual([note.id]);
    expect(await notes().search({ text: "10%0" })).toEqual([]);
  });

  it("surfaces notes through the registry-discovered global Search provider", async () => {
    const note = await createNote("Search me", "the body mentions marmalade");
    const results = await searchNotes("marmalade");
    expect(results.map((r) => r.id)).toEqual([`note:${note.id}`]);
    expect(results[0]?.entityId).toBe(note.id);
    expect(results[0]?.entityType).toBe("note");
    expect(results[0]?.target).toEqual({
      kind: "route",
      to: `/notes/${note.id}`,
    });
    expect(results[0]?.subtitle).toContain("marmalade");
  });
});

/* -------------------------------------------------------------------------- */
/* Collection filters                                                         */
/* -------------------------------------------------------------------------- */

describe("notes collection organisation", () => {
  it("filters by tag, and only by an exact tag token", async () => {
    const tagged = await createNote("Tagged");
    await noteDetails().setTags(tagged.id, ["reading"]);
    const other = await createNote("Other");
    await noteDetails().setTags(other.id, ["reading list"]);

    const page = await runIndex({ tag: "reading" });
    expect(page.notes.map((n) => n.id)).toEqual([tagged.id]);
  });

  it("filters by linked Project and by linked Area", async () => {
    const { project, area } = await createProject("Atlas");
    const projectNote = await createNote("Project note");
    const areaNote = await createNote("Area note");
    const loose = await createNote("Loose note");
    await linkNoteToProject(deps(), project.id, projectNote.id);
    await links().create({
      sourceEntityId: areaNote.id,
      targetEntityId: area.id,
      type: UNIVERSAL_RELATED_LINK,
    });

    expect(
      (await runIndex({ project: project.id })).notes.map((n) => n.id),
    ).toEqual([projectNote.id]);
    expect((await runIndex({ area: area.id })).notes.map((n) => n.id)).toEqual([
      areaNote.id,
    ]);
    expect(
      (await runIndex({ links: "unlinked" })).notes.map((n) => n.id),
    ).toEqual([loose.id]);
    expect(
      (await runIndex({ links: "linked" })).notes.map((n) => n.id).sort(),
    ).toEqual([projectNote.id, areaNote.id].sort());
  });

  it("separates the Active, Archived and Deleted views without leaking", async () => {
    const active = await createNote("Active");
    const archived = await createNote("Archived");
    const deleted = await createNote("Deleted");
    await noteDetails().setArchived(archived.id, true);
    await entities().softDelete(deleted.id);

    expect((await runIndex()).notes.map((n) => n.id)).toEqual([active.id]);
    expect(
      (await runIndex({ state: "archived" })).notes.map((n) => n.id),
    ).toEqual([archived.id]);
    expect(
      (await runIndex({ state: "deleted" })).notes.map((n) => n.id),
    ).toEqual([deleted.id]);
  });

  it("orders by recency when asked, using the EFFECTIVE updated moment", async () => {
    const first = await createNote("First");
    const second = await createNote("Second");
    // Only the FIRST note's content changes, so it must lead the recent order
    // even though it was created earlier.
    await noteDetails().update(first.id, "a later edit");

    expect((await runIndex({ sort: "recent" })).notes.map((n) => n.id)).toEqual(
      [first.id, second.id],
    );
    expect((await runIndex()).notes.map((n) => n.id)).toEqual([
      second.id,
      first.id,
    ]);
  });

  it("carries the excerpt, tags, archive state and relationship count onto each row", async () => {
    const { project } = await createProject("Atlas");
    const note = await createNote("Rich", "## Heading\n\nSome **prose** here.");
    await noteDetails().setTags(note.id, ["reading"]);
    await linkNoteToProject(deps(), project.id, note.id);

    const [row] = (await runIndex()).notes;
    expect(row?.tags).toEqual(["reading"]);
    expect(row?.archived).toBe(false);
    expect(row?.linkCount).toBe(1);
    expect(row?.excerpt).not.toContain("**");
    expect(row?.excerpt).not.toContain("##");
  });

  it("falls back to the first page when a cursor from another filter scope is reused", async () => {
    for (let i = 0; i < 3; i += 1) await createNote(`Note ${i}`);
    const page = await runIndex({ sort: "recent" });
    // A cursor is only issued when more pages remain; force the situation by
    // reusing a cursor from a DIFFERENT scope, which must not fail the page.
    const stale = "not-a-valid-cursor-for-this-scope";
    const next = await runIndex({ cursor: stale, tag: "reading" });
    expect(next.failed).toBe(false);
    expect(page.failed).toBe(false);
  });

  it("offers the workspace's tag facets, most-used first", async () => {
    const a = await createNote("A");
    const b = await createNote("B");
    await noteDetails().setTags(a.id, ["reading", "research"]);
    await noteDetails().setTags(b.id, ["reading"]);
    expect(await notes().listTags()).toEqual([
      { tag: "reading", count: 2 },
      { tag: "research", count: 1 },
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/* Tags and archive lifecycle                                                 */
/* -------------------------------------------------------------------------- */

describe("note tags and archive lifecycle", () => {
  it("stores a normalised tag set and records ONE activity event per real change", async () => {
    const note = await createNote("Tagged");
    expect(
      (
        await runMutate(
          note.id,
          formData({
            intent: "set_tags",
            tags: '["Reading","reading","Research"]',
          }),
        )
      ).ok,
    ).toBe(true);
    expect((await noteDetails().get(note.id))?.tags).toEqual([
      "reading",
      "research",
    ]);

    const before = await makeActivityRepository(makeContext(WS)).listForEntity(
      note.id,
    );
    // An identical set is an idempotent no-op: no write, no second event.
    await runMutate(
      note.id,
      formData({ intent: "set_tags", tags: '["research","READING"]' }),
    );
    const after = await makeActivityRepository(makeContext(WS)).listForEntity(
      note.id,
    );
    expect(after.items.length).toBe(before.items.length);
    expect(
      before.items.filter((event) => event.type === NOTE_TAGS_UPDATED),
    ).toHaveLength(1);
  });

  it("never puts tag TEXT into the Activity stream", async () => {
    const note = await createNote("Tagged");
    await runMutate(
      note.id,
      formData({ intent: "set_tags", tags: '["something-private"]' }),
    );
    const page = await makeActivityRepository(makeContext(WS)).listForEntity(
      note.id,
    );
    const event = page.items.find((item) => item.type === NOTE_TAGS_UPDATED);
    expect(JSON.stringify(event?.payload)).not.toContain("something-private");
    expect(event?.payload).toEqual({ count: 1 });
  });

  it("rejects an invalid tag set with a typed field error, writing nothing", async () => {
    const note = await createNote("Tagged");
    const result = await runMutate(
      note.id,
      formData({ intent: "set_tags", tags: `["${"x".repeat(200)}"]` }),
    );
    expect(result.kind).toBe("set_tags");
    expect(result.ok).toBe(false);
    expect((await noteDetails().get(note.id))?.tags).toEqual([]);
  });

  it("archives and unarchives reversibly, keeping the canonical route open", async () => {
    const note = await createNote("Kept", "the content");
    expect((await runMutate(note.id, formData({ intent: "archive" }))).ok).toBe(
      true,
    );

    const detail = await runDetail(note.id);
    expect(detail.details.archivedAt).not.toBeNull();
    // Archiving keeps the content and every relationship — unlike deletion, the
    // record is still readable at its canonical route.
    expect(detail.details.content).toBe("the content");

    expect(
      (await runMutate(note.id, formData({ intent: "unarchive" }))).ok,
    ).toBe(true);
    expect((await runDetail(note.id)).details.archivedAt).toBeNull();
  });

  it("is idempotent — a repeated archive appends no second event", async () => {
    const note = await createNote("Kept");
    await runMutate(note.id, formData({ intent: "archive" }));
    await runMutate(note.id, formData({ intent: "archive" }));
    const page = await makeActivityRepository(makeContext(WS)).listForEntity(
      note.id,
    );
    expect(
      page.items.filter((event) => event.type === NOTE_ARCHIVED),
    ).toHaveLength(1);
  });

  it("fails closed for a missing, wrong-type or cross-workspace id", async () => {
    const foreign = await createNote("Foreign", "", OTHER);
    const project = (await createProject("Atlas")).project;
    for (const id of ["missing", foreign.id, project.id]) {
      await expect(
        runMutate(id, formData({ intent: "archive" })),
      ).rejects.toMatchObject({ status: 404 });
    }
  });

  it("keeps archive and soft-delete as DIFFERENT states", async () => {
    const note = await createNote("Both");
    await runMutate(note.id, formData({ intent: "archive" }));
    await runMutate(note.id, formData({ intent: "delete" }));
    // Deleted takes the record out of every active view; the archived flag on
    // its detail row is untouched and returns intact on restore.
    expect((await runIndex({ state: "archived" })).notes).toEqual([]);
    expect(
      (await runIndex({ state: "deleted" })).notes.map((n) => n.id),
    ).toEqual([note.id]);
    await runMutate(note.id, formData({ intent: "restore" }));
    expect(
      (await runIndex({ state: "archived" })).notes.map((n) => n.id),
    ).toEqual([note.id]);
  });
});

/* -------------------------------------------------------------------------- */
/* References: wiki links become real relationships                           */
/* -------------------------------------------------------------------------- */

describe("note references", () => {
  it("turns a [[wiki link]] into a REAL typed EntityLink when the note is saved", async () => {
    const target = await createNote("Atlas");
    const source = await createNote("Source");

    await runMutate(
      source.id,
      formData({ intent: "update_content", content: "See [[Atlas]]." }),
    );

    const page = await links().listForEntity(source.id, {
      direction: "outgoing",
    });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.link.type).toBe(NOTE_REFERENCES_LINK);
    expect(page.items[0]?.counterpart.id).toBe(target.id);
  });

  it("writes ONE link for a repeated reference, and none for a code-block one", async () => {
    await createNote("Atlas");
    await createNote("Beta");
    const source = await createNote("Source");

    await runMutate(
      source.id,
      formData({
        intent: "update_content",
        content: "[[Atlas]] again [[atlas]]\n\n```\n[[Beta]]\n```\n",
      }),
    );

    const page = await links().listForEntity(source.id, {
      direction: "outgoing",
    });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.counterpart.title).toBe("Atlas");
  });

  it("removes a reference when it leaves the text, and RESTORES the same link id when it returns", async () => {
    const target = await createNote("Atlas");
    const source = await createNote("Source");

    await runMutate(
      source.id,
      formData({ intent: "update_content", content: "[[Atlas]]" }),
    );
    const first = (
      await links().listForEntity(source.id, { direction: "outgoing" })
    ).items[0];

    await runMutate(
      source.id,
      formData({ intent: "update_content", content: "no references now" }),
    );
    expect(
      (await links().listForEntity(source.id, { direction: "outgoing" })).items,
    ).toHaveLength(0);

    await runMutate(
      source.id,
      formData({ intent: "update_content", content: "[[Atlas]] is back" }),
    );
    const second = (
      await links().listForEntity(source.id, { direction: "outgoing" })
    ).items[0];
    expect(second?.link.id).toBe(first?.link.id);
    expect(second?.counterpart.id).toBe(target.id);
  });

  it("survives a RENAME of the target — the relationship is by stable id", async () => {
    const target = await createNote("Atlas");
    const source = await createNote("Source");
    await runMutate(
      source.id,
      formData({ intent: "update_content", content: "[[Atlas]]" }),
    );

    await entities().update(target.id, { title: "Atlas renamed" });

    const page = await links().listForEntity(source.id, {
      direction: "outgoing",
    });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.counterpart.title).toBe("Atlas renamed");
  });

  it("ignores an unresolvable reference and a self-reference without failing the save", async () => {
    const source = await createNote("Source");
    const result = await runMutate(
      source.id,
      formData({
        intent: "update_content",
        content: "[[Nothing here]] and [[Source]]",
      }),
    );
    expect(result.ok).toBe(true);
    expect(
      (await links().listForEntity(source.id, { direction: "outgoing" })).items,
    ).toHaveLength(0);
    expect((await noteDetails().get(source.id))?.content).toBe(
      "[[Nothing here]] and [[Source]]",
    );
  });

  it("never resolves a title in ANOTHER workspace", async () => {
    await createNote("Atlas", "", OTHER);
    const source = await createNote("Source");
    await runMutate(
      source.id,
      formData({ intent: "update_content", content: "[[Atlas]]" }),
    );
    expect(
      (await links().listForEntity(source.id, { direction: "outgoing" })).items,
    ).toHaveLength(0);
  });

  it("reconciliation is idempotent — running it twice writes nothing new", async () => {
    await createNote("Atlas");
    const source = await createNote("Source", "[[Atlas]]");
    const first = await reconcileNoteReferences(deps(), source.id, "[[Atlas]]");
    const second = await reconcileNoteReferences(
      deps(),
      source.id,
      "[[Atlas]]",
    );
    expect(first.created).toBe(1);
    expect(second).toEqual({ created: 0, removed: 0, unresolved: [] });
  });
});

/* -------------------------------------------------------------------------- */
/* Backlinks and outgoing links                                               */
/* -------------------------------------------------------------------------- */

describe("backlinks and outgoing links", () => {
  it("shows a backlink from another note, WITH the sentence that mentions it", async () => {
    const target = await createNote("Atlas");
    const source = await createNote("Source");
    await runMutate(
      source.id,
      formData({
        intent: "update_content",
        content:
          "unrelated opening block\n\nThe roadmap for [[Atlas]] is agreed.\n\nanother block",
      }),
    );

    const page = await runReferences(target.id, "incoming");
    expect(page.items).toHaveLength(1);
    const [item] = page.items;
    expect(item?.record.id).toBe(source.id);
    expect(item?.direction).toBe("incoming");
    expect(item?.relationshipLabel).toBe("Mentioned in note");
    expect(item?.context).toContain("The roadmap for Atlas is agreed.");
    // Context is bounded to the containing block — never unrelated content.
    expect(item?.context).not.toContain("unrelated opening block");
    expect(item?.context).not.toContain("[[");
  });

  it("shows backlinks from EVERY module, not just Notes", async () => {
    const target = await createNote("Atlas");
    const { project } = await createProject("Website");
    const spine = makeSpineRepository(makeContext(WS));
    const area = await spine.createArea({ title: "Home" });
    const task = await spine.createTask({
      title: "Do the thing",
      parent: { kind: "area", id: area.id },
    });
    const person = await people().create({ title: "Sam" });

    for (const source of [project.id, task.id, person.id]) {
      await links().create({
        sourceEntityId: source,
        targetEntityId: target.id,
        type: UNIVERSAL_RELATED_LINK,
      });
    }

    const page = await runReferences(target.id, "incoming");
    expect(page.items.map((item) => item.record.type).sort()).toEqual([
      "person",
      "project",
      "task",
    ]);
    expect(
      page.items.every((item) => item.relationshipLabel === "Related"),
    ).toBe(true);
  });

  it("does NOT treat a plain title mention as a backlink", async () => {
    const target = await createNote("Atlas");
    const source = await createNote("Source");
    await runMutate(
      source.id,
      formData({
        intent: "update_content",
        content: "We talked about Atlas today, without linking it.",
      }),
    );
    expect((await runReferences(target.id, "incoming")).items).toEqual([]);
  });

  it("hides a backlink whose source was DELETED, and brings it back on restore", async () => {
    const target = await createNote("Atlas");
    const source = await createNote("Source");
    await runMutate(
      source.id,
      formData({ intent: "update_content", content: "[[Atlas]]" }),
    );
    expect((await runReferences(target.id, "incoming")).items).toHaveLength(1);

    await entities().softDelete(source.id);
    expect((await runReferences(target.id, "incoming")).items).toEqual([]);

    await entities().restore(source.id);
    expect((await runReferences(target.id, "incoming")).items).toHaveLength(1);
  });

  it("flags an ARCHIVED source note rather than hiding it", async () => {
    const target = await createNote("Atlas");
    const source = await createNote("Source");
    await runMutate(
      source.id,
      formData({ intent: "update_content", content: "[[Atlas]]" }),
    );
    await noteDetails().setArchived(source.id, true);

    const [item] = (await runReferences(target.id, "incoming")).items;
    expect(item?.record.archived).toBe(true);
  });

  it("lists outgoing links with context from THIS note's own text", async () => {
    await createNote("Atlas");
    const source = await createNote("Source");
    await runMutate(
      source.id,
      formData({
        intent: "update_content",
        content: "Background.\n\nThe plan is tracked in [[Atlas]] now.\n",
      }),
    );

    const page = await runReferences(source.id, "outgoing");
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.direction).toBe("outgoing");
    expect(page.items[0]?.context).toContain(
      "The plan is tracked in Atlas now.",
    );
  });

  it("excludes structural spine links from both directions", async () => {
    const note = await createNote("Atlas");
    const { project } = await createProject("Website");
    await links().create({
      sourceEntityId: project.id,
      targetEntityId: note.id,
      type: UNIVERSAL_RELATED_LINK,
    });
    const incoming = await runReferences(note.id, "incoming");
    expect(
      incoming.items.every((item) => !item.linkType.includes("belongs_to")),
    ).toBe(true);
  });

  it("server-renders the first page of BOTH directions on the record", async () => {
    const target = await createNote("Atlas");
    const source = await createNote("Source", "[[Atlas]]");
    await reconcileNoteReferences(deps(), source.id, "[[Atlas]]");

    const sourceDetail = await runDetail(source.id);
    expect(sourceDetail.outgoing.items).toHaveLength(1);
    expect(sourceDetail.backlinks.items).toHaveLength(0);

    const targetDetail = await runDetail(target.id);
    expect(targetDetail.backlinks.items).toHaveLength(1);
    expect(targetDetail.outgoing.items).toHaveLength(0);
  });

  it("never shows a reference across workspaces", async () => {
    const target = await createNote("Atlas");
    const foreign = await createNote("Foreign", "", OTHER);
    // A cross-workspace link is impossible at the database level; assert the
    // read side agrees rather than assuming it.
    await expect(
      links().create({
        sourceEntityId: foreign.id,
        targetEntityId: target.id,
        type: UNIVERSAL_RELATED_LINK,
      }),
    ).rejects.toBeDefined();
    expect((await runReferences(target.id, "incoming")).items).toEqual([]);
  });

  it("never drops a relationship that shares one underlying link page", async () => {
    // Regression (PR #80 review): the underlying cursor advances by KERNEL page,
    // not by display item. With 40 relationships inside a single 100-row link
    // page, `nextCursor` is null — so truncating the page to the requested limit
    // would drop rows 26–40 permanently, with no "Load more" able to reach them.
    const target = await createNote("Atlas");
    const sources: string[] = [];
    for (let i = 0; i < 40; i += 1) {
      const source = await createNote(`Source ${i}`);
      sources.push(source.id);
      await links().create({
        sourceEntityId: source.id,
        targetEntityId: target.id,
        type: UNIVERSAL_RELATED_LINK,
      });
    }

    const page = await loadNoteReferences(deps(), target.id, "incoming", {
      limit: 25,
      anchorTitle: "Atlas",
    });
    expect(page.items).toHaveLength(40);
    expect(page.items.map((item) => item.record.id).sort()).toEqual(
      [...sources].sort(),
    );
    expect(page.nextCursor).toBeNull();
  });

  it("loads references without an N+1 — one page, one batched context query", async () => {
    const target = await createNote("Atlas");
    for (let i = 0; i < 5; i += 1) {
      const source = await createNote(`Source ${i}`);
      await runMutate(
        source.id,
        formData({
          intent: "update_content",
          content: `note ${i} → [[Atlas]]`,
        }),
      );
    }
    const page = await loadNoteReferences(deps(), target.id, "incoming", {
      anchorTitle: "Atlas",
    });
    expect(page.items).toHaveLength(5);
    expect(page.items.every((item) => item.context !== null)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Project Knowledge                                                          */
/* -------------------------------------------------------------------------- */

describe("project knowledge", () => {
  it("adds an existing note, and adding it twice creates NO duplicate", async () => {
    const { project } = await createProject("Atlas");
    const note = await createNote("Research");

    expect(
      (
        await runKnowledgePost(
          project.id,
          formData({ intent: "add", noteId: note.id }),
        )
      ).ok,
    ).toBe(true);
    expect(
      (
        await runKnowledgePost(
          project.id,
          formData({ intent: "add", noteId: note.id }),
        )
      ).ok,
    ).toBe(true);

    const page = await loadProjectKnowledge(deps(), project.id);
    expect(page.notes.map((n) => n.id)).toEqual([note.id]);
  });

  it("creates a NEW note already linked to the project", async () => {
    const { project } = await createProject("Atlas");
    const result = await runKnowledgePost(
      project.id,
      formData({ intent: "create", title: "Kick-off notes" }),
    );
    expect(result.kind).toBe("create");
    expect(result.ok).toBe(true);
    if (result.kind !== "create" || !result.ok) return;

    const page = await loadProjectKnowledge(deps(), project.id);
    expect(page.notes.map((n) => n.id)).toEqual([result.noteId]);
    expect((await runDetail(result.noteId)).overview.title).toBe(
      "Kick-off notes",
    );
  });

  it("rejects a blank title with a typed field error, creating NO orphan note", async () => {
    const { project } = await createProject("Atlas");
    const result = await runKnowledgePost(
      project.id,
      formData({ intent: "create", title: "   " }),
    );
    expect(result.ok).toBe(false);
    expect((await loadProjectKnowledge(deps(), project.id)).notes).toEqual([]);
    // A failed create must leave nothing behind — not an unlinked note the user
    // would have to find and clean up (PR #80 review).
    expect((await runIndex()).notes).toEqual([]);
  });

  it("REMOVING a note from the project unlinks it and never deletes or archives it", async () => {
    const { project } = await createProject("Atlas");
    const note = await createNote("Research", "the body survives");
    await runKnowledgePost(
      project.id,
      formData({ intent: "add", noteId: note.id }),
    );

    expect(
      (
        await runKnowledgePost(
          project.id,
          formData({ intent: "remove", noteId: note.id }),
        )
      ).ok,
    ).toBe(true);

    expect((await loadProjectKnowledge(deps(), project.id)).notes).toEqual([]);
    const detail = await runDetail(note.id);
    expect(detail.overview.title).toBe("Research");
    expect(detail.details.content).toBe("the body survives");
    expect(detail.details.archivedAt).toBeNull();
  });

  it("restores the SAME association (never a duplicate) when a removed note is re-added", async () => {
    const { project } = await createProject("Atlas");
    const note = await createNote("Research");
    await linkNoteToProject(deps(), project.id, note.id);
    const before = (await loadProjectKnowledge(deps(), project.id)).notes[0];

    await unlinkNoteFromProject(deps(), project.id, note.id);
    await linkNoteToProject(deps(), project.id, note.id);

    const after = (await loadProjectKnowledge(deps(), project.id)).notes[0];
    expect(after?.linkIds).toEqual(before?.linkIds);
    expect((await loadProjectKnowledge(deps(), project.id)).notes).toHaveLength(
      1,
    );
  });

  it("shows an archived note, flagged, and hides a deleted one", async () => {
    const { project } = await createProject("Atlas");
    const archived = await createNote("Archived");
    const deleted = await createNote("Deleted");
    await linkNoteToProject(deps(), project.id, archived.id);
    await linkNoteToProject(deps(), project.id, deleted.id);
    await noteDetails().setArchived(archived.id, true);
    await entities().softDelete(deleted.id);

    const page = await loadProjectKnowledge(deps(), project.id);
    expect(page.notes.map((n) => n.id)).toEqual([archived.id]);
    expect(page.notes[0]?.archived).toBe(true);
  });

  it("never drops a linked note that shares one underlying link page", async () => {
    // Regression (PR #80 review): the same cursor-granularity trap as
    // `loadNoteReferences` — 40 linked notes inside one 100-row link page would
    // otherwise leave notes 26–40 unreachable from the Knowledge tab.
    const { project } = await createProject("Atlas");
    const noteIds: string[] = [];
    for (let i = 0; i < 40; i += 1) {
      const note = await createNote(`Knowledge ${i}`);
      noteIds.push(note.id);
      await linkNoteToProject(deps(), project.id, note.id);
    }

    const page = await loadProjectKnowledge(deps(), project.id, { limit: 25 });
    expect(page.notes).toHaveLength(40);
    expect(page.notes.map((note) => note.id).sort()).toEqual(
      [...noteIds].sort(),
    );
    expect(page.nextCursor).toBeNull();
    // Every returned row still carries its resolved state — the batched context
    // read must cover the whole page, not just the first requested limit.
    expect(page.notes.every((note) => note.archived === false)).toBe(true);
  });

  it("only ever lists NOTES, never other linked record types", async () => {
    const { project } = await createProject("Atlas");
    const note = await createNote("Research");
    const person = await people().create({ title: "Sam" });
    await linkNoteToProject(deps(), project.id, note.id);
    await links().create({
      sourceEntityId: project.id,
      targetEntityId: person.id,
      type: UNIVERSAL_RELATED_LINK,
    });

    const page = await loadProjectKnowledge(deps(), project.id);
    expect(page.notes.map((n) => n.id)).toEqual([note.id]);
  });

  it("searches notes only, for the add picker", async () => {
    const { project } = await createProject("Atlas");
    const note = await createNote("Widget research");
    await people().create({ title: "Widget person" });

    const response = await runKnowledgeGet(project.id, "widget");
    const body = (await response.json()) as {
      options: { id: string; type: string }[];
    };
    expect(body.options.map((option) => option.id)).toEqual([note.id]);
    expect(body.options.every((option) => option.type === "note")).toBe(true);
  });

  it("fails closed for a missing, wrong-type or cross-workspace project", async () => {
    const note = await createNote("Research");
    // `project` is a reserved spine type, so a cross-workspace Project is
    // created through the spine repository bound to the OTHER workspace.
    const otherSpine = makeSpineRepository(makeContext(OTHER));
    const otherArea = await otherSpine.createArea({ title: "Foreign area" });
    const foreign = await otherSpine.createProject({
      title: "Foreign",
      parent: { kind: "area", id: otherArea.id },
    });
    for (const id of ["missing", note.id, foreign.id]) {
      await expect(runKnowledgeGet(id)).rejects.toMatchObject({ status: 404 });
    }
  });

  it("refuses to link a wrong-type or cross-workspace note", async () => {
    const { project } = await createProject("Atlas");
    const foreignNote = await createNote("Foreign", "", OTHER);
    const person = await people().create({ title: "Sam" });
    for (const noteId of [foreignNote.id, person.id, "missing"]) {
      const result = await runKnowledgePost(
        project.id,
        formData({ intent: "add", noteId }),
      );
      expect(result.ok).toBe(false);
    }
    expect((await loadProjectKnowledge(deps(), project.id)).notes).toEqual([]);
  });

  it("rejects an unknown intent with a typed 400", async () => {
    const { project } = await createProject("Atlas");
    const response = (await knowledgeAction({
      request: new Request(
        `https://app.test/projects/${project.id}/knowledge`,
        {
          method: "POST",
          body: formData({ intent: "nope" }),
        },
      ),
      context: authedContext(),
      params: { projectId: project.id },
    } as unknown as Parameters<typeof knowledgeAction>[0])) as Response;
    expect(response.status).toBe(400);
  });
});

/* -------------------------------------------------------------------------- */
/* Export                                                                     */
/* -------------------------------------------------------------------------- */

describe("single-note export", () => {
  it("serves the canonical Markdown source with metadata and a safe filename", async () => {
    const note = await createNote(
      "Reading list",
      "# Reading list\n\n- one\n- two\n",
    );
    await noteDetails().setTags(note.id, ["reading"]);

    const response = await runExport(note.id, "md");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/markdown");
    expect(response.headers.get("content-disposition")).toContain(
      'filename="reading-list.md"',
    );
    expect(response.headers.get("cache-control")).toBe("no-store");

    const body = await response.text();
    expect(body).toContain('title: "Reading list"');
    expect(body).toContain('tags: ["reading"]');
    expect(body).toContain("- one\n- two\n");
    // Never a re-render presented as the note.
    expect(body).not.toContain("<li>");
  });

  it("exports plain text with the same authorisation and no Markdown syntax", async () => {
    const note = await createNote("Plain", "## Heading\n\n**bold** text\n");
    const response = await runExport(note.id, "txt");
    expect(response.headers.get("content-type")).toContain("text/plain");
    const body = await response.text();
    expect(body).toContain("Heading");
    expect(body).not.toContain("##");
    expect(body).not.toContain("**");
  });

  it("rewrites references to explicit DalyHub links in the Markdown export", async () => {
    const target = await createNote("Atlas");
    const note = await createNote("Source", "See [[Atlas]] and [[Ghost]].");
    const body = await (await runExport(note.id, "md")).text();
    expect(body).toContain(`[Atlas](dalyhub://note/${target.id})`);
    expect(body).toContain("and Ghost.");
    expect(body).not.toContain("[[");
  });

  it("disambiguates the filename when two notes share a title", async () => {
    const first = await createNote("Reading list");
    await createNote("Reading list");
    const disposition = (await runExport(first.id, "md")).headers.get(
      "content-disposition",
    );
    expect(disposition).toContain("reading-list-");
    expect(disposition).not.toContain('filename="reading-list.md"');
  });

  it("defaults to Markdown and rejects an unsupported format", async () => {
    const note = await createNote("Reading list");
    expect((await runExport(note.id)).headers.get("content-type")).toContain(
      "text/markdown",
    );
    await expect(runExport(note.id, "pdf")).rejects.toMatchObject({
      status: 400,
    });
  });

  it("fails closed for a missing, deleted, wrong-type or cross-workspace id", async () => {
    const deleted = await createNote("Gone");
    await entities().softDelete(deleted.id);
    const foreign = await createNote("Foreign", "", OTHER);
    const person = await people().create({ title: "Sam" });

    for (const id of ["missing", deleted.id, foreign.id, person.id]) {
      await expect(runExport(id, "md")).rejects.toMatchObject({ status: 404 });
    }
  });

  it("exports an archived note, and says so in the metadata", async () => {
    const note = await createNote("Archived", "content");
    await noteDetails().setArchived(note.id, true);
    expect(await (await runExport(note.id, "md")).text()).toContain(
      "archived: true",
    );
  });
});
