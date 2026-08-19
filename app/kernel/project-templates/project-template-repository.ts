/**
 * PROJECT-02 Project templates — the authoritative domain repository contract.
 *
 * Storage-independent: it speaks domain terms (camelCase records, `Date`s,
 * typed errors) and never exposes D1, SQL or Cloudflare types. The D1 adapter
 * (`app/platform/storage/d1`) implements it.
 *
 * WORKSPACE-BOUND (ADR-010): constructed with a single `WorkspaceContext`, and
 * every method operates only within it. No method accepts a `workspaceId`, and
 * the trusted Activity actor is bound at construction — module code cannot
 * pass, select or spoof scope or actor. A template in another workspace is
 * INDISTINGUISHABLE from one that does not exist.
 *
 * ── The two guarantees this contract exists to make ──────────────────────────
 *
 * 1. **Instantiation is ATOMIC.** {@link instantiate} writes the Project, its
 *    structural link, every Task, every Task detail row, every checklist item
 *    and the Activity events as ONE D1 batch — a single SQL transaction. There
 *    is no state in which a Project exists holding seven of its twelve Tasks.
 *
 * 2. **Bounds are enforced INSIDE the write.** Every bound below is asserted by
 *    the mutating statement itself, evaluated at commit, never by a read
 *    followed by a decision in TypeScript. That is the TASKS-13 lesson taken
 *    forward: a read-before-write is not a concurrency guarantee, and two
 *    devices adding the fortieth task at the same moment must not both succeed.
 */

import type {
  InstantiateTemplateInput,
  InstantiateTemplateResult,
  ProjectTemplateDetail,
  ProjectTemplateHeaderInput,
  ProjectTemplatePage,
  ProjectTemplateSummary,
  ProjectTemplateTask,
} from "./project-template";
import type { TaskPriority } from "~/kernel/tasks";

/** What a template task's editable fields look like. */
export interface ProjectTemplateTaskInput {
  readonly title?: string;
  readonly description?: string | null;
  readonly priority?: TaskPriority | null;
}

/** The outcome of a narrow mutation: did anything actually change? */
export interface ProjectTemplateChangeResult {
  readonly changed: boolean;
}

export interface ProjectTemplateRepository {
  /* ---------------------------------------------------------------------- */
  /* Reads                                                                   */
  /* ---------------------------------------------------------------------- */

  /**
   * A bounded page of the workspace's templates, newest-updated first, with the
   * task and checklist COUNTS resolved for the whole page in ONE grouped
   * aggregate each — never a query per template. `hasMore` is true when the
   * workspace holds more than the page returned.
   */
  listTemplates(options?: {
    readonly limit?: number;
  }): Promise<ProjectTemplatePage>;

  /**
   * ONE template's summary, or `null` when there is no such active template in
   * this workspace.
   */
  getTemplate(id: string): Promise<ProjectTemplateSummary | null>;

  /**
   * ONE template with its full ordered contents: every task in `(position,
   * created_at, id)` order, each with its own ordered checklist. Bounded by
   * construction — a template can hold at most `MAX_TEMPLATE_TASKS` tasks and
   * `MAX_TEMPLATE_CHECKLIST_ITEMS` checklist items — and read in a fixed number
   * of statements whatever it holds. `null` for an unknown/deleted/
   * cross-workspace id.
   */
  getTemplateDetail(id: string): Promise<ProjectTemplateDetail | null>;

  /* ---------------------------------------------------------------------- */
  /* Template lifecycle                                                      */
  /* ---------------------------------------------------------------------- */

  /**
   * Create an EMPTY template: the `entities` row, its detail row and
   * `project_template.created`, atomically. No spine record is written, which
   * is what keeps a template out of every Project and Task surface.
   */
  createTemplate(
    input: ProjectTemplateHeaderInput & { readonly name: string },
  ): Promise<ProjectTemplateSummary>;

  /**
   * Capture an existing PROJECT as a new template, atomically.
   *
   * What is copied and what is deliberately not is stated on the domain model
   * and in `docs/design/PROJECT_02_PROJECT_TEMPLATES_2026_08.md`. In short: the
   * Project's open, non-someday Tasks become template tasks by TITLE,
   * DESCRIPTION and PRIORITY, in their current order, each carrying its
   * checklist STRUCTURE. Completed and cancelled Tasks, every date, every
   * waiting/delegation state, every checklist tick, all Activity and every
   * historical timestamp are left behind.
   *
   * Refuses rather than truncating when the Project holds more than a template
   * may (`ProjectTemplateTooLargeError`), because a template that silently
   * dropped thirty tasks would be a shape that lies.
   */
  createTemplateFromProject(
    projectId: string,
    input?: { readonly name?: string; readonly description?: string | null },
  ): Promise<ProjectTemplateSummary>;

  /**
   * Update a template's header. Every field is optional; an omitted field is
   * left unchanged and an explicit `null` clears a nullable one. An update that
   * changes nothing reports `changed: false` and writes nothing.
   */
  updateTemplate(
    id: string,
    input: ProjectTemplateHeaderInput,
  ): Promise<ProjectTemplateChangeResult>;

  /**
   * Soft-delete a template through the SHARED entity lifecycle, atomically with
   * `project_template.deleted`.
   *
   * A template is reusable configuration rather than execution history, so
   * there is no separate archive state to put it in — the one reversible
   * lifecycle every DalyHub record has is enough. Its task and checklist rows
   * are RETAINED, exactly as a soft-deleted Task retains its checklist, so a
   * restore is faithful.
   *
   * Deleting a template NEVER touches a Project created from it. There is no
   * reference to cut: provenance lives in an Activity event, and Activity is
   * append-only.
   *
   * Idempotent — deleting an already-deleted template reports `changed: false`.
   */
  deleteTemplate(id: string): Promise<ProjectTemplateChangeResult>;

  /* ---------------------------------------------------------------------- */
  /* Template contents                                                       */
  /* ---------------------------------------------------------------------- */

  /**
   * Append one task to the END of a template, atomically.
   *
   * The position is resolved from `MAX(position) + 1` INSIDE the write, and the
   * `MAX_TEMPLATE_TASKS` bound is asserted by the same statement, so two tasks
   * added at once can neither claim the same slot nor both pass at the bound.
   */
  addTask(
    templateId: string,
    input: { readonly title: string } & ProjectTemplateTaskInput,
  ): Promise<ProjectTemplateTask>;

  /** Update one template task's title, description and/or priority. */
  updateTask(
    templateId: string,
    taskId: string,
    input: ProjectTemplateTaskInput,
  ): Promise<ProjectTemplateChangeResult>;

  /**
   * Delete one template task and CLOSE THE GAP, atomically: the row, its
   * checklist items, and a renumber of every later task so positions stay
   * dense. Deleting a task that is already gone is an idempotent no-op.
   */
  deleteTask(
    templateId: string,
    taskId: string,
  ): Promise<ProjectTemplateChangeResult>;

  /**
   * Set the whole order of ONE template's tasks, atomically.
   *
   * The submitted list must name EXACTLY the template's current tasks — every
   * one, each once. Anything else is refused with
   * `ProjectTemplateTaskNotFoundError` and NOTHING is written, because a
   * partial reorder would invent an order the owner never chose.
   *
   * The WRITE is atomic — one batch renumbers every row. The CHECK is not: it
   * runs against the same read, in the same request, so a task added by another
   * device between the read and the write keeps its own position and the list
   * is briefly non-dense until the next mutation. The canonical
   * `(position, created_at, id)` read order stays total either way, so the list
   * is never ambiguous — only untidy. This is TASKS-13's bargain, unchanged.
   */
  reorderTasks(
    templateId: string,
    orderedTaskIds: readonly string[],
  ): Promise<ProjectTemplateChangeResult>;

  /**
   * Append one checklist item to the END of a template task, atomically. BOTH
   * bounds — the per-task one and the template's total — are asserted by the
   * inserting statement.
   */
  addChecklistItem(
    templateId: string,
    taskId: string,
    input: { readonly title: string },
  ): Promise<ProjectTemplateChangeResult>;

  /** Rename one checklist item. Narrow by construction: title and nothing else. */
  renameChecklistItem(
    templateId: string,
    itemId: string,
    title: string,
  ): Promise<ProjectTemplateChangeResult>;

  /** Delete one checklist item and close the gap, atomically. Idempotent. */
  deleteChecklistItem(
    templateId: string,
    itemId: string,
  ): Promise<ProjectTemplateChangeResult>;

  /** Set the whole order of ONE template task's checklist, atomically. */
  reorderChecklist(
    templateId: string,
    taskId: string,
    orderedItemIds: readonly string[],
  ): Promise<ProjectTemplateChangeResult>;

  /* ---------------------------------------------------------------------- */
  /* Instantiation                                                           */
  /* ---------------------------------------------------------------------- */

  /**
   * Create a REAL Project from a template, in ONE atomic batch.
   *
   * Every written row gets a FRESH id from the repository's generator: the
   * Project, each Task, each structural EntityLink and each checklist item.
   * Nothing points back at the template, and the template is not touched.
   *
   * Every created Task starts OPEN, `todo`, `active`, with no due date, no
   * planned date, no sector, no waiting state, no delegation and no recurrence
   * — regardless of what the Project the template came from was doing. Every
   * created checklist item starts UNTICKED, and the reset is a literal in the
   * SQL rather than a value a caller could pass through.
   *
   * Throws `ProjectTemplateNotFoundError` for an unknown/deleted/
   * cross-workspace template and `ProjectTemplateParentUnavailableError` when
   * the chosen Area/Goal is missing, soft-deleted, of the wrong kind or in
   * another workspace — in which case NOTHING is written.
   */
  instantiate(
    templateId: string,
    input: InstantiateTemplateInput,
  ): Promise<InstantiateTemplateResult>;
}
