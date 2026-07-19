/**
 * TODAY-01 search provider — a fixture-backed contribution to Shared Search.
 *
 * This is an HONEST, production-discovered provider: the Today module registers it
 * in its manifest, so DS-08 finds it through `ModuleRegistry.listSearchProviders()`
 * exactly as it will find the real product modules — there is no manually
 * maintained provider array anywhere.
 *
 * It searches the SAME in-memory TODAY-01 fixtures the dashboard renders (focus
 * tasks, upcoming meetings/reminders/deadlines, active projects, recent notes) and
 * returns Drawer targets using the EXISTING Today Drawer keys (`task:<id>`,
 * `upcoming:<id>`, `project:<id>`, `note:<id>`), so selecting a result opens the
 * current DS-03 Record Layout in the Drawer over `/today`. No new persistence, no
 * D1 table, no fixture duplication.
 *
 * When Today swaps to real product repositories, only THIS executor changes — the
 * shared `SearchProviderContribution` contract (and everything downstream) stays
 * the same. It is React-free and workspace-scoped: the executor receives the
 * trusted `ModuleRuntimeContext` and never reaches across workspaces (the fixtures
 * are the single default workspace's data).
 */

import type {
  SearchExecutor,
  SearchProviderContribution,
  SearchResultItem,
} from "~/kernel/modules";
import { foldText, fuzzyMatch } from "~/shared/search/model";

import { TODAY_FIXTURE, UPCOMING_KIND } from "./fixtures";

/** The route that hosts Today's DrawerProvider (its `renderDrawer`). */
const TODAY_PATH = "/today";

const PROJECT_STATUS_LABEL: Record<string, string> = {
  active: "Active",
  paused: "Paused",
  blocked: "Blocked",
};

/** Build the fixed candidate set once — Today's openable records as results. */
function buildCandidates(): readonly SearchResultItem[] {
  const items: SearchResultItem[] = [];

  for (const task of TODAY_FIXTURE.focus) {
    items.push({
      id: `task:${task.id}`,
      title: task.title,
      subtitle: task.context,
      entityType: "task",
      target: {
        kind: "drawer",
        drawerKey: `task:${task.id}`,
        canonicalPath: TODAY_PATH,
      },
    });
  }

  for (const item of TODAY_FIXTURE.upcoming) {
    const kind = UPCOMING_KIND[item.kind];
    const subtitleParts = [kind.label, item.when];
    if (item.context !== undefined) {
      subtitleParts.push(item.context);
    }
    items.push({
      id: `upcoming:${item.id}`,
      title: item.title,
      subtitle: subtitleParts.join(" · "),
      entityType: kind.entity,
      target: {
        kind: "drawer",
        drawerKey: `upcoming:${item.id}`,
        canonicalPath: TODAY_PATH,
      },
    });
  }

  for (const project of TODAY_FIXTURE.projects) {
    items.push({
      id: `project:${project.id}`,
      title: project.title,
      subtitle: `${project.area} · ${PROJECT_STATUS_LABEL[project.status] ?? project.status}`,
      entityType: "project",
      target: {
        kind: "drawer",
        drawerKey: `project:${project.id}`,
        canonicalPath: TODAY_PATH,
      },
    });
  }

  for (const note of TODAY_FIXTURE.notes) {
    items.push({
      id: `note:${note.id}`,
      title: note.title,
      subtitle: note.snippet,
      entityType: "note",
      target: {
        kind: "drawer",
        drawerKey: `note:${note.id}`,
        canonicalPath: TODAY_PATH,
      },
    });
  }

  return items;
}

const CANDIDATES = buildCandidates();

/** A candidate matches when the query is a subsequence of its title or subtitle. */
function candidateMatches(
  query: ReturnType<typeof foldText>,
  item: SearchResultItem,
): boolean {
  if (fuzzyMatch(query, foldText(item.title)) !== null) {
    return true;
  }
  if (
    item.subtitle !== undefined &&
    fuzzyMatch(query, foldText(item.subtitle)) !== null
  ) {
    return true;
  }
  return false;
}

const searchToday: SearchExecutor = async (query) => {
  const folded = foldText(query.text);
  const matches = CANDIDATES.filter((item) => candidateMatches(folded, item));
  // Honour the per-provider bound the orchestrator passes; Search re-ranks.
  return matches.slice(0, Math.max(0, query.limit));
};

/** The Today module's search-provider contribution (registered in the manifest). */
export const todaySearchProvider: SearchProviderContribution = {
  id: "today.search",
  label: "Today",
  entityTypes: ["task", "meeting", "project", "note"],
  search: searchToday,
};
