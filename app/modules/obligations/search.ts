/**
 * V2.10 LIFE-02 (D11) — the ONE obligation search provider.
 *
 * One bounded, workspace-scoped read through the authoritative repository's own
 * `list` with its text query — never a second search implementation and never an
 * unbounded scan.
 *
 * ── What it matches, and what it will never match ───────────────────────────
 * Title, category label and subject title. That is the whole list, and the
 * omissions are deliberate:
 *
 *   - The DESCRIPTION is body content. Reaching it is governed by the explicit-
 *     query boundary (ADR-114 decision 2), and this provider is consulted by the
 *     unbidden palette as well as by a typed query, so it does not reach it at
 *     all.
 *   - An AMOUNT is never matched and never printed. Not in the title line, not
 *     in the subtitle, not in an excerpt. A result list is the surface most
 *     likely to be read over someone's shoulder, and a price is the most
 *     private fact an obligation carries — the same rule the Assets provider has
 *     held since ASSET-03.
 *
 * The subtitle follows the shared grammar: what matched first (the category),
 * then the state, then what it is about. There is no excerpt segment, because
 * there is no body to excerpt from.
 */

import type {
  SearchExecutor,
  SearchProviderContribution,
  SearchResultItem,
} from "~/kernel/modules";
import {
  OBLIGATION_STATE_LABELS,
  evaluateObligation,
  obligationCategoryLabel,
} from "~/kernel/obligations";

const searchObligations: SearchExecutor = async (query, context) => {
  const text = query.text.trim();
  if (text.length === 0 || query.limit <= 0) return [];

  const spec = "cloudflare:workers";
  const [
    { env },
    { bindWorkspaceRepositories },
    { createSystemActorContext },
    { entityDestination },
  ] = await Promise.all([
    import(/* @vite-ignore */ spec) as Promise<{
      env: import("~/platform/workspaces").WorkspaceScopeEnv;
    }>,
    import("~/platform/workspaces"),
    import("~/kernel/activity"),
    /*
     * The canonical route map, imported HERE rather than at the top of the
     * file. A module manifest must stay free of anything that drags the
     * client bundle in, and `~/shared/entity` re-exports React components —
     * the boundary `module-import-boundary.test.ts` guards. Consulting the
     * shared map is still the rule (`destination.ts` forbids a per-module
     * route table); only WHEN it is loaded changes.
     */
    import("~/shared/entity/destination"),
  ]);
  const scope = bindWorkspaceRepositories(
    env,
    context.workspace,
    createSystemActorContext(),
  );
  const today = await scope.ownerTodayIso();
  const page = await scope.obligations.list({
    query: text,
    limit: query.limit,
    today,
  });

  return page.items.map<SearchResultItem>((obligation) => {
    const subject = obligation.subjectEntityId
      ? (page.subjects.get(obligation.subjectEntityId) ?? null)
      : null;
    /*
     * The date side only. The meter side belongs to the domain that owns the
     * units, and a search result is not worth a second read per row to get it —
     * so a meter obligation reports its date state, or "Reading needed" from the
     * evaluator, and never a wrong number.
     */
    const evaluation = evaluateObligation(obligation, today, null);
    const destination = entityDestination("obligation", obligation.id);
    return {
      id: `obligation:${obligation.id}`,
      entityId: obligation.id,
      title: obligation.title,
      subtitle: [
        obligationCategoryLabel(obligation.category) ?? "Reminder",
        OBLIGATION_STATE_LABELS[evaluation.state],
        subject?.title ?? null,
      ]
        .filter(Boolean)
        .join(" · "),
      entityType: "obligation",
      target:
        destination?.kind === "route"
          ? { kind: "route", to: destination.to }
          : {
              kind: "route",
              to: `/obligations/${encodeURIComponent(obligation.id)}`,
            },
    };
  });
};

export const obligationsSearchProvider: SearchProviderContribution = {
  id: "obligations.search",
  label: "Obligations",
  entityTypes: ["obligation"],
  search: searchObligations,
};
