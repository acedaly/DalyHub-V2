import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { RouterContextProvider } from "react-router";

import type { AuthenticatedSession } from "~/kernel/auth";
import {
  NOTE_REFERENCES_LINK,
  loadNoteReferences,
  reconcileNoteReferences,
} from "~/platform/entity-links/note-references";
import { setAuthenticatedSession } from "~/platform/request";
import { loader as detailLoader } from "~/modules/notes/routes/detail";
import { loader as resolveLoader } from "~/modules/notes/routes/resolve";
import { action as mutateAction } from "~/modules/notes/routes/mutate";
import { loader as linksLoader } from "~/routes/links";
import { formatRecordLink } from "~/shared/markdown/record-link";

import {
  FakeClock,
  makeContext,
  makeLinkRepository,
  makeNoteRepository,
  makePersonRepository,
  makeRepository,
  makeSpineRepository,
  resetTables,
  sequentialIds,
} from "./support";

/**
 * NOTES-05 §5/§23/§28 — `dalyhub://` RECORD LINKS, proven against REAL D1.
 *
 * A record link is only worth having if three things are true end to end, and
 * each is a separate failure mode:
 *
 *   1. writing one creates a REAL, typed relationship — so the target learns it
 *      has been referenced and the link shows up as a backlink;
 *   2. the relationship survives a RENAME and is never confused by duplicate
 *      titles, which is the whole reason ids beat titles;
 *   3. a target the user must not reach — another workspace's record, a deleted
 *      one — is refused SERVER-side, because the id in a note body is user input.
 *
 * Everything runs through the deployed composition boundary (real loaders and
 * actions, real repositories, the real migration), so a pass means the shipped
 * path works rather than that a mock agreed with itself.
 */
const WS = "test-default-workspace";
const OTHER = "ws_record_links_other";
const nextId = sequentialIds("rl");

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
    idGenerator: nextId,
  });
}
function notes(ws = WS) {
  return makeNoteRepository(makeContext(ws));
}
function links(ws = WS) {
  return makeLinkRepository(makeContext(ws));
}
function deps(ws = WS) {
  return { entities: entities(ws), entityLinks: links(ws), notes: notes(ws) };
}

async function createNote(title: string, ws = WS) {
  return entities(ws).create({ type: "note", title });
}

/**
 * Create a real Project through the SPINE (Area → Project). `project` is a
 * reserved spine type, so the generic entity repository refuses it by design —
 * the hierarchy owns its own records.
 */
async function createProject(title: string, ws = WS) {
  const spine = makeSpineRepository(makeContext(ws));
  const area = await spine.createArea({ title: `${title} area` });
  return spine.createProject({ title, parent: { kind: "area", id: area.id } });
}

/** Create a real Person through the person repository (also a reserved type). */
async function createPerson(title: string, ws = WS) {
  return makePersonRepository(makeContext(ws)).create({ title });
}

/** A spine record's lifecycle and rename are owned by the spine repository. */
function spine(ws = WS) {
  return makeSpineRepository(makeContext(ws));
}

/** Create a real Task through the spine, under a fresh Area. */
async function createTask(title: string, ws = WS) {
  const spine = makeSpineRepository(makeContext(ws));
  const area = await spine.createArea({ title: `${title} area` });
  return spine.createTask({ title, parent: { kind: "area", id: area.id } });
}

/** Save a note's body through the REAL mutate route, reconciliation included. */
async function saveBody(noteId: string, content: string) {
  const form = new FormData();
  form.set("intent", "update_content");
  form.set("content", content);
  const response = (await mutateAction({
    request: new Request(`https://app.test/notes/${noteId}/mutate`, {
      method: "POST",
      body: form,
    }),
    context: authedContext(),
    params: { noteId },
  } as unknown as Parameters<typeof mutateAction>[0])) as Response;
  return response.json();
}

async function runResolve(query: string) {
  return resolveLoader({
    request: new Request(`https://app.test/notes/resolve?${query}`),
    context: authedContext(),
    params: {},
  } as unknown as Parameters<typeof resolveLoader>[0]);
}

/** The note's outgoing `note.references` targets, as a set of ids. */
async function referencedIds(noteId: string): Promise<Set<string>> {
  const page = await links().listForEntity(noteId, {
    direction: "outgoing",
    type: NOTE_REFERENCES_LINK,
    limit: 100,
  });
  return new Set(page.items.map((view) => view.counterpart.id));
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

describe("record links become real relationships", () => {
  it("creates ONE typed note.references link for a record link, by stable id", async () => {
    const note = await createNote("Meeting prep");
    const project = await createProject("Atlas");

    await saveBody(
      note.id,
      `Prep for [Atlas](${formatRecordLink("project", project.id)}).`,
    );

    expect(await referencedIds(note.id)).toEqual(new Set([project.id]));
  });

  it("writes ONE link no matter how many times the same record is linked", async () => {
    const note = await createNote("Repeats");
    const project = await createProject("Atlas");
    const url = formatRecordLink("project", project.id);

    await saveBody(note.id, `[A](${url}) and [B](${url}) and [C](${url})`);

    const page = await links().listForEntity(note.id, {
      direction: "outgoing",
      type: NOTE_REFERENCES_LINK,
      limit: 100,
    });
    expect(page.items).toHaveLength(1);
  });

  it("never creates a link from a record link inside a code fence", async () => {
    const note = await createNote("Docs about linking");
    const project = await createProject("Atlas");
    const url = formatRecordLink("project", project.id);

    await saveBody(note.id, ["```", `[Atlas](${url})`, "```"].join("\n"));

    expect(await referencedIds(note.id)).toEqual(new Set());
  });

  it("unlinks when the record link is removed, and RESTORES the same link id when re-added", async () => {
    const note = await createNote("Toggling");
    const project = await createProject("Atlas");
    const url = formatRecordLink("project", project.id);

    await saveBody(note.id, `[Atlas](${url})`);
    const first = await links().listForEntity(note.id, {
      direction: "outgoing",
      type: NOTE_REFERENCES_LINK,
      limit: 10,
    });
    const linkId = first.items[0]!.link.id;

    await saveBody(note.id, "No links here.");
    expect(await referencedIds(note.id)).toEqual(new Set());

    await saveBody(note.id, `[Atlas again](${url})`);
    const again = await links().listForEntity(note.id, {
      direction: "outgoing",
      type: NOTE_REFERENCES_LINK,
      limit: 10,
    });
    expect(again.items).toHaveLength(1);
    // The SAME relationship comes back — never a duplicate row.
    expect(again.items[0]!.link.id).toBe(linkId);
  });

  it("co-exists with [[wiki links]] in one note, as one combined reference set", async () => {
    const note = await createNote("Both forms");
    const project = await createProject("Atlas");
    const person = await createPerson("Sam");

    await saveBody(
      note.id,
      `[Atlas](${formatRecordLink("project", project.id)}) with [[Sam]].`,
    );

    expect(await referencedIds(note.id)).toEqual(
      new Set([project.id, person.id]),
    );
  });

  it("collapses a record link and a [[wiki link]] to the SAME record into one relationship", async () => {
    const note = await createNote("Same target twice");
    const project = await createProject("Atlas");

    await saveBody(
      note.id,
      `[Atlas](${formatRecordLink("project", project.id)}) and [[Atlas]].`,
    );

    const page = await links().listForEntity(note.id, {
      direction: "outgoing",
      type: NOTE_REFERENCES_LINK,
      limit: 100,
    });
    expect(page.items).toHaveLength(1);
  });

  it("ignores a self-reference — a record cannot relate to itself", async () => {
    const note = await createNote("Self");
    await saveBody(note.id, `[Me](${formatRecordLink("note", note.id)})`);
    expect(await referencedIds(note.id)).toEqual(new Set());
  });

  it("is idempotent: saving unchanged content writes nothing new", async () => {
    const note = await createNote("Idempotent");
    const project = await createProject("Atlas");
    const source = `[Atlas](${formatRecordLink("project", project.id)})`;

    const first = await reconcileNoteReferences(deps(), note.id, source);
    expect(first.created).toBe(1);
    const second = await reconcileNoteReferences(deps(), note.id, source);
    expect(second.created).toBe(0);
    expect(second.removed).toBe(0);
  });
});

describe("record links and the target's lifecycle", () => {
  it("survives a RENAME of the target — the relationship is by id, not title", async () => {
    const note = await createNote("Stable");
    const project = await createProject("Atlas");
    await saveBody(
      note.id,
      `[Atlas](${formatRecordLink("project", project.id)})`,
    );

    await spine().rename(project.id, "Atlas Renamed");
    // Re-save the UNCHANGED body: reconciliation must not drop the link just
    // because the prose still reads the old title.
    await saveBody(
      note.id,
      `[Atlas](${formatRecordLink("project", project.id)})`,
    );

    const page = await loadNoteReferences(deps(), note.id, "outgoing");
    expect(page.items).toHaveLength(1);
    // The DISPLAY title follows the record; the author's words are never rewritten.
    expect(page.items[0]!.record.title).toBe("Atlas Renamed");
  });

  it("distinguishes two records that share a title — the ambiguity ids exist to remove", async () => {
    const note = await createNote("Ambiguous");
    const first = await createProject("Atlas");
    const second = await entities().create({ type: "note", title: "Atlas" });

    // A record link names the SECOND one explicitly. A [[wiki link]] could not:
    // it would resolve by title and pick the tie-break winner.
    await saveBody(note.id, `[Atlas](${formatRecordLink("note", second.id)})`);

    const referenced = await referencedIds(note.id);
    expect(referenced).toEqual(new Set([second.id]));
    expect(referenced.has(first.id)).toBe(false);
  });

  it("hides a reference to a DELETED target and returns it intact on restore", async () => {
    const note = await createNote("Lifecycle");
    const project = await createProject("Atlas");
    await saveBody(
      note.id,
      `[Atlas](${formatRecordLink("project", project.id)})`,
    );
    expect(
      (await loadNoteReferences(deps(), note.id, "outgoing")).items,
    ).toHaveLength(1);

    await spine().softDelete(project.id);
    expect(
      (await loadNoteReferences(deps(), note.id, "outgoing")).items,
    ).toHaveLength(0);

    await spine().restore(project.id);
    expect(
      (await loadNoteReferences(deps(), note.id, "outgoing")).items,
    ).toHaveLength(1);
  });

  it("deleting the target does not delete the note, and the note still opens", async () => {
    const note = await createNote("Survivor");
    const project = await createProject("Atlas");
    await saveBody(
      note.id,
      `[Atlas](${formatRecordLink("project", project.id)})`,
    );
    await spine().softDelete(project.id);

    const data = await detailLoader({
      request: new Request(`https://app.test/notes/${note.id}`),
      context: authedContext(),
      params: { noteId: note.id },
    } as unknown as Parameters<typeof detailLoader>[0]);
    expect(data.overview.id).toBe(note.id);
    // The body is untouched — a broken link is the user's text, not our error.
    expect(data.details.content).toContain("dalyhub://project/");
  });

  it("reports an unresolvable record link rather than failing the save", async () => {
    const note = await createNote("Dangling");
    const missing = "11111111-2222-4333-8444-555555555555";

    const result = await reconcileNoteReferences(
      deps(),
      note.id,
      `[Gone](${formatRecordLink("project", missing)})`,
    );
    expect(result.created).toBe(0);
    expect(result.unresolved).toContain(missing);
    expect(await referencedIds(note.id)).toEqual(new Set());
  });

  it("refuses a CROSS-WORKSPACE target — the id in a note body is never trusted", async () => {
    const note = await createNote("Crossing");
    const foreign = await createProject("Not yours", OTHER);

    const result = await reconcileNoteReferences(
      deps(),
      note.id,
      `[Theirs](${formatRecordLink("project", foreign.id)})`,
    );
    expect(result.created).toBe(0);
    expect(result.unresolved).toContain(foreign.id);
    expect(await referencedIds(note.id)).toEqual(new Set());
  });
});

describe("the record-link resolver route", () => {
  it("redirects to the target's canonical record route", async () => {
    const project = await createProject("Atlas");
    const response = (await runResolve(
      `type=project&id=${project.id}`,
    )) as Response;
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`/projects/${project.id}`);
  });

  it("resolves without a declared type, using the STORED type", async () => {
    const note = await createNote("Target");
    const response = (await runResolve(`id=${note.id}`)) as Response;
    expect(response.headers.get("location")).toBe(`/notes/${note.id}`);
  });

  it("refuses a link whose declared type contradicts the stored one", async () => {
    const note = await createNote("Target");
    const result = await runResolve(`type=project&id=${note.id}`);
    expect(result).toEqual({ unavailable: true });
  });

  it("says 'unavailable' — never redirects — for a DELETED target", async () => {
    const project = await createProject("Atlas");
    await spine().softDelete(project.id);
    expect(await runResolve(`type=project&id=${project.id}`)).toEqual({
      unavailable: true,
    });
  });

  it("says 'unavailable' for a CROSS-WORKSPACE id, disclosing nothing", async () => {
    const foreign = await createProject("Not yours", OTHER);
    expect(await runResolve(`type=project&id=${foreign.id}`)).toEqual({
      unavailable: true,
    });
  });

  it("says 'unavailable' for a missing id — the same outcome, so no case is distinguishable", async () => {
    expect(await runResolve("type=project&id=nope")).toEqual({
      unavailable: true,
    });
  });

  it("says 'unavailable' for a real record with no standalone page (a Task)", async () => {
    const task = await createTask("Do it");
    expect(await runResolve(`type=task&id=${task.id}`)).toEqual({
      unavailable: true,
    });
  });

  it("still resolves a [[wiki link]] title, unchanged from NOTES-02", async () => {
    const target = await createNote("Atlas");
    const response = (await runResolve("title=Atlas")) as Response;
    expect(response.headers.get("location")).toBe(`/notes/${target.id}`);
  });
});

describe("the record-link picker's search endpoint", () => {
  async function runSearch(anchor: string, query = "") {
    const response = (await linksLoader({
      request: new Request(
        `https://app.test/links?op=record-link&anchor=${anchor}&q=${encodeURIComponent(query)}`,
      ),
      context: authedContext(),
      params: {},
    } as unknown as Parameters<typeof linksLoader>[0])) as Response;
    return (await response.json()) as {
      op: string;
      options: readonly {
        id: string;
        type: string;
        title: string;
        url: string;
      }[];
    };
  }

  it("returns each option with a SERVER-formatted destination, so the client mints none", async () => {
    const note = await createNote("Anchor");
    const project = await createProject("Atlas");

    const data = await runSearch(note.id, "Atlas");
    const option = data.options.find(
      (candidate) => candidate.id === project.id,
    );
    expect(option).toBeDefined();
    expect(option!.url).toBe(formatRecordLink("project", project.id));
    expect(option!.title).toBe("Atlas");
  });

  it("excludes the anchor note from its own results", async () => {
    const note = await createNote("Anchor");
    const data = await runSearch(note.id, "Anchor");
    expect(data.options.some((option) => option.id === note.id)).toBe(false);
  });

  it("never returns a record from another workspace", async () => {
    const note = await createNote("Anchor");
    const foreign = await createProject("Foreign Atlas", OTHER);
    const data = await runSearch(note.id, "Atlas");
    expect(data.options.some((option) => option.id === foreign.id)).toBe(false);
  });

  it("never returns a DELETED record", async () => {
    const note = await createNote("Anchor");
    const project = await createProject("Atlas");
    await spine().softDelete(project.id);
    const data = await runSearch(note.id, "Atlas");
    expect(data.options.some((option) => option.id === project.id)).toBe(false);
  });

  it("fails closed for an anchor that is not in this workspace", async () => {
    const foreign = await entities(OTHER).create({
      type: "note",
      title: "Theirs",
    });
    const response = (await linksLoader({
      request: new Request(
        `https://app.test/links?op=record-link&anchor=${foreign.id}`,
      ),
      context: authedContext(),
      params: {},
    } as unknown as Parameters<typeof linksLoader>[0])) as Response;
    expect(response.status).toBe(404);
  });
});

/**
 * NOTES-05 §23 — link integrity.
 *
 * The requirement is an integrity query that DETECTS dangling relationships
 * rather than a hope that none exist. These assert the two properties that make
 * the graph trustworthy: a soft-deleted endpoint HIDES its links without
 * destroying them (so history is not silently rewritten), and no reference row
 * ever points at an endpoint that does not exist at all.
 */
describe("link integrity", () => {
  it("keeps the relationship ROW when a target is soft-deleted — history is not rewritten", async () => {
    const note = await createNote("Keeper");
    const project = await createProject("Atlas");
    await saveBody(
      note.id,
      `[Atlas](${formatRecordLink("project", project.id)})`,
    );
    await spine().softDelete(project.id);

    // Hidden from the reading surface…
    expect(
      (await loadNoteReferences(deps(), note.id, "outgoing")).items,
    ).toHaveLength(0);
    // …but still on disk, which is why a restore brings it back intact.
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM entity_links
        WHERE workspace_id = ?1 AND source_entity_id = ?2 AND type = ?3
          AND deleted_at IS NULL`,
    )
      .bind(WS, note.id, NOTE_REFERENCES_LINK)
      .first<{ n: number }>();
    expect(row?.n).toBe(1);
  });

  it("leaves NO dangling reference row — every endpoint resolves to a real entity", async () => {
    const note = await createNote("Graph");
    const project = await createProject("Atlas");
    const person = await createPerson("Sam");
    await saveBody(
      note.id,
      [
        `[Atlas](${formatRecordLink("project", project.id)})`,
        "[[Sam]]",
        `[Gone](${formatRecordLink("project", "11111111-2222-4333-8444-555555555555")})`,
      ].join("\n\n"),
    );
    await entities().softDelete(person.id);

    // The integrity query: any link whose source or target has no `entities`
    // row in the same workspace at all. Soft-deleted endpoints still HAVE a row,
    // so they are correctly not dangling.
    const dangling = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM entity_links l
        WHERE NOT EXISTS (
                SELECT 1 FROM entities e
                 WHERE e.workspace_id = l.workspace_id AND e.id = l.source_entity_id)
           OR NOT EXISTS (
                SELECT 1 FROM entities e
                 WHERE e.workspace_id = l.workspace_id AND e.id = l.target_entity_id)`,
    ).first<{ n: number }>();
    expect(dangling?.n).toBe(0);
  });

  it("never writes a link for an unresolvable record id in the first place", async () => {
    const note = await createNote("Careful");
    await saveBody(
      note.id,
      `[Gone](${formatRecordLink("project", "99999999-2222-4333-8444-555555555555")})`,
    );
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM entity_links WHERE source_entity_id = ?1`,
    )
      .bind(note.id)
      .first<{ n: number }>();
    expect(row?.n).toBe(0);
  });
});
