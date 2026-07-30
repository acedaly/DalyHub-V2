import type {
  SearchExecutor,
  SearchProviderContribution,
  SearchResultItem,
} from "~/kernel/modules";
const search: SearchExecutor = async (query, context) => {
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
  const page = await scope.meetings.list({
    view: "recent",
    query: text,
    limit: query.limit,
  });
  return page.items.map<SearchResultItem>((m) => ({
    id: `meeting:${m.id}`,
    // The canonical, unprefixed kernel id — so linked-record boosting matches.
    entityId: m.id,
    title: m.title,
    subtitle: m.location ?? undefined,
    entityType: "meeting",
    target: { kind: "route", to: `/meeting/${encodeURIComponent(m.id)}` },
  }));
};
export const meetingSearchProvider: SearchProviderContribution = {
  id: "meetings.search",
  label: "Meetings",
  entityTypes: ["meeting"],
  search,
};
