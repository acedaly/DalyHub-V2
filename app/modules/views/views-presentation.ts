/**
 * X-02 — turning a cross-module result into words.
 *
 * Every label is resolved SERVER-side and stated as a fact the owner can check
 * against the record itself: "Overdue", "At risk", "3 actions open", "Week to
 * 10 Aug". There is deliberately no score, no percentage, no grade and no streak —
 * a cross-module view answers *what changed*, *what is stuck* and *what needs
 * attention*, never "how productive am I out of 100" (REVIEW-03's rule, kept).
 */

import type { DateFormat } from "~/kernel/preferences";
import type { CrossViewResult, ViewGroupBy, ViewScope } from "~/kernel/views";
import { viewScopeDefinition } from "~/kernel/views";
import { formatCalendarDate } from "~/shared/task-record/task-view";

import type { ViewResultGroup, ViewResultItem } from "./views-contract";

const TASK_STATUS_LABELS: Record<string, string> = {
  todo: "To do",
  in_progress: "In progress",
  on_hold: "On hold",
  cancelled: "Cancelled",
};

const PROJECT_STATUS_LABELS: Record<string, string> = {
  planned: "Planned",
  active: "Active",
  on_hold: "On hold",
};

const HEALTH_LABELS: Record<string, string> = {
  on_track: "On track",
  stale: "No recent movement",
  blocked: "Blocked",
  at_risk: "At risk",
  completed: "Completed",
};

const ALIGNMENT_LABELS: Record<string, string> = {
  completed: "Completed",
  no_structure: "No Projects yet",
  unreachable: "Nothing moving",
  active: "Moving",
  neglected: "Neglected",
};

const MEETING_STATUS_LABELS: Record<string, string> = {
  planned: "Planned",
  completed: "Held",
  cancelled: "Cancelled",
};

const REVIEW_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  in_progress: "In progress",
  completed: "Completed",
};

/** The module's own supporting words for a record. Never a derived judgement. */
function statusLabelOf(result: CrossViewResult): string | null {
  switch (result.detail.kind) {
    case "task": {
      const detail = result.detail;
      if (detail.completed) return "Completed";
      if (detail.waiting) return "Waiting";
      if (detail.someday) return "Someday / Maybe";
      return TASK_STATUS_LABELS[detail.status] ?? null;
    }
    case "project": {
      const detail = result.detail;
      if (detail.completed) return "Completed";
      const health = detail.health ? HEALTH_LABELS[detail.health] : null;
      const status = PROJECT_STATUS_LABELS[detail.workflowStatus] ?? null;
      // Health movement is stated in WORDS, with both states named, so the claim
      // is checkable — never an arrow or a colour on its own.
      if (
        detail.healthSinceLastReview &&
        detail.health &&
        detail.healthSinceLastReview !== detail.health
      ) {
        return `${HEALTH_LABELS[detail.healthSinceLastReview] ?? detail.healthSinceLastReview} → ${health ?? detail.health} since your last Review`;
      }
      return health ?? status;
    }
    case "goal": {
      const detail = result.detail;
      if (detail.completed) return "Completed";
      return detail.alignment
        ? (ALIGNMENT_LABELS[detail.alignment] ?? null)
        : null;
    }
    case "note": {
      const tags = result.detail.tags;
      return tags.length > 0 ? tags.slice(0, 3).join(" · ") : null;
    }
    case "meeting": {
      const detail = result.detail;
      const status = MEETING_STATUS_LABELS[detail.status] ?? null;
      if (detail.openActions > 0) {
        return `${status ? `${status} · ` : ""}${detail.openActions} action${detail.openActions === 1 ? "" : "s"} open`;
      }
      return status;
    }
    default:
      return REVIEW_STATUS_LABELS[result.detail.status] ?? null;
  }
}

/** A dated fact, phrased for the entity type it belongs to. */
function dateLabelOf(result: CrossViewResult, todayIso: string): string | null {
  if (result.detail.kind === "review") {
    const end = formatCalendarDate(result.detail.periodEnd);
    return end ? `Week to ${end}` : null;
  }
  if (result.dueDate === null) return null;
  const formatted = formatCalendarDate(result.dueDate);
  if (!formatted) return null;
  const prefix =
    result.detail.kind === "meeting"
      ? ""
      : result.detail.kind === "goal"
        ? "Target "
        : "Due ";
  if (result.dueDate < todayIso && !isClosed(result)) {
    return `Overdue — ${prefix.trim() ? prefix.toLowerCase().trim() + " " : ""}${formatted}`;
  }
  if (result.dueDate === todayIso) return `${prefix}today`.trim();
  return `${prefix}${formatted}`;
}

/**
 * Does this result's dated fact describe a date that has already passed on a
 * record still open? The same test `dateLabelOf` uses for its "Overdue — …"
 * phrasing, named once so the label and the row's colour cannot disagree.
 */
function isOverdue(result: CrossViewResult, todayIso: string): boolean {
  if (result.detail.kind === "review") return false;
  if (result.dueDate === null) return false;
  return result.dueDate < todayIso && !isClosed(result);
}

function isClosed(result: CrossViewResult): boolean {
  switch (result.detail.kind) {
    case "task":
    case "project":
    case "goal":
      return result.detail.completed;
    case "meeting":
      return result.detail.status !== "planned";
    case "review":
      return result.detail.status === "completed";
    default:
      return false;
  }
}

/** Serialise one result for the wire. `dateFormat` is reserved for a future
 * owner-format pass; the shared calendar formatter is the one used today. */
export function resultToItem(
  result: CrossViewResult,
  todayIso: string,
  _dateFormat: DateFormat,
): ViewResultItem {
  return {
    scope: result.scope,
    entityType: result.entityType,
    id: result.id,
    title: result.title,
    updatedAtIso: result.updatedAt.toISOString(),
    areaTitle: result.area?.title ?? null,
    projectTitle: result.project?.title ?? null,
    goalTitle: result.goal?.title ?? null,
    archived: result.archived,
    statusLabel: statusLabelOf(result),
    dateLabel: dateLabelOf(result, todayIso),
    overdue: isOverdue(result, todayIso),
    detail: result.detail,
  };
}

/**
 * Band the results. `entity` keeps each module's records together in the canonical
 * scope order — the reading order a mixed list needs to stay legible — and `none`
 * is one flat band in the query's own order.
 */
export function buildGroups(
  items: readonly ViewResultItem[],
  groupBy: ViewGroupBy,
): readonly ViewResultGroup[] {
  if (groupBy === "none") {
    return [{ id: "all", label: "Results", entityType: null, items }];
  }
  const byScope = new Map<ViewScope, ViewResultItem[]>();
  for (const item of items) {
    const bucket = byScope.get(item.scope);
    if (bucket) bucket.push(item);
    else byScope.set(item.scope, [item]);
  }
  const groups: ViewResultGroup[] = [];
  for (const [scope, bucket] of byScope) {
    const definition = viewScopeDefinition(scope);
    groups.push({
      id: scope,
      label: definition.plural,
      entityType: scope,
      items: bucket,
    });
  }
  return groups;
}
