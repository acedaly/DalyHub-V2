/**
 * TASKS-01 — the Tasks module's REAL, repository-backed search provider (ADR-043
 * §18). Registered in the Tasks manifest, discovered by DS-08 through
 * `ModuleRegistry.listSearchProviders()` exactly like every other provider. Unlike
 * the retired fixture-backed Today task search, this resolves REAL workspace tasks
 * through the trusted, workspace-scoped `searchLinkTargets` (a bounded, deterministic
 * title match over active `task` entities), so results resolve real tasks, never
 * expose another workspace, and fail calmly when a task is gone.
 *
 * Server-only dependencies (`cloudflare:workers` env, the composition boundary) are
 * DYNAMICALLY imported INSIDE the executor so this manifest module stays safe to
 * include in the client registry bundle — the executor only ever runs server-side in
 * the `/search` loader. Results open the ONE canonical Task Drawer over `/tasks`.
 */

import type {
  SearchExecutor,
  SearchProviderContribution,
  SearchResultItem,
} from "~/kernel/modules";

/** The route that hosts a DrawerProvider able to open a `task:<id>` key. */
const TASKS_PATH = "/tasks";

const searchTasks: SearchExecutor = async (query, context) => {
  const text = query.text.trim();
  if (text.length === 0 || query.limit <= 0) {
    return [];
  }
  // Server-only imports, deferred so the manifest stays client-bundle-safe. The
  // `cloudflare:workers` specifier is computed + `@vite-ignore`d so vite never tries
  // to resolve the Workers-runtime built-in during the client/unit-test bundle (this
  // executor only ever runs server-side in the `/search` loader).
  const workersSpecifier = "cloudflare:workers";
  const [{ env }, { bindWorkspaceRepositories }, { createSystemActorContext }] =
    await Promise.all([
      import(/* @vite-ignore */ workersSpecifier) as Promise<{
        env: import("~/platform/workspaces").WorkspaceScopeEnv;
      }>,
      import("~/platform/workspaces"),
      import("~/kernel/activity"),
    ]);
  const { searchLinkTargets } = await import("~/platform/entity-links");

  const scope = bindWorkspaceRepositories(
    env,
    context.workspace,
    createSystemActorContext(),
  );

  const targets = await searchLinkTargets(
    { entities: scope.entities, entityLinks: scope.entityLinks },
    {
      anchorId: "",
      query: text,
      targetTypes: ["task"],
      limit: query.limit,
    },
  );

  return targets.map<SearchResultItem>((target) => ({
    id: `task:${target.id}`,
    // The canonical, unprefixed kernel id — so linked-record boosting matches.
    entityId: target.id,
    title: target.title,
    entityType: "task",
    target: {
      kind: "drawer",
      drawerKey: `task:${target.id}`,
      canonicalPath: TASKS_PATH,
    },
  }));
};

/** The Tasks module's search-provider contribution (registered in the manifest). */
export const tasksSearchProvider: SearchProviderContribution = {
  id: "tasks.search",
  label: "Tasks",
  entityTypes: ["task"],
  search: searchTasks,
};
