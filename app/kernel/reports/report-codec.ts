/**
 * V2.13 RPT-00 — the report definition's saved-view CODEC.
 *
 * This file is the WHOLE of what the `report` kind adds to the saved-view
 * storage layer. `D1SavedViewRepository<TConfig>` is codec-driven: it knows how
 * to store "a name plus a validated config of a kind" and nothing about what
 * any particular config means, so a kind contributes a parser, a canonical
 * serialiser and a write validator — never a table, a repository, an SQL path,
 * an export collection or a migration.
 *
 * The `kind` column carries no `CHECK` (migration `0036`), the config column's
 * `length(config) <= 4096` bound is ample for a bounded definition, and both
 * the snapshot and the restore descriptors already carry `kind` — so a report
 * row exports and restores with no code change at all. **RPT-00 ships zero
 * migrations**, and that is a measurement rather than an aspiration.
 *
 * The `TConfig` here is `ReportDefinition` rather than `ReportConfig`, because
 * the read path must be TOTAL and a definition this build cannot read must not
 * silently become a different question — see `report-config.ts`.
 */

import type { SavedViewCodec } from "~/kernel/views";

import {
  parseReportDefinition,
  reportDefinitionsEqual,
  serialiseReportDefinition,
  validateReportDefinitionForWrite,
} from "./report-config";
import {
  REPORT_CONFIG_VERSION,
  type ReportDefinition,
} from "./report-vocabulary";

export const REPORT_CODEC: SavedViewCodec<ReportDefinition> = {
  kind: "report",
  version: REPORT_CONFIG_VERSION,
  parse: parseReportDefinition,
  validateForWrite: validateReportDefinitionForWrite,
  serialise: serialiseReportDefinition,
  equals: reportDefinitionsEqual,
};
