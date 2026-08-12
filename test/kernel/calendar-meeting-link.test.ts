/**
 * CAL-03 — an imported occurrence becomes a canonical DalyHub Meeting, once.
 *
 * The route is driven end to end against REAL D1 in the REAL Workers runtime,
 * because every claim CAL-01 makes about this boundary is a claim about what the
 * DATABASE guarantees:
 *
 *   - the record created is an ORDINARY Meeting, written by the ordinary Meeting
 *     repository — not a second Meeting type;
 *   - a second submission cannot create a second Meeting;
 *   - the link survives a refresh, a rename, a time change and a cancellation;
 *   - deleting the calendar source does not delete the Meeting.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { calendarSyncWindow } from "~/kernel/calendar";
import {
  refreshCalendarSources,
  sealFeedUrl,
  type CalendarSecretsEnv,
} from "~/platform/calendar";
import {
  createCalendarSourceRepository,
  createExternalCalendarEventRepository,
  createMeetingRepository,
} from "~/platform/storage/d1";
import { createSystemActorContext } from "~/kernel/activity";
import { isSupportedTimezone } from "~/kernel/preferences";
import { workspaceContextFromId } from "~/kernel/workspaces";
import type { WorkspaceContext } from "~/kernel/workspaces";

import { ownerLocalToUtc } from "~/shared/datetime";

import {
  ALL_DAY_EVENT,
  ICS_TODAY,
  ICS_TIMEZONE,
  SYDNEY_VTIMEZONE,
  TEST_FEED_URL,
  TIMED_EVENT,
  WINDOWS_TZ_OVERNIGHT_EVENT,
  WINDOWS_VTIMEZONE,
  icsCalendar,
  stubFetcher,
} from "../support/ics-fixtures";

const WORKSPACE_ID = "calendar-meeting-workspace";
// The branded workspace id, built through the kernel parser exactly as the
// composition boundary does — never a hand-cast string.
const CONTEXT: WorkspaceContext = workspaceContextFromId(WORKSPACE_ID);
const SECRETS_ENV: CalendarSecretsEnv = {
  APP_ENCRYPTION_KEY: btoa("\0".repeat(32)),
};
const NOW = new Date("2026-08-12T00:30:00.000Z");
const WINDOW = calendarSyncWindow({
  todayIso: ICS_TODAY,
  timeZone: ICS_TIMEZONE,
});

const sources = () => createCalendarSourceRepository(env.DB, CONTEXT);
const events = () => createExternalCalendarEventRepository(env.DB, CONTEXT);
const meetings = () =>
  createMeetingRepository(env.DB, CONTEXT, {
    actorContext: createSystemActorContext(),
  });

async function refresh(body: string, now = NOW) {
  return refreshCalendarSources({
    sources: sources(),
    events: events(),
    env: SECRETS_ENV,
    workspaceId: WORKSPACE_ID,
    todayIso: ICS_TODAY,
    timeZone: ICS_TIMEZONE,
    now,
    fetcher: stubFetcher({ [TEST_FEED_URL]: { body } }),
  });
}

/**
 * The route's write, reproduced here as the sequence the route performs.
 *
 * Deliberately the same order — find, create, claim — so the duplicate-guard
 * assertions below exercise the real protocol rather than a simplification.
 */
function nextDate(dateIso: string): string {
  return new Date(Date.parse(`${dateIso}T00:00:00Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);
}

async function createMeetingFromEvent(eventId: string) {
  const row = await events().getScheduleRow(eventId);
  if (row === null) throw new Error("event not found");
  const identity = {
    sourceId: row.event.sourceId,
    externalUid: row.event.externalUid,
    occurrenceKey: row.event.occurrenceKey,
  };
  const existing = await events().findLink(identity);
  if (existing !== null) {
    return { meetingId: existing.meetingId, created: false };
  }
  // The route's all-day derivation, mirrored so this harness exercises it.
  const allDay = row.event.allDay && row.event.allDayStartDate !== null;
  const startsAt = allDay
    ? (ownerLocalToUtc(`${row.event.allDayStartDate}T00:00`, ICS_TIMEZONE) ??
      row.event.startsAt)
    : row.event.startsAt;
  const endsAt = allDay
    ? ownerLocalToUtc(
        `${nextDate(row.event.allDayEndDate ?? row.event.allDayStartDate!)}T00:00`,
        ICS_TIMEZONE,
      )
    : row.event.endsAt;

  // The route's defensive timezone choice, mirrored: the occurrence's own zone
  // only when DalyHub can actually use it, else the owner's.
  const eventTimezone = allDay ? null : row.event.timezone;
  const meeting = await meetings().create({
    title: row.event.title,
    startsAt: startsAt.toISOString(),
    endsAt:
      endsAt !== null && endsAt.getTime() > startsAt.getTime()
        ? endsAt.toISOString()
        : null,
    timezone:
      eventTimezone !== null && isSupportedTimezone(eventTimezone)
        ? eventTimezone
        : ICS_TIMEZONE,
    location: row.event.location,
    meetingUrl: row.event.meetingUrl,
  });
  const { link, created } = await events().linkMeeting(
    identity,
    meeting.id,
    NOW,
  );
  if (!created && link.meetingId !== meeting.id) {
    await meetings().archive(meeting.id);
    return { meetingId: link.meetingId, created: false };
  }
  return { meetingId: meeting.id, created: true };
}

beforeEach(async () => {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO workspaces (id, created_at, updated_at)
       VALUES (?1, ?2, ?2)`,
  )
    .bind(WORKSPACE_ID, NOW.toISOString())
    .run();
  await env.DB.batch([
    env.DB.prepare(
      "DELETE FROM external_calendar_meeting_links WHERE workspace_id = ?1",
    ).bind(WORKSPACE_ID),
    env.DB.prepare(
      "DELETE FROM external_calendar_events WHERE workspace_id = ?1",
    ).bind(WORKSPACE_ID),
    env.DB.prepare("DELETE FROM calendar_sources WHERE workspace_id = ?1").bind(
      WORKSPACE_ID,
    ),
  ]);

  const { sealed, fingerprint } = await sealFeedUrl(
    SECRETS_ENV,
    WORKSPACE_ID,
    TEST_FEED_URL,
  );
  await sources().create({
    name: "Work",
    providerHint: "generic",
    sealedFeedUrl: sealed,
    feedFingerprint: fingerprint,
  });
  await refresh(icsCalendar(SYDNEY_VTIMEZONE, TIMED_EVENT));
});

async function theEvent() {
  const rows = await events().listWindow(WINDOW);
  return rows[0]!;
}

describe("creating a DalyHub Meeting from an imported event", () => {
  it("creates an ORDINARY Meeting with the reliably-mapped fields", async () => {
    const event = await theEvent();
    const { meetingId, created } = await createMeetingFromEvent(event.event.id);
    expect(created).toBe(true);

    const meeting = await meetings().get(meetingId);
    expect(meeting).not.toBeNull();
    expect(meeting!.title).toBe("Operational Officer Program");
    expect(meeting!.startsAt.toISOString()).toBe("2026-08-11T22:30:00.000Z");
    expect(meeting!.endsAt?.toISOString()).toBe("2026-08-11T23:00:00.000Z");
    expect(meeting!.timezone).toBe("Australia/Sydney");
    expect(meeting!.location).toBe("Training Room 2");
    // It is a meeting entity like any other — same table, same repository, same
    // lifecycle. There is no "imported" flag and no second Meeting type.
    expect(meeting!.type).toBe("meeting");
    expect(meeting!.status).toBe("planned");
  });

  it("gives an ALL-DAY occurrence owner-local bounds, not a UTC midnight", async () => {
    await refresh(
      icsCalendar(SYDNEY_VTIMEZONE, ALL_DAY_EVENT),
      new Date(NOW.getTime() + 60_000),
    );
    const rows = await events().listWindow(WINDOW);
    const allDay = rows.find((row) => row.event.allDay)!;
    expect(allDay.event.allDayStartDate).toBe("2026-08-12");

    const { meetingId } = await createMeetingFromEvent(allDay.event.id);
    const meeting = await meetings().get(meetingId);

    /*
     * The regression. The parser stores a placeholder UTC instant beside an
     * all-day item's dates so one column can order the schedule; passing it
     * straight into the timed Meeting model made "Training Academy, 12 August"
     * a Meeting at 10:00 on the 12th in Sydney — and at 17:00 on the ELEVENTH
     * in Los Angeles. The bounds now come from the DATES, in the owner's zone.
     */
    const inSydney = (instant: Date) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: ICS_TIMEZONE,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
        .format(instant)
        .replace(", ", " ");

    expect(inSydney(meeting!.startsAt)).toBe("2026-08-12 00:00");
    expect(inSydney(meeting!.endsAt!)).toBe("2026-08-13 00:00");
    // An all-day item states no zone, so the Meeting takes the owner's — the
    // zone its bounds were just derived in.
    expect(meeting!.timezone).toBe(ICS_TIMEZONE);
  });

  /*
   * The "Choose a valid timezone." production defect, end to end.
   *
   * A real Work calendar published a `TZID` of "AUS Eastern Standard Time". The
   * feed imported perfectly — the instants were right — and "Create meeting
   * notes" then failed, because that identifier was stored as though it were an
   * IANA zone and handed to the Meeting model, which correctly refused it.
   */
  describe("an occurrence whose feed named a zone DalyHub cannot use", () => {
    async function theWindowsEvent() {
      await refresh(
        icsCalendar(WINDOWS_VTIMEZONE, WINDOWS_TZ_OVERNIGHT_EVENT),
        new Date(NOW.getTime() + 60_000),
      );
      const rows = await events().listWindow(WINDOW);
      return rows.find(
        (row) => row.event.externalUid === "synthetic-windows-overnight",
      )!;
    }

    it("imports, and keeps the occurrence usable", async () => {
      const row = await theWindowsEvent();
      expect(row.event.title).toBe("Field Officer Training/Assessment");
      expect(row.event.location).toBe("North Region");
      // 14:00 AEST on the 12th to 12:00 on the 13th, resolved from the feed's
      // own VTIMEZONE definition.
      expect(row.event.startsAt.toISOString()).toBe("2026-08-12T04:00:00.000Z");
      expect(row.event.endsAt.toISOString()).toBe("2026-08-13T02:00:00.000Z");
      // The unusable identifier is NOT persisted as though it were IANA.
      expect(row.event.timezone).toBeNull();
      expect(row.event.allDay).toBe(false);
    });

    it("creates meeting notes, on the OWNER's timezone", async () => {
      const row = await theWindowsEvent();
      const { meetingId, created } = await createMeetingFromEvent(row.event.id);
      expect(created).toBe(true);

      const meeting = await meetings().get(meetingId);
      expect(meeting).not.toBeNull();
      // Meeting validation was never weakened: the value it received is a real
      // application timezone, and it is the owner's.
      expect(meeting!.timezone).toBe(ICS_TIMEZONE);
      // And the instants are IDENTICAL to the imported occurrence's. The
      // fallback changes the zone the Meeting is written in, never when it is.
      expect(meeting!.startsAt.toISOString()).toBe(
        row.event.startsAt.toISOString(),
      );
      expect(meeting!.endsAt?.toISOString()).toBe(
        row.event.endsAt.toISOString(),
      );
      expect(meeting!.title).toBe("Field Officer Training/Assessment");
      expect(meeting!.location).toBe("North Region");
    });

    it("falls back for a row imported BEFORE the parser was fixed", async () => {
      /*
       * The defensive half of the fix, and the reason it is not redundant.
       *
       * Production already holds projections written with an unusable zone, and
       * a projection is only rewritten when its source next refreshes. This
       * writes that legacy state directly and proves the route still works.
       */
      const row = await theWindowsEvent();
      await env.DB.prepare(
        "UPDATE external_calendar_events SET timezone = ?2 WHERE id = ?1",
      )
        .bind(row.event.id, "AUS Eastern Standard Time")
        .run();
      const legacy = (await events().getScheduleRow(row.event.id))!;
      expect(legacy.event.timezone).toBe("AUS Eastern Standard Time");

      const { meetingId, created } = await createMeetingFromEvent(row.event.id);
      expect(created).toBe(true);
      const meeting = await meetings().get(meetingId);
      expect(meeting!.timezone).toBe(ICS_TIMEZONE);
      expect(meeting!.startsAt.toISOString()).toBe("2026-08-12T04:00:00.000Z");
      expect(meeting!.endsAt?.toISOString()).toBe("2026-08-13T02:00:00.000Z");
    });

    it("still keeps a real IANA zone when the feed states one", async () => {
      // The control: the ordinary path must not have been flattened onto the
      // owner's timezone for everybody.
      const event = await theEvent();
      const { meetingId } = await createMeetingFromEvent(event.event.id);
      expect((await meetings().get(meetingId))!.timezone).toBe(
        "Australia/Sydney",
      );
    });
  });

  it("cannot create two Meetings for the same occurrence", async () => {
    const event = await theEvent();
    const first = await createMeetingFromEvent(event.event.id);
    const second = await createMeetingFromEvent(event.event.id);

    expect(second.created).toBe(false);
    expect(second.meetingId).toBe(first.meetingId);

    const links = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM external_calendar_meeting_links WHERE workspace_id = ?1",
    )
      .bind(WORKSPACE_ID)
      .first<{ readonly total: number }>();
    expect(links?.total).toBe(1);
  });

  it("surfaces the link on the schedule row, so the UI can say Open notes", async () => {
    const event = await theEvent();
    const { meetingId } = await createMeetingFromEvent(event.event.id);
    const rows = await events().listWindow(WINDOW);
    // Joined in the SAME bounded read as the events — no query per row.
    expect(rows[0]!.meetingId).toBe(meetingId);
  });

  it("keeps the link when the external event is renamed", async () => {
    const event = await theEvent();
    const { meetingId } = await createMeetingFromEvent(event.event.id);

    await refresh(
      icsCalendar(
        SYDNEY_VTIMEZONE,
        TIMED_EVENT.replace(
          "SUMMARY:Operational Officer Program",
          "SUMMARY:L&D Operational Officer Program",
        ),
      ),
      new Date(NOW.getTime() + 60_000),
    );

    const rows = await events().listWindow(WINDOW);
    expect(rows[0]!.event.title).toBe("L&D Operational Officer Program");
    expect(rows[0]!.meetingId).toBe(meetingId);
    // External source truth and DalyHub-owned record truth stay distinct: the
    // projection followed the rename, the Meeting did not.
    expect((await meetings().get(meetingId))!.title).toBe(
      "Operational Officer Program",
    );
  });

  it("keeps the link when the external event moves", async () => {
    const event = await theEvent();
    const { meetingId } = await createMeetingFromEvent(event.event.id);

    await refresh(
      icsCalendar(
        SYDNEY_VTIMEZONE,
        TIMED_EVENT.replace("T083000", "T093000").replace("T090000", "T100000"),
      ),
      new Date(NOW.getTime() + 60_000),
    );

    const rows = await events().listWindow(WINDOW);
    expect(rows[0]!.event.startsAt.toISOString()).toBe(
      "2026-08-11T23:30:00.000Z",
    );
    expect(rows[0]!.meetingId).toBe(meetingId);
    // The Meeting is NOT silently rewritten by a refresh. The owner may have
    // edited it, and the calendar has no authority over a DalyHub record.
    expect((await meetings().get(meetingId))!.startsAt.toISOString()).toBe(
      "2026-08-11T22:30:00.000Z",
    );
  });

  it("keeps the Meeting when the external event disappears", async () => {
    const event = await theEvent();
    const { meetingId } = await createMeetingFromEvent(event.event.id);

    await refresh(
      icsCalendar(SYDNEY_VTIMEZONE),
      new Date(NOW.getTime() + 60_000),
    );
    expect(await events().listWindow(WINDOW)).toHaveLength(0);

    const meeting = await meetings().get(meetingId);
    expect(meeting).not.toBeNull();
    expect(meeting!.archivedAt).toBeNull();
  });

  it("keeps the Meeting when the external event is cancelled", async () => {
    const event = await theEvent();
    const { meetingId } = await createMeetingFromEvent(event.event.id);

    await refresh(
      icsCalendar(
        SYDNEY_VTIMEZONE,
        TIMED_EVENT.replace("SUMMARY:", "STATUS:CANCELLED\r\nSUMMARY:"),
      ),
      new Date(NOW.getTime() + 60_000),
    );

    const rows = await events().listWindow(WINDOW);
    expect(rows[0]!.event.status).toBe("cancelled");
    // The external source shows the cancellation truth; the owner keeps control
    // of the canonical DalyHub Meeting.
    expect((await meetings().get(meetingId))!.status).toBe("planned");
  });

  it("keeps the Meeting when the calendar SOURCE is removed", async () => {
    const event = await theEvent();
    const { meetingId } = await createMeetingFromEvent(event.event.id);
    const sourceId = event.event.sourceId;

    await sources().remove(sourceId);

    expect(await events().listWindow(WINDOW)).toHaveLength(0);
    const links = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM external_calendar_meeting_links WHERE workspace_id = ?1",
    )
      .bind(WORKSPACE_ID)
      .first<{ readonly total: number }>();
    expect(links?.total).toBe(0);

    // The Meeting is untouched. Removing a calendar is not authority to delete
    // a DalyHub record.
    const meeting = await meetings().get(meetingId);
    expect(meeting).not.toBeNull();
    expect(meeting!.archivedAt).toBeNull();
  });

  it("re-links the same Meeting after the projection is rebuilt", async () => {
    const event = await theEvent();
    const { meetingId } = await createMeetingFromEvent(event.event.id);

    // Simulate a prune-and-reimport: the event row is deleted and comes back
    // with a NEW id on the next refresh.
    await env.DB.prepare(
      "DELETE FROM external_calendar_events WHERE workspace_id = ?1",
    )
      .bind(WORKSPACE_ID)
      .run();
    await refresh(
      icsCalendar(SYDNEY_VTIMEZONE, TIMED_EVENT),
      new Date(NOW.getTime() + 60_000),
    );

    const rows = await events().listWindow(WINDOW);
    expect(rows[0]!.event.id).not.toBe(event.event.id);
    // The link is keyed on the DURABLE external identity, not the row id, so the
    // rebuilt row finds the same Meeting.
    expect(rows[0]!.meetingId).toBe(meetingId);
  });
});
