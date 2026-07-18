/**
 * DS-07 — operator metadata and the value-type → operator registry.
 *
 * Each operator declares its human label and its VALUE ARITY: `none` (presence
 * operators like "is empty" that show no value control), `scalar` (a single
 * value), `list` (a set for membership operators) or `range` (a `{ from, to }`
 * pair). The bar uses arity to decide whether — and which — value control to
 * show, so an operator that needs no value never renders one, and an invalid
 * clause can never be built.
 *
 * `OPERATORS_BY_TYPE` pairs each generic value type with only the operators that
 * make sense for it (DESIGN_SYSTEM.md → Filters), so nonsensical operator/value
 * combinations are impossible by construction.
 */

import type { FilterOperator, FilterValueType } from "./types";

export type OperatorArity = "none" | "scalar" | "list" | "range";

export interface OperatorDefinition {
  readonly operator: FilterOperator;
  readonly label: string;
  readonly arity: OperatorArity;
}

const OPERATOR_DEFINITIONS: Record<FilterOperator, OperatorDefinition> = {
  contains: { operator: "contains", label: "contains", arity: "scalar" },
  not_contains: {
    operator: "not_contains",
    label: "does not contain",
    arity: "scalar",
  },
  equals: { operator: "equals", label: "equals", arity: "scalar" },
  not_equals: {
    operator: "not_equals",
    label: "does not equal",
    arity: "scalar",
  },
  is: { operator: "is", label: "is", arity: "scalar" },
  is_not: { operator: "is_not", label: "is not", arity: "scalar" },
  is_any_of: { operator: "is_any_of", label: "is any of", arity: "list" },
  is_none_of: { operator: "is_none_of", label: "is none of", arity: "list" },
  gt: { operator: "gt", label: "greater than", arity: "scalar" },
  lt: { operator: "lt", label: "less than", arity: "scalar" },
  between: { operator: "between", label: "between", arity: "range" },
  on: { operator: "on", label: "on", arity: "scalar" },
  before: { operator: "before", label: "before", arity: "scalar" },
  after: { operator: "after", label: "after", arity: "scalar" },
  is_true: { operator: "is_true", label: "is true", arity: "none" },
  is_false: { operator: "is_false", label: "is false", arity: "none" },
  is_empty: { operator: "is_empty", label: "is empty", arity: "none" },
  is_not_empty: {
    operator: "is_not_empty",
    label: "is not empty",
    arity: "none",
  },
};

/** The default operator set for each generic value type. */
export const OPERATORS_BY_TYPE: Record<
  FilterValueType,
  readonly FilterOperator[]
> = {
  text: ["contains", "not_contains", "equals", "is_empty", "is_not_empty"],
  boolean: ["is_true", "is_false"],
  enum: ["is", "is_not", "is_any_of", "is_none_of", "is_empty", "is_not_empty"],
  reference: [
    "is",
    "is_not",
    "is_any_of",
    "is_none_of",
    "is_empty",
    "is_not_empty",
  ],
  "multi-enum": ["is_any_of", "is_none_of", "is_empty", "is_not_empty"],
  number: ["equals", "gt", "lt", "between", "is_empty", "is_not_empty"],
  date: ["on", "before", "after", "between", "is_empty", "is_not_empty"],
};

/** Look up an operator's metadata. Returns `undefined` for an unknown operator. */
export function getOperatorDefinition(
  operator: string,
): OperatorDefinition | undefined {
  return OPERATOR_DEFINITIONS[operator as FilterOperator];
}

/** The value arity for an operator, or `undefined` when unknown. */
export function operatorArity(operator: string): OperatorArity | undefined {
  return getOperatorDefinition(operator)?.arity;
}

/** True when the operator carries no value (presence operators). */
export function operatorTakesNoValue(operator: string): boolean {
  return operatorArity(operator) === "none";
}
