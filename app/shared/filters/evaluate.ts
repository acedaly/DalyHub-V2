/**
 * DS-07 — the deterministic, pure client-side filter evaluator.
 *
 * Suitable for development fixtures and small local collections. It applies the
 * SAME typed expression model that is represented in the URL, supports AND/OR,
 * handles missing/null values, and NEVER mutates the source data. Evaluation is
 * kept entirely separate from the UI: a future server-backed module translates a
 * `FilterExpression` into its own repository/query layer without importing any of
 * this or React.
 *
 * A field's client-side value comes from its `accessor`; when absent the field's
 * own `id` is read off the record as a fallback. Only clauses that VALIDATE are
 * evaluated (invalid clauses are dropped by `sanitiseExpression`), so the operator
 * switch below never sees a malformed clause.
 */

import { findField, sanitiseExpression, validateClause } from "./validate";
import type {
  FilterClause,
  FilterExpression,
  FilterFieldDefinition,
  FilterFieldRegistry,
  FilterRange,
} from "./types";

function readValue(
  definition: FilterFieldDefinition,
  record: unknown,
): unknown {
  if (definition.accessor) {
    return definition.accessor(record);
  }
  if (typeof record === "object" && record !== null) {
    return (record as Record<string, unknown>)[definition.id];
  }
  return undefined;
}

function isMissing(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

function toComparableString(value: unknown): string {
  return String(value ?? "");
}

function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

/**
 * Parse a date value to a UTC day index (days since epoch), so date comparisons
 * are calendar-day comparisons that are stable across UTC boundaries and never
 * depend on the host locale/timezone. Accepts `YYYY-MM-DD` or any Date-parseable
 * string. Returns `NaN` for unparseable input.
 */
function toUtcDayIndex(value: unknown): number {
  if (value instanceof Date) {
    return Math.floor(value.getTime() / 86_400_000);
  }
  const text = toComparableString(value).trim();
  if (text === "") {
    return NaN;
  }
  // Fast path for a plain ISO calendar date — avoids timezone drift entirely.
  const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (isoDate) {
    const [, year, month, day] = isoDate;
    const utc = Date.UTC(Number(year), Number(month) - 1, Number(day));
    return Math.floor(utc / 86_400_000);
  }
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) {
    return NaN;
  }
  return Math.floor(parsed / 86_400_000);
}

function asStringSet(value: unknown): Set<string> {
  if (Array.isArray(value)) {
    return new Set(value.map((item) => String(item)));
  }
  if (isMissing(value)) {
    return new Set();
  }
  return new Set([String(value)]);
}

/** Evaluate a single, already-validated clause against a record. */
function evaluateClause(
  definition: FilterFieldDefinition,
  clause: FilterClause,
  record: unknown,
): boolean {
  const raw = readValue(definition, record);
  const value = clause.value;

  switch (clause.operator) {
    case "is_empty":
      return isMissing(raw);
    case "is_not_empty":
      return !isMissing(raw);
    case "is_true":
      return raw === true;
    case "is_false":
      return raw === false;
    case "contains":
      return toComparableString(raw)
        .toLowerCase()
        .includes(toComparableString(value).toLowerCase());
    case "not_contains":
      return !toComparableString(raw)
        .toLowerCase()
        .includes(toComparableString(value).toLowerCase());
    case "equals":
      if (definition.type === "number") {
        return toNumber(raw) === toNumber(value);
      }
      return (
        toComparableString(raw).toLowerCase() ===
        toComparableString(value).toLowerCase()
      );
    case "not_equals":
      return (
        toComparableString(raw).toLowerCase() !==
        toComparableString(value).toLowerCase()
      );
    case "is":
      return !isMissing(raw) && asStringSet(raw).has(toComparableString(value));
    case "is_not":
      return isMissing(raw) || !asStringSet(raw).has(toComparableString(value));
    case "is_any_of": {
      const wanted = new Set((value as readonly string[]).map(String));
      const actual = asStringSet(raw);
      for (const item of actual) {
        if (wanted.has(item)) {
          return true;
        }
      }
      return false;
    }
    case "is_none_of": {
      const wanted = new Set((value as readonly string[]).map(String));
      const actual = asStringSet(raw);
      for (const item of actual) {
        if (wanted.has(item)) {
          return false;
        }
      }
      return true;
    }
    case "gt":
      return toNumber(raw) > toNumber(value);
    case "lt":
      return toNumber(raw) < toNumber(value);
    case "between": {
      const range = value as FilterRange;
      if (definition.type === "date") {
        const day = toUtcDayIndex(raw);
        const from = toUtcDayIndex(range.from);
        const to = toUtcDayIndex(range.to);
        if (Number.isNaN(day) || Number.isNaN(from) || Number.isNaN(to)) {
          return false;
        }
        const lo = Math.min(from, to);
        const hi = Math.max(from, to);
        return day >= lo && day <= hi;
      }
      const num = toNumber(raw);
      const from = toNumber(range.from);
      const to = toNumber(range.to);
      if (Number.isNaN(num) || Number.isNaN(from) || Number.isNaN(to)) {
        return false;
      }
      return num >= Math.min(from, to) && num <= Math.max(from, to);
    }
    case "on": {
      const day = toUtcDayIndex(raw);
      const target = toUtcDayIndex(value);
      return !Number.isNaN(day) && !Number.isNaN(target) && day === target;
    }
    case "before": {
      const day = toUtcDayIndex(raw);
      const target = toUtcDayIndex(value);
      return !Number.isNaN(day) && !Number.isNaN(target) && day < target;
    }
    case "after": {
      const day = toUtcDayIndex(raw);
      const target = toUtcDayIndex(value);
      return !Number.isNaN(day) && !Number.isNaN(target) && day > target;
    }
    default:
      return false;
  }
}

/**
 * Evaluate a full expression against one record. An empty expression matches
 * everything. AND requires every clause; OR requires at least one. Invalid clauses
 * are dropped first, so evaluation is total and never throws.
 */
export function matchesExpression(
  registry: FilterFieldRegistry,
  expression: FilterExpression,
  record: unknown,
): boolean {
  const clauses = expression.clauses.filter(
    (clause) => validateClause(registry, clause).valid,
  );
  if (clauses.length === 0) {
    return true;
  }
  const results = clauses.map((clause) => {
    const definition = findField(registry, clause.field);
    // Guarded by validateClause above; the guard keeps TypeScript honest.
    return definition ? evaluateClause(definition, clause, record) : false;
  });
  return expression.mode === "or"
    ? results.some(Boolean)
    : results.every(Boolean);
}

/**
 * Filter a collection, returning a NEW array (source untouched). Records keep
 * their original order — evaluation is stable and side-effect free.
 */
export function filterRecords<T>(
  registry: FilterFieldRegistry,
  expression: FilterExpression,
  records: readonly T[],
): T[] {
  const safe = sanitiseExpression(registry, expression);
  return records.filter((record) => matchesExpression(registry, safe, record));
}
