-- V2.15 ASSIST-00: the usage ledger learns the three ASSISTED features, and
-- that an owner can UNDO what they accepted.
--
-- ## Two vocabularies widen, and nothing narrows
--
-- 1. `feature_id` gains `finance-categorisation`, `obligation-follow-up` and
--    `review-reflection-draft`. Without this every V2.15 request would fail at
--    the budget reservation -- before a provider was contacted, with a bare
--    "Could not reserve an AI request" and no usable diagnosis. That is exactly
--    the failure V2.14's own migration (0054) exists to record, and it was
--    found the same way: by running the whole gateway against real D1.
--
-- 2. `proposal_outcome` gains `undone`.
--
--    The column records the owner's LAST disposition of one proposal, and
--    before V2.15 that could only be accepted, partially accepted or rejected
--    because nothing could be reversed. It can now, and an acceptance the owner
--    took back is not the same fact as one they kept -- an audit that could not
--    tell them apart would report changes as standing that the owner had
--    already undone.
--
--    `undone` is written ONLY when every item of an undo request was reversed.
--    A partial undo leaves the prior outcome in place, because "partially
--    undone" is a state the owner would have to interpret and the domain
--    records already say precisely which changes survive.
--
-- ## Why a table rebuild, again
--
-- SQLite cannot alter a CHECK constraint in place, so this repeats 0054's
-- twelve-step procedure for the same reasons, which are worth restating rather
-- than assumed:
--
--   - `ai_usage_requests` is OPERATIONAL METADATA. No prose, no figure, no
--     record title: ids, counts, states and timestamps, so a rebuild moves
--     nothing sensitive.
--   - Nothing references it by foreign key. It references `workspaces`, no
--     table references it.
--   - Every row is copied, so the owner's spend history is preserved exactly,
--     and both vocabularies WIDEN -- every value legal before is legal after.

CREATE TABLE ai_usage_requests_new (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  -- The authenticated subject -- the SAME value the Activity stream stores as an
  -- actor id (IDENT-01). Never an email, never a display name.
  owner_id TEXT NOT NULL,
  feature_id TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  provider TEXT NOT NULL,
  -- The DalyHub-internal model id. A provider's own model string is never stored.
  model_id TEXT NOT NULL,
  tier TEXT NOT NULL,
  state TEXT NOT NULL,
  attempt TEXT NOT NULL DEFAULT 'primary',
  -- Tied to ONE deliberate owner action. The UNIQUE index below is what makes a
  -- refresh or a double-submit free instead of a second paid request.
  idempotency_key TEXT NOT NULL,
  -- UTC period keys. UTC deliberately: a spend period must be unambiguous across
  -- devices and must not shift twice a year with daylight saving.
  period_day TEXT NOT NULL,
  period_month TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  completed_at TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  reserved_micro_usd INTEGER NOT NULL DEFAULT 0,
  estimated_micro_usd INTEGER NOT NULL DEFAULT 0,
  pricing_version TEXT NOT NULL,
  reused_from_id TEXT,
  failure_code TEXT,
  source_fingerprint TEXT,
  -- A JSON array of at most a bounded number of record ids. Ids only.
  source_entity_ids TEXT NOT NULL DEFAULT '[]',
  proposal_outcome TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  CHECK (length(owner_id) > 0 AND length(owner_id) <= 256),
  -- V2.15: the three ASSISTED features are added, and nothing is removed. The
  -- set is still CLOSED. A ledger that accepted any string would accept a typo,
  -- and a feature that cannot be recorded must fail loudly at the boundary
  -- rather than spend quietly.
  CHECK (feature_id IN (
    'meeting-action-extraction',
    'note-action-extraction',
    'weekly-review-assistant',
    'workspace-question-answer',
    'report-explanation',
    'grounded-question-answer',
    'finance-categorisation',
    'obligation-follow-up',
    'review-reflection-draft'
  )),
  CHECK (provider IN ('anthropic', 'openai')),
  CHECK (tier IN ('economy', 'standard', 'deep')),
  CHECK (state IN (
    'planned',
    'budget_reserved',
    'running',
    'succeeded',
    'failed',
    'cancelled',
    'reused'
  )),
  CHECK (attempt IN ('primary', 'retry', 'fallback')),
  CHECK (proposal_outcome IS NULL OR proposal_outcome IN (
    'accepted',
    'partially_accepted',
    'rejected',
    'undone'
  )),
  CHECK (length(idempotency_key) > 0 AND length(idempotency_key) <= 200),
  CHECK (length(period_day) = 10),
  CHECK (length(period_month) = 7),
  CHECK (reserved_micro_usd >= 0),
  CHECK (estimated_micro_usd >= 0),
  CHECK (input_tokens IS NULL OR input_tokens >= 0),
  CHECK (output_tokens IS NULL OR output_tokens >= 0),
  CHECK (json_valid(source_entity_ids))
) STRICT;

INSERT INTO ai_usage_requests_new (
  id,
  workspace_id,
  owner_id,
  feature_id,
  prompt_version,
  provider,
  model_id,
  tier,
  state,
  attempt,
  idempotency_key,
  period_day,
  period_month,
  requested_at,
  completed_at,
  input_tokens,
  output_tokens,
  reserved_micro_usd,
  estimated_micro_usd,
  pricing_version,
  reused_from_id,
  failure_code,
  source_fingerprint,
  source_entity_ids,
  proposal_outcome
)
SELECT
  id,
  workspace_id,
  owner_id,
  feature_id,
  prompt_version,
  provider,
  model_id,
  tier,
  state,
  attempt,
  idempotency_key,
  period_day,
  period_month,
  requested_at,
  completed_at,
  input_tokens,
  output_tokens,
  reserved_micro_usd,
  estimated_micro_usd,
  pricing_version,
  reused_from_id,
  failure_code,
  source_fingerprint,
  source_entity_ids,
  proposal_outcome
FROM ai_usage_requests;

DROP TABLE ai_usage_requests;

ALTER TABLE ai_usage_requests_new RENAME TO ai_usage_requests;

-- The four indexes are recreated verbatim: dropping the table dropped them, and
-- a rebuild that silently loses an index is a rebuild that makes the next
-- period-totals query a scan.

-- One paid request per deliberate owner action, per workspace. This is the
-- database-level half of duplicate-submit prevention. The repository reads the
-- existing row back rather than inserting a second.
CREATE UNIQUE INDEX ai_usage_requests_idempotency
  ON ai_usage_requests (workspace_id, owner_id, idempotency_key);

-- The current-period totals query: month and day spend, and the premium subtotal.
CREATE INDEX ai_usage_requests_month
  ON ai_usage_requests (workspace_id, owner_id, period_month, state);

CREATE INDEX ai_usage_requests_day
  ON ai_usage_requests (workspace_id, owner_id, period_day, state);

-- The per-feature daily request limit, and the Settings usage breakdown.
CREATE INDEX ai_usage_requests_feature
  ON ai_usage_requests (workspace_id, owner_id, feature_id, period_day);

-- Result reuse: the most recent succeeded row for a fingerprint.
CREATE INDEX ai_usage_requests_fingerprint
  ON ai_usage_requests (workspace_id, owner_id, source_fingerprint, requested_at DESC);
