import { env } from "cloudflare:workers";
import { MEETING_ATTENDEE_LINK, type MeetingItemKind } from "~/kernel/meetings";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import { ownerLocalToUtc } from "~/shared/datetime";
import type { Route } from "./+types/mutate";
export async function action({ request, context, params }: Route.ActionArgs) {
  if (request.method !== "POST")
    throw new Response("Method Not Allowed", { status: 405 });
  const s = requireAuthenticatedSession(context),
    scope = await resolveAuthenticatedWorkspaceScope(env, s),
    preferences = await scope.appPreferences.get(s.user.subject),
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
    else if (intent === "add_attendee") {
      // A Person attends the Meeting: the `meeting.attendee` link. Both endpoints
      // become subjects of the atomic `entity_link.created`, so the event appears
      // on the attendee's People Timeline too (MEET-02 → People seam). The kernel
      // enforces existence but NOT entity type, so require a real Person here — a
      // crafted id must never persist a Task/Note as an attendee.
      const personId = String(f.get("personId") ?? "");
      const person = await scope.entities.getById(personId);
      if (!person || person.type !== "person") {
        return Response.json(
          { ok: false, error: "Choose a person to add as an attendee." },
          { status: 400 },
        );
      }
      await scope.entityLinks.create({
        sourceEntityId: id,
        targetEntityId: personId,
        type: MEETING_ATTENDEE_LINK,
      });
    } else if (intent === "remove_attendee") {
      // Authorize the unlink: the link must be an attendee link anchored to THIS
      // meeting, so a crafted link id can't remove an unrelated relationship.
      const linkId = String(f.get("linkId") ?? "");
      const link = await scope.entityLinks.getById(linkId);
      if (
        !link ||
        link.type !== MEETING_ATTENDEE_LINK ||
        (link.sourceEntityId !== id && link.targetEntityId !== id)
      ) {
        return Response.json(
          { ok: false, error: "That attendee link can’t be removed." },
          { status: 400 },
        );
      }
      await scope.entityLinks.unlink(linkId);
    } else if (intent === "complete") {
      await scope.meetings.update(id, { status: "completed" });
    } else if (intent === "reopen") {
      await scope.meetings.update(id, { status: "planned" });
    } else if (intent === "cancel") {
      await scope.meetings.update(id, { status: "cancelled" });
    } else {
      const changes: Record<string, string | null> = {};
      for (const k of [
        "title",
        "timezone",
        "location",
        "mode",
        "meetingUrl",
        "status",
        "agendaMarkdown",
        "notesMarkdown",
      ])
        if (f.has(k)) changes[k] = String(f.get(k) ?? "") || null;
      const timezone = String(changes.timezone ?? "") || preferences.timezone;
      if (f.has("startsAtLocal")) {
        const startsAt = ownerLocalToUtc(
          String(f.get("startsAtLocal") ?? ""),
          timezone,
        );
        if (!startsAt) {
          return Response.json(
            { ok: false, error: "Enter a valid start time." },
            { status: 400 },
          );
        }
        changes.startsAt = startsAt.toISOString();
      }
      if (f.has("endsAtLocal")) {
        const raw = String(f.get("endsAtLocal") ?? "");
        const endsAt = raw ? ownerLocalToUtc(raw, timezone) : null;
        if (raw && !endsAt) {
          return Response.json(
            { ok: false, error: "Enter a valid end time." },
            { status: 400 },
          );
        }
        changes.endsAt = endsAt ? endsAt.toISOString() : null;
      }
      await scope.meetings.update(id, changes);
    }
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { ok: false, error: "That change couldn’t be saved." },
      { status: 400 },
    );
  }
}
