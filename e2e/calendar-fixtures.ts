/**
 * CAL-01 — shared E2E fixtures for the external-calendar journeys.
 *
 * ── Why the schedule is seeded rather than fetched ──────────────────────────
 * Adding a calendar through the UI makes the SERVER fetch the address, and the
 * URL policy correctly refuses `localhost` — so there is no address the E2E dev
 * server could be pointed at that the product would accept, and there must not
 * be: a test-only bypass of an SSRF control is a control with a hole in it.
 *
 * So the split is deliberate. The fetch/parse/reconcile path is proven against
 * real D1 in the real Workers runtime (`test/kernel/calendar-*.test.ts`), and
 * these journeys prove the PRODUCT over a projection seeded exactly as a refresh
 * would have left it. The one add-a-calendar path the browser does drive is the
 * refusal path, which needs no network at all.
 *
 * Every value here is synthetic. No real feed address and no real calendar
 * content appears in this repository.
 */

import { d1Execute, sqlLiteral } from "./d1";

const WORKSPACE_ID = "local-dev-workspace";

/** The prefix every fixture row carries, so cleanup can never touch real data. */
export const CALENDAR_FIXTURE_PREFIX = "CalE2E ";

/**
 * The fixed, NON-PRODUCTION development encryption key.
 *
 * `setup-dev-auth.mjs` writes this same value into the generated `.dev.vars`, so
 * the dev server can open what these fixtures seal. It is 32 bytes of the
 * literal word "dalyhub-e2e" repeated — obviously not random, obviously not a
 * production key, and never used anywhere but the local E2E database.
 */
export const E2E_ENCRYPTION_KEY =
  "ZGFseWh1Yi1lMmUtZGV2ZWxvcG1lbnQta2V5LTEyMzQ=";

/** The AAD the application uses for a feed URL. Must match `calendar-secrets`. */
function feedUrlAad(): string {
  return `dalyhub.calendar.feed_url.v1:${WORKSPACE_ID}`;
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Seal a feed URL exactly as the application does, so a seeded source is
 * indistinguishable from one the owner added — and so a "Refresh now" pressed in
 * a journey reaches the real open-then-fetch path rather than a fixture shortcut.
 */
async function sealFeedUrl(
  url: string,
): Promise<{ sealed: string; fingerprint: string }> {
  const material = base64ToBytes(E2E_ENCRYPTION_KEY);
  const aad = new TextEncoder().encode(feedUrlAad());
  const key = await crypto.subtle.importKey(
    "raw",
    material as unknown as BufferSource,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv as unknown as BufferSource,
      additionalData: aad as unknown as BufferSource,
    },
    key,
    new TextEncoder().encode(url) as unknown as BufferSource,
  );
  const hmacKey = await crypto.subtle.importKey(
    "raw",
    material as unknown as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    hmacKey,
    new TextEncoder().encode(
      `${feedUrlAad()}\n${url}`,
    ) as unknown as BufferSource,
  );
  return {
    sealed: `v1.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(sealed))}`,
    fingerprint: [...new Uint8Array(signature)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join(""),
  };
}

export interface SeededEvent {
  readonly id: string;
  readonly uid: string;
  /** UTC instants; omitted for an all-day item. */
  readonly startsAt?: string;
  readonly endsAt?: string;
  readonly title: string;
  readonly allDay?: boolean;
  /** Inclusive floating dates, for an all-day item. */
  readonly allDayStartDate?: string;
  readonly allDayEndDate?: string;
  readonly location?: string;
  readonly meetingUrl?: string;
  readonly status?: "confirmed" | "tentative" | "cancelled";
  /**
   * The occurrence's stored zone. Defaults to `Australia/Sydney` for a timed
   * event and is always NULL for an all-day one.
   *
   * Settable so a journey can seed the LEGACY production state: a row imported
   * before the parser fix, carrying a publisher's `TZID` that `Intl` rejects.
   * That is the row that made "Create meeting notes" answer "Choose a valid
   * timezone.", and it cannot be reproduced any other way now the parser refuses
   * to write it.
   */
  readonly timezone?: string | null;
}

export interface SeededSource {
  readonly id: string;
  readonly name: string;
  readonly feedUrl: string;
  readonly enabled?: boolean;
  readonly events: readonly SeededEvent[];
}

const NOW = "2026-08-12T00:00:00.000Z";

/**
 * Seed one or more calendar sources and their occurrence projection, exactly as
 * a successful refresh would have left them.
 */
export async function seedCalendarSources(
  sources: readonly SeededSource[],
  options: { readonly syncedAt?: string } = {},
): Promise<void> {
  const syncedAt = options.syncedAt ?? new Date().toISOString();
  const ws = sqlLiteral(WORKSPACE_ID);
  const statements: string[] = [];

  for (const source of sources) {
    const { sealed, fingerprint } = await sealFeedUrl(source.feedUrl);
    statements.push(
      `INSERT OR REPLACE INTO calendar_sources
         (id, workspace_id, name, provider_hint, feed_url_sealed, feed_fingerprint,
          enabled, last_sync_attempt_at, refresh_claimed_at, last_sync_success_at,
          last_sync_status, last_sync_error_code, event_count, created_at, updated_at)
       VALUES (${sqlLiteral(source.id)}, ${ws}, ${sqlLiteral(source.name)}, 'generic',
               ${sqlLiteral(sealed)}, ${sqlLiteral(fingerprint)},
               ${source.enabled === false ? 0 : 1},
               ${sqlLiteral(syncedAt)}, NULL, ${sqlLiteral(syncedAt)},
               'ok', NULL, ${source.events.length},
               ${sqlLiteral(NOW)}, ${sqlLiteral(syncedAt)});`,
    );

    for (const event of source.events) {
      const allDay = event.allDay === true;
      const startsAt = allDay
        ? `${event.allDayStartDate}T00:00:00.000Z`
        : event.startsAt!;
      const endsAt = allDay
        ? `${event.allDayEndDate}T00:00:00.000Z`
        : event.endsAt!;
      statements.push(
        `INSERT OR REPLACE INTO external_calendar_events
           (id, workspace_id, source_id, external_uid, occurrence_key, title,
            starts_at, ends_at, all_day, all_day_start_date, all_day_end_date,
            timezone, location, meeting_url, status, source_updated_at,
            last_seen_at, created_at, updated_at)
         VALUES (${sqlLiteral(event.id)}, ${ws}, ${sqlLiteral(source.id)},
                 ${sqlLiteral(event.uid)}, '',
                 ${sqlLiteral(event.title)},
                 ${sqlLiteral(startsAt)}, ${sqlLiteral(endsAt)},
                 ${allDay ? 1 : 0},
                 ${allDay ? sqlLiteral(event.allDayStartDate!) : "NULL"},
                 ${allDay ? sqlLiteral(event.allDayEndDate!) : "NULL"},
                 ${
                   allDay
                     ? "NULL"
                     : event.timezone === null
                       ? "NULL"
                       : sqlLiteral(event.timezone ?? "Australia/Sydney")
                 },
                 ${event.location === undefined ? "NULL" : sqlLiteral(event.location)},
                 ${event.meetingUrl === undefined ? "NULL" : sqlLiteral(event.meetingUrl)},
                 ${sqlLiteral(event.status ?? "confirmed")}, NULL,
                 ${sqlLiteral(syncedAt)}, ${sqlLiteral(NOW)}, ${sqlLiteral(syncedAt)});`,
      );
    }
  }

  d1Execute(statements.join("\n"));
}

/**
 * Remove every calendar fixture row, and any Meeting a journey created from one.
 *
 * Ordered dependents-first and scoped strictly to the fixture prefix, so it can
 * never touch a developer's own local data. Idempotent and retriable, like every
 * other fixture teardown in this suite.
 */
export function cleanupCalendarFixtures(): void {
  const ws = sqlLiteral(WORKSPACE_ID);
  const like = sqlLiteral(`${CALENDAR_FIXTURE_PREFIX}%`);
  const meetingSel = `SELECT id FROM entities WHERE workspace_id = ${ws} AND type = 'meeting' AND title LIKE ${like}`;
  d1Execute(
    [
      `DELETE FROM external_calendar_meeting_links WHERE workspace_id = ${ws};`,
      `DELETE FROM external_calendar_events WHERE workspace_id = ${ws};`,
      `DELETE FROM calendar_sources WHERE workspace_id = ${ws};`,
      // Meetings a journey created from a fixture event, dependents-first.
      `DELETE FROM meeting_items WHERE workspace_id = ${ws} AND meeting_id IN (${meetingSel});`,
      `DELETE FROM entity_links WHERE workspace_id = ${ws} AND (source_entity_id IN (${meetingSel}) OR target_entity_id IN (${meetingSel}));`,
      `DELETE FROM activity_subjects WHERE workspace_id = ${ws} AND entity_id IN (${meetingSel});`,
      `DELETE FROM activities WHERE workspace_id = ${ws} AND NOT EXISTS (SELECT 1 FROM activity_subjects s WHERE s.workspace_id = activities.workspace_id AND s.activity_id = activities.id);`,
      `DELETE FROM meeting_details WHERE workspace_id = ${ws} AND entity_id IN (${meetingSel});`,
      `DELETE FROM entities WHERE workspace_id = ${ws} AND type = 'meeting' AND title LIKE ${like};`,
    ].join("\n"),
  );
}
