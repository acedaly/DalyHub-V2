import { env } from "cloudflare:workers";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import { MeetingsCollection } from "../MeetingsCollection";
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
    const page = await scope.meetings.list({
      view: "upcoming",
      query: u.searchParams.get("q") ?? undefined,
      sort: parseMeetingSort(u.searchParams.get("sort")),
      cursor: u.searchParams.get("cursor") ?? undefined,
    });
    return {
      meetings: page.items.map(serializeMeeting),
      total: page.total,
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
      failed: false,
    };
  } catch {
    return {
      meetings: [],
      total: 0,
      nextCursor: null,
      hasMore: false,
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
