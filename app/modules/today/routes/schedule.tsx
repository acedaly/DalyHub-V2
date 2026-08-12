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
 * The same compensation covers the other way the claim can fail: if the link
 * write ERRORS after the Meeting was created, the Meeting is archived before the
 * failure is reported. Without it a transient storage failure would leave an
 * unlinked Meeting behind, and the retry — finding no link — would create a
 * second one.
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
import { ownerLocalToUtc } from "~/shared/datetime";

import type { Route } from "./+types/schedule";

export type ScheduleActionResult =
  | { readonly ok: true; readonly meetingId: string; readonly created: boolean }
  | { readonly ok: false; readonly message: string };

/** The calendar date after `dateIso`. Date-only arithmetic, never an instant. */
function nextDate(dateIso: string): string {
  return new Date(Date.parse(`${dateIso}T00:00:00Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);
}

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

  /*
   * An ALL-DAY occurrence has no instant, and must not be given one by accident.
   *
   * An all-day item is a floating calendar DATE. The parser stores a placeholder
   * instant alongside the dates so one column can order the whole schedule, and
   * that placeholder is midnight UTC — which is 10:00 in Sydney and 17:00 the
   * PREVIOUS DAY in Los Angeles. Passing it into the timed Meeting model made
   * "Training Academy, 12 August" become a Meeting at 10:00 on the 12th, or on
   * the 11th, depending on where the owner lives.
   *
   * So the bounds are derived from the stored DATES, in the owner's timezone:
   * their midnight to the following midnight after the last day it covers. That
   * is the honest reading of "all day, on these dates" for a model that requires
   * instants — no time is invented, and the date is right wherever the owner is.
   */
  const allDay = row.event.allDay && row.event.allDayStartDate !== null;
  const allDayStart = allDay
    ? ownerLocalToUtc(`${row.event.allDayStartDate}T00:00`, timezone)
    : null;
  const allDayEnd = allDay
    ? ownerLocalToUtc(
        `${nextDate(row.event.allDayEndDate ?? row.event.allDayStartDate!)}T00:00`,
        timezone,
      )
    : null;

  const startsAt = allDayStart ?? row.event.startsAt;
  const endsAt = allDay ? allDayEnd : row.event.endsAt;

  try {
    const meeting = await scope.meetings.create({
      title: row.event.title,
      startsAt: startsAt.toISOString(),
      /*
       * An end is passed only when the occurrence genuinely has one AFTER the
       * start. A zero-length reminder has none, and Meeting validation refuses
       * `endsAt <= startsAt` — correctly, so nothing is invented to get past it.
       */
      endsAt:
        endsAt !== null && endsAt.getTime() > startsAt.getTime()
          ? endsAt.toISOString()
          : null,
      /*
       * The occurrence's own zone when the feed stated one, else the owner's.
       * An all-day item never states one — it has no time to state a zone for —
       * so it takes the owner's, which is the zone its bounds were just derived
       * in.
       */
      timezone: (allDay ? null : row.event.timezone) ?? timezone,
      location: row.event.location,
      // `mode` is deliberately NOT inferred from the presence of a join URL: an
      // event can carry a Teams link and still be held in a room, and the owner
      // is one field away from saying which.
      meetingUrl: row.event.meetingUrl,
    });

    /*
     * From here the Meeting EXISTS, so every path below has to account for it.
     *
     * A failure to claim the link would otherwise leave a Meeting with no
     * occurrence pointing at it — and the next attempt, finding no link, would
     * create a second one. That is precisely the silent duplicate this endpoint
     * exists to prevent, arriving by the back door.
     */
    let link: Awaited<ReturnType<typeof scope.calendarEvents.linkMeeting>>;
    try {
      link = await scope.calendarEvents.linkMeeting(identity, meeting.id, now);
    } catch (cause) {
      // Compensate: the Meeting is archived — the reversible collection state,
      // never a hard delete, because the owner may already have opened it — so
      // a retry starts from a clean slate rather than accumulating orphans.
      await scope.meetings.archive(meeting.id).catch(() => undefined);
      throw cause;
    }

    if (!link.created && link.link.meetingId !== meeting.id) {
      /*
       * A concurrent request won the link. Same compensation, same reason: the
       * Meeting this request created is real and must not be left behind as a
       * silent duplicate.
       */
      await scope.meetings.archive(meeting.id).catch(() => undefined);
      return json({ ok: true, meetingId: link.link.meetingId, created: false });
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
