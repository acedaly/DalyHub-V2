/**
 * SET-02 — the restore preview, derived purely from a validated snapshot.
 *
 * The preview answers the only question that matters before a restore: *what am
 * I about to restore, and what will happen to my current DalyHub data?* It is a
 * pure function so that the answer the owner is shown and the answer the server
 * acts on are the same value, computed once.
 *
 * It counts in DalyHub's own nouns — Areas, Goals, Projects, Tasks, Notes, Diary
 * entries, Meetings, People, Assets, Reviews — because that is what an owner
 * recognises; the raw collection counts travel alongside for diagnostics rather
 * than replacing them in the interface.
 */

import {
  SNAPSHOT_COLLECTION_ORDER,
  type SnapshotCollection,
  type WorkspaceSnapshotV1,
} from "~/kernel/export";

import type {
  RestoreBackupSummary,
  RestoreCollectionCounts,
  RestoreMode,
  RestorePreview,
  RestoreRecordCounts,
  RestoreTargetState,
} from "./restore-contract";

/** Entity types that map to a named count. Anything else counts as `other`. */
const COUNTED_TYPES: Readonly<Record<string, keyof RestoreRecordCounts>> = {
  area: "areas",
  goal: "goals",
  project: "projects",
  task: "tasks",
  note: "notes",
  diary: "diaryEntries",
  meeting: "meetings",
  person: "people",
  asset: "assets",
  review: "reviews",
};

/** A zeroed count set. */
export function emptyRecordCounts(): RestoreRecordCounts {
  return {
    areas: 0,
    goals: 0,
    projects: 0,
    tasks: 0,
    notes: 0,
    diaryEntries: 0,
    meetings: 0,
    people: 0,
    assets: 0,
    reviews: 0,
    other: 0,
    links: 0,
    activityEvents: 0,
    total: 0,
  };
}

/**
 * Count a snapshot's records by the nouns the product uses.
 *
 * Soft-deleted and archived records ARE counted: they are in the backup, they
 * will be restored, and a preview that hid them would understate what is about
 * to happen.
 */
export function countSnapshotRecords(
  snapshot: WorkspaceSnapshotV1,
): RestoreRecordCounts {
  const counts: Record<string, number> = { ...emptyRecordCounts() };
  for (const entity of snapshot.records.entities) {
    const key = COUNTED_TYPES[entity.type] ?? "other";
    counts[key] = (counts[key] ?? 0) + 1;
    counts.total = (counts.total ?? 0) + 1;
  }
  counts.links = snapshot.records.entityLinks.length;
  counts.activityEvents = snapshot.records.activities.length;
  return counts as unknown as RestoreRecordCounts;
}

/** Raw row counts per collection, in canonical order. */
export function countSnapshotCollections(
  snapshot: WorkspaceSnapshotV1,
): RestoreCollectionCounts {
  return Object.fromEntries(
    SNAPSHOT_COLLECTION_ORDER.map((collection: SnapshotCollection) => [
      collection,
      snapshot.records[collection].length,
    ]),
  ) as RestoreCollectionCounts;
}

/** Summarise what the backup says about itself. */
export function summariseBackup(
  snapshot: WorkspaceSnapshotV1,
): RestoreBackupSummary {
  return {
    createdAt: snapshot.meta.exportedAt,
    schemaVersion: snapshot.meta.schemaVersion,
    applicationVersion: snapshot.meta.application.version,
    applicationReleaseName: snapshot.meta.application.releaseName,
    // Provenance only. The write path never reads this.
    sourceWorkspaceId: snapshot.workspace.id,
    counts: countSnapshotRecords(snapshot),
    collectionCounts: countSnapshotCollections(snapshot),
    limitationCodes: snapshot.limitations.map((limitation) => limitation.code),
  };
}

/**
 * A workspace is EMPTY for restore purposes when it holds no first-class
 * records, no relationships and no history.
 *
 * Owner preferences and saved views deliberately do not count: they are settings
 * a fresh workspace already has, and treating a workspace as populated because
 * the owner picked a timezone would force a needless destructive confirmation on
 * the one path that cannot lose anything.
 */
export function isEmptyTarget(counts: RestoreRecordCounts): boolean {
  return (
    counts.total === 0 && counts.links === 0 && counts.activityEvents === 0
  );
}

/** Decide the mode from the target's current state. */
export function restoreModeFor(counts: RestoreRecordCounts): RestoreMode {
  return isEmptyTarget(counts) ? "into-empty" : "replace";
}

/** Assemble the preview shown before anything is written. */
export function buildRestorePreview(input: {
  readonly operationId: string;
  readonly snapshot: WorkspaceSnapshotV1;
  readonly target: RestoreTargetState;
}): RestorePreview {
  const mode = restoreModeFor(input.target.counts);
  return {
    operationId: input.operationId,
    backup: summariseBackup(input.snapshot),
    target: input.target,
    mode,
    destructive: mode === "replace",
    safetyBackupRequired: mode === "replace",
  };
}
