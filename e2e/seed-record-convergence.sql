-- RECORD-01 — the record-screen convergence fixture.
--
-- The convergence work is a LAYOUT change, and a layout is only honest against
-- realistic content: a header only wraps when a title is long, a fold anchor only
-- means something when there is enough working content to push below it, and an
-- "Area with no active work" is a different screen from an Area with plenty.
-- `seed-tasks.sql` seeds the small deterministic spine the existing journeys
-- assert against, and deliberately stays small — so this file adds the RICHER
-- records the record screens need without touching a single row those journeys own.
--
-- Everything here is prefixed `*-rc-*` / "RC:" so it is trivially separable from
-- the fixtures above it. Idempotent (`INSERT OR IGNORE` + a following `UPDATE`
-- for every mutable column), local-only, and additive.

-- ---------------------------------------------------------------------------
-- Areas — one with plenty of live work, one deliberately quiet.
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
VALUES
  ('a-rc-home', 'local-dev-workspace', 'area', 'Home & Property', '2026-01-06T00:00:00.000Z', '2026-08-05T09:12:00.000Z', NULL),
  ('a-rc-admin', 'local-dev-workspace', 'area', 'Personal Admin', '2026-01-06T00:00:01.000Z', '2026-02-02T21:04:00.000Z', NULL);
INSERT OR IGNORE INTO spine_records (workspace_id, entity_id, kind, completed_at)
VALUES
  ('local-dev-workspace', 'a-rc-home', 'area', NULL),
  ('local-dev-workspace', 'a-rc-admin', 'area', NULL);
INSERT OR IGNORE INTO area_details (workspace_id, entity_id, entity_type, archived_at, updated_at, icon_key)
VALUES
  ('local-dev-workspace', 'a-rc-home', 'area', NULL, '2026-08-05T09:12:00.000Z', 'home'),
  ('local-dev-workspace', 'a-rc-admin', 'area', NULL, '2026-02-02T21:04:00.000Z', 'clipboard');
UPDATE area_details SET archived_at = NULL, icon_key = 'home'
WHERE workspace_id = 'local-dev-workspace' AND entity_id = 'a-rc-home';
UPDATE area_details SET archived_at = NULL, icon_key = 'clipboard'
WHERE workspace_id = 'local-dev-workspace' AND entity_id = 'a-rc-admin';

-- ---------------------------------------------------------------------------
-- A Goal with a real definition of done and a target date.
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
VALUES
  ('g-rc-move', 'local-dev-workspace', 'goal', 'Finish the ground-floor renovation before summer', '2026-02-10T00:00:00.000Z', '2026-08-04T18:30:00.000Z', NULL);
INSERT OR IGNORE INTO spine_records (workspace_id, entity_id, kind, completed_at)
VALUES ('local-dev-workspace', 'g-rc-move', 'goal', NULL);
UPDATE spine_records SET completed_at = NULL
WHERE workspace_id = 'local-dev-workspace' AND entity_id = 'g-rc-move';
INSERT OR IGNORE INTO goal_details (workspace_id, entity_id, entity_type, target_date, definition_of_done, updated_at)
VALUES
  ('local-dev-workspace', 'g-rc-move', 'goal', date('now', '+118 days'),
   'Kitchen, laundry and hallway are finished, signed off by the builder, and the temporary kitchen is gone. No outstanding defects list.',
   '2026-08-04T18:30:00.000Z');
UPDATE goal_details
SET target_date = date('now', '+118 days'),
    definition_of_done = 'Kitchen, laundry and hallway are finished, signed off by the builder, and the temporary kitchen is gone. No outstanding defects list.',
    updated_at = '2026-08-04T18:30:00.000Z'
WHERE workspace_id = 'local-dev-workspace' AND entity_id = 'g-rc-move';

-- ---------------------------------------------------------------------------
-- Projects. `pr-rc-kitchen` is the REFERENCE record (20+ tasks, mixed states);
-- `pr-rc-long` exists purely to hold a 60+ character title.
-- ---------------------------------------------------------------------------
--
-- `pr-rc-kitchen` is stamped as updated RECENTLY, not on a fixed date. The
-- cross-module view `?updated=last_30_days` is a ROLLING window in the owner's
-- calendar, so a literal timestamp is inside it on the day it is written and
-- outside it a month later — at which point the view returns nothing, falls
-- back to its default, and a journey asserting "a project row opens a project"
-- clicks a Task instead. That is a fixture rotting, not a product change, and
-- it fails on every branch at once.
INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
VALUES
  ('pr-rc-kitchen', 'local-dev-workspace', 'project', 'Kitchen fit-out', '2026-03-02T00:00:00.000Z', strftime('%Y-%m-%dT%H:%M:%f000Z', 'now', '-2 days'), NULL),
  ('pr-rc-long', 'local-dev-workspace', 'project', 'Consolidate every household insurance, utility and subscription renewal into one annual review cycle', '2026-03-02T00:00:01.000Z', '2026-07-28T11:00:00.000Z', NULL);
INSERT OR IGNORE INTO spine_records (workspace_id, entity_id, kind, completed_at)
VALUES
  ('local-dev-workspace', 'pr-rc-kitchen', 'project', NULL),
  ('local-dev-workspace', 'pr-rc-long', 'project', NULL);
UPDATE spine_records SET completed_at = NULL
WHERE workspace_id = 'local-dev-workspace' AND entity_id IN ('pr-rc-kitchen', 'pr-rc-long');
-- Re-stamped on every seed, because `INSERT OR IGNORE` leaves an existing row
-- exactly as it was and this timestamp has to stay inside the rolling window.
UPDATE entities SET updated_at = strftime('%Y-%m-%dT%H:%M:%f000Z', 'now', '-2 days')
WHERE workspace_id = 'local-dev-workspace' AND id = 'pr-rc-kitchen';
INSERT OR IGNORE INTO project_details (workspace_id, entity_id, entity_type, status, archived_at, updated_at, icon_key)
VALUES
  ('local-dev-workspace', 'pr-rc-kitchen', 'project', 'active', NULL, strftime('%Y-%m-%dT%H:%M:%f000Z', 'now', '-2 days'), 'hammer'),
  ('local-dev-workspace', 'pr-rc-long', 'project', 'planned', NULL, '2026-07-28T11:00:00.000Z', NULL);
UPDATE project_details SET status = 'active', archived_at = NULL, icon_key = 'hammer',
    updated_at = strftime('%Y-%m-%dT%H:%M:%f000Z', 'now', '-2 days')
WHERE workspace_id = 'local-dev-workspace' AND entity_id = 'pr-rc-kitchen';
UPDATE project_details SET status = 'planned', archived_at = NULL
WHERE workspace_id = 'local-dev-workspace' AND entity_id = 'pr-rc-long';

-- Structural spine links. A Project has ONE structural parent: the kitchen
-- fit-out advances the Goal (and reaches the Area through it), while the
-- renewals project sits directly in the Area. Giving a Project both links would
-- make it a child of two parents, and the Goal's contribution roll-up would not
-- count it.
-- Remove the second parent an earlier revision of this fixture created. This
-- runs BEFORE the insert below: the spine allows a Project exactly one
-- structural parent, so while the Area link exists the Goal link is refused and
-- `INSERT OR IGNORE` swallows the refusal — leaving the Project with no parent
-- at all once the Area link is later removed.
DELETE FROM entity_links
WHERE workspace_id = 'local-dev-workspace' AND id = 'l-rc-kitchen-area';
INSERT OR IGNORE INTO entity_links (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
VALUES
  ('l-rc-goal-area', 'local-dev-workspace', 'g-rc-move', 'a-rc-home', 'goal.belongs_to_area', '2026-02-10T00:00:00.000Z', '2026-02-10T00:00:00.000Z', NULL),
  ('l-rc-kitchen-goal', 'local-dev-workspace', 'pr-rc-kitchen', 'g-rc-move', 'project.advances_goal', '2026-03-02T00:00:01.000Z', '2026-03-02T00:00:01.000Z', NULL),
  ('l-rc-long-area', 'local-dev-workspace', 'pr-rc-long', 'a-rc-home', 'project.belongs_to_area', '2026-03-02T00:00:02.000Z', '2026-03-02T00:00:02.000Z', NULL);
UPDATE entity_links SET deleted_at = NULL
WHERE workspace_id = 'local-dev-workspace'
  AND id IN ('l-rc-goal-area', 'l-rc-kitchen-goal', 'l-rc-long-area');

-- ---------------------------------------------------------------------------
-- The reference Project's task body: 24 tasks across every state the list can
-- show — done, in progress, overdue, due today, scheduled, waiting, on hold,
-- someday and cancelled. This is what makes the fold anchor meaningful.
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
VALUES
  ('t-rc-k01', 'local-dev-workspace', 'task', 'Measure the existing cabinetry run', '2026-03-01T00:00:00.000Z', '2026-03-04T09:00:00.000Z', NULL),
  ('t-rc-k02', 'local-dev-workspace', 'task', 'Collect three quotes from joiners', '2026-03-02T01:07:00.000Z', '2026-03-12T17:30:00.000Z', NULL),
  ('t-rc-k03', 'local-dev-workspace', 'task', 'Choose the benchtop material', '2026-03-03T02:14:00.000Z', '2026-03-20T20:10:00.000Z', NULL),
  ('t-rc-k04', 'local-dev-workspace', 'task', 'Sign the joinery contract', '2026-03-04T03:21:00.000Z', '2026-04-02T11:45:00.000Z', NULL),
  ('t-rc-k05', 'local-dev-workspace', 'task', 'Pay the joinery deposit', '2026-03-05T04:28:00.000Z', '2026-04-02T12:05:00.000Z', NULL),
  ('t-rc-k06', 'local-dev-workspace', 'task', 'Book the electrician for the rough-in', '2026-03-06T05:35:00.000Z', '2026-05-18T08:20:00.000Z', NULL),
  ('t-rc-k07', 'local-dev-workspace', 'task', 'Strip out the old kitchen', '2026-03-07T06:42:00.000Z', '2026-06-06T16:00:00.000Z', NULL),
  ('t-rc-k08', 'local-dev-workspace', 'task', 'Patch and skim the back wall', '2026-03-08T07:49:00.000Z', '2026-06-21T14:30:00.000Z', NULL),
  ('t-rc-k09', 'local-dev-workspace', 'task', 'Set up the temporary kitchen in the laundry', '2026-03-09T08:56:00.000Z', '2026-06-22T19:00:00.000Z', NULL),
  ('t-rc-k10', 'local-dev-workspace', 'task', 'Install the base cabinets', '2026-03-01T00:03:00.000Z', '2026-03-01T00:03:00.000Z', NULL),
  ('t-rc-k11', 'local-dev-workspace', 'task', 'Template the benchtop', '2026-03-02T01:10:00.000Z', '2026-03-02T01:10:00.000Z', NULL),
  ('t-rc-k12', 'local-dev-workspace', 'task', 'Chase the plumber about the sink cut-out', '2026-03-03T02:17:00.000Z', '2026-03-03T02:17:00.000Z', NULL),
  ('t-rc-k13', 'local-dev-workspace', 'task', 'Confirm the splashback tile order', '2026-03-04T03:24:00.000Z', '2026-03-04T03:24:00.000Z', NULL),
  ('t-rc-k14', 'local-dev-workspace', 'task', 'Approve the final electrical layout', '2026-03-05T04:31:00.000Z', '2026-03-05T04:31:00.000Z', NULL),
  ('t-rc-k15', 'local-dev-workspace', 'task', 'Order the cooktop and rangehood', '2026-03-06T05:38:00.000Z', '2026-03-06T05:38:00.000Z', NULL),
  ('t-rc-k16', 'local-dev-workspace', 'task', 'Arrange the appliance delivery window', '2026-03-07T06:45:00.000Z', '2026-03-07T06:45:00.000Z', NULL),
  ('t-rc-k17', 'local-dev-workspace', 'task', 'Book the final building inspection', '2026-03-08T07:52:00.000Z', '2026-03-08T07:52:00.000Z', NULL),
  ('t-rc-k18', 'local-dev-workspace', 'task', 'Await the stone supplier''s lead time', '2026-03-09T08:59:00.000Z', '2026-03-09T08:59:00.000Z', NULL),
  ('t-rc-k19', 'local-dev-workspace', 'task', 'Await council sign-off on the window change', '2026-03-01T00:06:00.000Z', '2026-03-01T00:06:00.000Z', NULL),
  ('t-rc-k20', 'local-dev-workspace', 'task', 'Decide on the pantry door handles', '2026-03-02T01:13:00.000Z', '2026-03-02T01:13:00.000Z', NULL),
  ('t-rc-k21', 'local-dev-workspace', 'task', 'Re-tile the laundry to match', '2026-03-03T02:20:00.000Z', '2026-03-03T02:20:00.000Z', NULL),
  ('t-rc-k22', 'local-dev-workspace', 'task', 'Replace the hallway light fittings', '2026-03-04T03:27:00.000Z', '2026-03-04T03:27:00.000Z', NULL),
  ('t-rc-k23', 'local-dev-workspace', 'task', 'Look into a butler''s pantry conversion', '2026-03-05T04:34:00.000Z', '2026-03-05T04:34:00.000Z', NULL),
  ('t-rc-k24', 'local-dev-workspace', 'task', 'Cancel the skip bin hire', '2026-03-06T05:41:00.000Z', '2026-03-06T05:41:00.000Z', NULL);
INSERT OR IGNORE INTO spine_records (workspace_id, entity_id, kind, completed_at)
VALUES
  ('local-dev-workspace', 't-rc-k01', 'task', '2026-03-04T09:00:00.000Z'),
  ('local-dev-workspace', 't-rc-k02', 'task', '2026-03-12T17:30:00.000Z'),
  ('local-dev-workspace', 't-rc-k03', 'task', '2026-03-20T20:10:00.000Z'),
  ('local-dev-workspace', 't-rc-k04', 'task', '2026-04-02T11:45:00.000Z'),
  ('local-dev-workspace', 't-rc-k05', 'task', '2026-04-02T12:05:00.000Z'),
  ('local-dev-workspace', 't-rc-k06', 'task', '2026-05-18T08:20:00.000Z'),
  ('local-dev-workspace', 't-rc-k07', 'task', '2026-06-06T16:00:00.000Z'),
  ('local-dev-workspace', 't-rc-k08', 'task', '2026-06-21T14:30:00.000Z'),
  ('local-dev-workspace', 't-rc-k09', 'task', '2026-06-22T19:00:00.000Z'),
  ('local-dev-workspace', 't-rc-k10', 'task', NULL),
  ('local-dev-workspace', 't-rc-k11', 'task', NULL),
  ('local-dev-workspace', 't-rc-k12', 'task', NULL),
  ('local-dev-workspace', 't-rc-k13', 'task', NULL),
  ('local-dev-workspace', 't-rc-k14', 'task', NULL),
  ('local-dev-workspace', 't-rc-k15', 'task', NULL),
  ('local-dev-workspace', 't-rc-k16', 'task', NULL),
  ('local-dev-workspace', 't-rc-k17', 'task', NULL),
  ('local-dev-workspace', 't-rc-k18', 'task', NULL),
  ('local-dev-workspace', 't-rc-k19', 'task', NULL),
  ('local-dev-workspace', 't-rc-k20', 'task', NULL),
  ('local-dev-workspace', 't-rc-k21', 'task', NULL),
  ('local-dev-workspace', 't-rc-k22', 'task', NULL),
  ('local-dev-workspace', 't-rc-k23', 'task', NULL),
  ('local-dev-workspace', 't-rc-k24', 'task', NULL);
-- Re-assert completion state so a run that toggled a task starts clean.
UPDATE spine_records SET completed_at = '2026-03-04T09:00:00.000Z' WHERE workspace_id = 'local-dev-workspace' AND entity_id = 't-rc-k01';
UPDATE spine_records SET completed_at = '2026-03-12T17:30:00.000Z' WHERE workspace_id = 'local-dev-workspace' AND entity_id = 't-rc-k02';
UPDATE spine_records SET completed_at = '2026-03-20T20:10:00.000Z' WHERE workspace_id = 'local-dev-workspace' AND entity_id = 't-rc-k03';
UPDATE spine_records SET completed_at = '2026-04-02T11:45:00.000Z' WHERE workspace_id = 'local-dev-workspace' AND entity_id = 't-rc-k04';
UPDATE spine_records SET completed_at = '2026-04-02T12:05:00.000Z' WHERE workspace_id = 'local-dev-workspace' AND entity_id = 't-rc-k05';
UPDATE spine_records SET completed_at = '2026-05-18T08:20:00.000Z' WHERE workspace_id = 'local-dev-workspace' AND entity_id = 't-rc-k06';
UPDATE spine_records SET completed_at = '2026-06-06T16:00:00.000Z' WHERE workspace_id = 'local-dev-workspace' AND entity_id = 't-rc-k07';
UPDATE spine_records SET completed_at = '2026-06-21T14:30:00.000Z' WHERE workspace_id = 'local-dev-workspace' AND entity_id = 't-rc-k08';
UPDATE spine_records SET completed_at = '2026-06-22T19:00:00.000Z' WHERE workspace_id = 'local-dev-workspace' AND entity_id = 't-rc-k09';
UPDATE spine_records SET completed_at = NULL WHERE workspace_id = 'local-dev-workspace' AND entity_id = 't-rc-k10';
UPDATE spine_records SET completed_at = NULL WHERE workspace_id = 'local-dev-workspace' AND entity_id = 't-rc-k11';
UPDATE spine_records SET completed_at = NULL WHERE workspace_id = 'local-dev-workspace' AND entity_id = 't-rc-k12';
UPDATE spine_records SET completed_at = NULL WHERE workspace_id = 'local-dev-workspace' AND entity_id = 't-rc-k13';
UPDATE spine_records SET completed_at = NULL WHERE workspace_id = 'local-dev-workspace' AND entity_id = 't-rc-k14';
UPDATE spine_records SET completed_at = NULL WHERE workspace_id = 'local-dev-workspace' AND entity_id = 't-rc-k15';
UPDATE spine_records SET completed_at = NULL WHERE workspace_id = 'local-dev-workspace' AND entity_id = 't-rc-k16';
UPDATE spine_records SET completed_at = NULL WHERE workspace_id = 'local-dev-workspace' AND entity_id = 't-rc-k17';
UPDATE spine_records SET completed_at = NULL WHERE workspace_id = 'local-dev-workspace' AND entity_id = 't-rc-k18';
UPDATE spine_records SET completed_at = NULL WHERE workspace_id = 'local-dev-workspace' AND entity_id = 't-rc-k19';
UPDATE spine_records SET completed_at = NULL WHERE workspace_id = 'local-dev-workspace' AND entity_id = 't-rc-k20';
UPDATE spine_records SET completed_at = NULL WHERE workspace_id = 'local-dev-workspace' AND entity_id = 't-rc-k21';
UPDATE spine_records SET completed_at = NULL WHERE workspace_id = 'local-dev-workspace' AND entity_id = 't-rc-k22';
UPDATE spine_records SET completed_at = NULL WHERE workspace_id = 'local-dev-workspace' AND entity_id = 't-rc-k23';
UPDATE spine_records SET completed_at = NULL WHERE workspace_id = 'local-dev-workspace' AND entity_id = 't-rc-k24';
INSERT OR IGNORE INTO entity_links (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
VALUES
  ('l-rc-k01', 'local-dev-workspace', 't-rc-k01', 'pr-rc-kitchen', 'task.belongs_to_project', '2026-03-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z', NULL),
  ('l-rc-k02', 'local-dev-workspace', 't-rc-k02', 'pr-rc-kitchen', 'task.belongs_to_project', '2026-03-02T01:07:00.000Z', '2026-03-02T01:07:00.000Z', NULL),
  ('l-rc-k03', 'local-dev-workspace', 't-rc-k03', 'pr-rc-kitchen', 'task.belongs_to_project', '2026-03-03T02:14:00.000Z', '2026-03-03T02:14:00.000Z', NULL),
  ('l-rc-k04', 'local-dev-workspace', 't-rc-k04', 'pr-rc-kitchen', 'task.belongs_to_project', '2026-03-04T03:21:00.000Z', '2026-03-04T03:21:00.000Z', NULL),
  ('l-rc-k05', 'local-dev-workspace', 't-rc-k05', 'pr-rc-kitchen', 'task.belongs_to_project', '2026-03-05T04:28:00.000Z', '2026-03-05T04:28:00.000Z', NULL),
  ('l-rc-k06', 'local-dev-workspace', 't-rc-k06', 'pr-rc-kitchen', 'task.belongs_to_project', '2026-03-06T05:35:00.000Z', '2026-03-06T05:35:00.000Z', NULL),
  ('l-rc-k07', 'local-dev-workspace', 't-rc-k07', 'pr-rc-kitchen', 'task.belongs_to_project', '2026-03-07T06:42:00.000Z', '2026-03-07T06:42:00.000Z', NULL),
  ('l-rc-k08', 'local-dev-workspace', 't-rc-k08', 'pr-rc-kitchen', 'task.belongs_to_project', '2026-03-08T07:49:00.000Z', '2026-03-08T07:49:00.000Z', NULL),
  ('l-rc-k09', 'local-dev-workspace', 't-rc-k09', 'pr-rc-kitchen', 'task.belongs_to_project', '2026-03-09T08:56:00.000Z', '2026-03-09T08:56:00.000Z', NULL),
  ('l-rc-k10', 'local-dev-workspace', 't-rc-k10', 'pr-rc-kitchen', 'task.belongs_to_project', '2026-03-01T00:03:00.000Z', '2026-03-01T00:03:00.000Z', NULL),
  ('l-rc-k11', 'local-dev-workspace', 't-rc-k11', 'pr-rc-kitchen', 'task.belongs_to_project', '2026-03-02T01:10:00.000Z', '2026-03-02T01:10:00.000Z', NULL),
  ('l-rc-k12', 'local-dev-workspace', 't-rc-k12', 'pr-rc-kitchen', 'task.belongs_to_project', '2026-03-03T02:17:00.000Z', '2026-03-03T02:17:00.000Z', NULL),
  ('l-rc-k13', 'local-dev-workspace', 't-rc-k13', 'pr-rc-kitchen', 'task.belongs_to_project', '2026-03-04T03:24:00.000Z', '2026-03-04T03:24:00.000Z', NULL),
  ('l-rc-k14', 'local-dev-workspace', 't-rc-k14', 'pr-rc-kitchen', 'task.belongs_to_project', '2026-03-05T04:31:00.000Z', '2026-03-05T04:31:00.000Z', NULL),
  ('l-rc-k15', 'local-dev-workspace', 't-rc-k15', 'pr-rc-kitchen', 'task.belongs_to_project', '2026-03-06T05:38:00.000Z', '2026-03-06T05:38:00.000Z', NULL),
  ('l-rc-k16', 'local-dev-workspace', 't-rc-k16', 'pr-rc-kitchen', 'task.belongs_to_project', '2026-03-07T06:45:00.000Z', '2026-03-07T06:45:00.000Z', NULL),
  ('l-rc-k17', 'local-dev-workspace', 't-rc-k17', 'pr-rc-kitchen', 'task.belongs_to_project', '2026-03-08T07:52:00.000Z', '2026-03-08T07:52:00.000Z', NULL),
  ('l-rc-k18', 'local-dev-workspace', 't-rc-k18', 'pr-rc-kitchen', 'task.belongs_to_project', '2026-03-09T08:59:00.000Z', '2026-03-09T08:59:00.000Z', NULL),
  ('l-rc-k19', 'local-dev-workspace', 't-rc-k19', 'pr-rc-kitchen', 'task.belongs_to_project', '2026-03-01T00:06:00.000Z', '2026-03-01T00:06:00.000Z', NULL),
  ('l-rc-k20', 'local-dev-workspace', 't-rc-k20', 'pr-rc-kitchen', 'task.belongs_to_project', '2026-03-02T01:13:00.000Z', '2026-03-02T01:13:00.000Z', NULL),
  ('l-rc-k21', 'local-dev-workspace', 't-rc-k21', 'pr-rc-kitchen', 'task.belongs_to_project', '2026-03-03T02:20:00.000Z', '2026-03-03T02:20:00.000Z', NULL),
  ('l-rc-k22', 'local-dev-workspace', 't-rc-k22', 'pr-rc-kitchen', 'task.belongs_to_project', '2026-03-04T03:27:00.000Z', '2026-03-04T03:27:00.000Z', NULL),
  ('l-rc-k23', 'local-dev-workspace', 't-rc-k23', 'pr-rc-kitchen', 'task.belongs_to_project', '2026-03-05T04:34:00.000Z', '2026-03-05T04:34:00.000Z', NULL),
  ('l-rc-k24', 'local-dev-workspace', 't-rc-k24', 'pr-rc-kitchen', 'task.belongs_to_project', '2026-03-06T05:41:00.000Z', '2026-03-06T05:41:00.000Z', NULL);
UPDATE entity_links SET deleted_at = NULL WHERE workspace_id = 'local-dev-workspace' AND id IN ('l-rc-k01', 'l-rc-k02', 'l-rc-k03', 'l-rc-k04', 'l-rc-k05', 'l-rc-k06', 'l-rc-k07', 'l-rc-k08', 'l-rc-k09', 'l-rc-k10', 'l-rc-k11', 'l-rc-k12', 'l-rc-k13', 'l-rc-k14', 'l-rc-k15', 'l-rc-k16', 'l-rc-k17', 'l-rc-k18', 'l-rc-k19', 'l-rc-k20', 'l-rc-k21', 'l-rc-k22', 'l-rc-k23', 'l-rc-k24');
INSERT OR IGNORE INTO task_details
  (workspace_id, entity_id, entity_type, status, priority, due_date, scheduled_date, time_sector, commitment_state, description, waiting_since, waiting_note, updated_at)
VALUES
  ('local-dev-workspace', 't-rc-k01', 'task', 'todo', 'p2', NULL, NULL, NULL, 'active', NULL, NULL, NULL, '2026-03-04T09:00:00.000Z'),
  ('local-dev-workspace', 't-rc-k02', 'task', 'todo', 'p1', NULL, NULL, NULL, 'active', NULL, NULL, NULL, '2026-03-12T17:30:00.000Z'),
  ('local-dev-workspace', 't-rc-k03', 'task', 'todo', 'p2', NULL, NULL, NULL, 'active', NULL, NULL, NULL, '2026-03-20T20:10:00.000Z'),
  ('local-dev-workspace', 't-rc-k04', 'task', 'todo', 'p1', NULL, NULL, NULL, 'active', NULL, NULL, NULL, '2026-04-02T11:45:00.000Z'),
  ('local-dev-workspace', 't-rc-k05', 'task', 'todo', 'p1', NULL, NULL, NULL, 'active', NULL, NULL, NULL, '2026-04-02T12:05:00.000Z'),
  ('local-dev-workspace', 't-rc-k06', 'task', 'todo', 'p2', NULL, NULL, NULL, 'active', NULL, NULL, NULL, '2026-05-18T08:20:00.000Z'),
  ('local-dev-workspace', 't-rc-k07', 'task', 'todo', 'p1', NULL, NULL, NULL, 'active', NULL, NULL, NULL, '2026-06-06T16:00:00.000Z'),
  ('local-dev-workspace', 't-rc-k08', 'task', 'todo', 'p3', NULL, NULL, NULL, 'active', NULL, NULL, NULL, '2026-06-21T14:30:00.000Z'),
  ('local-dev-workspace', 't-rc-k09', 'task', 'todo', 'p2', NULL, NULL, NULL, 'active', NULL, NULL, NULL, '2026-06-22T19:00:00.000Z'),
  ('local-dev-workspace', 't-rc-k10', 'task', 'in_progress', 'p1', '2026-08-10', '2026-08-07', 'this_week', 'active', 'Carcasses are in; doors and drawer fronts land Thursday.', NULL, NULL, '2026-03-01T00:03:00.000Z'),
  ('local-dev-workspace', 't-rc-k11', 'task', 'in_progress', 'p1', '2026-08-12', '2026-08-08', 'this_week', 'active', NULL, NULL, NULL, '2026-03-02T01:10:00.000Z'),
  ('local-dev-workspace', 't-rc-k12', 'task', 'todo', 'p1', '2026-07-30', NULL, 'this_week', 'active', 'Overdue — third attempt.', NULL, NULL, '2026-03-03T02:17:00.000Z'),
  ('local-dev-workspace', 't-rc-k13', 'task', 'todo', 'p2', '2026-08-03', NULL, 'this_week', 'active', NULL, NULL, NULL, '2026-03-04T03:24:00.000Z'),
  ('local-dev-workspace', 't-rc-k14', 'task', 'todo', 'p1', '2026-08-07', NULL, 'this_week', 'active', NULL, NULL, NULL, '2026-03-05T04:31:00.000Z'),
  ('local-dev-workspace', 't-rc-k15', 'task', 'todo', 'p2', '2026-08-14', NULL, 'this_week', 'active', NULL, NULL, NULL, '2026-03-06T05:38:00.000Z'),
  ('local-dev-workspace', 't-rc-k16', 'task', 'todo', 'p3', '2026-08-18', NULL, 'next_week', 'active', NULL, NULL, NULL, '2026-03-07T06:45:00.000Z'),
  ('local-dev-workspace', 't-rc-k17', 'task', 'todo', 'p2', date('now', '+31 days'), NULL, 'this_month', 'active', NULL, NULL, NULL, '2026-03-08T07:52:00.000Z'),
  ('local-dev-workspace', 't-rc-k18', 'task', 'todo', 'p2', NULL, NULL, 'this_week', 'active', NULL, '2026-07-27T00:00:00.000Z', 'Supplier said ''end of the month'' on 27 July.', '2026-03-09T08:59:00.000Z'),
  ('local-dev-workspace', 't-rc-k19', 'task', 'todo', 'p1', NULL, NULL, 'this_month', 'active', NULL, '2026-07-15T00:00:00.000Z', 'Lodged 15 July; 20 business days quoted.', '2026-03-01T00:06:00.000Z'),
  ('local-dev-workspace', 't-rc-k20', 'task', 'on_hold', 'p3', NULL, NULL, NULL, 'active', 'Paused until the cabinetry colour is locked in.', NULL, NULL, '2026-03-02T01:13:00.000Z'),
  ('local-dev-workspace', 't-rc-k21', 'task', 'on_hold', 'p4', NULL, NULL, 'long_term', 'active', NULL, NULL, NULL, '2026-03-03T02:20:00.000Z'),
  ('local-dev-workspace', 't-rc-k22', 'task', 'todo', 'p4', NULL, NULL, 'long_term', 'someday', NULL, NULL, NULL, '2026-03-04T03:27:00.000Z'),
  ('local-dev-workspace', 't-rc-k23', 'task', 'todo', NULL, NULL, NULL, 'long_term', 'someday', NULL, NULL, NULL, '2026-03-05T04:34:00.000Z'),
  ('local-dev-workspace', 't-rc-k24', 'task', 'cancelled', 'p4', NULL, NULL, NULL, 'active', 'Builder is taking the waste.', NULL, NULL, '2026-03-06T05:41:00.000Z');
UPDATE task_details SET status = 'todo', priority = 'p2', due_date = NULL, scheduled_date = NULL, time_sector = NULL, commitment_state = 'active', description = NULL, waiting_since = NULL, waiting_note = NULL WHERE workspace_id = 'local-dev-workspace' AND entity_id = 't-rc-k01';
UPDATE task_details SET status = 'todo', priority = 'p1', due_date = NULL, scheduled_date = NULL, time_sector = NULL, commitment_state = 'active', description = NULL, waiting_since = NULL, waiting_note = NULL WHERE workspace_id = 'local-dev-workspace' AND entity_id = 't-rc-k02';
UPDATE task_details SET status = 'todo', priority = 'p2', due_date = NULL, scheduled_date = NULL, time_sector = NULL, commitment_state = 'active', description = NULL, waiting_since = NULL, waiting_note = NULL WHERE workspace_id = 'local-dev-workspace' AND entity_id = 't-rc-k03';
UPDATE task_details SET status = 'todo', priority = 'p1', due_date = NULL, scheduled_date = NULL, time_sector = NULL, commitment_state = 'active', description = NULL, waiting_since = NULL, waiting_note = NULL WHERE workspace_id = 'local-dev-workspace' AND entity_id = 't-rc-k04';
UPDATE task_details SET status = 'todo', priority = 'p1', due_date = NULL, scheduled_date = NULL, time_sector = NULL, commitment_state = 'active', description = NULL, waiting_since = NULL, waiting_note = NULL WHERE workspace_id = 'local-dev-workspace' AND entity_id = 't-rc-k05';
UPDATE task_details SET status = 'todo', priority = 'p2', due_date = NULL, scheduled_date = NULL, time_sector = NULL, commitment_state = 'active', description = NULL, waiting_since = NULL, waiting_note = NULL WHERE workspace_id = 'local-dev-workspace' AND entity_id = 't-rc-k06';
UPDATE task_details SET status = 'todo', priority = 'p1', due_date = NULL, scheduled_date = NULL, time_sector = NULL, commitment_state = 'active', description = NULL, waiting_since = NULL, waiting_note = NULL WHERE workspace_id = 'local-dev-workspace' AND entity_id = 't-rc-k07';
UPDATE task_details SET status = 'todo', priority = 'p3', due_date = NULL, scheduled_date = NULL, time_sector = NULL, commitment_state = 'active', description = NULL, waiting_since = NULL, waiting_note = NULL WHERE workspace_id = 'local-dev-workspace' AND entity_id = 't-rc-k08';
UPDATE task_details SET status = 'todo', priority = 'p2', due_date = NULL, scheduled_date = NULL, time_sector = NULL, commitment_state = 'active', description = NULL, waiting_since = NULL, waiting_note = NULL WHERE workspace_id = 'local-dev-workspace' AND entity_id = 't-rc-k09';
UPDATE task_details SET status = 'in_progress', priority = 'p1', due_date = '2026-08-10', scheduled_date = '2026-08-07', time_sector = 'this_week', commitment_state = 'active', description = 'Carcasses are in; doors and drawer fronts land Thursday.', waiting_since = NULL, waiting_note = NULL WHERE workspace_id = 'local-dev-workspace' AND entity_id = 't-rc-k10';
UPDATE task_details SET status = 'in_progress', priority = 'p1', due_date = '2026-08-12', scheduled_date = '2026-08-08', time_sector = 'this_week', commitment_state = 'active', description = NULL, waiting_since = NULL, waiting_note = NULL WHERE workspace_id = 'local-dev-workspace' AND entity_id = 't-rc-k11';
UPDATE task_details SET status = 'todo', priority = 'p1', due_date = '2026-07-30', scheduled_date = NULL, time_sector = 'this_week', commitment_state = 'active', description = 'Overdue — third attempt.', waiting_since = NULL, waiting_note = NULL WHERE workspace_id = 'local-dev-workspace' AND entity_id = 't-rc-k12';
UPDATE task_details SET status = 'todo', priority = 'p2', due_date = '2026-08-03', scheduled_date = NULL, time_sector = 'this_week', commitment_state = 'active', description = NULL, waiting_since = NULL, waiting_note = NULL WHERE workspace_id = 'local-dev-workspace' AND entity_id = 't-rc-k13';
UPDATE task_details SET status = 'todo', priority = 'p1', due_date = '2026-08-07', scheduled_date = NULL, time_sector = 'this_week', commitment_state = 'active', description = NULL, waiting_since = NULL, waiting_note = NULL WHERE workspace_id = 'local-dev-workspace' AND entity_id = 't-rc-k14';
UPDATE task_details SET status = 'todo', priority = 'p2', due_date = '2026-08-14', scheduled_date = NULL, time_sector = 'this_week', commitment_state = 'active', description = NULL, waiting_since = NULL, waiting_note = NULL WHERE workspace_id = 'local-dev-workspace' AND entity_id = 't-rc-k15';
UPDATE task_details SET status = 'todo', priority = 'p3', due_date = '2026-08-18', scheduled_date = NULL, time_sector = 'next_week', commitment_state = 'active', description = NULL, waiting_since = NULL, waiting_note = NULL WHERE workspace_id = 'local-dev-workspace' AND entity_id = 't-rc-k16';
UPDATE task_details SET status = 'todo', priority = 'p2', due_date = date('now', '+31 days'), scheduled_date = NULL, time_sector = 'this_month', commitment_state = 'active', description = NULL, waiting_since = NULL, waiting_note = NULL WHERE workspace_id = 'local-dev-workspace' AND entity_id = 't-rc-k17';
UPDATE task_details SET status = 'todo', priority = 'p2', due_date = NULL, scheduled_date = NULL, time_sector = 'this_week', commitment_state = 'active', description = NULL, waiting_since = '2026-07-27T00:00:00.000Z', waiting_note = 'Supplier said ''end of the month'' on 27 July.' WHERE workspace_id = 'local-dev-workspace' AND entity_id = 't-rc-k18';
UPDATE task_details SET status = 'todo', priority = 'p1', due_date = NULL, scheduled_date = NULL, time_sector = 'this_month', commitment_state = 'active', description = NULL, waiting_since = '2026-07-15T00:00:00.000Z', waiting_note = 'Lodged 15 July; 20 business days quoted.' WHERE workspace_id = 'local-dev-workspace' AND entity_id = 't-rc-k19';
UPDATE task_details SET status = 'on_hold', priority = 'p3', due_date = NULL, scheduled_date = NULL, time_sector = NULL, commitment_state = 'active', description = 'Paused until the cabinetry colour is locked in.', waiting_since = NULL, waiting_note = NULL WHERE workspace_id = 'local-dev-workspace' AND entity_id = 't-rc-k20';
UPDATE task_details SET status = 'on_hold', priority = 'p4', due_date = NULL, scheduled_date = NULL, time_sector = 'long_term', commitment_state = 'active', description = NULL, waiting_since = NULL, waiting_note = NULL WHERE workspace_id = 'local-dev-workspace' AND entity_id = 't-rc-k21';
UPDATE task_details SET status = 'todo', priority = 'p4', due_date = NULL, scheduled_date = NULL, time_sector = 'long_term', commitment_state = 'someday', description = NULL, waiting_since = NULL, waiting_note = NULL WHERE workspace_id = 'local-dev-workspace' AND entity_id = 't-rc-k22';
UPDATE task_details SET status = 'todo', priority = NULL, due_date = NULL, scheduled_date = NULL, time_sector = 'long_term', commitment_state = 'someday', description = NULL, waiting_since = NULL, waiting_note = NULL WHERE workspace_id = 'local-dev-workspace' AND entity_id = 't-rc-k23';
UPDATE task_details SET status = 'cancelled', priority = 'p4', due_date = NULL, scheduled_date = NULL, time_sector = NULL, commitment_state = 'active', description = 'Builder is taking the waste.', waiting_since = NULL, waiting_note = NULL WHERE workspace_id = 'local-dev-workspace' AND entity_id = 't-rc-k24';

-- ---------------------------------------------------------------------------
-- A Meeting with a genuinely populated body: agenda, decisions, actions and
-- outcomes. The capture model can only be judged against a meeting that has
-- something in it.
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
VALUES
  ('m-rc-site', 'local-dev-workspace', 'meeting', 'Kitchen fit-out site walkthrough', '2026-08-05T00:00:00.000Z', '2026-08-06T23:40:00.000Z', NULL);
INSERT OR IGNORE INTO meeting_details
  (workspace_id, entity_id, entity_type, starts_at, ends_at, timezone, location, mode, meeting_url, status, agenda_markdown, notes_markdown, archived_at, updated_at, held_at)
VALUES
  ('local-dev-workspace', 'm-rc-site', 'meeting', '2026-08-06T23:00:00.000Z', '2026-08-07T00:00:00.000Z', 'Australia/Sydney', 'On site — 14 Bramley St', 'in_person', NULL, 'planned',
   'Walk the ground floor with Dan before the benchtop template goes in.', '', NULL, '2026-08-06T23:40:00.000Z', NULL);
UPDATE meeting_details
SET starts_at = '2026-08-06T23:00:00.000Z', ends_at = '2026-08-07T00:00:00.000Z',
    timezone = 'Australia/Sydney', location = 'On site — 14 Bramley St', mode = 'in_person',
    meeting_url = NULL, status = 'planned', held_at = NULL, archived_at = NULL,
    agenda_markdown = 'Walk the ground floor with Dan before the benchtop template goes in.',
    notes_markdown = ''
WHERE workspace_id = 'local-dev-workspace' AND entity_id = 'm-rc-site';

DELETE FROM meeting_items WHERE workspace_id = 'local-dev-workspace' AND meeting_id = 'm-rc-site';
INSERT INTO meeting_items (workspace_id, id, meeting_id, kind, body_markdown, position, created_at, updated_at)
VALUES
  ('local-dev-workspace', 'mi-rc-a1', 'm-rc-site', 'agenda', 'Confirm the sink cut-out position against the plumbing rough-in', 0, '2026-08-06T23:02:00.000Z', '2026-08-06T23:02:00.000Z'),
  ('local-dev-workspace', 'mi-rc-a2', 'm-rc-site', 'agenda', 'Splashback height — full wall or 600mm?', 1, '2026-08-06T23:03:00.000Z', '2026-08-06T23:03:00.000Z'),
  ('local-dev-workspace', 'mi-rc-a3', 'm-rc-site', 'agenda', 'Appliance delivery window and where we store them', 2, '2026-08-06T23:04:00.000Z', '2026-08-06T23:04:00.000Z'),
  ('local-dev-workspace', 'mi-rc-a4', 'm-rc-site', 'agenda', 'Revised finish date now the window change is with council', 3, '2026-08-06T23:05:00.000Z', '2026-08-06T23:05:00.000Z'),
  ('local-dev-workspace', 'mi-rc-d1', 'm-rc-site', 'decision', 'Splashback goes full height behind the cooktop, 600mm elsewhere', 0, '2026-08-06T23:12:00.000Z', '2026-08-06T23:12:00.000Z'),
  ('local-dev-workspace', 'mi-rc-d2', 'm-rc-site', 'decision', 'Sink moves 80mm left so the cut-out clears the waste stack', 1, '2026-08-06T23:16:00.000Z', '2026-08-06T23:16:00.000Z'),
  ('local-dev-workspace', 'mi-rc-d3', 'm-rc-site', 'decision', 'Appliances stay in the garage until the benchtop is in', 2, '2026-08-06T23:21:00.000Z', '2026-08-06T23:21:00.000Z'),
  ('local-dev-workspace', 'mi-rc-o1', 'm-rc-site', 'outcome', 'Template can proceed on Monday as planned', 0, '2026-08-06T23:30:00.000Z', '2026-08-06T23:30:00.000Z'),
  ('local-dev-workspace', 'mi-rc-o2', 'm-rc-site', 'outcome', 'Finish date holds at late September if council replies inside 20 days', 1, '2026-08-06T23:32:00.000Z', '2026-08-06T23:32:00.000Z'),
  ('local-dev-workspace', 'mi-rc-x1', 'm-rc-site', 'action', 'Send Dan the revised sink position drawing', 0, '2026-08-06T23:34:00.000Z', '2026-08-06T23:34:00.000Z'),
  ('local-dev-workspace', 'mi-rc-x2', 'm-rc-site', 'action', 'Ring the plumber to re-book the waste-stack adjustment', 1, '2026-08-06T23:36:00.000Z', '2026-08-06T23:36:00.000Z'),
  ('local-dev-workspace', 'mi-rc-x3', 'm-rc-site', 'action', 'Chase council on the window variation', 2, '2026-08-06T23:38:00.000Z', '2026-08-06T23:38:00.000Z');

-- ---------------------------------------------------------------------------
-- Two People: one with full contact data, one deliberately sparse. The Person
-- action hierarchy (UIQ-011) has to be right in BOTH cases.
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
VALUES
  ('p-rc-dan', 'local-dev-workspace', 'person', 'Dan Whitfield', '2026-03-02T00:00:00.000Z', '2026-08-06T23:45:00.000Z', NULL),
  ('p-rc-ana', 'local-dev-workspace', 'person', 'Ana Ruiz', '2026-06-14T00:00:00.000Z', '2026-06-14T00:00:00.000Z', NULL);
INSERT OR IGNORE INTO person_details
  (workspace_id, entity_id, entity_type, preferred_name, first_name, last_name, pronouns, organisation, role, department,
   email, secondary_email, mobile, work_phone, address, website, birthday, relationship, notes,
   favourite_contact_method, follow_up_frequency, next_follow_up, last_interaction, updated_at)
VALUES
  ('local-dev-workspace', 'p-rc-dan', 'person', 'Dan', 'Daniel', 'Whitfield', 'he/him', 'Whitfield Building Co.', 'Site foreman', 'Residential',
   'dan@whitfieldbuilding.example', 'accounts@whitfieldbuilding.example', '+61 412 774 903', '+61 2 9412 0088',
   '3/22 Kembla Road, Marrickville NSW 2204', 'https://whitfieldbuilding.example', '1979-04-18', 'Builder',
   'Prefers a phone call before 7am. Sends invoices fortnightly.',
   'phone', 'weekly', '2026-08-12', '2026-08-06', '2026-08-06T23:45:00.000Z'),
  ('local-dev-workspace', 'p-rc-ana', 'person', NULL, 'Ana', 'Ruiz', NULL, 'Marrickville Council', NULL, NULL,
   NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-06-14T00:00:00.000Z');
UPDATE person_details
SET preferred_name = 'Dan', first_name = 'Daniel', last_name = 'Whitfield', pronouns = 'he/him',
    organisation = 'Whitfield Building Co.', role = 'Site foreman', department = 'Residential',
    email = 'dan@whitfieldbuilding.example', secondary_email = 'accounts@whitfieldbuilding.example',
    mobile = '+61 412 774 903', work_phone = '+61 2 9412 0088',
    address = '3/22 Kembla Road, Marrickville NSW 2204', website = 'https://whitfieldbuilding.example',
    birthday = '1979-04-18', relationship = 'Builder',
    notes = 'Prefers a phone call before 7am. Sends invoices fortnightly.',
    favourite_contact_method = 'phone', follow_up_frequency = 'weekly', next_follow_up = '2026-08-12',
    last_interaction = '2026-08-06', archived_at = NULL
WHERE workspace_id = 'local-dev-workspace' AND entity_id = 'p-rc-dan';
UPDATE person_details
SET preferred_name = NULL, first_name = 'Ana', last_name = 'Ruiz', pronouns = NULL,
    organisation = 'Marrickville Council', role = NULL, department = NULL,
    email = NULL, secondary_email = NULL, mobile = NULL, work_phone = NULL,
    address = NULL, website = NULL, birthday = NULL, relationship = NULL, notes = NULL,
    favourite_contact_method = NULL, follow_up_frequency = NULL, next_follow_up = NULL,
    last_interaction = NULL, archived_at = NULL
WHERE workspace_id = 'local-dev-workspace' AND entity_id = 'p-rc-ana';

-- ---------------------------------------------------------------------------
-- An Asset with a real maintenance/renewal situation: open obligations with a
-- next one due, plus a history of services, repairs, meter readings and a
-- valuation. This is what the Asset overview and History action hierarchy need.
--
-- CONV-00-E / DEBT-219 — every OPEN obligation's due date, and the asset's own
-- next-service and renewal dates, are `date('now', …)` offsets rather than
-- fixed days: the offsets are the ones the fixture was written with (from
-- 2026-08-01), so the situation it describes is the same on every run and no
-- obligation ever crosses its due date because the calendar advanced. The
-- inspection used to be '2026-08-28'; on 2026-08-29 it went overdue and an
-- Assets journey went red for no regression at all. Completed history keeps
-- its real dates.
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
VALUES
  ('as-rc-ute', 'local-dev-workspace', 'asset', 'Hilux SR5 — work ute', '2024-05-11T00:00:00.000Z', '2026-08-01T02:00:00.000Z', NULL);
INSERT OR IGNORE INTO asset_details
  (workspace_id, entity_id, entity_type, asset_type, status, description, manufacturer, model, serial_number,
   reference_code, location, area_id, acquisition_date, purchase_price_minor, currency_code, supplier,
   replacement_value_minor, warranty_expiry, service_interval, last_service_date, next_service_date,
   service_provider, maintenance_notes, issuer, reference_number, issue_date, renewal_date,
   archived_at, updated_at, current_meter_value, current_meter_unit, current_meter_date)
VALUES
  ('local-dev-workspace', 'as-rc-ute', 'asset', 'vehicle', 'active',
   'Dual-cab used for site runs and the trailer.', 'Toyota', 'Hilux SR5 (2021)', 'JTMHV05J004123987',
   'RC-UTE-01', 'Driveway', 'a-rc-home', '2024-05-11', 5620000, 'AUD', 'Northshore Toyota',
   4100000, '2027-05-10', '10000 km / 6 months', '2026-05-02', date('now', '+93 days'), -- fixed-date: the warranty runs three years from the 2024-05-11 purchase; nothing asserts on it
   'Northshore Toyota Service', 'Tows the trailer most weekends — service on the shorter interval.',
   'Transport for NSW', 'CJ88QR', '2024-05-11', date('now', '+44 days'),
   NULL, '2026-08-01T02:00:00.000Z', 74210, 'km', '2026-08-01');
UPDATE asset_details
SET asset_type = 'vehicle', status = 'active',
    description = 'Dual-cab used for site runs and the trailer.',
    manufacturer = 'Toyota', model = 'Hilux SR5 (2021)', serial_number = 'JTMHV05J004123987',
    reference_code = 'RC-UTE-01', location = 'Driveway', area_id = 'a-rc-home',
    acquisition_date = '2024-05-11', purchase_price_minor = 5620000, currency_code = 'AUD',
    supplier = 'Northshore Toyota', replacement_value_minor = 4100000, warranty_expiry = '2027-05-10', -- fixed-date: the warranty runs three years from the 2024-05-11 purchase; nothing asserts on it
    service_interval = '10000 km / 6 months', last_service_date = '2026-05-02', next_service_date = date('now', '+93 days'),
    service_provider = 'Northshore Toyota Service',
    maintenance_notes = 'Tows the trailer most weekends — service on the shorter interval.',
    issuer = 'Transport for NSW', reference_number = 'CJ88QR', issue_date = '2024-05-11',
    renewal_date = date('now', '+44 days'), archived_at = NULL,
    current_meter_value = 74210, current_meter_unit = 'km', current_meter_date = '2026-08-01'
WHERE workspace_id = 'local-dev-workspace' AND entity_id = 'as-rc-ute';

-- V2.10 LIFE-01 — an obligation is an ordinary entity with a detail slice and
-- a subject link, so the fixture seeds all three exactly as the product writes
-- them. The ids are unchanged, so every reference to them still resolves.
-- Every fixture obligation is removed by ITS OWN id prefix, dependents first.
-- Scoping the detail delete to the ute's subject instead was fine while every
-- fixture obligation was about the ute; the subject-less ones added below are
-- the whole point of V2.10, and they left a detail row behind that made the
-- entity delete violate its foreign key on the SECOND run of this seed. The
-- `activity_subjects` sweep is the same constraint from the other side: an
-- obligation is an entity now, so a journey that completes or dismisses one
-- leaves a subject pointer behind, and every foreign key here is ON DELETE
-- RESTRICT.
DELETE FROM entity_links WHERE workspace_id = 'local-dev-workspace' AND source_entity_id LIKE 'ob-rc-%';
DELETE FROM activity_subjects WHERE workspace_id = 'local-dev-workspace' AND entity_id LIKE 'ob-rc-%';
DELETE FROM obligation_details WHERE workspace_id = 'local-dev-workspace' AND entity_id LIKE 'ob-rc-%';
DELETE FROM entities WHERE workspace_id = 'local-dev-workspace' AND type = 'obligation' AND id LIKE 'ob-rc-%';

INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
VALUES
  ('ob-rc-rego', 'local-dev-workspace', 'obligation', 'Registration renewal', '2024-05-11T00:00:00.000Z', '2026-08-01T02:00:00.000Z', NULL),
  ('ob-rc-inspect', 'local-dev-workspace', 'obligation', 'Safety inspection (pink slip)', '2024-05-11T00:00:01.000Z', '2026-08-01T02:00:00.000Z', NULL),
  ('ob-rc-service', 'local-dev-workspace', 'obligation', 'Scheduled service', '2024-05-11T00:00:02.000Z', '2026-08-01T02:00:00.000Z', NULL),
  ('ob-rc-insurance', 'local-dev-workspace', 'obligation', 'Comprehensive insurance renewal', '2024-05-11T00:00:03.000Z', '2026-08-01T02:00:00.000Z', NULL),
  ('ob-rc-service-past', 'local-dev-workspace', 'obligation', 'Scheduled service', '2024-05-11T00:00:04.000Z', '2026-05-02T05:00:00.000Z', NULL);

INSERT INTO obligation_details
  (workspace_id, entity_id, entity_type, subject_entity_id, subject_entity_type, category, description,
   due_date, lead_days, recurrence_kind, recurrence_interval, meter_threshold, meter_interval, meter_unit,
   status, completed_at, completed_event_id, series_id, sequence, created_at, updated_at)
VALUES
  ('local-dev-workspace', 'ob-rc-rego', 'obligation', 'as-rc-ute', 'asset', 'registration', 'Renew with Transport for NSW, and it needs the pink slip first.', date('now', '+44 days'), 30,
   'years', 1, NULL, NULL, NULL, 'open', NULL, NULL, 'srs-rc-rego', 0, '2024-05-11T00:00:00.000Z', '2026-08-01T02:00:00.000Z'),
  ('local-dev-workspace', 'ob-rc-inspect', 'obligation', 'as-rc-ute', 'asset', 'inspection', NULL, date('now', '+27 days'), 14,
   'years', 1, NULL, NULL, NULL, 'open', NULL, NULL, 'srs-rc-inspect', 0, '2024-05-11T00:00:01.000Z', '2026-08-01T02:00:00.000Z'),
  ('local-dev-workspace', 'ob-rc-service', 'obligation', 'as-rc-ute', 'asset', 'service', 'Whichever comes first: 6 months or 10,000 km.', date('now', '+93 days'), 21,
   'meter', NULL, 80000, 10000, 'km', 'open', NULL, NULL, 'srs-rc-service', 1, '2024-05-11T00:00:02.000Z', '2026-08-01T02:00:00.000Z'),
  ('local-dev-workspace', 'ob-rc-insurance', 'obligation', 'as-rc-ute', 'asset', 'insurance', NULL, date('now', '+184 days'), 30,
   'years', 1, NULL, NULL, NULL, 'open', NULL, NULL, 'srs-rc-insurance', 0, '2024-05-11T00:00:03.000Z', '2026-08-01T02:00:00.000Z'),
  ('local-dev-workspace', 'ob-rc-service-past', 'obligation', 'as-rc-ute', 'asset', 'service', NULL, '2026-05-02', 21,
   'meter', NULL, 70000, 10000, 'km', 'completed', '2026-05-02T05:00:00.000Z', 'ev-rc-service-2', 'srs-rc-service', 0, '2024-05-11T00:00:04.000Z', '2026-05-02T05:00:00.000Z');

INSERT INTO entity_links
  (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
VALUES
  ('obl-subject-ob-rc-rego', 'local-dev-workspace', 'ob-rc-rego', 'as-rc-ute', 'obligation.subject', '2024-05-11T00:00:00.000Z', '2026-08-01T02:00:00.000Z', NULL),
  ('obl-subject-ob-rc-inspect', 'local-dev-workspace', 'ob-rc-inspect', 'as-rc-ute', 'obligation.subject', '2024-05-11T00:00:01.000Z', '2026-08-01T02:00:00.000Z', NULL),
  ('obl-subject-ob-rc-service', 'local-dev-workspace', 'ob-rc-service', 'as-rc-ute', 'obligation.subject', '2024-05-11T00:00:02.000Z', '2026-08-01T02:00:00.000Z', NULL),
  ('obl-subject-ob-rc-insurance', 'local-dev-workspace', 'ob-rc-insurance', 'as-rc-ute', 'obligation.subject', '2024-05-11T00:00:03.000Z', '2026-08-01T02:00:00.000Z', NULL),
  ('obl-subject-ob-rc-service-past', 'local-dev-workspace', 'ob-rc-service-past', 'as-rc-ute', 'obligation.subject', '2024-05-11T00:00:04.000Z', '2026-05-02T05:00:00.000Z', NULL);

-- ---------------------------------------------------------------------------
-- V2.10 LIFE-02 — obligations about NOTHING, which is the whole point of the
-- programme and therefore the fixture that has to exist.
--
-- A tax return has no asset, no parent and no owner record to hang from. Life
-- Admin's acceptance journey runs end to end on these two without an Asset
-- appearing anywhere in it, which is exactly what the journey is for. One bears
-- money (so the completion form's amount field has a case) and one does not.
-- ---------------------------------------------------------------------------
INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
VALUES
  ('ob-rc-tax', 'local-dev-workspace', 'obligation', 'RC: Lodge the tax return', '2026-07-01T00:00:00.000Z', '2026-08-01T02:00:00.000Z', NULL),
  ('ob-rc-passport', 'local-dev-workspace', 'obligation', 'RC: Renew the passport', '2026-07-01T00:00:01.000Z', '2026-08-01T02:00:00.000Z', NULL);

INSERT INTO obligation_details
  (workspace_id, entity_id, entity_type, subject_entity_id, subject_entity_type, category, description,
   due_date, lead_days, recurrence_kind, recurrence_interval, meter_threshold, meter_interval, meter_unit,
   expected_amount_minor, currency_code,
   status, completed_at, completed_event_id, series_id, sequence, created_at, updated_at)
VALUES
  ('local-dev-workspace', 'ob-rc-tax', 'obligation', NULL, NULL, 'tax', 'The accountant needs the receipts folder first.', date('now', '+9 days'), 21,
   'years', 1, NULL, NULL, NULL, 44000, 'AUD', 'open', NULL, NULL, 'srs-rc-tax', 0, '2026-07-01T00:00:00.000Z', '2026-08-01T02:00:00.000Z'),
  ('local-dev-workspace', 'ob-rc-passport', 'obligation', NULL, NULL, 'licence', NULL, date('now', '+200 days'), 60,
   'none', NULL, NULL, NULL, NULL, NULL, NULL, 'open', NULL, NULL, 'srs-rc-passport', 0, '2026-07-01T00:00:01.000Z', '2026-08-01T02:00:00.000Z');

DELETE FROM asset_events WHERE workspace_id = 'local-dev-workspace' AND asset_id = 'as-rc-ute';
INSERT INTO asset_events
  (id, workspace_id, asset_id, asset_entity_type, category, title, event_date, completed_at, description,
   provider, cost_minor, value_minor, currency_code, meter_value, meter_unit, warranty_expiry, next_due_date,
   obligation_id, created_at, updated_at)
VALUES
  ('ev-rc-purchase', 'local-dev-workspace', 'as-rc-ute', 'asset', 'purchase', 'Purchased from Northshore Toyota',
   '2024-05-11', '2024-05-11T00:00:00.000Z', 'Demo model, 4,100 km on the clock.', 'Northshore Toyota',
   5620000, NULL, 'AUD', 4100, 'km', '2027-05-10', NULL, NULL, '2024-05-11T00:00:00.000Z', '2024-05-11T00:00:00.000Z'), -- fixed-date: the warranty recorded at purchase, three years from 2024-05-11
  ('ev-rc-service-1', 'local-dev-workspace', 'as-rc-ute', 'asset', 'service', '40,000 km service',
   '2025-06-18', '2025-06-18T06:00:00.000Z', NULL, 'Northshore Toyota Service',
   48900, NULL, 'AUD', 41240, 'km', NULL, '2025-12-18', NULL, '2025-06-18T06:00:00.000Z', '2025-06-18T06:00:00.000Z'),
  ('ev-rc-repair', 'local-dev-workspace', 'as-rc-ute', 'asset', 'repair', 'Replaced the tow-bar wiring loom',
   '2025-11-03', '2025-11-03T04:30:00.000Z', 'Trailer lights were intermittent.', 'Marrickville Auto Electrics',
   31500, NULL, 'AUD', NULL, NULL, NULL, NULL, NULL, '2025-11-03T04:30:00.000Z', '2025-11-03T04:30:00.000Z'),
  ('ev-rc-service-2', 'local-dev-workspace', 'as-rc-ute', 'asset', 'service', '70,000 km service',
   '2026-05-02', '2026-05-02T05:00:00.000Z', 'Brake fluid and front pads done at the same time.', 'Northshore Toyota Service',
   62400, NULL, 'AUD', 69880, 'km', NULL, '2026-11-02', 'ob-rc-service-past', '2026-05-02T05:00:00.000Z', '2026-05-02T05:00:00.000Z'), -- fixed-date: the "next due" this history event recorded on 2026-05-02; the open obligation carries the live date
  ('ev-rc-meter', 'local-dev-workspace', 'as-rc-ute', 'asset', 'history', 'Odometer reading',
   '2026-08-01', '2026-08-01T02:00:00.000Z', NULL, NULL,
   NULL, NULL, NULL, 74210, 'km', NULL, NULL, NULL, '2026-08-01T02:00:00.000Z', '2026-08-01T02:00:00.000Z'),
  ('ev-rc-valuation', 'local-dev-workspace', 'as-rc-ute', 'asset', 'valuation', 'Redbook private-sale estimate',
   '2026-07-05', '2026-07-05T00:00:00.000Z', NULL, 'Redbook',
   NULL, 4100000, 'AUD', NULL, NULL, NULL, NULL, NULL, '2026-07-05T00:00:00.000Z', '2026-07-05T00:00:00.000Z');

-- ---------------------------------------------------------------------------
-- A Note with enough prose to judge the writing surface by.
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
VALUES
  ('n-rc-brief', 'local-dev-workspace', 'note', 'Kitchen fit-out brief', '2026-03-01T00:00:00.000Z', '2026-08-06T21:00:00.000Z', NULL);
INSERT OR IGNORE INTO note_details (workspace_id, entity_id, entity_type, content, archived_at, updated_at)
VALUES
  ('local-dev-workspace', 'n-rc-brief', 'note',
   '## What we are actually trying to achieve

A kitchen that works for two people cooking at once, with the fridge out of the walkway and enough bench either side of the cooktop to put a tray down. Everything else is negotiable.

## Constraints

- The waste stack cannot move, so the sink stays on the western wall.
- The window change is with council and may not come back before the benchtop template.
- Budget ceiling is firm. If the stone goes over, the splashback drops to tile.

## Decided

1. Full-height splashback behind the cooktop only.
2. Sink moves 80mm left to clear the stack.
3. Appliances stay in the garage until the benchtop is in.

## Still open

Handles. Everything hinges on the cabinetry colour, which the joiner will not confirm until the doors are sprayed.',
   NULL, '2026-08-06T21:00:00.000Z');
UPDATE note_details
SET content = '## What we are actually trying to achieve

A kitchen that works for two people cooking at once, with the fridge out of the walkway and enough bench either side of the cooktop to put a tray down. Everything else is negotiable.

## Constraints

- The waste stack cannot move, so the sink stays on the western wall.
- The window change is with council and may not come back before the benchtop template.
- Budget ceiling is firm. If the stone goes over, the splashback drops to tile.

## Decided

1. Full-height splashback behind the cooktop only.
2. Sink moves 80mm left to clear the stack.
3. Appliances stay in the garage until the benchtop is in.

## Still open

Handles. Everything hinges on the cabinetry colour, which the joiner will not confirm until the doors are sprayed.',
    archived_at = NULL, updated_at = '2026-08-06T21:00:00.000Z'
WHERE workspace_id = 'local-dev-workspace' AND entity_id = 'n-rc-brief';

-- ---------------------------------------------------------------------------
-- V2.6 FIND-02: the workspace tag vocabulary, and who carries which word.
--
-- These records used to keep their tags in a JSON column each. They now share
-- ONE vocabulary, which is what makes `renovation` on the Person and
-- `renovation` on the Note the same tag rather than two strings that match.
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO workspace_tags (workspace_id, tag_key, label, created_at, updated_at)
VALUES
  ('local-dev-workspace', 'brief', 'brief', '2026-03-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z'),
  ('local-dev-workspace', 'renovation', 'renovation', '2026-03-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z'),
  ('local-dev-workspace', 'trade', 'trade', '2026-03-02T00:00:00.000Z', '2026-03-02T00:00:00.000Z'),
  ('local-dev-workspace', 'vehicle', 'vehicle', '2024-05-11T00:00:00.000Z', '2024-05-11T00:00:00.000Z'),
  ('local-dev-workspace', 'work', 'work', '2024-05-11T00:00:00.000Z', '2024-05-11T00:00:00.000Z');
INSERT OR IGNORE INTO entity_tags (workspace_id, entity_id, tag_key, created_at)
VALUES
  ('local-dev-workspace', 'p-rc-dan', 'renovation', '2026-03-02T00:00:00.000Z'),
  ('local-dev-workspace', 'p-rc-dan', 'trade', '2026-03-02T00:00:00.000Z'),
  ('local-dev-workspace', 'as-rc-ute', 'vehicle', '2024-05-11T00:00:00.000Z'),
  ('local-dev-workspace', 'as-rc-ute', 'work', '2024-05-11T00:00:00.000Z'),
  ('local-dev-workspace', 'n-rc-brief', 'renovation', '2026-03-01T00:00:00.000Z'),
  ('local-dev-workspace', 'n-rc-brief', 'brief', '2026-03-01T00:00:00.000Z');

-- ---------------------------------------------------------------------------
-- A Review with real written sections.
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
VALUES
  ('rv-rc-week', 'local-dev-workspace', 'review', 'Weekly review — 27 Jul to 2 Aug', '2026-08-02T22:00:00.000Z', '2026-08-03T08:20:00.000Z', NULL);
INSERT OR IGNORE INTO review_details
  (workspace_id, entity_id, entity_type, review_type, period_start, period_end, status, template_id, completed_at, archived_at, updated_at)
VALUES
  ('local-dev-workspace', 'rv-rc-week', 'review', 'weekly', '2026-07-27', '2026-08-02', 'in_progress', 'weekly', NULL, NULL, '2026-08-03T08:20:00.000Z');
UPDATE review_details
SET review_type = 'weekly', period_start = '2026-07-27', period_end = '2026-08-02',
    status = 'in_progress', template_id = 'weekly', completed_at = NULL, archived_at = NULL,
    updated_at = '2026-08-03T08:20:00.000Z'
WHERE workspace_id = 'local-dev-workspace' AND entity_id = 'rv-rc-week';
DELETE FROM review_sections WHERE workspace_id = 'local-dev-workspace' AND review_id = 'rv-rc-week';
INSERT INTO review_sections (workspace_id, review_id, section_id, body_markdown, updated_at)
VALUES
  ('local-dev-workspace', 'rv-rc-week', 'summary.overall', 'A slow week on paper, but the two things that were actually blocking — the sink position and the splashback call — are both settled now.', '2026-08-03T08:20:00.000Z'),
  ('local-dev-workspace', 'rv-rc-week', 'summary.highlights', 'Base cabinets went in. The site walkthrough with Dan was worth the hour.', '2026-08-03T08:20:00.000Z'),
  ('local-dev-workspace', 'rv-rc-week', 'summary.challenges', 'The council window variation is still the single biggest unknown and I have no way to speed it up.', '2026-08-03T08:20:00.000Z'),
  ('local-dev-workspace', 'rv-rc-week', 'summary.next_focus', 'Get the benchtop templated. Stop touching anything downstream of it until that is done.', '2026-08-03T08:20:00.000Z');
