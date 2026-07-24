import { describe, expect, it } from "vitest";

import { InvalidCursorError } from "~/kernel/entities/entity-errors";
import {
  CURSOR_VERSION,
  cursorScopeMatches,
  decodeCursor,
  decodeCursorForScope,
  encodeCursor,
  type CursorScope,
} from "~/kernel/entities/entity-cursor";

const SCOPE: CursorScope = {
  workspaceId: "ws_alpha",
  type: "widget",
  includeDeleted: false,
  deletedOnly: false,
};

describe("cursor encode/decode (scoped, versioned)", () => {
  it("round-trips scope and position", () => {
    const cursor = encodeCursor(SCOPE, {
      createdAt: "2026-07-17T12:34:56.789Z",
      id: "018f...-abc",
    });
    expect(decodeCursor(cursor)).toEqual({
      scope: SCOPE,
      position: { createdAt: "2026-07-17T12:34:56.789Z", id: "018f...-abc" },
    });
  });

  it("round-trips an unfiltered, include-deleted scope (type null)", () => {
    const scope: CursorScope = {
      workspaceId: "ws_beta",
      type: null,
      includeDeleted: true,
      deletedOnly: false,
    };
    const cursor = encodeCursor(scope, { createdAt: "t", id: "i" });
    expect(decodeCursor(cursor).scope).toEqual(scope);
  });

  it("round-trips a deleted-only scope", () => {
    const scope: CursorScope = {
      workspaceId: "ws_gamma",
      type: "note",
      includeDeleted: true,
      deletedOnly: true,
    };
    const cursor = encodeCursor(scope, { createdAt: "t", id: "i" });
    expect(decodeCursor(cursor).scope).toEqual(scope);
  });

  it("produces an opaque, url-safe string (no +, /, or = padding)", () => {
    const cursor = encodeCursor(SCOPE, {
      createdAt: "2026-07-17T12:34:56.789Z",
      id: "id-with-slashes/and+plus",
    });
    expect(cursor).not.toMatch(/[+/=]/);
    expect(decodeCursor(cursor).position.id).toBe("id-with-slashes/and+plus");
  });

  it("rejects an empty cursor", () => {
    expect(() => decodeCursor("")).toThrow(InvalidCursorError);
  });

  it("rejects non-base64 garbage", () => {
    expect(() => decodeCursor("!!!not base64!!!")).toThrow(InvalidCursorError);
  });

  it("rejects legacy FND-02 (unscoped) cursors", () => {
    // The FND-02 cursor was base64url of ["createdAt","id"] — wrong version and
    // shape, so it is rejected rather than silently reinterpreted.
    const legacy = btoa(JSON.stringify(["2026-07-17T00:00:00.000Z", "id_1"]))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(() => decodeCursor(legacy)).toThrow(InvalidCursorError);
  });

  it("rejects a cursor with the wrong version", () => {
    const wrongVersion = btoa(
      JSON.stringify([CURSOR_VERSION + 1, "ws", "widget", 0, 0, "t", "i"]),
    );
    expect(() => decodeCursor(wrongVersion)).toThrow(InvalidCursorError);
  });

  it("rejects cursors that decode to the wrong shape", () => {
    const wrongShapes = [
      btoa(JSON.stringify([CURSOR_VERSION, "ws", "widget", 0, 0, "t"])), // too short
      btoa(
        JSON.stringify([CURSOR_VERSION, "ws", "widget", 0, 0, "t", "i", "x"]),
      ), // too long
      btoa(JSON.stringify([CURSOR_VERSION, "", "widget", 0, 0, "t", "i"])), // empty ws
      btoa(JSON.stringify([CURSOR_VERSION, "ws", 5, 0, 0, "t", "i"])), // bad type
      btoa(JSON.stringify([CURSOR_VERSION, "ws", "widget", 2, 0, "t", "i"])), // bad includeDeleted flag
      btoa(JSON.stringify([CURSOR_VERSION, "ws", "widget", 0, 2, "t", "i"])), // bad deletedOnly flag
      btoa(JSON.stringify([CURSOR_VERSION, "ws", "widget", 0, 0, "", "i"])), // empty ts
      btoa(JSON.stringify([CURSOR_VERSION, "ws", "widget", 0, 0, "t", ""])), // empty id
      btoa(JSON.stringify({ version: CURSOR_VERSION })), // not an array
    ];
    for (const cursor of wrongShapes) {
      expect(() => decodeCursor(cursor)).toThrow(InvalidCursorError);
    }
  });

  it("rejects a legacy (v2, 6-element) cursor from before deletedOnly existed", () => {
    // NOTES-01C bumped CURSOR_VERSION 2 → 3 when `deletedOnly` was added to the
    // scope; a pre-NOTES-01C cursor decodes to the wrong shape/version and is
    // therefore rejected — same posture as the FND-02 → v2 bump.
    const legacyV2 = btoa(JSON.stringify([2, "ws", "widget", 0, "t", "i"]));
    expect(() => decodeCursor(legacyV2)).toThrow(InvalidCursorError);
  });
});

describe("cursorScopeMatches", () => {
  it("is true only for an exact scope match", () => {
    expect(cursorScopeMatches(SCOPE, { ...SCOPE })).toBe(true);
    expect(
      cursorScopeMatches(SCOPE, { ...SCOPE, workspaceId: "ws_beta" }),
    ).toBe(false);
    expect(cursorScopeMatches(SCOPE, { ...SCOPE, type: null })).toBe(false);
    expect(cursorScopeMatches(SCOPE, { ...SCOPE, includeDeleted: true })).toBe(
      false,
    );
    expect(cursorScopeMatches(SCOPE, { ...SCOPE, deletedOnly: true })).toBe(
      false,
    );
  });
});

describe("decodeCursorForScope", () => {
  it("returns the position when the scope matches", () => {
    const cursor = encodeCursor(SCOPE, { createdAt: "t", id: "i" });
    expect(decodeCursorForScope(cursor, SCOPE)).toEqual({
      createdAt: "t",
      id: "i",
    });
  });

  it("rejects a cursor issued for a different scope", () => {
    const cursor = encodeCursor(SCOPE, { createdAt: "t", id: "i" });
    expect(() =>
      decodeCursorForScope(cursor, { ...SCOPE, workspaceId: "ws_beta" }),
    ).toThrow(InvalidCursorError);
  });
});
