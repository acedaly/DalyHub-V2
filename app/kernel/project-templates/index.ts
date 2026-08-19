/**
 * PROJECT-02 Project templates — the kernel's public surface.
 *
 * A template is an ordinary `entities` row of type `project_template` and is
 * deliberately NOT a spine record: see `project-template.ts` for why, and
 * `migrations/0046_create_project_templates.sql` for the same argument in
 * schema terms.
 */

export {
  PROJECT_TEMPLATE,
  PROJECT_TEMPLATE_CREATED,
  PROJECT_TEMPLATE_UPDATED,
  PROJECT_TEMPLATE_DELETED,
  PROJECT_CREATED_FROM_TEMPLATE,
  PROJECT_TEMPLATE_ACTIVITY_TYPES,
  MAX_TEMPLATE_TASKS,
  MAX_TEMPLATE_CHECKLIST_ITEMS,
  MAX_TEMPLATE_CHECKLIST_ITEMS_PER_TASK,
  MAX_TEMPLATE_PAGE_SIZE,
  DEFAULT_TEMPLATE_PAGE_SIZE,
  TEMPLATE_NAME_MAX_LENGTH,
  TEMPLATE_DESCRIPTION_MAX_LENGTH,
  TEMPLATE_TASK_TITLE_MAX_LENGTH,
  templateContentsLabel,
  templateChecklistCount,
} from "./project-template";

export type {
  InstantiateTemplateInput,
  InstantiateTemplateResult,
  ProjectTemplateChecklistItem,
  ProjectTemplateDetail,
  ProjectTemplateHeaderInput,
  ProjectTemplatePage,
  ProjectTemplateSummary,
  ProjectTemplateTask,
  TemplateParent,
  TemplateParentKind,
} from "./project-template";

export {
  ProjectTemplateError,
  ProjectTemplateValidationError,
  ProjectTemplateNotFoundError,
  ProjectTemplateTaskNotFoundError,
  ProjectTemplateFullError,
  ProjectTemplateChecklistFullError,
  ProjectTemplateTooLargeError,
  ProjectTemplateParentUnavailableError,
  ProjectTemplateStorageError,
  type ProjectTemplateErrorCode,
  type ProjectTemplateValidationField,
} from "./project-template-errors";

export {
  TEMPLATE_TASK_DESCRIPTION_MAX_LENGTH,
  validateTemplateDescription,
  validateTemplateId,
  validateTemplateLimit,
  validateTemplateName,
  validateTemplateOrder,
  validateTemplatePriority,
  validateTemplateTaskDescription,
  validateTemplateTaskTitle,
} from "./project-template-validation";

export type {
  ProjectTemplateChangeResult,
  ProjectTemplateRepository,
  ProjectTemplateTaskInput,
} from "./project-template-repository";
