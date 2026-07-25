/**
 * NOTES-01C — client-side Note content size validation.
 *
 * A thin, pure re-use of the ONE shared FND-08 byte-length measurement
 * (`markdownSourceByteLength`) and limit (`MARKDOWN_SOURCE_MAX_BYTES`) — no
 * second parser, no duplicated limit. This lets the autosave coordinator
 * refuse to even ATTEMPT a save of oversized content (immediate, specific
 * feedback) instead of always waiting on a round trip to learn the same thing
 * from the server's authoritative `parseMarkdownSource` check, which remains
 * the real boundary (this client check is a courtesy, never a second source of
 * truth).
 */

import {
  MARKDOWN_SOURCE_MAX_BYTES,
  markdownSourceByteLength,
} from "~/kernel/markdown";
import type { ValidationOutcome } from "~/shared/forms/model";

/** Validate a Note's Markdown source is within the shared size limit. */
export function validateNoteContentSize(value: string): ValidationOutcome {
  const byteLength = markdownSourceByteLength(value);
  if (byteLength > MARKDOWN_SOURCE_MAX_BYTES) {
    return {
      ok: false,
      message: `Too large to save — ${byteLength.toLocaleString()} of ${MARKDOWN_SOURCE_MAX_BYTES.toLocaleString()} bytes allowed. Trim some content.`,
    };
  }
  return { ok: true };
}
