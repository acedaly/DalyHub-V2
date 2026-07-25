/**
 * DIARY-01A — the Timeline cursor (pure unit tests).
 *
 * Proves the cursor round-trips, is bound to its full query scope (workspace,
 * order, entry-type filter, occurred-at range, delete mode), and rejects any
 * tampered, mis-versioned or foreign-scoped value rather than silently
 * reinterpreting it.
 */

import { describe, expect, it } from "vitest";

import {
  DIARY_CURSOR_VERSION,
  InvalidDiaryCursorError,
  decodeDiaryCursor,
  decodeDiaryCursorForScope,
  encodeDiaryCursor,
  normaliseEntryTypeScope,
  type DiaryCursorScope,
} from "~/kernel/diary";

const SCOPE: DiaryCursorScope = {
  workspaceId: "ws-1",
  order: "newest",
  entryTypes: null,
  from: null,
  to: null,
  includeDeleted: false,
};

const POSITION = { occurredAt: "2026-07-20T10:00:00.000Z", id: "entry-9" };

describe("normaliseEntryTypeScope", () => {
  it("returns null for undefined/empty and a sorted comma-join otherwise", () => {
    expect(normaliseEntryTypeScope(undefined)).toBeNull();
    expect(normaliseEntryTypeScope([])).toBeNull();
    expect(normaliseEntryTypeScope(["meeting", "decision"])).toBe(
      "decision,meeting",
    );
  });
});

describe("encode/decode round-trip", () => {
  it("round-trips scope and position exactly", () => {
    const scope: DiaryCursorScope = {
      ...SCOPE,
      entryTypes: "decision,meeting",
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-12-31T23:59:59.999Z",
      includeDeleted: true,
      order: "oldest",
    };
    const decoded = decodeDiaryCursor(encodeDiaryCursor(scope, POSITION));
    expect(decoded.scope).toEqual(scope);
    expect(decoded.position).toEqual(POSITION);
  });

  it("round-trips a Unicode entry id", () => {
    const position = { occurredAt: POSITION.occurredAt, id: "日記-42" };
    const decoded = decodeDiaryCursor(encodeDiaryCursor(SCOPE, position));
    expect(decoded.position.id).toBe("日記-42");
  });
});

describe("decodeDiaryCursorForScope — scope binding", () => {
  it("returns the position when the scope matches exactly", () => {
    const cursor = encodeDiaryCursor(SCOPE, POSITION);
    expect(decodeDiaryCursorForScope(cursor, SCOPE)).toEqual(POSITION);
  });

  it.each([
    ["a different workspace", { ...SCOPE, workspaceId: "ws-2" }],
    ["a different order", { ...SCOPE, order: "oldest" as const }],
    ["a different type filter", { ...SCOPE, entryTypes: "meeting" }],
    ["a different from bound", { ...SCOPE, from: "2020-01-01T00:00:00.000Z" }],
    ["a different to bound", { ...SCOPE, to: "2020-01-01T00:00:00.000Z" }],
    ["a different delete mode", { ...SCOPE, includeDeleted: true }],
  ])("rejects a cursor replayed under %s", (_label, otherScope) => {
    const cursor = encodeDiaryCursor(SCOPE, POSITION);
    expect(() => decodeDiaryCursorForScope(cursor, otherScope)).toThrow(
      InvalidDiaryCursorError,
    );
  });
});

describe("decodeDiaryCursor — malformed input", () => {
  it.each(["", "!!!not-base64!!!", "e30"])(
    "rejects the malformed cursor %p",
    (value) => {
      expect(() => decodeDiaryCursor(value)).toThrow(InvalidDiaryCursorError);
    },
  );

  it("rejects a cursor from a different version", () => {
    const encoded = encodeDiaryCursor(SCOPE, POSITION);
    // Tamper: decode, bump the version, re-encode with the raw base64url helper.
    const raw = JSON.stringify([
      DIARY_CURSOR_VERSION + 1,
      SCOPE.workspaceId,
      SCOPE.order,
      SCOPE.entryTypes,
      SCOPE.from,
      SCOPE.to,
      0,
      POSITION.occurredAt,
      POSITION.id,
    ]);
    const tampered = btoa(raw)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(tampered).not.toBe(encoded);
    expect(() => decodeDiaryCursor(tampered)).toThrow(InvalidDiaryCursorError);
  });
});
