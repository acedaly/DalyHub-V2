-- REVIEW-02: the guided weekly Review's small, forward-only workflow state.
--
-- Two tables, and deliberately nothing else. Everything the guided flow shows
-- that CAN be derived truthfully -- answered prompts, the remaining Inbox count,
-- Project health, Goal alignment, the Review's own lifecycle -- stays derived
-- and is never written here (ADR-072). What is stored is only what no live fact
-- can answer:
--
--   1. review_workflow_state -- the resume bookmark. Which step the owner was on
--      when they stopped, plus a monotonic revision so a second tab's newer
--      position is refused rather than silently overwritten.
--   2. review_step_acknowledgements -- an owner's deliberate decision that a
--      step is done even though its derived rule is not satisfied ("I am leaving
--      these Inbox Tasks on purpose"). A decision is not a calculation.
--
-- Both are keyed to an existing Review and cascade with it, so the guided flow
-- can never own a record the Review does not. Existing Reviews need no backfill:
-- an absent row IS the documented default (no bookmark, no acknowledgements),
-- and the pure progress model derives a sensible position from the Review's own
-- responses and status.
--
-- Neither table records Activity. Navigation progress is product state, not
-- meaningful history.
CREATE TABLE review_workflow_state (
  workspace_id TEXT NOT NULL,
  review_id TEXT NOT NULL,
  current_step TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  CONSTRAINT review_workflow_state_pk PRIMARY KEY (workspace_id, review_id),
  CONSTRAINT review_workflow_state_workspace_not_empty CHECK (length(workspace_id) > 0),
  CONSTRAINT review_workflow_state_review_not_empty CHECK (length(review_id) > 0),
  CONSTRAINT review_workflow_state_step_valid CHECK (
    current_step IN (
      'overview',
      'inbox',
      'projects',
      'alignment',
      'reflection',
      'focus',
      'complete'
    )
  ),
  CONSTRAINT review_workflow_state_revision_positive CHECK (revision > 0),
  CONSTRAINT review_workflow_state_updated_at_not_empty CHECK (length(updated_at) > 0),
  CONSTRAINT review_workflow_state_review_fk FOREIGN KEY (workspace_id, review_id)
    REFERENCES review_details (workspace_id, entity_id) ON DELETE CASCADE
) STRICT;

-- The completion step is deliberately absent from this vocabulary: its only
-- truth is the Review's own lifecycle, so it can never be acknowledged.
CREATE TABLE review_step_acknowledgements (
  workspace_id TEXT NOT NULL,
  review_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  acknowledged_at TEXT NOT NULL,
  CONSTRAINT review_step_acknowledgements_pk PRIMARY KEY (workspace_id, review_id, step_id),
  CONSTRAINT review_step_acknowledgements_workspace_not_empty CHECK (length(workspace_id) > 0),
  CONSTRAINT review_step_acknowledgements_review_not_empty CHECK (length(review_id) > 0),
  CONSTRAINT review_step_acknowledgements_step_valid CHECK (
    step_id IN (
      'overview',
      'inbox',
      'projects',
      'alignment',
      'reflection',
      'focus'
    )
  ),
  CONSTRAINT review_step_acknowledgements_at_not_empty CHECK (length(acknowledged_at) > 0),
  CONSTRAINT review_step_acknowledgements_review_fk FOREIGN KEY (workspace_id, review_id)
    REFERENCES review_details (workspace_id, entity_id) ON DELETE CASCADE
) STRICT;

-- Reading one Review's acknowledgements is the hot path and the primary key
-- already serves it. This index serves the purge's workspace-scoped child delete.
CREATE INDEX review_step_acknowledgements_review
  ON review_step_acknowledgements (workspace_id, review_id);
