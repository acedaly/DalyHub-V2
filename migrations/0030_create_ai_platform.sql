-- AI-01 / AI-04: the controlled AI platform's persisted state.
--
-- Two tables, and deliberately nothing else.
--
--   1. workspace_ai_preferences -- the owner's NON-SECRET AI policy. No API key,
--      no gateway credential and no provider URL is stored here, in D1, or
--      anywhere else the application can read: credentials are Worker secrets
--      only. A CHECK on every enumerated column means an out-of-vocabulary value
--      cannot be written even by hand.
--
--   2. ai_usage_requests -- the usage ledger. It is OPERATIONAL METADATA, not
--      Activity (ADR-012): running a request, reading an answer, rejecting a
--      proposal and hitting a budget limit are things that happened to the
--      system, not history of the owner's records. Activity is written only when
--      the owner ACCEPTS a proposal and an ordinary domain mutation runs, with
--      the owner as the actor, through the module's own repository.
--
-- What the ledger deliberately CANNOT hold, by column list rather than by
-- convention: prompts, responses, record content, titles, API keys, cookies,
-- JWTs, provider authentication headers, hidden reasoning. The only workspace
-- data it records is a bounded list of source record ids plus a digest of the
-- evidence set, which is what makes stale-result detection possible without
-- keeping the evidence itself.
--
-- Budget reservations live in this same table rather than a separate one: a
-- reservation IS a request in the `budget_reserved` state, so there is one row
-- per request, one place a state machine moves, and no way for a reservation and
-- its request to disagree.
--
-- No embeddings table. Embeddings are not implemented in this change and a table
-- for a capability that does not exist would be a claim the product cannot back.

CREATE TABLE workspace_ai_preferences (
  workspace_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  default_provider TEXT NOT NULL DEFAULT 'anthropic',
  -- A JSON array of feature ids. Variable-length and validated on read against
  -- the kernel's own closed vocabulary, so an id removed from the product
  -- degrades to "not allowed" rather than to a broken row.
  allowed_features TEXT NOT NULL DEFAULT '["meeting-action-extraction","note-action-extraction","weekly-review-assistant","workspace-question-answer"]',
  -- A JSON object of tier -> approved internal model id (never a provider model
  -- string). `null` means "use the registry default for that tier".
  model_aliases TEXT NOT NULL DEFAULT '{"economy":null,"standard":null,"deep":null}',
  -- Budgets are stored in whole CENTS. Money in a float is money that drifts.
  monthly_budget_cents INTEGER NOT NULL DEFAULT 1000,
  daily_budget_cents INTEGER NOT NULL DEFAULT 100,
  premium_budget_cents INTEGER NOT NULL DEFAULT 200,
  premium_allowed INTEGER NOT NULL DEFAULT 0,
  -- A JSON array of privacy categories the owner has explicitly allowed.
  allowed_categories TEXT NOT NULL DEFAULT '["general"]',
  logging_mode TEXT NOT NULL DEFAULT 'metadata_only',
  result_retention TEXT NOT NULL DEFAULT 'session',
  provider_fallback_allowed INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, owner_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  CHECK (length(owner_id) > 0 AND length(owner_id) <= 256),
  CHECK (enabled IN (0, 1)),
  CHECK (premium_allowed IN (0, 1)),
  CHECK (provider_fallback_allowed IN (0, 1)),
  CHECK (default_provider IN ('anthropic', 'openai')),
  CHECK (logging_mode IN ('metadata_only', 'bodies')),
  CHECK (result_retention IN ('none', 'session', '7d', '30d')),
  CHECK (json_valid(allowed_features)),
  CHECK (json_valid(model_aliases)),
  CHECK (json_valid(allowed_categories)),
  -- Ceilings mirroring the kernel's own, so a value the application would refuse
  -- cannot be introduced underneath it.
  CHECK (monthly_budget_cents >= 0 AND monthly_budget_cents <= 50000),
  CHECK (daily_budget_cents >= 0 AND daily_budget_cents <= 10000),
  CHECK (premium_budget_cents >= 0 AND premium_budget_cents <= 25000),
  CHECK (version >= 1),
  CHECK (length(created_at) > 0 AND length(updated_at) > 0)
) STRICT;

CREATE TABLE ai_usage_requests (
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
  CHECK (feature_id IN (
    'meeting-action-extraction',
    'note-action-extraction',
    'weekly-review-assistant',
    'workspace-question-answer'
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
    'rejected'
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
