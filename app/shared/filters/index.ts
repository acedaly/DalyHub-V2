/**
 * DS-07 — public entry for the Shared Filters system.
 *
 * ONE filter system for every collection (DESIGN_SYSTEM.md → Filters): a typed,
 * entity-agnostic model (definitions, expressions, operators), a URL contract, a
 * pure client-side evaluator, a reusable Filter Bar with add/edit/chips/clear and
 * AND/OR, a storage-agnostic saved-view adapter, and the filtered-empty state.
 *
 * The pure model (types, operators, validate, evaluate, url, saved-views, display)
 * imports no React, so a future server-backed module can translate a
 * `FilterExpression` into its own query layer without pulling in the UI.
 */

// Model — pure, framework-free.
export type {
  FilterClause,
  FilterExpression,
  FilterFieldDefinition,
  FilterFieldRegistry,
  FilterMode,
  FilterOperator,
  FilterOption,
  FilterRange,
  FilterValue,
  FilterValueControlProps,
  FilterValueType,
} from "./types";
export {
  OPERATORS_BY_TYPE,
  getOperatorDefinition,
  operatorArity,
  operatorTakesNoValue,
} from "./operators";
export type { OperatorArity, OperatorDefinition } from "./operators";
export {
  EMPTY_EXPRESSION,
  MAX_CLAUSES,
  expressionsEqual,
  findField,
  isValidValueForOperator,
  operatorsForField,
  sanitiseExpression,
  validateClause,
} from "./validate";
export type { ClauseRejectReason, ClauseValidation } from "./validate";
export { filterRecords, matchesExpression } from "./evaluate";
export {
  FILTER_MODE_PARAM,
  FILTER_PARAM,
  FILTER_VERSION,
  FILTER_VERSION_PARAM,
  MAX_ENCODED_CLAUSE_LENGTH,
  decodeClause,
  encodeClause,
  readFilterExpression,
  writeFilterExpression,
} from "./url";
export {
  clauseAccessibleName,
  defaultOperatorForField,
  defaultValueForOperator,
  describeClause,
} from "./display";
export type { ClauseDescription } from "./display";
export { findSavedView, isViewModified } from "./saved-views";
export type { SavedView, SavedViewAdapter } from "./saved-views";

// UI — React components.
export { FilterBar } from "./FilterBar";
export type { FilterBarProps } from "./FilterBar";
export { FilterChip } from "./FilterChip";
export { FilterEditor } from "./FilterEditor";
export { FilterValueInput } from "./FilterValueInput";
export { FilterEmptyState } from "./FilterEmptyState";
export { useFilterUrlState } from "./useFilterUrlState";
export type { FilterUrlState } from "./useFilterUrlState";
