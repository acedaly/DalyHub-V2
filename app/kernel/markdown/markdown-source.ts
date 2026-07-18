/**
 * FND-08 Markdown kernel — the durable Markdown source contract.
 *
 * Markdown is the DURABLE, user-owned representation of long-form text
 * (ADR-006, ADR-015). This module defines `MarkdownSource`: a branded string
 * that has passed boundary validation. Future Notes, Diary and entity
 * descriptions store, export and diff exactly this value — rendered HTML is
 * derived, disposable output and is never persisted.
 *
 * Validation is deliberately MINIMAL and NON-DESTRUCTIVE: it accepts or rejects,
 * it never rewrites. The accepted source is preserved byte-for-byte — not
 * trimmed, not whitespace-normalised, not reflowed — so what the user wrote is
 * what is stored and what comes back out on export. The only things rejected are
 * inputs that are not text at all, and control characters that have no place in
 * stored text and are a common vector for smuggling (NUL, C0 controls other than
 * tab and normal line endings, and DEL).
 */

import {
  MarkdownSourceTooLargeError,
  MarkdownValidationError,
} from "./markdown-errors";

declare const markdownSourceBrand: unique symbol;

/**
 * A validated Markdown source string. A plain `string` cannot be used where a
 * `MarkdownSource` is required — a value only becomes one by passing
 * {@link parseMarkdownSource}. This makes "did this text pass validation?"
 * checkable by the type system, and guarantees the renderer only ever receives
 * bounded, control-character-free input.
 */
export type MarkdownSource = string & { readonly [markdownSourceBrand]: true };

/**
 * The documented maximum size of a single Markdown source, in UTF-8 bytes.
 *
 * 1 MiB is already far larger than any ordinary note or diary entry, while
 * placing a firm upper bound on parser CPU and memory (a denial-of-service
 * guard, AGENTS.md §16–17). The limit is measured in UTF-8 BYTES, not
 * JavaScript UTF-16 code units, so a document full of multi-byte characters is
 * bounded by what is actually stored and transmitted, not by code-unit count.
 */
export const MARKDOWN_SOURCE_MAX_BYTES = 1024 * 1024;

/**
 * Control characters that are rejected in stored Markdown source. This is every
 * C0 control character EXCEPT tab (U+0009), line feed (U+000A) and carriage
 * return (U+000D) — the whitespace that legitimately appears in text — plus DEL
 * (U+007F). Rejecting these keeps stored text clean and removes a class of
 * smuggling/obfuscation vectors before content ever reaches the parser.
 */
const DISALLOWED_CONTROL_CHARACTERS =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

const utf8Encoder = new TextEncoder();

/** Measure a string's size in UTF-8 bytes (how it is actually stored). */
export function markdownSourceByteLength(value: string): number {
  return utf8Encoder.encode(value).length;
}

/**
 * Validate an untrusted value as a `MarkdownSource`.
 *
 * - accepts strings only (anything else is a caller/boundary error);
 * - allows the empty string;
 * - preserves the exact accepted source — it is NOT trimmed or normalised;
 * - rejects NUL and other disallowed control characters (tabs and normal line
 *   endings are allowed);
 * - enforces {@link MARKDOWN_SOURCE_MAX_BYTES}, measured in UTF-8 bytes.
 *
 * Throws {@link MarkdownValidationError} or {@link MarkdownSourceTooLargeError}.
 * Error messages never include the source content.
 */
export function parseMarkdownSource(value: unknown): MarkdownSource {
  if (typeof value !== "string") {
    throw new MarkdownValidationError("source", "must be a string");
  }

  // Size is checked before the control-character scan so an oversized input is
  // rejected without scanning all of it (bounds worst-case CPU).
  const byteLength = markdownSourceByteLength(value);
  if (byteLength > MARKDOWN_SOURCE_MAX_BYTES) {
    throw new MarkdownSourceTooLargeError(
      MARKDOWN_SOURCE_MAX_BYTES,
      byteLength,
    );
  }

  const match = DISALLOWED_CONTROL_CHARACTERS.exec(value);
  if (match) {
    const codePoint = match[0].codePointAt(0) ?? 0;
    const hex = codePoint.toString(16).toUpperCase().padStart(4, "0");
    throw new MarkdownValidationError(
      "controlCharacter",
      `control character U+${hex} is not allowed`,
    );
  }

  return value as MarkdownSource;
}

/**
 * Type guard: does an unknown value satisfy the `MarkdownSource` contract? Uses
 * the same rules as {@link parseMarkdownSource} but reports a boolean instead of
 * throwing. Prefer `parseMarkdownSource` when you need the typed value or a
 * descriptive error.
 */
export function isMarkdownSource(value: unknown): value is MarkdownSource {
  try {
    parseMarkdownSource(value);
    return true;
  } catch {
    return false;
  }
}
