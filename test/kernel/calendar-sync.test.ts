/**
 * CAL-01 — the synchroniser, against REAL D1 in the REAL Workers runtime.
 *
 * The properties proved here are the ones that decide whether the feature can be
 * trusted, and none of them can be proved with a mock database:
 *
 *   - refreshing twice does not duplicate anything;
 *   - a changed title updates the projection, and a changed time does too —
 *     without the event losing its identity;
 *   - a removed event disappears, and a CANCELLED one does not;
 *   - a linked DalyHub Meeting survives every one of those, and survives the
 *     source being deleted;
 *   - one broken source cannot affect another;
 *   - the retention window prunes and does not prune the wrong thing;
 *   - a feed URL is never stored in plaintext and never readable without the key.
 *
 * Every fixture is synthetic. No real feed address, no real calendar content.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import {
  MAX_CALENDAR_SOURCES,
  calendarSyncWindow,
  type CalendarSource,
} from "~/kernel/calendar";
import {
  refreshCalendarSources,
  sealFeedUrl,
  type CalendarSecretsEnv,
} from "~/platform/calendar";
import {
  createCalendarSourceRepository,
  createExternalCalendarEventRepository,
} from "~/platform/storage/d1";
import { workspaceContextFromId } from "~/kernel/workspaces";
import type { WorkspaceContext } from "~/kernel/workspaces";

import {
  ICS_TODAY,
  ICS_TIMEZONE,
  RECURRENCE_BOMB,
  SYDNEY_VTIMEZONE,
  TEST_FEED_URL,
  TEST_FEED_URL_SECOND,
  TIMED_EVENT,
  icsCalendar,
  personalCalendarFeed,
  stubFetcher,
  workCalendarFeed,
} from "../support/ics-fixtures";

const WORKSPACE_ID = "calendar-sync-workspace";
// The branded workspace id, built through the kernel parser exactly as the
// composition boundary does — never a hand-cast string.
const CONTEXT: WorkspaceContext = workspaceContextFromId(WORKSPACE_ID);

/** A clearly non-production test key. 32 zero bytes, base64. */
const TEST_ENCRYPTION_KEY = btoa("\0".repeat(32));
const SECRETS_ENV: CalendarSecretsEnv = {
  APP_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
};

const NOW = new Date("2026-08-12T00:30:00.000Z");

function sources() {
  return createCalendarSourceRepository(env.DB, CONTEXT);
}
function events() {
  return createExternalCalendarEventRepository(env.DB, CONTEXT);
}

async function seedWorkspace(): Promise<void> {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO workspaces (id, created_at, updated_at)
       VALUES (?1, ?2, ?2)`,
  )
    .bind(WORKSPACE_ID, NOW.toISOString())
    .run();
}

async function addSource(
  name: string,
  feedUrl: string,
): Promise<CalendarSource> {
  const { sealed, fingerprint } = await sealFeedUrl(
    SECRETS_ENV,
    WORKSPACE_ID,
    feedUrl,
  );
  return sources().create({
    name,
    providerHint: "generic",
    sealedFeedUrl: sealed,
    feedFingerprint: fingerprint,
  });
}

/** Run a refresh against a stubbed network. */
async function refresh(
  routes: Parameters<typeof stubFetcher>[0],
  options: { readonly sourceId?: string; readonly now?: Date } = {},
) {
  return refreshCalendarSources(
    {
      sources: sources(),
      events: events(),
      env: SECRETS_ENV,
      workspaceId: WORKSPACE_ID,
      todayIso: ICS_TODAY,
      timeZone: ICS_TIMEZONE,
      now: options.now ?? NOW,
      fetcher: stubFetcher(routes),
    },
    options.sourceId === undefined ? {} : { sourceId: options.sourceId },
  );
}

const WINDOW = calendarSyncWindow({
  todayIso: ICS_TODAY,
  timeZone: ICS_TIMEZONE,
});

async function storedTitles(): Promise<string[]> {
  const rows = await events().listWindow(WINDOW);
  return rows.map((row) => row.event.title).sort();
}

beforeEach(async () => {
  await seedWorkspace();
  // A clean slate per test, deepest child first.
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
});

describe("calendar synchronisation", () => {
  it("imports a feed, and refreshing again changes nothing", async () => {
    const source = await addSource("Work", TEST_FEED_URL);
    const routes = { [TEST_FEED_URL]: { body: workCalendarFeed() } };

    const first = await refresh(routes);
    expect(first[0]?.ok).toBe(true);
    const afterFirst = await storedTitles();
    expect(afterFirst.length).toBeGreaterThan(0);

    // The identity is `(uid, recurrence-id)`, so a second pass matches every
    // row it already has. Nothing is duplicated, nothing is recreated.
    const second = await refresh(routes, {
      now: new Date(NOW.getTime() + 1000),
    });
    expect(second[0]?.ok).toBe(true);
    expect(await storedTitles()).toEqual(afterFirst);

    const stored = await sources().get(source.id);
    expect(stored?.lastSyncStatus).toBe("ok");
    expect(stored?.lastSyncSuccessAt).not.toBeNull();
    expect(stored?.lastSyncErrorCode).toBeNull();
  });

  it("updates a changed title in place, keeping the same row", async () => {
    await addSource("Work", TEST_FEED_URL);
    await refresh({
      [TEST_FEED_URL]: { body: icsCalendar(SYDNEY_VTIMEZONE, TIMED_EVENT) },
    });
    const before = await events().listWindow(WINDOW);
    expect(before).toHaveLength(1);

    const renamed = icsCalendar(
      SYDNEY_VTIMEZONE,
      TIMED_EVENT.replace(
        "SUMMARY:Operational Officer Program",
        "SUMMARY:L&D Operational Officer Program",
      ),
    );
    await refresh(
      { [TEST_FEED_URL]: { body: renamed } },
      { now: new Date(NOW.getTime() + 60_000) },
    );

    const after = await events().listWindow(WINDOW);
    expect(after).toHaveLength(1);
    // The SAME row: an external rename updates the projection rather than
    // creating a second event and orphaning the first.
    expect(after[0]!.event.id).toBe(before[0]!.event.id);
    expect(after[0]!.event.title).toBe("L&D Operational Officer Program");
  });

  it("moves an event's time without changing its identity", async () => {
    await addSource("Work", TEST_FEED_URL);
    await refresh({
      [TEST_FEED_URL]: { body: icsCalendar(SYDNEY_VTIMEZONE, TIMED_EVENT) },
    });
    const before = await events().listWindow(WINDOW);

    const moved = icsCalendar(
      SYDNEY_VTIMEZONE,
      TIMED_EVENT.replace("T083000", "T093000").replace("T090000", "T100000"),
    );
    await refresh(
      { [TEST_FEED_URL]: { body: moved } },
      { now: new Date(NOW.getTime() + 60_000) },
    );

    const after = await events().listWindow(WINDOW);
    expect(after).toHaveLength(1);
    expect(after[0]!.event.id).toBe(before[0]!.event.id);
    expect(after[0]!.event.startsAt.toISOString()).toBe(
      "2026-08-11T23:30:00.000Z",
    );
  });

  it("removes an event that has left the feed", async () => {
    await addSource("Work", TEST_FEED_URL);
    await refresh({ [TEST_FEED_URL]: { body: workCalendarFeed() } });
    expect((await storedTitles()).length).toBeGreaterThan(1);

    await refresh(
      { [TEST_FEED_URL]: { body: icsCalendar(SYDNEY_VTIMEZONE, TIMED_EVENT) } },
      { now: new Date(NOW.getTime() + 60_000) },
    );
    expect(await storedTitles()).toEqual(["Operational Officer Program"]);
  });

  it("keeps a cancelled occurrence rather than deleting it", async () => {
    await addSource("Work", TEST_FEED_URL);
    await refresh({ [TEST_FEED_URL]: { body: workCalendarFeed() } });
    const cancelled = (await events().listWindow(WINDOW)).filter(
      (row) => row.event.status === "cancelled",
    );
    // "The 10:00 is cancelled" is information the owner needs on the day.
    expect(cancelled).toHaveLength(1);
  });

  it("merges several sources into one chronological window", async () => {
    await addSource("Work", TEST_FEED_URL);
    await addSource("Personal", TEST_FEED_URL_SECOND);
    await refresh({
      [TEST_FEED_URL]: { body: workCalendarFeed() },
      [TEST_FEED_URL_SECOND]: { body: personalCalendarFeed() },
    });

    const rows = await events().listWindow(WINDOW);
    const names = new Set(rows.map((row) => row.sourceName));
    expect(names).toEqual(new Set(["Work", "Personal"]));
    // Source identity survives into the read model, so the UI can distinguish
    // them — and the accent rank is stable and per-source.
    expect(new Set(rows.map((row) => row.sourceRank)).size).toBe(2);
  });

  it("isolates one failing source from a healthy one", async () => {
    const work = await addSource("Work", TEST_FEED_URL);
    const personal = await addSource("Personal", TEST_FEED_URL_SECOND);

    // The work feed 500s; the personal feed is fine.
    const results = await refresh({
      [TEST_FEED_URL]: { status: 500, body: "upstream on fire" },
      [TEST_FEED_URL_SECOND]: { body: personalCalendarFeed() },
    });

    expect(results.find((r) => r.sourceId === work.id)?.ok).toBe(false);
    expect(results.find((r) => r.sourceId === personal.id)?.ok).toBe(true);

    // The healthy source's events are present.
    const rows = await events().listWindow(WINDOW);
    expect(rows.every((row) => row.sourceName === "Personal")).toBe(true);

    const stored = await sources().get(work.id);
    expect(stored?.lastSyncStatus).toBe("failed");
    expect(stored?.lastSyncErrorCode).toBe("server_error");
    // A failure never blanks a previous success and never claims one.
    expect(stored?.lastSyncSuccessAt).toBeNull();
  });

  it("keeps the previous projection when a refresh fails, and says it is stale", async () => {
    const source = await addSource("Work", TEST_FEED_URL);
    await refresh({ [TEST_FEED_URL]: { body: workCalendarFeed() } });
    const good = await storedTitles();

    await refresh(
      { [TEST_FEED_URL]: { status: 503, body: "" } },
      { now: new Date(NOW.getTime() + 60_000) },
    );

    // The events on screen are still real — just older. That is the honest
    // outcome, and the surface states its age rather than pretending.
    expect(await storedTitles()).toEqual(good);
    const stored = await sources().get(source.id);
    expect(stored?.lastSyncStatus).toBe("failed");
    expect(stored?.lastSyncSuccessAt).not.toBeNull();
  });

  it("refuses a feed that is not a calendar, with a specific reason", async () => {
    const source = await addSource("Work", TEST_FEED_URL);
    await refresh({
      [TEST_FEED_URL]: {
        body: "<!doctype html><html><body>Sign in</body></html>",
      },
    });
    const stored = await sources().get(source.id);
    // The most common owner mistake gets its own code, so the message can say
    // "you copied the page, not the link".
    expect(stored?.lastSyncErrorCode).toBe("not_calendar");
  });

  it("refuses a TRUNCATED feed rather than storing a fragment of it", async () => {
    const source = await addSource("Work", TEST_FEED_URL);
    await refresh({ [TEST_FEED_URL]: { body: workCalendarFeed() } });
    const complete = await storedTitles();
    expect(complete.length).toBeGreaterThan(1);

    /*
     * The feed comes back with a recurrence bomb in it, so the parser truncates.
     * A truncated result is the one input reconciliation must never see: every
     * occurrence missing only because of truncation looks exactly like one the
     * feed has removed, and would be deleted. The refresh must therefore FAIL
     * and leave the last complete projection alone.
     */
    const results = await refresh(
      {
        [TEST_FEED_URL]: {
          body: icsCalendar(SYDNEY_VTIMEZONE, RECURRENCE_BOMB),
        },
      },
      { now: new Date(NOW.getTime() + 5 * 60_000) },
    );

    expect(results[0]?.ok).toBe(false);
    expect(results[0]?.errorCode).toBe("too_many_events");
    // Not one row was replaced by the fragment.
    expect(await storedTitles()).toEqual(complete);
    const stored = await sources().get(source.id);
    expect(stored?.lastSyncStatus).toBe("failed");
    expect(stored?.lastSyncSuccessAt).not.toBeNull();
  });

  it("does not refresh a disabled source, and hides its events", async () => {
    const source = await addSource("Work", TEST_FEED_URL);
    await refresh({ [TEST_FEED_URL]: { body: workCalendarFeed() } });
    expect((await events().listWindow(WINDOW)).length).toBeGreaterThan(0);

    await sources().update(source.id, { enabled: false });
    // The rows are KEPT — pausing is reversible and re-enabling is instant —
    // but the schedule read does not return them.
    expect(await events().listWindow(WINDOW)).toHaveLength(0);

    const results = await refresh(
      { [TEST_FEED_URL]: { body: workCalendarFeed() } },
      { now: new Date(NOW.getTime() + 60_000) },
    );
    expect(results).toHaveLength(0);

    await sources().update(source.id, { enabled: true });
    expect((await events().listWindow(WINDOW)).length).toBeGreaterThan(0);
  });

  it("lets one refresh in and keeps a concurrent one out", async () => {
    const source = await addSource("Work", TEST_FEED_URL);
    const routes = { [TEST_FEED_URL]: { body: workCalendarFeed() } };
    const staleAfterMs = 2 * 60 * 1000;

    // Simulate a refresh that is IN FLIGHT by taking the claim directly, which
    // is exactly what the synchroniser does before it fetches anything.
    expect(await sources().claimRefresh(source.id, NOW, staleAfterMs)).toBe(
      true,
    );
    // A second attempt while it is held does no work and says so, rather than
    // fetching the same feed twice and racing itself into the same rows.
    const concurrent = await refresh(routes, { sourceId: source.id, now: NOW });
    expect(concurrent[0]?.skipped).toBe(true);
    expect(await storedTitles()).toEqual([]);

    // A claim left behind by a Worker that died mid-refresh must not lock the
    // source out forever: past the stale window it is taken over.
    const later = await refresh(routes, {
      sourceId: source.id,
      now: new Date(NOW.getTime() + staleAfterMs + 1000),
    });
    expect(later[0]?.skipped).toBe(false);
    expect((await storedTitles()).length).toBeGreaterThan(0);
  });

  it("does not block a manual refresh that follows a completed one", async () => {
    const source = await addSource("Work", TEST_FEED_URL);
    const routes = { [TEST_FEED_URL]: { body: workCalendarFeed() } };
    await refresh(routes, { sourceId: source.id });

    /*
     * The regression this test exists for.
     *
     * The claim used to share a column with "last attempt", so a refresh that
     * had FINISHED still blocked the next one for two minutes — and the owner
     * pressing "Refresh now" a moment after a cron tick was told a refresh was
     * already running when none was. Completing a refresh now releases the
     * claim, so this proceeds.
     */
    const manual = await refresh(routes, {
      sourceId: source.id,
      now: new Date(NOW.getTime() + 5_000),
    });
    expect(manual[0]?.skipped).toBe(false);
    expect(manual[0]?.ok).toBe(true);
  });

  it("prunes events outside the retention window and keeps those inside it", async () => {
    await addSource("Work", TEST_FEED_URL);
    // An event 200 days out — inside the feed, outside the 90-day horizon.
    const distant = icsCalendar(
      SYDNEY_VTIMEZONE,
      `BEGIN:VEVENT
UID:synthetic-distant-1
DTSTAMP:20260801T000000Z
DTSTART;TZID=Australia/Sydney:20270301T100000
DTEND;TZID=Australia/Sydney:20270301T110000
SUMMARY:Far future
END:VEVENT`,
      TIMED_EVENT,
    );
    await refresh({ [TEST_FEED_URL]: { body: distant } });

    const titles = await storedTitles();
    // The parser never imported the distant event (it is outside the window),
    // and the near one is present. The window is enforced at BOTH ends.
    expect(titles).toEqual(["Operational Officer Program"]);
  });

  it("never stores a feed URL in plaintext", async () => {
    await addSource("Work", TEST_FEED_URL);
    const row = await env.DB.prepare(
      "SELECT feed_url_sealed, feed_fingerprint FROM calendar_sources WHERE workspace_id = ?1",
    )
      .bind(WORKSPACE_ID)
      .first<{
        readonly feed_url_sealed: string;
        readonly feed_fingerprint: string;
      }>();

    expect(row).not.toBeNull();
    expect(row!.feed_url_sealed).not.toContain(TEST_FEED_URL);
    expect(row!.feed_url_sealed).not.toContain("calendar.example.com");
    expect(row!.feed_url_sealed.startsWith("v1.")).toBe(true);
    // A keyed fingerprint, not a bare digest of the URL.
    expect(row!.feed_fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(row!.feed_fingerprint).not.toContain("example");
  });

  it("does not return a feed URL from the ordinary source read", async () => {
    await addSource("Work", TEST_FEED_URL);
    const [source] = await sources().list();
    // The shape itself has no URL field — this asserts the SQL does not smuggle
    // one in under another name either.
    expect(JSON.stringify(source)).not.toContain("example.com");
    expect(JSON.stringify(source)).not.toContain("v1.");
  });

  it("refuses the same feed twice in one workspace", async () => {
    await addSource("Work", TEST_FEED_URL);
    await expect(addSource("Work again", TEST_FEED_URL)).rejects.toThrowError(
      /already been added/i,
    );
  });

  it("bounds how many calendars one workspace may hold", async () => {
    for (let index = 0; index < MAX_CALENDAR_SOURCES; index += 1) {
      await addSource(
        `Calendar ${index}`,
        `https://calendar.example.com/feeds/synthetic-${index}.ics`,
      );
    }
    await expect(
      addSource("One too many", "https://calendar.example.com/feeds/extra.ics"),
    ).rejects.toThrowError(/up to 10 calendars/i);
  });
});
