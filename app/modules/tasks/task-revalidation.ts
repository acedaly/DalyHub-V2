/**
 * TASKS-09 — WHEN a row mutation has to re-read the server (pure, React-free, testable).
 *
 * Until V2.2.1 the `/tasks` workspace revalidated after EVERY change. That rule
 * conflated two different questions — *what does the client show while a write is in
 * flight* and *is the loader's answer still true* — and paid the second question's
 * price for every instance of the first. A priority change on an unsorted, unfiltered
 * list re-ran the app-shell loader and the tasks loader (a preferences read, four
 * concurrent option reads, the task query and its grouping) to learn that one row now
 * says P2, which the client already knew.
 *
 * The honest question is narrower: **could this change move the row out of — or
 * reorder it inside — the configuration currently on screen?** That is answerable
 * purely, from the `TaskViewConfig` alone, and it is what this module answers.
 *
 * It is deliberately CONSERVATIVE. Every rule here is derived from the repository's
 * own predicates (`#appendViewClause`, `#workspaceSortSpec`, `toWorkspaceFilters`,
 * `groupDimensionFor`), and when a mutation's consequence cannot be modelled — a
 * recurrence series operation, a soft delete — the answer is "revalidate". A missed
 * revalidation shows the owner a stale row; a redundant one only costs time. The
 * asymmetry is the reason this file errs the way it does.
 *
 * ADR-086 records the presentation/announcement split this serves.
 */

import type { TaskSort, TaskSystemView } from "~/kernel/tasks";
import type { TaskViewConfig } from "~/kernel/task-views";
import type { WorkspaceTaskGroupDimension } from "~/kernel/tasks";

import { groupDimensionFor } from "./tasks-url-state";

/**
 * What a mutation CHANGES about a task, in the vocabulary the view configuration
 * filters, groups and sorts by. Not a field list — `plannedDate` is the scheduled
 * date, `commitment` is Someday/Maybe — because the view speaks in these terms.
 */
export type TaskMutationEffect =
  /** The spine's `completed_at` moved (complete / reopen). */
  | "completion"
  /** The task entered or left the soft-deleted population. */
  | "deletion"
  | "title"
  | "priority"
  | "dueDate"
  /** The owner's scheduled ("planned") date. */
  | "plannedDate"
  /** The structural parent — a Project, an Area, or the Inbox. */
  | "parent"
  | "sector"
  | "status"
  /** Active ↔ Someday/Maybe. */
  | "commitment"
  | "delegation"
  | "waiting"
  /**
   * A recurrence-SERIES operation (skip, stop repeating). Its consequences reach
   * dates, the rule and possibly a successor record, so it is never modelled — it
   * always revalidates.
   */
  | "series";

/**
 * Effects that ALWAYS require a re-read, whatever the configuration.
 *
 * `deletion` moves a row between the ordinary population and the Deleted view, which
 * every configuration is scoped by; `series` can materialise or withdraw a whole
 * second record the client has never seen.
 */
const ALWAYS_REVALIDATE: ReadonlySet<TaskMutationEffect> = new Set([
  "deletion",
  "series",
]);

/**
 * The canonical mutation intents reachable from a row or the bulk bar, and what each
 * one changes. Declaring them here — rather than passing an effect list at each call
 * site — is what keeps "what does `plan` change?" answerable in one place, and what
 * makes the predicate testable without rendering anything.
 */
export const TASK_MUTATION_EFFECTS: Readonly<
  Record<string, readonly TaskMutationEffect[]>
> = {
  complete: ["completion"],
  reopen: ["completion"],
  rename: ["title"],
  set_priority: ["priority"],
  set_due: ["dueDate"],
  plan: ["plannedDate"],
  clear_plan: ["plannedDate"],
  set_parent: ["parent"],
  set_sector: ["sector"],
  set_status: ["status"],
  set_commitment: ["commitment"],
  set_delegation: ["delegation"],
  set_waiting: ["waiting"],
  skip_occurrence: ["series"],
  set_recurrence: ["series"],
  delete: ["deletion"],
  restore: ["deletion"],
};

/**
 * The effects of a canonical intent. An intent this table does not know is treated as
 * changing everything — an unrecognised write is exactly the case where guessing
 * "nothing moved" would be wrong.
 */
export function taskMutationEffects(
  intent: string,
): readonly TaskMutationEffect[] {
  return TASK_MUTATION_EFFECTS[intent] ?? ["deletion"];
}

/** The three states every ACTIVE-EXECUTION system view excludes (`notTerminal`). */
const NOT_TERMINAL: readonly TaskMutationEffect[] = [
  "completion",
  "status",
  "commitment",
];

/**
 * What each system view's MEMBERSHIP depends on, mirroring
 * `D1TaskRepository#appendViewClause` clause for clause.
 *
 * `all` and `deleted` are empty because neither narrows by any mutable attribute —
 * `all` is every live task and `deleted` is every soft-deleted one, and the transition
 * between those two populations is `deletion`, which always revalidates.
 */
const SYSTEM_VIEW_EFFECTS: Readonly<
  Record<TaskSystemView, readonly TaskMutationEffect[]>
> = {
  all: [],
  deleted: [],
  // PLAN-01's OPEN scope: not completed, not cancelled, not someday. It keeps the
  // parked states, so — unlike `active` — a waiting change cannot move a Task in
  // or out of it and `waiting` is deliberately absent.
  open: ["completion", "status", "commitment"],
  // The active planning scope: not completed, not cancelled/on_hold, not someday,
  // not waiting.
  active: ["completion", "status", "commitment", "waiting"],
  completed: ["completion"],
  cancelled: ["completion", "status"],
  someday: ["completion", "commitment"],
  waiting: ["completion", "waiting", "commitment"],
  inbox: [...NOT_TERMINAL, "parent"],
  today: [...NOT_TERMINAL, "waiting", "plannedDate"],
  upcoming: [...NOT_TERMINAL, "waiting", "plannedDate", "dueDate"],
  overdue: [...NOT_TERMINAL, "waiting", "plannedDate", "dueDate"],
  this_week: [...NOT_TERMINAL, "sector"],
  next_week: [...NOT_TERMINAL, "sector"],
  this_month: [...NOT_TERMINAL, "sector"],
  next_month: [...NOT_TERMINAL, "sector"],
  long_term: [...NOT_TERMINAL, "sector"],
  routines: [...NOT_TERMINAL, "sector"],
};

/** What each server grouping dimension buckets by. */
const GROUP_DIMENSION_EFFECTS: Readonly<
  Record<WorkspaceTaskGroupDimension, readonly TaskMutationEffect[]>
> = {
  priority: ["priority"],
  // The derived due state calls an OPEN task overdue and a completed one `due_past`,
  // so completing a task re-buckets it without its date moving.
  due_state: ["dueDate", "completion"],
  planned: ["plannedDate"],
  status: ["status"],
  parent: ["parent"],
  delegate: ["delegation"],
  sector: ["sector"],
};

/** What each sort ORDERS by — a change to which reorders the list. */
const SORT_EFFECTS: Readonly<Record<TaskSort, readonly TaskMutationEffect[]>> =
  {
    // The smart order is one comparable string: open-before-completed, then overdue,
    // then priority, then due date.
    smart: ["completion", "priority", "dueDate"],
    due_date: ["dueDate"],
    scheduled_date: ["plannedDate"],
    priority: ["priority"],
    created: [],
    // `updated` orders by a column EVERY mutation writes — handled as `anyChange`.
    updated: [],
    title: ["title"],
    parent: ["parent"],
  };

/**
 * Everything the configuration currently on screen is sensitive to.
 *
 * `anyChange` is the one dimension that cannot be expressed as an effect set: an
 * `updated` sort and an `updatedWithin` filter both read `entities.updated_at`, which
 * every write touches, so under either of them nothing is safe to skip.
 */
export interface TaskViewSensitivity {
  readonly effects: ReadonlySet<TaskMutationEffect>;
  readonly anyChange: boolean;
}

export function taskViewSensitivity(
  config: TaskViewConfig,
): TaskViewSensitivity {
  const effects = new Set<TaskMutationEffect>(
    SYSTEM_VIEW_EFFECTS[config.systemView] ?? NOT_TERMINAL,
  );
  let anyChange = false;

  const filters = config.filters;
  if (filters.status !== undefined) effects.add("status");
  if (filters.priorities !== undefined) effects.add("priority");
  if (filters.dueState !== undefined) {
    effects.add("dueDate");
    effects.add("completion");
  }
  if (filters.plannedState !== undefined) effects.add("plannedDate");
  // PLAN-01 / SMART-01 — an explicit date window depends on exactly the field it
  // reads, and on nothing else.
  if (filters.dueFrom !== undefined || filters.dueTo !== undefined) {
    effects.add("dueDate");
  }
  if (filters.plannedFrom !== undefined || filters.plannedTo !== undefined) {
    effects.add("plannedDate");
  }
  // A recurrence filter's membership depends on whether a rule EXISTS, which only
  // a series operation changes — and a series operation always revalidates. It is
  // named anyway so the dependency is stated rather than left implicit.
  if (filters.recurring !== undefined) effects.add("series");
  if (
    filters.parentKind !== undefined ||
    filters.projectId !== undefined ||
    filters.areaId !== undefined ||
    filters.goalId !== undefined
  ) {
    effects.add("parent");
  }
  if (filters.timeSector !== undefined) effects.add("sector");
  if (filters.delegatedTo !== undefined || filters.delegated !== undefined) {
    effects.add("delegation");
  }
  if (filters.waiting !== undefined) effects.add("waiting");
  if (filters.someday !== undefined) effects.add("commitment");
  if (filters.completed !== undefined) effects.add("completion");
  // `createdWithin` reads `created_at`, which no mutation moves.
  if (filters.updatedWithin !== undefined) anyChange = true;

  const dimension = groupDimensionFor(config);
  if (dimension !== null) {
    for (const effect of GROUP_DIMENSION_EFFECTS[dimension] ?? []) {
      effects.add(effect);
    }
  }

  if (config.sort === "updated") {
    anyChange = true;
  } else {
    for (const effect of SORT_EFFECTS[config.sort] ?? []) effects.add(effect);
  }

  return { effects, anyChange };
}

/**
 * Could this mutation move the row out of — or reorder it inside — the configuration
 * on screen? The one question `/tasks` asks before spending four sequential hops on a
 * re-read.
 */
export function shouldRevalidateTasks(
  config: TaskViewConfig,
  effects: readonly TaskMutationEffect[],
): boolean {
  if (effects.length === 0) return false;
  if (effects.some((effect) => ALWAYS_REVALIDATE.has(effect))) return true;
  const sensitivity = taskViewSensitivity(config);
  if (sensitivity.anyChange) return true;
  return effects.some((effect) => sensitivity.effects.has(effect));
}

/** The same question, asked with a canonical intent name instead of an effect list. */
export function shouldRevalidateTasksForIntent(
  config: TaskViewConfig,
  intent: string,
): boolean {
  return shouldRevalidateTasks(config, taskMutationEffects(intent));
}
