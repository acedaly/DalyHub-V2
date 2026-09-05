/**
 * X-04 — the manifest and the two archives.
 *
 * The manifest is the file a person trusts before they open anything else, so
 * its counts have to be derived from the snapshot the archive actually carries,
 * and its claims about what is and is not included have to be true.
 */

import { describe, expect, it } from "vitest";

import {
  buildExportManifest,
  buildObsidianVaultArchive,
  buildStructuredExportArchive,
  countRecordsByModule,
  exportFilename,
  sha256Hex,
  type ExportManifest,
} from "~/platform/export";
import { SNAPSHOT_SCHEMA_NAME } from "~/kernel/export";

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
      "habit",
      "meeting",
      "note",
      "obligation",
      "person",
      "project",
      "project_template",
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
    expect(manifest.snapshotSchemaVersion).toBe(2);
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
    expect(manifest.recordsByCollection.obligations).toBe(1);
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

  /*
   * HARDEN-06E (F-10) — an omission the manifest does not name is a silent one.
   *
   * Notification settings, the notification ledger and the subscribed calendars
   * all left the snapshot with nothing said, so a restored workspace came back
   * with notifications off, the digest time and its zone gone, the per-source
   * toggles gone and every calendar gone — while the export contract promises
   * that either is "reported in `limitations` and in the manifest, never
   * silently".
   */
  it("names the notification and calendar omissions too", () => {
    const excluded = manifest.excluded.join(" ");
    expect(excluded).toContain("Notification settings");
    expect(excluded).toContain("notification ledger");
    expect(excluded).toContain("Calendar sources");
  });

  /*
   * DEBT-94 — AI preferences are the one kind of owner CONFIGURATION the
   * snapshot does not carry, and the decision is to keep it that way.
   *
   * Those rows hold a spending budget, feature switches and a privacy CONSENT.
   * A restore that quietly re-enabled all three would spend the owner's money
   * and re-grant a consent they may have withdrawn. An archive that loses a
   * setting is recoverable in a minute; one that silently restores a consent is
   * not — so it is excluded, and NAMED, which is what the export contract
   * requires of every omission.
   *
   * Asserted HERE rather than in `limitations`, and the distinction is the
   * point: `limitations` means something happened during THIS export.
   * A standing exclusion is a property of the schema.
   */
  it("names the AI-preferences omission, and what to do about it", () => {
    const excluded = manifest.excluded.join(" ");
    expect(
      excluded,
      "an export that claims to carry the owner's configuration and silently " +
        "omits their AI budget, feature switches and privacy consent is not " +
        "an honest archive (DEBT-94)",
    ).toContain("AI preferences");
    expect(excluded).toContain("consent");
    // The sentence has to tell the owner what to DO, not only what happened.
    expect(excluded).toContain("Re-set them from Settings");
  });

  it("keeps that omission NARROW — every other owner setting is carried", () => {
    const excluded = manifest.excluded.join(" ");
    expect(excluded).toContain(
      "every other owner preference and saved view is carried",
    );
  });

  it("says what a restored workspace comes back WITHOUT", () => {
    // Not just the table names: the sentence an owner reads has to tell them
    // what they will have to set up again.
    const excluded = manifest.excluded.join(" ");
    expect(excluded).toContain("notifications off");
    expect(excluded).toContain("subscribes to nothing");
  });

  it("carries the file list it was given", () => {
    expect(manifest.files).toEqual([
      { path: "README.md", bytes: 10, sha256: "abc" },
    ]);
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
