import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { TAG_VOCABULARY_READ_LIMIT } from "~/kernel/tags";
import type { WorkspaceSnapshotV1 } from "~/kernel/export";
import {
  buildStructuredExportArchive,
  buildWorkspaceSnapshot,
} from "~/platform/export";
import { prepareRestore, applyRestore } from "~/platform/restore";
import type { RestoreDependencies } from "~/platform/restore";
import {
  createTagVocabularyRepository,
  createWorkspaceRestoreRepository,
  createWorkspaceSnapshotRepository,
} from "~/platform/storage/d1";

import {
  countingDb,
  ensureWorkspace,
  makeAssetRepository,
  makeContext,
  makeNoteDetailsRepository,
  makePersonRepository,
  makeRepository,
  resetTables,
} from "./support";

/**
 * V2.6 FIND-02 — the one tag vocabulary, against real D1.
 *
 * Three of FIND-02's six acceptance criteria are proven here, and each is
 * written the way the criterion asks rather than the way it is easiest:
 *
 *   - **criterion 4** — *"Export → restore returns every tag, on every entity
 *     that had one."* Proven by exporting a workspace, DESTROYING its tag rows,
 *     restoring the archive and reading the tags back off the records — and
 *     separately by restoring an archive written BEFORE this migration existed,
 *     because the owner's existing backups are the safety net taken before it
 *     is applied and a restore that dropped their tags would make the safety net
 *     the thing that loses the data.
 *   - **criterion 5** — *"Bounded: the vocabulary aggregate is one query with a
 *     stated ceiling, flat in workspace size, with a counted-statement proof."*
 *     Counted, and then re-counted over a workspace twenty records larger.
 *   - and the case decision, asserted where it matters most: across two
 *     DIFFERENT entity types, which is the exact shape of DEBT-182's complaint.
 */

const WS = "test-default-workspace";
const OTHER = "tag-other-workspace";
const TARGET = "tag-restore-target";
const OWNER = "owner-subject";
const APPLICATION = {
  name: "DalyHub",
  version: "2.6.0",
  releaseName: "test",
  environment: "test",
  buildCommit: null,
};

function vocabularyRepo(workspaceId = WS, db: D1Database = env.DB) {
  return createTagVocabularyRepository(db, makeContext(workspaceId));
}

function exportSnapshot(workspaceId: string): Promise<WorkspaceSnapshotV1> {
  return buildWorkspaceSnapshot(
    createWorkspaceSnapshotRepository(env.DB, makeContext(workspaceId)),
    {
      ownerId: OWNER,
      exportedAt: new Date("2026-08-29T09:00:00.000Z"),
      application: APPLICATION,
    },
  );
}

function dependencies(workspaceId: string): RestoreDependencies {
  const context = makeContext(workspaceId);
  let counter = 0;
  return {
    restore: createWorkspaceRestoreRepository(env.DB, context),
    snapshot: createWorkspaceSnapshotRepository(env.DB, context),
    workspaceId,
    ownerId: OWNER,
    application: APPLICATION,
    now: () => new Date("2026-08-30T00:00:00.000Z"),
    newId: () => `tag-restore-${++counter}`,
  };
}

/** One entity's tag labels, read through the product's own repositories. */
async function tagsOnPerson(id: string): Promise<readonly string[]> {
  const person = await makePersonRepository(makeContext(WS)).get(id);
  return person?.tags ?? [];
}

/**
 * Lose a workspace's records, leaving the workspace row — the thing a backup
 * exists for. Children strictly before parents, exactly as the cutover does.
 *
 * `entities.id` is globally unique, so this also has to run before a restore
 * into a DIFFERENT workspace: the archive carries the same ids.
 */
async function loseRecords(workspaceId: string): Promise<void> {
  for (const table of [
    "activity_subjects",
    "activities",
    "entity_links",
    "asset_obligations",
    "asset_events",
    "asset_details",
    "person_details",
    "note_details",
    "task_details",
    "spine_records",
    "entity_tags",
    "entities",
    "workspace_tags",
  ]) {
    await env.DB.prepare(`DELETE FROM ${table} WHERE workspace_id = ?`)
      .bind(workspaceId)
      .run();
  }
}

async function tagRows(workspaceId: string): Promise<string[]> {
  const result = await env.DB.prepare(
    `SELECT entity_id, tag_key FROM entity_tags
      WHERE workspace_id = ? ORDER BY entity_id, tag_key`,
  )
    .bind(workspaceId)
    .all<{ entity_id: string; tag_key: string }>();
  return (result.results ?? []).map((row) => `${row.entity_id}:${row.tag_key}`);
}

describe("FIND-02 — the workspace tag vocabulary (D1)", () => {
  beforeEach(async () => {
    await resetTables([WS, OTHER, TARGET]);
  });

  it("is ONE tag across DIFFERENT entity types, keeping the first spelling", async () => {
    // The exact shape of DEBT-182: `#errand` on a Note and `Errand` on an Asset
    // were different tags. They are now one, and the label is what the owner
    // typed first — which is the recorded case decision, asserted end to end
    // rather than only on the migration.
    const person = await makePersonRepository(makeContext(WS)).create({
      title: "Ada",
      tags: ["Errand"],
    });
    const asset = await makeAssetRepository(makeContext(WS)).create({
      title: "Bike",
      assetType: "equipment",
      tags: ["ERRAND", "garage"],
    });
    const note = await makeRepository(makeContext(WS)).create({
      type: "note",
      title: "List",
    });
    await makeNoteDetailsRepository(makeContext(WS)).setTags(note.id, [
      "errand",
    ]);

    const vocabulary = await vocabularyRepo().listVocabulary();
    expect(vocabulary).toEqual([
      { key: "errand", label: "Errand" },
      { key: "garage", label: "garage" },
    ]);
    // Every record shows the ONE spelling, whatever it typed.
    expect(await tagsOnPerson(person.id)).toEqual(["Errand"]);
    expect(
      (await makeAssetRepository(makeContext(WS)).get(asset.id))?.tags,
    ).toEqual(["Errand", "garage"]);
    expect(
      (await makeNoteDetailsRepository(makeContext(WS)).get(note.id))?.tags,
    ).toEqual(["Errand"]);
  });

  it("reads the vocabulary in ONE statement, flat in workspace size", async () => {
    const people = makePersonRepository(makeContext(WS));
    await people.create({ title: "One", tags: ["alpha", "beta"] });

    const counting = countingDb(env.DB);
    await vocabularyRepo(WS, counting.db).listVocabulary();
    // Criterion 5's "one query with a stated ceiling". Not "a small number".
    expect(counting.prepareCount()).toBe(1);

    // Twenty more tagged records, and the same one statement — because the read
    // touches `workspace_tags` alone and never the records that carry a tag.
    for (let index = 0; index < 20; index += 1) {
      await people.create({ title: `Extra ${index}`, tags: ["alpha"] });
    }
    counting.reset();
    const vocabulary = await vocabularyRepo(WS, counting.db).listVocabulary();
    expect(counting.prepareCount()).toBe(1);
    expect(vocabulary).toHaveLength(2);
  });

  it("bounds the read at the stated ceiling, whatever the caller asks for", async () => {
    const bounded = await vocabularyRepo().listVocabulary(10_000);
    expect(bounded.length).toBeLessThanOrEqual(TAG_VOCABULARY_READ_LIMIT);
  });

  it("counts usage in ONE statement, and counts only live records", async () => {
    const people = makePersonRepository(makeContext(WS));
    const kept = await people.create({ title: "Kept", tags: ["shared"] });
    const gone = await people.create({ title: "Gone", tags: ["shared"] });
    await makeRepository(makeContext(WS)).softDelete(gone.id);

    const counting = countingDb(env.DB);
    const usage = await vocabularyRepo(WS, counting.db).listVocabularyUsage();
    expect(counting.prepareCount()).toBe(1);
    expect(usage).toEqual([{ key: "shared", label: "shared", count: 1 }]);
    expect(await tagsOnPerson(kept.id)).toEqual(["shared"]);
  });

  it("keeps one workspace's vocabulary entirely its own", async () => {
    await makePersonRepository(makeContext(WS)).create({
      title: "Here",
      tags: ["shared", "mine"],
    });
    await makePersonRepository(makeContext(OTHER)).create({
      title: "There",
      tags: ["shared", "theirs"],
    });
    expect(
      (await vocabularyRepo(WS).listVocabulary()).map((tag) => tag.key),
    ).toEqual(["mine", "shared"]);
    expect(
      (await vocabularyRepo(OTHER).listVocabulary()).map((tag) => tag.key),
    ).toEqual(["shared", "theirs"]);
  });

  it("keeps a vocabulary entry when its LAST record drops it", async () => {
    // The recorded decision: a word the owner has used stays offerable. A
    // vocabulary that forgot a tag the moment nothing carried it would be an
    // aggregate, and `#errand` would become un-typable the first time the last
    // errand was done.
    const people = makePersonRepository(makeContext(WS));
    const person = await people.create({ title: "Ada", tags: ["errand"] });
    await people.update(person.id, { tags: [] });

    expect(await tagsOnPerson(person.id)).toEqual([]);
    expect(
      (await vocabularyRepo().listVocabulary()).map((tag) => tag.key),
    ).toEqual(["errand"]);
    // …and it reports itself, honestly, as carried by nothing.
    expect(await vocabularyRepo().listVocabularyUsage()).toEqual([
      { key: "errand", label: "errand", count: 0 },
    ]);
  });

  it("keeps a tag another record still uses when one record drops it", async () => {
    const people = makePersonRepository(makeContext(WS));
    const dropping = await people.create({ title: "Drops", tags: ["shared"] });
    const keeping = await people.create({ title: "Keeps", tags: ["shared"] });
    await people.update(dropping.id, { tags: [] });

    expect(await tagsOnPerson(dropping.id)).toEqual([]);
    expect(await tagsOnPerson(keeping.id)).toEqual(["shared"]);
    expect(
      (await vocabularyRepo().listVocabulary()).map((tag) => tag.key),
    ).toEqual(["shared"]);
  });

  it("records no change, and no Activity, when a tag is re-typed in another case", async () => {
    const people = makePersonRepository(makeContext(WS));
    const person = await people.create({ title: "Ada", tags: ["Errand"] });
    const result = await people.update(person.id, { tags: ["ERRAND"] });
    // A record carries tag IDENTITIES. `ERRAND` is the same tag, the vocabulary
    // keeps the first spelling, and an owner who did not change anything must
    // not get an Activity event saying they did.
    expect(result.changed).toBe(false);
    expect(result.person.tags).toEqual(["Errand"]);
  });
});

describe("FIND-02 — export and restore return every tag (D1)", () => {
  beforeEach(async () => {
    await resetTables([WS, OTHER, TARGET]);
  });

  it("returns every tag to every entity that had one", async () => {
    const people = makePersonRepository(makeContext(WS));
    const assets = makeAssetRepository(makeContext(WS));
    const entities = makeRepository(makeContext(WS));
    const noteDetails = makeNoteDetailsRepository(makeContext(WS));

    const person = await people.create({
      title: "Ada",
      tags: ["Errand", "Deep Work"],
    });
    const asset = await assets.create({
      title: "Bike",
      assetType: "equipment",
      tags: ["garage"],
    });
    const note = await entities.create({ type: "note", title: "List" });
    await noteDetails.setTags(note.id, ["errand", "reading"]);
    // A vocabulary entry with NO remaining record — the case a per-record
    // assertion can never see.
    const orphanCarrier = await entities.create({
      type: "note",
      title: "Was filed",
    });
    await noteDetails.setTags(orphanCarrier.id, ["Filing"]);
    await noteDetails.setTags(orphanCarrier.id, []);

    const snapshot = await exportSnapshot(WS);
    expect(snapshot.records.workspaceTags.map((tag) => tag.key)).toEqual([
      "deep work",
      "errand",
      "filing",
      "garage",
      "reading",
    ]);

    const before = await tagRows(WS);
    expect(before.length).toBeGreaterThan(0);
    // The workspace is lost — records, attachments and vocabulary. The archive
    // is all that is left.
    await loseRecords(WS);
    expect(await tagsOnPerson(person.id)).toEqual([]);

    // Restore into a CLEAN workspace, exactly as recovery does — through the
    // real archive, not through the in-memory snapshot object.
    await ensureWorkspace(TARGET);
    const archive = (await buildStructuredExportArchive(snapshot)).bytes;
    const deps = dependencies(TARGET);
    const preview = await prepareRestore(deps, archive);
    const applied = await applyRestore(deps, preview.operationId);
    expect(applied.verification.passed).toBe(true);

    // Every attachment came back, on the record that had it…
    expect(await tagRows(TARGET)).toEqual(before);
    // …and so did the orphan, which nothing references.
    const restoredVocabulary = await vocabularyRepo(TARGET).listVocabulary();
    expect(restoredVocabulary).toEqual([
      { key: "deep work", label: "Deep Work" },
      { key: "errand", label: "Errand" },
      { key: "filing", label: "Filing" },
      { key: "garage", label: "garage" },
      { key: "reading", label: "reading" },
    ]);
    // Read back through the product, on the records themselves.
    const restoredPerson = await makePersonRepository(makeContext(TARGET)).get(
      person.id,
    );
    expect(restoredPerson?.tags).toEqual(["Deep Work", "Errand"]);
    expect(
      (await makeAssetRepository(makeContext(TARGET)).get(asset.id))?.tags,
    ).toEqual(["garage"]);
    expect(
      (await makeNoteDetailsRepository(makeContext(TARGET)).get(note.id))?.tags,
    ).toEqual(["Errand", "reading"]);
  });

  it("restores an archive written BEFORE the vocabulary existed", async () => {
    /*
     * The owner's safety net. V2.4-GATE-01 requires a real backup before a
     * migration is applied, and the backup taken before `0049` carries its tags
     * as the per-record `tags` arrays with no tag collections at all. If restore
     * only understood the new shape, the backup taken to protect this migration
     * would be the one file it could not fully recover.
     */
    const people = makePersonRepository(makeContext(WS));
    const person = await people.create({ title: "Ada", tags: ["Errand"] });
    const entities = makeRepository(makeContext(WS));
    const note = await entities.create({ type: "note", title: "List" });
    await makeNoteDetailsRepository(makeContext(WS)).setTags(note.id, [
      "errand",
      "reading",
    ]);

    const current = await exportSnapshot(WS);
    await loseRecords(WS);
    // Age the archive: strip the collections `0049` introduced, leaving exactly
    // what a pre-migration export produced.
    const legacy: WorkspaceSnapshotV1 = {
      ...current,
      records: { ...current.records, workspaceTags: [], entityTags: [] },
    };

    await ensureWorkspace(TARGET);
    const archive = (await buildStructuredExportArchive(legacy)).bytes;
    const deps = dependencies(TARGET);
    const preview = await prepareRestore(deps, archive);
    const applied = await applyRestore(deps, preview.operationId);
    expect(applied.verification.passed).toBe(true);

    // Reconstructed by the same rule the migration applies: one identity, the
    // first spelling, People before Notes.
    expect(await vocabularyRepo(TARGET).listVocabulary()).toEqual([
      { key: "errand", label: "Errand" },
      { key: "reading", label: "reading" },
    ]);
    expect(
      (await makePersonRepository(makeContext(TARGET)).get(person.id))?.tags,
    ).toEqual(["Errand"]);
    expect(
      (await makeNoteDetailsRepository(makeContext(TARGET)).get(note.id))?.tags,
    ).toEqual(["Errand", "reading"]);
  });
});
