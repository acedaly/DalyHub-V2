/**
 * CAL-03 — `POST /today/schedule/:eventId/meeting`.
 *
 * The one place an imported calendar occurrence becomes a canonical DalyHub
 * Meeting. A resource route with no `GET`: creating a record must not be
 * reachable by following a link or replayable from history.
 *
 * ── It uses the EXISTING Meeting authority ──────────────────────────────────
 * `scope.meetings.create` — the same repository, the same validation, the same
 * Activity, the same record the Meetings module writes when the owner creates a
 * meeting by hand. There is no Calendar-specific Meeting repository, no second
 * Meeting type and no "imported" flag: the result is indistinguishable from a
 * hand-made Meeting because it IS one (CAL-01 §23).
 *
 * ── It can never create two ─────────────────────────────────────────────────
 * The link table's primary key is the occurrence's durable external identity, so
 * "one Meeting per occurrence" is a DATABASE guarantee rather than a check this
 * route performs. The sequence is deliberately: look for an existing link →
 * create the Meeting → claim the link. If a concurrent request claimed it first,
 * `linkMeeting` reports the WINNER, this request archives the Meeting it just
 * made, and the owner is sent to the one Meeting that exists. A double-tap
 * cannot produce two records.
 *
 * ── What is prefilled, and what is not ──────────────────────────────────────
 * Only reliably-mapped facts: title, start, end, timezone, location and the
 * online meeting URL. No description (never imported), no attendees (never
 * imported, and People are never created from a calendar — CAL-01 §14/§45), and
 * no agenda invented on the owner's behalf.
 */

import { env } from "cloudflare:workers";

import { MeetingValidationError } from "~/kernel/meetings";
import { DEFAULT_OWNER_TIME_ZONE } from "~/kernel/preferences";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import type { Route } from "./+types/schedule";

export type ScheduleActionResult =
  | { readonly ok: true; readonly meetingId: string; readonly created: boolean }
  | { readonly ok: false; readonly message: string };

function json(data: ScheduleActionResult, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function action({ request, params, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw new Response("Method Not Allowed", { status: 405 });
  }
  if (String(params.action ?? "") !== "meeting") {
    throw new Response("Not Found", { status: 404 });
  }
  const eventId = String(params.eventId ?? "").trim();
  if (eventId.length === 0) {
    return json({ ok: false, message: "That event is unknown." }, 400);
  }

  const session = requireAuthenticatedSession(context);
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  // Workspace-scoped by construction: the repository is bound to the resolved
  // workspace, so an id from another workspace is simply not found.
  const row = await scope.calendarEvents.getScheduleRow(eventId);
  if (row === null) {
    return json({ ok: false, message: "That event is unknown." }, 404);
  }

  const identity = {
    sourceId: row.event.sourceId,
    externalUid: row.event.externalUid,
    occurrenceKey: row.event.occurrenceKey,
  };

  // Already linked: report the winner rather than creating anything. This is the
  // ordinary path for a second click, a stale page and a re-submitted form.
  const existing = await scope.calendarEvents.findLink(identity);
  if (existing !== null) {
    return json({ ok: true, meetingId: existing.meetingId, created: false });
  }

  const now = new Date();
  const timezone = await scope
    .ownerTimeZone()
    .catch(() => DEFAULT_OWNER_TIME_ZONE);

  try {
    const meeting = await scope.meetings.create({
      title: row.event.title,
      startsAt: row.event.startsAt.toISOString(),
      /*
       * An end is passed only when the occurrence genuinely has one AFTER the
       * start. An all-day item's end is the exclusive next midnight, which is a
       * true end; a zero-length reminder has none, and Meeting validation
       * refuses `endsAt <= startsAt` — correctly, so nothing is invented to get
       * past it.
       */
      endsAt:
        row.event.endsAt.getTime() > row.event.startsAt.getTime()
          ? row.event.endsAt.toISOString()
          : null,
      // The occurrence's own zone when the feed stated one, else the owner's.
      // Never a guess: both are real answers to "in which zone was this set?".
      timezone: row.event.timezone ?? timezone,
      location: row.event.location,
      // `mode` is deliberately NOT inferred from the presence of a join URL: an
      // event can carry a Teams link and still be held in a room, and the owner
      // is one field away from saying which.
      meetingUrl: row.event.meetingUrl,
    });

    const { link, created } = await scope.calendarEvents.linkMeeting(
      identity,
      meeting.id,
      now,
    );

    if (!created && link.meetingId !== meeting.id) {
      /*
       * A concurrent request won the link. The Meeting this request created is
       * a real record and must not be left behind as a silent duplicate, so it
       * is archived — the reversible collection state, never a hard delete,
       * because the owner may already have opened it.
       */
      await scope.meetings.archive(meeting.id).catch(() => undefined);
      return json({ ok: true, meetingId: link.meetingId, created: false });
    }

    return json({ ok: true, meetingId: meeting.id, created: true });
  } catch (cause) {
    if (cause instanceof MeetingValidationError) {
      // Meeting validation is NOT bypassed for imported events. When a feed
      // supplies something the Meeting model refuses, the refusal is reported.
      return json({ ok: false, message: cause.message }, 400);
    }
    return json(
      {
        ok: false,
        message: "Those meeting notes couldn’t be created. Please try again.",
      },
      500,
    );
  }
}
