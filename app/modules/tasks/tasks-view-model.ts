/**
 * TASKS-01 — the `/tasks` workspace view-model (pure, React-free, testable).
 *
 * The seam between the workspace-scoped read model (`SerializedTaskListItem[]`) the
 * loader returns and the display shapes the Tasks module renders: the card
 * derivations and the resolution of a SERVER grouping into ordered display
 * sections — kept out of React so they can be unit tested directly (ADR-043 §8).
 * It never fetches or mutates.
 *
 * TASKS-03 moved the URL state to `tasks-url-state.ts` (one config codec) and the
 * wording to `tasks-presentation.ts` (one label vocabulary), so this file no longer
 * carries a Matrix-shaped special case: EVERY grouped view — Matrix, Sectors, and
 * the ordinary grouped List or Board — resolves through the one
 * `resolveGroupedSections`.
 */

import type { SerializedTaskListItem } from "~/shared/task-record/task-view";
import {
  priorityQuadrant,
  taskDisplayState,
  taskPriorityTag,
  timeSectorLabel,
  type EisenhowerQuadrant,
} from "~/shared/task-record/task-view";
import type { TaskPriority, TaskSystemView, TimeSector } from "~/kernel/tasks";
import type { TaskPresentation } from "~/kernel/task-views";

import type { TasksGrouping } from "./tasks-contract";
import { TASKS_FILTER_PARAMS } from "./tasks-url-state";
import {
  declaredBucketOrder,
  groupBucketLabel,
  matrixSubtitle,
  showsEmptyBuckets,
} from "./tasks-presentation";

/**
 * The legacy `?view=` values TASKS-01 shipped, kept ONLY so existing links keep
 * working. TASKS-03 replaced the four "primary views" with one presentation
 * (`list`/`board`/`matrix`/`sectors`) plus explicit grouping, because "Focus" and
 * "All" were not layouts at all — they were a system view and no filter wearing a
 * layout switcher's clothes.
 *
 * `focus` therefore migrates to "the list, scoped to This Week" and `all` to "the
 * list, showing everything", each expressed in the ordinary config vocabulary. The
 * old URL keeps resolving to the same records; nothing new is built on it.
 */
export const LEGACY_PRIMARY_VIEWS: Record<
  string,
  { presentation: TaskPresentation; systemView: TaskSystemView }
> = {
  focus: { presentation: "list", systemView: "this_week" },
  all: { presentation: "list", systemView: "all" },
  matrix: { presentation: "matrix", systemView: "active" },
  sectors: { presentation: "sectors", systemView: "active" },
};

/**
 * Rewrite a legacy `?view=focus|all` link into the TASKS-03 vocabulary, returning
 * the params to redirect to, or null when the URL needs no migration. A one-way
 * redirect (never a silent reinterpretation) keeps the address bar honest about
 * which configuration is actually applied.
 */
export function migrateLegacyViewParams(
  params: URLSearchParams,
): URLSearchParams | null {
  const view = params.get("view");
  if (view === null || !(view in LEGACY_PRIMARY_VIEWS)) return null;
  const legacy = LEGACY_PRIMARY_VIEWS[view];
  // `matrix`/`sectors` are still real presentations — they need no migration.
  if (view === "matrix" || view === "sectors") return null;
  const next = new URLSearchParams(params);
  next.set("view", legacy.presentation);
  if (next.get("system") === null) next.set("system", legacy.systemView);
  return next;
}

/** A card-ready presentation of a task (pure). */
export interface TaskCardData {
  readonly id: string;
  readonly title: string;
  /** The raw priority — drives the shared `PriorityIndicator` (TASKS-02). */
  readonly priority: TaskPriority | null;
  /** The short priority tag ("P1"…"P4" / "—"), for text-only contexts. */
  readonly priorityTag: string;
  readonly quadrant: EisenhowerQuadrant | null;
  readonly sector: TimeSector | null;
  readonly sectorLabel: string;
  readonly stateLabel: string;
  readonly stateTone: string;
  readonly dueDate: string | null;
  readonly scheduledDate: string | null;
  readonly parentLabel: string | null;
  readonly delegatedTo: string | null;
  readonly completed: boolean;
  readonly waiting: boolean;
}

/** Map a serialized list item into card-ready display data (pure). */
export function toTaskCardData(item: SerializedTaskListItem): TaskCardData {
  const state = taskDisplayState({
    deletedAt: null,
    completedAt: item.completedAt,
    status: item.status,
    commitmentState: item.commitmentState,
    timeSector: item.timeSector,
    scheduledDate: item.scheduledDate,
    waiting: item.waiting,
  });
  return {
    id: item.id,
    title: item.title,
    priority: item.priority,
    priorityTag: taskPriorityTag(item.priority),
    quadrant: priorityQuadrant(item.priority),
    sector: item.timeSector,
    sectorLabel: timeSectorLabel(item.timeSector),
    stateLabel: state.label,
    stateTone: state.tone,
    dueDate: item.dueDate,
    scheduledDate: item.scheduledDate,
    parentLabel: item.parent?.title ?? null,
    delegatedTo: item.delegation?.to ?? null,
    completed: item.completedAt !== null,
    waiting: item.waiting !== null && item.completedAt === null,
  };
}

/* -------------------------------------------------------------------------- */
/* Server-authoritative grouping — ADR-043 decision 12, widened by TASKS-03    */
/* -------------------------------------------------------------------------- */

/**
 * A display section resolved from the SERVER grouping: an authoritative `count`
 * (independent of how many records loaded), a bounded slice of `cards`, and
 * `hasMore` (the rest are reached through the equivalent filtered flat view).
 *
 * `filterParam`/`filterKey` name the URL filter that isolates exactly this bucket,
 * so "View all N" always lands on the same records the count promised. They are
 * `null` for a dimension with no equivalent single-dimension filter, in which case
 * no drill-down link is offered rather than one that would lie.
 */
export interface GroupedSection {
  readonly key: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly filterParam: string | null;
  readonly filterKey: string | null;
  readonly count: number;
  readonly cards: TaskCardData[];
  readonly hasMore: boolean;
}

/**
 * The URL filter parameter that isolates one bucket of a grouping dimension, and
 * the translation from a server bucket key to that filter's value.
 *
 * `parent` maps to no single parameter because a parent bucket may be a Project OR
 * an Area, and the row does not say which — so a parent group offers no drill-down
 * rather than a link that could scope to the wrong dimension.
 */
const BUCKET_FILTERS: Record<
  string,
  { param: string; value: (key: string) => string | null }
> = {
  quadrant: {
    param: TASKS_FILTER_PARAMS.priority,
    value: (key) => (key === "untriaged" ? "__none" : key),
  },
  priority: {
    param: TASKS_FILTER_PARAMS.priority,
    value: (key) => (key === "untriaged" ? "__none" : key),
  },
  sector: {
    param: TASKS_FILTER_PARAMS.timeSector,
    value: (key) => (key === "inbox" ? "__none" : key),
  },
  status: {
    param: TASKS_FILTER_PARAMS.status,
    value: (key) => (key === "completed" ? null : key),
  },
  due_state: { param: TASKS_FILTER_PARAMS.dueState, value: (key) => key },
  planned: { param: TASKS_FILTER_PARAMS.plannedState, value: (key) => key },
  delegate: {
    param: TASKS_FILTER_PARAMS.delegatedTo,
    value: (key) => (key === "__none" ? null : key),
  },
};

/** Index a server grouping by bucket key for O(1) section lookup. */
function indexGrouping(grouping: TasksGrouping | null): Map<
  string,
  {
    count: number;
    cards: TaskCardData[];
    hasMore: boolean;
    label: string | null;
  }
> {
  const byKey = new Map<
    string,
    {
      count: number;
      cards: TaskCardData[];
      hasMore: boolean;
      label: string | null;
    }
  >();
  if (!grouping) return byKey;
  for (const group of grouping.groups) {
    byKey.set(group.key, {
      count: group.count,
      cards: group.items.map(toTaskCardData),
      hasMore: group.hasMore,
      label: group.label ?? null,
    });
  }
  return byKey;
}

/**
 * Resolve a server grouping into ordered display sections (pure).
 *
 * Two rules, both taken from the specialist views rather than invented:
 *
 *  - a CLOSED dimension renders in its DECLARED order, and — for the Matrix and
 *    Time Sectors only — every declared bucket appears even when empty, because a
 *    matrix missing a quadrant is not a matrix. Every other dimension hides empty
 *    buckets, where they would only be noise;
 *  - an OPEN-ENDED dimension (parent, delegate) is ordered by size, then by label,
 *    so the biggest group of work leads and the order is still deterministic.
 */
export function resolveGroupedSections(
  grouping: TasksGrouping | null,
): GroupedSection[] {
  if (!grouping) return [];
  const dimension = grouping.dimension;
  const byKey = indexGrouping(grouping);
  const filter = BUCKET_FILTERS[dimension];
  const build = (key: string): GroupedSection => {
    const bucket = byKey.get(key);
    const filterKey = filter ? filter.value(key) : null;
    return {
      key,
      title: groupBucketLabel(dimension, key, bucket?.label ?? null),
      subtitle: matrixSubtitle(key),
      filterParam: filterKey === null ? null : (filter?.param ?? null),
      filterKey,
      count: bucket?.count ?? 0,
      cards: bucket?.cards ?? [],
      hasMore: bucket?.hasMore ?? false,
    };
  };

  const declared = declaredBucketOrder(dimension);
  if (declared) {
    const keepEmpty = showsEmptyBuckets(dimension);
    return declared
      .filter((key) => keepEmpty || (byKey.get(key)?.count ?? 0) > 0)
      .map(build);
  }

  return [...byKey.entries()]
    .map(([key]) => build(key))
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title) || 0);
}
