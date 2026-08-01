/**
 * X-04 — the full workspace export against the REAL Workers runtime and D1.
 *
 * This is the evidence that the export is complete rather than plausible. It
 * seeds a realistic workspace THROUGH THE PRODUCTION REPOSITORIES — every
 * shipped module, the whole spine, structural links, module-owned relationship
 * types, archived and soft-deleted records, recurrence, meeting children, asset
 * history and obligations, review sections, Activity — then builds the canonical
 * snapshot and both serialisers over it, and proves:
 *
 *   - every supported record is exported and every stable id survives;
 *   - a SECOND workspace's records are absent;
 *   - structural parents, EntityLinks (including unlinked ones) and Activity
 *     subjects survive;
 *   - module-specific child records survive;
 *   - archived and soft-deleted records are represented, not dropped;
 *   - recurrence rules and series identity survive;
 *   - the snapshot validates and the vault's links all resolve;
 *   - the read is bounded, deterministic and free of N+1;
 *   - **the export mutates nothing and appends no Activity.**
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import {
  SNAPSHOT_PAGE_SIZE,
  assertValidWorkspaceSnapshot,
  validateWorkspaceSnapshot,
  type WorkspaceSnapshotV1,
} from "~/kernel/export";
import {
  buildObsidianVault,
  buildObsidianVaultArchive,
  buildStructuredExportArchive,
  buildWorkspaceSnapshot,
  buildVaultIndex,
} from "~/platform/export";
import { createWorkspaceSnapshotRepository } from "~/platform/storage/d1";

import {
  countActivities,
  countRows,
  countingDb,
  ensureWorkspace,
  makeAssetHistoryRepository,
  makeAssetRepository,
  makeContext,
  makeDiaryRepository,
  makeLinkRepository,
  makeMeetingRepository,
  makeNoteDetailsRepository,
  makePersonRepository,
  makeRepository,
  makeReviewRepository,
  makeSpineRepository,
  makeTaskRepository,
  makeAppPreferencesRepository,
  resetTables,
} from "./support";

const WS = "test-default-workspace";
const OTHER_WS = "other-workspace";
const OWNER = "owner-subject";

const APPLICATION = {
  name: "DalyHub",
  version: "2.0.0",
  releaseName: "Test",
  environment: "development",
  buildCommit: null,
} as const;

const EXPORTED_AT = new Date("2026-08-01T09:00:00.000Z");

interface Seeded {
  readonly areaId: string;
  readonly archivedAreaId: string;
  readonly goalId: string;
  readonly projectId: string;
  readonly taskId: string;
  readonly recurringTaskId: string;
  readonly deletedTaskId: string;
  readonly noteId: string;
  readonly linkingNoteId: string;
  readonly archivedNoteId: string;
  readonly diaryId: string;
  readonly personId: string;
  readonly meetingId: string;
  readonly meetingItemId: string;
  readonly assetId: string;
  readonly assetEventId: string;
  readonly obligationId: string;
  readonly reviewId: string;
  readonly unlinkedLinkId: string;
  readonly otherWorkspaceEntityId: string;
}

/**
 * Seed a realistic workspace through the production repositories.
 *
 * Deliberately NOT direct SQL: the point of this suite is that the export sees
 * what the product actually writes, including the atomic Activity every mutation
 * appends and the structural links the spine creates for itself.
 */
async function seedWorkspace(): Promise<Seeded> {
  const context = makeContext(WS);
  const entities = makeRepository(context);
  const spine = makeSpineRepository(context);
  const tasks = makeTaskRepository(context);
  const links = makeLinkRepository(context);
  const noteDetails = makeNoteDetailsRepository(context);
  const diary = makeDiaryRepository(context);
  const people = makePersonRepository(context);
  const meetings = makeMeetingRepository(context);
  const assets = makeAssetRepository(context);
  const assetHistory = makeAssetHistoryRepository(context);
  const reviews = makeReviewRepository(context);
  const preferences = makeAppPreferencesRepository(context);

  /* The spine ----------------------------------------------------------- */
  const area = await spine.createArea({ title: "Health" });
  const archivedArea = await spine.createArea({ title: "Old side venture" });
  const goal = await spine.createGoal({
    title: "Run a half marathon",
    areaId: area.id,
  });
  const project = await spine.createProject({
    title: "12-week training block",
    parent: { kind: "goal", id: goal.id },
  });
  const task = await tasks.createTask({
    title: "Monday: 5km easy run",
    parent: { kind: "project", id: project.id },
    priority: "p2",
    dueDate: "2026-08-03",
    scheduledDate: "2026-08-03",
    timeSector: "this_week",
  });
  const recurringTask = await tasks.createTask({
    title: "Weekly long run",
    parent: { kind: "area", id: area.id },
    scheduledDate: "2026-08-02",
    recurrence: { frequency: "week", dateKind: "scheduled", interval: 1 },
  });
  const deletedTask = await tasks.createTask({
    title: "Abandoned task",
    parent: { kind: "area", id: area.id },
  });
  await spine.complete(task.id);
  await spine.softDelete(deletedTask.id);

  /* Notes ---------------------------------------------------------------- */
  const note = await entities.create({ type: "note", title: "Training notes" });
  await noteDetails.update(note.id, "Base building weeks 1-4.\n");
  await noteDetails.setTags(note.id, ["running"]);

  const linkingNote = await entities.create({
    type: "note",
    title: "Knowledge hub",
  });
  await noteDetails.update(
    linkingNote.id,
    [
      "The plan is [[12-week training block]].",
      "",
      `Stable link: [the goal](dalyhub://goal/${goal.id}).`,
      "",
      "Missing: [[No such record]].",
    ].join("\n"),
  );

  const archivedNote = await entities.create({
    type: "note",
    title: "Put away",
  });
  await noteDetails.update(archivedNote.id, "Archived body.\n");
  await noteDetails.setArchived(archivedNote.id, true);

  /* Diary ---------------------------------------------------------------- */
  const diaryEntry = await diary.create({
    entryType: "reflection",
    title: "Morning reflection",
    body: "Slept badly, ran anyway.\n",
    timezone: "Australia/Sydney",
  });

  /* People and Meetings --------------------------------------------------- */
  const person = await people.create({
    title: "Jamie Rivers",
    firstName: "Jamie",
    lastName: "Rivers",
    pronouns: "they/them",
    email: "jamie@example.test",
    relationship: "mentor",
    tags: ["running"],
    notes: "Prefers a message the night before.",
  });
  const meeting = await meetings.create({
    title: "Coaching catch-up",
    startsAt: "2026-08-01T00:00:00.000Z",
    endsAt: "2026-08-01T01:00:00.000Z",
    timezone: "Australia/Sydney",
    location: "Track",
    mode: "in_person",
    agendaMarkdown: "- Review the week\n",
  });
  await meetings.update(meeting.id, {
    notesMarkdown: "Discussed pacing. See [[Training notes]].\n",
  });
  const decision = await meetings.addItem(
    meeting.id,
    "decision",
    "Move the long run to Sunday.",
  );
  await links.create({
    sourceEntityId: meeting.id,
    targetEntityId: person.id,
    type: "meeting.attendee",
  });
  await meetings.markHeld(meeting.id);
  await meetings.linkFollowUpTask({
    meetingId: meeting.id,
    itemId: decision.id,
    taskId: task.id,
  });

  /* Assets ---------------------------------------------------------------- */
  const asset = await assets.create({
    title: "Road bike",
    assetType: "equipment",
    description: "Carbon road bike.",
    manufacturer: "Example",
    serialNumber: "SN-123",
    currencyCode: "AUD",
    tags: ["cycling"],
  });
  const assetEvent = await assetHistory.recordEvent(asset.id, {
    category: "service",
    title: "Annual service",
    eventDate: "2026-02-01",
    description: "New chain and cassette.",
    cost: "180.00",
    currencyCode: "AUD",
    meterValue: 3800,
    meterUnit: "km",
  });
  const obligation = await assetHistory.createObligation(asset.id, {
    category: "service",
    title: "Next service",
    dueDate: "2026-09-01",
    recurrenceKind: "months",
    recurrenceInterval: 6,
  });

  /* Reviews --------------------------------------------------------------- */
  const review = await reviews.create({
    type: "weekly",
    periodStart: "2026-07-27",
    periodEnd: "2026-08-02",
  });
  await reviews.updateSection(
    review.review.id,
    "summary.overall",
    "A steady week.",
  );
  await reviews.complete(review.review.id);

  /* Relationships --------------------------------------------------------- */
  await links.create({
    sourceEntityId: project.id,
    targetEntityId: note.id,
    type: "link.related",
  });
  await links.create({
    sourceEntityId: review.review.id,
    targetEntityId: project.id,
    type: "link.related",
  });
  const unlinked = await links.create({
    sourceEntityId: asset.id,
    targetEntityId: task.id,
    type: "link.related",
  });
  await links.unlink(unlinked.link.id);

  /* Archive the second area ------------------------------------------------ */
  // Area archival lives in `area_details`, which the AreaSettings repository owns.
  await env.DB.prepare(
    `INSERT INTO area_details (workspace_id, entity_id, entity_type, archived_at, updated_at)
     VALUES (?, ?, 'area', ?, ?)
     ON CONFLICT (workspace_id, entity_id) DO UPDATE SET archived_at = excluded.archived_at`,
  )
    .bind(
      WS,
      archivedArea.id,
      "2026-07-20T00:00:00.000Z",
      "2026-07-20T00:00:00.000Z",
    )
    .run();

  /* Owner preferences ------------------------------------------------------ */
  await preferences.update(OWNER, {
    timezone: "Australia/Sydney",
    theme: "ember",
  });

  /* A SECOND workspace, whose records must never appear ------------------- */
  await ensureWorkspace(OTHER_WS);
  const otherEntities = makeRepository(makeContext(OTHER_WS));
  const other = await otherEntities.create({
    type: "note",
    title: "Another workspace's private note",
  });

  return {
    areaId: area.id,
    archivedAreaId: archivedArea.id,
    goalId: goal.id,
    projectId: project.id,
    taskId: task.id,
    recurringTaskId: recurringTask.id,
    deletedTaskId: deletedTask.id,
    noteId: note.id,
    linkingNoteId: linkingNote.id,
    archivedNoteId: archivedNote.id,
    diaryId: diaryEntry.id,
    personId: person.id,
    meetingId: meeting.id,
    meetingItemId: decision.id,
    assetId: asset.id,
    assetEventId: assetEvent.id,
    obligationId: obligation.id,
    reviewId: review.review.id,
    unlinkedLinkId: unlinked.link.id,
    otherWorkspaceEntityId: other.id,
  };
}

async function exportSnapshot(
  db: D1Database = env.DB,
  pageSize?: number,
): Promise<WorkspaceSnapshotV1> {
  const repository = createWorkspaceSnapshotRepository(db, makeContext(WS));
  return buildWorkspaceSnapshot(repository, {
    ownerId: OWNER,
    exportedAt: EXPORTED_AT,
    application: APPLICATION,
    pageSize,
  });
}

describe("workspace export (D1)", () => {
  let seeded: Seeded;
  let snapshot: WorkspaceSnapshotV1;

  beforeEach(async () => {
    await resetTables([WS]);
    seeded = await seedWorkspace();
    snapshot = await exportSnapshot();
  });

  it("produces a snapshot that passes its own validation", () => {
    expect(validateWorkspaceSnapshot(snapshot)).toEqual([]);
    expect(() => assertValidWorkspaceSnapshot(snapshot)).not.toThrow();
    expect(snapshot.meta.schemaVersion).toBe(1);
    expect(snapshot.workspace.id).toBe(WS);
  });

  it("exports every seeded record, and every stable id survives", () => {
    const ids = new Set(snapshot.records.entities.map((entity) => entity.id));
    for (const [name, id] of Object.entries(seeded)) {
      if (name === "otherWorkspaceEntityId" || name === "unlinkedLinkId")
        continue;
      if (name === "meetingItemId" || name === "assetEventId") continue;
      if (name === "obligationId") continue;
      expect(ids.has(id), `${name} (${id}) is missing from the export`).toBe(
        true,
      );
    }
  });

  it("covers every shipped module", () => {
    const types = new Set(
      snapshot.records.entities.map((entity) => entity.type),
    );
    for (const type of [
      "area",
      "goal",
      "project",
      "task",
      "note",
      "diary",
      "meeting",
      "person",
      "asset",
      "review",
    ]) {
      expect(types.has(type), `no ${type} in the export`).toBe(true);
    }
  });

  it("excludes another workspace's records entirely", () => {
    const serialised = JSON.stringify(snapshot);
    expect(serialised).not.toContain(seeded.otherWorkspaceEntityId);
    expect(serialised).not.toContain("Another workspace's private note");
    expect(serialised).not.toContain(OTHER_WS);
  });

  it("preserves structural parents as EntityLinks", () => {
    const structural = snapshot.records.entityLinks.filter(
      (link) => link.deletedAt === null,
    );
    const has = (source: string, target: string, type: string): boolean =>
      structural.some(
        (link) =>
          link.sourceEntityId === source &&
          link.targetEntityId === target &&
          link.type === type,
      );
    expect(has(seeded.goalId, seeded.areaId, "goal.belongs_to_area")).toBe(
      true,
    );
    expect(has(seeded.projectId, seeded.goalId, "project.advances_goal")).toBe(
      true,
    );
    expect(
      has(seeded.taskId, seeded.projectId, "task.belongs_to_project"),
    ).toBe(true);
    expect(
      has(seeded.recurringTaskId, seeded.areaId, "task.belongs_to_area"),
    ).toBe(true);
  });

  it("preserves module-owned relationship types and unlinked relationships", () => {
    const attendee = snapshot.records.entityLinks.find(
      (link) => link.type === "meeting.attendee",
    );
    expect(attendee).toMatchObject({
      sourceEntityId: seeded.meetingId,
      targetEntityId: seeded.personId,
      deletedAt: null,
    });

    // An UNLINKED relationship is exported and marked, not discarded — a restore
    // must be able to reproduce "explicitly unlinked, stays unlinked".
    const unlinked = snapshot.records.entityLinks.find(
      (link) => link.id === seeded.unlinkedLinkId,
    );
    expect(unlinked).toBeDefined();
    expect(unlinked?.deletedAt).not.toBeNull();
  });

  it("preserves Activity events and their subjects", () => {
    expect(snapshot.records.activities.length).toBeGreaterThan(0);
    const types = new Set(snapshot.records.activities.map((a) => a.type));
    expect(types.has("entity.created")).toBe(true);
    expect(types.has("meeting.held")).toBe(true);

    // `meeting.held` names each attendee as a subject in their own right.
    const held = snapshot.records.activities.find(
      (a) => a.type === "meeting.held",
    );
    const subjects = snapshot.records.activitySubjects
      .filter((subject) => subject.activityId === held?.id)
      .map((subject) => subject.entityId);
    expect(subjects).toContain(seeded.meetingId);
    expect(subjects).toContain(seeded.personId);

    // Every subject points at an entity that IS in the export.
    const ids = new Set(snapshot.records.entities.map((entity) => entity.id));
    for (const subject of snapshot.records.activitySubjects) {
      expect(ids.has(subject.entityId)).toBe(true);
    }
  });

  it("preserves module-specific child records", () => {
    expect(snapshot.records.meetingItems.map((item) => item.id)).toContain(
      seeded.meetingItemId,
    );
    expect(snapshot.records.meetingItems[0]?.bodyMarkdown).toContain(
      "Move the long run to Sunday.",
    );
    expect(snapshot.records.meetingItemTasks).toContainEqual(
      expect.objectContaining({
        meetingId: seeded.meetingId,
        itemId: seeded.meetingItemId,
        taskId: seeded.taskId,
      }),
    );
    expect(snapshot.records.assetEvents.map((event) => event.id)).toContain(
      seeded.assetEventId,
    );
    expect(
      snapshot.records.assetObligations.map((obligation) => obligation.id),
    ).toContain(seeded.obligationId);
    expect(
      snapshot.records.reviewSections.some(
        (section) =>
          section.reviewId === seeded.reviewId &&
          section.bodyMarkdown === "A steady week.",
      ),
    ).toBe(true);
  });

  it("represents archived and soft-deleted records rather than dropping them", () => {
    const deletedTask = snapshot.records.entities.find(
      (entity) => entity.id === seeded.deletedTaskId,
    );
    expect(deletedTask?.deletedAt).not.toBeNull();

    const archivedNote = snapshot.records.noteDetails.find(
      (note) => note.entityId === seeded.archivedNoteId,
    );
    expect(archivedNote?.archivedAt).not.toBeNull();
    // Its content is still there — a marked record is not a redacted one.
    expect(archivedNote?.content).toBe("Archived body.\n");

    const archivedArea = snapshot.records.areaDetails.find(
      (area) => area.entityId === seeded.archivedAreaId,
    );
    expect(archivedArea?.archivedAt).not.toBeNull();
  });

  it("preserves recurrence rules and series identity", () => {
    const rule = snapshot.records.taskRecurrenceRules.find(
      (row) => row.entityId === seeded.recurringTaskId,
    );
    expect(rule).toMatchObject({
      frequency: "week",
      dateKind: "scheduled",
      interval: 1,
      sequence: 0,
    });
    expect(rule?.seriesId).toBeTruthy();
  });

  it("preserves canonical Markdown source byte-for-byte", () => {
    const note = snapshot.records.noteDetails.find(
      (row) => row.entityId === seeded.noteId,
    );
    expect(note?.content).toBe("Base building weeks 1-4.\n");
    const meeting = snapshot.records.meetingDetails[0];
    expect(meeting?.notesMarkdown).toBe(
      "Discussed pacing. See [[Training notes]].\n",
    );
    // Nothing was rendered.
    expect(JSON.stringify(snapshot)).not.toContain("<p>");
  });

  it("exports owner preferences but never the owner's subject identifier", () => {
    expect(snapshot.owner.preferences.timezone).toBe("Australia/Sydney");
    expect(snapshot.owner.preferences.theme).toBe("ember");
    expect(JSON.stringify(snapshot.owner)).not.toContain(OWNER);
  });

  it("is deterministic — two exports of unchanged data are identical", async () => {
    const again = await exportSnapshot();
    expect(JSON.stringify(again)).toBe(JSON.stringify(snapshot));
  });

  it("returns the same records when paged at a small page size", async () => {
    // Forces many pages through the keyset cursor; the result must be identical
    // to the single-page read.
    const paged = await exportSnapshot(env.DB, 2);
    expect(JSON.stringify(paged)).toBe(JSON.stringify(snapshot));
  });

  it("reads with a bounded, non-N+1 number of statements", async () => {
    const counting = countingDb(env.DB);
    await exportSnapshot(counting.db, SNAPSHOT_PAGE_SIZE);
    const statements = counting.prepareCount();
    // One workspace read + one preferences read + one saved-views read + one
    // page per collection (21). A per-record read would be an order of magnitude
    // more on this workspace.
    expect(statements).toBeLessThanOrEqual(30);
    expect(statements).toBeGreaterThan(20);

    // Growing the workspace must not grow the statement count while the data
    // still fits in one page per collection.
    const entities = makeRepository(makeContext(WS));
    for (let index = 0; index < 20; index += 1) {
      await entities.create({ type: "note", title: `Extra note ${index}` });
    }
    counting.reset();
    await exportSnapshot(counting.db, SNAPSHOT_PAGE_SIZE);
    expect(counting.prepareCount()).toBe(statements);
  });

  it("mutates nothing and appends no Activity", async () => {
    const rowsBefore = await countRows();
    const activityBefore = await countActivities();

    await exportSnapshot();
    await buildStructuredExportArchive(snapshot);
    await buildObsidianVaultArchive(snapshot);

    expect(await countRows()).toBe(rowsBefore);
    expect(await countActivities()).toBe(activityBefore);
  });
});

describe("workspace export → Obsidian vault (D1)", () => {
  let seeded: Seeded;
  let snapshot: WorkspaceSnapshotV1;

  beforeEach(async () => {
    await resetTables([WS]);
    seeded = await seedWorkspace();
    snapshot = await exportSnapshot();
  });

  it("writes a file for every exported record", () => {
    const vault = buildObsidianVault(snapshot);
    const index = buildVaultIndex(snapshot);
    for (const entity of snapshot.records.entities) {
      const location = index.location.get(entity.id);
      expect(location, `no file for ${entity.type} ${entity.id}`).toBeDefined();
      expect(vault.files.some((file) => file.path === location!.path)).toBe(
        true,
      );
    }
  });

  it("turns a dalyhub:// link into a working relative vault link", () => {
    const vault = buildObsidianVault(snapshot);
    const index = buildVaultIndex(snapshot);
    const notePath = index.location.get(seeded.linkingNoteId)!.path;
    const goalPath = index.location.get(seeded.goalId)!.path;
    const note = vault.files.find((file) => file.path === notePath)!;

    expect(note.contents).not.toContain("dalyhub://");
    expect(note.contents).toContain("[the goal](");
    // The destination resolves to the goal's real file.
    const destinations = [...note.contents.matchAll(/\]\((<[^>]+>|[^)\s]+)\)/g)]
      .map((match) => match[1] ?? "")
      .map((raw) => (raw.startsWith("<") ? raw.slice(1, -1) : raw));
    const resolved = destinations.map((destination) => {
      const segments = notePath.split("/").slice(0, -1);
      for (const part of destination.split("/")) {
        if (part === "." || part === "") continue;
        if (part === "..") segments.pop();
        else segments.push(part);
      }
      return segments.join("/");
    });
    expect(resolved).toContain(goalPath);
  });

  it("every internal link resolves to an exported file or is reported", () => {
    const vault = buildObsidianVault(snapshot);
    const known = new Set(vault.files.map((file) => file.path));
    const broken: string[] = [];
    for (const file of vault.files) {
      for (const match of file.contents.matchAll(/\]\((<[^>]+>|[^)\s]+)\)/g)) {
        const raw = match[1] ?? "";
        const destination = raw.startsWith("<") ? raw.slice(1, -1) : raw;
        if (/^[a-z][a-z0-9+.-]*:/i.test(destination)) continue;
        const segments = file.path.split("/").slice(0, -1);
        for (const part of destination.split("/")) {
          if (part === "." || part === "") continue;
          if (part === "..") segments.pop();
          else segments.push(part);
        }
        if (!known.has(segments.join("/"))) {
          broken.push(`${file.path} → ${destination}`);
        }
      }
    }
    expect(broken).toEqual([]);

    // The one deliberately-unresolvable reference is reported, not silently lost.
    expect(vault.unresolved.map((link) => link.reference)).toContain(
      "No such record",
    );
    const report = vault.files.find((file) =>
      file.path.endsWith("Unresolved Links.md"),
    )!;
    expect(report.contents).toContain("No such record");
  });

  it("produces both archives, with the documented structured files", async () => {
    const structured = await buildStructuredExportArchive(snapshot);
    expect(structured.paths).toEqual([
      "CHECKSUMS.txt",
      "README.md",
      "SCHEMA.md",
      "dalyhub-snapshot.json",
      "manifest.json",
    ]);

    const vault = await buildObsidianVaultArchive(snapshot);
    expect(vault.paths).toContain("DalyHub Export/Home.md");
    expect(
      vault.paths.every((path) => path.startsWith("DalyHub Export/")),
    ).toBe(true);
  });
});
