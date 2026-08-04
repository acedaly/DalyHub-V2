-- Migration number: 0028 	 2026-08-04
--
-- IDENT-01 Workspace membership: the durable link between an AUTHENTICATED
-- SUBJECT and a workspace, and the identity facts needed to name that person.
--
-- Why this table exists. FND-09 already records the trusted actor on every
-- Activity event: activities.actor_type = 'user' and activities.actor_id = the
-- Cloudflare Access "sub" (a stable identifier, never an email, per ADR-016
-- section 5.6). What the schema had NO row for was the IDENTITY behind that
-- subject, so every read surface had nothing to resolve and fell back to an
-- anonymous label. This adds the missing link:
--
--     activities.actor_id  ==  workspace_members.subject
--                              -> person_entity_id -> entities.title (a Person)
--
-- It is purely ADDITIVE and forward-only. No existing table, row or index is
-- touched, and no Activity row is rewritten. Historical events become resolvable
-- the moment a membership row exists for the subject they already carry, which is
-- what makes the identity repair non-destructive (see
-- scripts/repair-activity-identity.mjs).
--
-- Identity model (ADR-071): the display name is RESOLVED AT READ TIME from this
-- row (and its linked Person), not snapshotted onto each event. Renaming the
-- profile renames the actor everywhere, history included -- one record, many
-- windows (AGENTS.md section 3). There is deliberately no per-event name copy.
--
-- Conventions match every other table: ISO-8601 UTC TEXT timestamps written by
-- the application, no database enums, STRICT typing so a schema mistake fails
-- loudly. There is no deleted_at column: membership is revoked by deleting the
-- row.

CREATE TABLE workspace_members (
  -- The workspace this membership belongs to.
  workspace_id      TEXT NOT NULL,
  -- The stable authenticated subject. This is EXACTLY the value stored in
  -- activities.actor_id for a 'user' actor, which is what makes existing history
  -- resolvable with no backfill of the activity rows themselves.
  subject           TEXT NOT NULL,
  -- Last verified email seen for this subject (canonicalised). Nullable, because
  -- it is a display fallback rather than an identifier, and it can change.
  email             TEXT,
  -- An explicit, owner-curated display name. Nullable, and it wins over provider
  -- data in the canonical resolution order.
  display_name      TEXT,
  -- The display name the identity provider supplied (e.g. the Access "name"
  -- claim), refreshed on sign-in. Nullable, as many IdP tokens carry no name.
  auth_display_name TEXT,
  -- The linked Person record (this workspace's own People module). Nullable.
  person_entity_id  TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  -- When this subject last authenticated. Operational only, never displayed.
  last_seen_at      TEXT NOT NULL,

  CONSTRAINT workspace_members_pk PRIMARY KEY (workspace_id, subject),
  CONSTRAINT workspace_members_workspace_not_empty
    CHECK (length(workspace_id) > 0),
  CONSTRAINT workspace_members_subject_not_empty
    CHECK (length(subject) > 0 AND length(subject) <= 128),
  -- Nullable columns are never stored as an empty string. Absent means NULL, so
  -- the canonical resolution order only ever has to test one thing.
  CONSTRAINT workspace_members_email_not_empty
    CHECK (email IS NULL OR length(email) > 0),
  CONSTRAINT workspace_members_display_name_not_empty
    CHECK (display_name IS NULL OR (length(display_name) > 0 AND length(display_name) <= 120)),
  CONSTRAINT workspace_members_auth_display_name_not_empty
    CHECK (auth_display_name IS NULL OR (length(auth_display_name) > 0 AND length(auth_display_name) <= 120)),
  CONSTRAINT workspace_members_person_id_not_empty
    CHECK (person_entity_id IS NULL OR length(person_entity_id) > 0),
  CONSTRAINT workspace_members_created_at_not_empty CHECK (length(created_at) > 0),
  CONSTRAINT workspace_members_updated_at_not_empty CHECK (length(updated_at) > 0),
  CONSTRAINT workspace_members_last_seen_at_not_empty CHECK (length(last_seen_at) > 0),

  -- The workspace must exist. ON DELETE RESTRICT, like every other child table.
  CONSTRAINT workspace_members_workspace_fk
    FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE RESTRICT,
  -- The linked Person must exist IN THE SAME WORKSPACE. The composite key makes a
  -- cross-workspace identity link structurally impossible, and SQLite treats the
  -- constraint as satisfied when person_entity_id is NULL (unlinked).
  CONSTRAINT workspace_members_person_fk
    FOREIGN KEY (workspace_id, person_entity_id)
    REFERENCES entities (workspace_id, id) ON DELETE RESTRICT
) STRICT;

-- Access path: "which member is linked to this Person" -- used when a Person is
-- renamed or unlinked, and by the identity validation report.
CREATE INDEX workspace_members_person_idx
  ON workspace_members (workspace_id, person_entity_id);
