/**
 * X-04 — the manifest and the two archives.
 *
 * The manifest is the file a person trusts before they open anything else, so
 * its counts have to be derived from the snapshot the archive actually carries,
 * and its claims about what is and is not included have to be true.
 */

import { describe, expect, it } from "vitest";

import {
  WorkspaceTooLargeError,
  buildExportManifest,
  buildWorkspaceSnapshot,
  buildObsidianVaultArchive,
  buildStructuredExportArchive,
  countRecordsByModule,
  exportFilename,
  sha256Hex,
  type ExportManifest,
} from "~/platform/export";
import {
  SNAPSHOT_SCHEMA_NAME,
  type WorkspaceSnapshotRepository,
} from "~/kernel/export";

import { makeSnapshot } from "./snapshot-fixture";

const snapshot = makeSnapshot();

describe("countRecordsByModule", () => {
  const counts = countRecordsByModule(snapshot);

  it("counts every entity type present", () => {
    expect(Object.keys(counts).sort()).toEqual([
      "area",
      "asset",
      "diary",
      "goal",
      "meeting",
      "note",
      "person",
      "project",
      "review",
      "task",
      "widget",
    ]);
  });

  it("splits by lifecycle state, with deleted winning over archived", () => {
    expect(counts.note).toEqual({
      total: 9,
      active: 7,
      completed: 0,
      archived: 1,
      deleted: 1,
    });
    expect(counts.area).toEqual({
      total: 2,
      active: 1,
      completed: 0,
      archived: 1,
      deleted: 0,
    });
    expect(counts.task).toEqual({
      total: 2,
      active: 1,
      completed: 1,
      archived: 0,
      deleted: 0,
    });
    expect(counts.project?.deleted).toBe(1);
    expect(counts.review?.completed).toBe(1);
  });

  it("totals to the number of exported entities", () => {
    const total = Object.values(counts).reduce(
      (sum, entry) => sum + entry.total,
      0,
    );
    expect(total).toBe(snapshot.records.entities.length);
  });
});

describe("buildExportManifest", () => {
  const manifest: ExportManifest = buildExportManifest(snapshot, [
    { path: "README.md", bytes: 10, sha256: "abc" },
  ]);

  it("states the format, schema, application and export time", () => {
    expect(manifest.format).toBe("dalyhub.workspace.export");
    expect(manifest.formatVersion).toBe(1);
    expect(manifest.snapshotSchema).toBe(SNAPSHOT_SCHEMA_NAME);
    expect(manifest.snapshotSchemaVersion).toBe(1);
    expect(manifest.application.version).toBe("2.0.0");
    expect(manifest.exportedAt).toBe(snapshot.meta.exportedAt);
  });

  it("states what is included", () => {
    expect(manifest.contents).toEqual({
      includesActivity: true,
      includesDeletedRecords: true,
      includesArchivedRecords: true,
      includesOwnerPreferences: true,
    });
  });

  it("reports collection counts that match the snapshot exactly", () => {
    expect(manifest.recordsByCollection.entities).toBe(
      snapshot.records.entities.length,
    );
    expect(manifest.recordsByCollection.entityLinks).toBe(
      snapshot.records.entityLinks.length,
    );
    expect(manifest.recordsByCollection.activities).toBe(
      snapshot.records.activities.length,
    );
    expect(manifest.recordsByCollection.assetObligations).toBe(1);
  });

  it("names the consistency guarantee rather than overclaiming", () => {
    expect(manifest.consistency.guarantee).toBe("per-statement-read-committed");
    expect(manifest.consistency.explanation).toContain(
      "not an atomic point-in-time snapshot",
    );
  });

  it("records deleted and archived records as an explicit limitation", () => {
    const codes = manifest.limitations.map((limitation) => limitation.code);
    expect(codes).toContain("deleted_records_included");
    expect(codes).toContain("archived_records_included");
  });

  it("names what is excluded", () => {
    expect(manifest.excluded.join(" ")).toContain("Cloudflare");
    expect(manifest.excluded.join(" ")).toContain("subject identifier");
  });

  it("carries the file list it was given", () => {
    expect(manifest.files).toEqual([
      { path: "README.md", bytes: 10, sha256: "abc" },
    ]);
  });
});

describe("collection ceiling", () => {
  it("fails closed rather than shipping a referentially broken partial snapshot", async () => {
    // Regression: an earlier build truncated each collection independently at
    // the ceiling. When `entities` truncated, the detail rows, links and
    // Activity subjects still referenced records outside the retained prefix,
    // the validator (correctly) rejected them, and the owner got a 500 instead
    // of the archive the manifest promised. The ceiling is now a hard boundary.
    const rows = snapshot.records.entities;
    const repository: WorkspaceSnapshotRepository = {
      readWorkspace: async () => snapshot.workspace,
      readOwnerPreferences: async () => snapshot.owner.preferences,
      readTaskSavedViews: async () => snapshot.owner.taskSavedViews,
      listPage: async (collection) => ({
        rows: (collection === "entities" ? rows : []) as never[],
        nextCursor: null,
      }),
    };

    await expect(
      buildWorkspaceSnapshot(repository, {
        ownerId: "owner",
        exportedAt: new Date(snapshot.meta.exportedAt),
        application: snapshot.meta.application,
        maxRowsPerCollection: rows.length - 1,
      }),
    ).rejects.toBeInstanceOf(WorkspaceTooLargeError);
  });

  it("succeeds when the workspace fits inside the ceiling", async () => {
    const repository: WorkspaceSnapshotRepository = {
      readWorkspace: async () => snapshot.workspace,
      readOwnerPreferences: async () => snapshot.owner.preferences,
      readTaskSavedViews: async () => snapshot.owner.taskSavedViews,
      listPage: async (collection) => ({
        rows: snapshot.records[collection] as never[],
        nextCursor: null,
      }),
    };

    const built = await buildWorkspaceSnapshot(repository, {
      ownerId: "owner",
      exportedAt: new Date(snapshot.meta.exportedAt),
      application: snapshot.meta.application,
      maxRowsPerCollection: snapshot.records.entities.length,
    });
    expect(built.records.entities).toHaveLength(
      snapshot.records.entities.length,
    );
    // No truncation limitation exists any more: the ceiling either fits or fails.
    expect(built.limitations.map((l) => l.code)).not.toContain(
      "collection_truncated",
    );
  });
});

describe("exportFilename", () => {
  it("produces an ASCII-safe name with no quotes, spaces or separators", () => {
    const name = exportFilename("dalyhub-export", "2026-08-01T09:30:00.000Z");
    expect(name).toBe("dalyhub-export-2026-08-01T09-30-00-000Z.zip");
    expect(name).toMatch(/^[A-Za-z0-9._-]+\.zip$/);
  });
});

describe("structured export archive", () => {
  it("contains exactly the documented files", async () => {
    const archive = await buildStructuredExportArchive(snapshot);
    expect(archive.paths).toEqual([
      "CHECKSUMS.txt",
      "README.md",
      "SCHEMA.md",
      "dalyhub-snapshot.json",
      "manifest.json",
    ]);
    expect(archive.filename).toMatch(/^dalyhub-export-.*\.zip$/);
    expect(archive.bytes.length).toBeGreaterThan(0);
  });

  it("is deterministic for the same snapshot", async () => {
    const first = await buildStructuredExportArchive(snapshot);
    const second = await buildStructuredExportArchive(snapshot);
    expect([...first.bytes]).toEqual([...second.bytes]);
  });
});

describe("Obsidian vault archive", () => {
  it("places every file under the vault root and adds a checksum file", async () => {
    const archive = await buildObsidianVaultArchive(snapshot);
    for (const path of archive.paths) {
      expect(path.startsWith("DalyHub Export/")).toBe(true);
    }
    expect(archive.paths).toContain("DalyHub Export/Home.md");
    expect(archive.paths).toContain("DalyHub Export/_DalyHub/CHECKSUMS.txt");
    expect(archive.filename).toMatch(/^dalyhub-obsidian-vault-.*\.zip$/);
  });

  it("is deterministic for the same snapshot", async () => {
    const first = await buildObsidianVaultArchive(snapshot);
    const second = await buildObsidianVaultArchive(snapshot);
    expect([...first.bytes]).toEqual([...second.bytes]);
  });
});

describe("sha256Hex", () => {
  it("matches the known digest of the empty input", async () => {
    expect(await sha256Hex(new Uint8Array())).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("matches the known digest of 'abc'", async () => {
    expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
