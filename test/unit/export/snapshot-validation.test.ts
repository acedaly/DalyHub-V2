/**
 * X-04 — the snapshot validator.
 *
 * The validator is the gate that stops a malformed export becoming a download
 * that looks valid. These tests assert BOTH halves of that: a correct snapshot
 * passes untouched, and each way a snapshot can be wrong is caught with a path
 * precise enough to fix.
 */

import { describe, expect, it } from "vitest";

import {
  FORBIDDEN_EXPORT_KEY_PATTERN,
  SNAPSHOT_COLLECTION_ORDER,
  SNAPSHOT_OPTIONAL_ON_READ_COLLECTIONS,
  INFRASTRUCTURE_KEY_HINTS,
  SNAPSHOT_SCHEMA_NAME,
  SnapshotValidationError,
  assertValidWorkspaceSnapshot,
  isIsoDate,
  isIsoInstant,
  validateWorkspaceSnapshot,
  type SnapshotCollection,
  type WorkspaceSnapshotV1,
} from "~/kernel/export";

import { IDS, makeSnapshot } from "./snapshot-fixture";

/** Deep-clone so a test can mutate the fixture without affecting the next one. */
function mutable(snapshot: WorkspaceSnapshotV1): {
  meta: Record<string, unknown>;
  workspace: Record<string, unknown>;
  owner: Record<string, unknown>;
  records: Record<string, Record<string, unknown>[]>;
  limitations: unknown[];
} {
  return JSON.parse(JSON.stringify(snapshot));
}

describe("workspace snapshot validation", () => {
  it("accepts a complete, well-formed snapshot", () => {
    expect(validateWorkspaceSnapshot(makeSnapshot())).toEqual([]);
    expect(() => assertValidWorkspaceSnapshot(makeSnapshot())).not.toThrow();
  });

  it("rejects a value that is not an object at all", () => {
    for (const value of [null, undefined, "snapshot", 42, []]) {
      expect(validateWorkspaceSnapshot(value).length).toBeGreaterThan(0);
    }
  });

  it("requires the schema name and version", () => {
    const wrongName = mutable(makeSnapshot());
    wrongName.meta.schema = "something.else";
    expect(validateWorkspaceSnapshot(wrongName)).toContainEqual({
      path: "meta.schema",
      message: `must be "${SNAPSHOT_SCHEMA_NAME}"`,
    });

    const wrongVersion = mutable(makeSnapshot());
    wrongVersion.meta.schemaVersion = 99;
    expect(
      validateWorkspaceSnapshot(wrongVersion).some(
        (issue) => issue.path === "meta.schemaVersion",
      ),
    ).toBe(true);
  });

  it("requires the real read-consistency guarantee to be stated", () => {
    const overclaimed = mutable(makeSnapshot());
    overclaimed.meta.consistency = "atomic-point-in-time";
    expect(
      validateWorkspaceSnapshot(overclaimed).some(
        (issue) => issue.path === "meta.consistency",
      ),
    ).toBe(true);
  });

  it("requires ISO-8601 UTC instants, not loose date strings", () => {
    expect(isIsoInstant("2026-08-01T09:00:00.000Z")).toBe(true);
    expect(isIsoInstant("2026-08-01T09:00:00Z")).toBe(false);
    expect(isIsoInstant("2026-08-01T09:00:00.000+10:00")).toBe(false);
    expect(isIsoInstant("2026-08-01")).toBe(false);
    expect(isIsoDate("2026-08-01")).toBe(true);
    expect(isIsoDate("2026-8-1")).toBe(false);

    const snapshot = mutable(makeSnapshot());
    snapshot.records.entities[0]!.createdAt = "1 August 2026";
    expect(
      validateWorkspaceSnapshot(snapshot).some((issue) =>
        issue.path.endsWith(".createdAt"),
      ),
    ).toBe(true);
  });

  it("rejects `undefined` where an explicit null belongs", () => {
    const snapshot = mutable(makeSnapshot());
    // Simulate a key present with an undefined value (JSON cannot carry it, so
    // it is set after the clone).
    (snapshot.records.entities[0] as Record<string, unknown>).deletedAt =
      undefined;
    expect(
      validateWorkspaceSnapshot(snapshot).some((issue) =>
        issue.message.includes("explicit null"),
      ),
    ).toBe(true);
  });

  it("rejects a detail row that references an entity not in the snapshot", () => {
    const snapshot = mutable(makeSnapshot());
    snapshot.records.taskDetails[0]!.entityId = "e-99-not-here";
    const issues = validateWorkspaceSnapshot(snapshot);
    expect(
      issues.some(
        (issue) =>
          issue.path.startsWith("records.taskDetails") &&
          issue.message.includes("not in this snapshot"),
      ),
    ).toBe(true);
  });

  it("rejects an EntityLink whose endpoint is not in the snapshot", () => {
    const snapshot = mutable(makeSnapshot());
    snapshot.records.entityLinks[0]!.targetEntityId = "e-99-not-here";
    expect(
      validateWorkspaceSnapshot(snapshot).some((issue) =>
        issue.path.endsWith(".targetEntityId"),
      ),
    ).toBe(true);
  });

  it("rejects an Activity subject whose event or entity is missing", () => {
    const missingActivity = mutable(makeSnapshot());
    missingActivity.records.activitySubjects[0]!.activityId = "a-99";
    expect(
      validateWorkspaceSnapshot(missingActivity).some((issue) =>
        issue.path.endsWith(".activityId"),
      ),
    ).toBe(true);

    const missingEntity = mutable(makeSnapshot());
    missingEntity.records.activitySubjects[0]!.entityId = "e-99";
    expect(
      validateWorkspaceSnapshot(missingEntity).some((issue) =>
        issue.path.endsWith(".entityId"),
      ),
    ).toBe(true);
  });

  it("rejects a collection that is out of its documented order", () => {
    const snapshot = mutable(makeSnapshot());
    snapshot.records.entities.reverse();
    expect(
      validateWorkspaceSnapshot(snapshot).some((issue) =>
        issue.message.includes("not deterministic"),
      ),
    ).toBe(true);
  });

  it("rejects a child record whose parent is missing", () => {
    const snapshot = mutable(makeSnapshot());
    snapshot.records.reviewSections[0]!.reviewId = "e-99";
    expect(
      validateWorkspaceSnapshot(snapshot).some((issue) =>
        issue.path.endsWith(".reviewId"),
      ),
    ).toBe(true);
  });

  it("throws a SnapshotValidationError that names paths, never record content", () => {
    const snapshot = mutable(makeSnapshot());
    snapshot.records.entities[0]!.createdAt = "not a date";
    let thrown: unknown;
    try {
      assertValidWorkspaceSnapshot(snapshot);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(SnapshotValidationError);
    const message = (thrown as Error).message;
    expect(message).toContain("records.entities[0].createdAt");
    // No title, body or other record content leaks into the message.
    expect(message).not.toContain("Health");
    expect(message).not.toContain("Training notes");
  });

  it("flags a forbidden field name anywhere in a record", () => {
    const snapshot = mutable(makeSnapshot());
    (snapshot.records.entities[0] as Record<string, unknown>).access_token =
      "leaked";
    expect(
      validateWorkspaceSnapshot(snapshot).some((issue) =>
        issue.message.includes("forbidden field name"),
      ),
    ).toBe(true);
  });
});

/**
 * REVIEW-02 — the guided flow's own rows travel with the workspace, and an
 * archive written before they existed still reads.
 */
describe("guided-review workflow state in a snapshot", () => {
  it("accepts a snapshot carrying the resume bookmark and acknowledgements", () => {
    const snapshot = makeSnapshot();
    expect(snapshot.records.reviewWorkflowState).toHaveLength(1);
    expect(snapshot.records.reviewStepAcknowledgements).toHaveLength(1);
    expect(validateWorkspaceSnapshot(snapshot)).toEqual([]);
  });

  it("rejects a bookmark that references a Review not in the snapshot", () => {
    const snapshot = mutable(makeSnapshot());
    snapshot.records.reviewWorkflowState[0].reviewId = "not-a-review";
    expect(validateWorkspaceSnapshot(snapshot)).toContainEqual({
      path: "records.reviewWorkflowState[0].reviewId",
      message: "references a review not in this snapshot",
    });
  });

  it("rejects an acknowledgement that references a Review not in the snapshot", () => {
    const snapshot = mutable(makeSnapshot());
    snapshot.records.reviewStepAcknowledgements[0].reviewId = "not-a-review";
    expect(validateWorkspaceSnapshot(snapshot)).toContainEqual({
      path: "records.reviewStepAcknowledgements[0].reviewId",
      message: "references a review not in this snapshot",
    });
  });

  it("rejects a non-positive revision", () => {
    const snapshot = mutable(makeSnapshot());
    snapshot.records.reviewWorkflowState[0].revision = 0;
    expect(validateWorkspaceSnapshot(snapshot)).toContainEqual({
      path: "records.reviewWorkflowState[0].revision",
      message: "must be a positive integer",
    });
  });

  /*
   * The back-compatibility contract. An archive exported before REVIEW-02 has no
   * key for either collection; that is an older valid file, not a corrupt one,
   * and it must still validate and still read as empty.
   */
  it("still accepts an archive written before these collections existed", () => {
    const snapshot = mutable(makeSnapshot());
    delete (snapshot.records as Record<string, unknown>).reviewWorkflowState;
    delete (snapshot.records as Record<string, unknown>)
      .reviewStepAcknowledgements;

    expect(validateWorkspaceSnapshot(snapshot)).toEqual([]);
    // And it is normalised, so every consumer downstream can assume it exists.
    expect(snapshot.records.reviewWorkflowState).toEqual([]);
    expect(snapshot.records.reviewStepAcknowledgements).toEqual([]);
  });

  it("does NOT tolerate a missing collection that is not opted in", () => {
    const snapshot = mutable(makeSnapshot());
    delete (snapshot.records as Record<string, unknown>).reviewSections;
    expect(validateWorkspaceSnapshot(snapshot)).toContainEqual({
      path: "records.reviewSections",
      message: "must be an array",
    });
  });

  /*
   * HARDEN-06B (F-02) — the contract as an INVARIANT over the collection list,
   * not as two hard-coded names.
   *
   * The test above named `reviewWorkflowState` and `reviewStepAcknowledgements`
   * and nothing else, so when TASKS-13 added `taskChecklistItems` to
   * `SNAPSHOT_COLLECTION_ORDER` and both D1 repositories but not to the opt-in
   * list, nothing failed — and every archive an owner had exported between
   * HARDEN-01 and TASKS-13 was refused by Restore with
   * `records.taskChecklistItems must be an array`. The list's own comment says
   * "add to this list in the SAME change that adds a collection"; this is what
   * makes forgetting impossible rather than merely discouraged.
   *
   * `REQUIRED_SINCE_SCHEMA_VERSION_2` is the explicit, deliberate other half: a
   * collection that has existed since the current `SNAPSHOT_SCHEMA_VERSION` was
   * set, so no archive declaring version 2 can legitimately lack it. Adding a
   * NEW collection to that list instead of to the opt-in list is a decision to
   * invalidate existing archives, and would have to bump the schema version.
   */
  const REQUIRED_SINCE_SCHEMA_VERSION_2: readonly SnapshotCollection[] = [
    "entities",
    "spineRecords",
    "areaDetails",
    "goalDetails",
    "projectDetails",
    "taskDetails",
    "taskRecurrenceRules",
    "noteDetails",
    "diaryEntryDetails",
    "personDetails",
    "meetingDetails",
    "meetingItems",
    "meetingItemTasks",
    "assetDetails",
    "assetEvents",
    "assetObligations",
    "reviewDetails",
    "reviewSections",
    "entityLinks",
    "activities",
    "activitySubjects",
  ];

  it("classifies every snapshot collection as optional-on-read or required", () => {
    const unclassified = SNAPSHOT_COLLECTION_ORDER.filter(
      (collection) =>
        !SNAPSHOT_OPTIONAL_ON_READ_COLLECTIONS.includes(collection) &&
        !REQUIRED_SINCE_SCHEMA_VERSION_2.includes(collection),
    );
    expect(
      unclassified,
      "Every snapshot collection must be either opted in as optional-on-read " +
        "(the ordinary case, for a collection added after the schema version " +
        "was last set) or listed here as required since schema version 2 (a " +
        "deliberate decision to refuse the archives owners already hold).",
    ).toEqual([]);
  });

  it.each(SNAPSHOT_COLLECTION_ORDER)(
    "never refuses an archive merely for having no %s key",
    (collection) => {
      const snapshot = mutable(makeSnapshot());
      delete (snapshot.records as Record<string, unknown>)[collection];
      const structural = validateWorkspaceSnapshot(snapshot).filter(
        (issue) =>
          issue.path === `records.${collection}` &&
          issue.message === "must be an array",
      );
      if (SNAPSHOT_OPTIONAL_ON_READ_COLLECTIONS.includes(collection)) {
        // Tolerated, and normalised in place so every consumer downstream can
        // assume the collection exists. (Rows in a LATER collection that pointed
        // into this one are still reported — that is referential integrity
        // doing its job, and a genuinely older archive has neither.)
        expect(structural).toEqual([]);
        expect(snapshot.records[collection]).toEqual([]);
      } else {
        expect(structural).toHaveLength(1);
      }
    },
  );

  it("accepts an archive written before EVERY optional collection existed", () => {
    const snapshot = mutable(makeSnapshot());
    for (const collection of SNAPSHOT_OPTIONAL_ON_READ_COLLECTIONS) {
      delete (snapshot.records as Record<string, unknown>)[collection];
    }
    expect(validateWorkspaceSnapshot(snapshot)).toEqual([]);
    for (const collection of SNAPSHOT_OPTIONAL_ON_READ_COLLECTIONS) {
      expect(snapshot.records[collection]).toEqual([]);
    }
  });

  it("still rejects an optional collection present but malformed", () => {
    const snapshot = mutable(makeSnapshot());
    (
      snapshot.records as unknown as Record<string, unknown>
    ).reviewWorkflowState = "not an array";
    expect(validateWorkspaceSnapshot(snapshot)).toContainEqual({
      path: "records.reviewWorkflowState",
      message: "must be an array",
    });
  });
});

describe("secret and infrastructure exclusion", () => {
  const serialised = JSON.stringify(makeSnapshot());

  it("carries no forbidden field name in the serialised snapshot", () => {
    const keys = [...serialised.matchAll(/"([A-Za-z0-9_.]+)":/g)].map(
      (match) => match[1] ?? "",
    );
    const offenders = keys.filter((key) =>
      FORBIDDEN_EXPORT_KEY_PATTERN.test(key),
    );
    expect(offenders).toEqual([]);
  });

  it("carries no infrastructure identifier", () => {
    for (const hint of INFRASTRUCTURE_KEY_HINTS) {
      expect(serialised).not.toContain(hint);
    }
  });

  it("carries no owner subject identifier", () => {
    // The fixture's Activity actor id is a subject-shaped value, which is a real
    // part of the audit trail; what must never appear is an owner_id FIELD on
    // preferences or saved views.
    const snapshot = makeSnapshot();
    expect(Object.keys(snapshot.owner.preferences)).not.toContain("ownerId");
    expect(Object.keys(snapshot.owner.preferences)).not.toContain("owner_id");
    for (const view of snapshot.owner.taskSavedViews) {
      expect(Object.keys(view)).not.toContain("ownerId");
    }
  });

  it("includes archived and soft-deleted records rather than dropping them", () => {
    const snapshot = makeSnapshot();
    const ids = snapshot.records.entities.map((entity) => entity.id);
    expect(ids).toContain(IDS.noteDeleted);
    expect(ids).toContain(IDS.projectDeleted);
    expect(ids).toContain(IDS.noteArchived);
    expect(ids).toContain(IDS.areaArchived);
  });
});
