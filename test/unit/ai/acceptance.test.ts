import { describe, expect, it } from "vitest";

import {
  acceptanceIdempotencyKey,
  proposalOutcome,
  refusalFor,
  type AppliedItem,
} from "~/modules/ai/apply-proposal";

/**
 * AI-02 — the two pure decisions the acceptance path makes, tested away from
 * storage: what the acceptance AMOUNTED TO, and what key each created record is
 * claimed under.
 *
 * The behaviour that needs real repositories and real D1 constraints — the
 * `meeting_item_tasks` mapping, the EntityLinks, the Activity actor, workspace
 * isolation and stale-state refusal — is in `test/kernel/ai-apply-proposal.test.ts`
 * against real ones, not mocks.
 */

const item = (over: Partial<AppliedItem> = {}): AppliedItem => ({
  index: 0,
  kind: "task",
  ok: true,
  ...over,
});

describe("acceptance outcome", () => {
  it("is accepted only when EVERY item saved", () => {
    expect(proposalOutcome([item(), item({ index: 1 })])).toBe("accepted");
  });

  /**
   * The case this function exists for. One saved item and one failure is a
   * PARTIAL acceptance — reporting it as `accepted` would tell the owner their
   * whole proposal is in DalyHub when part of it is not.
   */
  it("is partially_accepted when some saved and some did not", () => {
    expect(
      proposalOutcome([item(), item({ index: 1, ok: false, message: "no" })]),
    ).toBe("partially_accepted");
    expect(proposalOutcome([item({ ok: false }), item({ index: 1 })])).toBe(
      "partially_accepted",
    );
  });

  it("is rejected when nothing saved", () => {
    expect(
      proposalOutcome([item({ ok: false }), item({ index: 1, ok: false })]),
    ).toBe("rejected");
  });

  it("is rejected for an empty acceptance — nothing was written", () => {
    expect(proposalOutcome([])).toBe("rejected");
  });

  it("counts an idempotently-returned record as saved, because it exists", () => {
    // `created: false` means a replay found the record the first attempt made.
    // The owner's proposal IS in DalyHub, so this is an acceptance.
    expect(proposalOutcome([item({ created: false })])).toBe("accepted");
  });
});

describe("acceptance idempotency keys", () => {
  it("is stable for the same acceptance, so a retry claims the same key", async () => {
    const first = await acceptanceIdempotencyKey(
      "usage-1",
      0,
      "note",
      "Decisions",
    );
    const second = await acceptanceIdempotencyKey(
      "usage-1",
      0,
      "note",
      "Decisions",
    );
    expect(first).toBe(second);
  });

  it("differs when ANY part of the acceptance differs", async () => {
    const base = await acceptanceIdempotencyKey(
      "usage-1",
      0,
      "note",
      "Decisions",
    );
    const keys = await Promise.all([
      acceptanceIdempotencyKey("usage-2", 0, "note", "Decisions"),
      acceptanceIdempotencyKey("usage-1", 1, "note", "Decisions"),
      acceptanceIdempotencyKey("usage-1", 0, "task", "Decisions"),
      // An owner who EDITED the title before accepting asked for a different
      // record, and gets one.
      acceptanceIdempotencyKey("usage-1", 0, "note", "Decisions (edited)"),
    ]);
    expect(new Set([base, ...keys]).size).toBe(5);
  });

  it("is a well-formed key whatever the owner’s title contains", async () => {
    // The receipts table's key pattern is strict, and a title is free text —
    // hashing is what keeps every key valid AND keeps record content out of the
    // stored key.
    const pattern = /^[A-Za-z0-9][A-Za-z0-9-]{7,127}$/;
    for (const title of [
      "Decisions from the sync",
      "  spaces  ",
      "emoji 🎉 and — dashes",
      "'\"; DROP TABLE notes; --",
      "\n\t newlines \r",
      "x".repeat(4000),
      "",
    ]) {
      const key = await acceptanceIdempotencyKey("usage-1", 0, "note", title);
      expect(key).toMatch(pattern);
      expect(key).toHaveLength(64);
      // The owner's own words never reach the stored key.
      const fragment = title.trim().slice(0, 8);
      if (fragment.length > 0) expect(key).not.toContain(fragment);
    }
  });
});

describe("acceptance refusals", () => {
  it("never leaks storage, SQL or provider text to the owner", () => {
    const hostile = [
      new Error(
        "D1_ERROR: UNIQUE constraint failed: meeting_item_tasks.item_id",
      ),
      new Error("SQLITE_CONSTRAINT: FOREIGN KEY constraint failed"),
      new Error("openai: 401 Unauthorized (sk-proj-abcdefghijklmnop)"),
      { stack: "at applyMeetingTask (/app/modules/ai/apply-proposal.ts:1:1)" },
      "raw string failure",
      null,
    ];
    for (const cause of hostile) {
      const message = refusalFor(cause);
      expect(message).toBe(
        "That couldn’t be saved. Nothing was changed for this item.",
      );
      for (const forbidden of [
        "D1",
        "SQLITE",
        "SQL",
        "constraint",
        "meeting_item_tasks",
        "sk-",
        "apply-proposal.ts",
        "openai",
      ]) {
        expect(message).not.toContain(forbidden);
      }
    }
  });
});
