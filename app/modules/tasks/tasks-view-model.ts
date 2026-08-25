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
 * wording to `tasks-presentation.ts` (one label vocabulary), so EVERY grouped view —
 * Time Sectors and the ordinary grouped List or Board — resolves through the one
 * `resolveGroupedSections`.
 */

import type { SerializedTaskListItem } from "~/shared/task-record/task-view";
import {
  relativeCalendarDate,
  taskPriorityTag,
  timeSectorLabel,
  toTaskRowProjection,
} from "~/shared/task-record/task-view";
import {
  collectionStateBreakdown,
  collectionStateSegment,
} from "~/shared/collection-layout";
import type {
  TaskPriority,
  TaskRelation,
  TaskSystemView,
  TimeSector,
} from "~/kernel/tasks";
import type { TaskGroupBy, TaskPresentation } from "~/kernel/task-views";

import type { TasksGrouping } from "./tasks-contract";
import { TASKS_FILTER_PARAMS } from "./tasks-url-state";
import {
  declaredBucketOrder,
  groupBucketLabel,
  showsEmptyBuckets,
} from "./tasks-presentation";

/**
 * The legacy `?view=` values earlier versions shipped, kept ONLY so existing links
 * keep working. Each is expressed in the CURRENT config vocabulary, and each is
 * reached by a one-way REDIRECT rather than a silent reinterpretation, so the address
 * bar always states the configuration that is actually applied.
 *
 * `focus` was a system view and `all` the absence of a filter (TASKS-03's premise);
 * both now mean "the list".
 *
 * `matrix` was a real presentation until V2.2 removed it (TASKS-05). It resolves to
 * the ordinary list GROUPED BY PRIORITY — the closest honest equivalent, because the
 * 2×2's cells were only ever the one stored priority field in a grid. The owner lands
 * on the same records, grouped by the same signal, in the primary workspace. It is
 * never an error page, and it never quietly drops the grouping either.
 */
export const LEGACY_PRIMARY_VIEWS: Record<
  string,
  {
    presentation: TaskPresentation;
    systemView: TaskSystemView;
    groupBy?: TaskGroupBy;
  }
> = {
  focus: { presentation: "list", systemView: "this_week" },
  all: { presentation: "list", systemView: "all" },
  matrix: { presentation: "list", systemView: "active", groupBy: "priority" },
  sectors: { presentation: "sectors", systemView: "active" },
};

/**
 * Rewrite a legacy `?view=` link into the current vocabulary, returning the params to
 * redirect to, or null when the URL needs no migration.
 */
export function migrateLegacyViewParams(
  params: URLSearchParams,
): URLSearchParams | null {
  const view = params.get("view");
  if (view === null || !(view in LEGACY_PRIMARY_VIEWS)) return null;
  const legacy = LEGACY_PRIMARY_VIEWS[view];
  // `sectors` is still a real presentation — it needs no migration.
  if (view === "sectors") return null;
  const next = new URLSearchParams(params);
  next.set("view", legacy.presentation);
  if (next.get("system") === null) next.set("system", legacy.systemView);
  // An explicit grouping already in the URL is the owner's, and wins.
  if (legacy.groupBy !== undefined && next.get("group") === null) {
    next.set("group", legacy.groupBy);
  }
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
  readonly sector: TimeSector | null;
  readonly sectorLabel: string;
  /**
   * The display state's KIND, carried alongside its words so a surface can
   * decide whether the state is worth drawing without matching on the label
   * (UIX-01: a list row draws no pill for `planned`/`inbox`, which restate the
   * planned date beside them).
   */
  readonly stateKind: string;
  readonly stateLabel: string;
  readonly stateTone: string;
  readonly dueDate: string | null;
  readonly scheduledDate: string | null;
  /**
   * The structural parent, for the row's inline parent editor (TASKS-05).
   *
   * UIX-01 carries the `kind` as well as the id and title: the row draws the
   * parent's ENTITY MARK beside its name, and a Project and an Area are two
   * different marks in two different identity colours. Deriving that from the
   * title would be guessing.
   */
  readonly parent: TaskRelation | null;
  readonly parentLabel: string | null;
  readonly delegatedTo: string | null;
  readonly completed: boolean;
  readonly waiting: boolean;
  /**
   * V2.4-GATE-02 — the kernel's "still owed" answer, from the shared projection.
   *
   * Spread in by `toTaskRowProjection` rather than derived here: this module
   * composes the shared row's contract, and a second copy of the commitment rule
   * is exactly what DEBT-197 was.
   */
  readonly stillOwed: boolean;
  /** The recurrence rule, for the row's shared recurrence signal (TASKS-07). */
  readonly recurrence: SerializedTaskListItem["recurrence"];
}

/**
 * Map a serialized list item into card-ready display data (pure).
 *
 * TODAY-TASK-01 — the ROW's half of this is now `toTaskRowProjection`, shared
 * with Today. What stays here is what only this module's card needs: the short
 * priority tag, the Time Sector's words, the delegatee and the flattened parent
 * label. Composing rather than restating is what makes the same task the same
 * row on both surfaces — there is one display-state derivation, not two that
 * happen to agree.
 */
export function toTaskCardData(item: SerializedTaskListItem): TaskCardData {
  return {
    ...toTaskRowProjection(item),
    priorityTag: taskPriorityTag(item.priority),
    sector: item.timeSector,
    sectorLabel: timeSectorLabel(item.timeSector),
    parentLabel: item.parent?.title ?? null,
    delegatedTo: item.delegation?.to ?? null,
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
  priority: {
    param: TASKS_FILTER_PARAMS.priorities,
    // CONTROL-01 — an `untriaged` bucket can only come from a cursor issued
    // before the query coalesced `null` into `p4`. It scopes to P4, which is
    // what those rows are, rather than to the retired `__none` filter.
    value: (key) => (key === "untriaged" ? "p4" : key),
  },
  sector: {
    param: TASKS_FILTER_PARAMS.timeSector,
    value: (key) => key,
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
 * Two rules, both taken from the planning view rather than invented:
 *
 *  - a CLOSED dimension renders in its DECLARED order, and — for Time Sectors only —
 *    every declared bucket appears even when empty, because a planning window with
 *    nothing in it is itself the useful fact. Every other dimension hides empty
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

/**
 * CONVERGE-01 §B — the Tasks state breakdown, for the collection's subtitle.
 *
 * "Tasks · 93 Tasks" repeats the page's own noun and answers a question nobody
 * asked. The audit's replacement is the shape Projects has drawn since
 * REDESIGN-04: what STATE the work is in — "63 active · 26 overdue · 4
 * waiting" — from figures the page already holds.
 *
 * ── The honesty rule, which is why this can return null ──────────────────────
 * These counts are derived from the tasks ON SCREEN. That is a complete, true
 * statement exactly when the page IS the collection; the moment another page
 * remains, "26 overdue" would mean "26 among the 50 we happened to load", which
 * reads as a total and is not one.
 *
 * So a bounded page gets `null` and the caller keeps the count line that
 * declares its own bound ("93 Tasks loaded"). A breakdown that is sometimes a
 * sample and never says so would be worse than the count it replaced. The
 * caller passes `hasMore` for a flat list, and for a GROUPED one whether any
 * bucket is still bounded — a grouped view whose every group is fully loaded is
 * as complete as a flat list that is.
 */
export function taskStateBreakdown(
  cards: readonly TaskCardData[],
  todayIso: string,
  options: { readonly bounded: boolean },
): string | null {
  if (options.bounded || cards.length === 0) return null;

  let overdue = 0;
  let waiting = 0;
  let done = 0;
  for (const card of cards) {
    if (card.completed) {
      done += 1;
      continue;
    }
    if (card.waiting) {
      waiting += 1;
      continue;
    }
    /*
     * V2.4-GATE-02 — the segment counts work that is late, not dates that have
     * passed.
     *
     * `relativeCalendarDate` is calendar arithmetic that has never seen the
     * Task, so on `/tasks?system=all` a CANCELLED or Someday/Maybe Task with a
     * passed deadline was counted into the Overdue segment of the bar above a
     * list whose rows correctly say it is not. `stillOwed` is the shared
     * projection's kernel answer; nothing is re-derived here.
     */
    if (
      card.stillOwed &&
      card.dueDate !== null &&
      relativeCalendarDate(card.dueDate, todayIso)?.urgency === "overdue"
    ) {
      overdue += 1;
    }
  }
  const active = cards.length - done - waiting - overdue;

  return collectionStateBreakdown([
    collectionStateSegment(active, "active"),
    collectionStateSegment(overdue, "overdue"),
    collectionStateSegment(waiting, "waiting"),
    collectionStateSegment(done, "done"),
  ]);
}
