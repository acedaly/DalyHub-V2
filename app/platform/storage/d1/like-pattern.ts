/**
 * Shared D1 LIKE-pattern helpers.
 *
 * D1 rejects LIKE/GLOB patterns longer than 50 bytes with
 * `LIKE or GLOB pattern too complex`, failing the whole statement. Search inputs
 * are user-controlled, so every repository-backed search must bound and escape
 * the pattern before binding it.
 */

const MAX_LIKE_PATTERN_BYTES = 50;
const encoder = new TextEncoder();

function likeNeedle(value: string, wrappers: number): string {
  const maxBytes = Math.max(0, MAX_LIKE_PATTERN_BYTES - wrappers);
  let escaped = "";
  let bytes = 0;

  for (const point of value) {
    const next =
      point === "\\" || point === "%" || point === "_" ? `\\${point}` : point;
    const nextBytes = encoder.encode(next).byteLength;
    if (bytes + nextBytes > maxBytes) {
      break;
    }
    escaped += next;
    bytes += nextBytes;
  }

  return escaped;
}

export function likeContains(value: string): string {
  return `%${likeNeedle(value, 2)}%`;
}

export function likePrefix(value: string): string {
  return `${likeNeedle(value, 1)}%`;
}
