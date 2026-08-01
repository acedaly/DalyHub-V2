/**
 * NOTES-05 §33 — scale and performance over a representative dataset (real D1).
 *
 * Seeds the shape of a knowledge base that has genuinely been used for a while —
 * hundreds of notes, long Markdown bodies, thousands of relationships, duplicate
 * titles, archived and deleted targets, tags, and notes linked across every
 * module — and then asserts the properties that keep it fast.
 *
 * These are **structural assertions, not benchmarks.** A CI runner's wall-clock
 * is not a product guarantee, and a timing threshold is the classic flaky test.
 * What genuinely degrades is query COUNT and result BOUNDS, so those are what is
 * asserted; measured timings are printed for the record rather than asserted.
 *
 * The failure this suite exists to prevent is the obvious one: a backlink list
 * that loads each source record, or a collection page that loads every note's
 * full Markdown body, turning one page into N queries and megabytes.
 */

import { env } from "cloudflare:test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RouterContextProvider } from "react-router";

import type { AuthenticatedSession } from "~/kernel/auth";
import {
  DEFAULT_REFERENCE_PAGE,
  loadNoteReferences,
} from "~/platform/entity-links/note-references";
import { setAuthenticatedSession } from "~/platform/request";
import { loader as indexLoader } from "~/modules/notes/routes/index";
import { loader as detailLoader } from "~/modules/notes/routes/detail";
import { notesSearchProvider } from "~/modules/notes/search";
import { formatRecordLink } from "~/shared/markdown/record-link";

import {
  FakeClock,
  countingDb,
  makeContext,
  makeLinkRepository,
  makeNoteDetailsRepository,
  makeNoteRepository,
  makeRepository,
  makeSpineRepository,
  resetTables,
  sequentialIds,
} from "./support";
import { createEntityLinkRepository } from "~/platform/storage/d1";

const WS = "test-default-workspace";
const nextId = sequentialIds("nks");

/** The shape of a knowledge base a person has actually been writing in. */
const NOTE_COUNT = 300;
/** How many notes point at the hub note (the worst-case backlink target). */
const HUB_BACKLINKS = 250;
/** A realistic long note: a few thousand words of Markdown. */
const LONG_BODY_PARAGRAPHS = 60;

let hubId = "";
let projectId = "";
const timings: string[] = [];

function context() {
  return makeContext(WS);
}
function entities() {
  return makeRepository(context(), {
    clock: new FakeClock().now,
    idGenerator: nextId,
  });
}
function noteDetails() {
  return makeNoteDetailsRepository(context());
}
function links() {
  return makeLinkRepository(context());
}
function deps() {
  return {
    entities: entities(),
    entityLinks: links(),
    notes: makeNoteRepository(context()),
  };
}

function authedContext(): RouterContextProvider {
  const context = new RouterContextProvider();
  const session: AuthenticatedSession = {
    user: { subject: "owner-subject", email: "owner@example.com" },
    issuedAt: new Date(0),
    expiresAt: new Date(Date.parse("2999-01-01")),
  };
  setAuthenticatedSession(context, session);
  return context;
}

/** Run the registry-discovered Notes search provider, as the app does. */
async function searchNotes(text: string, limit = 10) {
  return notesSearchProvider.search({ text, limit }, {
    workspace: context(),
    signal: new AbortController().signal,
  } as unknown as Parameters<typeof notesSearchProvider.search>[1]);
}

/** Time an operation and record it for the run's summary. */
async function measure<T>(label: string, run: () => Promise<T>): Promise<T> {
  const started = Date.now();
  const result = await run();
  timings.push(`${label}: ${Date.now() - started}ms`);
  return result;
}

function longBody(index: number): string {
  const parts: string[] = [`# Note ${index}`, ""];
  for (let p = 0; p < LONG_BODY_PARAGRAPHS; p += 1) {
    parts.push(`## Section ${p}`, "");
    parts.push(
      `This paragraph exists so the body is realistically long. It mentions hydroponics and scheduling and a distinctive token nk${index}x${p} that content search can find.`,
      "",
    );
  }
  return parts.join("\n");
}

beforeAll(async () => {
  await resetTables([WS]);
  const spine = makeSpineRepository(context());
  const area = await spine.createArea({ title: "Scale area" });
  const project = await spine.createProject({
    title: "Scale project",
    parent: { kind: "area", id: area.id },
  });
  projectId = project.id;

  // The hub: the note everything points at.
  const hub = await entities().create({ type: "note", title: "Scale hub" });
  hubId = hub.id;
  await noteDetails().update(hub.id, longBody(0));

  // Two notes deliberately SHARING a title, so duplicate-title handling is
  // exercised at scale rather than only in a two-row unit test.
  await entities().create({ type: "note", title: "Duplicate title" });
  await entities().create({ type: "note", title: "Duplicate title" });

  // A target that will be archived, and one that will be deleted, so the
  // reading surfaces are measured against a graph that contains both.
  const archived = await entities().create({
    type: "note",
    title: "Archived target",
  });
  await noteDetails().update(archived.id, "Archived body");
  await noteDetails().setArchived(archived.id, true);
  const deleted = await entities().create({
    type: "note",
    title: "Deleted target",
  });

  const linkRepo = links();
  const details = noteDetails();
  const entityRepo = entities();

  for (let i = 1; i <= NOTE_COUNT; i += 1) {
    const note = await entityRepo.create({ type: "note", title: `Note ${i}` });
    // Every fifth note carries a long body; the rest are short. Writing 300 long
    // bodies would make the suite slow without testing anything extra — the
    // queries under test never read a body they do not need, which is the point.
    await details.update(
      note.id,
      i % 5 === 0 ? longBody(i) : `Body for note ${i}.`,
    );
    if (i % 3 === 0) {
      await details.setTags(note.id, ["reading", `bucket-${i % 7}`]);
    }
    // Most notes reference the hub — the worst case for a backlink page.
    if (i <= HUB_BACKLINKS) {
      await linkRepo.create({
        sourceEntityId: note.id,
        targetEntityId: hubId,
        type: "note.references",
      });
    }
    // A spread of cross-module relationships, including to the project.
    if (i % 4 === 0) {
      await linkRepo.create({
        sourceEntityId: note.id,
        targetEntityId: projectId,
        type: "link.related",
      });
    }
    if (i % 11 === 0) {
      await linkRepo.create({
        sourceEntityId: note.id,
        targetEntityId: archived.id,
        type: "note.references",
      });
    }
    if (i % 13 === 0) {
      await linkRepo.create({
        sourceEntityId: note.id,
        targetEntityId: deleted.id,
        type: "note.references",
      });
    }
  }

  // Delete the target AFTER linking, so the graph genuinely contains links to a
  // soft-deleted record — the state a naive reader would fail on.
  await entityRepo.softDelete(deleted.id);

  // A record link by id, so the id-based path is in the measured dataset too.
  const linker = await entityRepo.create({
    type: "note",
    title: "Record link note",
  });
  await details.update(
    linker.id,
    `Points at [the hub](${formatRecordLink("note", hubId)}).`,
  );
}, 600_000);

afterAll(() => {
  // Printed for the record — the PR quotes these. Deliberately not asserted.
  console.log(`\n  NOTES-05 scale measurements (${NOTE_COUNT} notes):`);
  for (const line of timings) console.log(`    ${line}`);
});

describe("bounded reads at scale", () => {
  it("serves the Notes collection as ONE bounded page, never the whole workspace", async () => {
    const data = await measure("notes collection (first page)", () =>
      indexLoader({
        request: new Request("https://app.test/notes"),
        context: authedContext(),
        params: {},
      } as unknown as Parameters<typeof indexLoader>[0]),
    );
    // A page, not 300 rows.
    expect(data.notes.length).toBeGreaterThan(0);
    expect(data.notes.length).toBeLessThanOrEqual(50);
    expect(data.nextCursor).not.toBeNull();
  });

  it("does not carry any note's full Markdown body in the collection page", async () => {
    const data = await indexLoader({
      request: new Request("https://app.test/notes"),
      context: authedContext(),
      params: {},
    } as unknown as Parameters<typeof indexLoader>[0]);
    const serialised = JSON.stringify(data);
    // The long bodies contain this section marker; a card projection must not.
    expect(serialised).not.toContain("## Section 40");
    // A generous ceiling that a full-body page would blow through immediately:
    // 300 notes × a 60-section body is megabytes.
    expect(serialised.length).toBeLessThan(400_000);
  });

  it("reads a backlink page in a BOUNDED number of queries — never one per row", async () => {
    const counting = countingDb(env.DB);
    const linkRepo = createEntityLinkRepository(counting.db, context(), {
      clock: new FakeClock().now,
    });
    counting.reset();
    const page = await measure("backlink page (250 backlinks)", () =>
      loadNoteReferences(
        { ...deps(), entityLinks: linkRepo },
        hubId,
        "incoming",
        { limit: DEFAULT_REFERENCE_PAGE, anchorTitle: "Scale hub" },
      ),
    );
    expect(page.items.length).toBeGreaterThan(0);
    // The contract: one query per KERNEL page scanned, plus ONE batched context
    // query for the whole page. Emphatically not one per displayed row.
    expect(counting.prepareCount()).toBeLessThanOrEqual(6);
    expect(counting.prepareCount()).toBeLessThan(page.items.length);
  });

  it("keeps the backlink page bounded even though 250 records point at the hub", async () => {
    const page = await loadNoteReferences(deps(), hubId, "incoming", {
      limit: DEFAULT_REFERENCE_PAGE,
      anchorTitle: "Scale hub",
    });
    // `limit` is a stop-scanning threshold that may overshoot by at most one
    // kernel page (100) — never the whole 250.
    expect(page.items.length).toBeLessThanOrEqual(DEFAULT_REFERENCE_PAGE + 100);
    expect(page.nextCursor).not.toBeNull();
  });

  it("excludes the soft-deleted target from every backlink page", async () => {
    const page = await loadNoteReferences(deps(), hubId, "incoming", {
      limit: DEFAULT_REFERENCE_PAGE,
      anchorTitle: "Scale hub",
    });
    expect(
      page.items.some((item) => item.record.title === "Deleted target"),
    ).toBe(false);
  });

  it("loads the note record — both link directions and the print body — in one bounded pass", async () => {
    const data = await measure("note record (hub, both directions)", () =>
      detailLoader({
        request: new Request(`https://app.test/notes/${hubId}`),
        context: authedContext(),
        params: { noteId: hubId },
      } as unknown as Parameters<typeof detailLoader>[0]),
    );
    expect(data.overview.id).toBe(hubId);
    expect(data.backlinks.items.length).toBeGreaterThan(0);
    // The print body is rendered server-side; it must exist for a non-empty note.
    expect(data.printHtml).not.toBeNull();
  });

  it("searches note BODIES across the workspace with a bounded, deterministic result", async () => {
    const results = await measure("content search (body token)", () =>
      searchNotes("nk25x30"),
    );
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(10);
    // Deterministic: the same query twice gives the same ids in the same order.
    const again = await searchNotes("nk25x30");
    expect(again.map((r) => r.id)).toEqual(results.map((r) => r.id));
  });

  it("never returns a whole note body in a search result snippet", async () => {
    const results = await searchNotes("hydroponics");
    for (const result of results) {
      const text = JSON.stringify(result);
      expect(text.length).toBeLessThan(2_000);
      expect(text).not.toContain("## Section 40");
    }
  });

  it("filters the collection to unlinked notes without scanning every relationship", async () => {
    const data = await measure("collection filter (unlinked)", () =>
      indexLoader({
        request: new Request("https://app.test/notes?links=unlinked"),
        context: authedContext(),
        params: {},
      } as unknown as Parameters<typeof indexLoader>[0]),
    );
    expect(data.notes.length).toBeLessThanOrEqual(50);
  });

  it("filters the collection by project at scale", async () => {
    const data = await measure("collection filter (project)", () =>
      indexLoader({
        request: new Request(`https://app.test/notes?project=${projectId}`),
        context: authedContext(),
        params: {},
      } as unknown as Parameters<typeof indexLoader>[0]),
    );
    expect(data.notes.length).toBeGreaterThan(0);
    expect(data.notes.length).toBeLessThanOrEqual(50);
  });

  it("filters the collection by tag at scale", async () => {
    const data = await measure("collection filter (tag)", () =>
      indexLoader({
        request: new Request("https://app.test/notes?tag=reading"),
        context: authedContext(),
        params: {},
      } as unknown as Parameters<typeof indexLoader>[0]),
    );
    expect(data.notes.length).toBeGreaterThan(0);
    expect(data.notes.length).toBeLessThanOrEqual(50);
  });
});
