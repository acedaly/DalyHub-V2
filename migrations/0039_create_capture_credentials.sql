-- CAPTURE-01: capture credentials and their rate-limit counters.
--
-- ADDITIVE ONLY. Two new tables. No existing table is rebuilt, no column is
-- added to an existing table, and no existing row is read or rewritten. A
-- deployment that never creates a capture device never writes a row here, and
-- nothing else in DalyHub reads these tables.
--
-- What is deliberately NOT here
-- -----------------------------
-- There is no `capture_tasks`, `capture_notes`, `shortcut_tasks` or
-- `email_notes` table, and there never will be. A capture terminates in the
-- EXISTING Task and Note domain through the existing repositories, so the record
-- an iPhone Shortcut creates is indistinguishable from the record the app
-- creates -- because it IS the same record, written by the same code
-- (AGENTS.md section 9.8). These two tables hold only what capture genuinely adds:
-- the credentials that authorise external capture, and the counters that bound
-- it.
--
-- Idempotency is likewise NOT given a table here. Replay safety reuses the
-- PWA-05 `offline_capture_receipts` table and its claim/complete protocol, with
-- the key namespaced by credential -- one idempotency mechanism for the whole
-- product rather than a second one that has to be kept correct in parallel.
--
-- Conventions, identical to the existing tables: timestamps are ISO-8601 UTC
-- TEXT written by the application, STRICT column typing, and a workspace foreign
-- key with ON DELETE RESTRICT.

-- ---------------------------------------------------------------------------
-- capture_tokens
-- ---------------------------------------------------------------------------
-- One row per capture device ("Aidan's iPhone"). The raw token is NEVER stored:
-- the column below holds a SHA-256 digest, and the complete secret exists only
-- in the response that created it and on the owner's device. A database dump
-- therefore yields no usable capture credential.
CREATE TABLE capture_tokens (
  id TEXT PRIMARY KEY,
  -- The workspace this credential is PERMANENTLY bound to. It is chosen by the
  -- server when the credential is created and can never be changed, and every
  -- lookup is scoped by it -- so a capture request cannot select a destination
  -- workspace, and a credential from another workspace simply does not exist as
  -- far as this one is concerned.
  workspace_id TEXT NOT NULL,
  -- The authenticated subject that MINTED this credential. Not an authorisation
  -- input -- the capabilities column is that -- but the answer to "whose day is
  -- it?": a captured "tomorrow" must be resolved in the owner's timezone, and
  -- the owner's preferences are keyed by subject. Without it a capture would
  -- silently use the deployment default and could land a day out.
  owner_subject TEXT NOT NULL,
  -- The owner-facing device name, shown in Settings. Untrusted display text:
  -- bounded here and normalised by the application before it is stored.
  name TEXT NOT NULL,
  -- SHA-256 of the token, as 64 lowercase hex characters. UNIQUE so a token
  -- resolves to at most one credential, and so the lookup is an index seek
  -- rather than a scan over every credential.
  token_hash TEXT NOT NULL,
  -- The first characters of the digest. Safe to log and to display: it is
  -- derived from the digest, not from the token, and is not reversible.
  fingerprint TEXT NOT NULL,
  -- The capabilities granted, as a sorted comma-separated list drawn from a
  -- closed set ('task', 'note'). A tiny fixed vocabulary stored inline rather
  -- than a join table: there are two values, they are always read together with
  -- the credential, and a second table would be structure without benefit.
  capabilities TEXT NOT NULL,
  -- The capture source this device is expected to use, for presentation only.
  -- It is NOT an authorisation input: the request's own declared source is what
  -- is recorded, and neither can widen what the credential may do.
  source TEXT,
  created_at TEXT NOT NULL,
  -- Advisory: updated best-effort after a successful capture so the owner can
  -- see which devices are still in use. A failure to update it never fails a
  -- capture.
  last_used_at TEXT,
  -- Optional expiry. NULL means "until revoked".
  expires_at TEXT,
  -- Revocation is immediate and permanent, with no grace period: the check runs
  -- against this column on every request, and there is no cached session that
  -- could outlive it.
  revoked_at TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  CHECK (length(id) > 0 AND length(id) <= 64),
  CHECK (length(owner_subject) > 0 AND length(owner_subject) <= 256),
  CHECK (length(name) > 0 AND length(name) <= 60),
  CHECK (length(token_hash) = 64),
  CHECK (length(fingerprint) > 0 AND length(fingerprint) <= 32),
  CHECK (length(capabilities) > 0 AND length(capabilities) <= 64),
  CHECK (source IS NULL OR length(source) <= 32),
  CHECK (length(created_at) > 0)
) STRICT;

-- The authentication lookup: one seek, scoped to the workspace. UNIQUE on the
-- digest alone (not on the pair) so the same secret can never exist twice
-- anywhere, which keeps "this token belongs to exactly one credential" a
-- database guarantee rather than an application convention.
CREATE UNIQUE INDEX capture_tokens_by_hash ON capture_tokens (token_hash);

-- The Settings list: every credential in a workspace, newest first.
CREATE INDEX capture_tokens_by_workspace
  ON capture_tokens (workspace_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- capture_rate_windows
-- ---------------------------------------------------------------------------
-- Fixed-window counters, one row per (credential, window length, window start).
--
-- Why a table rather than a Cloudflare rate-limiting binding: the counter has to
-- be evaluated per CREDENTIAL, has to be exercisable by the Workers-runtime test
-- suite against a deterministic clock (the CAPTURE-01 brief forbids wall-clock sleeps in tests),
-- and has to bound a volume measured in tens of requests a day. D1 answers all
-- three with one statement and no new binding, no new configuration surface and
-- nothing to provision. If capture volume ever justified an edge limiter, the
-- kernel arithmetic is already separated from this store.
--
-- Rows are disposable: they age out of relevance the moment their window closes,
-- and the index below supports pruning them without a scan.
CREATE TABLE capture_rate_windows (
  workspace_id TEXT NOT NULL,
  -- The credential id, or a stable synthetic identity for email capture. Never
  -- an IP address: DalyHub does not record those (see
  -- app/kernel/account-security/account-security-events.ts).
  identity TEXT NOT NULL,
  -- The window length in seconds (60, 3600).
  window_seconds INTEGER NOT NULL,
  -- The window's start, as epoch seconds floored to the window length.
  window_start INTEGER NOT NULL,
  -- How many captures have been counted in this window. Incremented by an UPSERT
  -- so concurrent requests cannot lose a count to a read-then-write race.
  count INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, identity, window_seconds, window_start),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  CHECK (length(identity) > 0 AND length(identity) <= 128),
  CHECK (window_seconds > 0),
  CHECK (window_start >= 0),
  CHECK (count >= 0)
) STRICT;

-- Supports pruning closed windows without a table scan.
CREATE INDEX capture_rate_windows_by_start
  ON capture_rate_windows (workspace_id, window_start);
