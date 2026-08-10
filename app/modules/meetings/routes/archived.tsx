import { env } from "cloudflare:workers";
import { toLocalDayKey } from "~/kernel/diary";
import { DEFAULT_APP_PREFERENCES } from "~/kernel/preferences";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import { MeetingsCollection } from "../MeetingsCollection";
import { serializeMeeting } from "../meeting-view";
import type { Route } from "./+types/archived";
export async function loader({ request, context }: Route.LoaderArgs) {
  const s = requireAuthenticatedSession(context);
  try {
    const u = new URL(request.url);
    /*
     * UIX-04 §25 — the OWNER's calendar day, for the list's "Today" /
     * "Tomorrow" / "Yesterday" day headings.
     *
     * Resolved server-side against the stored timezone preference, exactly as
     * the Diary timeline resolves its own day: a relative heading computed in
     * the browser would say "Yesterday" about a 9am Sydney meeting opened from
     * London, and would differ between the server render and the hydration.
     * A missing preference degrades to the product-wide default rather than
     * costing the page.
     */
    const scope = await resolveAuthenticatedWorkspaceScope(env, s);
    const timezone = await scope.appPreferences
      .get(s.user.subject)
      .then((preferences) => preferences.timezone)
      .catch(() => DEFAULT_APP_PREFERENCES.timezone);
    const todayKey = toLocalDayKey(new Date(), timezone);
    const p = await scope.meetings.list({
      view: "archived",
      query: u.searchParams.get("q") ?? undefined,
      sort: parseMeetingSort(u.searchParams.get("sort")),
      cursor: u.searchParams.get("cursor") ?? undefined,
    });
    return {
      meetings: p.items.map(serializeMeeting),
      total: p.total,
      nextCursor: p.nextCursor,
      hasMore: p.hasMore,
      todayKey,
      failed: false,
    };
  } catch {
    return {
      meetings: [],
      total: 0,
      nextCursor: null,
      hasMore: false,
      todayKey: toLocalDayKey(new Date(), DEFAULT_APP_PREFERENCES.timezone),
      failed: true,
    };
  }
}
export default function R({ loaderData }: Route.ComponentProps) {
  return <MeetingsCollection {...loaderData} view="archived" />;
}

function parseMeetingSort(value: string | null) {
  return value === "updated" || value === "title" || value === "start"
    ? value
    : undefined;
}
