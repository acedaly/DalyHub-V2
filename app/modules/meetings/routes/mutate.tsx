import { env } from "cloudflare:workers";
import { MEETING_ATTENDEE_LINK, type MeetingItemKind } from "~/kernel/meetings";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import type { Route } from "./+types/mutate";
export async function action({ request, context, params }: Route.ActionArgs) {
  if (request.method !== "POST")
    throw new Response("Method Not Allowed", { status: 405 });
  const s = requireAuthenticatedSession(context),
    scope = await resolveAuthenticatedWorkspaceScope(env, s),
    f = await request.formData(),
    id = params.meetingId;
  if (!(await scope.meetings.get(id)))
    throw new Response("Not Found", { status: 404 });
  try {
    const intent = String(f.get("intent"));
    if (intent === "archive") await scope.meetings.archive(id);
    else if (intent === "restore") await scope.meetings.restore(id);
    else if (intent === "add_item")
      await scope.meetings.addItem(
        id,
        String(f.get("kind")) as MeetingItemKind,
        String(f.get("body") ?? ""),
      );
    else if (intent === "remove_item")
      await scope.meetings.removeItem(id, String(f.get("itemId")));
    else if (intent === "add_attendee")
      // A Person attends the Meeting: the `meeting.attendee` link. Both endpoints
      // become subjects of the atomic `entity_link.created`, so the event appears
      // on the attendee's People Timeline too (MEET-02 → People seam).
      await scope.entityLinks.create({
        sourceEntityId: id,
        targetEntityId: String(f.get("personId") ?? ""),
        type: MEETING_ATTENDEE_LINK,
      });
    else if (intent === "remove_attendee")
      await scope.entityLinks.unlink(String(f.get("linkId") ?? ""));
    else {
      const changes: Record<string, string | null> = {};
      for (const k of [
        "startsAt",
        "endsAt",
        "timezone",
        "location",
        "mode",
        "meetingUrl",
        "status",
        "agendaMarkdown",
        "notesMarkdown",
      ])
        if (f.has(k)) changes[k] = String(f.get(k) ?? "") || null;
      await scope.meetings.update(id, changes);
    }
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { ok: false, error: "That change couldn't be saved." },
      { status: 400 },
    );
  }
}
