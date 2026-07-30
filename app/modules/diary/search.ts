import {
  createDiaryEntryTypeRegistry,
  type DiarySearchHit,
} from "~/kernel/diary";
import type {
  SearchExecutor,
  SearchProviderContribution,
  SearchResultItem,
} from "~/kernel/modules";
import { DEFAULT_APP_PREFERENCES } from "~/kernel/preferences";

const entryTypes = createDiaryEntryTypeRegistry();

function entryTypeLabel(type: string): string {
  return entryTypes.get(type)?.label ?? type;
}

function formatOccurredAt(entry: DiarySearchHit, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-AU", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone,
    }).format(entry.occurredAt);
  } catch {
    return new Intl.DateTimeFormat("en-AU", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: DEFAULT_APP_PREFERENCES.timezone,
    }).format(entry.occurredAt);
  }
}

function diarySubtitle(entry: DiarySearchHit, timezone: string): string {
  return `${entryTypeLabel(entry.entryType)} · ${formatOccurredAt(entry, timezone)}`;
}

const searchDiary: SearchExecutor = async (query, context) => {
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
  const timezone =
    context.ownerId !== undefined
      ? (await scope.appPreferences.get(context.ownerId)).timezone
      : DEFAULT_APP_PREFERENCES.timezone;
  const hits = await scope.diary.search({ text, limit: query.limit });
  return hits.map<SearchResultItem>((entry) => ({
    id: `diary:${entry.id}`,
    entityId: entry.id,
    title: entry.title,
    subtitle: diarySubtitle(entry, timezone || entry.timezone),
    entityType: "diary",
    target: {
      kind: "route",
      to: `/diary?inspector=view:${encodeURIComponent(entry.id)}`,
    },
  }));
};

export const diarySearchProvider: SearchProviderContribution = {
  id: "diary.search",
  label: "Diary",
  entityTypes: ["diary"],
  search: searchDiary,
};
