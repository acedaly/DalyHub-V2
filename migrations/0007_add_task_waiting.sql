-- Migration number: 0007 	 2026-07-20
--
-- TODAY-03 Waiting: track a task that is blocked on someone or something else
-- ("waiting for") — who or what it waits on, and since when (ROADMAP TODAY-03,
-- ADR-029). This composes the TODAY-02 task-detail slice (ADR-028) and the FND-04
-- EntityLink primitive rather than introducing a second store: the waiting STATE
-- and a free-text subject are additive columns on `task_details`, while an
-- entity-backed subject (a Person, Project, Goal, Area or another Task) is a
-- reserved `task.waiting_on` EntityLink resolved live like the structural parent.
--
-- This migration runs AFTER 0001–0006. It is purely ADDITIVE: it adds two nullable
-- columns to `task_details`, one partial unique index on the existing
-- `entity_links` table, and one partial access-path index. It does NOT alter or
-- rebuild any table and never rewrites existing data. No backfill: DalyHub V2 has
-- not entered production and a task is simply "not waiting" until it is first
-- marked waiting (an absent value reads as not-waiting).
--
-- Conventions (identical to the existing tables): timestamps are ISO-8601 UTC TEXT
-- written by the application; free text is stored as plain text and rendered
-- ESCAPED (never HTML/Markdown); STRICT column typing is preserved (ADD COLUMN on a
-- STRICT table keeps it STRICT). The new column CHECK constraints reference only
-- their own column (the ADD COLUMN form) — the cross-field invariants (a note
-- requires an active waiting state; a waiting state has EXACTLY ONE subject — a
-- free-text note XOR an active `task.waiting_on` link) are enforced by the
-- workspace-bound TaskRepository and covered by tests, since a portable ADD COLUMN
-- cannot express a multi-column or cross-table CHECK without a destructive rebuild.

-- The instant the task entered its CURRENT waiting state, as an ISO-8601 UTC
-- timestamp. NULL is the authoritative "not waiting" state — the single source of
-- truth for whether a task is waiting. A present value is never the empty string.
-- Changing only the waiting SUBJECT preserves this value (the same waiting episode
-- continues); clearing waiting sets it back to NULL.
ALTER TABLE task_details
  ADD COLUMN waiting_since TEXT
  CONSTRAINT task_details_waiting_since_not_empty
    CHECK (waiting_since IS NULL OR length(waiting_since) > 0);

-- The FREE-TEXT waiting subject ("finance confirmation", "replacement parts"),
-- when the thing the task waits on is not a DalyHub entity. NULL means either the
-- task is not waiting OR it waits on an ENTITY (a `task.waiting_on` link carries
-- the subject instead). A present value is trimmed, non-empty plain text. The
-- application guarantees a note is set only while waiting and never alongside an
-- active `task.waiting_on` link (exactly one subject representation).
ALTER TABLE task_details
  ADD COLUMN waiting_note TEXT
  CONSTRAINT task_details_waiting_note_not_empty
    CHECK (waiting_note IS NULL OR length(waiting_note) > 0);

-- Exactly one ACTIVE `task.waiting_on` link per task, enforced at the database over
-- the existing `entity_links` table (the same technique FND-07's one-active-parent
-- index uses). A waiting link is directed task -> subject, so the TASK is
-- `source_entity_id`. This forbids two active waiting subjects at once while
-- leaving unlinked (soft-deleted) links and every other link type unconstrained, so
-- the subject can be REPLACED by unlinking one and linking another in the same
-- transaction. `task.waiting_on` is a reserved task-domain link type: only the
-- TaskRepository writes it (atomically, alongside `waiting_since`), never the
-- generic EntityLink repository.
CREATE UNIQUE INDEX entity_links_one_active_waiting_idx
  ON entity_links (workspace_id, source_entity_id)
  WHERE deleted_at IS NULL AND type = 'task.waiting_on';

-- Access path for the Waiting collection query: a workspace's tasks that are
-- currently waiting, ordered off the entity/spine join. Partial over the waiting
-- subset keeps this hot path small (most tasks are not waiting).
CREATE INDEX task_details_waiting_idx
  ON task_details (workspace_id, waiting_since)
  WHERE waiting_since IS NOT NULL;
