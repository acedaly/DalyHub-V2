import { env } from "cloudflare:workers";
import { MeetingValidationError } from "~/kernel/meetings";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import type { Route } from "./+types/create";
export async function action({ request, context }: Route.ActionArgs) {
  if (request.method !== "POST")
    throw new Response("Method Not Allowed", { status: 405 });
  const f = await request.formData(),
    s = requireAuthenticatedSession(context);
  try {
    const meeting = await (
      await resolveAuthenticatedWorkspaceScope(env, s)
    ).meetings.create({
      title: String(f.get("title") ?? ""),
      startsAt: String(f.get("startsAt") ?? ""),
      endsAt: String(f.get("endsAt") ?? "") || null,
      timezone: String(f.get("timezone") ?? "UTC"),
      location: String(f.get("location") ?? ""),
      mode: (String(f.get("mode") ?? "") || null) as
        "in_person" | "phone" | "online" | null,
      meetingUrl: String(f.get("meetingUrl") ?? ""),
      agendaMarkdown: String(f.get("agendaMarkdown") ?? ""),
    });
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
