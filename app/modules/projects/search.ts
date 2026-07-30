import { projectWorkflowStatusLabel } from "~/kernel/project-settings";
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
