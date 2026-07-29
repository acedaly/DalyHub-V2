import type {
  SearchExecutor,
  SearchProviderContribution,
  SearchResultItem,
} from "~/kernel/modules";

function plural(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

const searchAreas: SearchExecutor = async (query, context) => {
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
  const hits = await scope.areas.searchAreas({ text, limit: query.limit });
  return hits.map<SearchResultItem>((area) => ({
    id: `area:${area.id}`,
    entityId: area.id,
    title: area.title,
    subtitle: [
      plural(area.openGoalCount, "open Goal"),
      plural(area.activeProjectCount, "active Project"),
      plural(area.directTaskCount, "direct Task"),
    ].join(" · "),
    entityType: "area",
    target: { kind: "route", to: `/areas/${encodeURIComponent(area.id)}` },
  }));
};

export const areasSearchProvider: SearchProviderContribution = {
  id: "areas.search",
  label: "Areas",
  entityTypes: ["area"],
  search: searchAreas,
};
