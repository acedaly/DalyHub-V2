-- TODAY-02 E2E seed — a small, real spine so /today shows real focus tasks and the
-- task Drawer opens real records. Mirrors the ids/titles the fixtures + search
-- provider reference (t-px02 "Finish PX-02", t-pr "Review PR", t-gym "Gym") so the
-- existing Today/Search journeys keep working against real data. Idempotent via
-- INSERT OR IGNORE; touches only the LOCAL Miniflare database.

-- Areas (entities + spine_records).
INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
VALUES
  ('a-dh', 'local-dev-workspace', 'area', 'DalyHub V2', '2026-07-19T00:00:00.000Z', '2026-07-19T00:00:00.000Z', NULL),
  ('a-health', 'local-dev-workspace', 'area', 'Health', '2026-07-19T00:00:01.000Z', '2026-07-19T00:00:01.000Z', NULL);

-- A Person entity, so the TODAY-03 waiting picker has a real entity target to
-- choose ("waiting for Sarah Chen"). People are not spine records — just entities.
INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
VALUES
  ('p-sarah', 'local-dev-workspace', 'person', 'Sarah Chen', '2026-07-19T00:00:04.000Z', '2026-07-19T00:00:04.000Z', NULL);
-- PEOPLE-01 requires every Person to have a detail row (reads INNER-JOIN it); without
-- it Sarah is invisible to the People collection and the MEET-02 attendee picker.
INSERT OR IGNORE INTO person_details (workspace_id, entity_id, updated_at)
VALUES
  ('local-dev-workspace', 'p-sarah', '2026-07-19T00:00:04.000Z');
INSERT OR IGNORE INTO spine_records (workspace_id, entity_id, kind, completed_at)
VALUES
  ('local-dev-workspace', 'a-dh', 'area', NULL),
  ('local-dev-workspace', 'a-health', 'area', NULL);

-- Tasks (entities + spine_records + structural task.belongs_to_area links).
-- `t-drawer` is the dedicated task the task-drawer journey mutates, so editing it
-- never disturbs the titles the Today/Search journeys assert.
-- `t-waiting` is the dedicated task the TODAY-03 waiting journey mutates, so
-- toggling its waiting/completion state never disturbs the other journeys.
INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
VALUES
  ('t-px02', 'local-dev-workspace', 'task', 'Finish PX-02', '2026-07-19T01:00:00.000Z', '2026-07-19T01:00:00.000Z', NULL),
  ('t-pr', 'local-dev-workspace', 'task', 'Review PR', '2026-07-19T01:00:01.000Z', '2026-07-19T01:00:01.000Z', NULL),
  ('t-gym', 'local-dev-workspace', 'task', 'Gym', '2026-07-19T01:00:02.000Z', '2026-07-19T01:00:02.000Z', NULL),
  ('t-drawer', 'local-dev-workspace', 'task', 'Draft the proposal', '2026-07-19T01:00:03.000Z', '2026-07-19T01:00:03.000Z', NULL),
  ('t-waiting', 'local-dev-workspace', 'task', 'Await supplier sign-off', '2026-07-19T01:00:05.000Z', '2026-07-19T01:00:05.000Z', NULL),
  ('t-complete', 'local-dev-workspace', 'task', 'Wrap up the sprint', '2026-07-19T01:00:06.000Z', '2026-07-19T01:00:06.000Z', NULL);
INSERT OR IGNORE INTO spine_records (workspace_id, entity_id, kind, completed_at)
VALUES
  ('local-dev-workspace', 't-px02', 'task', NULL),
  ('local-dev-workspace', 't-pr', 'task', NULL),
  ('local-dev-workspace', 't-gym', 'task', NULL),
  ('local-dev-workspace', 't-drawer', 'task', NULL),
  ('local-dev-workspace', 't-waiting', 'task', NULL),
  ('local-dev-workspace', 't-complete', 'task', NULL);
INSERT OR IGNORE INTO entity_links (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
VALUES
  ('l-px02-area', 'local-dev-workspace', 't-px02', 'a-dh', 'task.belongs_to_area', '2026-07-19T01:00:00.000Z', '2026-07-19T01:00:00.000Z', NULL),
  ('l-pr-area', 'local-dev-workspace', 't-pr', 'a-dh', 'task.belongs_to_area', '2026-07-19T01:00:01.000Z', '2026-07-19T01:00:01.000Z', NULL),
  ('l-gym-area', 'local-dev-workspace', 't-gym', 'a-health', 'task.belongs_to_area', '2026-07-19T01:00:02.000Z', '2026-07-19T01:00:02.000Z', NULL),
  ('l-drawer-area', 'local-dev-workspace', 't-drawer', 'a-dh', 'task.belongs_to_area', '2026-07-19T01:00:03.000Z', '2026-07-19T01:00:03.000Z', NULL),
  ('l-waiting-area', 'local-dev-workspace', 't-waiting', 'a-dh', 'task.belongs_to_area', '2026-07-19T01:00:05.000Z', '2026-07-19T01:00:05.000Z', NULL),
  ('l-complete-area', 'local-dev-workspace', 't-complete', 'a-dh', 'task.belongs_to_area', '2026-07-19T01:00:06.000Z', '2026-07-19T01:00:06.000Z', NULL);
INSERT OR IGNORE INTO task_details (workspace_id, entity_id, entity_type, status, priority, due_date, scheduled_date, description, updated_at)
VALUES
  ('local-dev-workspace', 't-drawer', 'task', 'todo', 'p1', '2026-08-01', NULL, 'Draft the **proposal** document.', '2026-07-19T01:00:03.000Z');

-- Reset the seeded tasks' MUTABLE state so every e2e run starts from a known,
-- deterministic point regardless of what a prior run's journeys changed (the
-- INSERT OR IGNORE rows above do not overwrite). Completion is cleared for all
-- seeded tasks; `t-drawer`'s details are restored to their canonical values.
UPDATE spine_records SET completed_at = NULL
WHERE workspace_id = 'local-dev-workspace'
  AND entity_id IN ('t-px02', 't-pr', 't-gym', 't-drawer', 't-waiting', 't-complete');
UPDATE task_details
SET status = 'todo', priority = 'p1', due_date = '2026-08-01',
    scheduled_date = NULL, description = 'Draft the **proposal** document.',
    waiting_since = NULL, waiting_note = NULL
WHERE workspace_id = 'local-dev-workspace' AND entity_id = 't-drawer';

-- TODAY-03: clear any waiting state left by a prior e2e run so every run starts
-- from a known point (no task is waiting; no active waiting links).
UPDATE task_details SET waiting_since = NULL, waiting_note = NULL
WHERE workspace_id = 'local-dev-workspace'
  AND entity_id IN ('t-px02', 't-pr', 't-gym', 't-drawer', 't-waiting');
DELETE FROM entity_links
WHERE workspace_id = 'local-dev-workspace' AND type = 'task.waiting_on';

-- PROJ-01: a real Goal and two Projects — one directly under an Area, one advancing
-- the Goal (so its Area resolves through the Goal) — plus two child tasks under the
-- area-parented project (one open, one completed → a 1/2 roll-up). Mirrors the ids the
-- projects journey references; the completion/creation the journey performs is reset
-- below so every run starts from a known point.
INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
VALUES
  ('g-launch', 'local-dev-workspace', 'goal', 'Launch the site', '2026-07-19T02:00:00.000Z', '2026-07-19T02:00:00.000Z', NULL),
  ('pr-website', 'local-dev-workspace', 'project', 'Website relaunch', '2026-07-19T02:00:01.000Z', '2026-07-19T02:00:05.000Z', NULL),
  ('pr-launch', 'local-dev-workspace', 'project', 'Launch checklist', '2026-07-19T02:00:02.000Z', '2026-07-19T02:00:04.000Z', NULL),
  ('pt-design', 'local-dev-workspace', 'task', 'Design the homepage', '2026-07-19T02:01:00.000Z', '2026-07-19T02:01:00.000Z', NULL),
  ('pt-copy', 'local-dev-workspace', 'task', 'Write the launch copy', '2026-07-19T02:01:01.000Z', '2026-07-19T02:01:01.000Z', NULL);
INSERT OR IGNORE INTO spine_records (workspace_id, entity_id, kind, completed_at)
VALUES
  ('local-dev-workspace', 'g-launch', 'goal', NULL),
  ('local-dev-workspace', 'pr-website', 'project', NULL),
  ('local-dev-workspace', 'pr-launch', 'project', NULL),
  ('local-dev-workspace', 'pt-design', 'task', NULL),
  ('local-dev-workspace', 'pt-copy', 'task', NULL);
INSERT OR IGNORE INTO entity_links (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
VALUES
  ('l-glaunch-area', 'local-dev-workspace', 'g-launch', 'a-dh', 'goal.belongs_to_area', '2026-07-19T02:00:00.000Z', '2026-07-19T02:00:00.000Z', NULL),
  ('l-prweb-area', 'local-dev-workspace', 'pr-website', 'a-dh', 'project.belongs_to_area', '2026-07-19T02:00:01.000Z', '2026-07-19T02:00:01.000Z', NULL),
  ('l-prlaunch-goal', 'local-dev-workspace', 'pr-launch', 'g-launch', 'project.advances_goal', '2026-07-19T02:00:02.000Z', '2026-07-19T02:00:02.000Z', NULL),
  ('l-ptdesign-proj', 'local-dev-workspace', 'pt-design', 'pr-website', 'task.belongs_to_project', '2026-07-19T02:01:00.000Z', '2026-07-19T02:01:00.000Z', NULL),
  ('l-ptcopy-proj', 'local-dev-workspace', 'pt-copy', 'pr-website', 'task.belongs_to_project', '2026-07-19T02:01:01.000Z', '2026-07-19T02:01:01.000Z', NULL);

-- Reset the PROJ-01 seed's MUTABLE state so every run starts deterministically: the
-- Projects and the task `pt-design` are open; `pt-copy` is completed (the 1/2 roll-up).
UPDATE spine_records SET completed_at = NULL
WHERE workspace_id = 'local-dev-workspace'
  AND entity_id IN ('g-launch', 'pr-website', 'pr-launch', 'pt-design');
UPDATE spine_records SET completed_at = '2026-07-19T03:00:00.000Z'
WHERE workspace_id = 'local-dev-workspace' AND entity_id = 'pt-copy';
UPDATE entities SET title = 'Website relaunch'
WHERE workspace_id = 'local-dev-workspace' AND id = 'pr-website';

-- PROJ-05 Slice 4 — `pr-website` is the showcase project the existing Projects
-- journeys navigate; nothing mutates its workflow status, so it is permanently
-- Active (real work in progress) rather than the "planned" default, matching the
-- ADR-037 §37.7 Today integration this slice completes: Today's "Continue working"
-- now filters to `workflowStatus: "active"`, so a project a journey expects to
-- appear there must genuinely be Active, not merely open.
INSERT OR IGNORE INTO project_details (workspace_id, entity_id, status, archived_at, updated_at)
VALUES
  ('local-dev-workspace', 'pr-website', 'active', NULL, '2026-07-19T02:00:05.000Z');
UPDATE project_details SET status = 'active', archived_at = NULL
WHERE workspace_id = 'local-dev-workspace' AND entity_id = 'pr-website';

-- The New-Project parent-search journey CREATES a project titled "Search-picked
-- project". Remove any left by a prior run (including details, activity subjects,
-- spine record and structural link) so every run starts from the same known state —
-- this project is otherwise open and would accumulate in Today's "Continue working"
-- across local re-runs.
DELETE FROM activity_subjects
WHERE workspace_id = 'local-dev-workspace'
  AND entity_id IN (
    SELECT id FROM entities
    WHERE workspace_id = 'local-dev-workspace' AND type = 'project'
      AND title = 'Search-picked project'
  );
DELETE FROM project_details
WHERE workspace_id = 'local-dev-workspace'
  AND entity_id IN (
    SELECT id FROM entities
    WHERE workspace_id = 'local-dev-workspace' AND type = 'project'
      AND title = 'Search-picked project'
  );
DELETE FROM entity_links
WHERE workspace_id = 'local-dev-workspace'
  AND source_entity_id IN (
    SELECT id FROM entities
    WHERE workspace_id = 'local-dev-workspace' AND type = 'project'
      AND title = 'Search-picked project'
  );
DELETE FROM spine_records
WHERE workspace_id = 'local-dev-workspace'
  AND entity_id IN (
    SELECT id FROM entities
    WHERE workspace_id = 'local-dev-workspace' AND type = 'project'
      AND title = 'Search-picked project'
  );
DELETE FROM entities
WHERE workspace_id = 'local-dev-workspace' AND type = 'project'
  AND title = 'Search-picked project';

-- PROJ-01 pagination seed — MORE than one page (default page size 50) of both
-- projects and a single project's tasks, so the keyset "Load more" affordance and
-- cross-page reachability can be exercised end to end. These rows are immutable
-- (no journey mutates them), so INSERT OR IGNORE alone keeps every run
-- deterministic — no reset needed. Distinct `created_at` per row gives a stable
-- `(created_at, id)` ordering the cursor resumes after.

-- A dedicated Area holding 60 paginated projects. They are created AFTER the named
-- projects (so those stay on the collection's first page) and marked COMPLETED (so
-- they never displace Today's open-recency "Continue working"); with 63 projects
-- total the collection's first page is full and "Load more" shows.
INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
VALUES ('a-pag', 'local-dev-workspace', 'area', 'Pagination', '2026-07-18T03:30:00.000Z', '2026-07-18T03:30:00.000Z', NULL);
INSERT OR IGNORE INTO spine_records (workspace_id, entity_id, kind, completed_at)
VALUES ('local-dev-workspace', 'a-pag', 'area', NULL);

INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 60)
SELECT
  'pgp-' || substr('000' || n, -3),
  'local-dev-workspace',
  'project',
  'Paginated project ' || substr('000' || n, -3),
  printf('2026-07-19T05:%02d:00.000Z', n - 1),
  printf('2026-07-19T05:%02d:00.000Z', n - 1),
  NULL
FROM seq;
INSERT OR IGNORE INTO spine_records (workspace_id, entity_id, kind, completed_at)
WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 60)
SELECT 'local-dev-workspace', 'pgp-' || substr('000' || n, -3), 'project', printf('2026-07-19T05:%02d:30.000Z', n - 1) FROM seq;
INSERT OR IGNORE INTO entity_links (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 60)
SELECT
  'l-pgp-' || substr('000' || n, -3),
  'local-dev-workspace',
  'pgp-' || substr('000' || n, -3),
  'a-pag',
  'project.belongs_to_area',
  printf('2026-07-19T05:%02d:00.000Z', n - 1),
  printf('2026-07-19T05:%02d:00.000Z', n - 1),
  NULL
FROM seq;

-- A dedicated project holding 60 child tasks, so the project record's Tasks tab has
-- more than one page and its "Load more" can be exercised (the roll-up total stays
-- authoritative while only the first page of rows is loaded). The tasks are COMPLETED
-- so they never enter Today's planning bands (which exclude completed work) — they are
-- reached via the project's own Tasks tab under the All/Completed filter. Their
-- completion is a fixed past date, so they are never "completed today" either.
INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
VALUES ('pg-tasks', 'local-dev-workspace', 'project', 'Task-heavy project', '2026-07-18T03:31:00.000Z', '2026-07-18T03:31:00.000Z', NULL);
INSERT OR IGNORE INTO spine_records (workspace_id, entity_id, kind, completed_at)
VALUES ('local-dev-workspace', 'pg-tasks', 'project', NULL);
INSERT OR IGNORE INTO entity_links (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
VALUES ('l-pgtasks-area', 'local-dev-workspace', 'pg-tasks', 'a-pag', 'project.belongs_to_area', '2026-07-18T03:31:00.000Z', '2026-07-18T03:31:00.000Z', NULL);

INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 60)
SELECT
  'pgt-' || substr('000' || n, -3),
  'local-dev-workspace',
  'task',
  'Paginated task ' || substr('000' || n, -3),
  printf('2026-07-18T06:%02d:00.000Z', n - 1),
  printf('2026-07-18T06:%02d:00.000Z', n - 1),
  NULL
FROM seq;
INSERT OR IGNORE INTO spine_records (workspace_id, entity_id, kind, completed_at)
WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 60)
SELECT 'local-dev-workspace', 'pgt-' || substr('000' || n, -3), 'task', printf('2026-07-18T06:%02d:30.000Z', n - 1) FROM seq;
INSERT OR IGNORE INTO entity_links (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 60)
SELECT
  'l-pgt-' || substr('000' || n, -3),
  'local-dev-workspace',
  'pgt-' || substr('000' || n, -3),
  'pg-tasks',
  'task.belongs_to_project',
  printf('2026-07-18T06:%02d:00.000Z', n - 1),
  printf('2026-07-18T06:%02d:00.000Z', n - 1),
  NULL
FROM seq;

-- PROJ-02 (health) — four dedicated projects covering the health states, isolated
-- from the PROJ-01 journeys' projects. Each uses wall-clock-INDEPENDENT signals:
--   pr-atrisk  — one OPEN task overdue by a fixed far-past due date (always overdue)
--                plus one completed task; the health journey completes the overdue
--                task, leaving all tasks complete → "On track".
--   pr-blocked — its only open task is waiting (a free-text subject) → "Blocked".
--   pr-ontrack — its only task is complete (open work = 0) → "On track".
--   pr-stale   — an open task whose activity is anchored in 2020, so it is stale
--                regardless of the run date (no wall-clock dependency).
INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
VALUES
  ('pr-atrisk', 'local-dev-workspace', 'project', 'Conference talk', '2026-07-19T04:00:00.000Z', '2026-07-19T04:00:00.000Z', NULL),
  ('pr-blocked', 'local-dev-workspace', 'project', 'Office move', '2026-07-19T04:00:01.000Z', '2026-07-19T04:00:01.000Z', NULL),
  ('pr-ontrack', 'local-dev-workspace', 'project', 'Team offsite', '2026-07-19T04:00:02.000Z', '2026-07-19T04:00:02.000Z', NULL),
  ('pr-stale', 'local-dev-workspace', 'project', 'Old archive tidy', '2020-01-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z', NULL),
  ('pht-overdue', 'local-dev-workspace', 'task', 'Submit the abstract', '2026-07-19T04:01:00.000Z', '2026-07-19T04:01:00.000Z', NULL),
  ('pht-atrisk-done', 'local-dev-workspace', 'task', 'Book the venue', '2026-07-19T04:01:01.000Z', '2026-07-19T04:01:01.000Z', NULL),
  ('pht-blocked', 'local-dev-workspace', 'task', 'Sign the lease', '2026-07-19T04:01:02.000Z', '2026-07-19T04:01:02.000Z', NULL),
  ('pht-ontrack-done', 'local-dev-workspace', 'task', 'Pick the dates', '2026-07-19T04:01:03.000Z', '2026-07-19T04:01:03.000Z', NULL),
  ('pht-stale', 'local-dev-workspace', 'task', 'Shred old files', '2020-01-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z', NULL);
INSERT OR IGNORE INTO spine_records (workspace_id, entity_id, kind, completed_at)
VALUES
  ('local-dev-workspace', 'pr-atrisk', 'project', NULL),
  ('local-dev-workspace', 'pr-blocked', 'project', NULL),
  ('local-dev-workspace', 'pr-ontrack', 'project', NULL),
  ('local-dev-workspace', 'pr-stale', 'project', NULL),
  ('local-dev-workspace', 'pht-overdue', 'task', NULL),
  ('local-dev-workspace', 'pht-atrisk-done', 'task', '2026-07-19T05:00:00.000Z'),
  ('local-dev-workspace', 'pht-blocked', 'task', NULL),
  ('local-dev-workspace', 'pht-ontrack-done', 'task', '2026-07-19T05:00:00.000Z'),
  ('local-dev-workspace', 'pht-stale', 'task', NULL);
INSERT OR IGNORE INTO entity_links (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
VALUES
  ('l-pratrisk-area', 'local-dev-workspace', 'pr-atrisk', 'a-dh', 'project.belongs_to_area', '2026-07-19T04:00:00.000Z', '2026-07-19T04:00:00.000Z', NULL),
  ('l-prblocked-area', 'local-dev-workspace', 'pr-blocked', 'a-dh', 'project.belongs_to_area', '2026-07-19T04:00:01.000Z', '2026-07-19T04:00:01.000Z', NULL),
  ('l-prontrack-area', 'local-dev-workspace', 'pr-ontrack', 'a-dh', 'project.belongs_to_area', '2026-07-19T04:00:02.000Z', '2026-07-19T04:00:02.000Z', NULL),
  ('l-prstale-area', 'local-dev-workspace', 'pr-stale', 'a-dh', 'project.belongs_to_area', '2020-01-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z', NULL),
  ('l-phtoverdue-proj', 'local-dev-workspace', 'pht-overdue', 'pr-atrisk', 'task.belongs_to_project', '2026-07-19T04:01:00.000Z', '2026-07-19T04:01:00.000Z', NULL),
  ('l-phtdone-proj', 'local-dev-workspace', 'pht-atrisk-done', 'pr-atrisk', 'task.belongs_to_project', '2026-07-19T04:01:01.000Z', '2026-07-19T04:01:01.000Z', NULL),
  ('l-phtblocked-proj', 'local-dev-workspace', 'pht-blocked', 'pr-blocked', 'task.belongs_to_project', '2026-07-19T04:01:02.000Z', '2026-07-19T04:01:02.000Z', NULL),
  ('l-phtontrack-proj', 'local-dev-workspace', 'pht-ontrack-done', 'pr-ontrack', 'task.belongs_to_project', '2026-07-19T04:01:03.000Z', '2026-07-19T04:01:03.000Z', NULL),
  ('l-phtstale-proj', 'local-dev-workspace', 'pht-stale', 'pr-stale', 'task.belongs_to_project', '2020-01-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z', NULL);
INSERT OR IGNORE INTO task_details (workspace_id, entity_id, entity_type, status, priority, due_date, scheduled_date, description, waiting_since, waiting_note, updated_at)
VALUES
  ('local-dev-workspace', 'pht-overdue', 'task', 'todo', NULL, '2000-01-01', NULL, NULL, NULL, NULL, '2026-07-19T04:01:00.000Z'),
  ('local-dev-workspace', 'pht-blocked', 'task', 'todo', NULL, NULL, NULL, NULL, '2026-07-19T04:02:00.000Z', 'landlord counter-signature', '2026-07-19T04:02:00.000Z');

-- Reset the PROJ-02 health seed's MUTABLE state so every run is deterministic: the
-- overdue task is re-opened with its far-past due date, the blocked task's waiting is
-- restored, and the completed tasks stay completed.
UPDATE spine_records SET completed_at = NULL
WHERE workspace_id = 'local-dev-workspace'
  AND entity_id IN ('pr-atrisk', 'pr-blocked', 'pr-ontrack', 'pr-stale', 'pht-overdue', 'pht-blocked', 'pht-stale');
UPDATE spine_records SET completed_at = '2026-07-19T05:00:00.000Z'
WHERE workspace_id = 'local-dev-workspace'
  AND entity_id IN ('pht-atrisk-done', 'pht-ontrack-done');
UPDATE task_details
SET status = 'todo', due_date = '2000-01-01', scheduled_date = NULL,
    waiting_since = NULL, waiting_note = NULL
WHERE workspace_id = 'local-dev-workspace' AND entity_id = 'pht-overdue';
UPDATE task_details
SET status = 'todo', waiting_since = '2026-07-19T04:02:00.000Z',
    waiting_note = 'landlord counter-signature'
WHERE workspace_id = 'local-dev-workspace' AND entity_id = 'pht-blocked';
DELETE FROM entity_links
WHERE workspace_id = 'local-dev-workspace' AND source_entity_id = 'pht-blocked'
  AND type = 'task.waiting_on';

-- PROJ-05: all four health-demo projects are ACTIVE work — health is presented
-- only for `workflowStatus: "active"` Projects (ADR-037 §37.6), so without this
-- these journeys' health pills would be hidden by the new visibility rule.
INSERT OR IGNORE INTO project_details (workspace_id, entity_id, status, archived_at, updated_at)
VALUES
  ('local-dev-workspace', 'pr-atrisk', 'active', NULL, '2026-07-19T04:00:00.000Z'),
  ('local-dev-workspace', 'pr-blocked', 'active', NULL, '2026-07-19T04:00:01.000Z'),
  ('local-dev-workspace', 'pr-ontrack', 'active', NULL, '2026-07-19T04:00:02.000Z'),
  ('local-dev-workspace', 'pr-stale', 'active', NULL, '2020-01-01T00:00:00.000Z');
UPDATE project_details SET status = 'active', archived_at = NULL
WHERE workspace_id = 'local-dev-workspace'
  AND entity_id IN ('pr-atrisk', 'pr-blocked', 'pr-ontrack', 'pr-stale');

-- PROJ-04 Activity seed — a dedicated project with a REAL FND-05 Activity history so
-- the project record's Activity tab shows deterministic events end to end, plus an
-- empty project for the empty-state journey. The events are seeded directly into the
-- `activities` / `activity_subjects` tables (the one shared Activity store) with fixed
-- timestamps; they are immutable, so INSERT OR IGNORE keeps every run deterministic.
-- Over one page (default 30) of project-subject events exist, so "Load more" and a
-- second page are reachable. `pr-activity` is completed/reopened by the journey, so
-- its completion is reset below.

-- The Activity project + one real child task (the referenced entity the timeline
-- links to) + an empty project.
INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
VALUES
  ('pr-activity', 'local-dev-workspace', 'project', 'Activity showcase', '2026-07-19T06:00:00.000Z', '2026-07-19T06:50:00.000Z', NULL),
  ('pr-empty', 'local-dev-workspace', 'project', 'Quiet project', '2026-07-19T06:00:00.000Z', '2026-07-19T06:00:00.000Z', NULL);
INSERT OR IGNORE INTO spine_records (workspace_id, entity_id, kind, completed_at)
VALUES
  ('local-dev-workspace', 'pr-activity', 'project', NULL),
  ('local-dev-workspace', 'pr-empty', 'project', NULL);
INSERT OR IGNORE INTO entity_links (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
VALUES
  ('l-pract-area', 'local-dev-workspace', 'pr-activity', 'a-dh', 'project.belongs_to_area', '2026-07-19T06:00:00.000Z', '2026-07-19T06:00:00.000Z', NULL),
  ('l-prempty-area', 'local-dev-workspace', 'pr-empty', 'a-dh', 'project.belongs_to_area', '2026-07-19T06:00:00.000Z', '2026-07-19T06:00:00.000Z', NULL);

-- 30 child tasks under pr-activity (real entities so their link events resolve and
-- the newest one is a navigable referenced entity in the timeline).
INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 30)
SELECT
  'pat-' || substr('00' || n, -2),
  'local-dev-workspace', 'task',
  'Activity task ' || substr('00' || n, -2),
  printf('2026-07-19T06:%02d:00.000Z', 9 + n),
  printf('2026-07-19T06:%02d:00.000Z', 9 + n),
  NULL
FROM seq;
INSERT OR IGNORE INTO spine_records (workspace_id, entity_id, kind, completed_at)
WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 30)
SELECT 'local-dev-workspace', 'pat-' || substr('00' || n, -2), 'task', NULL FROM seq;
INSERT OR IGNORE INTO entity_links (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 30)
SELECT
  'l-pat-' || substr('00' || n, -2),
  'local-dev-workspace',
  'pat-' || substr('00' || n, -2),
  'pr-activity', 'task.belongs_to_project',
  printf('2026-07-19T06:%02d:00.000Z', 9 + n),
  printf('2026-07-19T06:%02d:00.000Z', 9 + n),
  NULL
FROM seq;

-- The project's own Activity events: creation, its structural Area link, one
-- entity_link.created per child task (project as `target`), and a rename. All name
-- pr-activity as an authorised subject, so the project Timeline surfaces them.
INSERT OR IGNORE INTO activities (id, workspace_id, type, actor_type, actor_id, occurred_at, payload_json)
VALUES
  ('a-pract-created', 'local-dev-workspace', 'entity.created', 'system', NULL, '2026-07-19T06:00:00.000Z', '{}'),
  ('a-pract-slink', 'local-dev-workspace', 'entity_link.created', 'system', NULL, '2026-07-19T06:00:01.000Z', '{}'),
  ('a-pract-rename', 'local-dev-workspace', 'entity.updated', 'system', NULL, '2026-07-19T06:50:00.000Z', '{}'),
  ('a-pract-completed', 'local-dev-workspace', 'project.completed', 'system', NULL, '2026-07-19T06:55:00.000Z', '{}');
INSERT OR IGNORE INTO activities (id, workspace_id, type, actor_type, actor_id, occurred_at, payload_json)
WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 30)
SELECT
  'a-pract-tl-' || substr('00' || n, -2),
  'local-dev-workspace', 'entity_link.created', 'system', NULL,
  printf('2026-07-19T06:%02d:00.000Z', 9 + n),
  '{}'
FROM seq;

INSERT OR IGNORE INTO activity_subjects (workspace_id, activity_id, entity_id, role)
VALUES
  ('local-dev-workspace', 'a-pract-created', 'pr-activity', 'subject'),
  ('local-dev-workspace', 'a-pract-slink', 'pr-activity', 'source'),
  ('local-dev-workspace', 'a-pract-slink', 'a-dh', 'target'),
  ('local-dev-workspace', 'a-pract-rename', 'pr-activity', 'subject'),
  ('local-dev-workspace', 'a-pract-completed', 'pr-activity', 'subject');
INSERT OR IGNORE INTO activity_subjects (workspace_id, activity_id, entity_id, role)
WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 30)
SELECT 'local-dev-workspace', 'a-pract-tl-' || substr('00' || n, -2), 'pat-' || substr('00' || n, -2), 'source' FROM seq;
INSERT OR IGNORE INTO activity_subjects (workspace_id, activity_id, entity_id, role)
WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 30)
SELECT 'local-dev-workspace', 'a-pract-tl-' || substr('00' || n, -2), 'pr-activity', 'target' FROM seq;

-- Reset the Activity seed's mutable state so every run starts from a known point.
-- Both projects are COMPLETED at rest and titled canonically: completion (not
-- updated_at recency) keeps them OUT of Today's bounded "Continue working" and the
-- default open `/projects` view, so this seed never displaces the other Projects
-- journeys. The Activity journey reopens/completes pr-activity live and ends it
-- completed again; those appended events are historical and harmless on re-runs.
UPDATE spine_records SET completed_at = '2026-07-19T07:00:00.000Z'
WHERE workspace_id = 'local-dev-workspace' AND entity_id IN ('pr-activity', 'pr-empty');
UPDATE entities SET title = 'Activity showcase'
WHERE workspace_id = 'local-dev-workspace' AND id = 'pr-activity';

-- PROJ-05 Slice 3 — a dedicated project for the Settings tab + Archived
-- collection e2e journey, isolated from the other Projects fixtures. Starts
-- Planned, directly under Area `a-dh`, with no child tasks (so it is
-- immediately eligible for archiving). The journey moves it to the Goal
-- `g-launch`, changes its workflow status, archives and restores it — all
-- reset below so every run starts from the same known point.
INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
VALUES
  ('pr-settings', 'local-dev-workspace', 'project', 'Settings journey project', '2026-07-19T08:00:00.000Z', '2026-07-19T08:00:00.000Z', NULL);
INSERT OR IGNORE INTO spine_records (workspace_id, entity_id, kind, completed_at)
VALUES
  ('local-dev-workspace', 'pr-settings', 'project', NULL);
INSERT OR IGNORE INTO entity_links (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
VALUES
  ('l-prsettings-area', 'local-dev-workspace', 'pr-settings', 'a-dh', 'project.belongs_to_area', '2026-07-19T08:00:00.000Z', '2026-07-19T08:00:00.000Z', NULL);
INSERT OR IGNORE INTO project_details (workspace_id, entity_id, status, archived_at, updated_at)
VALUES
  ('local-dev-workspace', 'pr-settings', 'planned', NULL, '2026-07-19T08:00:00.000Z');

-- Reset the journey's mutable state: status back to Planned and not archived,
-- and its structural parent restored to the Area (undoing a live move to the
-- Goal). Soft-deleting any `project.advances_goal` link the journey created and
-- re-activating the canonical `belongs_to_area` link mirrors how `move` itself
-- transitions structural parentage (FND-07/ADR-014) — never a destructive delete.
UPDATE project_details SET status = 'planned', archived_at = NULL, updated_at = '2026-07-19T08:00:00.000Z'
WHERE workspace_id = 'local-dev-workspace' AND entity_id = 'pr-settings';
UPDATE entity_links SET deleted_at = '2026-07-19T08:00:01.000Z', updated_at = '2026-07-19T08:00:01.000Z'
WHERE workspace_id = 'local-dev-workspace' AND source_entity_id = 'pr-settings'
  AND type = 'project.advances_goal' AND deleted_at IS NULL;
UPDATE entity_links SET deleted_at = NULL, updated_at = '2026-07-19T08:00:00.000Z'
WHERE workspace_id = 'local-dev-workspace' AND id = 'l-prsettings-area';

-- PROJ-05 Slice 4 — a dedicated project for the full Today-integration journey
-- (Planned → Active → appears in Today → On hold → disappears → Active → Archive →
-- disappears from Today + appears in Archived → Restore → reappears in Today because
-- restore preserves the Active workflow status). Starts Planned, directly under Area
-- `a-dh`, with no child tasks (immediately eligible for archiving). Isolated from
-- `pr-settings` (a distinct project) so the two Settings journeys never race.
INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
VALUES
  ('pr-today', 'local-dev-workspace', 'project', 'Today integration project', '2026-07-19T09:00:00.000Z', '2026-07-19T09:00:00.000Z', NULL);
INSERT OR IGNORE INTO spine_records (workspace_id, entity_id, kind, completed_at)
VALUES
  ('local-dev-workspace', 'pr-today', 'project', NULL);
INSERT OR IGNORE INTO entity_links (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
VALUES
  ('l-prtoday-area', 'local-dev-workspace', 'pr-today', 'a-dh', 'project.belongs_to_area', '2026-07-19T09:00:00.000Z', '2026-07-19T09:00:00.000Z', NULL);
INSERT OR IGNORE INTO project_details (workspace_id, entity_id, status, archived_at, updated_at)
VALUES
  ('local-dev-workspace', 'pr-today', 'planned', NULL, '2026-07-19T09:00:00.000Z');

-- Reset the journey's mutable state so every run starts Planned and not archived.
UPDATE project_details SET status = 'planned', archived_at = NULL, updated_at = '2026-07-19T09:00:00.000Z'
WHERE workspace_id = 'local-dev-workspace' AND entity_id = 'pr-today';

-- A second, untouched-by-mutation project starting Planned, used to prove a
-- restored Planned Project stays absent from Today's "Continue working" (it is
-- archived and restored directly, without ever passing through Active).
INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
VALUES
  ('pr-today-planned', 'local-dev-workspace', 'project', 'Planned project (Today absence check)', '2026-07-19T09:01:00.000Z', '2026-07-19T09:01:00.000Z', NULL);
INSERT OR IGNORE INTO spine_records (workspace_id, entity_id, kind, completed_at)
VALUES
  ('local-dev-workspace', 'pr-today-planned', 'project', NULL);
INSERT OR IGNORE INTO entity_links (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
VALUES
  ('l-prtodayplanned-area', 'local-dev-workspace', 'pr-today-planned', 'a-dh', 'project.belongs_to_area', '2026-07-19T09:01:00.000Z', '2026-07-19T09:01:00.000Z', NULL);
INSERT OR IGNORE INTO project_details (workspace_id, entity_id, status, archived_at, updated_at)
VALUES
  ('local-dev-workspace', 'pr-today-planned', 'planned', NULL, '2026-07-19T09:01:00.000Z');

UPDATE project_details SET status = 'planned', archived_at = NULL, updated_at = '2026-07-19T09:01:00.000Z'
WHERE workspace_id = 'local-dev-workspace' AND entity_id = 'pr-today-planned';

-- PROJ-05 Slice 4 — a PERMANENTLY archived project, so the Archived collection
-- (`/projects?state=archived`) and a real archived record's resting state are
-- reachable for accessibility/responsive scans without any test having to mutate
-- shared state first. Nothing ever un-archives it, so INSERT OR IGNORE plus an
-- idempotent re-assertion keeps it archived across every run.
INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
VALUES
  ('pr-archived-demo', 'local-dev-workspace', 'project', 'Archived showcase project', '2026-07-19T10:00:00.000Z', '2026-07-19T10:00:00.000Z', NULL);
INSERT OR IGNORE INTO spine_records (workspace_id, entity_id, kind, completed_at)
VALUES
  ('local-dev-workspace', 'pr-archived-demo', 'project', NULL);
INSERT OR IGNORE INTO entity_links (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
VALUES
  ('l-prarchiveddemo-area', 'local-dev-workspace', 'pr-archived-demo', 'a-dh', 'project.belongs_to_area', '2026-07-19T10:00:00.000Z', '2026-07-19T10:00:00.000Z', NULL);
INSERT OR IGNORE INTO project_details (workspace_id, entity_id, status, archived_at, updated_at)
VALUES
  ('local-dev-workspace', 'pr-archived-demo', 'active', '2026-07-19T10:00:01.000Z', '2026-07-19T10:00:01.000Z');
UPDATE project_details SET status = 'active', archived_at = '2026-07-19T10:00:01.000Z'
WHERE workspace_id = 'local-dev-workspace' AND entity_id = 'pr-archived-demo';

-- PROJ-05 Slice 4 — a project with one unfinished direct Task, permanently
-- ineligible for archiving, so the blocked-archive inline alert is reachable
-- without a test having to create and later clean up a blocking task itself.
INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
VALUES
  ('pr-archive-blocked-demo', 'local-dev-workspace', 'project', 'Archive-blocked demo project', '2026-07-19T10:01:00.000Z', '2026-07-19T10:01:00.000Z', NULL),
  ('pt-archive-blocked-demo', 'local-dev-workspace', 'task', 'Unfinished blocking task', '2026-07-19T10:01:01.000Z', '2026-07-19T10:01:01.000Z', NULL);
INSERT OR IGNORE INTO spine_records (workspace_id, entity_id, kind, completed_at)
VALUES
  ('local-dev-workspace', 'pr-archive-blocked-demo', 'project', NULL),
  ('local-dev-workspace', 'pt-archive-blocked-demo', 'task', NULL);
INSERT OR IGNORE INTO entity_links (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
VALUES
  ('l-prarchiveblockeddemo-area', 'local-dev-workspace', 'pr-archive-blocked-demo', 'a-dh', 'project.belongs_to_area', '2026-07-19T10:01:00.000Z', '2026-07-19T10:01:00.000Z', NULL),
  ('l-ptarchiveblockeddemo-proj', 'local-dev-workspace', 'pt-archive-blocked-demo', 'pr-archive-blocked-demo', 'task.belongs_to_project', '2026-07-19T10:01:01.000Z', '2026-07-19T10:01:01.000Z', NULL);
INSERT OR IGNORE INTO project_details (workspace_id, entity_id, status, archived_at, updated_at)
VALUES
  ('local-dev-workspace', 'pr-archive-blocked-demo', 'active', NULL, '2026-07-19T10:01:00.000Z');

-- Reset the blocking task's completion (nothing ever completes it deliberately,
-- but keep this deterministic in case a future journey exercises it) and keep
-- the project itself active and never archived (an archive attempt against it is
-- always rejected, so there is nothing else to reset).
UPDATE spine_records SET completed_at = NULL
WHERE workspace_id = 'local-dev-workspace' AND entity_id = 'pt-archive-blocked-demo';
UPDATE project_details SET status = 'active', archived_at = NULL
WHERE workspace_id = 'local-dev-workspace' AND entity_id = 'pr-archive-blocked-demo';

-- AREA-03 (Alignment) — a Goal whose only qualifying Task activity is
-- WALL-CLOCK-INDEPENDENT, anchored in 2020, so it reads as `neglected`
-- (outside the 14-day recent window) regardless of the run date — mirroring
-- the PROJ-02 `pr-stale`/`pht-stale` pattern above. Reached via
-- `Task -> task.belongs_to_project -> Project -> project.advances_goal ->
-- Goal`, the only indirect path the spine allows (SPINE_MODEL.md). The
-- journey itself creates a SECOND Goal live through the UI (recent activity
-- by construction) to exercise the `active` state end to end.
INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
VALUES
  ('g-align-neglected', 'local-dev-workspace', 'goal', 'Learn Spanish', '2020-01-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z', NULL),
  ('pr-align-neglected', 'local-dev-workspace', 'project', 'Spanish course', '2020-01-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z', NULL),
  ('t-align-neglected', 'local-dev-workspace', 'task', 'Finish unit 1', '2020-01-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z', NULL);
INSERT OR IGNORE INTO spine_records (workspace_id, entity_id, kind, completed_at)
VALUES
  ('local-dev-workspace', 'g-align-neglected', 'goal', NULL),
  ('local-dev-workspace', 'pr-align-neglected', 'project', NULL),
  ('local-dev-workspace', 't-align-neglected', 'task', NULL);
INSERT OR IGNORE INTO entity_links (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
VALUES
  ('l-galignneglected-area', 'local-dev-workspace', 'g-align-neglected', 'a-dh', 'goal.belongs_to_area', '2020-01-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z', NULL),
  ('l-pralignneglected-goal', 'local-dev-workspace', 'pr-align-neglected', 'g-align-neglected', 'project.advances_goal', '2020-01-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z', NULL),
  ('l-talignneglected-proj', 'local-dev-workspace', 't-align-neglected', 'pr-align-neglected', 'task.belongs_to_project', '2020-01-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z', NULL);
INSERT OR IGNORE INTO project_details (workspace_id, entity_id, status, archived_at, updated_at)
VALUES
  ('local-dev-workspace', 'pr-align-neglected', 'active', NULL, '2020-01-01T00:00:00.000Z');
UPDATE project_details SET status = 'active', archived_at = NULL
WHERE workspace_id = 'local-dev-workspace' AND entity_id = 'pr-align-neglected';
-- The Task's only qualifying (meaningful) Activity event: its own creation,
-- dated 2020-01-01 so `lastContributingActivityAt` is real and far in the
-- past — proving the neglected reason reports an ACTUAL "days ago" figure,
-- not just "never recorded".
INSERT OR IGNORE INTO activities (id, workspace_id, type, actor_type, actor_id, occurred_at, payload_json)
VALUES
  ('a-talignneglected-created', 'local-dev-workspace', 'entity.created', 'system', NULL, '2020-01-01T00:00:00.000Z', '{}');
INSERT OR IGNORE INTO activity_subjects (workspace_id, activity_id, entity_id, role)
VALUES
  ('local-dev-workspace', 'a-talignneglected-created', 't-align-neglected', 'subject');
UPDATE spine_records SET completed_at = NULL
WHERE workspace_id = 'local-dev-workspace' AND entity_id = 'g-align-neglected';

-- TASKS-01 full-journey fixture — a DEDICATED, isolated Project the `/tasks`
-- end-to-end journey creates tasks under (via the searchable parent selector) and
-- mutates freely (priority/sector/commitment/status/completion/delegation), so it
-- never disturbs the Projects roll-up/health fixtures above. Active, directly under
-- Area `a-dh`, no seeded child tasks. The journey's created tasks all use the
-- 'Journey task%' title prefix; the cleanup below removes any left by a prior run
-- (details, waiting/structural links, activity subjects, spine record, entity) so
-- every run starts from the same known point regardless of what a prior run did.
INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
VALUES
  ('pr-tasksjourney', 'local-dev-workspace', 'project', 'Tasks journey project', '2026-07-19T11:00:00.000Z', '2026-07-19T11:00:00.000Z', NULL);
INSERT OR IGNORE INTO spine_records (workspace_id, entity_id, kind, completed_at)
VALUES
  ('local-dev-workspace', 'pr-tasksjourney', 'project', NULL);
INSERT OR IGNORE INTO entity_links (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
VALUES
  ('l-prtasksjourney-area', 'local-dev-workspace', 'pr-tasksjourney', 'a-dh', 'project.belongs_to_area', '2026-07-19T11:00:00.000Z', '2026-07-19T11:00:00.000Z', NULL);
INSERT OR IGNORE INTO project_details (workspace_id, entity_id, status, archived_at, updated_at)
VALUES
  ('local-dev-workspace', 'pr-tasksjourney', 'active', NULL, '2026-07-19T11:00:00.000Z');
UPDATE project_details SET status = 'active', archived_at = NULL
WHERE workspace_id = 'local-dev-workspace' AND entity_id = 'pr-tasksjourney';

-- Remove any journey-created tasks from a prior run (child-first under ON DELETE
-- RESTRICT). Matched by their fixed 'Journey task%' title prefix.
DELETE FROM activity_subjects
WHERE workspace_id = 'local-dev-workspace'
  AND entity_id IN (
    SELECT id FROM entities
    WHERE workspace_id = 'local-dev-workspace' AND type = 'task'
      AND title LIKE 'Journey task%'
  );
DELETE FROM task_details
WHERE workspace_id = 'local-dev-workspace'
  AND entity_id IN (
    SELECT id FROM entities
    WHERE workspace_id = 'local-dev-workspace' AND type = 'task'
      AND title LIKE 'Journey task%'
  );
DELETE FROM entity_links
WHERE workspace_id = 'local-dev-workspace'
  AND source_entity_id IN (
    SELECT id FROM entities
    WHERE workspace_id = 'local-dev-workspace' AND type = 'task'
      AND title LIKE 'Journey task%'
  );
DELETE FROM spine_records
WHERE workspace_id = 'local-dev-workspace'
  AND entity_id IN (
    SELECT id FROM entities
    WHERE workspace_id = 'local-dev-workspace' AND type = 'task'
      AND title LIKE 'Journey task%'
  );
DELETE FROM entities
WHERE workspace_id = 'local-dev-workspace' AND type = 'task'
  AND title LIKE 'Journey task%';

-- ---------------------------------------------------------------------------
-- AREA-05 — dedicated Area-lifecycle fixtures (archive / restore / permanent
-- deletion). Kept separate from the shared `a-dh`/`a-health` Areas so the
-- lifecycle journeys mutate only their own records and never disturb the other
-- Areas/Goals/Projects specs. Mutable state (archival flag; the deletable Areas
-- that a run may permanently delete) is reset to a known point at the end.
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
VALUES
  ('a-e2e-archive', 'local-dev-workspace', 'area', 'Archive Lifecycle Area', '2026-07-19T05:00:00.000Z', '2026-07-19T05:00:00.000Z', NULL),
  ('a-e2e-blocked', 'local-dev-workspace', 'area', 'Blocked Delete Area', '2026-07-19T05:00:01.000Z', '2026-07-19T05:00:01.000Z', NULL),
  ('a-e2e-empty', 'local-dev-workspace', 'area', 'Empty Delete Area', '2026-07-19T05:00:02.000Z', '2026-07-19T05:00:02.000Z', NULL),
  ('a-e2e-cancel', 'local-dev-workspace', 'area', 'Cancel Delete Area', '2026-07-19T05:00:03.000Z', '2026-07-19T05:00:03.000Z', NULL),
  ('g-e2e-archive', 'local-dev-workspace', 'goal', 'Archive Area Goal', '2026-07-19T05:01:00.000Z', '2026-07-19T05:01:00.000Z', NULL),
  ('g-e2e-blocked', 'local-dev-workspace', 'goal', 'Blocking Goal', '2026-07-19T05:01:01.000Z', '2026-07-19T05:01:01.000Z', NULL);
INSERT OR IGNORE INTO spine_records (workspace_id, entity_id, kind, completed_at)
VALUES
  ('local-dev-workspace', 'a-e2e-archive', 'area', NULL),
  ('local-dev-workspace', 'a-e2e-blocked', 'area', NULL),
  ('local-dev-workspace', 'a-e2e-empty', 'area', NULL),
  ('local-dev-workspace', 'a-e2e-cancel', 'area', NULL),
  ('local-dev-workspace', 'g-e2e-archive', 'goal', NULL),
  ('local-dev-workspace', 'g-e2e-blocked', 'goal', NULL);
INSERT OR IGNORE INTO entity_links (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
VALUES
  ('l-ge2earch-area', 'local-dev-workspace', 'g-e2e-archive', 'a-e2e-archive', 'goal.belongs_to_area', '2026-07-19T05:01:00.000Z', '2026-07-19T05:01:00.000Z', NULL),
  ('l-ge2eblk-area', 'local-dev-workspace', 'g-e2e-blocked', 'a-e2e-blocked', 'goal.belongs_to_area', '2026-07-19T05:01:01.000Z', '2026-07-19T05:01:01.000Z', NULL);

-- Reset AREA-05 mutable state so every run starts deterministically. Clearing
-- `area_details` returns any Area archived by a previous run to the active state;
-- the INSERT OR IGNOREs above re-create any Area a previous run permanently
-- deleted (`a-e2e-empty`).
DELETE FROM area_details
WHERE workspace_id = 'local-dev-workspace'
  AND entity_id IN ('a-e2e-archive', 'a-e2e-blocked', 'a-e2e-empty', 'a-e2e-cancel');

-- ---------------------------------------------------------------------------
-- PX-04 — a dedicated, EMPTY Goal for the shared record-lifecycle journey.
--
-- The journey deletes it, undoes, deletes again and restores it from the
-- Deleted view, so it must own no active Projects (the spine's child guard
-- would otherwise refuse the delete, correctly). It is deliberately separate
-- from `g-launch`, which advances a real Project other specs depend on.
--
-- The reset below returns it to the ACTIVE state at the start of every run, so
-- a previous run that left it soft-deleted cannot make the next one flaky.
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
VALUES
  ('g-e2e-lifecycle', 'local-dev-workspace', 'goal', 'Lifecycle Goal', '2026-07-19T05:02:00.000Z', '2026-07-19T05:02:00.000Z', NULL);
INSERT OR IGNORE INTO spine_records (workspace_id, entity_id, kind, completed_at)
VALUES
  ('local-dev-workspace', 'g-e2e-lifecycle', 'goal', NULL);
INSERT OR IGNORE INTO entity_links (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
VALUES
  ('l-ge2elc-area', 'local-dev-workspace', 'g-e2e-lifecycle', 'a-e2e-archive', 'goal.belongs_to_area', '2026-07-19T05:02:00.000Z', '2026-07-19T05:02:00.000Z', NULL);

UPDATE entities
SET deleted_at = NULL
WHERE workspace_id = 'local-dev-workspace'
  AND id = 'g-e2e-lifecycle';

-- ---------------------------------------------------------------------------
-- MOBILE-01 — the owner's DEFAULT TASK CAPTURE PARENT (UX-01 preference).
--
-- The mobile acceptance criterion "open capture, type a title, press Enter,
-- Task created" holds only WHEN A VALID DEFAULT PARENT EXISTS — that is the
-- whole point of the UX-01 preference. Without this row the phone journey
-- would exercise the fallback (the parent picker) while claiming to prove the
-- fast path, so the seed provisions the preference explicitly against the
-- development identity the E2E run signs in as.
--
-- `a-dh` is an existing seeded Area, so the parent passes the server's
-- re-verification (an archived or missing target is refused and the picker is
-- shown instead — the behaviour the panel is designed to degrade to).
--
-- Idempotent, and the UPDATE re-asserts the columns if the row already exists
-- from a previous run that changed them through Settings.
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO owner_app_preferences (
  workspace_id, owner_id, created_at, updated_at
)
VALUES (
  'local-dev-workspace',
  'local-development-user',
  '2026-07-19T00:00:00.000Z',
  '2026-07-19T00:00:00.000Z'
);

UPDATE owner_app_preferences
SET default_task_capture_parent_id = 'a-dh',
    default_task_capture_parent_kind = 'area'
WHERE workspace_id = 'local-dev-workspace'
  AND owner_id = 'local-development-user';



-- ---------------------------------------------------------------------------
-- TASKS-03 — a realistic Tasks collection dataset (80 tasks).
--
-- The Tasks workspace is claimed to stay fast, honest about its counts and
-- correct about pagination at real volume, so the E2E suite must exercise it at
-- real volume rather than against six seeded tasks. This provisions 80 tasks
-- across two Areas and three Projects, spanning every priority (including
-- untriaged), every Time Sector (including the derived Inbox), every workflow
-- status, delegated and waiting work, Someday/Maybe, completed records, and a
-- wide spread of due and planned dates on both sides of any plausible "today".
--
-- The dimensions are assigned from INDEPENDENT deterministic streams rather than
-- from one cycling index, so priority does not correlate with parent and due
-- state does not correlate with sector. A dataset whose dimensions move together
-- would let a combined filter pass for the wrong reason — every combination this
-- file is used to test genuinely has records on both sides of it.
--
-- Titles are prefixed `Dataset task ` and numbered, so a spec can assert on a
-- stable record without depending on the ordering of the rest. The generated
-- values are fixed literals here, so the file is reproducible and reviewable.
--
-- Idempotent (`INSERT OR IGNORE`), local-only, and additive: it touches no
-- record any other spec depends on.
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
VALUES
  ('a-tk-ops', 'local-dev-workspace', 'area', 'Operations', '2026-07-19T06:00:00.000Z', '2026-07-19T06:00:00.000Z', NULL),
  ('a-tk-life', 'local-dev-workspace', 'area', 'Personal', '2026-07-19T06:00:00.000Z', '2026-07-19T06:00:00.000Z', NULL),
  ('p-tk-alpha', 'local-dev-workspace', 'project', 'Task Dataset Alpha', '2026-07-19T06:00:01.000Z', '2026-07-19T06:00:01.000Z', NULL),
  ('p-tk-beta', 'local-dev-workspace', 'project', 'Task Dataset Beta', '2026-07-19T06:00:01.000Z', '2026-07-19T06:00:01.000Z', NULL),
  ('p-tk-gamma', 'local-dev-workspace', 'project', 'Task Dataset Gamma', '2026-07-19T06:00:01.000Z', '2026-07-19T06:00:01.000Z', NULL);

INSERT OR IGNORE INTO spine_records (workspace_id, entity_id, kind, completed_at)
VALUES
  ('local-dev-workspace', 'a-tk-ops', 'area', NULL),
  ('local-dev-workspace', 'a-tk-life', 'area', NULL),
  ('local-dev-workspace', 'p-tk-alpha', 'project', NULL),
  ('local-dev-workspace', 'p-tk-beta', 'project', NULL),
  ('local-dev-workspace', 'p-tk-gamma', 'project', NULL);

INSERT OR IGNORE INTO entity_links (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
VALUES
  ('l-p-tk-alpha-area', 'local-dev-workspace', 'p-tk-alpha', 'a-tk-ops', 'project.belongs_to_area', '2026-07-19T06:00:01.000Z', '2026-07-19T06:00:01.000Z', NULL),
  ('l-p-tk-beta-area', 'local-dev-workspace', 'p-tk-beta', 'a-tk-ops', 'project.belongs_to_area', '2026-07-19T06:00:01.000Z', '2026-07-19T06:00:01.000Z', NULL),
  ('l-p-tk-gamma-area', 'local-dev-workspace', 'p-tk-gamma', 'a-tk-life', 'project.belongs_to_area', '2026-07-19T06:00:01.000Z', '2026-07-19T06:00:01.000Z', NULL);

INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
VALUES
  ('t-ds-00', 'local-dev-workspace', 'task', 'Dataset task 00', '2026-07-19T07:00:00.000Z', '2026-07-19T07:00:00.000Z', NULL),
  ('t-ds-01', 'local-dev-workspace', 'task', 'Dataset task 01', '2026-07-19T07:00:01.000Z', '2026-07-19T07:00:01.000Z', NULL),
  ('t-ds-02', 'local-dev-workspace', 'task', 'Dataset task 02', '2026-07-19T07:00:02.000Z', '2026-07-19T07:00:02.000Z', NULL),
  ('t-ds-03', 'local-dev-workspace', 'task', 'Dataset task 03', '2026-07-19T07:00:03.000Z', '2026-07-19T07:00:03.000Z', NULL),
  ('t-ds-04', 'local-dev-workspace', 'task', 'Dataset task 04', '2026-07-19T07:00:04.000Z', '2026-07-19T07:00:04.000Z', NULL),
  ('t-ds-05', 'local-dev-workspace', 'task', 'Dataset task 05', '2026-07-19T07:00:05.000Z', '2026-07-19T07:00:05.000Z', NULL),
  ('t-ds-06', 'local-dev-workspace', 'task', 'Dataset task 06', '2026-07-19T07:00:06.000Z', '2026-07-19T07:00:06.000Z', NULL),
  ('t-ds-07', 'local-dev-workspace', 'task', 'Dataset task 07', '2026-07-19T07:00:07.000Z', '2026-07-19T07:00:07.000Z', NULL),
  ('t-ds-08', 'local-dev-workspace', 'task', 'Dataset task 08', '2026-07-19T07:00:08.000Z', '2026-07-19T07:00:08.000Z', NULL),
  ('t-ds-09', 'local-dev-workspace', 'task', 'Dataset task 09', '2026-07-19T07:00:09.000Z', '2026-07-19T07:00:09.000Z', NULL),
  ('t-ds-10', 'local-dev-workspace', 'task', 'Dataset task 10', '2026-07-19T07:00:10.000Z', '2026-07-19T07:00:10.000Z', NULL),
  ('t-ds-11', 'local-dev-workspace', 'task', 'Dataset task 11', '2026-07-19T07:00:11.000Z', '2026-07-19T07:00:11.000Z', NULL),
  ('t-ds-12', 'local-dev-workspace', 'task', 'Dataset task 12', '2026-07-19T07:00:12.000Z', '2026-07-19T07:00:12.000Z', NULL),
  ('t-ds-13', 'local-dev-workspace', 'task', 'Dataset task 13', '2026-07-19T07:00:13.000Z', '2026-07-19T07:00:13.000Z', NULL),
  ('t-ds-14', 'local-dev-workspace', 'task', 'Dataset task 14', '2026-07-19T07:00:14.000Z', '2026-07-19T07:00:14.000Z', NULL),
  ('t-ds-15', 'local-dev-workspace', 'task', 'Dataset task 15', '2026-07-19T07:00:15.000Z', '2026-07-19T07:00:15.000Z', NULL),
  ('t-ds-16', 'local-dev-workspace', 'task', 'Dataset task 16', '2026-07-19T07:00:16.000Z', '2026-07-19T07:00:16.000Z', NULL),
  ('t-ds-17', 'local-dev-workspace', 'task', 'Dataset task 17', '2026-07-19T07:00:17.000Z', '2026-07-19T07:00:17.000Z', NULL),
  ('t-ds-18', 'local-dev-workspace', 'task', 'Dataset task 18', '2026-07-19T07:00:18.000Z', '2026-07-19T07:00:18.000Z', NULL),
  ('t-ds-19', 'local-dev-workspace', 'task', 'Dataset task 19', '2026-07-19T07:00:19.000Z', '2026-07-19T07:00:19.000Z', NULL),
  ('t-ds-20', 'local-dev-workspace', 'task', 'Dataset task 20', '2026-07-19T07:00:20.000Z', '2026-07-19T07:00:20.000Z', NULL),
  ('t-ds-21', 'local-dev-workspace', 'task', 'Dataset task 21', '2026-07-19T07:00:21.000Z', '2026-07-19T07:00:21.000Z', NULL),
  ('t-ds-22', 'local-dev-workspace', 'task', 'Dataset task 22', '2026-07-19T07:00:22.000Z', '2026-07-19T07:00:22.000Z', NULL),
  ('t-ds-23', 'local-dev-workspace', 'task', 'Dataset task 23', '2026-07-19T07:00:23.000Z', '2026-07-19T07:00:23.000Z', NULL),
  ('t-ds-24', 'local-dev-workspace', 'task', 'Dataset task 24', '2026-07-19T07:00:24.000Z', '2026-07-19T07:00:24.000Z', NULL),
  ('t-ds-25', 'local-dev-workspace', 'task', 'Dataset task 25', '2026-07-19T07:00:25.000Z', '2026-07-19T07:00:25.000Z', NULL),
  ('t-ds-26', 'local-dev-workspace', 'task', 'Dataset task 26', '2026-07-19T07:00:26.000Z', '2026-07-19T07:00:26.000Z', NULL),
  ('t-ds-27', 'local-dev-workspace', 'task', 'Dataset task 27', '2026-07-19T07:00:27.000Z', '2026-07-19T07:00:27.000Z', NULL),
  ('t-ds-28', 'local-dev-workspace', 'task', 'Dataset task 28', '2026-07-19T07:00:28.000Z', '2026-07-19T07:00:28.000Z', NULL),
  ('t-ds-29', 'local-dev-workspace', 'task', 'Dataset task 29', '2026-07-19T07:00:29.000Z', '2026-07-19T07:00:29.000Z', NULL),
  ('t-ds-30', 'local-dev-workspace', 'task', 'Dataset task 30', '2026-07-19T07:00:30.000Z', '2026-07-19T07:00:30.000Z', NULL),
  ('t-ds-31', 'local-dev-workspace', 'task', 'Dataset task 31', '2026-07-19T07:00:31.000Z', '2026-07-19T07:00:31.000Z', NULL),
  ('t-ds-32', 'local-dev-workspace', 'task', 'Dataset task 32', '2026-07-19T07:00:32.000Z', '2026-07-19T07:00:32.000Z', NULL),
  ('t-ds-33', 'local-dev-workspace', 'task', 'Dataset task 33', '2026-07-19T07:00:33.000Z', '2026-07-19T07:00:33.000Z', NULL),
  ('t-ds-34', 'local-dev-workspace', 'task', 'Dataset task 34', '2026-07-19T07:00:34.000Z', '2026-07-19T07:00:34.000Z', NULL),
  ('t-ds-35', 'local-dev-workspace', 'task', 'Dataset task 35', '2026-07-19T07:00:35.000Z', '2026-07-19T07:00:35.000Z', NULL),
  ('t-ds-36', 'local-dev-workspace', 'task', 'Dataset task 36', '2026-07-19T07:00:36.000Z', '2026-07-19T07:00:36.000Z', NULL),
  ('t-ds-37', 'local-dev-workspace', 'task', 'Dataset task 37', '2026-07-19T07:00:37.000Z', '2026-07-19T07:00:37.000Z', NULL),
  ('t-ds-38', 'local-dev-workspace', 'task', 'Dataset task 38', '2026-07-19T07:00:38.000Z', '2026-07-19T07:00:38.000Z', NULL),
  ('t-ds-39', 'local-dev-workspace', 'task', 'Dataset task 39', '2026-07-19T07:00:39.000Z', '2026-07-19T07:00:39.000Z', NULL),
  ('t-ds-40', 'local-dev-workspace', 'task', 'Dataset task 40', '2026-07-19T07:00:40.000Z', '2026-07-19T07:00:40.000Z', NULL),
  ('t-ds-41', 'local-dev-workspace', 'task', 'Dataset task 41', '2026-07-19T07:00:41.000Z', '2026-07-19T07:00:41.000Z', NULL),
  ('t-ds-42', 'local-dev-workspace', 'task', 'Dataset task 42', '2026-07-19T07:00:42.000Z', '2026-07-19T07:00:42.000Z', NULL),
  ('t-ds-43', 'local-dev-workspace', 'task', 'Dataset task 43', '2026-07-19T07:00:43.000Z', '2026-07-19T07:00:43.000Z', NULL),
  ('t-ds-44', 'local-dev-workspace', 'task', 'Dataset task 44', '2026-07-19T07:00:44.000Z', '2026-07-19T07:00:44.000Z', NULL),
  ('t-ds-45', 'local-dev-workspace', 'task', 'Dataset task 45', '2026-07-19T07:00:45.000Z', '2026-07-19T07:00:45.000Z', NULL),
  ('t-ds-46', 'local-dev-workspace', 'task', 'Dataset task 46', '2026-07-19T07:00:46.000Z', '2026-07-19T07:00:46.000Z', NULL),
  ('t-ds-47', 'local-dev-workspace', 'task', 'Dataset task 47', '2026-07-19T07:00:47.000Z', '2026-07-19T07:00:47.000Z', NULL),
  ('t-ds-48', 'local-dev-workspace', 'task', 'Dataset task 48', '2026-07-19T07:00:48.000Z', '2026-07-19T07:00:48.000Z', NULL),
  ('t-ds-49', 'local-dev-workspace', 'task', 'Dataset task 49', '2026-07-19T07:00:49.000Z', '2026-07-19T07:00:49.000Z', NULL),
  ('t-ds-50', 'local-dev-workspace', 'task', 'Dataset task 50', '2026-07-19T07:00:50.000Z', '2026-07-19T07:00:50.000Z', NULL),
  ('t-ds-51', 'local-dev-workspace', 'task', 'Dataset task 51', '2026-07-19T07:00:51.000Z', '2026-07-19T07:00:51.000Z', NULL),
  ('t-ds-52', 'local-dev-workspace', 'task', 'Dataset task 52', '2026-07-19T07:00:52.000Z', '2026-07-19T07:00:52.000Z', NULL),
  ('t-ds-53', 'local-dev-workspace', 'task', 'Dataset task 53', '2026-07-19T07:00:53.000Z', '2026-07-19T07:00:53.000Z', NULL),
  ('t-ds-54', 'local-dev-workspace', 'task', 'Dataset task 54', '2026-07-19T07:00:54.000Z', '2026-07-19T07:00:54.000Z', NULL),
  ('t-ds-55', 'local-dev-workspace', 'task', 'Dataset task 55', '2026-07-19T07:00:55.000Z', '2026-07-19T07:00:55.000Z', NULL),
  ('t-ds-56', 'local-dev-workspace', 'task', 'Dataset task 56', '2026-07-19T07:00:56.000Z', '2026-07-19T07:00:56.000Z', NULL),
  ('t-ds-57', 'local-dev-workspace', 'task', 'Dataset task 57', '2026-07-19T07:00:57.000Z', '2026-07-19T07:00:57.000Z', NULL),
  ('t-ds-58', 'local-dev-workspace', 'task', 'Dataset task 58', '2026-07-19T07:00:58.000Z', '2026-07-19T07:00:58.000Z', NULL),
  ('t-ds-59', 'local-dev-workspace', 'task', 'Dataset task 59', '2026-07-19T07:00:59.000Z', '2026-07-19T07:00:59.000Z', NULL),
  ('t-ds-60', 'local-dev-workspace', 'task', 'Dataset task 60', '2026-07-19T07:01:00.000Z', '2026-07-19T07:01:00.000Z', NULL),
  ('t-ds-61', 'local-dev-workspace', 'task', 'Dataset task 61', '2026-07-19T07:01:01.000Z', '2026-07-19T07:01:01.000Z', NULL),
  ('t-ds-62', 'local-dev-workspace', 'task', 'Dataset task 62', '2026-07-19T07:01:02.000Z', '2026-07-19T07:01:02.000Z', NULL),
  ('t-ds-63', 'local-dev-workspace', 'task', 'Dataset task 63', '2026-07-19T07:01:03.000Z', '2026-07-19T07:01:03.000Z', NULL),
  ('t-ds-64', 'local-dev-workspace', 'task', 'Dataset task 64', '2026-07-19T07:01:04.000Z', '2026-07-19T07:01:04.000Z', NULL),
  ('t-ds-65', 'local-dev-workspace', 'task', 'Dataset task 65', '2026-07-19T07:01:05.000Z', '2026-07-19T07:01:05.000Z', NULL),
  ('t-ds-66', 'local-dev-workspace', 'task', 'Dataset task 66', '2026-07-19T07:01:06.000Z', '2026-07-19T07:01:06.000Z', NULL),
  ('t-ds-67', 'local-dev-workspace', 'task', 'Dataset task 67', '2026-07-19T07:01:07.000Z', '2026-07-19T07:01:07.000Z', NULL),
  ('t-ds-68', 'local-dev-workspace', 'task', 'Dataset task 68', '2026-07-19T07:01:08.000Z', '2026-07-19T07:01:08.000Z', NULL),
  ('t-ds-69', 'local-dev-workspace', 'task', 'Dataset task 69', '2026-07-19T07:01:09.000Z', '2026-07-19T07:01:09.000Z', NULL),
  ('t-ds-70', 'local-dev-workspace', 'task', 'Dataset task 70', '2026-07-19T07:01:10.000Z', '2026-07-19T07:01:10.000Z', NULL),
  ('t-ds-71', 'local-dev-workspace', 'task', 'Dataset task 71', '2026-07-19T07:01:11.000Z', '2026-07-19T07:01:11.000Z', NULL),
  ('t-ds-72', 'local-dev-workspace', 'task', 'Dataset task 72', '2026-07-19T07:01:12.000Z', '2026-07-19T07:01:12.000Z', NULL),
  ('t-ds-73', 'local-dev-workspace', 'task', 'Dataset task 73', '2026-07-19T07:01:13.000Z', '2026-07-19T07:01:13.000Z', NULL),
  ('t-ds-74', 'local-dev-workspace', 'task', 'Dataset task 74', '2026-07-19T07:01:14.000Z', '2026-07-19T07:01:14.000Z', NULL),
  ('t-ds-75', 'local-dev-workspace', 'task', 'Dataset task 75', '2026-07-19T07:01:15.000Z', '2026-07-19T07:01:15.000Z', NULL),
  ('t-ds-76', 'local-dev-workspace', 'task', 'Dataset task 76', '2026-07-19T07:01:16.000Z', '2026-07-19T07:01:16.000Z', NULL),
  ('t-ds-77', 'local-dev-workspace', 'task', 'Dataset task 77', '2026-07-19T07:01:17.000Z', '2026-07-19T07:01:17.000Z', NULL),
  ('t-ds-78', 'local-dev-workspace', 'task', 'Dataset task 78', '2026-07-19T07:01:18.000Z', '2026-07-19T07:01:18.000Z', NULL),
  ('t-ds-79', 'local-dev-workspace', 'task', 'Dataset task 79', '2026-07-19T07:01:19.000Z', '2026-07-19T07:01:19.000Z', NULL);

INSERT OR IGNORE INTO spine_records (workspace_id, entity_id, kind, completed_at)
VALUES
  ('local-dev-workspace', 't-ds-00', 'task', NULL),
  ('local-dev-workspace', 't-ds-01', 'task', NULL),
  ('local-dev-workspace', 't-ds-02', 'task', NULL),
  ('local-dev-workspace', 't-ds-03', 'task', NULL),
  ('local-dev-workspace', 't-ds-04', 'task', '2026-07-24T09:00:00.000Z'),
  ('local-dev-workspace', 't-ds-05', 'task', NULL),
  ('local-dev-workspace', 't-ds-06', 'task', NULL),
  ('local-dev-workspace', 't-ds-07', 'task', NULL),
  ('local-dev-workspace', 't-ds-08', 'task', NULL),
  ('local-dev-workspace', 't-ds-09', 'task', NULL),
  ('local-dev-workspace', 't-ds-10', 'task', NULL),
  ('local-dev-workspace', 't-ds-11', 'task', NULL),
  ('local-dev-workspace', 't-ds-12', 'task', NULL),
  ('local-dev-workspace', 't-ds-13', 'task', '2026-07-23T09:00:00.000Z'),
  ('local-dev-workspace', 't-ds-14', 'task', NULL),
  ('local-dev-workspace', 't-ds-15', 'task', NULL),
  ('local-dev-workspace', 't-ds-16', 'task', NULL),
  ('local-dev-workspace', 't-ds-17', 'task', NULL),
  ('local-dev-workspace', 't-ds-18', 'task', NULL),
  ('local-dev-workspace', 't-ds-19', 'task', NULL),
  ('local-dev-workspace', 't-ds-20', 'task', NULL),
  ('local-dev-workspace', 't-ds-21', 'task', NULL),
  ('local-dev-workspace', 't-ds-22', 'task', '2026-07-22T09:00:00.000Z'),
  ('local-dev-workspace', 't-ds-23', 'task', NULL),
  ('local-dev-workspace', 't-ds-24', 'task', NULL),
  ('local-dev-workspace', 't-ds-25', 'task', NULL),
  ('local-dev-workspace', 't-ds-26', 'task', NULL),
  ('local-dev-workspace', 't-ds-27', 'task', NULL),
  ('local-dev-workspace', 't-ds-28', 'task', NULL),
  ('local-dev-workspace', 't-ds-29', 'task', NULL),
  ('local-dev-workspace', 't-ds-30', 'task', NULL),
  ('local-dev-workspace', 't-ds-31', 'task', '2026-07-21T09:00:00.000Z'),
  ('local-dev-workspace', 't-ds-32', 'task', NULL),
  ('local-dev-workspace', 't-ds-33', 'task', NULL),
  ('local-dev-workspace', 't-ds-34', 'task', NULL),
  ('local-dev-workspace', 't-ds-35', 'task', NULL),
  ('local-dev-workspace', 't-ds-36', 'task', NULL),
  ('local-dev-workspace', 't-ds-37', 'task', NULL),
  ('local-dev-workspace', 't-ds-38', 'task', NULL),
  ('local-dev-workspace', 't-ds-39', 'task', NULL),
  ('local-dev-workspace', 't-ds-40', 'task', '2026-07-20T09:00:00.000Z'),
  ('local-dev-workspace', 't-ds-41', 'task', NULL),
  ('local-dev-workspace', 't-ds-42', 'task', NULL),
  ('local-dev-workspace', 't-ds-43', 'task', NULL),
  ('local-dev-workspace', 't-ds-44', 'task', NULL),
  ('local-dev-workspace', 't-ds-45', 'task', NULL),
  ('local-dev-workspace', 't-ds-46', 'task', NULL),
  ('local-dev-workspace', 't-ds-47', 'task', NULL),
  ('local-dev-workspace', 't-ds-48', 'task', NULL),
  ('local-dev-workspace', 't-ds-49', 'task', '2026-07-24T09:00:00.000Z'),
  ('local-dev-workspace', 't-ds-50', 'task', NULL),
  ('local-dev-workspace', 't-ds-51', 'task', NULL),
  ('local-dev-workspace', 't-ds-52', 'task', NULL),
  ('local-dev-workspace', 't-ds-53', 'task', NULL),
  ('local-dev-workspace', 't-ds-54', 'task', NULL),
  ('local-dev-workspace', 't-ds-55', 'task', NULL),
  ('local-dev-workspace', 't-ds-56', 'task', NULL),
  ('local-dev-workspace', 't-ds-57', 'task', NULL),
  ('local-dev-workspace', 't-ds-58', 'task', '2026-07-23T09:00:00.000Z'),
  ('local-dev-workspace', 't-ds-59', 'task', NULL),
  ('local-dev-workspace', 't-ds-60', 'task', NULL),
  ('local-dev-workspace', 't-ds-61', 'task', NULL),
  ('local-dev-workspace', 't-ds-62', 'task', NULL),
  ('local-dev-workspace', 't-ds-63', 'task', NULL),
  ('local-dev-workspace', 't-ds-64', 'task', NULL),
  ('local-dev-workspace', 't-ds-65', 'task', NULL),
  ('local-dev-workspace', 't-ds-66', 'task', NULL),
  ('local-dev-workspace', 't-ds-67', 'task', '2026-07-22T09:00:00.000Z'),
  ('local-dev-workspace', 't-ds-68', 'task', NULL),
  ('local-dev-workspace', 't-ds-69', 'task', NULL),
  ('local-dev-workspace', 't-ds-70', 'task', NULL),
  ('local-dev-workspace', 't-ds-71', 'task', NULL),
  ('local-dev-workspace', 't-ds-72', 'task', NULL),
  ('local-dev-workspace', 't-ds-73', 'task', NULL),
  ('local-dev-workspace', 't-ds-74', 'task', NULL),
  ('local-dev-workspace', 't-ds-75', 'task', NULL),
  ('local-dev-workspace', 't-ds-76', 'task', '2026-07-21T09:00:00.000Z'),
  ('local-dev-workspace', 't-ds-77', 'task', NULL),
  ('local-dev-workspace', 't-ds-78', 'task', NULL),
  ('local-dev-workspace', 't-ds-79', 'task', NULL);

INSERT OR IGNORE INTO entity_links (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
VALUES
  ('l-t-ds-00', 'local-dev-workspace', 't-ds-00', 'a-tk-ops', 'task.belongs_to_area', '2026-07-19T07:00:00.000Z', '2026-07-19T07:00:00.000Z', NULL),
  ('l-t-ds-01', 'local-dev-workspace', 't-ds-01', 'a-tk-ops', 'task.belongs_to_area', '2026-07-19T07:00:01.000Z', '2026-07-19T07:00:01.000Z', NULL),
  ('l-t-ds-02', 'local-dev-workspace', 't-ds-02', 'p-tk-gamma', 'task.belongs_to_project', '2026-07-19T07:00:02.000Z', '2026-07-19T07:00:02.000Z', NULL),
  ('l-t-ds-03', 'local-dev-workspace', 't-ds-03', 'p-tk-gamma', 'task.belongs_to_project', '2026-07-19T07:00:03.000Z', '2026-07-19T07:00:03.000Z', NULL),
  ('l-t-ds-04', 'local-dev-workspace', 't-ds-04', 'p-tk-alpha', 'task.belongs_to_project', '2026-07-19T07:00:04.000Z', '2026-07-19T07:00:04.000Z', NULL),
  ('l-t-ds-05', 'local-dev-workspace', 't-ds-05', 'a-tk-life', 'task.belongs_to_area', '2026-07-19T07:00:05.000Z', '2026-07-19T07:00:05.000Z', NULL),
  ('l-t-ds-06', 'local-dev-workspace', 't-ds-06', 'a-tk-life', 'task.belongs_to_area', '2026-07-19T07:00:06.000Z', '2026-07-19T07:00:06.000Z', NULL),
  ('l-t-ds-07', 'local-dev-workspace', 't-ds-07', 'p-tk-alpha', 'task.belongs_to_project', '2026-07-19T07:00:07.000Z', '2026-07-19T07:00:07.000Z', NULL),
  ('l-t-ds-08', 'local-dev-workspace', 't-ds-08', 'p-tk-beta', 'task.belongs_to_project', '2026-07-19T07:00:08.000Z', '2026-07-19T07:00:08.000Z', NULL),
  ('l-t-ds-09', 'local-dev-workspace', 't-ds-09', 'p-tk-beta', 'task.belongs_to_project', '2026-07-19T07:00:09.000Z', '2026-07-19T07:00:09.000Z', NULL),
  ('l-t-ds-10', 'local-dev-workspace', 't-ds-10', 'p-tk-alpha', 'task.belongs_to_project', '2026-07-19T07:00:10.000Z', '2026-07-19T07:00:10.000Z', NULL),
  ('l-t-ds-11', 'local-dev-workspace', 't-ds-11', 'p-tk-beta', 'task.belongs_to_project', '2026-07-19T07:00:11.000Z', '2026-07-19T07:00:11.000Z', NULL),
  ('l-t-ds-12', 'local-dev-workspace', 't-ds-12', 'p-tk-beta', 'task.belongs_to_project', '2026-07-19T07:00:12.000Z', '2026-07-19T07:00:12.000Z', NULL),
  ('l-t-ds-13', 'local-dev-workspace', 't-ds-13', 'p-tk-beta', 'task.belongs_to_project', '2026-07-19T07:00:13.000Z', '2026-07-19T07:00:13.000Z', NULL),
  ('l-t-ds-14', 'local-dev-workspace', 't-ds-14', 'a-tk-life', 'task.belongs_to_area', '2026-07-19T07:00:14.000Z', '2026-07-19T07:00:14.000Z', NULL),
  ('l-t-ds-15', 'local-dev-workspace', 't-ds-15', 'a-tk-ops', 'task.belongs_to_area', '2026-07-19T07:00:15.000Z', '2026-07-19T07:00:15.000Z', NULL),
  ('l-t-ds-16', 'local-dev-workspace', 't-ds-16', 'p-tk-alpha', 'task.belongs_to_project', '2026-07-19T07:00:16.000Z', '2026-07-19T07:00:16.000Z', NULL),
  ('l-t-ds-17', 'local-dev-workspace', 't-ds-17', 'p-tk-alpha', 'task.belongs_to_project', '2026-07-19T07:00:17.000Z', '2026-07-19T07:00:17.000Z', NULL),
  ('l-t-ds-18', 'local-dev-workspace', 't-ds-18', 'p-tk-beta', 'task.belongs_to_project', '2026-07-19T07:00:18.000Z', '2026-07-19T07:00:18.000Z', NULL),
  ('l-t-ds-19', 'local-dev-workspace', 't-ds-19', 'a-tk-ops', 'task.belongs_to_area', '2026-07-19T07:00:19.000Z', '2026-07-19T07:00:19.000Z', NULL),
  ('l-t-ds-20', 'local-dev-workspace', 't-ds-20', 'a-tk-life', 'task.belongs_to_area', '2026-07-19T07:00:20.000Z', '2026-07-19T07:00:20.000Z', NULL),
  ('l-t-ds-21', 'local-dev-workspace', 't-ds-21', 'p-tk-beta', 'task.belongs_to_project', '2026-07-19T07:00:21.000Z', '2026-07-19T07:00:21.000Z', NULL),
  ('l-t-ds-22', 'local-dev-workspace', 't-ds-22', 'a-tk-ops', 'task.belongs_to_area', '2026-07-19T07:00:22.000Z', '2026-07-19T07:00:22.000Z', NULL),
  ('l-t-ds-23', 'local-dev-workspace', 't-ds-23', 'p-tk-beta', 'task.belongs_to_project', '2026-07-19T07:00:23.000Z', '2026-07-19T07:00:23.000Z', NULL),
  ('l-t-ds-24', 'local-dev-workspace', 't-ds-24', 'a-tk-life', 'task.belongs_to_area', '2026-07-19T07:00:24.000Z', '2026-07-19T07:00:24.000Z', NULL),
  ('l-t-ds-25', 'local-dev-workspace', 't-ds-25', 'p-tk-alpha', 'task.belongs_to_project', '2026-07-19T07:00:25.000Z', '2026-07-19T07:00:25.000Z', NULL),
  ('l-t-ds-26', 'local-dev-workspace', 't-ds-26', 'a-tk-life', 'task.belongs_to_area', '2026-07-19T07:00:26.000Z', '2026-07-19T07:00:26.000Z', NULL),
  ('l-t-ds-27', 'local-dev-workspace', 't-ds-27', 'a-tk-ops', 'task.belongs_to_area', '2026-07-19T07:00:27.000Z', '2026-07-19T07:00:27.000Z', NULL),
  ('l-t-ds-28', 'local-dev-workspace', 't-ds-28', 'p-tk-gamma', 'task.belongs_to_project', '2026-07-19T07:00:28.000Z', '2026-07-19T07:00:28.000Z', NULL),
  ('l-t-ds-29', 'local-dev-workspace', 't-ds-29', 'p-tk-alpha', 'task.belongs_to_project', '2026-07-19T07:00:29.000Z', '2026-07-19T07:00:29.000Z', NULL),
  ('l-t-ds-30', 'local-dev-workspace', 't-ds-30', 'p-tk-alpha', 'task.belongs_to_project', '2026-07-19T07:00:30.000Z', '2026-07-19T07:00:30.000Z', NULL),
  ('l-t-ds-31', 'local-dev-workspace', 't-ds-31', 'p-tk-beta', 'task.belongs_to_project', '2026-07-19T07:00:31.000Z', '2026-07-19T07:00:31.000Z', NULL),
  ('l-t-ds-32', 'local-dev-workspace', 't-ds-32', 'a-tk-ops', 'task.belongs_to_area', '2026-07-19T07:00:32.000Z', '2026-07-19T07:00:32.000Z', NULL),
  ('l-t-ds-33', 'local-dev-workspace', 't-ds-33', 'p-tk-alpha', 'task.belongs_to_project', '2026-07-19T07:00:33.000Z', '2026-07-19T07:00:33.000Z', NULL),
  ('l-t-ds-34', 'local-dev-workspace', 't-ds-34', 'a-tk-ops', 'task.belongs_to_area', '2026-07-19T07:00:34.000Z', '2026-07-19T07:00:34.000Z', NULL),
  ('l-t-ds-35', 'local-dev-workspace', 't-ds-35', 'a-tk-ops', 'task.belongs_to_area', '2026-07-19T07:00:35.000Z', '2026-07-19T07:00:35.000Z', NULL),
  ('l-t-ds-36', 'local-dev-workspace', 't-ds-36', 'a-tk-ops', 'task.belongs_to_area', '2026-07-19T07:00:36.000Z', '2026-07-19T07:00:36.000Z', NULL),
  ('l-t-ds-37', 'local-dev-workspace', 't-ds-37', 'p-tk-alpha', 'task.belongs_to_project', '2026-07-19T07:00:37.000Z', '2026-07-19T07:00:37.000Z', NULL),
  ('l-t-ds-38', 'local-dev-workspace', 't-ds-38', 'p-tk-gamma', 'task.belongs_to_project', '2026-07-19T07:00:38.000Z', '2026-07-19T07:00:38.000Z', NULL),
  ('l-t-ds-39', 'local-dev-workspace', 't-ds-39', 'p-tk-gamma', 'task.belongs_to_project', '2026-07-19T07:00:39.000Z', '2026-07-19T07:00:39.000Z', NULL),
  ('l-t-ds-40', 'local-dev-workspace', 't-ds-40', 'a-tk-ops', 'task.belongs_to_area', '2026-07-19T07:00:40.000Z', '2026-07-19T07:00:40.000Z', NULL),
  ('l-t-ds-41', 'local-dev-workspace', 't-ds-41', 'p-tk-beta', 'task.belongs_to_project', '2026-07-19T07:00:41.000Z', '2026-07-19T07:00:41.000Z', NULL),
  ('l-t-ds-42', 'local-dev-workspace', 't-ds-42', 'a-tk-life', 'task.belongs_to_area', '2026-07-19T07:00:42.000Z', '2026-07-19T07:00:42.000Z', NULL),
  ('l-t-ds-43', 'local-dev-workspace', 't-ds-43', 'p-tk-gamma', 'task.belongs_to_project', '2026-07-19T07:00:43.000Z', '2026-07-19T07:00:43.000Z', NULL),
  ('l-t-ds-44', 'local-dev-workspace', 't-ds-44', 'a-tk-ops', 'task.belongs_to_area', '2026-07-19T07:00:44.000Z', '2026-07-19T07:00:44.000Z', NULL),
  ('l-t-ds-45', 'local-dev-workspace', 't-ds-45', 'p-tk-alpha', 'task.belongs_to_project', '2026-07-19T07:00:45.000Z', '2026-07-19T07:00:45.000Z', NULL),
  ('l-t-ds-46', 'local-dev-workspace', 't-ds-46', 'p-tk-gamma', 'task.belongs_to_project', '2026-07-19T07:00:46.000Z', '2026-07-19T07:00:46.000Z', NULL),
  ('l-t-ds-47', 'local-dev-workspace', 't-ds-47', 'a-tk-life', 'task.belongs_to_area', '2026-07-19T07:00:47.000Z', '2026-07-19T07:00:47.000Z', NULL),
  ('l-t-ds-48', 'local-dev-workspace', 't-ds-48', 'a-tk-ops', 'task.belongs_to_area', '2026-07-19T07:00:48.000Z', '2026-07-19T07:00:48.000Z', NULL),
  ('l-t-ds-49', 'local-dev-workspace', 't-ds-49', 'p-tk-gamma', 'task.belongs_to_project', '2026-07-19T07:00:49.000Z', '2026-07-19T07:00:49.000Z', NULL),
  ('l-t-ds-50', 'local-dev-workspace', 't-ds-50', 'p-tk-gamma', 'task.belongs_to_project', '2026-07-19T07:00:50.000Z', '2026-07-19T07:00:50.000Z', NULL),
  ('l-t-ds-51', 'local-dev-workspace', 't-ds-51', 'p-tk-gamma', 'task.belongs_to_project', '2026-07-19T07:00:51.000Z', '2026-07-19T07:00:51.000Z', NULL),
  ('l-t-ds-52', 'local-dev-workspace', 't-ds-52', 'a-tk-life', 'task.belongs_to_area', '2026-07-19T07:00:52.000Z', '2026-07-19T07:00:52.000Z', NULL),
  ('l-t-ds-53', 'local-dev-workspace', 't-ds-53', 'a-tk-life', 'task.belongs_to_area', '2026-07-19T07:00:53.000Z', '2026-07-19T07:00:53.000Z', NULL),
  ('l-t-ds-54', 'local-dev-workspace', 't-ds-54', 'p-tk-alpha', 'task.belongs_to_project', '2026-07-19T07:00:54.000Z', '2026-07-19T07:00:54.000Z', NULL),
  ('l-t-ds-55', 'local-dev-workspace', 't-ds-55', 'p-tk-gamma', 'task.belongs_to_project', '2026-07-19T07:00:55.000Z', '2026-07-19T07:00:55.000Z', NULL),
  ('l-t-ds-56', 'local-dev-workspace', 't-ds-56', 'a-tk-ops', 'task.belongs_to_area', '2026-07-19T07:00:56.000Z', '2026-07-19T07:00:56.000Z', NULL),
  ('l-t-ds-57', 'local-dev-workspace', 't-ds-57', 'a-tk-life', 'task.belongs_to_area', '2026-07-19T07:00:57.000Z', '2026-07-19T07:00:57.000Z', NULL),
  ('l-t-ds-58', 'local-dev-workspace', 't-ds-58', 'p-tk-beta', 'task.belongs_to_project', '2026-07-19T07:00:58.000Z', '2026-07-19T07:00:58.000Z', NULL),
  ('l-t-ds-59', 'local-dev-workspace', 't-ds-59', 'p-tk-beta', 'task.belongs_to_project', '2026-07-19T07:00:59.000Z', '2026-07-19T07:00:59.000Z', NULL),
  ('l-t-ds-60', 'local-dev-workspace', 't-ds-60', 'a-tk-life', 'task.belongs_to_area', '2026-07-19T07:01:00.000Z', '2026-07-19T07:01:00.000Z', NULL),
  ('l-t-ds-61', 'local-dev-workspace', 't-ds-61', 'p-tk-beta', 'task.belongs_to_project', '2026-07-19T07:01:01.000Z', '2026-07-19T07:01:01.000Z', NULL),
  ('l-t-ds-62', 'local-dev-workspace', 't-ds-62', 'a-tk-life', 'task.belongs_to_area', '2026-07-19T07:01:02.000Z', '2026-07-19T07:01:02.000Z', NULL),
  ('l-t-ds-63', 'local-dev-workspace', 't-ds-63', 'a-tk-life', 'task.belongs_to_area', '2026-07-19T07:01:03.000Z', '2026-07-19T07:01:03.000Z', NULL),
  ('l-t-ds-64', 'local-dev-workspace', 't-ds-64', 'a-tk-life', 'task.belongs_to_area', '2026-07-19T07:01:04.000Z', '2026-07-19T07:01:04.000Z', NULL),
  ('l-t-ds-65', 'local-dev-workspace', 't-ds-65', 'p-tk-beta', 'task.belongs_to_project', '2026-07-19T07:01:05.000Z', '2026-07-19T07:01:05.000Z', NULL),
  ('l-t-ds-66', 'local-dev-workspace', 't-ds-66', 'a-tk-life', 'task.belongs_to_area', '2026-07-19T07:01:06.000Z', '2026-07-19T07:01:06.000Z', NULL),
  ('l-t-ds-67', 'local-dev-workspace', 't-ds-67', 'p-tk-alpha', 'task.belongs_to_project', '2026-07-19T07:01:07.000Z', '2026-07-19T07:01:07.000Z', NULL),
  ('l-t-ds-68', 'local-dev-workspace', 't-ds-68', 'p-tk-alpha', 'task.belongs_to_project', '2026-07-19T07:01:08.000Z', '2026-07-19T07:01:08.000Z', NULL),
  ('l-t-ds-69', 'local-dev-workspace', 't-ds-69', 'a-tk-life', 'task.belongs_to_area', '2026-07-19T07:01:09.000Z', '2026-07-19T07:01:09.000Z', NULL),
  ('l-t-ds-70', 'local-dev-workspace', 't-ds-70', 'p-tk-beta', 'task.belongs_to_project', '2026-07-19T07:01:10.000Z', '2026-07-19T07:01:10.000Z', NULL),
  ('l-t-ds-71', 'local-dev-workspace', 't-ds-71', 'a-tk-life', 'task.belongs_to_area', '2026-07-19T07:01:11.000Z', '2026-07-19T07:01:11.000Z', NULL),
  ('l-t-ds-72', 'local-dev-workspace', 't-ds-72', 'p-tk-alpha', 'task.belongs_to_project', '2026-07-19T07:01:12.000Z', '2026-07-19T07:01:12.000Z', NULL),
  ('l-t-ds-73', 'local-dev-workspace', 't-ds-73', 'p-tk-alpha', 'task.belongs_to_project', '2026-07-19T07:01:13.000Z', '2026-07-19T07:01:13.000Z', NULL),
  ('l-t-ds-74', 'local-dev-workspace', 't-ds-74', 'p-tk-beta', 'task.belongs_to_project', '2026-07-19T07:01:14.000Z', '2026-07-19T07:01:14.000Z', NULL),
  ('l-t-ds-75', 'local-dev-workspace', 't-ds-75', 'p-tk-alpha', 'task.belongs_to_project', '2026-07-19T07:01:15.000Z', '2026-07-19T07:01:15.000Z', NULL),
  ('l-t-ds-76', 'local-dev-workspace', 't-ds-76', 'a-tk-ops', 'task.belongs_to_area', '2026-07-19T07:01:16.000Z', '2026-07-19T07:01:16.000Z', NULL),
  ('l-t-ds-77', 'local-dev-workspace', 't-ds-77', 'a-tk-ops', 'task.belongs_to_area', '2026-07-19T07:01:17.000Z', '2026-07-19T07:01:17.000Z', NULL),
  ('l-t-ds-78', 'local-dev-workspace', 't-ds-78', 'a-tk-ops', 'task.belongs_to_area', '2026-07-19T07:01:18.000Z', '2026-07-19T07:01:18.000Z', NULL),
  ('l-t-ds-79', 'local-dev-workspace', 't-ds-79', 'p-tk-beta', 'task.belongs_to_project', '2026-07-19T07:01:19.000Z', '2026-07-19T07:01:19.000Z', NULL);

INSERT OR IGNORE INTO task_details
  (workspace_id, entity_id, entity_type, status, priority, due_date, scheduled_date,
   time_sector, commitment_state, delegate_to, waiting_since, waiting_note, updated_at)
VALUES
  ('local-dev-workspace', 't-ds-00', 'task', 'todo', 'p3', NULL, NULL, 'next_week', 'active', NULL, NULL, NULL, '2026-07-19T07:00:00.000Z'),
  ('local-dev-workspace', 't-ds-01', 'task', 'todo', 'p2', '2026-09-12', NULL, 'this_month', 'active', NULL, NULL, NULL, '2026-07-19T07:00:01.000Z'),
  ('local-dev-workspace', 't-ds-02', 'task', 'todo', 'p3', NULL, NULL, NULL, 'active', NULL, NULL, NULL, '2026-07-19T07:00:02.000Z'),
  ('local-dev-workspace', 't-ds-03', 'task', 'in_progress', NULL, '2026-08-19', '2026-08-02', 'next_week', 'active', NULL, NULL, NULL, '2026-07-19T07:00:03.000Z'),
  ('local-dev-workspace', 't-ds-04', 'task', 'todo', NULL, NULL, NULL, 'long_term', 'active', NULL, NULL, NULL, '2026-07-19T07:00:04.000Z'),
  ('local-dev-workspace', 't-ds-05', 'task', 'todo', 'p1', '2026-09-18', NULL, 'next_week', 'someday', NULL, NULL, NULL, '2026-07-19T07:00:05.000Z'),
  ('local-dev-workspace', 't-ds-06', 'task', 'on_hold', 'p4', NULL, NULL, 'next_week', 'active', 'Sam Okafor', '2026-07-22T09:00:00.000Z', 'Waiting on the supplier', '2026-07-19T07:00:06.000Z'),
  ('local-dev-workspace', 't-ds-07', 'task', 'in_progress', 'p4', '2026-09-21', '2026-08-21', 'long_term', 'active', 'Sam Okafor', NULL, NULL, '2026-07-19T07:00:07.000Z'),
  ('local-dev-workspace', 't-ds-08', 'task', 'on_hold', 'p4', NULL, '2026-08-19', 'this_month', 'active', NULL, NULL, NULL, '2026-07-19T07:00:08.000Z'),
  ('local-dev-workspace', 't-ds-09', 'task', 'cancelled', 'p1', '2026-08-09', '2026-07-28', 'this_month', 'active', NULL, NULL, NULL, '2026-07-19T07:00:09.000Z'),
  ('local-dev-workspace', 't-ds-10', 'task', 'on_hold', 'p2', NULL, NULL, 'routines', 'active', NULL, NULL, NULL, '2026-07-19T07:00:10.000Z'),
  ('local-dev-workspace', 't-ds-11', 'task', 'cancelled', 'p1', '2026-08-29', '2026-07-17', 'routines', 'active', 'Sam Okafor', NULL, NULL, '2026-07-19T07:00:11.000Z'),
  ('local-dev-workspace', 't-ds-12', 'task', 'todo', 'p4', NULL, '2026-08-12', 'next_month', 'active', NULL, NULL, NULL, '2026-07-19T07:00:12.000Z'),
  ('local-dev-workspace', 't-ds-13', 'task', 'todo', 'p2', '2026-07-20', NULL, NULL, 'active', NULL, NULL, NULL, '2026-07-19T07:00:13.000Z'),
  ('local-dev-workspace', 't-ds-14', 'task', 'todo', 'p4', NULL, NULL, 'next_week', 'active', 'Priya Raman', NULL, NULL, '2026-07-19T07:00:14.000Z'),
  ('local-dev-workspace', 't-ds-15', 'task', 'in_progress', 'p1', '2026-09-12', '2026-08-24', 'this_month', 'active', NULL, NULL, NULL, '2026-07-19T07:00:15.000Z'),
  ('local-dev-workspace', 't-ds-16', 'task', 'on_hold', 'p4', NULL, NULL, 'next_month', 'someday', 'Priya Raman', NULL, NULL, '2026-07-19T07:00:16.000Z'),
  ('local-dev-workspace', 't-ds-17', 'task', 'todo', NULL, '2026-09-22', '2026-08-08', 'this_month', 'active', 'Priya Raman', NULL, NULL, '2026-07-19T07:00:17.000Z'),
  ('local-dev-workspace', 't-ds-18', 'task', 'todo', 'p2', NULL, NULL, NULL, 'active', 'Sam Okafor', NULL, NULL, '2026-07-19T07:00:18.000Z'),
  ('local-dev-workspace', 't-ds-19', 'task', 'todo', NULL, '2026-07-30', NULL, 'long_term', 'active', NULL, '2026-07-22T09:00:00.000Z', 'Waiting on the supplier', '2026-07-19T07:00:19.000Z'),
  ('local-dev-workspace', 't-ds-20', 'task', 'todo', NULL, NULL, '2026-08-05', 'next_week', 'active', NULL, NULL, NULL, '2026-07-19T07:00:20.000Z'),
  ('local-dev-workspace', 't-ds-21', 'task', 'todo', 'p1', '2026-09-08', '2026-07-30', 'next_month', 'active', 'Priya Raman', NULL, NULL, '2026-07-19T07:00:21.000Z'),
  ('local-dev-workspace', 't-ds-22', 'task', 'on_hold', 'p3', NULL, '2026-07-27', 'next_week', 'active', NULL, NULL, NULL, '2026-07-19T07:00:22.000Z'),
  ('local-dev-workspace', 't-ds-23', 'task', 'todo', 'p3', '2026-09-21', NULL, 'long_term', 'active', NULL, NULL, NULL, '2026-07-19T07:00:23.000Z'),
  ('local-dev-workspace', 't-ds-24', 'task', 'todo', 'p1', NULL, '2026-07-20', NULL, 'active', 'Sam Okafor', NULL, NULL, '2026-07-19T07:00:24.000Z'),
  ('local-dev-workspace', 't-ds-25', 'task', 'cancelled', 'p2', '2026-08-28', '2026-07-29', 'this_month', 'active', NULL, NULL, NULL, '2026-07-19T07:00:25.000Z'),
  ('local-dev-workspace', 't-ds-26', 'task', 'todo', 'p3', NULL, '2026-08-05', 'this_week', 'active', NULL, NULL, NULL, '2026-07-19T07:00:26.000Z'),
  ('local-dev-workspace', 't-ds-27', 'task', 'todo', 'p3', '2026-08-19', NULL, NULL, 'someday', NULL, NULL, NULL, '2026-07-19T07:00:27.000Z'),
  ('local-dev-workspace', 't-ds-28', 'task', 'todo', 'p3', NULL, '2026-08-05', 'routines', 'active', 'Priya Raman', NULL, NULL, '2026-07-19T07:00:28.000Z'),
  ('local-dev-workspace', 't-ds-29', 'task', 'cancelled', 'p1', '2026-08-27', NULL, 'this_week', 'active', NULL, NULL, NULL, '2026-07-19T07:00:29.000Z'),
  ('local-dev-workspace', 't-ds-30', 'task', 'todo', 'p4', NULL, '2026-07-15', 'this_week', 'active', NULL, NULL, NULL, '2026-07-19T07:00:30.000Z'),
  ('local-dev-workspace', 't-ds-31', 'task', 'cancelled', 'p3', '2026-09-17', NULL, 'this_month', 'active', 'Priya Raman', NULL, NULL, '2026-07-19T07:00:31.000Z'),
  ('local-dev-workspace', 't-ds-32', 'task', 'on_hold', 'p4', NULL, NULL, 'this_month', 'active', 'Sam Okafor', '2026-07-22T09:00:00.000Z', 'Waiting on the supplier', '2026-07-19T07:00:32.000Z'),
  ('local-dev-workspace', 't-ds-33', 'task', 'todo', 'p2', '2026-07-18', NULL, 'this_week', 'active', 'Sam Okafor', NULL, NULL, '2026-07-19T07:00:33.000Z'),
  ('local-dev-workspace', 't-ds-34', 'task', 'on_hold', 'p4', NULL, NULL, 'this_month', 'active', 'Priya Raman', NULL, NULL, '2026-07-19T07:00:34.000Z'),
  ('local-dev-workspace', 't-ds-35', 'task', 'todo', 'p1', '2026-08-17', NULL, 'next_week', 'active', 'Priya Raman', NULL, NULL, '2026-07-19T07:00:35.000Z'),
  ('local-dev-workspace', 't-ds-36', 'task', 'todo', 'p3', NULL, NULL, 'routines', 'active', NULL, NULL, NULL, '2026-07-19T07:00:36.000Z'),
  ('local-dev-workspace', 't-ds-37', 'task', 'in_progress', 'p3', '2026-07-25', '2026-08-04', 'this_week', 'active', NULL, NULL, NULL, '2026-07-19T07:00:37.000Z'),
  ('local-dev-workspace', 't-ds-38', 'task', 'on_hold', 'p4', NULL, '2026-07-24', 'next_month', 'someday', NULL, NULL, NULL, '2026-07-19T07:00:38.000Z'),
  ('local-dev-workspace', 't-ds-39', 'task', 'in_progress', 'p2', '2026-08-13', NULL, 'this_month', 'active', NULL, NULL, NULL, '2026-07-19T07:00:39.000Z'),
  ('local-dev-workspace', 't-ds-40', 'task', 'on_hold', 'p2', NULL, NULL, 'long_term', 'active', NULL, NULL, NULL, '2026-07-19T07:00:40.000Z'),
  ('local-dev-workspace', 't-ds-41', 'task', 'todo', NULL, '2026-09-16', '2026-08-11', 'long_term', 'active', NULL, NULL, NULL, '2026-07-19T07:00:41.000Z'),
  ('local-dev-workspace', 't-ds-42', 'task', 'todo', 'p3', NULL, '2026-07-23', 'next_month', 'active', NULL, NULL, NULL, '2026-07-19T07:00:42.000Z'),
  ('local-dev-workspace', 't-ds-43', 'task', 'todo', 'p1', '2026-07-26', NULL, 'next_week', 'active', 'Priya Raman', NULL, NULL, '2026-07-19T07:00:43.000Z'),
  ('local-dev-workspace', 't-ds-44', 'task', 'todo', 'p2', NULL, NULL, NULL, 'active', NULL, NULL, NULL, '2026-07-19T07:00:44.000Z'),
  ('local-dev-workspace', 't-ds-45', 'task', 'in_progress', 'p2', '2026-08-10', NULL, 'long_term', 'active', 'Sam Okafor', '2026-07-22T09:00:00.000Z', 'Waiting on the supplier', '2026-07-19T07:00:45.000Z'),
  ('local-dev-workspace', 't-ds-46', 'task', 'todo', 'p2', NULL, NULL, NULL, 'active', 'Sam Okafor', NULL, NULL, '2026-07-19T07:00:46.000Z'),
  ('local-dev-workspace', 't-ds-47', 'task', 'cancelled', 'p4', '2026-09-02', '2026-08-11', 'long_term', 'active', NULL, NULL, NULL, '2026-07-19T07:00:47.000Z'),
  ('local-dev-workspace', 't-ds-48', 'task', 'todo', 'p1', NULL, NULL, 'this_week', 'active', NULL, NULL, NULL, '2026-07-19T07:00:48.000Z'),
  ('local-dev-workspace', 't-ds-49', 'task', 'in_progress', 'p1', '2026-08-10', NULL, 'next_month', 'someday', NULL, NULL, NULL, '2026-07-19T07:00:49.000Z'),
  ('local-dev-workspace', 't-ds-50', 'task', 'on_hold', 'p2', NULL, NULL, 'next_week', 'active', 'Sam Okafor', NULL, NULL, '2026-07-19T07:00:50.000Z'),
  ('local-dev-workspace', 't-ds-51', 'task', 'cancelled', 'p3', '2026-08-24', NULL, 'next_month', 'active', NULL, NULL, NULL, '2026-07-19T07:00:51.000Z'),
  ('local-dev-workspace', 't-ds-52', 'task', 'on_hold', 'p3', NULL, '2026-08-24', 'next_week', 'active', NULL, NULL, NULL, '2026-07-19T07:00:52.000Z'),
  ('local-dev-workspace', 't-ds-53', 'task', 'cancelled', 'p4', '2026-09-06', NULL, 'this_week', 'active', NULL, NULL, NULL, '2026-07-19T07:00:53.000Z'),
  ('local-dev-workspace', 't-ds-54', 'task', 'on_hold', 'p1', NULL, NULL, 'next_month', 'active', NULL, NULL, NULL, '2026-07-19T07:00:54.000Z'),
  ('local-dev-workspace', 't-ds-55', 'task', 'cancelled', 'p2', '2026-07-31', '2026-07-16', 'next_month', 'active', NULL, NULL, NULL, '2026-07-19T07:00:55.000Z'),
  ('local-dev-workspace', 't-ds-56', 'task', 'todo', 'p3', NULL, '2026-08-10', 'this_week', 'active', 'Sam Okafor', NULL, NULL, '2026-07-19T07:00:56.000Z'),
  ('local-dev-workspace', 't-ds-57', 'task', 'cancelled', 'p1', '2026-09-23', NULL, 'this_week', 'active', 'Sam Okafor', NULL, NULL, '2026-07-19T07:00:57.000Z'),
  ('local-dev-workspace', 't-ds-58', 'task', 'on_hold', 'p3', NULL, NULL, 'routines', 'active', 'Priya Raman', '2026-07-22T09:00:00.000Z', 'Waiting on the supplier', '2026-07-19T07:00:58.000Z'),
  ('local-dev-workspace', 't-ds-59', 'task', 'in_progress', 'p1', '2026-07-25', '2026-08-15', 'long_term', 'active', NULL, NULL, NULL, '2026-07-19T07:00:59.000Z'),
  ('local-dev-workspace', 't-ds-60', 'task', 'todo', 'p3', NULL, '2026-08-12', 'this_week', 'someday', NULL, NULL, NULL, '2026-07-19T07:01:00.000Z'),
  ('local-dev-workspace', 't-ds-61', 'task', 'todo', 'p4', '2026-09-23', '2026-07-20', 'this_week', 'active', NULL, NULL, NULL, '2026-07-19T07:01:01.000Z'),
  ('local-dev-workspace', 't-ds-62', 'task', 'todo', 'p1', NULL, NULL, 'next_week', 'active', 'Sam Okafor', NULL, NULL, '2026-07-19T07:01:02.000Z'),
  ('local-dev-workspace', 't-ds-63', 'task', 'in_progress', 'p2', '2026-07-10', NULL, 'routines', 'active', NULL, NULL, NULL, '2026-07-19T07:01:03.000Z'),
  ('local-dev-workspace', 't-ds-64', 'task', 'todo', 'p4', NULL, '2026-07-31', 'next_month', 'active', NULL, NULL, NULL, '2026-07-19T07:01:04.000Z'),
  ('local-dev-workspace', 't-ds-65', 'task', 'in_progress', 'p4', '2026-09-15', '2026-07-30', 'next_month', 'active', NULL, NULL, NULL, '2026-07-19T07:01:05.000Z'),
  ('local-dev-workspace', 't-ds-66', 'task', 'todo', 'p1', NULL, NULL, 'routines', 'active', NULL, NULL, NULL, '2026-07-19T07:01:06.000Z'),
  ('local-dev-workspace', 't-ds-67', 'task', 'todo', 'p1', '2026-08-30', '2026-07-28', 'this_week', 'active', NULL, NULL, NULL, '2026-07-19T07:01:07.000Z'),
  ('local-dev-workspace', 't-ds-68', 'task', 'on_hold', NULL, NULL, '2026-07-28', NULL, 'active', 'Sam Okafor', NULL, NULL, '2026-07-19T07:01:08.000Z'),
  ('local-dev-workspace', 't-ds-69', 'task', 'in_progress', 'p3', '2026-09-03', '2026-08-03', 'long_term', 'active', NULL, NULL, NULL, '2026-07-19T07:01:09.000Z'),
  ('local-dev-workspace', 't-ds-70', 'task', 'todo', 'p1', NULL, NULL, 'this_month', 'active', 'Priya Raman', NULL, NULL, '2026-07-19T07:01:10.000Z'),
  ('local-dev-workspace', 't-ds-71', 'task', 'in_progress', 'p1', '2026-07-06', '2026-07-30', 'this_week', 'someday', NULL, '2026-07-22T09:00:00.000Z', 'Waiting on the supplier', '2026-07-19T07:01:11.000Z'),
  ('local-dev-workspace', 't-ds-72', 'task', 'on_hold', 'p1', NULL, NULL, 'long_term', 'active', 'Priya Raman', NULL, NULL, '2026-07-19T07:01:12.000Z'),
  ('local-dev-workspace', 't-ds-73', 'task', 'cancelled', NULL, '2026-09-08', NULL, 'next_week', 'active', NULL, NULL, NULL, '2026-07-19T07:01:13.000Z'),
  ('local-dev-workspace', 't-ds-74', 'task', 'todo', 'p2', NULL, '2026-07-18', 'next_week', 'active', NULL, NULL, NULL, '2026-07-19T07:01:14.000Z'),
  ('local-dev-workspace', 't-ds-75', 'task', 'todo', 'p3', '2026-07-30', NULL, 'next_month', 'active', NULL, NULL, NULL, '2026-07-19T07:01:15.000Z'),
  ('local-dev-workspace', 't-ds-76', 'task', 'on_hold', NULL, NULL, NULL, 'this_week', 'active', NULL, NULL, NULL, '2026-07-19T07:01:16.000Z'),
  ('local-dev-workspace', 't-ds-77', 'task', 'in_progress', 'p4', '2026-09-20', '2026-07-16', 'next_month', 'active', 'Sam Okafor', NULL, NULL, '2026-07-19T07:01:17.000Z'),
  ('local-dev-workspace', 't-ds-78', 'task', 'on_hold', NULL, NULL, NULL, 'next_month', 'active', 'Sam Okafor', NULL, NULL, '2026-07-19T07:01:18.000Z'),
  ('local-dev-workspace', 't-ds-79', 'task', 'cancelled', 'p1', '2026-07-06', NULL, 'next_week', 'active', NULL, NULL, NULL, '2026-07-19T07:01:19.000Z');
