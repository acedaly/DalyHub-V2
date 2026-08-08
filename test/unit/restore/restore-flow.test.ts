/**
 * SET-02 — the restore surface's pure model.
 *
 * The states and their sentences are the product here, so they are asserted
 * without mounting anything: which refusals get their own heading, when the
 * restore action is allowed to fire, and what the consequence sentence actually
 * says in each mode.
 */

import { describe, expect, it } from "vitest";

import {
  RESTORE_CONFIRM_PHRASE,
  canRestore,
  consequenceSentence,
  formatBackupDate,
  rejectionHeading,
  type RestoreFlowState,
  type RestorePreviewView,
} from "~/modules/settings/restore-flow";

const zero = {
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

function view(destructive: boolean, targetTotal = 0): RestorePreviewView {
  return {
    operationId: "op",
    backup: {
      createdAt: "2026-08-01T09:00:00.000Z",
      schemaVersion: 2,
      applicationVersion: "2.0.1",
      applicationReleaseName: "V2",
      sourceWorkspaceId: "source",
      counts: { ...zero, total: 1200, tasks: 900 },
    },
    target: {
      workspaceId: "target",
      isEmpty: targetTotal === 0,
      counts: { ...zero, total: targetTotal },
    },
    mode: destructive ? "replace" : "into-empty",
    destructive,
    safetyBackupRequired: destructive,
  };
}

function ready(
  destructive: boolean,
  safetyBackupFilename: string | null,
): RestoreFlowState {
  return {
    kind: "ready",
    filename: "backup.zip",
    preview: view(destructive, destructive ? 40 : 0),
    safetyBackupFilename,
  };
}

describe("restore flow model", () => {
  it("allows a non-destructive restore immediately", () => {
    expect(canRestore(ready(false, null))).toBe(true);
  });

  it("blocks a destructive restore until a safety backup exists", () => {
    expect(canRestore(ready(true, null))).toBe(false);
    expect(canRestore(ready(true, "safety.zip"))).toBe(true);
  });

  it("never allows a restore from a non-ready state", () => {
    const states: RestoreFlowState[] = [
      { kind: "idle" },
      { kind: "checking", filename: "b.zip" },
      { kind: "restoring", filename: "b.zip", preview: view(false) },
      { kind: "failed", message: "no", workspaceReplaced: false },
      { kind: "restored", counts: zero, safetyBackupFilename: null },
    ];
    for (const state of states) expect(canRestore(state)).toBe(false);
  });

  it("gives each refusal its own heading rather than one generic error", () => {
    const headings = (
      [
        "corrupt",
        "unsupported_version",
        "too_large",
        "unreadable_archive",
        "incompatible",
      ] as const
    ).map(rejectionHeading);
    expect(new Set(headings).size).toBe(headings.length);
    expect(rejectionHeading("corrupt")).toMatch(/integrity/i);
    expect(rejectionHeading("unsupported_version")).toMatch(
      /different DalyHub/i,
    );
  });

  it("states the consequence differently for an empty and a populated target", () => {
    expect(consequenceSentence(view(false))).toMatch(/workspace is empty/i);
    expect(consequenceSentence(view(false))).not.toMatch(/REPLACES/);

    const destructive = consequenceSentence(view(true, 40));
    expect(destructive).toMatch(/REPLACES/);
    expect(destructive).toMatch(/40 record/);
    expect(destructive).toMatch(/1,200 record/);
  });

  it("requires an unambiguous typed phrase", () => {
    // Not "yes", not "delete" — the word names the consequence.
    expect(RESTORE_CONFIRM_PHRASE).toBe("REPLACE");
  });

  it("falls back to the raw value rather than blanking an odd date", () => {
    expect(formatBackupDate("not-a-date")).toBe("not-a-date");
    expect(formatBackupDate("2026-08-01T09:00:00.000Z")).not.toBe(
      "2026-08-01T09:00:00.000Z",
    );
  });
});
