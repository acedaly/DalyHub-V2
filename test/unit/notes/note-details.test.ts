/**
 * NOTES-01A — Note-content validation: the thin re-typing wrapper around the
 * ONE shared FND-08 `parseMarkdownSource`. Pure, kernel-owned, dependency-free.
 * The size/control-character/byte-measurement rules themselves are FND-08's
 * and are proven there — this only proves the wrapper preserves them exactly,
 * never trims/normalises, and never echoes content in an error message.
 */

import { describe, expect, it } from "vitest";

import { MARKDOWN_SOURCE_MAX_BYTES } from "~/kernel/markdown";
import {
  NoteDetailsValidationError,
  validateNoteContent,
} from "~/kernel/notes";

describe("validateNoteContent", () => {
  it("accepts the empty string as valid, meaningful content", () => {
    expect(validateNoteContent("")).toBe("");
  });

  it("accepts CommonMark/GFM source unchanged", () => {
    const source = "# Title\n\n- a\n- b\n\n**bold** and _em_\n";
    expect(validateNoteContent(source)).toBe(source);
  });

  it("preserves leading/trailing whitespace exactly — no trimming", () => {
    const source = "   leading and trailing   \n\n";
    expect(validateNoteContent(source)).toBe(source);
  });

  it("preserves a whitespace-only source exactly, never normalising to empty", () => {
    const source = "   ";
    expect(validateNoteContent(source)).toBe(source);
  });

  it("preserves line endings exactly (CRLF, LF, mixed)", () => {
    const source = "line one\r\nline two\nline three\r\n";
    expect(validateNoteContent(source)).toBe(source);
  });

  it("preserves raw HTML present in the source (storage never strips it)", () => {
    const source = 'before <div class="x" onclick="evil()">raw</div> after';
    expect(validateNoteContent(source)).toBe(source);
  });

  it("rejects a disallowed control character honestly, without echoing content", () => {
    const secretContent = "top secret plans\u0000here";
    let error: unknown;
    try {
      validateNoteContent(secretContent);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(NoteDetailsValidationError);
    expect((error as Error).message).not.toContain("top secret");
    expect((error as Error).message).not.toContain("here");
  });

  it("enforces the shared 1 MiB UTF-8 byte limit", () => {
    const tooLarge = "a".repeat(MARKDOWN_SOURCE_MAX_BYTES + 1);
    expect(() => validateNoteContent(tooLarge)).toThrow(
      NoteDetailsValidationError,
    );
  });

  it("accepts content up to the exact byte limit", () => {
    const atMax = "a".repeat(MARKDOWN_SOURCE_MAX_BYTES);
    expect(validateNoteContent(atMax)).toBe(atMax);
  });

  it("rejects a non-string value", () => {
    expect(() => validateNoteContent(42)).toThrow(NoteDetailsValidationError);
    expect(() => validateNoteContent(null)).toThrow(NoteDetailsValidationError);
    expect(() => validateNoteContent(undefined)).toThrow(
      NoteDetailsValidationError,
    );
  });
});
