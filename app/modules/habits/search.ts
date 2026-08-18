/**
 * HABITS-01 — the Habits global-search provider.
 *
 * One bounded, workspace-scoped read through the authoritative repository's own
 * `list` with its text query — never a second search implementation and never an
 * unbounded scan. The subtitle states the cadence and where the behaviour
 * belongs, which is what distinguishes two similarly-named habits in a result
 * list.
 */

import type {
  SearchExecutor,
  SearchProviderContribution,
  SearchResultItem,
} from "~/kernel/modules";
import { habitScheduleShortLabel } from "~/kernel/habits";

const searchHabits: SearchExecutor = async (query, context) => {
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
  const page = await scope.habits.list({
    status: "all",
    query: text,
    limit: query.limit,
  });
  return page.items.map<SearchResultItem>((habit) => ({
    id: `habit:${habit.id}`,
    entityId: habit.id,
    title: habit.title,
    subtitle: [
      habitScheduleShortLabel(habit.schedule),
      habit.area?.title ?? habit.goal?.title ?? null,
      habit.archivedAt === null ? null : "Archived",
    ]
      .filter(Boolean)
      .join(" · "),
    entityType: "habit",
    target: { kind: "route", to: `/habits/${encodeURIComponent(habit.id)}` },
  }));
};

export const habitsSearchProvider: SearchProviderContribution = {
  id: "habits.search",
  label: "Habits",
  entityTypes: ["habit"],
  search: searchHabits,
};
