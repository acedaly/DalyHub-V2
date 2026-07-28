import { env } from "cloudflare:workers";
import {
  MEETING_ATTENDEE_LINK,
  MeetingValidationError,
} from "~/kernel/meetings";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import { ownerLocalToUtc } from "~/shared/datetime";
import type { Route } from "./+types/create";
export async function action({ request, context }: Route.ActionArgs) {
  if (request.method !== "POST")
    throw new Response("Method Not Allowed", { status: 405 });
  const f = await request.formData(),
    s = requireAuthenticatedSession(context),
    scope = await resolveAuthenticatedWorkspaceScope(env, s),
    preferences = await scope.appPreferences.get(s.user.subject),
    timezone = preferences.timezone;
  try {
    const startsAt = ownerLocalToUtc(
      String(f.get("startsAtLocal") ?? ""),
      timezone,
    );
    if (!startsAt) {
      throw new MeetingValidationError(
        "startsAtLocal",
        "Enter a valid start time in your configured timezone.",
      );
    }
    const endsAtLocal = String(f.get("endsAtLocal") ?? "");
    const endsAt = endsAtLocal ? ownerLocalToUtc(endsAtLocal, timezone) : null;
    if (endsAtLocal && !endsAt) {
      throw new MeetingValidationError(
        "endsAtLocal",
        "Enter a valid end time in your configured timezone.",
      );
    }
    const meeting = await scope.meetings.create({
      title: String(f.get("title") ?? ""),
      startsAt: startsAt.toISOString(),
      endsAt: endsAt ? endsAt.toISOString() : null,
      timezone,
      location: String(f.get("location") ?? ""),
      mode: (String(f.get("mode") ?? "") || null) as
        "in_person" | "phone" | "online" | null,
      meetingUrl: String(f.get("meetingUrl") ?? ""),
      agendaMarkdown: "",
    });
    for (const personId of new Set(f.getAll("attendeeIds").map(String))) {
      const person = await scope.entities.getById(personId);
      if (person?.type === "person") {
        await scope.entityLinks.create({
          sourceEntityId: meeting.id,
          targetEntityId: personId,
          type: MEETING_ATTENDEE_LINK,
        });
      }
    }
    return Response.json({ ok: true, meetingId: meeting.id });
  } catch (e) {
    return Response.json({
      ok: false,
      fieldErrors:
        e instanceof MeetingValidationError
          ? { [e.field]: e.message }
          : undefined,
      formError:
        e instanceof MeetingValidationError
          ? undefined
          : "That meeting couldn’t be created. Please try again.",
    });
  }
}
