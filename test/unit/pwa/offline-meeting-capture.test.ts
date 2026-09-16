/**
 * MOBILE-03 — the Meeting half of the offline mutation queue.
 *
 * `offline-mutation.test.ts` proves the queue's shared machinery (ordering,
 * retry, leases, bounds) and does not need re-proving per entity type. What is
 * NEW here, and what this file holds, is the set of properties that make a
 * Meeting append safe to queue at all:
 *
 *   1. an append is never mistaken for a Task edit — its entity type, its
 *      route and its receipt operation all follow from the operation itself;
 *   2. an append never COALESCES, so two decisions captured before either is
 *      sent remain two decisions;
 *   3. an append never CONFLICTS, in any state of the server, because it
 *      overwrites nothing;
 *   4. an append carries no base value, whatever a caller passes;
 *   5. the closed operation set in the kernel and the CHECK in the receipt
 *      table say the SAME thing — the guarantee migration 0056's header claims
 *      and, until this file, nothing actually held.
 *
 * Every one of them is a way the feature could be wrong without looking wrong.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  OFFLINE_APPEND_ITEM_KIND,
  OFFLINE_APPEND_OPERATIONS,
  OFFLINE_MUTATION_OPERATIONS,
  OFFLINE_TASK_OPERATIONS,
  appendItemKind,
  coalesceInto,
  createMutationRecord,
  decideConflict,
  entityTypeFor,
  findCoalesceTarget,
  isAppendOperation,
  isTaskOperation,
  replayEndpointFor,
  targetGoneMessage,
  type OfflineAppendOperation,
  type OfflineMutationRecord,
} from "~/kernel/offline";
import { MEETING_ITEM_KINDS } from "~/kernel/meetings";
import { MEETING_APPEND_OPERATION } from "~/modules/meetings/meeting-offline-capture";

const NAMESPACE = "ns-1";
const NOW = new Date("2026-09-16T04:00:00.000Z");

function append(
  operation: OfflineAppendOperation,
  overrides: Partial<{ entityId: string; value: string; id: string }> = {},
): OfflineMutationRecord {
  return createMutationRecord({
    namespace: NAMESPACE,
    entityId: overrides.entityId ?? "m-1",
    operation,
    value: overrides.value ?? "Budget for Q3",
    now: NOW,
    sequence: 1,
    id: overrides.id ?? "11111111-1111-4111-8111-111111111111",
  });
}

describe("a queued Meeting capture is a Meeting capture", () => {
  it("derives its entity type from the operation, not from the caller", () => {
    for (const operation of OFFLINE_APPEND_OPERATIONS) {
      expect(entityTypeFor(operation)).toBe("meeting");
      expect(append(operation).entityType).toBe("meeting");
    }
    for (const operation of OFFLINE_TASK_OPERATIONS) {
      expect(entityTypeFor(operation)).toBe("task");
    }
  });

  it("replays to the Meetings module's own mutation route", () => {
    expect(replayEndpointFor(append("add_decision"))).toBe(
      "/meeting/m-1/mutate",
    );
    // …and a Task still replays to the Task record route, unchanged.
    expect(replayEndpointFor({ entityType: "task", entityId: "t-1" })).toBe(
      "/tasks/t-1",
    );
    // An id with a slash or a space in it cannot escape its path segment.
    expect(
      replayEndpointFor({ entityType: "meeting", entityId: "a/b c" }),
    ).toBe("/meeting/a%2Fb%20c/mutate");
  });

  it("keeps the two operation families disjoint and exhaustive", () => {
    const appends = OFFLINE_APPEND_OPERATIONS.filter(isAppendOperation);
    expect(appends).toHaveLength(OFFLINE_APPEND_OPERATIONS.length);
    for (const operation of OFFLINE_APPEND_OPERATIONS) {
      expect(isTaskOperation(operation)).toBe(false);
    }
    for (const operation of OFFLINE_TASK_OPERATIONS) {
      expect(isAppendOperation(operation)).toBe(false);
    }
    // Together they are the whole vocabulary: nothing is in neither.
    expect(
      [...OFFLINE_TASK_OPERATIONS, ...OFFLINE_APPEND_OPERATIONS].sort(),
    ).toEqual([...OFFLINE_MUTATION_OPERATIONS].sort());
  });

  it("maps each append to a real MeetingItemKind, in both directions", () => {
    for (const operation of OFFLINE_APPEND_OPERATIONS) {
      const kind = appendItemKind(operation);
      // The kernel's offline module names the kind as a plain string so it need
      // not import a module domain. This is the assertion that keeps that
      // string honest against the Meetings kernel's own closed set.
      expect(MEETING_ITEM_KINDS).toContain(kind);
      expect(
        MEETING_APPEND_OPERATION[kind as (typeof MEETING_ITEM_KINDS)[number]],
      ).toBe(operation);
    }
    // Every meeting item kind is capturable offline — no kind is silently
    // missing from the bar's offline path.
    for (const kind of MEETING_ITEM_KINDS) {
      expect(OFFLINE_APPEND_ITEM_KIND[MEETING_APPEND_OPERATION[kind]]).toBe(
        kind,
      );
    }
  });
});

describe("an append is never folded into another append", () => {
  it("keeps two decisions captured back to back as two decisions", () => {
    const first = append("add_decision", {
      value: "Ship on Friday",
      id: "22222222-2222-4222-8222-222222222222",
    });
    // The coalesce rule already refuses every non-replace operation, and this
    // is the case that makes it load-bearing for Meetings: without it, the
    // second decision would overwrite the first in the queue and one of them
    // would never reach the meeting.
    expect(
      findCoalesceTarget([first], {
        entityId: "m-1",
        operation: "add_decision",
      }),
    ).toBeNull();
  });

  it("does not fold an append into a queued append of a different kind either", () => {
    const agenda = append("add_agenda_item");
    expect(
      findCoalesceTarget([agenda], {
        entityId: "m-1",
        operation: "add_action",
      }),
    ).toBeNull();
  });

  it("still coalesces repeated Task title edits, which is the rule's purpose", () => {
    const rename = createMutationRecord({
      namespace: NAMESPACE,
      entityId: "t-1",
      operation: "set_title",
      value: "Call mechanic",
      now: NOW,
      sequence: 1,
    });
    const target = findCoalesceTarget([rename], {
      entityId: "t-1",
      operation: "set_title",
    });
    expect(target).not.toBeNull();
    expect(
      coalesceInto(target!, { value: "Call Toyota", now: NOW }).value,
    ).toBe("Call Toyota");
  });
});

describe("an append can never conflict", () => {
  it("is applied whatever the server currently holds", () => {
    for (const operation of OFFLINE_APPEND_OPERATIONS) {
      for (const current of [null, "", "something else entirely"]) {
        expect(
          decideConflict({
            operation,
            base: null,
            current,
            intended: "Budget for Q3",
          }),
        ).toEqual({ kind: "applied" });
      }
    }
  });

  it("is never reported as `satisfied`, even against an identical body", () => {
    // `satisfied` means "the record already holds your intent", and no reading
    // of a meeting establishes that for an append: two identical actions
    // captured in one meeting are two actions. Duplicate suppression is the
    // receipt's job, not the conflict rule's.
    expect(
      decideConflict({
        operation: "add_action",
        base: null,
        current: "Follow up with Lena",
        intended: "Follow up with Lena",
      }),
    ).toEqual({ kind: "applied" });
  });

  it("carries no base value, whatever the caller supplies", () => {
    const record = createMutationRecord({
      namespace: NAMESPACE,
      entityId: "m-1",
      operation: "add_outcome",
      value: "Agreed the scope",
      baseValue: "a base that must not survive",
      now: NOW,
      sequence: 1,
    });
    expect(record.baseValue).toBeNull();
    expect(record.value).toBe("Agreed the scope");
  });
});

describe("what the owner is told when the record is gone", () => {
  it("names the record kind that was actually deleted", () => {
    expect(targetGoneMessage("meeting")).toMatch(/meeting was deleted/i);
    expect(targetGoneMessage("meeting")).not.toMatch(/task/i);
    expect(targetGoneMessage("task")).toMatch(/task was deleted/i);
  });
});

describe("the receipt table accepts exactly the operations the kernel can queue", () => {
  /**
   * The guarantee migration 0056's header claims, held here rather than
   * asserted in a comment.
   *
   * The CHECK is the DATABASE's statement of which intents a receipt may
   * record, and the kernel's closed set is the application's. A new operation
   * added to one and not the other fails at write time, in production, on a
   * change the owner made offline — which is the worst possible place to
   * discover it. Reading the LAST migration that rebuilds the table is what
   * makes this true of the schema as deployed rather than of whichever
   * migration happens to be read first.
   */
  function latestReceiptCheckOperations(): readonly string[] {
    const dir = join(process.cwd(), "migrations");
    const rebuilds = readdirSync(dir)
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .map((name) => ({ name, sql: readFileSync(join(dir, name), "utf8") }))
      .filter(({ sql }) => /CHECK \(operation IN \(/.test(sql));
    expect(rebuilds.length).toBeGreaterThan(0);
    const latest = rebuilds[rebuilds.length - 1];
    const match = /CHECK \(operation IN \(([\s\S]*?)\)\)/.exec(latest.sql);
    expect(match, `no operation CHECK found in ${latest.name}`).not.toBeNull();
    return [...match![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  }

  it("matches the kernel's closed operation set exactly", () => {
    expect([...latestReceiptCheckOperations()].sort()).toEqual(
      [...OFFLINE_MUTATION_OPERATIONS].sort(),
    );
  });
});
