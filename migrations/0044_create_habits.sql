-- Migration number: 0044 	 2026-08-18
--
-- HABITS-01: Habits and routines -- a Habit's detail slice, its effective-dated
-- schedule versions, and its check-in history.
--
-- ADDITIVE ONLY. Three new tables. No existing table is rebuilt, no column is
-- added to an existing table, and no existing row is read or rewritten. A
-- deployment whose owner never creates a Habit never writes a row here, and
-- nothing outside the Habits module reads these tables.
--
-- THE NUMBERING. 0044 is the next free number on main at the time this branch
-- was opened. The repository has two grandfathered collisions (0013 and 0039)
-- recorded in test/unit/migrations/migration-numbering.test.ts, and this
-- migration deliberately does not add a third.
--
-- ==========================================================================
-- WHY A HABIT IS NOT A RECURRING TASK, IN SCHEMA TERMS
-- ==========================================================================
-- DalyHub already stores structured Task recurrence (0037, ADR-062/ADR-085), so
-- the cheap answer would have been a flag on a Task and a saved view over it.
-- The schema below exists because that answer is wrong about what the two
-- things ARE:
--
--   a recurring TASK is an OBLIGATION. It has a due date, it can be overdue, it
--   belongs to a Project, it is counted in that Project's progress and it sits
--   in the planning queue until it is placed. Its next occurrence is a ROW,
--   because forgetting it has a cost.
--
--   a HABIT is a BEHAVIOUR. It has a cadence rather than a deadline, it cannot
--   be late, and missing a Tuesday is not a debt carried into Wednesday. There
--   is therefore NO occurrence row: nothing is generated, nothing accumulates,
--   and a Habit can never appear in an overdue count, a Task statistic or a
--   Project rollup -- structurally, because no Task exists to appear in them.
--
-- What a Habit measures is CONSISTENCY, and consistency needs exactly two
-- durable facts: what was expected, and what happened. `habit_schedules` holds
-- the first, `habit_completions` the second.
--
-- ==========================================================================
-- WHY THE SCHEDULE IS VERSIONED
-- ==========================================================================
-- If the current schedule were the only stored fact, every historical figure
-- would be recomputed from it -- so changing a Habit from Monday/Wednesday/Friday
-- to Tuesday/Thursday would silently rewrite what DalyHub says the owner was
-- supposed to do last month, and moving from three times a week to two would
-- retroactively turn missed weeks into met ones. A consistency measure that
-- changes the past when you change your mind is worse than no measure.
--
-- The smallest thing that prevents it is a contiguous, non-overlapping chain of
-- effective-dated versions per Habit. There is no generic versioning
-- infrastructure here and nothing else in DalyHub becomes temporal: a Habit's
-- TITLE and NOTES are not versioned, because renaming a Habit does not change
-- what was expected of it.
--
-- ==========================================================================
-- CONVENTIONS
-- ==========================================================================
-- Identical to the existing tables: application-written ISO-8601 UTC TEXT
-- timestamps, wall-calendar `YYYY-MM-DD` TEXT for dates that are dates, STRICT
-- column typing, and workspace foreign keys with ON DELETE RESTRICT.

-- ---------------------------------------------------------------------------
-- habit_details
-- ---------------------------------------------------------------------------
-- The additive slice a `habit` entity carries beyond the shared header. Small on
-- purpose: identity and title stay in `entities`, the cadence lives in its own
-- versioned table, and the history lives in its own.
CREATE TABLE habit_details (
  workspace_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  -- Carried so the composite foreign key below can assert the entity really is
  -- a Habit -- the same device `person_details` (0013) uses.
  entity_type TEXT NOT NULL DEFAULT 'habit',
  -- Optional plain-text notes: what this behaviour is, or why it matters. Long
  -- form writing belongs in a Note, which a Habit can be linked to.
  notes TEXT,
  -- The reversible put-away state, independent of `entities.deleted_at`. An
  -- archived Habit keeps every completion it earned and stops being expected,
  -- it is not deleted and it is not a failure.
  archived_at TEXT,
  -- The OWNER-LOCAL calendar date of `archived_at`, resolved once at the moment
  -- of archiving through the owner's timezone.
  --
  -- Stored rather than derived because deriving it later would mean re-reading
  -- an instant through TODAY's timezone preference: an owner who archives a
  -- Habit in Sydney and later moves to London would find the boundary of their
  -- own history had shifted by a day. The expectation window is a calendar
  -- fact, so it is stored as a calendar date.
  archived_on TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT habit_details_pk PRIMARY KEY (workspace_id, entity_id),
  CONSTRAINT habit_details_workspace_not_empty CHECK (length(workspace_id) > 0),
  CONSTRAINT habit_details_entity_not_empty CHECK (length(entity_id) > 0),
  CONSTRAINT habit_details_entity_type CHECK (entity_type = 'habit'),
  CONSTRAINT habit_details_notes_bounded CHECK (notes IS NULL OR length(notes) <= 4000),
  CONSTRAINT habit_details_archived_pair CHECK (
    (archived_at IS NULL AND archived_on IS NULL)
    OR (archived_at IS NOT NULL AND archived_on IS NOT NULL)
  ),
  CONSTRAINT habit_details_archived_on_shape CHECK (
    archived_on IS NULL OR archived_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  ),
  CONSTRAINT habit_details_timestamps CHECK (
    length(created_at) > 0 AND length(updated_at) > 0
  ),
  CONSTRAINT habit_details_entity_fk FOREIGN KEY (workspace_id, entity_id, entity_type)
    REFERENCES entities (workspace_id, id, type) ON DELETE RESTRICT
) STRICT;

-- The collection's active/archived partition within a workspace. Ordering stays
-- on entities(workspace_id, type, created_at, id), exactly as People's does.
CREATE INDEX habit_details_workspace_archived
  ON habit_details (workspace_id, archived_at, entity_id);

-- ---------------------------------------------------------------------------
-- habit_schedules
-- ---------------------------------------------------------------------------
-- One row per VERSION of a Habit's cadence, effective-dated in owner-local
-- calendar dates. The chain is contiguous and non-overlapping: exactly one
-- version has `effective_to IS NULL` (the current one), and every earlier
-- version ends the day before the next begins.
CREATE TABLE habit_schedules (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  habit_id TEXT NOT NULL,
  -- The closed vocabulary, deliberately three wide:
  --   'daily'         every day
  --   'weekdays'      selected days of the week
  --   'weekly_count'  N times in the owner's calendar week, on any days
  --
  -- NOT enumerated in a CHECK, for the reason 0032 and 0038 both give: a CHECK
  -- over a domain that may grow turns "add a schedule kind" into "rebuild a
  -- production table", and SQLite cannot drop a column that participates in one.
  -- The controlled vocabulary lives in app/kernel/habits/habit-schedule.ts and is
  -- enforced at the one validation boundary every write already passes through.
  -- An unrecognised stored kind reads as "no expectation" rather than throwing.
  kind TEXT NOT NULL,
  -- For 'weekdays': a comma-separated, sorted, de-duplicated list of zero-based
  -- weekday indices with Sunday = 0 ('1,3,5'). A short fixed-shape list rather
  -- than JSON, because it is never queried into and never partially updated.
  weekdays TEXT,
  -- For 'weekly_count': how many times in the week. 1..7 -- a week has seven days,
  -- and this model stores at most one completion per day.
  target_count INTEGER,
  -- Owner-local wall-calendar dates. Inclusive at both ends, `effective_to` is
  -- NULL for the version currently in force.
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, habit_id) REFERENCES habit_details (workspace_id, entity_id)
    ON DELETE RESTRICT,
  CONSTRAINT habit_schedules_id_bounded CHECK (length(id) > 0 AND length(id) <= 64),
  CONSTRAINT habit_schedules_habit_bounded CHECK (length(habit_id) > 0 AND length(habit_id) <= 64),
  CONSTRAINT habit_schedules_kind_bounded CHECK (length(kind) > 0 AND length(kind) <= 32),
  CONSTRAINT habit_schedules_weekdays_bounded CHECK (weekdays IS NULL OR length(weekdays) <= 32),
  CONSTRAINT habit_schedules_target_range CHECK (
    target_count IS NULL OR (target_count >= 1 AND target_count <= 7)
  ),
  CONSTRAINT habit_schedules_from_shape CHECK (
    effective_from GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  ),
  CONSTRAINT habit_schedules_to_shape CHECK (
    effective_to IS NULL OR effective_to GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  ),
  -- A version cannot end before it starts. The rest of the chain's integrity
  -- (contiguity, exactly one open version) is the repository's, which writes
  -- both halves of a change in one transaction.
  CONSTRAINT habit_schedules_ordered CHECK (
    effective_to IS NULL OR effective_to >= effective_from
  ),
  CONSTRAINT habit_schedules_created_at CHECK (length(created_at) > 0)
) STRICT;

-- ONE version may begin on a given day for a given Habit. This is what makes
-- "the owner edited their cadence twice this morning" an AMENDMENT of today's
-- version rather than a chain of zero-length ones -- a property of the database
-- rather than of a read-then-write two requests could both pass.
CREATE UNIQUE INDEX habit_schedules_one_per_start
  ON habit_schedules (workspace_id, habit_id, effective_from);

-- The chain read: every version for a bounded SET of Habits, in one statement,
-- already in effective order. This index is why a page of Habits costs one
-- schedule query rather than one per row.
CREATE INDEX habit_schedules_by_habit
  ON habit_schedules (workspace_id, habit_id, effective_from);

-- ---------------------------------------------------------------------------
-- habit_completions
-- ---------------------------------------------------------------------------
-- One row per CHECK-IN: a Habit, the owner-local calendar date it counts for,
-- and the instant it was recorded.
--
-- The PRIMARY KEY is the whole concurrency and correctness story. "At most once
-- per Habit per local calendar date" is enforced by the DATABASE, so two taps
-- that race -- on a phone, on two devices, or from a double-submitted form --
-- produce exactly one completion, and the loser's INSERT is a no-op rather than
-- something application code has to notice and reconcile.
--
-- The DATE is the identity and the instant is provenance, never the other way
-- round. Storing only an instant would mean deciding which calendar day it
-- belonged to on every later read, through whatever timezone preference was
-- current then -- so moving countries would silently re-date the owner's history,
-- and a DST transition would move a completion onto a different day. The
-- owner-local date is resolved ONCE, at the moment of the check-in.
--
-- There is no `count` column and no second completion per day. "How many
-- glasses of water" is quantity tracking, this model deliberately answers only
-- "did you do it that day".
CREATE TABLE habit_completions (
  workspace_id TEXT NOT NULL,
  habit_id TEXT NOT NULL,
  completed_on TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, habit_id, completed_on),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, habit_id) REFERENCES habit_details (workspace_id, entity_id)
    ON DELETE RESTRICT,
  CONSTRAINT habit_completions_habit_bounded CHECK (
    length(habit_id) > 0 AND length(habit_id) <= 64
  ),
  CONSTRAINT habit_completions_date_shape CHECK (
    completed_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  ),
  CONSTRAINT habit_completions_recorded_at CHECK (length(recorded_at) > 0)
) STRICT;

-- The window read every surface actually makes: "every completion for this
-- workspace between two dates", filtered to a bounded set of Habit ids in the
-- same statement. Today asks it for the current week, the Habit record for the
-- last four, and both cost one query whatever the Habit count.
CREATE INDEX habit_completions_by_date
  ON habit_completions (workspace_id, completed_on, habit_id);
