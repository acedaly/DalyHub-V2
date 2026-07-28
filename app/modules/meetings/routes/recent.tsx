import { env } from "cloudflare:workers";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import { MeetingsCollection } from "../MeetingsCollection";
import { serializeMeeting } from "../meeting-view";
import type { Route } from "./+types/recent";
export async function loader({ request, context }: Route.LoaderArgs) {
  const s = requireAuthenticatedSession(context);
  try {
    const u = new URL(request.url);
    const p = await (
      await resolveAuthenticatedWorkspaceScope(env, s)
    ).meetings.list({
      view: "recent",
      query: u.searchParams.get("q") ?? undefined,
      sort: parseMeetingSort(u.searchParams.get("sort")),
      cursor: u.searchParams.get("cursor") ?? undefined,
    });
    return {
      meetings: p.items.map(serializeMeeting),
      total: p.total,
      nextCursor: p.nextCursor,
      hasMore: p.hasMore,
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
export default function R({ loaderData }: Route.ComponentProps) {
  return <MeetingsCollection {...loaderData} view="recent" />;
}

function parseMeetingSort(value: string | null) {
  return value === "updated" || value === "title" || value === "start"
    ? value
    : undefined;
}
