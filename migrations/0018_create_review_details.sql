-- REVIEWS-01: first-class Review records and authored reflection sections.
--
-- A Review is an ordinary `entities` row of type 'review' plus one mandatory
-- `review_details` row and a bounded set of structured Markdown section rows.
-- Period dates are wall-calendar YYYY-MM-DD strings; they are never converted
-- into UTC instants. Archive is a reversible lifecycle state separate from the
-- closed status vocabulary (`draft`, `in_progress`, `completed`).
CREATE TABLE review_details (
  workspace_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'review',
  review_type TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  template_id TEXT NOT NULL,
  completed_at TEXT,
  archived_at TEXT,
  updated_at TEXT NOT NULL,
  CONSTRAINT review_details_pk PRIMARY KEY (workspace_id, entity_id),
  CONSTRAINT review_details_workspace_not_empty CHECK (length(workspace_id) > 0),
  CONSTRAINT review_details_entity_not_empty CHECK (length(entity_id) > 0),
  CONSTRAINT review_details_entity_type CHECK (entity_type = 'review'),
  CONSTRAINT review_details_type_valid CHECK (
    review_type IN ('weekly', 'monthly', 'quarterly', 'annual', 'custom')
  ),
  CONSTRAINT review_details_period_start_shape CHECK (
    length(period_start) = 10 AND substr(period_start, 5, 1) = '-' AND substr(period_start, 8, 1) = '-'
  ),
  CONSTRAINT review_details_period_end_shape CHECK (
    length(period_end) = 10 AND substr(period_end, 5, 1) = '-' AND substr(period_end, 8, 1) = '-'
  ),
  CONSTRAINT review_details_period_order CHECK (period_end >= period_start),
  CONSTRAINT review_details_status_valid CHECK (status IN ('draft', 'in_progress', 'completed')),
  CONSTRAINT review_details_template_not_empty CHECK (length(template_id) > 0),
  CONSTRAINT review_details_updated_at_not_empty CHECK (length(updated_at) > 0),
  CONSTRAINT review_details_completed_status CHECK (
    (status = 'completed' AND completed_at IS NOT NULL)
    OR (status <> 'completed' AND completed_at IS NULL)
  ),
  CONSTRAINT review_details_entity_fk FOREIGN KEY (workspace_id, entity_id, entity_type)
    REFERENCES entities (workspace_id, id, type) ON DELETE RESTRICT
) STRICT;

CREATE TABLE review_sections (
  workspace_id TEXT NOT NULL,
  review_id TEXT NOT NULL,
  section_id TEXT NOT NULL,
  body_markdown TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  CONSTRAINT review_sections_pk PRIMARY KEY (workspace_id, review_id, section_id),
  CONSTRAINT review_sections_workspace_not_empty CHECK (length(workspace_id) > 0),
  CONSTRAINT review_sections_review_not_empty CHECK (length(review_id) > 0),
  CONSTRAINT review_sections_section_valid CHECK (
    section_id IN (
      'summary.overall',
      'summary.highlights',
      'summary.challenges',
      'summary.lessons',
      'summary.decisions',
      'summary.next_focus',
      'progress.commentary',
      'tasks.commentary',
      'diary.commentary',
      'people_meetings.commentary'
    )
  ),
  CONSTRAINT review_sections_updated_at_not_empty CHECK (length(updated_at) > 0),
  CONSTRAINT review_sections_review_fk FOREIGN KEY (workspace_id, review_id)
    REFERENCES review_details (workspace_id, entity_id) ON DELETE CASCADE
) STRICT;

-- Active/archived collection partition + effective recency ordering.
CREATE INDEX review_details_collection
  ON review_details (workspace_id, archived_at, updated_at, entity_id);
CREATE INDEX review_details_status
  ON review_details (workspace_id, archived_at, status, updated_at, entity_id);
CREATE INDEX review_details_type_period
  ON review_details (workspace_id, review_type, period_start, period_end, entity_id);

-- Storage-level duplicate-period protection for standard reviews. Archived rows
-- still occupy their identity so a same-period create restores/opens the existing
-- Review instead of silently creating another durable record.
CREATE UNIQUE INDEX review_details_standard_period_unique
  ON review_details (workspace_id, review_type, period_start, period_end)
  WHERE review_type IN ('weekly', 'monthly', 'quarterly', 'annual');
