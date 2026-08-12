/**
 * CAL-01/CAL-02 — the agenda list. ONE component, three surfaces.
 *
 * Today, Tomorrow and Next 7 Days all draw this. There is deliberately no
 * second, "denser" or "weekly" variant: the day is the same day whichever page
 * is asking, and a surface-specific schedule row is how two pages come to look
 * like two products.
 *
 * ── The composition, and why it is this one ─────────────────────────────────
 *
 *   All day
 *   ●  Training Academy                                        Work
 *
 *   08:30  ●  Operational Officer Program                      Work
 *   09:00     Training Room 2
 *
 *   10:00  ●  L&D Team Meeting                    Now          Work
 *   11:00     Open notes
 *
 * A leading two-line time block in tabular figures (start over end), a source
 * accent mark where a Task's completion circle would be, then the title and one
 * quiet supporting line. It is the row shape Today's Meetings already used, with
 * the end time added — so the day still reads as ONE column of events with
 * several kinds in it, rather than as several lists that happen to be adjacent.
 *
 * ── Why there is no "Create meeting notes" button on every row ──────────────
 * Because most rows are not meetings. Lunch, leave, focus time, travel, the
 * dentist and a recurring commute block are all calendar events, and putting a
 * "make this a Meeting" control on each of them is an invitation to do the one
 * thing CAL-01 exists to prevent (§3). It is also three lines per row on a
 * phone, on a surface whose acceptance criterion is that it stays compact at
 * 320px.
 *
 * So the row carries "Open notes" only once a Meeting genuinely exists, and
 * "Create meeting notes" lives one tap away in the event's detail sheet — where
 * the owner can see what would be prefilled before they decide. Classifying
 * which events "deserve" the control automatically would need AI, and CAL-01
 * has none (§44).
 *
 * ── Never colour alone (AGENTS.md §15) ──────────────────────────────────────
 * "Now" and "Next" are WORDS. The source accent is a mark beside a NAME. A
 * cancelled event is struck through and says "Cancelled". Every distinction this
 * list draws survives greyscale, forced colours and a screen reader.
 */

import { Link } from "react-router";

import type { DaySchedule, ScheduleEntry } from "~/kernel/calendar";
import { areaAccentForRank } from "~/shared/pill";

export type ScheduleListProps = {
  readonly schedule: DaySchedule;
  /**
   * Open an external event's detail. Omitted on surfaces that have no drawer
   * (Next 7 Days), where the row is a plain, non-interactive statement of what
   * is on — which is exactly what a forward agenda is for.
   */
  readonly onOpenEvent?: (entryId: string) => void;
  /** A deep link to the same detail, so the row works before hydration. */
  readonly eventHref?: (entryId: string) => string;
};

/** The word beside a row that is happening now, or is up next. Never a colour. */
const RELATIVE_LABELS: Partial<Record<ScheduleEntry["relative"], string>> = {
  current: "Now",
  next: "Next",
};

/**
 * The source's identity mark: the SHARED design-system accent ramp, allocated by
 * the source's stable rank in the workspace.
 *
 * Never a colour from the feed (CAL-01 §28). External calendars carry their own
 * palettes, chosen against their own product's surfaces, and letting them through
 * would put unaudited colour on a page whose contrast is asserted in both
 * appearances and all five schemes. The ramp is the same one Areas use, so a
 * source's colour is legible everywhere by construction — and the source's NAME
 * is beside it, so the mark never has to carry meaning on its own.
 */
function SourceMark({ entry }: { readonly entry: ScheduleEntry }) {
  if (entry.kind === "meeting" || entry.sourceRank === null) {
    // A DalyHub Meeting takes the Meeting entity's own colour, exactly as it
    // does everywhere else in the product.
    return (
      <span
        className="dh-schedule__mark"
        data-kind="meeting"
        aria-hidden="true"
      />
    );
  }
  return (
    <span
      className="dh-schedule__mark"
      data-accent={areaAccentForRank(entry.sourceRank)}
      aria-hidden="true"
    />
  );
}

/** The one quiet supporting line: source, then location. Both optional. */
function supportingText(entry: ScheduleEntry): string | null {
  const parts = [entry.sourceName, entry.location].filter(
    (part): part is string => typeof part === "string" && part.length > 0,
  );
  return parts.length === 0 ? null : parts.join(" · ");
}

function ScheduleRow({
  entry,
  onOpenEvent,
  eventHref,
}: {
  readonly entry: ScheduleEntry;
  readonly onOpenEvent?: (entryId: string) => void;
  readonly eventHref?: (entryId: string) => string;
}) {
  const supporting = supportingText(entry);
  const relativeLabel = RELATIVE_LABELS[entry.relative];
  const interactive = entry.kind === "event" && onOpenEvent !== undefined;

  /*
   * The row's accessible name states the whole fact in words, in the order a
   * person would say it: what, when, where, and any state. A screen reader user
   * must not have to assemble "09" "30" "–" "10" "00" from a visual layout.
   */
  const accessibleName = [
    entry.title,
    // Already carries the date transition for a cross-day row, so
    // `dayTransitionLabel` is deliberately NOT repeated here.
    entry.timeAccessibleLabel,
    entry.spanLabel,
    supporting,
    entry.cancelled ? "Cancelled" : null,
    entry.tentative ? "Tentative" : null,
    relativeLabel === undefined
      ? null
      : `Happening ${relativeLabel.toLowerCase()}`,
  ]
    .filter(
      (part): part is string => typeof part === "string" && part.length > 0,
    )
    .join(", ");

  const title =
    entry.kind === "meeting" ? (
      <Link
        className="dh-day-row__title"
        /* The Meeting RECORD route is `/meeting/:id` (singular) — `/meetings` is
           the collection. Today's old meeting row linked to the collection path
           with an id appended and therefore 404ed; drawn here once, correctly,
           for every surface. */
        to={`/meeting/${encodeURIComponent(entry.id)}`}
      >
        {entry.title}
      </Link>
    ) : interactive ? (
      <a
        className="dh-day-row__title"
        href={eventHref?.(entry.id) ?? "#"}
        aria-label={accessibleName}
        onClick={(event) => {
          if (
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.button !== 0
          ) {
            return;
          }
          event.preventDefault();
          onOpenEvent?.(entry.id);
        }}
      >
        {entry.title}
      </a>
    ) : (
      <span className="dh-day-row__title">{entry.title}</span>
    );

  return (
    <li
      className="dh-day-row dh-schedule__row"
      data-state={entry.relative}
      data-cancelled={entry.cancelled ? "true" : undefined}
      data-testid="schedule-row"
    >
      {entry.allDay ? null : (
        <span className="dh-schedule__time" aria-hidden="true">
          <span className="dh-schedule__time-start">{entry.timeLabel}</span>
          {/* The end comes from its OWN field rather than from splitting the
              range label: the range label is prose, and for a cross-day row it
              is no longer an en-dashed pair to split. */}
          {entry.endTimeLabel === null ? null : (
            <span className="dh-schedule__time-end">{entry.endTimeLabel}</span>
          )}
        </span>
      )}
      <SourceMark entry={entry} />
      <span className="dh-day-row__stack">
        <span className="dh-schedule__headline">
          {title}
          {relativeLabel === undefined ? null : (
            <span className="dh-schedule__state" data-state={entry.relative}>
              {relativeLabel}
            </span>
          )}
          {entry.cancelled ? (
            <span className="dh-schedule__state" data-state="cancelled">
              Cancelled
            </span>
          ) : null}
        </span>
        {/*
          The supporting line, and where a cross-day row says so.

          The two-line time block is a fixed, tabular slot — "14:00" over
          "12:00" — and it has no room for a date without breaking the left edge
          every other row is aligned on. So the transition is stated in words
          here ("Until Thu 13 Aug"), beside the source and the location, which is
          also where the eye goes after the title. The full sentence is in the
          row's accessible name and in the event's detail sheet.
        */}
        {supporting === null &&
        entry.spanLabel === null &&
        entry.dayTransitionLabel === null ? null : (
          <span className="dh-day-row__meta">
            {[entry.spanLabel, entry.dayTransitionLabel, supporting]
              .filter((part): part is string => part !== null)
              .join(" · ")}
          </span>
        )}
        {/* The ONE inline affordance, and only when a Meeting genuinely exists.
            Everything else about the event is in its detail sheet. */}
        {entry.kind === "event" && entry.meetingId !== null ? (
          <Link
            className="dh-schedule__action"
            to={`/meeting/${encodeURIComponent(entry.meetingId)}`}
          >
            Open notes
            <span className="dh-visually-hidden">{` for ${entry.title}`}</span>
          </Link>
        ) : null}
      </span>
    </li>
  );
}

export function ScheduleList({
  schedule,
  onOpenEvent,
  eventHref,
}: ScheduleListProps) {
  if (schedule.count === 0) return null;
  return (
    <div className="dh-schedule">
      {/*
       * All-day items get their OWN region above the timed run, with a heading
       * that says what they are. Drawing "Annual leave" at 00:00 in the timed
       * column would be an invented claim: an all-day item has no time, and the
       * feed never said it starts at midnight (CAL-01 §27).
       */}
      {schedule.allDay.length > 0 ? (
        <div className="dh-day-section dh-schedule__allday">
          <h3 className="dh-day-section__label">All day</h3>
          <ul className="dh-day-list">
            {schedule.allDay.map((entry) => (
              <ScheduleRow
                key={entry.id}
                entry={entry}
                onOpenEvent={onOpenEvent}
                eventHref={eventHref}
              />
            ))}
          </ul>
        </div>
      ) : null}
      {schedule.timed.length > 0 ? (
        <ul className="dh-day-list dh-schedule__timed">
          {schedule.timed.map((entry) => (
            <ScheduleRow
              key={entry.id}
              entry={entry}
              onOpenEvent={onOpenEvent}
              eventHref={eventHref}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
