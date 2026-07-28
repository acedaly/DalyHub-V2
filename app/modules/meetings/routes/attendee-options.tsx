import { env } from "cloudflare:workers";

import { MEETING_ATTENDEE_LINK } from "~/kernel/meetings";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import type { Route } from "./+types/attendee-options";

const ATTENDEE_OPTIONS_LIMIT = 25;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);
  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";
  const excluded = new Set(url.searchParams.getAll("exclude"));
  const meetingId = url.searchParams.get("meetingId");

  if (meetingId) {
    const links = await scope.entityLinks.listForEntity(meetingId, {
      direction: "both",
      limit: 100,
    });
    for (const item of links.items) {
      if (item.link.type === MEETING_ATTENDEE_LINK) {
        excluded.add(item.counterpart.id);
      }
    }
  }

  const people = await scope.people.list({
    status: "active",
    query,
    limit: ATTENDEE_OPTIONS_LIMIT,
  });

  return json({
    options: people.items
      .filter((person) => !excluded.has(person.id))
      .map((person) => ({
        value: person.id,
        label: person.title,
        description: "Person",
      })),
  });
}
