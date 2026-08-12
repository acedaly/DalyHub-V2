/**
 * CAL-01 — seed the synthetic day the evidence harness photographs.
 *
 * The SAME fixtures the E2E journeys use, so the screenshots show the product
 * over exactly the data the assertions were written against — and, like those
 * fixtures, entirely synthetic: no real feed address and no real calendar
 * content.
 *
 * Usage:
 *   node ./e2e/setup-dev-auth.mjs && node ./e2e/setup-local-db.mjs
 *   pnpm exec react-router dev --port 4173 &
 *   pnpm exec vite-node ./e2e/seed-calendar-evidence.mts
 *   node ./e2e/calendar-shots.mjs docs/design/assets/cal-01-2026-08
 */

import {
  CALENDAR_FIXTURE_PREFIX,
  cleanupCalendarFixtures,
  seedCalendarSources,
} from "./calendar-fixtures";

const TODAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Australia/Sydney",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

function shiftDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** An owner-local wall clock on a date, as the UTC instant to store. */
function atOwnerTime(dateIso: string, hour: number, minute = 0): string {
  const naive = Date.parse(
    `${dateIso}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`,
  );
  const probe = new Date(naive);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Australia/Sydney",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(probe);
  const value = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  const offset =
    (Date.UTC(
      value("year"),
      value("month") - 1,
      value("day"),
      value("hour"),
      value("minute"),
      value("second"),
    ) -
      probe.getTime()) /
    60_000;
  return new Date(naive - offset * 60_000).toISOString();
}

cleanupCalendarFixtures();

await seedCalendarSources([
  {
    id: "cal-e2e-work",
    name: "Work",
    feedUrl: "https://calendar.example.com/feeds/e2e-work.ics",
    events: [
      {
        id: "cal-e2e-ev-allday",
        uid: "e2e-allday",
        title: `${CALENDAR_FIXTURE_PREFIX}Training Academy`,
        allDay: true,
        allDayStartDate: TODAY,
        allDayEndDate: TODAY,
      },
      {
        id: "cal-e2e-ev-oop",
        uid: "e2e-oop",
        title: `${CALENDAR_FIXTURE_PREFIX}Operational Officer Program`,
        startsAt: atOwnerTime(TODAY, 8, 30),
        endsAt: atOwnerTime(TODAY, 9),
        location: "Training Room 2",
      },
      {
        id: "cal-e2e-ev-meeting",
        uid: "e2e-meeting",
        title: `${CALENDAR_FIXTURE_PREFIX}L&D Team Meeting`,
        startsAt: atOwnerTime(TODAY, 10),
        endsAt: atOwnerTime(TODAY, 11),
        location: "Room 4",
        meetingUrl: "https://teams.example.com/l/meetup-join/synthetic",
      },
      {
        id: "cal-e2e-ev-workshop",
        uid: "e2e-workshop",
        title: `${CALENDAR_FIXTURE_PREFIX}SAF19 Workshop`,
        startsAt: atOwnerTime(TODAY, 13),
        endsAt: atOwnerTime(TODAY, 14, 30),
      },
      {
        id: "cal-e2e-ev-long",
        uid: "e2e-long",
        title: `${CALENDAR_FIXTURE_PREFIX}A deliberately very long external event title that must truncate rather than wrap or overflow its row`,
        startsAt: atOwnerTime(TODAY, 15),
        endsAt: atOwnerTime(TODAY, 15, 30),
      },
      {
        id: "cal-e2e-ev-tomorrow",
        uid: "e2e-tomorrow",
        title: `${CALENDAR_FIXTURE_PREFIX}Regional Training Meeting`,
        startsAt: atOwnerTime(shiftDays(TODAY, 1), 9),
        endsAt: atOwnerTime(shiftDays(TODAY, 1), 10),
      },
      {
        id: "cal-e2e-ev-thursday",
        uid: "e2e-thursday",
        title: `${CALENDAR_FIXTURE_PREFIX}Project catch-up`,
        startsAt: atOwnerTime(shiftDays(TODAY, 3), 11, 30),
        endsAt: atOwnerTime(shiftDays(TODAY, 3), 12),
      },
      {
        id: "cal-e2e-ev-camping",
        uid: "e2e-camping",
        title: `${CALENDAR_FIXTURE_PREFIX}Camping`,
        allDay: true,
        allDayStartDate: shiftDays(TODAY, 3),
        allDayEndDate: shiftDays(TODAY, 5),
      },
    ],
  },
  {
    id: "cal-e2e-personal",
    name: "Personal",
    feedUrl: "https://calendar.example.com/feeds/e2e-personal.ics",
    events: [
      {
        id: "cal-e2e-ev-dentist",
        uid: "e2e-dentist",
        title: `${CALENDAR_FIXTURE_PREFIX}Dentist`,
        startsAt: atOwnerTime(TODAY, 16, 30),
        endsAt: atOwnerTime(TODAY, 17),
        location: "High Street",
      },
    ],
  },
]);

console.log(`Seeded the CAL-01 evidence day for ${TODAY}.`);
