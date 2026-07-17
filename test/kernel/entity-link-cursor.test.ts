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

  it("round-trips non-Latin-1 (Unicode) workspace and anchor ids", () => {
    // Workspace/entity ids are validated only as non-empty bounded strings, so a
    // Unicode id can legitimately reach the cursor. base64url must encode via
    // UTF-8 so `btoa` does not throw and the value round-trips exactly.
    const scope: EntityLinkCursorScope = {
      ...SCOPE,
      workspaceId: "个人",
      anchorEntityId: "café–entity–😀",
    };
    const cursor = encodeEntityLinkCursor(scope, POSITION);
    const decoded = decodeEntityLinkCursor(cursor);
    expect(decoded.scope.workspaceId).toBe("个人");
    expect(decoded.scope.anchorEntityId).toBe("café–entity–😀");
    expect(decodeEntityLinkCursorForScope(cursor, scope)).toEqual(POSITION);
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

  it("rejects malformed UTF-8 bytes instead of substituting U+FFFD", () => {
    // Build base64url whose bytes would be a VALID 7-element JSON cursor if the
    // invalid byte were leniently replaced by U+FFFD (so JSON.parse alone would
    // NOT catch it). A fatal UTF-8 decoder must reject it outright.
    const enc = new TextEncoder();
    const prefix = enc.encode('[1,"');
    const suffix = enc.encode(
      '","anchor","outgoing",null,"2026-07-17T00:00:01.000Z","lnk_0001"]',
    );
    // 0xFF is never valid in UTF-8; it sits inside the workspaceId string.
    const bytes = new Uint8Array([...prefix, 0xff, ...suffix]);
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    const cursor = btoa(binary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    // Sanity check the construction: leniently decoded it IS syntactically valid
    // JSON of the right shape (proving only the fatal decoder rejects it).
    const lenient = new TextDecoder("utf-8").decode(bytes);
    const parsed = JSON.parse(lenient);
    expect(Array.isArray(parsed) && parsed.length === 7).toBe(true);

    expect(() => decodeEntityLinkCursor(cursor)).toThrow(
      InvalidEntityLinkCursorError,
    );
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
