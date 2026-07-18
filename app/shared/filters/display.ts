/**
 * DS-07 — human-readable formatting and clause construction helpers (pure).
 *
 * Turns a clause into readable field/operator/value text for chips and screen
 * readers, and builds valid default clauses when the user picks a field/operator.
 * Kept framework-free so both the UI and tests use the same logic.
 */

import { getOperatorDefinition, operatorArity } from "./operators";
import { operatorsForField } from "./validate";
import type {
  FilterClause,
  FilterFieldDefinition,
  FilterFieldRegistry,
  FilterOperator,
  FilterRange,
  FilterValue,
} from "./types";

/** The readable parts of a clause, for a chip or an accessible name. */
export interface ClauseDescription {
  readonly fieldLabel: string;
  readonly operatorLabel: string;
  /** Empty for no-value operators. */
  readonly valueText: string;
}

function optionLabel(definition: FilterFieldDefinition, value: string): string {
  const option = definition.options?.find((item) => item.value === value);
  return option?.label ?? value;
}

function formatValueText(
  definition: FilterFieldDefinition,
  operator: FilterOperator,
  value: FilterValue | undefined,
): string {
  if (definition.formatValue && value !== undefined && value !== null) {
    const custom = definition.formatValue(value, definition);
    if (typeof custom === "string") {
      return custom;
    }
  }
  const arity = operatorArity(operator);
  if (arity === "none" || value === undefined || value === null) {
    return "";
  }
  if (arity === "range") {
    const range = value as FilterRange;
    return `${range.from} – ${range.to}`;
  }
  if (arity === "list") {
    const list = value as readonly string[];
    if (
      definition.type === "enum" ||
      definition.type === "reference" ||
      definition.type === "multi-enum"
    ) {
      return list.map((item) => optionLabel(definition, item)).join(", ");
    }
    return list.join(", ");
  }
  // scalar
  if (
    definition.type === "enum" ||
    definition.type === "reference" ||
    definition.type === "multi-enum"
  ) {
    return optionLabel(definition, String(value));
  }
  return String(value);
}

/** Describe a clause in readable parts, resolving the field label and options. */
export function describeClause(
  registry: FilterFieldRegistry,
  clause: FilterClause,
): ClauseDescription {
  const definition = registry.find((item) => item.id === clause.field);
  const operatorDefinition = getOperatorDefinition(clause.operator);
  const fieldLabel = definition?.label ?? clause.field;
  const operatorLabel = operatorDefinition?.label ?? clause.operator;
  const valueText = definition
    ? formatValueText(definition, clause.operator, clause.value)
    : "";
  return { fieldLabel, operatorLabel, valueText };
}

/** A single-line accessible name for a chip, e.g. `Status is Open`. */
export function clauseAccessibleName(
  registry: FilterFieldRegistry,
  clause: FilterClause,
): string {
  const { fieldLabel, operatorLabel, valueText } = describeClause(
    registry,
    clause,
  );
  return valueText
    ? `${fieldLabel} ${operatorLabel} ${valueText}`
    : `${fieldLabel} ${operatorLabel}`;
}

/** The default operator for a field (first allowed operator). */
export function defaultOperatorForField(
  definition: FilterFieldDefinition,
): FilterOperator {
  return operatorsForField(definition)[0];
}

/**
 * An initial, TYPE-appropriate value for an operator, so a freshly-added clause
 * starts from a sensible (if not yet valid) state. Presence operators get no value.
 */
export function defaultValueForOperator(
  definition: FilterFieldDefinition,
  operator: FilterOperator,
): FilterValue | undefined {
  const arity = operatorArity(operator);
  switch (arity) {
    case "none":
      return undefined;
    case "list":
      return [];
    case "range":
      return { from: "", to: "" };
    case "scalar":
      if (definition.type === "number") {
        return 0;
      }
      if (
        (definition.type === "enum" || definition.type === "reference") &&
        definition.options &&
        definition.options.length > 0
      ) {
        return definition.options[0].value;
      }
      return "";
    default:
      return undefined;
  }
}
