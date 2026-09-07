/**
 * V2.13 RPT-03 — the trusted seam between a workspace scope and the executor.
 *
 * One function. Every Reports surface — the report page, the builder's preview,
 * a saved report, a built-in — goes through it, so there is exactly one place
 * the owner's day, the owner's timezone, the module-visibility check and the
 * adapters are assembled. A second assembly would be a second set of defaults.
 *
 * It reads no store itself: the adapters do, through the repositories that own
 * the facts.
 */

import {
  availableReportSources,
  executeReport,
  type ReportConfig,
  type ReportExecution,
} from "~/kernel/reports";
import type { WorkspaceScope } from "~/platform/workspaces";
import { ownerDayStartInstant } from "~/shared/datetime";

import { createReportAdapters } from "./report-adapters.server";

/** What a report needs to know about the owner before it can be executed. */
export interface ReportExecutionInput {
  readonly scope: WorkspaceScope;
  readonly todayIso: string;
  readonly timeZone: string;
  /** The modules the owner has hidden, so a report over one is refused. */
  readonly hiddenModuleIds?: readonly string[];
  readonly now?: Date;
}

/**
 * Execute one definition against the owner's workspace.
 *
 * The module-visibility check happens BEFORE any row is read — the rule
 * `availableViewScopes` established for cross-module views — so a report naming
 * a module the owner later disabled cannot leak that module's data. The saved
 * definition itself is untouched: what is unavailable is reported, not deleted.
 */
export async function runReport(
  config: ReportConfig,
  input: ReportExecutionInput,
): Promise<ReportExecution> {
  return executeReport(config, {
    todayIso: input.todayIso,
    // The owner's midnight, resolved once and handed down — exactly as
    // `buildActivityWindow` takes it, so no read here carries a timezone rule.
    startOfOwnerDay: (dayIso) => ownerDayStartInstant(dayIso, input.timeZone),
    availableSources: availableReportSources(input.hiddenModuleIds ?? []),
    adapters: createReportAdapters(input.scope),
    now: input.now ?? new Date(),
  });
}
