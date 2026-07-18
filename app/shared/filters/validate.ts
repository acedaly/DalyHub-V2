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

/** The operators allowed for a field (its override, else the type default). */
export function operatorsForField(
  definition: FilterFieldDefinition,
): readonly FilterOperator[] {
  return definition.operators ?? OPERATORS_BY_TYPE[definition.type];
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
  if (!isValidValueForOperator(clause.operator, clause.value)) {
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
