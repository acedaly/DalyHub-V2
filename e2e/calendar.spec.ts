/**
 * CAL-01 / CAL-02 / CAL-03 — the complete journey, in a real browser against the
 * real dev-auth server and the real local D1.
 *
 *   configure a calendar → it appears in Settings → its events appear on Today,
 *   Tomorrow and Next 7 days → an event opens → it becomes a canonical DalyHub
 *   Meeting → it cannot become a second one
 *
 * The projection is seeded exactly as a successful refresh would have left it
 * (see `calendar-fixtures.ts` for why the fetch is not driven from the browser).
 * Everything else — the Settings surface, every action, the schedule read model,
 * the event detail, the Meeting creation and its durable link — is the real
 * product, driven the way the owner drives it.
 *
 * Every fixture is synthetic. No real feed address, no real calendar content.
 */

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import {
  CALENDAR_FIXTURE_PREFIX,
  cleanupCalendarFixtures,
  seedCalendarSources,
} from "./calendar-fixtures";
import {
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  ownerToday,
} from "./helpers";

const TODAY = ownerToday();

function shiftDays(iso: string, days: number): string {
  const base = new Date(`${iso}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/**
 * An owner-local wall-clock time on a given date, as the UTC instant to store.
 *
 * The fixtures have to be written in the OWNER's timezone, because that is what
 * the schedule renders — a fixture built from a UTC hour would assert against a
 * time the screen never shows.
 */
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
  const offsetMinutes =
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
  return new Date(naive - offsetMinutes * 60_000).toISOString();
}

const WORK_MEETING_TITLE = `${CALENDAR_FIXTURE_PREFIX}L&D Team Meeting`;
const WORKSHOP_TITLE = `${CALENDAR_FIXTURE_PREFIX}SAF19 Workshop`;
const DENTIST_TITLE = `${CALENDAR_FIXTURE_PREFIX}Dentist`;
const LEAVE_TITLE = `${CALENDAR_FIXTURE_PREFIX}Training Academy`;
const TOMORROW_TITLE = `${CALENDAR_FIXTURE_PREFIX}Regional Training Meeting`;
const LONG_TITLE = `${CALENDAR_FIXTURE_PREFIX}A deliberately very long external event title that must truncate rather than wrap or overflow its row`;

/** Seed the two-source day every schedule journey below reads. */
async function seedTheDay(): Promise<void> {
  await seedCalendarSources([
    {
      id: "cal-e2e-work",
      name: "Work",
      feedUrl: "https://calendar.example.com/feeds/e2e-work.ics",
      events: [
        {
          id: "cal-e2e-ev-allday",
          uid: "e2e-allday",
          title: LEAVE_TITLE,
          allDay: true,
          allDayStartDate: TODAY,
          allDayEndDate: TODAY,
        },
        {
          id: "cal-e2e-ev-meeting",
          uid: "e2e-meeting",
          title: WORK_MEETING_TITLE,
          startsAt: atOwnerTime(TODAY, 10),
          endsAt: atOwnerTime(TODAY, 11),
          location: "Room 4",
          meetingUrl: "https://teams.example.com/l/meetup-join/synthetic",
        },
        {
          id: "cal-e2e-ev-workshop",
          uid: "e2e-workshop",
          title: WORKSHOP_TITLE,
          startsAt: atOwnerTime(TODAY, 13),
          endsAt: atOwnerTime(TODAY, 14, 30),
        },
        {
          id: "cal-e2e-ev-long",
          uid: "e2e-long",
          title: LONG_TITLE,
          startsAt: atOwnerTime(TODAY, 15),
          endsAt: atOwnerTime(TODAY, 15, 30),
        },
        {
          id: "cal-e2e-ev-tomorrow",
          uid: "e2e-tomorrow",
          title: TOMORROW_TITLE,
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
          title: DENTIST_TITLE,
          startsAt: atOwnerTime(TODAY, 16, 30),
          endsAt: atOwnerTime(TODAY, 17),
          location: "High Street",
        },
      ],
    },
  ]);
}

/** The Schedule panel on Today. */
function schedulePanel(page: Page) {
  return page.getByTestId("today-schedule");
}

/**
 * A schedule row's TITLE link, which is what opens the event detail.
 *
 * Located by its class rather than by accessible name: once a row is linked to a
 * Meeting it carries a second link ("Open notes for …"), and a name match would
 * resolve to both.
 */
function scheduleTitleLink(page: Page, title: string) {
  return schedulePanel(page)
    .getByTestId("schedule-row")
    .filter({ hasText: title })
    .locator("a.dh-day-row__title");
}

/**
 * One calendar's row in Settings, scoped by its NAME.
 *
 * Scoped rather than indexed, deliberately: sources are listed in creation
 * order, and a positional locator silently acts on the wrong calendar the moment
 * that order changes — which is exactly the kind of test that passes while
 * asserting nothing. Every control in a row also carries a visually-hidden name
 * ("Pause Work"), so a bare text match would resolve to five elements.
 */
function calendarRow(page: Page, name: string) {
  return page.locator(".dh-settings-row").filter({
    has: page.locator(`.dh-settings-row__label:text-is("${name}")`),
  });
}

test.afterAll(() => {
  cleanupCalendarFixtures();
});

test.describe("Settings — calendar sources", () => {
  test.beforeEach(async () => {
    cleanupCalendarFixtures();
    await seedTheDay();
  });

  test("lists every configured calendar with a truthful sync state", async ({
    page,
  }) => {
    await page.goto("/settings?section=calendars");
    await expect(
      page.getByRole("heading", { name: "Calendars", exact: true }),
    ).toBeVisible();

    await expect(calendarRow(page, "Work")).toHaveCount(1);
    await expect(calendarRow(page, "Personal")).toHaveCount(1);
    // A source that HAS synced says WHEN. The word "Connected" is never used
    // about a calendar: it would be a claim about the link rather than a fact
    // about the last refresh, and it stays true-looking after a feed is revoked.
    await expect(calendarRow(page, "Work").getByText(/Synced /)).toBeVisible();
    await expect(calendarRow(page, "Work").getByText(/Connected/)).toHaveCount(
      0,
    );
    await expect(
      calendarRow(page, "Personal").getByText(/Connected/),
    ).toHaveCount(0);
  });

  test("never redisplays a calendar link once it has been stored", async ({
    page,
  }) => {
    await page.goto("/settings?section=calendars");
    const body = await page.locator("body").innerText();
    // The link is a credential. Nothing on this page — not a field, not a
    // status line, not a title attribute — may contain it.
    expect(body).not.toContain("e2e-work.ics");
    expect(body).not.toContain("calendar.example.com");
    const html = await page.content();
    expect(html).not.toContain("e2e-work.ics");
    expect(html).not.toContain("feed_url");
    expect(html).not.toContain("v1.");
  });

  test("refuses an address that points at a private network", async ({
    page,
  }) => {
    await page.goto("/settings?section=calendars");
    await page
      .getByRole("textbox", { name: "Name" })
      .first()
      .fill(`${CALENDAR_FIXTURE_PREFIX}Should not exist`);
    await page
      .getByRole("textbox", { name: "Link" })
      .fill("https://127.0.0.1/x.ics");
    await page.getByTestId("calendar-add-submit").click();

    await expect(page.getByText(/private or local network/i)).toBeVisible();
    // The refusal never echoes the address back.
    await expect(page.getByText("127.0.0.1")).toHaveCount(0);
  });

  test("refuses a plain http address, because the link is a secret", async ({
    page,
  }) => {
    await page.goto("/settings?section=calendars");
    await page
      .getByRole("textbox", { name: "Name" })
      .first()
      .fill(`${CALENDAR_FIXTURE_PREFIX}Insecure`);
    await page
      .getByRole("textbox", { name: "Link" })
      .fill("http://calendar.example.com/x.ics");
    await page.getByTestId("calendar-add-submit").click();
    await expect(page.getByText(/https:\/\/ or webcal:\/\//i)).toBeVisible();
  });

  test("pauses a calendar, which removes it from the schedule, then resumes it", async ({
    page,
  }) => {
    await page.goto("/settings?section=calendars");
    const personal = calendarRow(page, "Personal");
    await personal.getByTestId("calendar-toggle").click();
    await expect(personal.getByText(/Paused/)).toBeVisible();

    await page.goto("/today");
    await expect(schedulePanel(page).getByText(DENTIST_TITLE)).toHaveCount(0);
    // The rest of the day is untouched.
    await expect(
      schedulePanel(page).getByText(WORK_MEETING_TITLE),
    ).toBeVisible();

    await page.goto("/settings?section=calendars");
    await calendarRow(page, "Personal").getByTestId("calendar-toggle").click();
    await expect(
      calendarRow(page, "Personal").getByText(/Synced |Never synced/),
    ).toBeVisible();
    await page.goto("/today");
    // Resuming is instant: pausing kept the rows.
    await expect(schedulePanel(page).getByText(DENTIST_TITLE)).toBeVisible();
  });

  test("reports a failed manual refresh truthfully", async ({ page }) => {
    await page.goto("/settings?section=calendars");
    await calendarRow(page, "Work").getByTestId("calendar-refresh").click();
    /*
     * The synthetic address does not resolve, so the refresh genuinely fails —
     * and that is the assertion: the surface reports the failure rather than
     * silently reporting success, and it names no internal detail.
     */
    await expect(
      page.getByText(/could not reach|took too long|did not work/i).first(),
    ).toBeVisible({ timeout: 20_000 });
  });

  test("removes a calendar and its events", async ({ page }) => {
    await page.goto("/settings?section=calendars");
    await calendarRow(page, "Work").getByTestId("calendar-remove").click();
    await expect(calendarRow(page, "Work")).toHaveCount(0);
    // Removing one calendar leaves the other alone.
    await expect(calendarRow(page, "Personal")).toHaveCount(1);

    await page.goto("/today");
    await expect(schedulePanel(page).getByText(WORK_MEETING_TITLE)).toHaveCount(
      0,
    );
  });
});

test.describe("Today — the unified schedule", () => {
  test.beforeEach(async () => {
    cleanupCalendarFixtures();
    await seedTheDay();
  });

  test("shows every enabled source's events, merged chronologically", async ({
    page,
  }) => {
    await page.goto("/today");
    const panel = schedulePanel(page);
    await expect(panel).toBeVisible();

    const titles = await panel
      .getByTestId("schedule-row")
      .locator(".dh-day-row__title")
      .allInnerTexts();
    const ours = titles.filter((title) =>
      title.startsWith(CALENDAR_FIXTURE_PREFIX),
    );
    // All-day first, then timed in time order — across BOTH sources.
    expect(ours).toEqual([
      LEAVE_TITLE,
      WORK_MEETING_TITLE,
      WORKSHOP_TITLE,
      LONG_TITLE,
      DENTIST_TITLE,
    ]);
  });

  test("separates all-day items and never gives them a time", async ({
    page,
  }) => {
    await page.goto("/today");
    const allDay = schedulePanel(page).locator(".dh-schedule__allday");
    await expect(
      allDay.getByRole("heading", { name: "All day" }),
    ).toBeVisible();
    await expect(allDay.getByText(LEAVE_TITLE)).toBeVisible();
    // An all-day row has no time slot at all — structurally, not by formatting.
    await expect(allDay.locator(".dh-schedule__time")).toHaveCount(0);
  });

  test("names each event's source without exposing the feed", async ({
    page,
  }) => {
    await page.goto("/today");
    const panel = schedulePanel(page);
    await expect(panel.getByText(/Work/).first()).toBeVisible();
    await expect(panel.getByText(/Personal · High Street/)).toBeVisible();
    expect(await panel.innerText()).not.toContain("calendar.example.com");
  });

  test("keeps TODAY-10's plan contract untouched", async ({ page }) => {
    await page.goto("/today");
    // The day's own panel is still the TASK panel, and the schedule has not
    // moved into it. TODAY-11 renamed it from "Focus" to "Today's plan"; the
    // claim is unchanged, only the heading it is located by.
    const plan = page
      .getByRole("heading", { name: "Today’s plan", exact: true })
      .locator("xpath=ancestor::section[1]");
    await expect(plan).toBeVisible();
    await expect(plan.getByText(WORK_MEETING_TITLE)).toHaveCount(0);
  });

  test("stays within the viewport at every phone width", async ({ page }) => {
    for (const width of [320, 375, 390, 430]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/today");
      await expect(schedulePanel(page)).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
  });

  test("has no accessibility violations", async ({ page }) => {
    await page.goto("/today");
    await expect(schedulePanel(page)).toBeVisible();
    await expectNoAxeViolations(page);
  });
});

test.describe("the event detail, and creating meeting notes", () => {
  test.beforeEach(async () => {
    cleanupCalendarFixtures();
    await seedTheDay();
  });

  test("opens an event, offers Join, and creates ONE canonical Meeting", async ({
    page,
  }) => {
    await page.goto("/today");
    await scheduleTitleLink(page, WORK_MEETING_TITLE).click();

    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText("Room 4")).toBeVisible();
    // The source is named by the name the OWNER gave it, never by its address.
    await expect(
      drawer.locator("dd").filter({ hasText: /^Work$/ }),
    ).toHaveCount(1);
    // A join link, with an accessible name that says what it joins.
    const join = drawer.getByRole("link", { name: /Join meeting/ });
    await expect(join).toHaveAttribute(
      "href",
      "https://teams.example.com/l/meetup-join/synthetic",
    );
    await expect(join).toHaveAttribute("rel", /noopener/);
    // The feed address is nowhere on the detail surface.
    expect(await drawer.innerText()).not.toContain("calendar.example.com");

    await drawer.getByTestId("event-create-meeting").click();
    // The control becomes "Open meeting" — the same occurrence cannot make a
    // second Meeting, and the surface says so by changing.
    await expect(drawer.getByTestId("event-open-meeting")).toBeVisible({
      timeout: 15_000,
    });

    // The Meeting is an ORDINARY DalyHub Meeting: the control opens its record.
    await drawer.getByTestId("event-open-meeting").click();
    // The Meeting RECORD route is `/meeting/:id` (singular); `/meetings` is the
    // collection. Asserting the exact shape is deliberate: Today's old meeting
    // row linked to the collection path with an id appended and 404ed.
    await page.waitForURL(/\/meeting\/[^/?]+/, { timeout: 15_000 });
    await expect(page.getByText(WORK_MEETING_TITLE).first()).toBeVisible();
  });

  test("shows Open notes on the row once a Meeting exists", async ({
    page,
  }) => {
    await page.goto("/today");
    await scheduleTitleLink(page, WORKSHOP_TITLE).click();
    const drawer = page.getByRole("dialog");
    await drawer.getByTestId("event-create-meeting").click();
    await expect(drawer.getByTestId("event-open-meeting")).toBeVisible({
      timeout: 15_000,
    });

    await page.goto("/today");
    const row = schedulePanel(page)
      .getByTestId("schedule-row")
      .filter({ hasText: WORKSHOP_TITLE });
    await expect(row.getByRole("link", { name: /Open notes/ })).toBeVisible();
  });

  test("cannot create two Meetings from one occurrence", async ({ page }) => {
    await page.goto("/today");
    await scheduleTitleLink(page, DENTIST_TITLE).click();
    const drawer = page.getByRole("dialog");
    await drawer.getByTestId("event-create-meeting").click();
    await expect(drawer.getByTestId("event-open-meeting")).toBeVisible({
      timeout: 15_000,
    });
    const firstHref = await drawer
      .getByTestId("event-open-meeting")
      .getAttribute("href");
    expect(firstHref).toMatch(/\/meeting\//);

    // Re-open the event and try again from a fresh page: the surface offers
    // "Open meeting", and there is exactly one Meeting with this title.
    await page.goto("/today");
    await scheduleTitleLink(page, DENTIST_TITLE).click();
    await expect(
      page.getByRole("dialog").getByTestId("event-open-meeting"),
    ).toBeVisible();
    await expect(
      page.getByRole("dialog").getByTestId("event-create-meeting"),
    ).toHaveCount(0);

    // The claim is "no SECOND Meeting", and the sharpest form of it is that the
    // link points at the same record both times. `/meetings` is a time-windowed
    // collection, so counting rows there would assert the window, not the rule.
    const href = await page
      .getByRole("dialog")
      .getByTestId("event-open-meeting")
      .getAttribute("href");
    expect(href).toBe(firstHref);
  });
});

/*
 * The two defects a real Work calendar produced, driven the way the owner hit
 * them.
 *
 * Seeded in their OWN block rather than added to `seedTheDay`, so the ordering
 * assertions above keep asserting the day they were written for.
 */
const OVERNIGHT_TITLE = `${CALENDAR_FIXTURE_PREFIX}Field Officer Training/Assessment`;
const TOMORROW_LONG = new Intl.DateTimeFormat("en-AU", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "Australia/Sydney",
}).formatToParts(new Date(`${shiftDays(TODAY, 1)}T03:00:00Z`));
const TOMORROW_SPOKEN = `${TOMORROW_LONG.find((p) => p.type === "weekday")?.value} ${TOMORROW_LONG.find((p) => p.type === "day")?.value} ${TOMORROW_LONG.find((p) => p.type === "month")?.value}`;

/** One overnight event whose stored zone is a publisher id `Intl` rejects. */
async function seedTheOvernightEvent(): Promise<void> {
  await seedCalendarSources([
    {
      id: "cal-e2e-work",
      name: "Work",
      feedUrl: "https://calendar.example.com/feeds/e2e-work.ics",
      events: [
        {
          id: "cal-e2e-ev-overnight",
          uid: "e2e-overnight",
          title: OVERNIGHT_TITLE,
          startsAt: atOwnerTime(TODAY, 14),
          endsAt: atOwnerTime(shiftDays(TODAY, 1), 12),
          location: "North Region",
          // The legacy row: what the parser used to persist from a Microsoft
          // feed's `TZID`. `Intl.DateTimeFormat` rejects it outright.
          timezone: "AUS Eastern Standard Time",
        },
      ],
    },
  ]);
}

test.describe("an overnight event from a feed with an unusable timezone", () => {
  test.beforeEach(async () => {
    cleanupCalendarFixtures();
    await seedTheOvernightEvent();
  });

  test("says WHICH day it ends on, rather than 2 pm to 12 pm", async ({
    page,
  }) => {
    await page.goto("/today");
    const row = schedulePanel(page)
      .getByTestId("schedule-row")
      .filter({ hasText: OVERNIGHT_TITLE });
    // It stays a TIMED row — both clock faces are there, and it did not migrate
    // into the all-day region.
    await expect(row.locator(".dh-schedule__time-start")).toHaveText("14:00");
    await expect(row.locator(".dh-schedule__time-end")).toHaveText("12:00");
    await expect(
      schedulePanel(page)
        .locator(".dh-schedule__allday")
        .getByText(OVERNIGHT_TITLE),
    ).toHaveCount(0);
    // And the row states the transition in words, beside its source.
    await expect(row.locator(".dh-day-row__meta")).toContainText("Until ");

    await scheduleTitleLink(page, OVERNIGHT_TITLE).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    // The detail's Time fact names the day the event finishes on, so "2:00 pm to
    // 12:00 pm" can no longer read as an end before its own start.
    await expect(
      drawer.getByText(`2:00 pm to 12:00 pm on ${TOMORROW_SPOKEN}`),
    ).toBeVisible();
  });

  test("creates meeting notes instead of refusing the timezone", async ({
    page,
  }) => {
    await page.goto("/today");
    await scheduleTitleLink(page, OVERNIGHT_TITLE).click();
    const drawer = page.getByRole("dialog");
    await drawer.getByTestId("event-create-meeting").click();

    // The regression: this used to fail with "Choose a valid timezone." because
    // the feed's own `TZID` was handed to the Meeting model. Meeting validation
    // is unchanged — the route now supplies a zone that is genuinely valid.
    await expect(drawer.getByTestId("event-open-meeting")).toBeVisible({
      timeout: 15_000,
    });
    await expect(drawer.getByRole("alert")).toHaveCount(0);

    await drawer.getByTestId("event-open-meeting").click();
    await page.waitForURL(/\/meeting\/[^/?]+/, { timeout: 15_000 });
    await expect(page.getByText(OVERNIGHT_TITLE).first()).toBeVisible();
  });
});

test.describe("Tomorrow and Next 7 days", () => {
  test.beforeEach(async () => {
    cleanupCalendarFixtures();
    await seedTheDay();
  });

  test("Tomorrow shows tomorrow's schedule, and not today's", async ({
    page,
  }) => {
    await page.goto("/today");
    await page.getByRole("link", { name: "Tomorrow", exact: true }).click();
    await expect(page).toHaveURL(/\/today\/tomorrow$/);

    const panel = page.getByTestId("tomorrow-schedule");
    await expect(panel.getByText(TOMORROW_TITLE)).toBeVisible();
    // The date boundary is real: today's events are not on tomorrow.
    await expect(panel.getByText(WORK_MEETING_TITLE)).toHaveCount(0);
    // And it carries the Task context for tomorrow, not Today's Focus.
    await expect(page.getByTestId("tomorrow-work")).toBeVisible();
  });

  test("Next 7 days groups by date, in order, with a Task summary", async ({
    page,
  }) => {
    await page.goto("/today/upcoming");
    const days = page.getByTestId("upcoming-day");
    await expect(days).toHaveCount(7);

    // The groups are the next seven owner-calendar days, in order.
    const dates = await days.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-date")),
    );
    expect(dates).toEqual(
      Array.from({ length: 7 }, (_, index) => shiftDays(TODAY, index)),
    );

    // Today's group is named as such, and holds today's events.
    const today = days.first();
    await expect(today.getByText("Today", { exact: true })).toBeVisible();
    await expect(today.getByText(WORK_MEETING_TITLE)).toBeVisible();

    // A later day holds its own event.
    await expect(days.nth(3).getByText(/Project catch-up/)).toBeVisible();
  });

  test("the day rail exposes the current page to assistive tech", async ({
    page,
  }) => {
    await page.goto("/today/upcoming");
    const rail = page.getByTestId("day-nav");
    await expect(
      rail.getByRole("link", { name: "Next 7 days" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(rail.getByRole("link", { name: "Today" })).not.toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("both surfaces stay within the viewport on a phone", async ({
    page,
  }) => {
    for (const path of ["/today/tomorrow", "/today/upcoming"]) {
      for (const width of [320, 390, 430]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        await expectNoHorizontalOverflow(page);
      }
    }
  });
});
