/**
 * V2.13 Reports kernel — public surface.
 *
 * The definition, the closed source vocabulary, the deterministic executor and
 * the result family. Like every other kernel barrel this exposes only
 * storage-independent shapes and pure functions: the source ADAPTERS, which are
 * the only things here that touch a repository, are composed in
 * `app/platform/reports`.
 *
 * ── What a Report is ───────────────────────────────────────────────────────
 * A saved question, executed on open, over canonical domain reads. It stores no
 * answer, no aggregate, no snapshot and no cache; it is a third saved-view
 * KIND, so it costs a codec rather than a table (ADR-121). Nothing here is a
 * second analytics engine: "over time" remains `~/kernel/history`'s, and every
 * figure comes from the repository that already owns the fact.
 */

export {
  MAX_AHEAD_DAYS,
  MAX_CUSTOM_DAYS,
  REPORT_CONFIG_VERSION,
  REPORT_EMPTY_BUCKETS,
  REPORT_FILTER_KEYS,
  REPORT_FILTER_LABELS,
  REPORT_GROUPS,
  REPORT_GROUP_LABELS,
  REPORT_ID_MAX_LENGTH,
  REPORT_INCOMPATIBILITIES,
  REPORT_INCOMPATIBILITY_MESSAGES,
  REPORT_MEASURES,
  REPORT_SHAPES,
  REPORT_SORTS,
  REPORT_SORT_LABELS,
  REPORT_SOURCES,
  REPORT_UNITS,
  REPORT_VISUALS,
  REPORT_VISUAL_LABELS,
  REPORT_WINDOW_KINDS,
  SHAPE_VISUALS,
  breakdownShape,
  isDynamicWindow,
  isReportGroup,
  isReportMeasure,
  isReportSource,
  type ReportBreakdown,
  type ReportConfig,
  type ReportDefinition,
  type ReportEmptyBucket,
  type ReportFilterKey,
  type ReportFilters,
  type ReportGroup,
  type ReportIncompatibility,
  type ReportMeasureKey,
  type ReportShape,
  type ReportSort,
  type ReportSourceKey,
  type ReportUnit,
  type ReportVisual,
  type ReportWindow,
  type ReportWindowKind,
} from "./report-vocabulary";

export {
  REPORT_MEASURE_DEFINITIONS,
  REPORT_SOURCE_DEFINITIONS,
  availableReportSources,
  measureBreakdowns,
  reportMeasure,
  reportSource,
  shapeSorts,
  supportsBreakdown,
  supportsSort,
  supportsVisual,
  type ReportAggregation,
  type ReportMeasureDefinition,
  type ReportSourceDefinition,
} from "./report-source";

export {
  parseReportDefinition,
  reportDefinitionsEqual,
  reportFilterCount,
  serialiseReportDefinition,
  validateReportDefinitionForWrite,
} from "./report-config";

export { REPORT_CODEC } from "./report-codec";

export {
  REPORT_REFUSALS,
  checkReportConfig,
  reportWindowGrains,
  reportWindowLabel,
  reportWindowLength,
  resolveReportWindowDays,
  type ReportRefusal,
  type ReportRefusalCode,
  type ReportWindowDays,
} from "./report-window";

export {
  MAX_REPORT_GROUPS,
  MAX_REPORT_READINGS,
  REPORT_NOTE_CODES,
  reportIsAllZero,
  reportIsEmpty,
  reportIsMixedCurrency,
  unavailableReport,
  type ReportAvailability,
  type ReportBlock,
  type ReportNote,
  type ReportNoteCode,
  type ReportRemainder,
  type ReportResult,
  type ReportRow,
} from "./report-result";

export {
  executeReport,
  type ReportCell,
  type ReportExecution,
  type ReportExecutionContext,
  type ReportRead,
  type ReportReadRequest,
  type ReportSourceAdapter,
  type ReportSourceAdapters,
} from "./report-executor";

export {
  BUILT_IN_REPORTS,
  findBuiltInReport,
  isBuiltInReportId,
  type BuiltInReportDefinition,
} from "./report-builtins";
