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
  makeContext,
  makeRepository,
  resetTables,
} from "./support";
import { seedWorkspace, type Seeded } from "./workspace-fixture";

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

/* The realistic workspace this suite is proved against lives in
 * `workspace-fixture.ts`, shared with the SET-02 restore suite so the two
 * halves of the round-trip claim are about the same workspace. */

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
    expect(snapshot.meta.schemaVersion).toBe(2);
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
        taskId: seeded.followUpTaskId,
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
    // REVIEW-02 — the guided flow's resume bookmark and the owner's explicit
    // step decision travel with the workspace. The acknowledgement especially:
    // it records intent no calculation can reproduce, and it gates completion.
    expect(snapshot.records.reviewWorkflowState).toEqual([
      {
        reviewId: seeded.reviewId,
        currentStep: "reflection",
        revision: 1,
        updatedAt: expect.any(String),
      },
    ]);
    expect(snapshot.records.reviewStepAcknowledgements).toEqual([
      {
        reviewId: seeded.reviewId,
        stepId: "inbox",
        acknowledgedAt: expect.any(String),
      },
    ]);
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
    expect(JSON.stringify(snapshot.owner)).not.toContain(OWNER);
  });

  it("carries both display preferences, so a restore cannot silently reset them", () => {
    // SET-02 added `appearance` for this reason; THEME-01 added `colorScheme`
    // for the same one. A snapshot that claims to carry owner configuration and
    // then drops the two settings that decide what the product LOOKS like is an
    // unfaithful reconstruction, and the owner would only find out by looking.
    expect(snapshot.owner.preferences.appearance).toBeTruthy();
    expect(snapshot.owner.preferences.colorScheme).toBeTruthy();
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
    // page per collection. A per-record read would be an order of magnitude more
    // on this workspace.
    //
    // The ceiling moves with the number of COLLECTIONS, never with the number of
    // records: HABITS-01 added three (habit details, schedule versions, check-in
    // history), so three more statements — and the second half of this test is
    // what actually holds the bound, by proving that twenty more records add
    // none at all.
    expect(statements).toBeLessThanOrEqual(33);
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
