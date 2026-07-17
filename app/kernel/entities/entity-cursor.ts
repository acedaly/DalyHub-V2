/**
 * FND-02 Data kernel — pagination cursors.
 *
 * List results are paginated with an opaque, stable cursor rather than an
 * unbounded offset. A cursor captures the ordering key of the last row returned
 * — the `(createdAt, id)` tuple — so the next page can resume exactly after it.
 * `id` is the tiebreaker that makes ordering total and therefore deterministic:
 * pages never duplicate or skip records even when two entities share a
 * `createdAt`.
 *
 * The encoding is base64url over a small JSON object. It is opaque to callers
 * but intentionally simple and dependency-free. Decoding validates the shape
 * and rejects anything malformed as `InvalidCursorError`.
 */

import { InvalidCursorError } from "./entity-errors";

/** The ordering position a cursor points just after. */
export type CursorPosition = {
  /** ISO-8601 UTC timestamp of the last returned row's `createdAt`. */
  readonly createdAt: string;
  /** Id of the last returned row (the tiebreaker). */
  readonly id: string;
};

/** Encode a base64url string with no padding (URL/JSON-safe, ASCII payload). */
function toBase64Url(ascii: string): string {
  return btoa(ascii).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Decode a base64url string produced by {@link toBase64Url}. */
function fromBase64Url(value: string): string {
  const normalised = value.replace(/-/g, "+").replace(/_/g, "/");
  // atob tolerates missing padding in practice, but restore it for correctness.
  const padded = normalised.padEnd(
    normalised.length + ((4 - (normalised.length % 4)) % 4),
    "=",
  );
  return atob(padded);
}

/** Encode an ordering position into an opaque cursor string. */
export function encodeCursor(position: CursorPosition): string {
  return toBase64Url(JSON.stringify([position.createdAt, position.id]));
}

/**
 * Decode an opaque cursor back into an ordering position, validating its shape.
 * Throws `InvalidCursorError` for anything that was not produced by
 * {@link encodeCursor}.
 */
export function decodeCursor(cursor: string): CursorPosition {
  if (typeof cursor !== "string" || cursor.length === 0) {
    throw new InvalidCursorError();
  }

  let decoded: string;
  try {
    decoded = fromBase64Url(cursor);
  } catch {
    throw new InvalidCursorError();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    throw new InvalidCursorError();
  }

  if (
    !Array.isArray(parsed) ||
    parsed.length !== 2 ||
    typeof parsed[0] !== "string" ||
    typeof parsed[1] !== "string" ||
    parsed[0].length === 0 ||
    parsed[1].length === 0
  ) {
    throw new InvalidCursorError();
  }

  return { createdAt: parsed[0], id: parsed[1] };
}
