/**
 * PWA-12 — the conflict contract.
 *
 * The rule both ends share, proven in isolation. Every case here is a real
 * situation the brief names, and the expected behaviour is asserted EXPLICITLY
 * rather than as "an error appears" — a conflict model whose tests only check
 * that something went wrong is not a model.
 */

import { describe, expect, it } from "vitest";

import {
  conflictMessage,
  decideCompletionConflict,
  decideConflict,
  decideReplaceConflict,
  sameValue,
} from "~/kernel/offline";

describe("value comparison", () => {
  it("treats null and empty as the same absence", () => {
    // A cleared priority is null in the domain and "" on a form. Comparing them
    // raw would report a phantom conflict every time a value was cleared.
    expect(sameValue(null, "")).toBe(true);
    expect(sameValue("  ", null)).toBe(true);
    expect(sameValue("p1", "p2")).toBe(false);
  });

  it("compares titles as the domain stores them", () => {
    expect(sameValue(" Book Hilux service ", "Book Hilux service")).toBe(true);
  });
});

describe("replace-style fields", () => {
  it("applies when the field is where this device left it", () => {
    expect(
      decideReplaceConflict({
        operation: "set_title",
        base: "Service Hilux",
        current: "Service Hilux",
        intended: "Book Hilux service",
      }),
    ).toEqual({ kind: "applied" });
  });

  it("reports a conflict when the field moved to a third value", () => {
    const decision = decideReplaceConflict({
      operation: "set_title",
      base: "Service Hilux",
      current: "Hilux 100,000km service",
      intended: "Book Hilux service",
    });
    expect(decision.kind).toBe("conflict");
    if (decision.kind !== "conflict") throw new Error("expected a conflict");
    // The owner gets what they need to choose: the field, and what DalyHub holds.
    expect(decision.conflict.field).toBe("title");
    expect(decision.conflict.serverValue).toBe("Hilux 100,000km service");
  });

  it("is SATISFIED when the field already holds the intended value", () => {
    // This is the case that makes replay safe to repeat: an attempt succeeded,
    // its response was lost, and the retry finds its own work already done.
    // Calling that a conflict would turn every lost response into a question.
    expect(
      decideReplaceConflict({
        operation: "set_priority",
        base: "p4",
        current: "p2",
        intended: "p2",
      }),
    ).toEqual({ kind: "satisfied" });
  });

  it("merges an offline priority change with an unrelated server title change", () => {
    // The whole reason the comparison is field-focused. `updatedAt` moved,
    // because the title changed on another device — but the PRIORITY did not,
    // so there is nothing to decide and nothing to ask the owner about.
    expect(
      decideReplaceConflict({
        operation: "set_priority",
        base: null,
        current: null,
        intended: "p2",
      }),
    ).toEqual({ kind: "applied" });
  });

  it("conflicts when both sides changed the same date", () => {
    const decision = decideReplaceConflict({
      operation: "set_due",
      base: "2026-08-14",
      current: "2026-08-20",
      intended: "2026-08-15",
    });
    expect(decision.kind).toBe("conflict");
    if (decision.kind !== "conflict") throw new Error("expected a conflict");
    expect(decision.conflict.field).toBe("dueDate");
  });

  it("applies a clear when the field is still where it was", () => {
    expect(
      decideReplaceConflict({
        operation: "set_planned",
        base: "2026-08-14",
        current: "2026-08-14",
        intended: null,
      }),
    ).toEqual({ kind: "applied" });
  });
});

describe("completion", () => {
  it("treats an already-completed task as success for a queued completion", () => {
    // Idempotent "already completed" IS the intended terminal state, so it is a
    // success — and it is what keeps a duplicated replay from advancing a
    // recurring series twice.
    expect(
      decideCompletionConflict({
        operation: "complete",
        completedAt: "2026-08-12T09:00:00.000Z",
      }),
    ).toEqual({ kind: "satisfied" });
  });

  it("applies a completion to a task that is open, however it got there", () => {
    // Never completed, or completed and reopened elsewhere: either way the
    // owner's intent is achievable, and the canonical completion decides what
    // happens — including whether a successor is created.
    expect(
      decideCompletionConflict({ operation: "complete", completedAt: null }),
    ).toEqual({ kind: "applied" });
  });

  it("treats an already-reopened task as success for a queued reopen", () => {
    expect(
      decideCompletionConflict({ operation: "reopen", completedAt: null }),
    ).toEqual({ kind: "satisfied" });
  });

  it("applies a reopen to a task completed elsewhere", () => {
    expect(
      decideCompletionConflict({
        operation: "reopen",
        completedAt: "2026-08-12T09:00:00.000Z",
      }),
    ).toEqual({ kind: "applied" });
  });

  it("routes lifecycle operations through the completion rule, not the field one", () => {
    // `decideConflict` is the one entry point, and it must not compare a
    // completion timestamp as though it were a text field.
    expect(
      decideConflict({
        operation: "complete",
        base: null,
        current: "2026-08-12T09:00:00.000Z",
        intended: null,
      }),
    ).toEqual({ kind: "satisfied" });
  });
});

describe("wording", () => {
  it("explains the real situation without a status code", () => {
    for (const operation of [
      "set_title",
      "set_priority",
      "set_due",
      "set_planned",
      "complete",
      "reopen",
    ] as const) {
      const message = conflictMessage(operation);
      expect(message).toMatch(/another device/);
      expect(message).not.toMatch(/409|conflict\b|version|sync failed/i);
    }
  });
});
