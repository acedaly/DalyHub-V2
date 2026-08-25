import { env } from "cloudflare:workers";
import { toLocalDayKey } from "~/kernel/diary";
import { DEFAULT_APP_PREFERENCES } from "~/kernel/preferences";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import { MeetingsCollection } from "../MeetingsCollection";
import { loadMeetingRowAttendees } from "../meeting-attendees";
import { serializeMeeting } from "../meeting-view";
import type { Route } from "./+types/upcoming";
export function meta() {
  return [{ title: "Meetings · DalyHub" }];
}
export async function loader({ request, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  try {
    const scope = await resolveAuthenticatedWorkspaceScope(env, session);
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
    const timezone = await scope.appPreferences
      .get(session.user.subject)
      .then((preferences) => preferences.timezone)
      .catch(() => DEFAULT_APP_PREFERENCES.timezone);
    const todayKey = toLocalDayKey(new Date(), timezone);
    const page = await scope.meetings.list({
      view: "upcoming",
      query: u.searchParams.get("q") ?? undefined,
      sort: parseMeetingSort(u.searchParams.get("sort")),
      cursor: u.searchParams.get("cursor") ?? undefined,
    });
    /*
     * DEBT-124 — the page's attendees, in ONE bounded relationship read.
     *
     * UIX-04 §25 wanted People context on a meeting row and could not have it:
     * the kernel published only `listForEntity`, so thirty rows meant thirty
     * queries and the collection correctly did without. `listForEntities` is
     * the batched counterpart; this is one statement for the whole page.
     *
     * A failure costs the CONTEXT, never the page: a collection that cannot
     * resolve who was in a meeting should still list the meetings.
     */
    const attendees = await loadMeetingRowAttendees(
      scope.entityLinks,
      page.items.map((meeting) => meeting.id),
    ).catch(() => new Map());

    return {
      meetings: page.items.map((meeting) => ({
        ...serializeMeeting(meeting),
        attendees: attendees.get(meeting.id) ?? null,
      })),
      total: page.total,
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
      todayKey,
      ownerTimezone: timezone,
      failed: false,
    };
  } catch {
    return {
      meetings: [],
      total: 0,
      nextCursor: null,
      hasMore: false,
      todayKey: toLocalDayKey(new Date(), DEFAULT_APP_PREFERENCES.timezone),
      ownerTimezone: DEFAULT_APP_PREFERENCES.timezone,
      failed: true,
    };
  }
}
export default function RouteView({ loaderData }: Route.ComponentProps) {
  return <MeetingsCollection {...loaderData} view="upcoming" />;
}

function parseMeetingSort(value: string | null) {
  return value === "updated" || value === "title" || value === "start"
    ? value
    : undefined;
}
