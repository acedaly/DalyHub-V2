-- X-02: generalise the saved-view table from "Tasks views" to "saved views of a
-- KIND", so cross-module views are the SAME record in the SAME table behind the
-- SAME repository, and not a second, parallel saved-view system.
--
-- ADDITIVE ONLY, and deliberately NOT a table rebuild.
--   * No existing row is rewritten, re-keyed or re-serialised.
--   * Every existing Tasks saved view keeps its id, name, config, config_version
--     and both timestamps, and reads back through the same lenient parser.
--   * The new column takes the DEFAULT 'tasks', so historical rows are correctly
--     classified without an UPDATE touching a single one of them.
--
-- The table KEEPS ITS NAME. Renaming it to saved_views would be tidier and is
-- exactly what we chose not to do, because a rename makes a rollback to the
-- previous Worker fatal (the old code would query a table that no longer exists),
-- and an operational hazard is a bad trade for a nicer identifier. The name is
-- historical. The kind column is the truth. Recorded in ADR-080.
--
-- What a kind means:
--   'tasks'  the TASKS-03 TaskViewConfig   (app/kernel/task-views)
--   'cross'  the X-02   CrossViewConfig    (app/kernel/views)
-- A row is never decoded under another kind's rules: the repository binds
-- kind = ? on every read, so an unrecognised kind is simply invisible rather
-- than misinterpreted.
--
-- The stored config remains a VALIDATED DECLARATIVE configuration: a small JSON
-- object naming SCOPES and filter DIMENSIONS from closed sets. It never contains
-- SQL, a column name, a repository field or an ordering expression, and the
-- repository maps a validated dimension to its own trusted predicate. The
-- existing length(config) <= 4096 CHECK still applies and is ample for a bounded
-- cross-module configuration.

ALTER TABLE task_saved_views
  ADD COLUMN kind TEXT NOT NULL DEFAULT 'tasks';

-- Names are unique per owner PER KIND, not globally. A Tasks view called "Focus"
-- and a cross-module view called "Focus" are different things in different
-- switchers, and forcing them to differ would be an arbitrary rule the owner
-- cannot see the reason for. Within one switcher, two indistinguishable entries
-- remain impossible.
DROP INDEX IF EXISTS task_saved_views_owner_name;

CREATE UNIQUE INDEX task_saved_views_owner_kind_name
  ON task_saved_views (workspace_id, owner_id, kind, lower(name));

-- The listing access path: one owner's views OF ONE KIND in one workspace,
-- name-ordered. It replaces the kind-blind index, which would otherwise force a
-- scan-and-discard of the other kind's rows on every page load.
DROP INDEX IF EXISTS task_saved_views_owner;

CREATE INDEX task_saved_views_owner_kind
  ON task_saved_views (workspace_id, owner_id, kind, name, id);
