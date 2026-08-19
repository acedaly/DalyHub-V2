/**
 * PROJECT-02 Project templates — the domain model for a reusable Project SHAPE.
 *
 * ── What a template IS ───────────────────────────────────────────────────────
 * A template is the answer to "start this from the shape that already worked".
 * It holds a name, an optional description, the identity a new Project should
 * start with, an optional default Area/Goal, and an ORDERED list of the Tasks
 * that Project should begin with — each with its own optional description,
 * optional priority, and its own ordered checklist.
 *
 * ── What a template is NOT ───────────────────────────────────────────────────
 * It is not a Project. It has no `spine_records` row, so it has no completion,
 * no structural parent, no rollup and no health — and therefore cannot appear
 * in the Projects collection, in Project counts, in Goal progress, in Project
 * health, in Today, in Weekly Planning or in Review. Its tasks are not Tasks:
 * they are rows with no entity id, so they cannot appear in the Tasks
 * collection, in the Inbox count, in an overdue figure, in a notification or in
 * a recurrence series.
 *
 * ── The rule the SHAPE of this file enforces ─────────────────────────────────
 *
 *      Copy structure and intentional defaults. Never copy execution history.
 *
 * There is no `status`, no `completed`, no `dueDate`, no `scheduledDate`, no
 * `timeSector`, no `waiting`, no `delegation`, no recurrence and no historical
 * timestamp on {@link ProjectTemplateTask}, and there is no `completed` on
 * {@link ProjectTemplateChecklistItem}. A future change that wanted to carry a
 * stale date into a fresh Project would have to add a field to a domain type
 * that says in its own doc comment why it does not have one.
 *
 * ── Dates ────────────────────────────────────────────────────────────────────
 * A template carries NO dates of any kind — not absolute ones, and not relative
 * offsets. See `docs/design/PROJECT_02_PROJECT_TEMPLATES_2026_08.md` for the
 * decision: DalyHub already has three date authorities (a due date, the
 * `scheduled_date` that IS the plan under ADR-030, and a recurrence anchor), and
 * a relative offset would be a fourth that is resolved once and can never be
 * re-derived. PLAN-01 built the surface where a fresh Project gets its days.
 */

import type { EntityIconKey } from "~/kernel/entities/entity-icon-keys";
import type { IdentityColourSlot } from "~/kernel/entities/identity-colour-slots";
import type { TaskPriority } from "~/kernel/tasks";
import type { WorkspaceId } from "~/kernel/workspaces";

/** The entity type a template is stored under. NEVER a spine kind. */
export const PROJECT_TEMPLATE = "project_template";

/* -------------------------------------------------------------------------- */
/* Activity types                                                             */
/* -------------------------------------------------------------------------- */

export const PROJECT_TEMPLATE_CREATED = "project_template.created";
export const PROJECT_TEMPLATE_UPDATED = "project_template.updated";
export const PROJECT_TEMPLATE_DELETED = "project_template.deleted";
/**
 * Appended to the NEW Project, naming the template it came from.
 *
 * This is how provenance is recorded, and it is deliberately the only way. A
 * `created_from_template_id` column would be a second, permanent reference that
 * a template deletion would have to reckon with, and DalyHub already records
 * "this happened, because of that" in exactly one place: Activity (ADR-012).
 * The event is informational — nothing reads it to decide behaviour, and there
 * is no synchronisation in either direction.
 */
export const PROJECT_CREATED_FROM_TEMPLATE = "project.created_from_template";

export const PROJECT_TEMPLATE_ACTIVITY_TYPES = [
  PROJECT_TEMPLATE_CREATED,
  PROJECT_TEMPLATE_UPDATED,
  PROJECT_TEMPLATE_DELETED,
  PROJECT_CREATED_FROM_TEMPLATE,
] as const;

/* -------------------------------------------------------------------------- */
/* Bounds                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The most Tasks ONE template may hold.
 *
 * Chosen against what a template IS and against what instantiation COSTS.
 *
 * A template is a SHAPE. Forty steps is already past the point where the work
 * should have been split into several Projects, and every real example the
 * product is designed around ("Monthly reporting", "New client onboarding",
 * "Trip preparation") is between five and twenty.
 *
 * It is also half of what actually bounds the write. Creating a Project from a
 * template is ONE D1 batch, and each template task costs four statements (the
 * `entities` row, the `spine_records` row, the structural EntityLink and the
 * `task_details` row). Forty tasks is 160 statements; with the Project's own
 * three, the checklist bound below and the Activity appends, a maximal template
 * commits in under 300 statements, each binding at most a dozen parameters —
 * comfortably inside D1's 100-bound-parameter-per-statement ceiling, which is
 * the limit TASKS-13 measured the hard way. `test/kernel/project-templates.test.ts`
 * instantiates a maximal template against the real database, so this is a
 * measurement rather than an estimate.
 */
export const MAX_TEMPLATE_TASKS = 40;

/**
 * The most checklist items ONE template task may hold.
 *
 * Twenty, not the hundred a LIVE Task's checklist may hold
 * (`MAX_CHECKLIST_ITEMS`). The two bounds answer different questions: a live
 * checklist bounds one Task's steps, while this one is multiplied by
 * {@link MAX_TEMPLATE_TASKS} and would otherwise be the number that decides how
 * large an instantiation batch can get. Twenty steps inside one step of a
 * template is already a great deal of structure.
 */
export const MAX_TEMPLATE_CHECKLIST_ITEMS_PER_TASK = 20;

/**
 * The most checklist items ONE template may hold IN TOTAL, across all its tasks.
 *
 * This is the bound that actually caps the instantiation batch: without it the
 * worst case would be 40 × 20 = 800 checklist statements. A hundred and twenty
 * is generous against every real template and keeps the batch small enough to
 * commit well inside a request.
 */
export const MAX_TEMPLATE_CHECKLIST_ITEMS = 120;

/** The longest a template's name may be, in Unicode code points. */
export const TEMPLATE_NAME_MAX_LENGTH = 200;

/** The longest a template's description may be, in Unicode code points. */
export const TEMPLATE_DESCRIPTION_MAX_LENGTH = 2000;

/** The longest a template task's title may be, in Unicode code points. */
export const TEMPLATE_TASK_TITLE_MAX_LENGTH = 512;

/** The most templates one bounded collection read returns. */
export const MAX_TEMPLATE_PAGE_SIZE = 100;

/** The default page size for the template collection. */
export const DEFAULT_TEMPLATE_PAGE_SIZE = 50;

/* -------------------------------------------------------------------------- */
/* The records                                                                */
/* -------------------------------------------------------------------------- */

/** The kind of record a template's default parent names. */
export type TemplateParentKind = "area" | "goal";

/**
 * The template's default Area/Goal, resolved against the LIVE hierarchy.
 *
 * `null` both when the template never had one and when the one it had no longer
 * names an active Area or Goal — the two are indistinguishable on purpose, and
 * neither is an error. The create form asks for a parent either way; the
 * default only decides what it starts on.
 */
export type TemplateParent = {
  readonly kind: TemplateParentKind;
  readonly id: string;
  /** The CURRENT title, resolved through the hierarchy — never a stored copy. */
  readonly title: string;
};

/** One step inside one template task. Title and order, and nothing else. */
export interface ProjectTemplateChecklistItem {
  readonly id: string;
  readonly templateTaskId: string;
  /** Plain text — never Markdown, exactly as a live checklist item. */
  readonly title: string;
  /**
   * The owner's order.
   *
   * The canonical read order is `(position, createdAt, id)` — a TOTAL order, so
   * the list is deterministic whatever the positions are. Every mutation
   * renumbers to a dense `0..n-1`; the total order is what the product actually
   * relies on, because a concurrent add during a reorder can briefly leave two
   * rows sharing a position until the next mutation renumbers them.
   */
  readonly position: number;
}

/** One Task a template will create. */
export interface ProjectTemplateTask {
  readonly id: string;
  readonly templateId: string;
  readonly title: string;
  /** The canonical Markdown SOURCE, copied verbatim into the created Task. */
  readonly description: string | null;
  /** An intentional default. `null` means untriaged, exactly as on a Task. */
  readonly priority: TaskPriority | null;
  /** See {@link ProjectTemplateChecklistItem.position}. */
  readonly position: number;
  readonly checklist: readonly ProjectTemplateChecklistItem[];
}

/**
 * A template as shown in a list: enough to choose one, and nothing decorative.
 *
 * `taskCount` and `checklistCount` come from ONE grouped aggregate over the
 * whole page (see the repository), never a query per template.
 */
export interface ProjectTemplateSummary {
  readonly id: string;
  readonly workspaceId: WorkspaceId;
  readonly name: string;
  readonly description: string | null;
  readonly iconKey: EntityIconKey | null;
  readonly colourSlot: IdentityColourSlot | null;
  /** The Project's OWN stable colour rank equivalent — its creation order. */
  readonly colourRank: number;
  readonly defaultParent: TemplateParent | null;
  readonly taskCount: number;
  readonly checklistCount: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** A template with its full ordered contents, for the template record. */
export interface ProjectTemplateDetail extends ProjectTemplateSummary {
  readonly tasks: readonly ProjectTemplateTask[];
}

/** A bounded page of template summaries. */
export interface ProjectTemplatePage {
  readonly items: readonly ProjectTemplateSummary[];
  /** True when the workspace holds more templates than this page returned. */
  readonly hasMore: boolean;
}

/* -------------------------------------------------------------------------- */
/* Inputs                                                                     */
/* -------------------------------------------------------------------------- */

/** The template header fields an owner can set. */
export interface ProjectTemplateHeaderInput {
  readonly name?: string;
  readonly description?: string | null;
  readonly iconKey?: EntityIconKey | null;
  readonly colourSlot?: IdentityColourSlot | null;
  readonly defaultParent?: { readonly id: string } | null;
}

/** What creating a Project from a template needs from the owner. */
export interface InstantiateTemplateInput {
  /**
   * The new Project's title. Defaults to the template's name when omitted —
   * "August reporting" is the point of asking, but "Monthly reporting" is a
   * perfectly good answer.
   */
  readonly title?: string;
  /** The Area or Goal the new Project belongs to. Required, as it always is. */
  readonly parentId: string;
}

/** What a successful instantiation produced. */
export interface InstantiateTemplateResult {
  readonly projectId: string;
  readonly title: string;
  readonly taskCount: number;
  readonly checklistCount: number;
}

/* -------------------------------------------------------------------------- */
/* Pure helpers                                                               */
/* -------------------------------------------------------------------------- */

/**
 * "12 tasks · 3 checklists" — the ONE wording a template list uses to say what
 * it will create.
 *
 * Two facts, both of which change the owner's choice, and nothing else. The
 * checklist fragment is dropped when there are none, because "0 checklists" is
 * a warning about a zero. Returns "No tasks yet" for an empty template rather
 * than "0 tasks", for the same reason.
 */
export function templateContentsLabel(
  taskCount: number,
  checklistCount: number,
): string {
  if (taskCount === 0) return "No tasks yet";
  const tasks = `${taskCount} ${taskCount === 1 ? "task" : "tasks"}`;
  if (checklistCount === 0) return tasks;
  return `${tasks} · ${checklistCount} checklist ${
    checklistCount === 1 ? "item" : "items"
  }`;
}

/** Total checklist items across a template's tasks. Pure; the one definition. */
export function templateChecklistCount(
  tasks: readonly ProjectTemplateTask[],
): number {
  let total = 0;
  for (const task of tasks) total += task.checklist.length;
  return total;
}
