/**
 * PEOPLE-01 — the People module's REAL, repository-backed search provider (DS-08).
 * Registered in the People manifest, discovered through
 * `ModuleRegistry.listSearchProviders()`. It resolves REAL workspace People
 * through the workspace-scoped `PersonRepository.list` (a bounded title/detail
 * match over `person` entities), so searching a person's NAME, EMAIL,
 * ORGANISATION, ROLE or TAGS finds them, results resolve real People, never
 * expose another workspace, and open the canonical `/person/:id` record.
 *
 * Server-only dependencies (`cloudflare:workers` env, the composition boundary)
 * are DYNAMICALLY imported INSIDE the executor so this manifest module stays safe
 * to include in the client registry bundle — the executor only ever runs
 * server-side in the `/search` loader.
 */

import type {
  SearchExecutor,
  SearchProviderContribution,
  SearchResultItem,
} from "~/kernel/modules";

const searchPeople: SearchExecutor = async (query, context) => {
  const text = query.text.trim();
  if (text.length === 0 || query.limit <= 0) {
    return [];
  }
  // Server-only imports, deferred so the manifest stays client-bundle-safe. The
  // `cloudflare:workers` specifier is computed + `@vite-ignore`d so vite never
  // tries to resolve the Workers-runtime built-in during the client/unit-test
  // bundle (this executor only ever runs server-side in the `/search` loader).
  const workersSpecifier = "cloudflare:workers";
  const [{ env }, { bindWorkspaceRepositories }, { createSystemActorContext }] =
    await Promise.all([
      import(/* @vite-ignore */ workersSpecifier) as Promise<{
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

  const page = await scope.people.list({
    status: "all",
    query: text,
    limit: query.limit,
  });

  return page.items.map<SearchResultItem>((person) => {
    const subtitleParts = [person.role, person.organisation].filter(
      (part): part is string => Boolean(part),
    );
    return {
      id: `person:${person.id}`,
      title: person.title,
      subtitle:
        subtitleParts.length > 0 ? subtitleParts.join(" · ") : undefined,
      entityType: "person",
      target: { kind: "route", to: `/person/${encodeURIComponent(person.id)}` },
    };
  });
};

/** The People module's search-provider contribution (registered in the manifest). */
export const peopleSearchProvider: SearchProviderContribution = {
  id: "people.search",
  label: "People",
  entityTypes: ["person"],
  search: searchPeople,
};
