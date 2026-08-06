/**
 * The owner's chosen Area/Project icon survives an export unchanged.
 *
 * A round trip that silently loses a choice is the worst kind of
 * data-portability bug: it looks like it worked, and it is discovered later,
 * when the original is gone. DalyHub has no snapshot IMPORT today — the product
 * writes archives and does not read them back — so "round trip" here means the
 * two hops an archive actually makes: the snapshot is serialised to JSON and
 * parsed again, and it is rendered into an Obsidian vault. Both are asserted to
 * carry `iconKey` through intact.
 *
 * The interesting case is the UNRECOGNISED key. On the READ path an unknown key
 * degrades to the entity default, because a record must render. On the EXPORT
 * path it must be preserved verbatim, because an export records what the
 * database contains — and an icon removed in one release and restored in the
 * next would otherwise be quietly erased from every archive taken in between.
 * The two paths pull in opposite directions on purpose, and that is exactly the
 * kind of asymmetry that rots without a test naming it.
 */

import { describe, expect, it } from "vitest";

import {
  assertValidWorkspaceSnapshot,
  validateWorkspaceSnapshot,
  type SnapshotAreaDetail,
  type SnapshotProjectDetail,
  type WorkspaceSnapshotV1,
} from "~/kernel/export";
import { buildObsidianVault } from "~/platform/export";

import { IDS, makeSnapshot } from "./snapshot-fixture";

/** Serialise and parse, exactly as writing and re-reading an archive would. */
function throughJson(snapshot: WorkspaceSnapshotV1): WorkspaceSnapshotV1 {
  return JSON.parse(JSON.stringify(snapshot)) as WorkspaceSnapshotV1;
}

function areaDetail(
  snapshot: WorkspaceSnapshotV1,
  entityId: string,
): SnapshotAreaDetail {
  const row = snapshot.records.areaDetails.find(
    (detail) => detail.entityId === entityId,
  );
  if (!row) throw new Error(`No areaDetails row for ${entityId}`);
  return row;
}

function projectDetail(
  snapshot: WorkspaceSnapshotV1,
  entityId: string,
): SnapshotProjectDetail {
  const row = snapshot.records.projectDetails.find(
    (detail) => detail.entityId === entityId,
  );
  if (!row) throw new Error(`No projectDetails row for ${entityId}`);
  return row;
}

/** The frontmatter block at the top of a generated Markdown document. */
function frontmatterOf(contents: string): string {
  const match = /^---\n([\s\S]*?)\n---/.exec(contents);
  if (!match) throw new Error("Document has no frontmatter block");
  return match[1] ?? "";
}

function vaultFile(
  built: ReturnType<typeof buildObsidianVault>,
  fragment: string,
): string {
  const match = built.files.find((entry) => entry.path.includes(fragment));
  if (!match) throw new Error(`No vault file matching ${fragment}`);
  return match.contents;
}

describe("the chosen icon survives a snapshot round trip", () => {
  it("carries a chosen key through serialisation unchanged", () => {
    const snapshot = makeSnapshot();
    expect(areaDetail(snapshot, IDS.area).iconKey).toBe("shield");
    expect(projectDetail(snapshot, IDS.project).iconKey).toBe("travel");

    const parsed = throughJson(snapshot);
    expect(areaDetail(parsed, IDS.area).iconKey).toBe("shield");
    expect(projectDetail(parsed, IDS.project).iconKey).toBe("travel");
  });

  it("carries 'no choice' through as an explicit null, never undefined", () => {
    // The validator rejects `undefined` outright, so a field that vanished in
    // serialisation would fail loudly rather than reappear as "no icon". This
    // asserts the property directly all the same, because `JSON.stringify`
    // DROPS an undefined value silently and the difference is invisible.
    const parsed = throughJson(makeSnapshot());
    expect(areaDetail(parsed, IDS.areaArchived).iconKey).toBeNull();
    expect(projectDetail(parsed, IDS.projectDeleted).iconKey).toBeNull();
    expect("iconKey" in areaDetail(parsed, IDS.areaArchived)).toBe(true);
    expect("iconKey" in projectDetail(parsed, IDS.projectDeleted)).toBe(true);
  });

  it("preserves a key this build no longer recognises, rather than dropping it", () => {
    const base = makeSnapshot();
    const snapshot = makeSnapshot({
      records: {
        ...base.records,
        areaDetails: base.records.areaDetails.map((detail) =>
          detail.entityId === IDS.area
            ? { ...detail, iconKey: "retired-in-a-later-release" }
            : detail,
        ),
      },
    });

    const parsed = throughJson(snapshot);
    expect(areaDetail(parsed, IDS.area).iconKey).toBe(
      "retired-in-a-later-release",
    );
    // ...and it is still a VALID snapshot: the vocabulary is enforced at the
    // write boundary, not by the export format, so an archive of a row the
    // catalogue has moved on from is readable rather than rejected.
    expect(validateWorkspaceSnapshot(parsed)).toEqual([]);
  });

  it("stays valid with icons present, so the field is genuinely additive", () => {
    expect(() =>
      assertValidWorkspaceSnapshot(throughJson(makeSnapshot())),
    ).not.toThrow();
  });
});

describe("the chosen icon reaches the Obsidian vault", () => {
  const built = buildObsidianVault(makeSnapshot());

  it("writes the key as frontmatter on an Area and a Project", () => {
    // Frontmatter, not prose: it is a machine-readable key, and a vault reader
    // has no DalyHub glyph to draw from it.
    // Quoted, because the vault's YAML writer quotes every string value rather
    // than deciding per value which tokens happen to be safe bare.
    expect(frontmatterOf(vaultFile(built, "Health"))).toContain(
      'icon: "shield"',
    );
    expect(frontmatterOf(vaultFile(built, "12-week training block"))).toContain(
      'icon: "travel"',
    );
  });

  it("states 'no icon' explicitly rather than omitting the field", () => {
    // The vault's frontmatter is a fixed shape per record type. An absent field
    // would read as "this export does not know about icons"; a null says "this
    // record has no icon", which is the fact.
    expect(frontmatterOf(vaultFile(built, "Old side venture"))).toContain(
      "icon: null",
    );
  });

  it("is deterministic — two builds of the same snapshot agree", () => {
    const again = buildObsidianVault(makeSnapshot());
    expect(again.files.map((entry) => entry.contents)).toEqual(
      built.files.map((entry) => entry.contents),
    );
  });
});
