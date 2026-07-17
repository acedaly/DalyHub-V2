import { describe, expect, it } from "vitest";

import { InvalidCursorError } from "~/kernel/entities/entity-errors";
import {
  decodeCursor,
  encodeCursor,
  type CursorPosition,
} from "~/kernel/entities/entity-cursor";

describe("cursor encode/decode", () => {
  it("round-trips a position", () => {
    const position: CursorPosition = {
      createdAt: "2026-07-17T12:34:56.789Z",
      id: "018f...-abc",
    };
    const cursor = encodeCursor(position);
    expect(decodeCursor(cursor)).toEqual(position);
  });

  it("produces an opaque, url-safe string (no +, /, or = padding)", () => {
    const cursor = encodeCursor({
      createdAt: "2026-07-17T12:34:56.789Z",
      id: "id-with-slashes/and+plus",
    });
    expect(cursor).not.toMatch(/[+/=]/);
    // Still decodes correctly despite awkward payload characters.
    expect(decodeCursor(cursor).id).toBe("id-with-slashes/and+plus");
  });

  it("rejects an empty cursor", () => {
    expect(() => decodeCursor("")).toThrow(InvalidCursorError);
  });

  it("rejects non-base64 garbage", () => {
    expect(() => decodeCursor("!!!not base64!!!")).toThrow(InvalidCursorError);
  });

  it("rejects a cursor that decodes to the wrong shape", () => {
    const wrongShapes = [
      btoa(JSON.stringify({ createdAt: "x", id: "y" })),
      btoa(JSON.stringify(["only-one"])),
      btoa(JSON.stringify(["a", "b", "c"])),
      btoa(JSON.stringify(["", "id"])),
      btoa(JSON.stringify(["ts", ""])),
      btoa(JSON.stringify("a string")),
      btoa("42"),
    ];
    for (const cursor of wrongShapes) {
      expect(() => decodeCursor(cursor)).toThrow(InvalidCursorError);
    }
  });
});
