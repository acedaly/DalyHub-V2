/**
 * SET-02 — the safety gate that runs BEFORE any row is written.
 *
 * Every case here is a snapshot that passes X-04's own validator and still
 * cannot be persisted. That gap is the whole point of the module: without it,
 * these files would be discovered halfway through a restore, by a database
 * error, with part of one workspace already replaced.
 */

import { describe, expect, it } from "vitest";

import type { WorkspaceSnapshotV1 } from "~/kernel/export";
import { validateRestoreSafety } from "~/kernel/restore";

import { makeSnapshot } from "../export/snapshot-fixture";

function codes(snapshot: WorkspaceSnapshotV1): string[] {
  return validateRestoreSafety(snapshot).map((issue) => issue.code);
}

/** Patch one collection, keeping the fixture's documented ordering. */
function withRecords(
  patch: Partial<WorkspaceSnapshotV1["records"]>,
): WorkspaceSnapshotV1 {
  const base = makeSnapshot();
  return { ...base, records: { ...base.records, ...patch } };
}

describe("restore safety validation", () => {
  it("passes a real snapshot", () => {
    expect(validateRestoreSafety(makeSnapshot())).toEqual([]);
  });

  it("rejects a repeated record id", () => {
    const base = makeSnapshot();
    const duplicated = [
      ...base.records.entities,
      base.records.entities[0]!,
    ].sort((a, b) => (a.id < b.id ? -1 : 1));
    expect(codes(withRecords({ entities: duplicated }))).toContain(
      "duplicate_key",
    );
  });

  it("rejects a detail row attached to the wrong kind of record", () => {
    const base = makeSnapshot();
    const note = base.records.entities.find((e) => e.type === "note")!;
    // A task detail row pointing at a Note. The schema's composite foreign key
    // would refuse this; the point is to refuse it before the write.
    const rows = [
      ...base.records.taskDetails,
      { ...base.records.taskDetails[0]!, entityId: note.id },
    ].sort((a, b) => (a.entityId < b.entityId ? -1 : 1));
    expect(codes(withRecords({ taskDetails: rows }))).toContain(
      "entity_type_mismatch",
    );
  });

  it("rejects a spine row whose kind disagrees with its record", () => {
    const base = makeSnapshot();
    const rows = base.records.spineRecords.map((row, index) =>
      index === 0 ? { ...row, kind: "project" } : row,
    );
    const issues = codes(withRecords({ spineRecords: rows }));
    expect(issues).toContain("spine_kind_mismatch");
  });

  it("rejects an unknown spine kind", () => {
    const base = makeSnapshot();
    const rows = base.records.spineRecords.map((row, index) =>
      index === 0 ? { ...row, kind: "epic" } : row,
    );
    expect(codes(withRecords({ spineRecords: rows }))).toContain(
      "unknown_spine_kind",
    );
  });

  it("rejects a completed Area — Areas never complete", () => {
    const base = makeSnapshot();
    const rows = base.records.spineRecords.map((row) =>
      row.kind === "area"
        ? { ...row, completedAt: "2026-08-01T00:00:00.000Z" }
        : row,
    );
    expect(codes(withRecords({ spineRecords: rows }))).toContain(
      "invalid_lifecycle",
    );
  });

  it("rejects a self-link and a duplicated relationship", () => {
    const base = makeSnapshot();
    const link = base.records.entityLinks[0]!;
    expect(
      codes(
        withRecords({
          entityLinks: [{ ...link, targetEntityId: link.sourceEntityId }],
        }),
      ),
    ).toContain("self_link");

    const duplicated = [
      ...base.records.entityLinks,
      { ...link, id: `${link.id}-copy` },
    ].sort((a, b) => (a.id < b.id ? -1 : 1));
    expect(codes(withRecords({ entityLinks: duplicated }))).toContain(
      "duplicate_link",
    );
  });

  it("rejects a blank record title", () => {
    const base = makeSnapshot();
    const rows = base.records.entities.map((entity, index) =>
      index === 0 ? { ...entity, title: "   " } : entity,
    );
    expect(codes(withRecords({ entities: rows }))).toContain("empty_title");
  });

  it("rejects a backup that recorded itself as truncated", () => {
    const base = makeSnapshot();
    const truncated: WorkspaceSnapshotV1 = {
      ...base,
      limitations: [
        {
          code: "collection_truncated",
          subject: "activities",
          detail: "more rows exist than this file carries",
        },
      ],
    };
    expect(codes(truncated)).toContain("backup_incomplete");
  });

  it("names paths and rules, never record content", () => {
    const base = makeSnapshot();
    const rows = base.records.entities.map((entity, index) =>
      index === 0 ? { ...entity, title: "   " } : entity,
    );
    const issues = validateRestoreSafety(withRecords({ entities: rows }));
    const serialised = JSON.stringify(issues);
    for (const entity of base.records.entities) {
      expect(serialised).not.toContain(entity.title);
    }
    for (const note of base.records.noteDetails) {
      expect(serialised).not.toContain(note.content);
    }
  });
});
