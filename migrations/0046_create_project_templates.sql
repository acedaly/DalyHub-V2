-- Migration number: 0046 	 2026-08-19
--
-- PROJECT-02: Project templates -- a reusable Project SHAPE, the ordered Tasks
-- it will create, and the steps inside those Tasks.
--
-- ADDITIVE ONLY. Three new tables. No existing table is rebuilt, no column is
-- added to an existing table, and no existing row is read or rewritten. A
-- deployment whose owner never saves a template never writes a row here, and
-- nothing outside the Project-templates surface reads these tables.
--
-- THE NUMBERING. 0046 is the next free number on main at the time this branch
-- was opened. The repository has two grandfathered collisions (0013 and 0039)
-- recorded in test/unit/migrations/migration-numbering.test.ts, and this
-- migration deliberately does not add a third.
--
-- ==========================================================================
-- WHY A TEMPLATE IS NOT A PROJECT WITH A FLAG
-- ==========================================================================
-- The cheap answer was `project_details.is_template`, reusing the Project
-- domain, the Project record and the Project editor wholesale. It is wrong for
-- one reason, and the reason is permanent:
--
--   a PROJECT is a row in `spine_records`. Everything in DalyHub that answers a
--   question about work reads the spine -- the Project collection and its
--   lifecycle counts, `getRollup`, Project health, Goal progress, Today's
--   "Continue working", the Weekly Planning queue, the Tasks collection, the
--   Inbox count, Review, analytics. A flagged Project would need an exclusion
--   predicate added to every one of those, correct on the day it was written and
--   correct forever afterwards, including in the query nobody has written yet.
--   The first one anybody forgets is a template silently counted as live work.
--
-- So a template is NOT in the spine. It is an ordinary `entities` row of a new
-- type, `project_template`, exactly as HABITS-01 (0044) made a Habit an
-- `entities` row that is deliberately not a spine record. That gives it, for
-- free and with no second identity authority: a stable workspace-scoped id,
-- a title, timestamps, the shared soft-delete, Activity subjects, and a place
-- in the workspace snapshot. What it does not get -- because there is no row to
-- give it -- is a rollup, a completion, a structural parent, a health
-- evaluation, or any appearance in a count of Projects.
--
-- ==========================================================================
-- WHY A TEMPLATE TASK IS NOT A TASK
-- ==========================================================================
-- The same argument, one level down, and the same answer 0045 gave for a
-- checklist item: a template task is a ROW, not an entity. It has no id in
-- `entities`, no spine record, no EntityLinks, no Activity and no route, so it
-- cannot appear in Today, in Weekly Planning, in the Tasks collection, in an
-- Inbox count, in a Project rollup, in a Goal's progress, in a notification or
-- in search -- structurally, because no Task exists to appear in them.
--
-- It becomes a Task exactly once: when the owner creates a Project from the
-- template, in ONE atomic batch that mints a fresh id for every row it writes.
--
-- ==========================================================================
-- WHAT A TEMPLATE STORES, AND WHAT IT REFUSES TO STORE
-- ==========================================================================
-- The columns below are the decision. A template captures the reusable SHAPE of
-- work and the intentional DEFAULTS that shape carries -- a title, a
-- description, a priority, an order, the steps inside a step. It captures no
-- PLAN and no HISTORY, which is why there is no `due_date`, no
-- `scheduled_date`, no `time_sector`, no `status`, no `completed`, no
-- `waiting_*`, no `delegate_*`, no recurrence and no `completed_at` anywhere in
-- this file.
--
-- Absent columns are the enforcement. A stale absolute date cannot be copied
-- into a new Project by a future change that forgets the rule, because there is
-- nowhere for it to have been kept.
--
-- ==========================================================================
-- THE DEFAULT PARENT IS A PLAIN COLUMN, NOT AN EntityLink
-- ==========================================================================
-- `default_parent_id` records the Area or Goal a Project made from this
-- template usually belongs to, so the create form can preselect it. It is
-- deliberately NOT an EntityLink and deliberately NOT a foreign key:
--
--   * AREA-05's permanent Area deletion refuses while ANY active link still
--     references the Area. A template's convenience default must never be the
--     reason an owner cannot delete an empty Area.
--   * A template is a piece of configuration, not a participant in the
--     workspace's relationship graph. It should not appear in an Area's linked
--     items, and an EntityLink would put it there.
--
-- The value is therefore resolved on READ against the live hierarchy and
-- degrades to "no default" when it no longer names an active Area or Goal. The
-- create form still requires a real parent -- the spine decides that, as it
-- always has.
--
-- ==========================================================================
-- ORDERING
-- ==========================================================================
-- `position` is a plain INTEGER and the read order is (position, created_at,
-- id) -- a TOTAL order, so the list is deterministic even if two rows ever
-- shared a position, which is the property the product actually relies on.
-- Every mutation renumbers to a dense 0..n-1 sequence, because
-- a whole-list renumber of a bounded list is one statement and a rebalance that
-- never has to happen cannot go wrong. Not unique, for the reason 0045 gave: a
-- reorder passes through intermediate states SQLite would reject row by row.
--
-- ==========================================================================
-- CONVENTIONS
-- ==========================================================================
-- Identical to the existing tables: application-written ISO-8601 UTC TEXT
-- timestamps, STRICT column typing, a workspace foreign key with ON DELETE
-- RESTRICT, and a composite entity foreign key that carries `entity_type` so the
-- database itself asserts the parent really is a template (the device
-- `task_details` (0006), `habit_details` (0044) and `task_checklist_items`
-- (0045) all use).

-- ---------------------------------------------------------------------------
-- project_template_details: the template's own state
-- ---------------------------------------------------------------------------
CREATE TABLE project_template_details (
  workspace_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  -- Carried so the composite foreign key below can assert the entity really is
  -- a project template.
  entity_type TEXT NOT NULL DEFAULT 'project_template',
  -- Optional plain-text description: what this template is for, and when to
  -- reach for it. Plain text rather than Markdown, because it is read in a list
  -- beside a name and a count -- long-form writing belongs in a Note.
  description TEXT,
  -- The identity a Project created from this template starts with. A semantic
  -- KEY and a semantic SLOT NAME, never a glyph and never a hex, exactly as
  -- `project_details` stores them (0032, 0042).
  icon_key TEXT,
  colour_slot TEXT,
  -- The Area or Goal a Project made from this template usually belongs to. A
  -- convenience default, resolved on read. See the note above for why it is not
  -- a foreign key and not an EntityLink.
  default_parent_id TEXT,
  default_parent_kind TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT project_template_details_pk PRIMARY KEY (workspace_id, entity_id),
  CONSTRAINT project_template_details_workspace_not_empty CHECK (length(workspace_id) > 0),
  CONSTRAINT project_template_details_entity_not_empty CHECK (length(entity_id) > 0),
  CONSTRAINT project_template_details_entity_type CHECK (entity_type = 'project_template'),
  CONSTRAINT project_template_details_description_bounded CHECK (
    description IS NULL OR length(description) <= 2000
  ),
  CONSTRAINT project_template_details_parent_pair CHECK (
    (default_parent_id IS NULL AND default_parent_kind IS NULL)
    OR (default_parent_id IS NOT NULL AND default_parent_kind IN ('area', 'goal'))
  ),
  CONSTRAINT project_template_details_timestamps CHECK (
    length(created_at) > 0 AND length(updated_at) > 0
  ),
  CONSTRAINT project_template_details_entity_fk
    FOREIGN KEY (workspace_id, entity_id, entity_type)
    REFERENCES entities (workspace_id, id, type) ON DELETE RESTRICT
) STRICT;

-- ---------------------------------------------------------------------------
-- project_template_tasks: the ordered Tasks a template will create
-- ---------------------------------------------------------------------------
CREATE TABLE project_template_tasks (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  -- Carried so the composite foreign key can assert the owner really is a
  -- template. A template task can never hang off a Project, a Goal or a Task.
  template_type TEXT NOT NULL DEFAULT 'project_template',
  title TEXT NOT NULL,
  -- The canonical Markdown SOURCE (ADR-015), copied verbatim into the created
  -- Task's description. Never rendered here.
  description TEXT,
  -- p1..p4, or NULL for "untriaged" -- the same closed set and the same
  -- meaning-of-absence `task_details.priority` carries.
  priority TEXT,
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, template_id, template_type)
    REFERENCES entities (workspace_id, id, type) ON DELETE RESTRICT,
  CONSTRAINT project_template_tasks_id_bounded CHECK (length(id) > 0 AND length(id) <= 64),
  CONSTRAINT project_template_tasks_workspace_not_empty CHECK (length(workspace_id) > 0),
  CONSTRAINT project_template_tasks_template_bounded CHECK (
    length(template_id) > 0 AND length(template_id) <= 64
  ),
  CONSTRAINT project_template_tasks_template_type CHECK (template_type = 'project_template'),
  CONSTRAINT project_template_tasks_title_bounded CHECK (
    length(title) > 0 AND length(title) <= 512
  ),
  CONSTRAINT project_template_tasks_description_bounded CHECK (
    description IS NULL OR length(description) <= 20000
  ),
  -- The closed priority set, asserted by the database as well as the kernel.
  CONSTRAINT project_template_tasks_priority CHECK (
    priority IS NULL OR priority IN ('p1', 'p2', 'p3', 'p4')
  ),
  CONSTRAINT project_template_tasks_position_range CHECK (position >= 0),
  CONSTRAINT project_template_tasks_timestamps CHECK (
    length(created_at) > 0 AND length(updated_at) > 0
  )
) STRICT;

-- The ONE read every surface makes: this template's tasks, already in order.
-- It is also the index the bounded per-template COUNT aggregate uses, so a
-- gallery of templates reads "12 tasks" for the whole page in one statement
-- rather than one statement per template.
CREATE INDEX project_template_tasks_by_template
  ON project_template_tasks (workspace_id, template_id, position, id);

-- ---------------------------------------------------------------------------
-- project_template_checklist_items: the steps inside one template task
-- ---------------------------------------------------------------------------
-- The mirror of `task_checklist_items` (0045), one level removed: a title and an
-- order, and NOTHING else. There is deliberately no `completed` column. A
-- template holds the SHAPE of a checklist, and a tick is something that happens to
-- the Task the template creates, and a column that could hold one would be a
-- place for execution state to be copied from.
CREATE TABLE project_template_checklist_items (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  template_task_id TEXT NOT NULL,
  title TEXT NOT NULL,
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  FOREIGN KEY (template_task_id)
    REFERENCES project_template_tasks (id) ON DELETE RESTRICT,
  CONSTRAINT project_template_checklist_id_bounded CHECK (
    length(id) > 0 AND length(id) <= 64
  ),
  CONSTRAINT project_template_checklist_workspace_not_empty CHECK (length(workspace_id) > 0),
  CONSTRAINT project_template_checklist_task_bounded CHECK (
    length(template_task_id) > 0 AND length(template_task_id) <= 64
  ),
  -- The same 500-character bound `task_checklist_items` uses, so a step that
  -- fits in a template fits in the Task the template creates.
  CONSTRAINT project_template_checklist_title_bounded CHECK (
    length(title) > 0 AND length(title) <= 500
  ),
  CONSTRAINT project_template_checklist_position_range CHECK (position >= 0),
  CONSTRAINT project_template_checklist_timestamps CHECK (
    length(created_at) > 0 AND length(updated_at) > 0
  )
) STRICT;

CREATE INDEX project_template_checklist_by_task
  ON project_template_checklist_items (workspace_id, template_task_id, position, id);
