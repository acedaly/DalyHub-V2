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
  // The dedicated search projection covers upcoming AND recent meetings in one
  // bounded query (V2.0.1). The previous `list({ view: "recent" })` call carried
  // that view's `starts_at < now` window into Search, which made every future
  // meeting unfindable by its own title.
  const hits = await scope.meetings.searchMeetings({
    text,
    limit: query.limit,
  });
  return hits.map<SearchResultItem>((m) => ({
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
