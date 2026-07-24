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
  ('local-dev-workspace', 't-drawer', 'task', 'todo', 'high', '2026-08-01', NULL, 'Draft the **proposal** document.', '2026-07-19T01:00:03.000Z');

-- Reset the seeded tasks' MUTABLE state so every e2e run starts from a known,
-- deterministic point regardless of what a prior run's journeys changed (the
-- INSERT OR IGNORE rows above do not overwrite). Completion is cleared for all
-- seeded tasks; `t-drawer`'s details are restored to their canonical values.
UPDATE spine_records SET completed_at = NULL
WHERE workspace_id = 'local-dev-workspace'
  AND entity_id IN ('t-px02', 't-pr', 't-gym', 't-drawer', 't-waiting', 't-complete');
UPDATE task_details
SET status = 'todo', priority = 'high', due_date = '2026-08-01',
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
