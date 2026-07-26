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
      cursor: u.searchParams.get("cursor") ?? undefined,
    });
    return {
      meetings: page.items.map(serializeMeeting),
      total: page.total,
      failed: false,
    };
  } catch {
    return { meetings: [], total: 0, failed: true };
  }
}
export default function RouteView({ loaderData }: Route.ComponentProps) {
  return <MeetingsCollection {...loaderData} view="upcoming" />;
}
