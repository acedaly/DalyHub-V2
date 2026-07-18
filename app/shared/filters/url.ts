/**
 * DS-07 — the Filter URL contract (pure, framework-free).
 *
 * Active filters live in the URL, never only in component state, so they survive
 * refresh, restore from a copied link, and move with browser Back/Forward
 * (DESIGN_SYSTEM.md → Filters; ADR-019). The encoding is a REPEATED, VERSIONED,
 * safely-encoded query representation — not one opaque JSON blob:
 *
 *   /tasks?status=active&fv=1&f=status%3Ais%3A%22open%22&f=title%3Acontains%3A%22hi%22&fmode=or
 *
 * - `fv`   — a format version, so the contract is forward-compatible. An unknown
 *            version is ignored wholesale (fail safe) rather than misread.
 * - `f`    — one per clause: `field:operator` for no-value operators, else
 *            `field:operator:<json-value>`. The value is a SMALL per-clause JSON
 *            scalar/array/range (not a blob of the whole state); JSON gives correct
 *            round-tripping of punctuation, spaces, Unicode and URL-reserved
 *            characters, and deterministic output for our fixed value shapes.
 * - `fmode`— present only when the mode is `or` (AND is the default and adds no
 *            state).
 *
 * Every transform PRESERVES unrelated query parameters — including the repeated
 * `drawer` parameters from DS-03 — and re-emits the filter parameters at a stable
 * position, so equivalent filter states always produce the same URL. Decoding is
 * total and defensive: malformed values, unknown fields/operators, oversized input
 * and excess clauses are dropped safely; there is no `eval`, no `Function`, and no
 * unsafe deserialisation — only `JSON.parse` inside a `try/catch`, bounded first.
 */

import { operatorArity } from "./operators";
import { MAX_CLAUSES, sanitiseExpression } from "./validate";
import type {
  FilterClause,
  FilterExpression,
  FilterFieldRegistry,
  FilterMode,
  FilterOperator,
  FilterValue,
} from "./types";

/** The repeated per-clause parameter. */
export const FILTER_PARAM = "f";
/** The AND/OR mode parameter (present only for `or`). */
export const FILTER_MODE_PARAM = "fmode";
/** The format-version parameter. */
export const FILTER_VERSION_PARAM = "fv";
/** The current encoding version. */
export const FILTER_VERSION = "1";

/** Max characters in a single encoded clause; longer values are rejected. */
export const MAX_ENCODED_CLAUSE_LENGTH = 1024;

const FILTER_PARAM_NAMES: ReadonlySet<string> = new Set([
  FILTER_PARAM,
  FILTER_MODE_PARAM,
  FILTER_VERSION_PARAM,
]);

/** Encode one clause to its `f` value form (framework-free). */
export function encodeClause(clause: FilterClause): string {
  const head = `${clause.field}:${clause.operator}`;
  const arity = operatorArity(clause.operator);
  if (arity === "none" || clause.value === undefined || clause.value === null) {
    return head;
  }
  return `${head}:${JSON.stringify(clause.value)}`;
}

interface DecodedClause {
  readonly field: string;
  readonly operator: FilterOperator;
  readonly value?: FilterValue;
}

/**
 * Decode one `f` value into a raw clause shape, or `null` when malformed. Splits
 * only the first two `:` so values may themselves contain `:`. The JSON value is
 * length-bounded and parsed defensively.
 */
export function decodeClause(encoded: string): DecodedClause | null {
  if (encoded.length === 0 || encoded.length > MAX_ENCODED_CLAUSE_LENGTH) {
    return null;
  }
  const firstColon = encoded.indexOf(":");
  if (firstColon <= 0) {
    return null;
  }
  const field = encoded.slice(0, firstColon);
  const secondColon = encoded.indexOf(":", firstColon + 1);
  if (secondColon === -1) {
    const operator = encoded.slice(firstColon + 1);
    if (operator.length === 0) {
      return null;
    }
    return { field, operator: operator as FilterOperator };
  }
  const operator = encoded.slice(firstColon + 1, secondColon);
  const valueJson = encoded.slice(secondColon + 1);
  if (operator.length === 0) {
    return null;
  }
  let value: unknown;
  try {
    value = JSON.parse(valueJson);
  } catch {
    return null;
  }
  // Only accept the value shapes our model uses; anything else is malformed.
  if (
    typeof value !== "string" &&
    typeof value !== "number" &&
    typeof value !== "boolean" &&
    !Array.isArray(value) &&
    !(typeof value === "object" && value !== null)
  ) {
    return null;
  }
  if (
    Array.isArray(value) &&
    !value.every((item) => typeof item === "string")
  ) {
    return null;
  }
  return {
    field,
    operator: operator as FilterOperator,
    value: value as FilterValue,
  };
}

/**
 * Read the filter expression from the URL, sanitised against the registry. Unknown
 * versions and any malformed/unknown/oversized/excess clauses are dropped; the
 * result is always a valid expression (possibly empty).
 */
export function readFilterExpression(
  params: URLSearchParams,
  registry: FilterFieldRegistry,
): FilterExpression {
  const version = params.get(FILTER_VERSION_PARAM);
  const encodedClauses = params.getAll(FILTER_PARAM);
  // Unknown version, or version-less clauses: fail safe to empty rather than
  // guessing a format. (A bare `fv` with no clauses is simply empty.)
  if (encodedClauses.length > 0 && version !== FILTER_VERSION) {
    return { mode: "and", clauses: [] };
  }

  const mode: FilterMode =
    params.get(FILTER_MODE_PARAM) === "or" ? "or" : "and";

  const clauses: FilterClause[] = [];
  for (const encoded of encodedClauses.slice(0, MAX_CLAUSES)) {
    const decoded = decodeClause(encoded);
    if (decoded === null) {
      continue;
    }
    clauses.push({
      id: String(clauses.length),
      field: decoded.field,
      operator: decoded.operator,
      value: decoded.value,
    });
  }

  return sanitiseExpression(registry, { mode, clauses });
}

/**
 * Rebuild the search params with the filter expression encoded, preserving every
 * other parameter's value and relative order (including repeated `drawer`
 * parameters). The filter parameters are re-emitted at the position of the first
 * previous filter parameter (or appended when previously absent), so equivalent
 * expressions yield deterministic URLs. An empty expression removes ALL filter
 * state, leaving no `fv`/`f`/`fmode` residue.
 */
export function writeFilterExpression(
  params: URLSearchParams,
  expression: FilterExpression,
): URLSearchParams {
  const emit = (target: URLSearchParams) => {
    if (expression.clauses.length === 0) {
      return;
    }
    target.append(FILTER_VERSION_PARAM, FILTER_VERSION);
    for (const clause of expression.clauses.slice(0, MAX_CLAUSES)) {
      target.append(FILTER_PARAM, encodeClause(clause));
    }
    if (expression.mode === "or") {
      target.append(FILTER_MODE_PARAM, "or");
    }
  };

  const next = new URLSearchParams();
  let emitted = false;
  for (const [name, value] of params.entries()) {
    if (FILTER_PARAM_NAMES.has(name)) {
      if (!emitted) {
        emit(next);
        emitted = true;
      }
      continue;
    }
    next.append(name, value);
  }
  if (!emitted) {
    emit(next);
  }
  return next;
}
