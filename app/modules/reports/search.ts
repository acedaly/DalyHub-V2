/**
 * V2.13 RPT-04 — the ONE saved-report search provider, and the privacy boundary
 * it holds.
 *
 * ## What it matches, and what it will NEVER match
 *
 * The NAME the owner gave a saved report. That is the whole list, and every
 * omission is deliberate:
 *
 *   - **No result value. Ever.** A report is not executed to answer a search.
 *     Search would otherwise become the most expensive read in the product AND
 *     the one most likely to print a total over someone's shoulder.
 *   - **No amount, no payee, no category name, no account name.** The Finance
 *     provider has held this line since V2.12; a report ABOUT money must hold
 *     it at least as firmly.
 *   - **No definition.** Not the source, not the measure, not a filter id. A
 *     subtitle saying "Finance · Money out" would be harmless; a subtitle
 *     saying which category the owner filtered to would not, and drawing the
 *     line at "the name only" needs no judgement call per field.
 *   - **Nothing at all for an empty query.** A saved report is never
 *     volunteered before the owner has typed something.
 *   - **No built-ins.** They are code, they are all on `/reports`, and putting
 *     six permanent rows into every search would crowd out the owner's records.
 *
 * `test/unit/reports/search-privacy.test.ts` asserts it structurally, against
 * this file's source with comments stripped.
 */

import type {
  SearchExecutor,
  SearchProviderContribution,
  SearchResultItem,
} from "~/kernel/modules";

const searchReports: SearchExecutor = async (query, context) => {
  const text = query.text.trim();
  // The explicit-query boundary, at its narrowest: no text, no results.
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

  const ownerId = context.ownerId;
  if (!ownerId) return [];

  /*
   * The repository's own bounded list — one statement, capped at the saved-view
   * limit — filtered by NAME here rather than in SQL. The collection is bounded
   * to 50 rows per owner per kind by the store itself, so a `LIKE` predicate
   * would buy nothing and would need a second read path to maintain.
   */
  const saved = await scope.reports.list(ownerId);
  const needle = text.toLocaleLowerCase("en-AU");
  return saved
    .filter((view) => view.name.toLocaleLowerCase("en-AU").includes(needle))
    .slice(0, query.limit)
    .map<SearchResultItem>((view) => ({
      id: `report:${view.id}`,
      title: view.name,
      subtitle: "Saved report",
      target: { kind: "route", to: `/reports/${encodeURIComponent(view.id)}` },
    }));
};

export const reportsSearchProvider: SearchProviderContribution = {
  id: "reports.search",
  label: "Reports",
  search: searchReports,
};
