import { env } from "cloudflare:workers";
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
        String(f.get("kind")) as "decision" | "outcome",
        String(f.get("body") ?? ""),
      );
    else if (intent === "remove_item")
      await scope.meetings.removeItem(id, String(f.get("itemId")));
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
