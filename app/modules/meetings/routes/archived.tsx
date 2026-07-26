import { env } from "cloudflare:workers";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import { MeetingsCollection } from "../MeetingsCollection";
import { serializeMeeting } from "../meeting-view";
import type { Route } from "./+types/archived";
export async function loader({ context }: Route.LoaderArgs) {
  const s = requireAuthenticatedSession(context);
  try {
    const p = await (
      await resolveAuthenticatedWorkspaceScope(env, s)
    ).meetings.list({ view: "archived" });
    return {
      meetings: p.items.map(serializeMeeting),
      total: p.total,
      failed: false,
    };
  } catch {
    return { meetings: [], total: 0, failed: true };
  }
}
export default function R({ loaderData }: Route.ComponentProps) {
  return <MeetingsCollection {...loaderData} view="archived" />;
}
