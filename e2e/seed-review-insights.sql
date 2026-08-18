-- REVIEW-03 — the Review evidence fixture.
--
-- The evidence surface is only honest against a week that actually HAPPENED, so
-- this seeds one: work completed inside the period, a commitment carried in from
-- before it, an Area that received nothing, a Project whose health improved and
-- one whose health slipped, and a previous Review with its captured snapshot so
-- "what changed" has something to change from.
--
-- ── Why the dates are computed, not written down ────────────────────────────
-- Project health is evaluated against TODAY (PROJ-02): a Project whose last
-- activity is fixed in the past becomes "stale" the moment the calendar passes
-- it, and a fixture that changes meaning over time is a flaky test waiting to
-- happen. So every date here is derived from `now`:
--
--   * the Review period is a seven-day week that ENDED TWO DAYS AGO;
--   * completions inside it are stamped at 02:00Z on a date within it, which is
--     midday in the owner's timezone (ahead of UTC) and therefore inside the
--     period whatever hour the suite runs at;
--   * overdue work is due 60 days ago, so it is overdue on any day;
--   * work that must NOT read as overdue is due 90+ days out.
--
-- ── Why the period ENDS BEFORE TODAY (V2.3-GATE-01) ─────────────────────────
-- The insight this fixture exists to prove counts, correctly, EVERY Task
-- completed in the workspace during the period — `countCompletionsInPeriods`
-- aggregates `task.completed` activity, not a set of rows this file owns. So
-- prefixing the fixture's own records isolates them from being READ as records,
-- and isolates nothing at all from being COUNTED.
--
-- That is what made "3 Tasks completed" fail: E2E partition p02 runs whole spec
-- files back to back against one shared local D1, and several of the files that
-- run before this one (Today, Projects, the iPhone daily driver, the planner)
-- complete real Tasks through the real product. Every one of those completions
-- is stamped at the moment it happens — i.e. NOW — and while the period ran up
-- to and including today, each one landed inside it and pushed the count past 3.
--
-- The answer is a BOUNDED period rather than a looser assertion: the week ends
-- two days ago, so the only completions that can fall inside it are the ones
-- this file writes. Nothing else in the suite can reach into a closed week,
-- because nothing else can complete a Task in the past. Two days rather than one
-- is margin for the owner's timezone being ahead of UTC. A Review whose period
-- closed on Friday and is still in progress on Sunday is also the ordinary case
-- rather than a contrivance — the weekly Review is usually done after the week.
--
-- Everything is prefixed `ri-` / "RI:" so it is trivially separable from the
-- other fixtures sharing this database. Idempotent (`INSERT OR IGNORE` plus a
-- following `UPDATE` for every mutable column), local-only, and additive.

-- ---------------------------------------------------------------------------
-- Areas. Home receives the week's work; Health & Fitness has an active Project
-- and deliberately receives none — the "no contributing work" case.
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
VALUES
  ('ri-area-home', 'local-dev-workspace', 'area', 'RI: Home', '2026-01-06T00:00:00.000Z', '2026-01-06T00:00:00.000Z', NULL),
  ('ri-area-health', 'local-dev-workspace', 'area', 'RI: Health & Fitness', '2026-01-06T00:00:01.000Z', '2026-01-06T00:00:01.000Z', NULL);
INSERT OR IGNORE INTO spine_records (workspace_id, entity_id, kind, completed_at)
VALUES
  ('local-dev-workspace', 'ri-area-home', 'area', NULL),
  ('local-dev-workspace', 'ri-area-health', 'area', NULL);
INSERT OR IGNORE INTO area_details (workspace_id, entity_id, entity_type, archived_at, updated_at, icon_key)
VALUES
  ('local-dev-workspace', 'ri-area-home', 'area', NULL, '2026-01-06T00:00:00.000Z', 'home'),
  ('local-dev-workspace', 'ri-area-health', 'area', NULL, '2026-01-06T00:00:01.000Z', 'heart');
UPDATE area_details SET archived_at = NULL
WHERE workspace_id = 'local-dev-workspace' AND entity_id IN ('ri-area-home', 'ri-area-health');

-- ---------------------------------------------------------------------------
-- Goals. One receives the week's completed work (Moving); one has a Project
-- that completed nothing (No recent movement).
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
VALUES
  ('ri-goal-home', 'local-dev-workspace', 'goal', 'RI: A finished ground floor', '2026-02-10T00:00:00.000Z', '2026-02-10T00:00:00.000Z', NULL),
  ('ri-goal-fit', 'local-dev-workspace', 'goal', 'RI: Run a half marathon', '2026-02-10T00:00:01.000Z', '2026-02-10T00:00:01.000Z', NULL);
INSERT OR IGNORE INTO spine_records (workspace_id, entity_id, kind, completed_at)
VALUES
  ('local-dev-workspace', 'ri-goal-home', 'goal', NULL),
  ('local-dev-workspace', 'ri-goal-fit', 'goal', NULL);
UPDATE spine_records SET completed_at = NULL
WHERE workspace_id = 'local-dev-workspace' AND entity_id IN ('ri-goal-home', 'ri-goal-fit');
INSERT OR IGNORE INTO goal_details (workspace_id, entity_id, entity_type, target_date, definition_of_done, updated_at)
VALUES
  ('local-dev-workspace', 'ri-goal-home', 'goal', NULL, 'The ground floor is finished and signed off.', '2026-02-10T00:00:00.000Z'),
  ('local-dev-workspace', 'ri-goal-fit', 'goal', NULL, 'Finish a half marathon without walking.', '2026-02-10T00:00:01.000Z');

-- ---------------------------------------------------------------------------
-- Projects.
--   ri-proj-kitchen  advances the home Goal, had the week's completed work, and
--                    its only open work is far in the future -> On track.
--   ri-proj-loft     sits in Home with one long-overdue open Task -> At risk,
--                    and completed nothing this week.
--   ri-proj-run      advances the fitness Goal, nothing completed this week.
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
VALUES
  ('ri-proj-kitchen', 'local-dev-workspace', 'project', 'RI: Kitchen renovation', '2026-03-02T00:00:00.000Z', '2026-03-02T00:00:00.000Z', NULL),
  ('ri-proj-loft', 'local-dev-workspace', 'project', 'RI: Loft conversion', '2026-03-02T00:00:01.000Z', '2026-03-02T00:00:01.000Z', NULL),
  ('ri-proj-run', 'local-dev-workspace', 'project', 'RI: Marathon training block', '2026-03-02T00:00:02.000Z', '2026-03-02T00:00:02.000Z', NULL);
INSERT OR IGNORE INTO spine_records (workspace_id, entity_id, kind, completed_at)
VALUES
  ('local-dev-workspace', 'ri-proj-kitchen', 'project', NULL),
  ('local-dev-workspace', 'ri-proj-loft', 'project', NULL),
  ('local-dev-workspace', 'ri-proj-run', 'project', NULL);
UPDATE spine_records SET completed_at = NULL
WHERE workspace_id = 'local-dev-workspace'
  AND entity_id IN ('ri-proj-kitchen', 'ri-proj-loft', 'ri-proj-run');
INSERT OR IGNORE INTO project_details (workspace_id, entity_id, entity_type, status, archived_at, updated_at, icon_key)
VALUES
  ('local-dev-workspace', 'ri-proj-kitchen', 'project', 'active', NULL, '2026-03-02T00:00:00.000Z', NULL),
  ('local-dev-workspace', 'ri-proj-loft', 'project', 'active', NULL, '2026-03-02T00:00:01.000Z', NULL),
  ('local-dev-workspace', 'ri-proj-run', 'project', 'active', NULL, '2026-03-02T00:00:02.000Z', NULL);
UPDATE project_details SET status = 'active', archived_at = NULL
WHERE workspace_id = 'local-dev-workspace'
  AND entity_id IN ('ri-proj-kitchen', 'ri-proj-loft', 'ri-proj-run');

-- These three Projects must be INSIDE the insight read's bound, whatever else the
-- workspace holds.
--
-- `REVIEW_INSIGHT_LIMITS.projects` is 20, deliberately, and the read is ordered by
-- the effective updated-at (the later of the spine's and the detail slice's — see
-- `EFFECTIVE_UPDATED_AT_EXPR`). With a fixed 2026-03 stamp these fixtures sank below
-- twenty other Projects as soon as the rest of the suite had touched that many, and
-- the health-movement section then had nothing to compare and vanished — a failure
-- that looks like a product bug and is a fixture that aged out of its own read.
--
-- Only the DETAIL slice's stamp is moved: ADR-014 reserves the spine's `updated_at`
-- for identity, and the max() is what the ordering reads. Nothing the tests assert
-- is derived from it — health comes from the tasks and the activity rows above,
-- both of which are already `date('now')`-relative.
UPDATE project_details SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE workspace_id = 'local-dev-workspace'
  AND entity_id IN ('ri-proj-kitchen', 'ri-proj-loft', 'ri-proj-run');

-- Structural spine links. Each child has exactly ONE structural parent.
INSERT OR IGNORE INTO entity_links (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
VALUES
  ('ri-l-goal-home-area', 'local-dev-workspace', 'ri-goal-home', 'ri-area-home', 'goal.belongs_to_area', '2026-02-10T00:00:00.000Z', '2026-02-10T00:00:00.000Z', NULL),
  ('ri-l-goal-fit-area', 'local-dev-workspace', 'ri-goal-fit', 'ri-area-health', 'goal.belongs_to_area', '2026-02-10T00:00:01.000Z', '2026-02-10T00:00:01.000Z', NULL),
  ('ri-l-kitchen-goal', 'local-dev-workspace', 'ri-proj-kitchen', 'ri-goal-home', 'project.advances_goal', '2026-03-02T00:00:00.000Z', '2026-03-02T00:00:00.000Z', NULL),
  ('ri-l-loft-area', 'local-dev-workspace', 'ri-proj-loft', 'ri-area-home', 'project.belongs_to_area', '2026-03-02T00:00:01.000Z', '2026-03-02T00:00:01.000Z', NULL),
  ('ri-l-run-goal', 'local-dev-workspace', 'ri-proj-run', 'ri-goal-fit', 'project.advances_goal', '2026-03-02T00:00:02.000Z', '2026-03-02T00:00:02.000Z', NULL);
UPDATE entity_links SET deleted_at = NULL
WHERE workspace_id = 'local-dev-workspace' AND id LIKE 'ri-l-%';

-- ---------------------------------------------------------------------------
-- Tasks. Three completed inside the period, two completed inside the PREVIOUS
-- period (so the trend has two real points), one long-overdue open commitment,
-- and two open Tasks whose due dates are far enough out to keep their Projects
-- off the overdue signal.
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
VALUES
  ('ri-task-k1', 'local-dev-workspace', 'task', 'RI: Fit the new splashback', '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z', NULL),
  ('ri-task-k2', 'local-dev-workspace', 'task', 'RI: Seal the worktop', '2026-06-01T00:00:01.000Z', '2026-06-01T00:00:01.000Z', NULL),
  ('ri-task-k3', 'local-dev-workspace', 'task', 'RI: Book the electrician''s final visit', '2026-06-01T00:00:02.000Z', '2026-06-01T00:00:02.000Z', NULL),
  ('ri-task-k4', 'local-dev-workspace', 'task', 'RI: Order the cabinet handles', '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z', NULL),
  ('ri-task-k5', 'local-dev-workspace', 'task', 'RI: Return the offcuts', '2026-05-01T00:00:01.000Z', '2026-05-01T00:00:01.000Z', NULL),
  ('ri-task-k-open', 'local-dev-workspace', 'task', 'RI: Snagging walk-through', '2026-06-01T00:00:03.000Z', '2026-06-01T00:00:03.000Z', NULL),
  ('ri-task-loft-overdue', 'local-dev-workspace', 'task', 'RI: Renew the loft building consent', '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z', NULL),
  ('ri-task-run-open', 'local-dev-workspace', 'task', 'RI: Plan the long-run schedule', '2026-04-01T00:00:01.000Z', '2026-04-01T00:00:01.000Z', NULL);

INSERT OR IGNORE INTO spine_records (workspace_id, entity_id, kind, completed_at)
VALUES
  ('local-dev-workspace', 'ri-task-k1', 'task', NULL),
  ('local-dev-workspace', 'ri-task-k2', 'task', NULL),
  ('local-dev-workspace', 'ri-task-k3', 'task', NULL),
  ('local-dev-workspace', 'ri-task-k4', 'task', NULL),
  ('local-dev-workspace', 'ri-task-k5', 'task', NULL),
  ('local-dev-workspace', 'ri-task-k-open', 'task', NULL),
  ('local-dev-workspace', 'ri-task-loft-overdue', 'task', NULL),
  ('local-dev-workspace', 'ri-task-run-open', 'task', NULL);

-- Completions inside this period.
UPDATE spine_records SET completed_at = date('now', '-4 days') || 'T02:00:00.000Z'
WHERE workspace_id = 'local-dev-workspace'
  AND entity_id IN ('ri-task-k1', 'ri-task-k2', 'ri-task-k3');
-- Completions inside the PREVIOUS period.
UPDATE spine_records SET completed_at = date('now', '-11 days') || 'T02:00:00.000Z'
WHERE workspace_id = 'local-dev-workspace'
  AND entity_id IN ('ri-task-k4', 'ri-task-k5');
-- Still open.
UPDATE spine_records SET completed_at = NULL
WHERE workspace_id = 'local-dev-workspace'
  AND entity_id IN ('ri-task-k-open', 'ri-task-loft-overdue', 'ri-task-run-open');

INSERT OR IGNORE INTO task_details
  (workspace_id, entity_id, entity_type, status, priority, due_date, scheduled_date, time_sector, commitment_state, description, waiting_since, waiting_note, updated_at)
VALUES
  ('local-dev-workspace', 'ri-task-k1', 'task', 'todo', 'p2', NULL, NULL, NULL, 'active', NULL, NULL, NULL, '2026-06-01T00:00:00.000Z'),
  ('local-dev-workspace', 'ri-task-k2', 'task', 'todo', 'p2', NULL, NULL, NULL, 'active', NULL, NULL, NULL, '2026-06-01T00:00:01.000Z'),
  ('local-dev-workspace', 'ri-task-k3', 'task', 'todo', 'p2', NULL, NULL, NULL, 'active', NULL, NULL, NULL, '2026-06-01T00:00:02.000Z'),
  ('local-dev-workspace', 'ri-task-k4', 'task', 'todo', 'p3', NULL, NULL, NULL, 'active', NULL, NULL, NULL, '2026-05-01T00:00:00.000Z'),
  ('local-dev-workspace', 'ri-task-k5', 'task', 'todo', 'p3', NULL, NULL, NULL, 'active', NULL, NULL, NULL, '2026-05-01T00:00:01.000Z'),
  ('local-dev-workspace', 'ri-task-k-open', 'task', 'todo', 'p2', NULL, NULL, NULL, 'active', NULL, NULL, NULL, '2026-06-01T00:00:03.000Z'),
  ('local-dev-workspace', 'ri-task-loft-overdue', 'task', 'todo', 'p1', NULL, NULL, NULL, 'active', NULL, NULL, NULL, '2026-04-01T00:00:00.000Z'),
  ('local-dev-workspace', 'ri-task-run-open', 'task', 'todo', 'p3', NULL, NULL, NULL, 'active', NULL, NULL, NULL, '2026-04-01T00:00:01.000Z');

UPDATE task_details SET due_date = date('now', '+90 days'), commitment_state = 'active', status = 'todo'
WHERE workspace_id = 'local-dev-workspace' AND entity_id IN ('ri-task-k-open', 'ri-task-run-open');
UPDATE task_details SET due_date = date('now', '-60 days'), commitment_state = 'active', status = 'todo'
WHERE workspace_id = 'local-dev-workspace' AND entity_id = 'ri-task-loft-overdue';

INSERT OR IGNORE INTO entity_links (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
VALUES
  ('ri-l-t-k1', 'local-dev-workspace', 'ri-task-k1', 'ri-proj-kitchen', 'task.belongs_to_project', '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z', NULL),
  ('ri-l-t-k2', 'local-dev-workspace', 'ri-task-k2', 'ri-proj-kitchen', 'task.belongs_to_project', '2026-06-01T00:00:01.000Z', '2026-06-01T00:00:01.000Z', NULL),
  ('ri-l-t-k3', 'local-dev-workspace', 'ri-task-k3', 'ri-proj-kitchen', 'task.belongs_to_project', '2026-06-01T00:00:02.000Z', '2026-06-01T00:00:02.000Z', NULL),
  ('ri-l-t-k4', 'local-dev-workspace', 'ri-task-k4', 'ri-proj-kitchen', 'task.belongs_to_project', '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z', NULL),
  ('ri-l-t-k5', 'local-dev-workspace', 'ri-task-k5', 'ri-proj-kitchen', 'task.belongs_to_project', '2026-05-01T00:00:01.000Z', '2026-05-01T00:00:01.000Z', NULL),
  ('ri-l-t-kopen', 'local-dev-workspace', 'ri-task-k-open', 'ri-proj-kitchen', 'task.belongs_to_project', '2026-06-01T00:00:03.000Z', '2026-06-01T00:00:03.000Z', NULL),
  ('ri-l-t-loft', 'local-dev-workspace', 'ri-task-loft-overdue', 'ri-proj-loft', 'task.belongs_to_project', '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z', NULL),
  ('ri-l-t-run', 'local-dev-workspace', 'ri-task-run-open', 'ri-proj-run', 'task.belongs_to_project', '2026-04-01T00:00:01.000Z', '2026-04-01T00:00:01.000Z', NULL);

-- ---------------------------------------------------------------------------
-- Activity. The completion EVENTS are what the insight aggregate reads, so the
-- fixture writes them rather than relying on the spine rows alone. Payloads
-- carry structural metadata only, exactly as the recorder does.
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO activities (id, workspace_id, type, actor_type, actor_id, occurred_at, payload_json)
VALUES
  ('ri-act-k1', 'local-dev-workspace', 'task.completed', 'user', 'local-dev-owner', '2026-01-01T00:00:00.000Z', '{"kind":"task"}'),
  ('ri-act-k2', 'local-dev-workspace', 'task.completed', 'user', 'local-dev-owner', '2026-01-01T00:00:00.000Z', '{"kind":"task"}'),
  ('ri-act-k3', 'local-dev-workspace', 'task.completed', 'user', 'local-dev-owner', '2026-01-01T00:00:00.000Z', '{"kind":"task"}'),
  ('ri-act-k4', 'local-dev-workspace', 'task.completed', 'user', 'local-dev-owner', '2026-01-01T00:00:00.000Z', '{"kind":"task"}'),
  ('ri-act-k5', 'local-dev-workspace', 'task.completed', 'user', 'local-dev-owner', '2026-01-01T00:00:00.000Z', '{"kind":"task"}');
UPDATE activities SET occurred_at = date('now', '-4 days') || 'T02:00:00.000Z'
WHERE workspace_id = 'local-dev-workspace' AND id IN ('ri-act-k1', 'ri-act-k2', 'ri-act-k3');
UPDATE activities SET occurred_at = date('now', '-11 days') || 'T02:00:00.000Z'
WHERE workspace_id = 'local-dev-workspace' AND id IN ('ri-act-k4', 'ri-act-k5');

INSERT OR IGNORE INTO activity_subjects (workspace_id, activity_id, entity_id, role)
VALUES
  ('local-dev-workspace', 'ri-act-k1', 'ri-task-k1', 'subject'),
  ('local-dev-workspace', 'ri-act-k2', 'ri-task-k2', 'subject'),
  ('local-dev-workspace', 'ri-act-k3', 'ri-task-k3', 'subject'),
  ('local-dev-workspace', 'ri-act-k4', 'ri-task-k4', 'subject'),
  ('local-dev-workspace', 'ri-act-k5', 'ri-task-k5', 'subject');

-- ---------------------------------------------------------------------------
-- Reviews. One completed Review for the previous seven days, carrying the
-- snapshot that makes "since your last Review" answerable, and the in-progress
-- Review the tests open.
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
VALUES
  ('ri-review-prev', 'local-dev-workspace', 'review', 'RI: Previous weekly Review', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', NULL),
  ('ri-review-now', 'local-dev-workspace', 'review', 'RI: This week''s Review', '2026-01-01T00:00:01.000Z', '2026-01-01T00:00:01.000Z', NULL),
  ('ri-review-first', 'local-dev-workspace', 'review', 'RI: A first ever Review', '2026-01-01T00:00:02.000Z', '2026-01-01T00:00:02.000Z', NULL);

INSERT OR IGNORE INTO review_details
  (workspace_id, entity_id, entity_type, review_type, period_start, period_end, status, template_id, completed_at, archived_at, updated_at)
VALUES
  ('local-dev-workspace', 'ri-review-prev', 'review', 'weekly', '2026-01-01', '2026-01-07', 'completed', 'review.weekly.v1', '2026-01-07T00:00:00.000Z', NULL, '2026-01-07T00:00:00.000Z'),
  ('local-dev-workspace', 'ri-review-now', 'review', 'weekly', '2026-01-08', '2026-01-14', 'in_progress', 'review.weekly.v1', NULL, NULL, '2026-01-14T00:00:00.000Z'),
  -- A MONTHLY Review with no monthly predecessor: the first-Review case, which
  -- must render one calm sentence rather than a wall of zeros.
  ('local-dev-workspace', 'ri-review-first', 'review', 'monthly', '2026-01-01', '2026-01-31', 'in_progress', 'review.monthly.v1', NULL, NULL, '2026-01-31T00:00:00.000Z');

UPDATE review_details
SET period_start = date('now', '-15 days'), period_end = date('now', '-9 days'),
    status = 'completed', completed_at = date('now', '-9 days') || 'T09:00:00.000Z'
WHERE workspace_id = 'local-dev-workspace' AND entity_id = 'ri-review-prev';
UPDATE review_details
SET period_start = date('now', '-8 days'), period_end = date('now', '-2 days'),
    status = 'in_progress', completed_at = NULL
WHERE workspace_id = 'local-dev-workspace' AND entity_id = 'ri-review-now';
UPDATE review_details
SET period_start = date('now', '-8 days'), period_end = date('now', '-2 days'),
    status = 'in_progress', completed_at = NULL
WHERE workspace_id = 'local-dev-workspace' AND entity_id = 'ri-review-first';

-- The previous Review's captured evidence. Kitchen was At risk and Loft was On
-- track a week ago; today it is the other way round, which is exactly the pair
-- of transitions the surface has to be able to state.
INSERT OR IGNORE INTO review_insight_snapshots
  (workspace_id, review_id, version, period_start, period_end, captured_at, facts_json)
VALUES
  ('local-dev-workspace', 'ri-review-prev', 1, '2026-01-01', '2026-01-07', '2026-01-07T09:00:00.000Z', '{}');
UPDATE review_insight_snapshots
SET period_start = date('now', '-15 days'),
    period_end = date('now', '-9 days'),
    captured_at = date('now', '-9 days') || 'T09:00:00.000Z',
    facts_json = '{"version":1,"periodStart":"' || date('now', '-15 days') || '","periodEnd":"' || date('now', '-9 days') || '","tasksCompleted":2,"projectsCompleted":0,"goalsCompleted":0,"overdueCarryOver":1,"waitingCarryOver":0,"projects":[{"id":"ri-proj-kitchen","health":"at_risk","openTasks":4,"overdueTasks":2},{"id":"ri-proj-loft","health":"on_track","openTasks":1,"overdueTasks":0}],"projectsBounded":false,"goals":[{"id":"ri-goal-home","alignment":"active","contributingProjects":1,"contribution":"moving"},{"id":"ri-goal-fit","alignment":"neglected","contributingProjects":1,"contribution":"none"}],"goalsBounded":false,"areas":[{"id":"ri-area-home","tasksCompleted":2},{"id":"ri-area-health","tasksCompleted":0}],"areasBounded":false,"carryOverTaskIds":["ri-task-loft-overdue"],"carryOverTaskIdsBounded":false}'
WHERE workspace_id = 'local-dev-workspace' AND review_id = 'ri-review-prev';
