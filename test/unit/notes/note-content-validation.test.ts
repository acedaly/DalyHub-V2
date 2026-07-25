import { describe, expect, it } from "vitest";

import { MARKDOWN_SOURCE_MAX_BYTES } from "~/kernel/markdown";
import { validateNoteContentSize } from "~/modules/notes/note-content-validation";

/**
 * NOTES-01C — the client-side Note content size check: a pure re-use of the
 * ONE shared FND-08 byte-length measurement and limit, giving immediate
 * feedback for an oversized document before autosave even attempts a save.
 */

describe("validateNoteContentSize", () => {
  it("accepts empty content", () => {
    expect(validateNoteContentSize("")).toEqual({ ok: true });
  });

  it("accepts content exactly at the byte limit", () => {
    const atLimit = "a".repeat(MARKDOWN_SOURCE_MAX_BYTES);
    expect(validateNoteContentSize(atLimit)).toEqual({ ok: true });
  });

  it("rejects content one byte over the limit, with a specific message", () => {
    const overLimit = "a".repeat(MARKDOWN_SOURCE_MAX_BYTES + 1);
    const outcome = validateNoteContentSize(overLimit);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.message).toMatch(/Too large to save/);
      expect(outcome.message).toContain(
        MARKDOWN_SOURCE_MAX_BYTES.toLocaleString(),
      );
    }
  });

  it("measures UTF-8 byte length, not UTF-16 code units (multi-byte characters count more)", () => {
    // Each "😀" is 4 UTF-8 bytes but 2 UTF-16 code units — a content string
    // whose CODE-UNIT length is under the limit can still be byte-over.
    const emoji = "😀".repeat(Math.ceil(MARKDOWN_SOURCE_MAX_BYTES / 4) + 1);
    const outcome = validateNoteContentSize(emoji);
    expect(outcome.ok).toBe(false);
  });
});
