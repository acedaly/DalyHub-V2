-- CAL-01: read-only external calendar sources, their projected occurrences, and
-- the durable link from an occurrence to a canonical DalyHub Meeting.
--
-- ADDITIVE ONLY. Three new tables. No existing table is rebuilt, no column is
-- added to an existing table, and no existing row is read or rewritten. A
-- deployment that never adds a calendar source never writes a row here, and
-- nothing else in DalyHub reads these tables.
--
-- The numbering
-- -------------
-- 0041 is the next free number on main at the time this branch was opened. The
-- repository has two grandfathered collisions (0013 and 0039) recorded in
-- test/unit/migrations/migration-numbering.test.ts, and this migration
-- deliberately does not add a third.
--
-- What is deliberately NOT here
-- -----------------------------
-- There is no meetings table, no tasks table and no second recurrence model. An
-- imported event that becomes a Meeting becomes an ORDINARY Meeting, written by
-- the existing meeting repository into the existing entities/meeting_details
-- tables, and the only thing recorded here is the mapping. Recurrence belongs to
-- the external calendar: DalyHub stores expanded OCCURRENCES, never an RRULE,
-- because a rule DalyHub re-evaluates is a second scheduling authority.
--
-- There is also no description, attendee, organiser, attachment or provider
-- property column. CAL-01 imports what a schedule needs to be legible and
-- nothing more, and the smallest guarantee of that is having nowhere to put it.
--
-- The security shape
-- ------------------
-- A published ICS URL is a CREDENTIAL: whoever holds it can read the calendar.
-- It is therefore stored only as AES-256-GCM ciphertext under a key supplied as
-- a Cloudflare secret (APP_ENCRYPTION_KEY), never in plaintext, never in a log
-- and never in a response. Duplicate detection uses a keyed HMAC fingerprint
-- rather than a comparison of ciphertexts, because a random IV makes two seals
-- of the same URL differ -- and rather than a bare digest, because a bare digest
-- of a URL is confirmable by anyone holding the database and a guess.
--
-- Conventions, identical to the existing tables: timestamps are ISO-8601 UTC
-- TEXT written by the application, STRICT column typing, and a workspace foreign
-- key with ON DELETE RESTRICT.

-- ---------------------------------------------------------------------------
-- calendar_sources
-- ---------------------------------------------------------------------------
-- One row per external calendar the owner has added.
CREATE TABLE calendar_sources (
  id TEXT PRIMARY KEY,
  -- The workspace this source is PERMANENTLY bound to. Chosen by the server at
  -- creation from trusted configuration, never from a request, and every read
  -- below is scoped by it.
  workspace_id TEXT NOT NULL,
  -- The owner's name for this calendar -- "Work", "Family". Untrusted display
  -- text: bounded here and normalised by the application before it is stored.
  -- It is what the schedule's quiet source label shows, which is why a source
  -- must have one: showing the URL instead would display a credential.
  name TEXT NOT NULL,
  -- A PRESENTATIONAL guess at which product publishes the feed, derived from
  -- the feed host. Nothing in the domain branches on it, so a wrong guess costs
  -- a subtitle and never correctness.
  provider_hint TEXT NOT NULL,
  -- The AES-256-GCM sealed feed URL, as "v1.<iv>.<ciphertext>". The plaintext
  -- exists only inside the Worker, only for the duration of a refresh. The
  -- ciphertext is bound to this workspace by the AEAD additional data, so a row
  -- copied into another workspace does not open.
  feed_url_sealed TEXT NOT NULL,
  -- A keyed HMAC-SHA-256 of the normalised URL, as 64 lowercase hex characters.
  -- Its only job is the UNIQUE index below, which is what makes "you already
  -- added this calendar" a database guarantee rather than a race between two
  -- submissions. Never displayed, never returned to a browser.
  feed_fingerprint TEXT NOT NULL,
  -- 0 or 1. A disabled source is not refreshed and its events do not reach the
  -- schedule -- but its rows are kept, so re-enabling it is instant.
  enabled INTEGER NOT NULL,
  -- The last refresh ATTEMPT, whatever came of it.
  last_sync_attempt_at TEXT,
  -- The concurrency CLAIM, and deliberately a separate column from the attempt
  -- above. A refresh is started by conditionally setting this and it is CLEARED
  -- when the refresh finishes, so:
  --
  --   * two simultaneous refreshes of one source cannot both proceed -- the
  --     conditional UPDATE means the DATABASE picks the winner, not application
  --     code
  --   * a refresh that has FINISHED does not block the next one. Reusing
  --     last_sync_attempt_at for both would have made "Refresh now" silently do
  --     nothing for two minutes after every cron tick, and report a refresh as
  --     already running when none was.
  --
  -- A claim left behind by a Worker killed mid-refresh ages out: a claim older
  -- than the stale window is taken over rather than honoured forever.
  refresh_claimed_at TEXT,
  -- The last refresh that actually worked. NULL means never -- which is why the
  -- UI can say "Never synced" rather than "Connected".
  last_sync_success_at TEXT,
  -- 'never', 'ok' or 'failed'. The status of the LAST attempt.
  last_sync_status TEXT NOT NULL,
  -- A code from the closed CAL-01 vocabulary, never a message and never any
  -- part of a remote response. The owner-facing sentence is written in the
  -- application, so a hostile feed cannot put text on the owner's screen.
  last_sync_error_code TEXT,
  -- How many occurrences the last SUCCESSFUL refresh left in the window.
  event_count INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  CHECK (length(id) > 0 AND length(id) <= 64),
  CHECK (length(name) > 0 AND length(name) <= 60),
  CHECK (provider_hint IN ('outlook', 'apple', 'google', 'fastmail', 'generic')),
  CHECK (length(feed_url_sealed) > 0 AND length(feed_url_sealed) <= 4096),
  CHECK (length(feed_fingerprint) = 64),
  CHECK (enabled IN (0, 1)),
  CHECK (last_sync_status IN ('never', 'ok', 'failed')),
  CHECK (refresh_claimed_at IS NULL OR length(refresh_claimed_at) > 0),
  CHECK (last_sync_error_code IS NULL OR length(last_sync_error_code) <= 32),
  CHECK (event_count >= 0),
  CHECK (length(created_at) > 0),
  CHECK (length(updated_at) > 0)
) STRICT;

-- One feed, once, per workspace. The database arbitrates, so two concurrent
-- submissions of the same URL cannot both succeed.
CREATE UNIQUE INDEX calendar_sources_by_fingerprint
  ON calendar_sources (workspace_id, feed_fingerprint);

-- The Settings list and the per-source accent allocation, both in creation
-- order so neither reshuffles when a refresh lands.
CREATE INDEX calendar_sources_by_workspace
  ON calendar_sources (workspace_id, created_at, id);

-- ---------------------------------------------------------------------------
-- external_calendar_events
-- ---------------------------------------------------------------------------
-- One row per OCCURRENCE inside the synchronisation window. A weekly meeting is
-- many rows, not one row with a rule: DalyHub needs the actual occurrences on
-- actual days, and re-evaluating a recurrence rule would make DalyHub a second
-- scheduling authority over data it does not own.
CREATE TABLE external_calendar_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  -- The feed's own UID for the event or series. Opaque: compared, never parsed.
  external_uid TEXT NOT NULL,
  -- The empty string for a non-recurring event, or the ORIGINAL slot of a
  -- recurring occurrence as a UTC instant (RFC 5545 RECURRENCE-ID). Using the
  -- original slot rather than the current start is what lets a MOVED occurrence
  -- keep its identity: shifting the 10 August instance to 11:30 updates this
  -- row, it does not create a second one and does not break its Meeting link.
  occurrence_key TEXT NOT NULL,
  title TEXT NOT NULL,
  -- The occurrence as UTC instants. ICS ends are exclusive and are kept that
  -- way, so an event finishing at midnight belongs to the day it started.
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  -- 0 or 1.
  all_day INTEGER NOT NULL,
  -- For an all-day item, the first and last calendar dates it covers,
  -- inclusive, as the FLOATING dates the feed stated. All-day items are dates,
  -- not instants: "Annual leave, 12 August" is 12 August wherever the owner is
  -- standing, and converting it through a timezone is how a public holiday
  -- moves to the day before. NULL for a timed event.
  all_day_start_date TEXT,
  all_day_end_date TEXT,
  -- The IANA zone the feed stated for a timed event, when it stated one. Kept
  -- for the event detail surface, never used to re-derive the instants above.
  timezone TEXT,
  location TEXT,
  -- An online meeting URL, only when one was reliably extractable, and only
  -- https. It is the one external URL DalyHub will offer to open.
  meeting_url TEXT,
  status TEXT NOT NULL,
  -- The feed's own LAST-MODIFIED or DTSTAMP, when it supplied one. Recorded,
  -- but NOT used to decide whether a row changed: publishers stamp it
  -- inconsistently, and reconciliation compares the imported fields instead.
  source_updated_at TEXT,
  -- When this occurrence was last present in a successful refresh.
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  -- Removing a source removes its projection. Nothing is lost that the feed
  -- could not supply again, and no Meeting is touched.
  FOREIGN KEY (source_id) REFERENCES calendar_sources(id) ON DELETE CASCADE,
  CHECK (length(id) > 0 AND length(id) <= 64),
  CHECK (length(external_uid) > 0 AND length(external_uid) <= 512),
  CHECK (length(occurrence_key) <= 64),
  CHECK (length(title) > 0 AND length(title) <= 240),
  CHECK (length(starts_at) > 0),
  CHECK (length(ends_at) > 0),
  CHECK (all_day IN (0, 1)),
  CHECK (all_day_start_date IS NULL OR length(all_day_start_date) = 10),
  CHECK (all_day_end_date IS NULL OR length(all_day_end_date) = 10),
  CHECK (timezone IS NULL OR length(timezone) <= 64),
  CHECK (location IS NULL OR length(location) <= 240),
  CHECK (meeting_url IS NULL OR length(meeting_url) <= 1024),
  CHECK (status IN ('confirmed', 'tentative', 'cancelled')),
  CHECK (length(last_seen_at) > 0)
) STRICT;

-- The identity a refresh matches on. UNIQUE, so "one row per occurrence" is a
-- database guarantee: a second refresh of an unchanged feed cannot duplicate a
-- single event, whatever the application does.
CREATE UNIQUE INDEX external_calendar_events_identity
  ON external_calendar_events (workspace_id, source_id, external_uid, occurrence_key);

-- The schedule read: one bounded window scan, already in display order.
CREATE INDEX external_calendar_events_by_instant
  ON external_calendar_events (workspace_id, starts_at, id);

-- The all-day read, which is answered on floating DATES rather than instants.
CREATE INDEX external_calendar_events_by_all_day
  ON external_calendar_events (workspace_id, all_day, all_day_start_date);

-- Reconciliation and removal, both scoped to one source.
CREATE INDEX external_calendar_events_by_source
  ON external_calendar_events (workspace_id, source_id, starts_at);

-- ---------------------------------------------------------------------------
-- external_calendar_meeting_links
-- ---------------------------------------------------------------------------
-- The durable mapping from an external OCCURRENCE to a canonical DalyHub
-- Meeting, created only by an explicit owner action.
--
-- Keyed on the external IDENTITY rather than on an events row id, deliberately.
-- A projection row is disposable: it can be pruned by the retention window and
-- re-imported later under a new id. The Meeting the owner wrote notes in must
-- survive all of that, so the link names the thing the external calendar itself
-- guarantees. There is consequently NO foreign key to external_calendar_events,
-- and that is the point rather than an omission.
CREATE TABLE external_calendar_meeting_links (
  workspace_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  external_uid TEXT NOT NULL,
  occurrence_key TEXT NOT NULL,
  -- The canonical Meeting. An ordinary Meeting entity, created by the ordinary
  -- meeting repository, indistinguishable from one created by hand.
  meeting_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  -- One Meeting per occurrence, guaranteed by the DATABASE rather than by a
  -- read-then-write. This is what makes a double-tap on "Create meeting notes"
  -- unable to produce two Meetings.
  PRIMARY KEY (workspace_id, source_id, external_uid, occurrence_key),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  CHECK (length(source_id) > 0 AND length(source_id) <= 64),
  CHECK (length(external_uid) > 0 AND length(external_uid) <= 512),
  CHECK (length(occurrence_key) <= 64),
  CHECK (length(meeting_id) > 0 AND length(meeting_id) <= 64),
  CHECK (length(created_at) > 0)
) STRICT;

-- And one occurrence per Meeting, in the other direction: a Meeting cannot be
-- claimed by two different external events.
CREATE UNIQUE INDEX external_calendar_meeting_links_by_meeting
  ON external_calendar_meeting_links (workspace_id, meeting_id);

-- Removing a source removes its links without a scan. The Meetings remain.
CREATE INDEX external_calendar_meeting_links_by_source
  ON external_calendar_meeting_links (workspace_id, source_id);
