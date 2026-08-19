/**
 * PROJECT-02 Project templates — domain errors.
 *
 * The repository signals failure with these explicit, typed errors rather than
 * leaking storage internals. Messages are safe to surface: they never include
 * SQL text, query parameters, database paths, bindings, environment values or
 * another workspace's record existence (AGENTS.md §17, ADR-028).
 *
 * Cross-workspace safety: a template that lives in another workspace — or does
 * not exist at all — is INDISTINGUISHABLE. `ProjectTemplateNotFoundError` is
 * used for both, disclosing nothing.
 */

/** Discriminator so callers can branch on error kind without `instanceof`. */
export type ProjectTemplateErrorCode =
  | "validation"
  | "not_found"
  | "task_not_found"
  | "full"
  | "checklist_full"
  | "too_large"
  | "parent_unavailable"
  | "storage";

/** Base class for every project-template error. */
export abstract class ProjectTemplateError extends Error {
  abstract readonly code: ProjectTemplateErrorCode;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** The fields a validation failure can point at. */
export type ProjectTemplateValidationField =
  | "id"
  | "name"
  | "description"
  | "taskTitle"
  | "taskDescription"
  | "priority"
  | "checklistTitle"
  | "order"
  | "defaultParent"
  | "limit";

export class ProjectTemplateValidationError extends ProjectTemplateError {
  readonly code = "validation" as const;

  constructor(
    readonly field: ProjectTemplateValidationField,
    message: string,
  ) {
    super(message);
  }
}

/** No such template in this workspace — or it is soft-deleted. */
export class ProjectTemplateNotFoundError extends ProjectTemplateError {
  readonly code = "not_found" as const;

  constructor() {
    super("Template not found");
  }
}

/** No such task inside that template. */
export class ProjectTemplateTaskNotFoundError extends ProjectTemplateError {
  readonly code = "task_not_found" as const;

  constructor() {
    super("That step is no longer in this template.");
  }
}

/** The template already holds {@link MAX_TEMPLATE_TASKS} tasks. */
export class ProjectTemplateFullError extends ProjectTemplateError {
  readonly code = "full" as const;

  constructor(readonly limit: number) {
    super(`A template holds at most ${limit} tasks.`);
  }
}

/**
 * A template task's checklist is at its per-task bound, or the template as a
 * whole is at its total checklist bound. Both are refusals rather than silent
 * drops, and both name the number they refused at.
 */
export class ProjectTemplateChecklistFullError extends ProjectTemplateError {
  readonly code = "checklist_full" as const;

  constructor(
    readonly scope: "task" | "template",
    readonly limit: number,
  ) {
    super(
      scope === "task"
        ? `A template step holds at most ${limit} checklist items.`
        : `A template holds at most ${limit} checklist items in total.`,
    );
  }
}

/**
 * A Project could not be captured as a template because it holds more work than
 * a template may. Carries the numbers so the message can be exact rather than
 * apologetic.
 */
export class ProjectTemplateTooLargeError extends ProjectTemplateError {
  readonly code = "too_large" as const;

  constructor(
    readonly subject: "tasks" | "checklistItems",
    readonly found: number,
    readonly limit: number,
  ) {
    super(
      subject === "tasks"
        ? `This project has ${found} tasks, and a template holds at most ${limit}.`
        : `This project has ${found} checklist items, and a template holds at most ${limit}.`,
    );
  }
}

/**
 * The Area or Goal a Project was to be created under is missing, soft-deleted,
 * of the wrong kind or in another workspace. Nothing was written.
 */
export class ProjectTemplateParentUnavailableError extends ProjectTemplateError {
  readonly code = "parent_unavailable" as const;

  constructor() {
    super("Choose an Area or a Goal for this project.");
  }
}

/** A raw storage failure, re-raised with a generic message. */
export class ProjectTemplateStorageError extends ProjectTemplateError {
  readonly code = "storage" as const;

  constructor(options?: { cause?: unknown }) {
    super("A project template storage error occurred.", options);
  }
}
