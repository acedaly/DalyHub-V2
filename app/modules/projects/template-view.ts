/**
 * PROJECT-02 — the wire shapes a Project-template surface renders.
 *
 * A loader returns JSON, so `Date`s are serialised here and nowhere else. The
 * shapes stay deliberately close to the kernel's: a template list needs a name,
 * a description, two counts and its context, and a template record needs its
 * ordered tasks. Nothing is invented and nothing decorative is added.
 */

import type { EntityIconKey } from "~/kernel/entities/entity-icon-keys";
import type { IdentityColourSlot } from "~/kernel/entities/identity-colour-slots";
import type {
  ProjectTemplateDetail,
  ProjectTemplateSummary,
} from "~/kernel/project-templates";
import type { TaskPriority } from "~/kernel/tasks";

/**
 * The minimum a template needs to be OFFERED in the ordinary create form.
 *
 * Deliberately smaller than {@link SerializedTemplateSummary}: the create form
 * needs a name, the two counts and a default parent, and nothing else. It lives
 * here rather than beside the collection component so the form and the
 * collection can both import it without importing each other.
 */
export interface TemplateOption {
  readonly id: string;
  readonly name: string;
  readonly taskCount: number;
  readonly checklistCount: number;
  readonly parentId: string | null;
}

export interface SerializedTemplateSummary {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly iconKey: EntityIconKey | null;
  readonly colourSlot: IdentityColourSlot | null;
  readonly colourRank: number;
  readonly parentLabel: string | null;
  readonly parentId: string | null;
  readonly taskCount: number;
  readonly checklistCount: number;
  readonly updatedAt: string;
}

export interface SerializedTemplateTask {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly priority: TaskPriority | null;
  readonly position: number;
  readonly checklist: readonly {
    readonly id: string;
    readonly title: string;
    readonly position: number;
  }[];
}

export interface SerializedTemplateDetail extends SerializedTemplateSummary {
  readonly tasks: readonly SerializedTemplateTask[];
}

export function serializeTemplateSummary(
  template: ProjectTemplateSummary,
): SerializedTemplateSummary {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    iconKey: template.iconKey,
    colourSlot: template.colourSlot,
    colourRank: template.colourRank,
    // The default parent is resolved to its CURRENT title by the repository, or
    // absent when it no longer names an active Area or Goal. Absence is never
    // rendered as an empty label.
    parentLabel: template.defaultParent?.title ?? null,
    parentId: template.defaultParent?.id ?? null,
    taskCount: template.taskCount,
    checklistCount: template.checklistCount,
    updatedAt: template.updatedAt.toISOString(),
  };
}

export function serializeTemplateDetail(
  template: ProjectTemplateDetail,
): SerializedTemplateDetail {
  return {
    ...serializeTemplateSummary(template),
    tasks: template.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      priority: task.priority,
      position: task.position,
      checklist: task.checklist.map((item) => ({
        id: item.id,
        title: item.title,
        position: item.position,
      })),
    })),
  };
}
