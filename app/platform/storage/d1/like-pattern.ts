/**
 * Shared D1 LIKE-pattern helpers.
 *
 * D1 rejects LIKE/GLOB patterns longer than 50 bytes with
 * `LIKE or GLOB pattern too complex`, failing the whole statement. Search inputs
 * are user-controlled, so every repository-backed search must bound and escape
 * the pattern before binding it. A long query therefore DEGRADES to matching its
 * opening characters rather than erroring.
 *
 * **That degradation has a consequence RECALL-01 had to make explicit.** A
 * bounded pattern matches on a PREFIX of what the owner typed, so anything else
 * in the same statement that reasons about the query — an `instr()` excerpt
 * window, a JavaScript `includes()` deciding the match source — must use the
 * SAME bounded text. Binding the full query to `instr()` beside a bounded `LIKE`
 * makes the two disagree: the row is admitted by the prefix and then reported as
 * having no body hit, so a body match is mislabelled as a title match with no
 * excerpt. {@link likeContainsNeedle} exists so there is one bounded needle per
 * query, and the disagreement is unrepresentable.
 */

const MAX_LIKE_PATTERN_BYTES = 50;
const encoder = new TextEncoder();

/**
 * The prefix of `value` that fits the pattern budget, in both forms: `escaped`
 * for the LIKE pattern, and `raw` — the same code points, unescaped — for
 * `instr()`, `includes()` and the excerpt analyser.
 *
 * The budget is spent on the ESCAPED bytes (a literal `%` costs two), so the two
 * forms must be derived together in one pass; deriving them separately would put
 * the cut in a different place for a query containing a wildcard or a backslash.
 */
function boundedNeedle(
  value: string,
  wrappers: number,
): { readonly raw: string; readonly escaped: string } {
  const maxBytes = Math.max(0, MAX_LIKE_PATTERN_BYTES - wrappers);
  let escaped = "";
  let raw = "";
  let bytes = 0;

  for (const point of value) {
    const next =
      point === "\\" || point === "%" || point === "_" ? `\\${point}` : point;
    const nextBytes = encoder.encode(next).byteLength;
    if (bytes + nextBytes > maxBytes) {
      break;
    }
    escaped += next;
    raw += point;
    bytes += nextBytes;
  }

  return { raw, escaped };
}

export function likeContains(value: string): string {
  return `%${boundedNeedle(value, 2).escaped}%`;
}

export function likePrefix(value: string): string {
  return `${boundedNeedle(value, 1).escaped}%`;
}

/**
 * The RAW text a {@link likeContains} pattern will actually match on.
 *
 * Bind this — never the caller's full query — wherever a statement or its result
 * mapping reasons about the same needle the `LIKE` predicate used: the shared
 * excerpt projection's `instr()`, the match-source `includes()` checks, and the
 * excerpt analyser. For any query inside the budget it returns the query
 * unchanged, so the ordinary case is unaffected.
 */
export function likeContainsNeedle(value: string): string {
  return boundedNeedle(value, 2).raw;
}
