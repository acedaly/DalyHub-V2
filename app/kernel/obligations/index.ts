/**
 * V2.10 LIFE-00 Obligations kernel — public surface.
 *
 * The ONE obligation domain: the closed category vocabulary, the stored
 * lifecycle, the one recurrence engine for obligations, the calendar
 * arithmetic and the one urgency evaluator. It is pure — no D1, no JSX, no
 * clock, no timezone database, and no import of any other product domain — so
 * a commitment about an Asset, about a Person, or about nothing at all is
 * evaluated by the same code (ADR-116 decision 1).
 *
 * The Assets kernel consumes this and adds what is genuinely Asset-specific:
 * the meter, the canonical-fact bridge and the proof-event bridge. Nothing
 * here knows those exist.
 */

export {
  OBLIGATION_ENTITY_TYPE,
  RESERVED_OBLIGATION_ENTITY_TYPES,
  OBLIGATION_CREATED,
  OBLIGATION_RESCHEDULED,
  OBLIGATION_COMPLETED,
  OBLIGATION_DISMISSED,
  OBLIGATION_REOPENED,
  OBLIGATION_TASK_LINKED,
  OBLIGATION_DELETED,
  OBLIGATION_ACTIVITY_TYPES,
  OBLIGATION_SUBJECT_LINK,
  obligationSubjectLinkId,
} from "./obligation-identifiers";

export {
  OBLIGATION_CATEGORIES,
  OBLIGATION_CATEGORY_OPTIONS,
  MONEY_BEARING_CATEGORIES,
  obligationCategoryLabel,
  isObligationCategory,
  type ObligationCategory,
} from "./obligation-category";

export {
  OBLIGATION_STATUSES,
  isObligationStatus,
  type ObligationStatus,
} from "./obligation-status";

export {
  OBLIGATION_RECURRENCE_KINDS,
  OBLIGATION_RECURRENCE_OPTIONS,
  isObligationRecurrenceKind,
  MAX_RECURRENCE_INTERVAL,
  describeObligationRecurrence,
  isIsoDate,
  addObligationDays,
  addObligationMonths,
  obligationDaysBetween,
  nextObligationDate,
  type ObligationRecurrenceKind,
} from "./obligation-recurrence";

export {
  ObligationValidationError,
  type ObligationValidationField,
} from "./obligation-errors";

export {
  evaluateObligation,
  DEFAULT_OBLIGATIONS_PAGE_SIZE,
  MAX_OBLIGATIONS_PAGE_SIZE,
  DEFAULT_ATTENTION_HORIZON_DAYS,
  MAX_ATTENTION_ITEMS,
  type Obligation,
  type ObligationMeterState,
  type ObligationMeterEvaluation,
  type ObligationState,
  type ObligationEvaluation,
  type ObligationInput,
  type CreateObligationInput,
  type UpdateObligationInput,
  type ObligationChangeResult,
  type CompleteObligationInput,
  type ObligationTaskOutcome,
  type ObligationFilters,
  type ListObligationsInput,
  type ObligationPage,
  type ObligationAttentionInput,
  type ObligationSubject,
} from "./obligation";

export {
  validateObligationAmount,
  reconcileObligationCurrency,
  type ObligationAmount,
} from "./obligation-money";

export {
  OBLIGATION_CURSOR_VERSION,
  InvalidObligationCursorError,
  obligationFilterKey,
  encodeObligationCursor,
  decodeObligationCursor,
  decodeObligationCursorForScope,
  type ObligationCursorPosition,
  type ObligationCursorScope,
  type DecodedObligationCursor,
} from "./obligation-cursor";

export {
  OBLIGATION_TITLE_MAX_LENGTH,
  OBLIGATION_DESCRIPTION_MAX_LENGTH,
  MAX_LEAD_DAYS,
  DEFAULT_LEAD_DAYS,
  MAX_METER_VALUE,
  validateObligation,
  validateObligationCompletion,
  validateObligationCategory,
  validateObligationStatus,
  validateRecurrenceKind,
  validateObligationsLimit,
  validateObligationFilters,
  validateObligationId,
  validateOptionalObligationId,
  validateObligationDate,
  validateOptionalObligationDate,
  validateObligationMeterValue,
  validateObligationMeterUnit,
  type ValidatedObligation,
  type ValidatedObligationCompletion,
  type ValidationMode,
  type MeterUnitVocabulary,
} from "./obligation-validation";

export type {
  ObligationRepository,
  ObligationWithSubject,
  ObligationWithSubjectPage,
  ObligationAttentionItem,
  ObligationSummary,
  CompleteObligationResult,
  ObligationProofRef,
  LinkObligationTaskResult,
  ObligationTaskReconciliation,
} from "./obligation-repository";
