-- REVIEW-03: the Review-period insight snapshot.
--
-- ONE table, and deliberately nothing else. REVIEW-03's audit split what a
-- Review can know into three kinds, and only the third needed storage:
--
--   1. What HAPPENED in a period (Tasks/Projects/Goals completed) is exactly
--      reconstructible for any past period from the append-only Activity
--      stream (ADR-012). It is NOT stored here, and the trend over recent
--      Reviews is computed from Activity every time.
--   2. What is TRUE NOW (PROJ-02 Project health, AREA-03 Goal alignment, open
--      and overdue counts) stays derived and uncached, exactly as those two
--      features already require. It is NOT stored here either.
--   3. What was true AT A PAST REVIEW POINT cannot be reconstructed at all,
--      because the inputs to (2) only describe today. "Did this Project go
--      from At risk to On track since my last Review?" has no answer in the
--      existing data model. That, and only that, is what this table holds.
--
-- The row is written when a Review is COMPLETED, and never at any other time:
-- a snapshot describes the moment the owner declared a period closed. Reopening
-- leaves it alone, and completing again overwrites it deterministically from the
-- state at the new completion. Capture is best-effort and never fails or
-- delays a completion the owner already made.
--
-- What it stores is DERIVED FACTS ONLY -- ids, states and counts. No titles, no
-- descriptions, no reflection text, no Task names. A renamed Project still
-- renders from its live title through its id, so this can never become a stale
-- second copy of the owner's records, and it is never authoritative for any
-- Area, Goal, Project or Task. The live records remain the only source of
-- truth, and this row only says what was true at one Review point.
--
-- It records no Activity. Capturing derived bookkeeping about a completion that
-- already has its own event is not itself a meaningful change to history.
CREATE TABLE review_insight_snapshots (
  workspace_id TEXT NOT NULL,
  review_id TEXT NOT NULL,
  -- The shape of facts_json. An unrecognised version reads as "no snapshot"
  -- rather than being misinterpreted under newer rules, so an old row can never
  -- produce a wrong comparison.
  version INTEGER NOT NULL,
  -- The Review's own wall-calendar period, denormalised so "the snapshot before
  -- this one" is a single indexed range scan rather than a join back through
  -- review_details.
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  facts_json TEXT NOT NULL,
  CONSTRAINT review_insight_snapshots_pk PRIMARY KEY (workspace_id, review_id),
  CONSTRAINT review_insight_snapshots_workspace_not_empty CHECK (length(workspace_id) > 0),
  CONSTRAINT review_insight_snapshots_review_not_empty CHECK (length(review_id) > 0),
  CONSTRAINT review_insight_snapshots_version_positive CHECK (version > 0),
  CONSTRAINT review_insight_snapshots_period_start_shape CHECK (length(period_start) = 10),
  CONSTRAINT review_insight_snapshots_period_end_shape CHECK (length(period_end) = 10),
  CONSTRAINT review_insight_snapshots_period_ordered CHECK (period_end >= period_start),
  CONSTRAINT review_insight_snapshots_captured_at_not_empty CHECK (length(captured_at) > 0),
  CONSTRAINT review_insight_snapshots_facts_not_empty CHECK (length(facts_json) > 0),
  -- Cascades with its Review, so an insight record can never outlive the Review
  -- it describes or reference one this workspace does not own.
  CONSTRAINT review_insight_snapshots_review_fk FOREIGN KEY (workspace_id, review_id)
    REFERENCES review_details (workspace_id, entity_id) ON DELETE CASCADE
) STRICT;

-- The one non-primary-key read: "the most recent snapshots whose period ended
-- before this one's". Ordered so the index serves the scan directly.
CREATE INDEX review_insight_snapshots_period
  ON review_insight_snapshots (workspace_id, period_end DESC, captured_at DESC, review_id DESC);
