/**
 * V2.11 FILE-00 — filenames: what is stored, what reaches a header, and what
 * reaches a path.
 *
 * A filename is the one owner-authored string an attachment carries, and it
 * reaches three places that each have a different hazard:
 *
 *   | Destination | Hazard | Rule |
 *   | --- | --- | --- |
 *   | the database | a name that is a path, or is unbounded | {@link validateAttachmentFilename} |
 *   | `Content-Disposition` | header injection, quote breaking | {@link contentDispositionHeader} |
 *   | an archive or vault path | traversal, collision, reserved names | the vault's own `safeVaultStem`, reused |
 *
 * **The object key is not on that list**, and that is the point: it is built from
 * two application-generated identifiers and carries nothing a person wrote, so a
 * filename cannot influence where a byte is stored no matter what it says
 * (ADR-119 decision 4).
 *
 * The stored name is the owner's, as close to verbatim as safety allows. It is
 * not slugged, not transliterated and not lowercased: `Rego renewal — Hilux.pdf`
 * comes back exactly like that. Only the characters that cannot survive the
 * destinations above are refused, and they are refused at the boundary rather
 * than silently rewritten, because a silent rewrite is a file the owner cannot
 * find again by name.
 */

import { AttachmentValidationError } from "./attachment-errors";
import { MAX_ATTACHMENT_FILENAME_LENGTH } from "./attachment-limits";

/*
 * Characters a stored filename may never contain.
 *
 *   - `/` and `\`  — a name can never introduce a path segment, anywhere.
 *   - C0/C1 controls, including CR and LF — the header-injection vector, and
 *     unrepresentable in a filesystem name.
 *   - U+2028/U+2029 — line separators that some parsers treat as newlines.
 */
// eslint-disable-next-line no-control-regex -- the point of the class is control characters.
const FORBIDDEN = /[/\\\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

/**
 * Validate and normalise an owner-supplied filename.
 *
 * Returns the name to store. Throws {@link AttachmentValidationError} with a
 * sentence the owner can act on for anything it will not accept.
 *
 * Normalisation is deliberately minimal: Unicode NFC (so a macOS-decomposed name
 * and a Linux-composed one are the same name, exactly as the vault's own
 * filename rules already require) and outer whitespace trimmed. Nothing else is
 * changed.
 */
export function validateAttachmentFilename(value: unknown): string {
  if (typeof value !== "string") {
    throw new AttachmentValidationError("filename", "That file has no name.");
  }
  const normalised = value.normalize("NFC").trim();
  if (normalised.length === 0) {
    throw new AttachmentValidationError("filename", "That file has no name.");
  }
  if (normalised.length > MAX_ATTACHMENT_FILENAME_LENGTH) {
    throw new AttachmentValidationError(
      "filename",
      `That file’s name is longer than ${MAX_ATTACHMENT_FILENAME_LENGTH} characters. Rename it and try again.`,
    );
  }
  if (FORBIDDEN.test(normalised)) {
    throw new AttachmentValidationError(
      "filename",
      "That file’s name contains characters DalyHub can’t store — a slash, a backslash or a line break. Rename it and try again.",
    );
  }
  /*
   * `.` and `..` are legal filenames on no filesystem and are traversal segments
   * on every one. They cannot reach a path here — the object key ignores the
   * name entirely — but an archive and a vault DO derive a path from it, and
   * refusing at the boundary is one rule instead of two sanitisers.
   */
  if (normalised === "." || normalised === "..") {
    throw new AttachmentValidationError(
      "filename",
      "That file’s name can’t be used. Rename it and try again.",
    );
  }
  return normalised;
}

/**
 * Fold a filename to a conservative ASCII form for the quoted half of a
 * `Content-Disposition` header.
 *
 * Everything outside printable ASCII becomes `_`, and the quote and backslash go
 * with it. The result can therefore never terminate the quoted string early,
 * never inject a header, and never carry a byte a legacy user agent will
 * misparse. The REAL name travels in `filename*` beside it, RFC 5987-encoded, so
 * every modern browser still saves the file under the owner's own name.
 *
 * Total: it never throws and always returns at least one character.
 */
export function asciiFilenameFallback(filename: string): string {
  let folded = "";
  for (const character of filename) {
    const code = character.codePointAt(0) ?? 0;
    folded +=
      code >= 0x20 && code <= 0x7e && character !== '"' && character !== "\\"
        ? character
        : "_";
  }
  const trimmed = folded.trim();
  return trimmed.length > 0 ? trimmed : "attachment";
}

/**
 * Percent-encode a filename for the `filename*` parameter (RFC 5987).
 *
 * `encodeURIComponent` leaves `!'()*` unescaped and they are not `attr-char`, so
 * they are encoded explicitly rather than left to be interpreted by whatever
 * parses the header.
 */
export function rfc5987Encode(filename: string): string {
  return encodeURIComponent(filename).replace(
    /['()!*]/g,
    (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`,
  );
}

/**
 * Build the whole `Content-Disposition` header value.
 *
 * `disposition` is decided by the ROUTE from the media type's own policy, never
 * by anything the client sends: `attachment` for everything except the raster
 * images the preview route serves.
 */
export function contentDispositionHeader(
  disposition: "attachment" | "inline",
  filename: string,
): string {
  return (
    `${disposition}; filename="${asciiFilenameFallback(filename)}"; ` +
    `filename*=UTF-8''${rfc5987Encode(filename)}`
  );
}
