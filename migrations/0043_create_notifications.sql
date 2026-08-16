-- NOTIFY-01: the notification EVENT ledger, its per-channel delivery record, and
-- the owner's notification configuration.
--
-- ADDITIVE ONLY. Three new tables. No existing table is rebuilt, no column is
-- added to an existing table, and no existing row is read or rewritten. A
-- deployment whose owner never enables notifications never writes a row here,
-- and nothing else in DalyHub reads these tables.
--
-- The numbering
-- -------------
-- 0043 is the next free number on main at the time this branch was opened. The
-- repository has two grandfathered collisions (0013 and 0039) recorded in
-- test/unit/migrations/migration-numbering.test.ts, and this migration
-- deliberately does not add a third.
--
-- STATE versus EVENTS -- the distinction this schema exists to hold
-- ----------------------------------------------------------------
-- Today's attention rail is STATE: it is recomputed from facts on every read and
-- therefore cannot go stale. A notification is an EVENT: a fact crossed a
-- threshold at a moment, and DalyHub said so. These tables record only the
-- second kind. Nothing here is a second copy of what needs the owner's
-- attention, and nothing that reads them may treat them as one -- if the inbox
-- and the rail ever disagree, the rail is right and the inbox is history.
--
-- Consequently there is NO status column, no "resolved", no "dismissed" and no
-- link back into the rail's model. A row says what was said and when it was
-- read. That is all an event can honestly claim.
--
-- Why the ledger and the inbox are ONE table
-- ------------------------------------------
-- Deduplication and display are the same question asked twice: "has this already
-- been said?" is exactly "is it already in the log?". Two tables would need a
-- consistency rule between them. One table makes the UNIQUE index below both the
-- concurrency guard and the inbox's identity. The insert commits BEFORE any
-- external send is attempted, so a duplicate is structurally impossible and a
-- provider outage can never make an event not-have-happened.
--
-- No Activity is recorded for anything here (ADR-012, and the AI usage ledger's
-- precedent in ADR-073): the owner did nothing, so nothing belongs in any
-- record's history. A notification is operational metadata about the system, not
-- a fact about a record.
--
-- Conventions, identical to the existing tables: timestamps are ISO-8601 UTC
-- TEXT written by the application, STRICT column typing, and a workspace foreign
-- key with ON DELETE RESTRICT.

-- ---------------------------------------------------------------------------
-- notification_settings
-- ---------------------------------------------------------------------------
-- The owner's whole notification configuration, workspace- AND owner-scoped like
-- `owner_app_preferences` and `workspace_ai_preferences`. OFF by default: an
-- absent row and a row with `enabled = 0` mean the same thing, and a deployment
-- that never visits Settings never sends anything.
CREATE TABLE notification_settings (
  workspace_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  -- The master switch. Nothing is evaluated, written or sent while this is 0 --
  -- not the digest, not an obligation rung, not an in-app row.
  enabled INTEGER NOT NULL DEFAULT 0,
  -- Per-source toggles. In-app delivery has no toggle on purpose: it IS the
  -- ledger insert, and turning it off would leave the system unable to say what
  -- it had already said (see the ADR).
  digest_enabled INTEGER NOT NULL DEFAULT 1,
  asset_obligations_enabled INTEGER NOT NULL DEFAULT 1,
  -- The local time of day the digest is due, as 'HH:MM' in the zone below. It is
  -- NOT a cron expression: cron runs every fifteen minutes and is timezone
  -- ignorant, and the evaluator decides whether the owner's local clock has
  -- reached this time. That is what makes a DST transition a tested behaviour
  -- rather than an hour of silence twice a year.
  digest_send_time TEXT NOT NULL DEFAULT '07:00',
  -- The IANA zone the digest time is read in. NULL means "follow the owner's
  -- profile timezone", which is the default and is DISPLAYED rather than hidden:
  -- a send time with an unstated zone is a setting the owner cannot reason about.
  timezone TEXT,
  -- The Pushover channel. Stored in the settings store in D1 BY DECISION, not by
  -- accident: this is a single-owner deployment behind Cloudflare Access, the
  -- credentials belong to the owner rather than to the deployment, and putting
  -- them in `wrangler secret` would mean a redeploy to change a setting. The ADR
  -- records the trade. Neither value is ever returned to a browser -- the
  -- repository's ordinary read does not select them.
  pushover_enabled INTEGER NOT NULL DEFAULT 0,
  pushover_user_key TEXT,
  pushover_app_token TEXT,
  -- When the credentials above last passed Pushover's own validation endpoint.
  -- The channel cannot be ENABLED without this: a channel that has never been
  -- proven to work is a channel that fails silently the first time it matters.
  pushover_validated_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, owner_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  CHECK (length(owner_id) > 0 AND length(owner_id) <= 256),
  CHECK (enabled IN (0, 1)),
  CHECK (digest_enabled IN (0, 1)),
  CHECK (asset_obligations_enabled IN (0, 1)),
  -- 'HH:MM'. A COARSE shape check -- GLOB cannot express "00 to 23", so this
  -- admits '29:00' -- and it is deliberately not the authority. The application
  -- parser is (`parseDigestSendTime`), and the evaluator refuses anything it
  -- cannot read rather than guessing. What this stops is a value that is not a
  -- time at all reaching either of them from a hand-edited row.
  CHECK (digest_send_time GLOB '[0-2][0-9]:[0-5][0-9]'),
  CHECK (timezone IS NULL OR (length(timezone) > 0 AND length(timezone) <= 128)),
  CHECK (pushover_enabled IN (0, 1)),
  CHECK (pushover_user_key IS NULL OR (length(pushover_user_key) > 0 AND length(pushover_user_key) <= 128)),
  CHECK (pushover_app_token IS NULL OR (length(pushover_app_token) > 0 AND length(pushover_app_token) <= 128)),
  CHECK (pushover_validated_at IS NULL OR length(pushover_validated_at) > 0),
  -- A channel may only be enabled once it has been validated. The DATABASE holds
  -- this, not just the route: "validate before enable" is the whole reason the
  -- test action exists, and a rule enforced in one place is a rule one code path
  -- can forget.
  CHECK (pushover_enabled = 0 OR (pushover_user_key IS NOT NULL AND pushover_app_token IS NOT NULL AND pushover_validated_at IS NOT NULL)),
  CHECK (version >= 1),
  CHECK (length(created_at) > 0 AND length(updated_at) > 0)
) STRICT;

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
-- One row per EVENT that fired. Both the dedupe ledger and the in-app inbox.
CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  -- The closed vocabulary of things DalyHub will say. Adding a kind is a
  -- migration, deliberately: a notification kind is a promise about frequency
  -- and about what the owner is agreeing to be interrupted for.
  kind TEXT NOT NULL,
  -- The record the event is ABOUT, when there is one -- an Asset, for an
  -- obligation rung. Deliberately NOT a foreign key: an event is history, and
  -- deleting the Asset must not delete the record of having been told about it.
  -- Nothing joins on this. It exists so the inbox can say what a row concerned
  -- even after the subject is gone.
  subject_entity_id TEXT,
  -- The identity of the EVENT, not of the row. 'digest:2026-08-16' or
  -- 'asset:<entityId>:7'. The UNIQUE index below is what makes two concurrent
  -- ticks produce one notification: the loser's insert conflicts and it stops,
  -- silently, rather than arbitrating in application code.
  dedupe_key TEXT NOT NULL,
  -- The rendered event, stored rather than re-derived. A notification must say
  -- what was true WHEN IT FIRED. Re-rendering it later from current facts would
  -- silently rewrite history, which is precisely the failure the state/event
  -- distinction exists to prevent.
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  -- Where tapping the row goes. An in-application path, never an external URL.
  href TEXT NOT NULL,
  created_at TEXT NOT NULL,
  -- NULL until the owner has seen it. The only mutable column in the table, and
  -- the only read-tracking there is: no seen_at, no dismissed_at, no snooze.
  read_at TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  CHECK (length(id) > 0 AND length(id) <= 64),
  CHECK (kind IN ('digest', 'asset_obligation')),
  CHECK (subject_entity_id IS NULL OR (length(subject_entity_id) > 0 AND length(subject_entity_id) <= 64)),
  CHECK (length(dedupe_key) > 0 AND length(dedupe_key) <= 200),
  CHECK (length(title) > 0 AND length(title) <= 250),
  CHECK (length(body) > 0 AND length(body) <= 2000),
  CHECK (length(href) > 0 AND length(href) <= 512),
  CHECK (length(created_at) > 0),
  CHECK (read_at IS NULL OR length(read_at) > 0)
) STRICT;

-- ONE event, once, per workspace, forever. This index IS the concurrency guard
-- and IS the "we already told them" rule. Both are properties of the database
-- rather than of a read-then-write two ticks could both pass.
CREATE UNIQUE INDEX notifications_dedupe
  ON notifications (workspace_id, dedupe_key);

-- The inbox read: newest first, bounded, already in display order.
CREATE INDEX notifications_by_created
  ON notifications (workspace_id, created_at DESC, id);

-- The unread count the bell shows, and the mark-all-read write. A PARTIAL index
-- because unread rows are the small minority in a healthy workspace: the count
-- scans only what it is counting.
CREATE INDEX notifications_unread
  ON notifications (workspace_id)
  WHERE read_at IS NULL;

-- The 90-day purge of READ rows. Unread rows are never purged -- silently
-- deleting something the owner has not seen is the one thing an event log must
-- not do.
CREATE INDEX notifications_read_at
  ON notifications (workspace_id, read_at);

-- ---------------------------------------------------------------------------
-- notification_deliveries
-- ---------------------------------------------------------------------------
-- One row per EXTERNAL channel attempt against a notification.
--
-- In-app delivery is deliberately absent: it is the notifications insert itself
-- and cannot fail separately, so a row asserting it succeeded would add nothing
-- and could disagree with the table it describes.
CREATE TABLE notification_deliveries (
  workspace_id TEXT NOT NULL,
  notification_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  status TEXT NOT NULL,
  attempted_at TEXT NOT NULL,
  -- A code from the application's own closed vocabulary -- never a provider
  -- response body, never a message the remote service wrote. A hostile or merely
  -- verbose upstream must not be able to put text on the owner's screen, and a
  -- failure detail is exactly where a leaked credential ends up in a screenshot.
  detail TEXT,
  -- One attempt record per channel per notification. There is no retry: the
  -- notification row already exists, so a failed send is recorded and left
  -- visible in the inbox rather than re-fired into a duplicate. The primary key
  -- says so.
  PRIMARY KEY (workspace_id, notification_id, channel),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  -- Purging a read notification takes its delivery record with it. A delivery
  -- has no meaning without the event it delivered.
  FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
  CHECK (length(notification_id) > 0 AND length(notification_id) <= 64),
  CHECK (channel IN ('pushover')),
  CHECK (status IN ('delivered', 'failed')),
  CHECK (length(attempted_at) > 0),
  CHECK (detail IS NULL OR length(detail) <= 64)
) STRICT;

-- The inbox's per-row delivery badge: every delivery for a bounded page of
-- notifications, in one statement rather than one query per row.
CREATE INDEX notification_deliveries_by_notification
  ON notification_deliveries (workspace_id, notification_id);
