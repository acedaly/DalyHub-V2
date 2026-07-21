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
