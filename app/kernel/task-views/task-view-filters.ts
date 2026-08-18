/**
 * TASKS-03 / SMART-01 — the declarative configuration → repository filter
 * translation (pure, React-free, storage-free).
 */

import type { TaskPriority, WorkspaceTaskFilters } from "~/kernel/tasks";

import type { TaskViewConfig } from "./task-view-config";

/**
 * Translate a validated {@link TaskViewConfig}'s filters into the repository's
 * {@link WorkspaceTaskFilters}.
 *
 * The ONE place a declarative view configuration becomes a repository query. It
 * lives in the kernel rather than in the Tasks module because it has TWO
 * consumers: the `/tasks` collection, and Weekly Planning running a saved view as
 * its "Still to place" scope. That is the whole of SMART-01's claim — one filter
 * vocabulary, two surfaces — and it is only true if there is one translation.
 *
 * Nothing here reaches SQL: it maps validated dimensions to the repository's own
 * validated filter shape, and the repository chooses the predicate (ADR-059).
 */
export function toWorkspaceFilters(
  config: TaskViewConfig,
): WorkspaceTaskFilters {
  const f = config.filters;
  const out: {
    -readonly [K in keyof WorkspaceTaskFilters]: WorkspaceTaskFilters[K];
  } = {};
  // `__none` is the explicit "this field is empty" filter — it maps to an explicit
  // null so the repository queries `IS NULL`, distinct from "no filter" (absent).
  if (f.priorities && f.priorities.length > 0) {
    out.priorities = f.priorities.map((value) =>
      value === "__none" ? null : (value as TaskPriority),
    );
  }
  if (f.timeSector === "__none") out.timeSector = null;
  else if (f.timeSector) out.timeSector = f.timeSector;
  if (f.status) out.status = f.status;
  if (f.dueState) out.dueState = f.dueState;
  if (f.plannedState) out.plannedState = f.plannedState;
  if (f.parentKind) out.parentKind = f.parentKind;
  if (f.projectId) out.projectId = f.projectId;
  if (f.areaId) out.areaId = f.areaId;
  if (f.goalId) out.goalId = f.goalId;
  if (f.delegatedTo) out.delegatedTo = f.delegatedTo;
  if (f.delegated) out.delegatedOnly = true;
  if (f.waiting) out.waitingOnly = true;
  // Someday/Maybe is the COMMITMENT state, not a status or a priority (ADR-043 §4).
  if (f.someday) out.commitmentState = "someday";
  if (f.createdWithin) out.createdWithin = f.createdWithin;
  if (f.updatedWithin) out.updatedWithin = f.updatedWithin;
  if (f.completed) out.completedVisibility = f.completed;
  if (f.dueFrom) out.dueFrom = f.dueFrom;
  if (f.dueTo) out.dueTo = f.dueTo;
  if (f.plannedFrom) out.plannedFrom = f.plannedFrom;
  if (f.plannedTo) out.plannedTo = f.plannedTo;
  if (f.recurring !== undefined) out.recurring = f.recurring;
  return out;
}
