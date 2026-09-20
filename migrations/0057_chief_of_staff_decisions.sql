-- Migration number: 0057 	 2026-09-20
--
-- Chief of Staff MCP: first-class Decisions. This migration is additive only.
-- A Decision is an ordinary entity (shared identity/lifecycle/activity) with a
-- small typed detail slice. `open` represents a decision still to be made, and
-- `decided` represents an outcome that has been recorded. Relationships use a
-- same-workspace typed foreign key rather than copied project/area labels.

CREATE TABLE decision_details (
  workspace_id        TEXT NOT NULL,
  entity_id           TEXT NOT NULL,
  entity_type         TEXT NOT NULL DEFAULT 'decision',
  status              TEXT NOT NULL,
  rationale           TEXT,
  decision_date       TEXT,
  review_date         TEXT,
  related_entity_id   TEXT,
  related_entity_type TEXT,
  updated_at          TEXT NOT NULL,
  CONSTRAINT decision_details_pk PRIMARY KEY (workspace_id, entity_id),
  CONSTRAINT decision_details_type CHECK (entity_type = 'decision'),
  CONSTRAINT decision_details_status CHECK (status IN ('open', 'decided')),
  CONSTRAINT decision_details_decided_date
    CHECK (status != 'decided' OR decision_date IS NOT NULL),
  CONSTRAINT decision_details_rationale_not_empty
    CHECK (rationale IS NULL OR length(rationale) > 0),
  CONSTRAINT decision_details_decision_date_shape
    CHECK (decision_date IS NULL OR decision_date GLOB '????-??-??'),
  CONSTRAINT decision_details_review_date_shape
    CHECK (review_date IS NULL OR review_date GLOB '????-??-??'),
  CONSTRAINT decision_details_relation_pair
    CHECK (
      (related_entity_id IS NULL AND related_entity_type IS NULL) OR
      (related_entity_id IS NOT NULL AND related_entity_type IN ('project', 'area'))
    ),
  CONSTRAINT decision_details_entity_fk
    FOREIGN KEY (workspace_id, entity_id, entity_type)
    REFERENCES entities (workspace_id, id, type) ON DELETE RESTRICT,
  CONSTRAINT decision_details_related_entity_fk
    FOREIGN KEY (workspace_id, related_entity_id, related_entity_type)
    REFERENCES entities (workspace_id, id, type) ON DELETE RESTRICT
) STRICT;

CREATE INDEX decision_details_workspace_status_idx
  ON decision_details (workspace_id, status, decision_date, entity_id);

CREATE INDEX decision_details_workspace_review_idx
  ON decision_details (workspace_id, review_date, entity_id)
  WHERE review_date IS NOT NULL;

CREATE INDEX decision_details_workspace_relation_idx
  ON decision_details (workspace_id, related_entity_id, entity_id)
  WHERE related_entity_id IS NOT NULL;
