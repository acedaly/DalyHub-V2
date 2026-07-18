import { describe, expect, it } from "vitest";

import {
  ACTIVITY_CURSOR_VERSION,
  InvalidActivityCursorError,
  decodeActivityCursor,
  decodeActivityCursorForScope,
  encodeActivityCursor,
  type ActivityCursorScope,
} from "~/kernel/activity";

// FND-05: the dedicated, versioned Activity cursor is bound to its query scope
// (workspace + scope kind + anchor entity + type filter) and treats its contents
// as untrusted input (ADR-012).

const WS_SCOPE: ActivityCursorScope = {
  workspaceId: "ws_a",
  scope: "workspace",
  entityId: null,
  type: null,
};
const ENTITY_SCOPE: ActivityCursorScope = {
  workspaceId: "ws_a",
  scope: "entity",
  entityId: "e1",
  type: null,
};
const POS = { occurredAt: "2026-07-18T00:00:00.000Z", id: "act_1" };

/** Encode a JSON array as base64url, bypassing the cursor helper, to forge
 * malformed/foreign cursors. */
function forge(value: unknown): string {
  const json = JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

describe("Activity cursor scope binding", () => {
  it("round-trips a workspace-scoped cursor", () => {
    const cursor = encodeActivityCursor(WS_SCOPE, POS);
    expect(decodeActivityCursorForScope(cursor, WS_SCOPE)).toEqual(POS);
  });

  it("round-trips an entity-scoped cursor", () => {
    const cursor = encodeActivityCursor(ENTITY_SCOPE, POS);
    expect(decodeActivityCursorForScope(cursor, ENTITY_SCOPE)).toEqual(POS);
  });

  it("rejects a workspace cursor replayed on an entity Timeline", () => {
    const cursor = encodeActivityCursor(WS_SCOPE, POS);
    expect(() => decodeActivityCursorForScope(cursor, ENTITY_SCOPE)).toThrow(
      InvalidActivityCursorError,
    );
  });

  it("rejects an entity cursor replayed on the workspace feed", () => {
    const cursor = encodeActivityCursor(ENTITY_SCOPE, POS);
    expect(() => decodeActivityCursorForScope(cursor, WS_SCOPE)).toThrow(
      InvalidActivityCursorError,
    );
  });

  it("rejects an entity-A cursor for entity B", () => {
    const cursor = encodeActivityCursor(ENTITY_SCOPE, POS);
    expect(() =>
      decodeActivityCursorForScope(cursor, {
        ...ENTITY_SCOPE,
        entityId: "e2",
      }),
    ).toThrow(InvalidActivityCursorError);
  });

  it("rejects a cursor from another workspace", () => {
    const cursor = encodeActivityCursor(WS_SCOPE, POS);
    expect(() =>
      decodeActivityCursorForScope(cursor, {
        ...WS_SCOPE,
        workspaceId: "ws_b",
      }),
    ).toThrow(InvalidActivityCursorError);
  });

  it("rejects a filtered cursor reused under a different or absent filter", () => {
    const filtered: ActivityCursorScope = {
      ...WS_SCOPE,
      type: "entity.created",
    };
    const cursor = encodeActivityCursor(filtered, POS);
    expect(() => decodeActivityCursorForScope(cursor, WS_SCOPE)).toThrow(
      InvalidActivityCursorError,
    );
    expect(() =>
      decodeActivityCursorForScope(cursor, {
        ...WS_SCOPE,
        type: "entity.updated",
      }),
    ).toThrow(InvalidActivityCursorError);
  });

  it("round-trips Unicode scope values", () => {
    const scope: ActivityCursorScope = {
      workspaceId: "个人",
      scope: "entity",
      entityId: "实体-①",
      type: null,
    };
    const cursor = encodeActivityCursor(scope, POS);
    expect(decodeActivityCursorForScope(cursor, scope)).toEqual(POS);
  });
});

describe("Activity cursor rejects untrusted/malformed input", () => {
  it("rejects an empty or non-string cursor", () => {
    expect(() => decodeActivityCursor("")).toThrow(InvalidActivityCursorError);
  });

  it("rejects malformed base64url", () => {
    expect(() => decodeActivityCursor("%%%not-base64%%%")).toThrow(
      InvalidActivityCursorError,
    );
  });

  it("rejects valid base64 that is not JSON", () => {
    const notJson = btoa("definitely not json {")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(() => decodeActivityCursor(notJson)).toThrow(
      InvalidActivityCursorError,
    );
  });

  it("rejects malformed UTF-8 bytes with a fatal decoder", () => {
    // 0xFF is never a valid UTF-8 lead byte.
    const badUtf8 = btoa(String.fromCharCode(0xff, 0xfe, 0xfd))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(() => decodeActivityCursor(badUtf8)).toThrow(
      InvalidActivityCursorError,
    );
  });

  it("rejects a wrong version or shape", () => {
    // Correct 7-field shape but wrong version.
    expect(() =>
      decodeActivityCursor(
        forge([
          ACTIVITY_CURSOR_VERSION + 1,
          "ws_a",
          "workspace",
          null,
          null,
          POS.occurredAt,
          POS.id,
        ]),
      ),
    ).toThrow(InvalidActivityCursorError);
    // Wrong arity (an entity-kernel-shaped cursor).
    expect(() =>
      decodeActivityCursor(forge([2, "ws_a", null, 0, POS.occurredAt, POS.id])),
    ).toThrow(InvalidActivityCursorError);
  });

  it("rejects an entity scope missing its entity id, and a workspace scope carrying one", () => {
    expect(() =>
      decodeActivityCursor(
        forge([
          ACTIVITY_CURSOR_VERSION,
          "ws_a",
          "entity",
          null,
          null,
          POS.occurredAt,
          POS.id,
        ]),
      ),
    ).toThrow(InvalidActivityCursorError);
    expect(() =>
      decodeActivityCursor(
        forge([
          ACTIVITY_CURSOR_VERSION,
          "ws_a",
          "workspace",
          "e1",
          null,
          POS.occurredAt,
          POS.id,
        ]),
      ),
    ).toThrow(InvalidActivityCursorError);
  });
});
