/**
 * ASSET-01 — the Assets module's REAL, repository-backed search provider (DS-08).
 * Registered in the Assets manifest, discovered through
 * `ModuleRegistry.listSearchProviders()`. It resolves REAL workspace Assets through
 * the workspace-scoped `AssetRepository.list` (a bounded, NON-SENSITIVE match over
 * title, manufacturer, model, location, provider and tags), so results resolve real
 * Assets, never expose another workspace, and open the canonical `/asset/:id`
 * record. Sensitive fields (serial/reference numbers, prices, private notes) are
 * never matched and never appear in a snippet (§17).
 *
 * Server-only dependencies (`cloudflare:workers` env, the composition boundary) are
 * DYNAMICALLY imported INSIDE the executor so this manifest module stays safe to
 * include in the client registry bundle — the executor only ever runs server-side
 * in the `/search` loader.
 */

import { assetTypeLabel } from "./asset-view";
import type {
  SearchExecutor,
  SearchProviderContribution,
  SearchResultItem,
} from "~/kernel/modules";

const searchAssets: SearchExecutor = async (query, context) => {
  const text = query.text.trim();
  if (text.length === 0 || query.limit <= 0) {
    return [];
  }
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

  const page = await scope.assets.list({
    view: "all",
    query: text,
    limit: query.limit,
  });

  return page.items.map<SearchResultItem>((asset) => {
    const subtitleParts = [
      assetTypeLabel(asset.assetType),
      [asset.manufacturer, asset.model].filter(Boolean).join(" "),
    ].filter((part): part is string => Boolean(part));
    return {
      id: `asset:${asset.id}`,
      // The canonical, unprefixed kernel id — so linked-record boosting matches.
      entityId: asset.id,
      title: asset.title,
      subtitle:
        subtitleParts.length > 0 ? subtitleParts.join(" · ") : undefined,
      entityType: "asset",
      target: { kind: "route", to: `/asset/${encodeURIComponent(asset.id)}` },
    };
  });
};

/** The Assets module's search-provider contribution (registered in the manifest). */
export const assetsSearchProvider: SearchProviderContribution = {
  id: "assets.search",
  label: "Assets",
  entityTypes: ["asset"],
  search: searchAssets,
};
