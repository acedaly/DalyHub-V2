import { describe, expect, it } from "vitest";

import {
  MAX_NOTE_TAGS,
  MAX_NOTE_TAG_LENGTH,
  NoteDetailsValidationError,
  decodeNoteCursor,
  decodeNoteCursorForScope,
  encodeNoteCursor,
  InvalidNoteCursorError,
  noteCursorScope,
  normaliseNoteQuery,
  normaliseNoteTag,
  parseNoteTagInput,
  validateNoteTags,
} from "~/kernel/notes";

/**
 * NOTES-03 — the pure organisation rules: tag normalisation (so a tag filter can
 * never miss a case variant, and a note can never carry the "same" tag twice)
 * and the collection cursor's scope binding (so a page boundary computed for one
 * filter set is REJECTED under another rather than silently skipping notes).
 */
describe("note tags", () => {
  it("normalises case, surrounding and internal whitespace", () => {
    expect(normaliseNoteTag("  Deep   Work ")).toBe("deep work");
  });

  it("de-duplicates case variants and sorts, so an unchanged set is byte-identical", () => {
    expect(
      validateNoteTags(["Reading", "reading", "  READING  ", "atlas"]),
    ).toEqual(["atlas", "reading"]);
    expect(JSON.stringify(validateNoteTags(["b", "a"]))).toBe(
      JSON.stringify(validateNoteTags(["a", "b"])),
    );
  });

  it("drops blank entries rather than storing empty tags", () => {
    expect(validateNoteTags(["", "  ", "kept"])).toEqual(["kept"]);
  });

  it("treats no tags and an absent value alike", () => {
    expect(validateNoteTags(undefined)).toEqual([]);
    expect(validateNoteTags(null)).toEqual([]);
    expect(validateNoteTags([])).toEqual([]);
  });

  it("rejects a non-list and a non-string entry", () => {
    expect(() => validateNoteTags("nope")).toThrow(NoteDetailsValidationError);
    expect(() => validateNoteTags([1])).toThrow(NoteDetailsValidationError);
  });

  it("bounds the tag count and each tag's length", () => {
    const tooMany = Array.from(
      { length: MAX_NOTE_TAGS + 1 },
      (_, i) => `t${i}`,
    );
    expect(() => validateNoteTags(tooMany)).toThrow(NoteDetailsValidationError);
    expect(() =>
      validateNoteTags(["x".repeat(MAX_NOTE_TAG_LENGTH + 1)]),
    ).toThrow(NoteDetailsValidationError);
  });

  it("parses both wire forms — the JSON array the shared TagsField posts, and a comma list", () => {
    expect(parseNoteTagInput('["Alpha","beta"]')).toEqual(["alpha", "beta"]);
    expect(parseNoteTagInput("Alpha, beta ,alpha")).toEqual(["alpha", "beta"]);
    expect(parseNoteTagInput("")).toEqual([]);
  });

  it("rejects malformed JSON rather than silently dropping the tags", () => {
    expect(() => parseNoteTagInput("[not json")).toThrow(
      NoteDetailsValidationError,
    );
  });
});

describe("note collection cursor", () => {
  const base = noteCursorScope("ws1", {
    state: "active",
    query: null,
    tag: null,
    projectId: null,
    areaId: null,
    links: "all",
    sort: "created",
  });
  const position = { sortValue: "2026-07-01T00:00:00.000Z", id: "n1" };

  it("round-trips its scope and position", () => {
    const decoded = decodeNoteCursor(encodeNoteCursor(base, position));
    expect(decoded.scope).toEqual(base);
    expect(decoded.position).toEqual(position);
  });

  it("accepts a cursor under the SAME scope", () => {
    expect(
      decodeNoteCursorForScope(encodeNoteCursor(base, position), base),
    ).toEqual(position);
  });

  it.each([
    ["workspace", { ...base, workspaceId: "ws2" }],
    ["state", { ...base, state: "archived" as const }],
    ["query", { ...base, query: "atlas" }],
    ["tag", { ...base, tag: "reading" }],
    ["project", { ...base, projectId: "p1" }],
    ["area", { ...base, areaId: "a1" }],
    ["link filter", { ...base, links: "unlinked" as const }],
    ["sort order", { ...base, sort: "recent" as const }],
  ])("rejects a cursor issued under a different %s", (_label, other) => {
    const cursor = encodeNoteCursor(base, position);
    expect(() => decodeNoteCursorForScope(cursor, other)).toThrow(
      InvalidNoteCursorError,
    );
  });

  it("rejects a malformed, empty or tampered cursor rather than repairing it", () => {
    expect(() => decodeNoteCursor("")).toThrow(InvalidNoteCursorError);
    expect(() => decodeNoteCursor("not-a-cursor")).toThrow(
      InvalidNoteCursorError,
    );
    const tampered = `${encodeNoteCursor(base, position).slice(0, -3)}zzz`;
    expect(() => decodeNoteCursor(tampered)).toThrow(InvalidNoteCursorError);
  });
});

describe("note query normalisation", () => {
  it("collapses whitespace and treats blank input as no query", () => {
    expect(normaliseNoteQuery("  deep   work ")).toBe("deep work");
    expect(normaliseNoteQuery("   ")).toBeNull();
    expect(normaliseNoteQuery(undefined)).toBeNull();
  });
});
