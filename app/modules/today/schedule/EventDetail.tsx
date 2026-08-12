/**
 * CAL-01 §22 / CAL-03 — the imported event's detail surface, hosted in the
 * shared DS-03 Drawer.
 *
 * The Drawer rather than a bespoke panel because that is what DalyHub opens
 * records in, and because on a phone the Drawer IS the record's screen — the
 * same affordance the Task record already uses from this same page, with the
 * same focus, history and back behaviour.
 *
 * ── What it shows ───────────────────────────────────────────────────────────
 * Only what DalyHub actually holds. There is no description, no attendee list
 * and no organiser here because none of those were imported (CAL-01 §14), and
 * there is deliberately no embedded provider HTML and no iframe: the event's
 * content belongs to the external calendar and this is a projection of the small
 * part of it a schedule needs.
 *
 * The feed URL appears NOWHERE on this surface. The source is named by the name
 * the owner gave it.
 *
 * ── The one action that writes ──────────────────────────────────────────────
 * "Create meeting notes" posts to the Today module's schedule endpoint, which
 * calls the EXISTING Meeting creation authority. It is not a second Meeting
 * type, not a Calendar-owned Meeting repository, and not a bypass of Meeting
 * validation — the record it produces is an ordinary DalyHub Meeting, and once
 * it exists this surface offers "Open meeting" instead.
 */

import { useEffect } from "react";
import { Link, useFetcher, useRevalidator } from "react-router";

import type { ScheduleEntry } from "~/kernel/calendar";

import type { ScheduleActionResult } from "../routes/schedule";

/** The drawer key an imported occurrence opens under. */
export const EVENT_DRAWER_PREFIX = "event";

export function eventDrawerKey(entryId: string): string {
  return `${EVENT_DRAWER_PREFIX}:${entryId}`;
}

/** One labelled fact. Absent facts render nothing — never "Unknown". */
function Fact({
  label,
  value,
}: {
  readonly label: string;
  readonly value: React.ReactNode;
}) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="dh-event-detail__fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function EventDetail({
  entry,
  dateLong,
}: {
  readonly entry: ScheduleEntry;
  /** The owner-calendar date this occurrence is being viewed on, in words. */
  readonly dateLong: string;
}) {
  const fetcher = useFetcher<ScheduleActionResult>();
  const revalidator = useRevalidator();
  const result = fetcher.data;
  const creating = fetcher.state !== "idle";

  useEffect(() => {
    // A created Meeting changes the schedule row behind the drawer ("Create
    // meeting notes" becomes "Open notes"), so the page is revalidated rather
    // than patched locally — one truth, read back from the server.
    if (result !== undefined && result.ok) revalidator.revalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  // The link the SERVER knows about, or the one this action just created. The
  // second is what makes the drawer update without waiting for revalidation.
  const meetingId =
    result !== undefined && result.ok ? result.meetingId : entry.meetingId;

  return (
    <div className="dh-event-detail">
      <dl className="dh-event-detail__facts">
        <Fact label="Date" value={dateLong} />
        <Fact
          label="Time"
          value={entry.allDay ? "All day" : entry.timeAccessibleLabel}
        />
        <Fact label="Spans" value={entry.spanLabel} />
        <Fact label="Calendar" value={entry.sourceName} />
        <Fact label="Location" value={entry.location} />
        {entry.cancelled ? (
          <Fact
            label="Status"
            value="Cancelled in the external calendar. Any notes you have kept in DalyHub are untouched."
          />
        ) : null}
        {entry.tentative ? <Fact label="Status" value="Tentative" /> : null}
      </dl>

      <div className="dh-event-detail__actions">
        {entry.meetingUrl === null ? null : (
          <a
            className="dh-btn dh-btn--outlined"
            href={entry.meetingUrl}
            target="_blank"
            // `noopener`/`noreferrer` on a URL that came from a feed DalyHub
            // does not control: the destination gets no handle on this window
            // and no referrer naming the deployment.
            rel="noopener noreferrer"
          >
            Join meeting
            <span className="dh-visually-hidden">{` for ${entry.title}`}</span>
          </a>
        )}

        {meetingId === null ? (
          <fetcher.Form
            method="post"
            action={`/today/schedule/${encodeURIComponent(entry.id)}/meeting`}
          >
            <button
              type="submit"
              className="dh-btn dh-btn--filled"
              disabled={creating}
              data-testid="event-create-meeting"
            >
              {creating ? "Creating…" : "Create meeting notes"}
              <span className="dh-visually-hidden">{` for ${entry.title}`}</span>
            </button>
          </fetcher.Form>
        ) : (
          <Link
            className="dh-btn dh-btn--filled"
            to={`/meeting/${encodeURIComponent(meetingId)}`}
            data-testid="event-open-meeting"
          >
            Open meeting
            <span className="dh-visually-hidden">{` for ${entry.title}`}</span>
          </Link>
        )}
      </div>

      {result !== undefined && !result.ok ? (
        <p className="dh-event-detail__error" role="alert">
          {result.message}
        </p>
      ) : null}

      {/*
       * The boundary, said plainly on the surface where it matters most.
       *
       * An owner who has just made notes against a calendar event needs to know
       * which of the two records is theirs — because the answer decides what
       * happens when the meeting moves, and what happens if it is cancelled.
       */}
      <p className="dh-event-detail__note">
        {meetingId === null
          ? "This event belongs to your external calendar. DalyHub shows it read-only, and creating meeting notes makes a separate DalyHub Meeting you own."
          : "The meeting notes are a DalyHub record you own. Changes in your external calendar update this event, and never rewrite what you have written."}
      </p>
    </div>
  );
}
