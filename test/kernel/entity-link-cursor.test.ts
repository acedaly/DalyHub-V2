import { describe, expect, it } from "vitest";

import { InvalidEntityLinkCursorError } from "~/kernel/entity-links";
import {
  decodeEntityLinkCursor,
  decodeEntityLinkCursorForScope,
  encodeEntityLinkCursor,
  type EntityLinkCursorScope,
} from "~/kernel/entity-links/entity-link-cursor";

const SCOPE: EntityLinkCursorScope = {
  workspaceId: "ws_alpha",
  anchorEntityId: "anchor_1",
  direction: "outgoing",
  type: "task.relates_to",
};
const POSITION = { createdAt: "2026-07-17T00:00:01.000Z", id: "lnk_0001" };

describe("EntityLink cursor (pure)", () => {
  it("round-trips scope and position", () => {
    const cursor = encodeEntityLinkCursor(SCOPE, POSITION);
    const decoded = decodeEntityLinkCursor(cursor);
    expect(decoded.scope).toEqual(SCOPE);
    expect(decoded.position).toEqual(POSITION);
  });

  it("carries a null type filter through the round-trip", () => {
    const scope: EntityLinkCursorScope = { ...SCOPE, type: null };
    const cursor = encodeEntityLinkCursor(scope, POSITION);
    expect(decodeEntityLinkCursor(cursor).scope.type).toBeNull();
  });

  it("returns the position when the expected scope matches exactly", () => {
    const cursor = encodeEntityLinkCursor(SCOPE, POSITION);
    expect(decodeEntityLinkCursorForScope(cursor, SCOPE)).toEqual(POSITION);
  });

  it("rejects a mismatch on any scope field", () => {
    const cursor = encodeEntityLinkCursor(SCOPE, POSITION);
    for (const overriden of [
      { ...SCOPE, workspaceId: "ws_other" },
      { ...SCOPE, anchorEntityId: "anchor_2" },
      { ...SCOPE, direction: "incoming" as const },
      { ...SCOPE, direction: "both" as const },
      { ...SCOPE, type: null },
      { ...SCOPE, type: "task.other" },
    ]) {
      expect(() => decodeEntityLinkCursorForScope(cursor, overriden)).toThrow(
        InvalidEntityLinkCursorError,
      );
    }
  });

  it("rejects malformed base64, non-JSON, and wrong-arity payloads", () => {
    expect(() => decodeEntityLinkCursor("")).toThrow(
      InvalidEntityLinkCursorError,
    );
    expect(() => decodeEntityLinkCursor("!!!not-base64!!!")).toThrow(
      InvalidEntityLinkCursorError,
    );
    const wrongArity = btoa(JSON.stringify([1, "ws", "anchor"]))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(() => decodeEntityLinkCursor(wrongArity)).toThrow(
      InvalidEntityLinkCursorError,
    );
  });

  it("rejects a different cursor version and an unknown direction value", () => {
    const wrongVersion = btoa(
      JSON.stringify([
        99,
        SCOPE.workspaceId,
        SCOPE.anchorEntityId,
        SCOPE.direction,
        SCOPE.type,
        POSITION.createdAt,
        POSITION.id,
      ]),
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(() => decodeEntityLinkCursor(wrongVersion)).toThrow(
      InvalidEntityLinkCursorError,
    );

    const badDirection = btoa(
      JSON.stringify([
        1,
        SCOPE.workspaceId,
        SCOPE.anchorEntityId,
        "sideways",
        SCOPE.type,
        POSITION.createdAt,
        POSITION.id,
      ]),
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(() => decodeEntityLinkCursor(badDirection)).toThrow(
      InvalidEntityLinkCursorError,
    );
  });
});
