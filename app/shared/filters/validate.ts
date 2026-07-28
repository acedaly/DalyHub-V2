/**
 * DS-07 — clause/expression validation against a field registry.
 *
 * Validation is the single gate every clause passes before it is applied,
 * serialised or evaluated. It proves the field exists, the operator is allowed for
 * that field's value type, and the value shape matches the operator's arity. This
 * is what lets the model be "safe to restore from an untrusted URL": a malformed,
 * unknown-field, unknown-operator or wrong-shaped clause is rejected here rather
 * than crashing a downstream consumer.
 */

import { operatorArity } from "./operators";
import { OPERATORS_BY_TYPE } from "./operators";
import type {
  FilterClause,
  FilterExpression,
  FilterFieldDefinition,
  FilterFieldRegistry,
  FilterOperator,
  FilterRange,
  FilterValue,
} from "./types";

/** A generous upper bound on clause count to keep URLs and evaluation bounded. */
export const MAX_CLAUSES = 24;

/** Find a field definition by id. */
export function findField(
  registry: FilterFieldRegistry,
  fieldId: string,
): FilterFieldDefinition | undefined {
  return registry.find((definition) => definition.id === fieldId);
}

const IS_DEV =
  typeof process !== "undefined" && process.env?.NODE_ENV !== "production";

/**
 * The operators allowed for a field: its `operators` override, else the value
 * type's default set. An override may only **narrow** the type's default set — it
 * must never widen a field to operators invalid for its type. A widening override
 * is a field-definition bug: it throws in development (so it surfaces clearly) and
 * is clamped to the safe intersection in production (so it can never introduce an
 * unsafe clause).
 */
export function operatorsForField(
  definition: FilterFieldDefinition,
): readonly FilterOperator[] {
  const allowed = OPERATORS_BY_TYPE[definition.type];
  if (!definition.operators) {
    return allowed;
  }
  const invalid = definition.operators.filter((op) => !allowed.includes(op));
  if (invalid.length > 0 && IS_DEV) {
    throw new Error(
      `Filter field "${definition.id}" (type "${definition.type}") declares ` +
        `operators not valid for its type: ${invalid.join(", ")}. An operators ` +
        `override may only narrow the type’s default set, never widen it.`,
    );
  }
  return definition.operators.filter((op) => allowed.includes(op));
}

function isPlainRange(value: FilterValue): value is FilterRange {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as FilterRange).from === "string" &&
    typeof (value as FilterRange).to === "string"
  );
}

function isStringArray(value: FilterValue): value is readonly string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

/**
 * True when `value` is a well-formed value for `operator`. Presence operators must
 * carry NO value; scalar/list/range operators must carry a value of the matching
 * shape. Empty scalars/lists are rejected so a value-bearing clause is never
 * silently a no-op.
 */
export function isValidValueForOperator(
  operator: string,
  value: FilterValue | undefined,
): boolean {
  const arity = operatorArity(operator);
  if (arity === undefined) {
    return false;
  }
  switch (arity) {
    case "none":
      return value === undefined || value === null;
    case "scalar":
      return (
        (typeof value === "string" && value.length > 0) ||
        typeof value === "number" ||
        typeof value === "boolean"
      );
    case "list":
      return (
        isStringArray(value ?? null) && (value as readonly string[]).length > 0
      );
    case "range":
      return (
        isPlainRange(value ?? null) &&
        (value as FilterRange).from.length > 0 &&
        (value as FilterRange).to.length > 0
      );
    default:
      return false;
  }
}

/**
 * A strict `YYYY-MM-DD` calendar date (the documented date contract — the value a
 * native date input produces). Rejects malformed strings and impossible dates
 * (e.g. `2026-02-31`), booleans, numbers and timestamps.
 */
export function isStrictCalendarDate(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** A string that parses to a finite number (rejects "", "banana", Infinity text). */
function isFiniteNumberString(value: unknown): boolean {
  if (typeof value !== "string" || value.trim() === "") {
    return false;
  }
  return Number.isFinite(Number(value));
}

/**
 * Whether `value` matches the FIELD's declared value type (not just the operator's
 * arity). This is what rejects a boolean for a text filter, `"banana"` for a
 * numeric `gt`, a number for an enum, or a bad date — malformed clauses restored
 * from a URL can otherwise slip past an arity-only check.
 *
 * Enum/reference/multi-enum: values must be strings (or string arrays). Unknown
 * option values are **retained** (not rejected) for forward compatibility — a
 * field's `options` may be a partial or lazily-loaded set, and a saved view must
 * not break when the option list changes. Only the value *type* is enforced.
 */
export function valueMatchesFieldType(
  definition: FilterFieldDefinition,
  operator: string,
  value: FilterValue | undefined,
): boolean {
  const arity = operatorArity(operator);
  switch (arity) {
    case "none":
      return true;
    case "scalar":
      switch (definition.type) {
        case "text":
          return typeof value === "string" && value.length > 0;
        case "number":
          return typeof value === "number" && Number.isFinite(value);
        case "date":
          return isStrictCalendarDate(value);
        case "enum":
        case "reference":
          return typeof value === "string" && value.length > 0;
        default:
          // boolean/multi-enum have no scalar operators.
          return false;
      }
    case "list":
      if (
        definition.type === "enum" ||
        definition.type === "reference" ||
        definition.type === "multi-enum"
      ) {
        return (
          isStringArray(value ?? null) &&
          (value as readonly string[]).length > 0
        );
      }
      return false;
    case "range":
      if (!isPlainRange(value ?? null)) {
        return false;
      }
      if (definition.type === "date") {
        return (
          isStrictCalendarDate((value as FilterRange).from) &&
          isStrictCalendarDate((value as FilterRange).to)
        );
      }
      if (definition.type === "number") {
        return (
          isFiniteNumberString((value as FilterRange).from) &&
          isFiniteNumberString((value as FilterRange).to)
        );
      }
      return false;
    default:
      return false;
  }
}

/** A precise reason a clause was rejected (for coherent surfacing, not just drop). */
export type ClauseRejectReason =
  | "unknown-field"
  | "unknown-operator"
  | "operator-not-allowed"
  | "invalid-value";

export interface ClauseValidation {
  readonly valid: boolean;
  readonly reason?: ClauseRejectReason;
}

/** Validate one clause against the registry. */
export function validateClause(
  registry: FilterFieldRegistry,
  clause: Pick<FilterClause, "field" | "operator" | "value">,
): ClauseValidation {
  const definition = findField(registry, clause.field);
  if (definition === undefined) {
    return { valid: false, reason: "unknown-field" };
  }
  if (operatorArity(clause.operator) === undefined) {
    return { valid: false, reason: "unknown-operator" };
  }
  if (!operatorsForField(definition).includes(clause.operator)) {
    return { valid: false, reason: "operator-not-allowed" };
  }
  // Value must satisfy BOTH the operator's arity/shape and the field's value TYPE
  // (so a boolean for a text filter, "banana" for a numeric gt, or a bad date is
  // rejected even when restored from an untrusted URL).
  if (
    !isValidValueForOperator(clause.operator, clause.value) ||
    !valueMatchesFieldType(definition, clause.operator, clause.value)
  ) {
    return { valid: false, reason: "invalid-value" };
  }
  return { valid: true };
}

/**
 * Keep only the clauses that validate, in order, capped at `MAX_CLAUSES`. This is
 * the sanitiser applied after URL decode and before evaluation, so unknown or
 * malformed clauses are dropped rather than throwing.
 */
export function sanitiseExpression(
  registry: FilterFieldRegistry,
  expression: FilterExpression,
): FilterExpression {
  const clauses = expression.clauses
    .filter((clause) => validateClause(registry, clause).valid)
    .slice(0, MAX_CLAUSES);
  return { mode: expression.mode, clauses };
}

/** Compare two values for expression equality (order-insensitive for lists). */
function valuesEqual(
  a: FilterValue | undefined,
  b: FilterValue | undefined,
): boolean {
  if (a === undefined || a === null) {
    return b === undefined || b === null;
  }
  if (b === undefined || b === null) {
    return false;
  }
  if (isStringArray(a) && isStringArray(b)) {
    if (a.length !== b.length) {
      return false;
    }
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.every((item, index) => item === sortedB[index]);
  }
  if (isPlainRange(a) && isPlainRange(b)) {
    return a.from === b.from && a.to === b.to;
  }
  return a === b;
}

/**
 * Structural equality of two expressions, IGNORING clause ids. Used to detect
 * whether a saved view has been modified and to prove deterministic URL encoding.
 */
export function expressionsEqual(
  a: FilterExpression,
  b: FilterExpression,
): boolean {
  if (a.mode !== b.mode || a.clauses.length !== b.clauses.length) {
    return false;
  }
  return a.clauses.every((clause, index) => {
    const other = b.clauses[index];
    return (
      clause.field === other.field &&
      clause.operator === other.operator &&
      valuesEqual(clause.value, other.value)
    );
  });
}

/** The canonical empty expression (AND, no clauses). */
export const EMPTY_EXPRESSION: FilterExpression = { mode: "and", clauses: [] };
