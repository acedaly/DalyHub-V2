-- Migration number: 0051 	 2026-09-05
--
-- V2.10 LIFE-03 -- a notification kind that has stopped being true.
--
-- See ADR-118 decision 4. This migration CARRIES LIVE OWNER DATA and its whole
-- purpose is that the owner notices nothing.
--
-- ## What is wrong today
--
-- `notifications.kind` admits `'asset_obligation'` behind a CHECK (0043:153),
-- every rung's dedupe key is `asset:<obligationId>:<rung>`
-- (`app/kernel/notifications/notification.ts`), and the settings column is
-- `asset_obligations_enabled` (0043:64). All three were true when an obligation
-- could only be about an Asset. Since 0050 an obligation is about an Asset, a
-- Person, or nothing at all, and most of the ones V2.10 exists for are about
-- nothing -- so the kind names a thing the notice is not about, and the toggle
-- offers to silence a category the owner does not have.
--
-- ## Why the dedupe keys move WITH the kind
--
-- The dedupe key is not a label: it is the ledger of what the owner has already
-- been told. `existingDedupeKeys` reads it before every send, and the UNIQUE
-- index on `(workspace_id, dedupe_key)` is what makes "once, ever" a property of
-- the database rather than of a read-then-write.
--
-- Change the prefix in the application and leave the rows alone and every rung
-- ever fired becomes unseen: the next tick re-announces every open obligation at
-- every rung it has already crossed, in one burst, at whatever hour the cron
-- runs. That is the failure this migration exists to prevent, and it is why the
-- rewrite happens in the same statement as the kind rather than in a follow-up.
--
-- The `href` of a historical row is NOT rewritten. A notification says what was
-- true when it fired. The Asset tab it pointed at still exists and still shows
-- the obligation. Rewriting history to match today's routes is precisely the
-- silent rewrite the state/event distinction exists to prevent.
--
-- ## Why the table is rebuilt rather than altered
--
-- SQLite cannot alter a CHECK constraint. `notification_deliveries` has a
-- foreign key into `notifications` with ON DELETE CASCADE, and a DROP TABLE of
-- the parent fires that cascade -- so the deliveries are stashed and restored
-- around the rebuild rather than quietly taken with it.

-- ---------------------------------------------------------------------------
-- 1. The settings column. A rename carries its CHECK with it.
-- ---------------------------------------------------------------------------

ALTER TABLE notification_settings
  RENAME COLUMN asset_obligations_enabled TO obligations_enabled;

-- ---------------------------------------------------------------------------
-- 2. Stash the delivery records, and take the child out of the way.
-- ---------------------------------------------------------------------------

CREATE TABLE notification_deliveries_migration_0051 AS
  SELECT workspace_id, notification_id, channel, status, attempted_at, detail
    FROM notification_deliveries;

DROP TABLE notification_deliveries;

-- ---------------------------------------------------------------------------
-- 3. Rebuild `notifications` with the new vocabulary, carrying every row.
-- ---------------------------------------------------------------------------

CREATE TABLE notifications_new (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  subject_entity_id TEXT,
  dedupe_key TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  href TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  CHECK (length(id) > 0 AND length(id) <= 64),
  CHECK (kind IN ('digest', 'obligation')),
  CHECK (subject_entity_id IS NULL OR (length(subject_entity_id) > 0 AND length(subject_entity_id) <= 64)),
  CHECK (length(dedupe_key) > 0 AND length(dedupe_key) <= 200),
  CHECK (length(title) > 0 AND length(title) <= 250),
  CHECK (length(body) > 0 AND length(body) <= 2000),
  CHECK (length(href) > 0 AND length(href) <= 512),
  CHECK (length(created_at) > 0),
  CHECK (read_at IS NULL OR length(read_at) > 0)
) STRICT;

INSERT INTO notifications_new (
  id, workspace_id, kind, subject_entity_id, dedupe_key,
  title, body, href, created_at, read_at
)
SELECT
  id,
  workspace_id,
  CASE WHEN kind = 'asset_obligation' THEN 'obligation' ELSE kind END,
  subject_entity_id,
  -- 'asset:' is six characters, so the remainder starts at seven. Scoped to the
  -- rows that actually carry the old prefix: a digest key is left alone, and so
  -- is anything that does not look like what this migration is renaming.
  CASE
    WHEN kind = 'asset_obligation' AND dedupe_key LIKE 'asset:%'
      THEN 'obligation:' || substr(dedupe_key, 7)
    ELSE dedupe_key
  END,
  title,
  body,
  href,
  created_at,
  read_at
FROM notifications;

DROP TABLE notifications;

ALTER TABLE notifications_new RENAME TO notifications;

-- The indexes, verbatim from 0043: the unique dedupe ledger, the inbox read,
-- the partial unread count, and the purge scan.
CREATE UNIQUE INDEX notifications_dedupe
  ON notifications (workspace_id, dedupe_key);

CREATE INDEX notifications_by_created
  ON notifications (workspace_id, created_at DESC, id);

CREATE INDEX notifications_unread
  ON notifications (workspace_id)
  WHERE read_at IS NULL;

CREATE INDEX notifications_read_at
  ON notifications (workspace_id, read_at);

-- ---------------------------------------------------------------------------
-- 4. Put the delivery records back, against the rebuilt parent.
-- ---------------------------------------------------------------------------

CREATE TABLE notification_deliveries (
  workspace_id TEXT NOT NULL,
  notification_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  status TEXT NOT NULL,
  attempted_at TEXT NOT NULL,
  detail TEXT,
  PRIMARY KEY (workspace_id, notification_id, channel),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
  CHECK (length(notification_id) > 0 AND length(notification_id) <= 64),
  CHECK (channel IN ('pushover')),
  CHECK (status IN ('delivered', 'failed')),
  CHECK (length(attempted_at) > 0),
  CHECK (detail IS NULL OR length(detail) <= 64)
) STRICT;

CREATE INDEX notification_deliveries_by_notification
  ON notification_deliveries (workspace_id, notification_id);

INSERT INTO notification_deliveries (
  workspace_id, notification_id, channel, status, attempted_at, detail
)
SELECT workspace_id, notification_id, channel, status, attempted_at, detail
  FROM notification_deliveries_migration_0051;

DROP TABLE notification_deliveries_migration_0051;
