/**
 * The Meetings module's repository-backed search provider (DS-08).
 *
 * RECALL-01 — a Meeting is findable by what was SAID in it, not only by what it
 * was called. The dedicated `searchMeetings` projection matches the title, the
 * location, the agenda, the notes and the body of any captured
 * agenda/decision/outcome item in ONE bounded, workspace-scoped statement, and
 * returns each meeting exactly once with an honest match source and a bounded,
 * syntax-free excerpt the repository cut in SQL. This provider renders that in
 * the shared `match source · state/metadata · excerpt` subtitle grammar — no new
 * result shape, no per-module excerpt component, no HTML.
 */

import type { MeetingSearchResult } from "~/kernel/meetings";
import type {
  SearchExecutor,
  SearchProviderContribution,
  SearchResultItem,
} from "~/kernel/modules";
import { searchSubtitle } from "~/shared/search/subtitle";

/** The user-facing name for where a hit matched. Never a raw enum value. */
function matchLabel(hit: MeetingSearchResult): string {
  switch (hit.matchSource) {
    case "title":
      return "Title";
    case "location":
      return "Location";
    case "agenda":
      return "Agenda";
    case "notes":
      return "Notes";
    case "item":
      switch (hit.itemKind) {
        case "decision":
          return "Decision";
        case "outcome":
          return "Outcome";
        case "action":
          return "Action item";
        default:
          return "Agenda item";
      }
  }
}

/**
 * `match source · location · excerpt`. The location keeps its long-standing
 * place as the meeting's one metadata fact; the excerpt is present only for a
 * body hit, because a title or location match is already visible in the row.
 */
function subtitle(hit: MeetingSearchResult): string | undefined {
  return searchSubtitle([matchLabel(hit), hit.location, hit.excerpt]);
}

const search: SearchExecutor = async (query, context) => {
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
  // The dedicated search projection covers upcoming AND recent meetings in one
  // bounded query (V2.0.1). The previous `list({ view: "recent" })` call carried
  // that view's `starts_at < now` window into Search, which made every future
  // meeting unfindable by its own title.
  const hits = await scope.meetings.searchMeetings({
    text,
    limit: query.limit,
  });
  return hits.map<SearchResultItem>((m) => ({
    id: `meeting:${m.id}`,
    // The canonical, unprefixed kernel id — so linked-record boosting matches.
    entityId: m.id,
    title: m.title,
    subtitle: subtitle(m),
    entityType: "meeting",
    target: { kind: "route", to: `/meeting/${encodeURIComponent(m.id)}` },
  }));
};
export const meetingSearchProvider: SearchProviderContribution = {
  id: "meetings.search",
  label: "Meetings",
  entityTypes: ["meeting"],
  search,
};
