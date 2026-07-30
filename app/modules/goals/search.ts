import type {
  SearchExecutor,
  SearchProviderContribution,
  SearchResultItem,
} from "~/kernel/modules";

function goalSubtitle(hit: {
  readonly area: { readonly title: string };
  readonly completedAt: Date | null;
  readonly targetDate: string | null;
  readonly contribution: {
    readonly total: number;
    readonly completed: number;
    readonly active: number;
    readonly planned: number;
    readonly onHold: number;
  };
}): string {
  const parts = [`Area: ${hit.area.title}`];
  parts.push(hit.completedAt ? "Completed" : "Open");
  if (hit.targetDate) parts.push(`Target ${hit.targetDate}`);
  if (hit.contribution.total > 0) {
    parts.push(
      `${hit.contribution.completed}/${hit.contribution.total} Projects complete`,
    );
  } else {
    parts.push("No contributing Projects yet");
  }
  return parts.join(" · ");
}

const searchGoals: SearchExecutor = async (query, context) => {
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
  const hits = await scope.goals.searchGoals({ text, limit: query.limit });
  return hits.map<SearchResultItem>((goal) => ({
    id: `goal:${goal.id}`,
    entityId: goal.id,
    title: goal.title,
    subtitle: goalSubtitle(goal),
    entityType: "goal",
    target: { kind: "route", to: `/goals/${encodeURIComponent(goal.id)}` },
  }));
};

export const goalsSearchProvider: SearchProviderContribution = {
  id: "goals.search",
  label: "Goals",
  entityTypes: ["goal"],
  search: searchGoals,
};
