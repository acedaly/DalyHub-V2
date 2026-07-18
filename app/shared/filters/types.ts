/**
 * DS-07 — the Shared Filters public contract (pure, framework-free).
 *
 * ONE filter system for every DalyHub collection (DESIGN_SYSTEM.md → Filters).
 * The model here is entity-agnostic and React-free: a future module registers
 * typed FIELD DEFINITIONS and supplies records; it never writes its own filtering
 * controls. Everything in this file is plain data — serialisable, comparable and
 * safe to restore from an untrusted URL — so a server-backed module can translate
 * a `FilterExpression` into its own query layer without importing React.
 *
 * It knows nothing about D1, repositories, workspaces, the Area hierarchy, task
 * completion, real routes or Cloudflare bindings.
 */

import type { ReactNode } from "react";

/**
 * The generic value types a filter field can carry. These are presentation/model
 * concepts, never business types — a module maps its own field to one of these.
 */
export type FilterValueType =
  "text" | "boolean" | "enum" | "number" | "date" | "reference" | "multi-enum";

/**
 * Every operator DS-07 understands. Operators are value-type appropriate; the
 * registry (`OPERATORS_BY_TYPE`) pairs each value type with only the operators
 * that make sense for it, so nonsensical operator/value combinations never exist.
 */
export type FilterOperator =
  // text
  | "contains"
  | "not_contains"
  | "equals"
  | "not_equals"
  // enum / reference / multi-enum
  | "is"
  | "is_not"
  | "is_any_of"
  | "is_none_of"
  // number / progress
  | "gt"
  | "lt"
  | "between"
  // date
  | "on"
  | "before"
  | "after"
  // boolean
  | "is_true"
  | "is_false"
  // presence (shared across most types)
  | "is_empty"
  | "is_not_empty";

/**
 * A serialisable clause value. `null`/absent for no-value operators (is_empty…),
 * a scalar for single-value operators, a string array for the *_any_of/_none_of
 * membership operators, and a `{ from, to }` range for `between`.
 */
export type FilterRange = { readonly from: string; readonly to: string };
export type FilterValue =
  string | number | boolean | readonly string[] | FilterRange | null;

/** How multiple clauses compose. `and` is the default (and removes URL state). */
export type FilterMode = "and" | "or";

/** One selectable option for an enum/reference/multi-enum field. */
export interface FilterOption {
  readonly value: string;
  readonly label: string;
}

/**
 * A single filter clause: a field, an operator valid for that field's type, and
 * (for value-bearing operators) a value. `id` is a stable identity used for React
 * keys, focus and in-place editing; it is NOT part of the serialised URL form, so
 * two expressions are equal when their field/operator/value/mode match regardless
 * of id (see `expressionsEqual`).
 */
export interface FilterClause {
  readonly id: string;
  readonly field: string;
  readonly operator: FilterOperator;
  readonly value?: FilterValue;
}

/**
 * A bounded, non-recursive filter expression: zero or more clauses composed with
 * a single AND/OR mode. Deliberately NOT a general query language or a nested
 * builder — enough to express "these fields, these operators, these values".
 */
export interface FilterExpression {
  readonly mode: FilterMode;
  readonly clauses: readonly FilterClause[];
}

/**
 * A typed filter field definition. A module registers these; the shared Filter Bar
 * renders controls from them and the shared evaluator applies them to records.
 */
export interface FilterFieldDefinition {
  /** Stable field id (kebab/snake). Namespaced by the consuming module. */
  readonly id: string;
  /** Human label shown in the field picker and chips. */
  readonly label: string;
  /** The generic value type; drives the available operators and value control. */
  readonly type: FilterValueType;
  /**
   * Operator allow-list override. Defaults to `OPERATORS_BY_TYPE[type]`. Never
   * widen a field to an operator its value type cannot support.
   */
  readonly operators?: readonly FilterOperator[];
  /** Options for enum/reference/multi-enum fields (value picker + chip display). */
  readonly options?: readonly FilterOption[];
  /** Whether the same field may appear in more than one clause. Default false. */
  readonly allowMultipleClauses?: boolean;
  /**
   * Client-side value accessor for local/fixture collections. Returns the raw
   * value the evaluator compares (a string, number, boolean, id, id[], ISO date…).
   * Server-backed modules ignore this and translate the clause into their query
   * layer instead.
   */
  readonly accessor?: (record: unknown) => unknown;
  /**
   * Optional display formatter for a clause value (chip text). Falls back to a
   * generic formatter (option labels for enums, joined lists, range text…).
   */
  readonly formatValue?: (
    value: FilterValue,
    definition: FilterFieldDefinition,
  ) => string | undefined;
  /**
   * Optional custom value control (kept as a seam for DS-06 shared form controls
   * later). DS-07 renders restrained native controls when this is absent.
   */
  readonly renderValueControl?: (props: FilterValueControlProps) => ReactNode;
}

/** Props a (future DS-06) custom value control receives. */
export interface FilterValueControlProps {
  readonly definition: FilterFieldDefinition;
  readonly operator: FilterOperator;
  readonly value: FilterValue;
  readonly onChange: (value: FilterValue) => void;
  readonly inputId: string;
}

/** A map of field id → definition, the registry a Filter Bar is driven by. */
export type FilterFieldRegistry = readonly FilterFieldDefinition[];
