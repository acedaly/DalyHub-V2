import { projectWorkflowStatusLabel } from "~/kernel/project-settings";
import {
  MAX_TEMPLATE_PAGE_SIZE,
  PROJECT_TEMPLATE,
  templateContentsLabel,
} from "~/kernel/project-templates";
import type {
  SearchExecutor,
  SearchProviderContribution,
  SearchResultItem,
} from "~/kernel/modules";
import type { ProjectSearchHit } from "~/kernel/projects";

function projectSubtitle(project: ProjectSearchHit): string {
  const parts: string[] = [];
  if (project.area) {
    parts.push(`Area: ${project.area.title}`);
  }
  if (project.goal) {
    parts.push(`Goal: ${project.goal.title}`);
  }
  parts.push(
    project.completedAt
      ? "Completed"
      : projectWorkflowStatusLabel(project.status),
  );
  parts.push(`${project.taskCompleted}/${project.taskTotal} Tasks complete`);
  return parts.join(" · ");
}

const searchProjects: SearchExecutor = async (query, context) => {
  const text = query.text.trim();
  if (text.length === 0 || query.limit <= 0) return [];

  const spec = "cloudflare:workers";
  const [{ env }, { bindWorkspaceRepositories }, { createSystemActorContext }] =
    await Promise.all([
      import(/* @vite-ignore */ spec) as Promise<{
        env: import("~/platform/workspaces").WorkspaceScopeEnv;
      }>,
      import("~/platform/workspaces"),
      import("~/kernel/activity"),
    ]);
  const scope = bindWorkspaceRepositories(
    env,
    context.workspace,
    createSystemActorContext(),
  );
  const hits = await scope.projects.searchProjects({
    text,
    limit: query.limit,
  });
  return hits.map<SearchResultItem>((project) => ({
    id: `project:${project.id}`,
    entityId: project.id,
    title: project.title,
    subtitle: projectSubtitle(project),
    entityType: "project",
    target: {
      kind: "route",
      to: `/projects/${encodeURIComponent(project.id)}`,
    },
  }));
};

export const projectsSearchProvider: SearchProviderContribution = {
  id: "projects.search",
  label: "Projects",
  entityTypes: ["project"],
  search: searchProjects,
};

/**
 * PROJECT-02 — templates in search.
 *
 * A TEMPLATE is findable by NAME, because an owner who remembers "monthly
 * reporting" and wants to start one should be able to type it. A template TASK
 * is not, and that is the decision rather than an omission: it is an internal
 * structural row with no entity id, no route and no record of its own, and
 * twelve of them per template would flood a palette whose job is to find live
 * work. It is the TASKS-13 rule applied one level up — searchable context may
 * lead to the owning meaningful record, but an internal structural record must
 * not pretend to be a first-class entity.
 *
 * Because a template is not a spine record, nothing here can put one in front
 * of an owner looking for a Project: the two providers read different tables
 * and produce differently-labelled results.
 */
const searchProjectTemplates: SearchExecutor = async (query, context) => {
  const text = query.text.trim();
  if (text.length === 0 || query.limit <= 0) return [];

  const spec = "cloudflare:workers";
  const [{ env }, { bindWorkspaceRepositories }, { createSystemActorContext }] =
    await Promise.all([
      import(/* @vite-ignore */ spec) as Promise<{
        env: import("~/platform/workspaces").WorkspaceScopeEnv;
      }>,
      import("~/platform/workspaces"),
      import("~/kernel/activity"),
    ]);
  const scope = bindWorkspaceRepositories(
    env,
    context.workspace,
    createSystemActorContext(),
  );
  const needle = text.toLocaleLowerCase();
  /*
   * A bounded page, narrowed in memory.
   *
   * A workspace holds a handful of templates, not a collection — the list read
   * is already bounded and already carries its counts from one grouped
   * aggregate, so a dedicated ranked SQL search would be a second query path
   * for a set this size. If templates ever became numerous this is where a real
   * search read would go.
   */
  const page = await scope.projectTemplates.listTemplates({
    limit: MAX_TEMPLATE_PAGE_SIZE,
  });
  return page.items
    .filter((template) => template.name.toLocaleLowerCase().includes(needle))
    .slice(0, query.limit)
    .map<SearchResultItem>((template) => ({
      id: `project_template:${template.id}`,
      entityId: template.id,
      title: template.name,
      subtitle: `Template · ${templateContentsLabel(
        template.taskCount,
        template.checklistCount,
      )}`,
      entityType: PROJECT_TEMPLATE,
      target: {
        kind: "route",
        to: `/projects/templates/${encodeURIComponent(template.id)}`,
      },
    }));
};

export const projectTemplatesSearchProvider: SearchProviderContribution = {
  id: "projects.template_search",
  label: "Project templates",
  entityTypes: [PROJECT_TEMPLATE],
  search: searchProjectTemplates,
};
