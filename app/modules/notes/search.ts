/**
 * NOTES-03 — the Notes module's REAL, repository-backed search provider (DS-08).
 *
 * This is the provider whose absence [DEBT-36] recorded: until now a Note could
 * not be found from global Search at all, while the Today fixture provider
 * returned invented `note:` results. It resolves REAL workspace Notes through
 * the workspace-scoped `NoteQueryRepository.search` — a bounded, D1-native match
 * over the Note's TITLE, its full Markdown BODY (including headings) and its
 * TAGS — so a Note is findable by any meaningful content inside it.
 *
 * The result's subtitle is the honest, syntax-free excerpt the repository cut
 * around the match, prefixed with WHERE it matched ("Heading: Risks", "Body",
 * "Tag"), so the user can tell why a result is here without opening it. Raw
 * Markdown is never the excerpt: the shared analyser strips syntax first
 * (§5 — never present raw source as the primary excerpt).
 *
 * Server-only dependencies (`cloudflare:workers` env, the composition boundary)
 * are DYNAMICALLY imported INSIDE the executor so this manifest module stays
 * safe to include in the client registry bundle — the executor only ever runs
 * server-side in the `/search` loader.
 */

import type {
  SearchExecutor,
  SearchProviderContribution,
  SearchResultItem,
} from "~/kernel/modules";
import type { NoteSearchHit } from "~/kernel/notes";

/** The user-facing name for where a hit matched. Never a raw enum value. */
function matchLabel(hit: NoteSearchHit): string {
  switch (hit.matchSource) {
    case "title":
      return "Title";
    case "tag":
      return "Tag";
    case "heading":
      return hit.heading ? `Heading: ${hit.heading}` : "Heading";
    case "body":
      return hit.heading ? `Under “${hit.heading}”` : "Body";
  }
}

/**
 * The result subtitle: where it matched, the archive state when it is archived
 * (so an archived Note is never silently indistinguishable from an active one),
 * and the excerpt.
 */
function subtitle(hit: NoteSearchHit): string | undefined {
  const parts = [matchLabel(hit)];
  if (hit.archivedAt) parts.push("Archived");
  if (hit.excerpt) parts.push(hit.excerpt);
  const text = parts.join(" · ");
  return text === "" ? undefined : text;
}

const searchNotes: SearchExecutor = async (query, context) => {
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

  // Archived Notes are INCLUDED and labelled, never hidden: a note is archived
  // because it is out of the way, not because it should become unfindable —
  // and deleted Notes are excluded by the repository, always.
  const hits = await scope.notes.search({
    text,
    limit: query.limit,
    includeArchived: true,
  });

  return hits.map<SearchResultItem>((hit) => ({
    id: `note:${hit.id}`,
    // The canonical, unprefixed kernel id — so linked-record boosting matches.
    entityId: hit.id,
    title: hit.title,
    subtitle: subtitle(hit),
    entityType: "note",
    target: { kind: "route", to: `/notes/${encodeURIComponent(hit.id)}` },
  }));
};

/** The Notes module's search-provider contribution (registered in the manifest). */
export const notesSearchProvider: SearchProviderContribution = {
  id: "notes.search",
  label: "Notes",
  entityTypes: ["note"],
  search: searchNotes,
};
