/**
 * X-01 / STEER-03 — the Goals search provider.
 *
 * ── The preview speaks the product's vocabulary (DEBT-211 item 5) ──────────
 * It printed `Target 2026-08-15` — a raw ISO date, on the one surface that
 * shows Goals beside every other kind of record, where every other result
 * formats its dates. STEER-03 fixes that with the SAME `formatCalendarDate`
 * the Goal record, the Area record and the Goals workspace use, so a date reads
 * the same wherever the owner meets it.
 *
 * It also states the Goal's IDENTITY the way the rest of the product does: the
 * spine's explicit Open/Completed state, its Area, its target and its
 * contributing structure. It deliberately does NOT reach for GOAL-02's
 * measurement status or FOLLOW-02's movement: those are per-Goal derivations
 * over readings and Activity, and a search provider that made them would issue
 * work per hit on the product's most latency-sensitive surface. A one-line
 * subtitle is not where a Goal's whole story belongs — the record one keystroke
 * away is — and this is a bounded consistency fix, not a Search redesign.
 */

import type {
  SearchExecutor,
  SearchProviderContribution,
  SearchResultItem,
} from "~/kernel/modules";
import { formatCalendarDate } from "~/shared/task-record/task-view";

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
  if (hit.targetDate) {
    parts.push(
      `Target ${formatCalendarDate(hit.targetDate) ?? hit.targetDate}`,
    );
  }
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
