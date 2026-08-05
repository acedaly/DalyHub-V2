/**
 * AI-01 storage — the D1 adapters for AI preferences and the usage ledger.
 *
 * Both are workspace-scoped, both are owner-scoped, and NEITHER records Activity:
 * AI usage is operational metadata, not history of the owner's records
 * (ADR-012). Nothing here stores a secret, a prompt, a response or record
 * content — see `migrations/0030_create_ai_platform.sql` for why the column list
 * itself is the guarantee.
 *
 * Money is stored in integer MICRO-USD (millionths of a dollar). A budget is
 * money; money in a float drifts, and a single economy extraction genuinely costs
 * a few hundred micro-dollars, so cents would round real spend to zero.
 */

import {
  DEFAULT_AI_PREFERENCES,
  MAX_RECORDED_SOURCE_IDS,
  normaliseAiPreferences,
  type AiFeatureId,
  type AiFeatureUsageTotal,
  type AiPreferencePatch,
  type AiPreferenceRecord,
  type AiPreferences,
  type AiPreferencesChangeResult,
  type AiPreferencesRepository,
  type AiProposalOutcome,
  type AiProvider,
  type AiRequestState,
  type AiUsageRecord,
  type AiUsageRepository,
  type CompleteAiRequestInput,
  type StartAiRequestInput,
} from "~/kernel/ai";
import type { AiErrorCode } from "~/kernel/ai";
import type { AiModelTier } from "~/kernel/ai";
import { systemClock, type Clock } from "~/kernel/spine";
import type { WorkspaceContext } from "~/kernel/workspaces";
import { parseWorkspaceId } from "~/kernel/workspaces";

import { fromStorageTimestamp, toStorageTimestamp } from "./database";

/** Convert USD to the stored integer micro-USD. */
export function toMicroUsd(usd: number): number {
  if (!Number.isFinite(usd) || usd <= 0) return 0;
  return Math.round(usd * 1_000_000);
}

/** Convert stored micro-USD back to USD. */
export function fromMicroUsd(micro: number): number {
  if (!Number.isFinite(micro) || micro <= 0) return 0;
  return Math.round(micro) / 1_000_000;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Preferences                                                                */
/* ────────────────────────────────────────────────────────────────────────── */

interface PreferencesRow {
  readonly workspace_id: string;
  readonly owner_id: string;
  readonly enabled: number;
  readonly default_provider: string;
  readonly allowed_features: string;
  readonly model_aliases: string;
  readonly monthly_budget_cents: number;
  readonly daily_budget_cents: number;
  readonly premium_budget_cents: number;
  readonly premium_allowed: number;
  readonly allowed_categories: string;
  readonly logging_mode: string;
  readonly result_retention: string;
  readonly provider_fallback_allowed: number;
  readonly version: number;
  readonly created_at: string;
  readonly updated_at: string;
}

function parseJsonArray(value: string): unknown[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** The D1 AI-preferences adapter. */
export class D1AiPreferencesRepository implements AiPreferencesRepository {
  readonly #db: D1Database;
  readonly #workspaceId: string;
  readonly #clock: Clock;

  constructor(
    db: D1Database,
    context: WorkspaceContext,
    options?: { readonly clock?: Clock },
  ) {
    this.#db = db;
    this.#workspaceId = context.workspaceId;
    this.#clock = options?.clock ?? systemClock;
  }

  async get(ownerId: string): Promise<AiPreferenceRecord> {
    const row = await this.#db
      .prepare(
        `SELECT * FROM workspace_ai_preferences
         WHERE workspace_id = ? AND owner_id = ?`,
      )
      .bind(this.#workspaceId, ownerId)
      .first<PreferencesRow>();

    if (row) return this.#record(row);

    // No row IS the documented default: AI off, conservative budgets, general
    // content only. A workspace never has to be initialised to be safe.
    const now = this.#clock();
    return {
      ...DEFAULT_AI_PREFERENCES,
      workspaceId: parseWorkspaceId(this.#workspaceId),
      ownerId,
      version: 0,
      createdAt: now,
      updatedAt: now,
    };
  }

  async update(
    ownerId: string,
    patch: AiPreferencePatch,
  ): Promise<AiPreferencesChangeResult> {
    const current = await this.get(ownerId);
    const next = normaliseAiPreferences({ ...current, ...patch });
    const changed = !sameAiPreferences(current, next);
    const now = this.#clock();
    const stamp = toStorageTimestamp(now);

    await this.#db
      .prepare(
        `INSERT INTO workspace_ai_preferences (
           workspace_id, owner_id, enabled, default_provider, allowed_features,
           model_aliases, monthly_budget_cents, daily_budget_cents,
           premium_budget_cents, premium_allowed, allowed_categories,
           logging_mode, result_retention, provider_fallback_allowed,
           version, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
         ON CONFLICT (workspace_id, owner_id) DO UPDATE SET
           enabled = excluded.enabled,
           default_provider = excluded.default_provider,
           allowed_features = excluded.allowed_features,
           model_aliases = excluded.model_aliases,
           monthly_budget_cents = excluded.monthly_budget_cents,
           daily_budget_cents = excluded.daily_budget_cents,
           premium_budget_cents = excluded.premium_budget_cents,
           premium_allowed = excluded.premium_allowed,
           allowed_categories = excluded.allowed_categories,
           logging_mode = excluded.logging_mode,
           result_retention = excluded.result_retention,
           provider_fallback_allowed = excluded.provider_fallback_allowed,
           version = workspace_ai_preferences.version + 1,
           updated_at = excluded.updated_at`,
      )
      .bind(
        this.#workspaceId,
        ownerId,
        next.enabled ? 1 : 0,
        next.defaultProvider,
        JSON.stringify(next.allowedFeatures),
        JSON.stringify(next.modelAliases),
        Math.round(next.monthlyBudgetUsd * 100),
        Math.round(next.dailyBudgetUsd * 100),
        Math.round(next.premiumBudgetUsd * 100),
        next.premiumAllowed ? 1 : 0,
        JSON.stringify(next.allowedCategories),
        next.loggingMode,
        next.resultRetention,
        next.providerFallbackAllowed ? 1 : 0,
        stamp,
        stamp,
      )
      .run();

    return { preferences: await this.get(ownerId), changed };
  }

  #record(row: PreferencesRow): AiPreferenceRecord {
    const preferences = normaliseAiPreferences({
      enabled: row.enabled === 1,
      defaultProvider: row.default_provider as AiProvider,
      allowedFeatures: parseJsonArray(row.allowed_features) as AiFeatureId[],
      modelAliases: parseJsonObject(row.model_aliases) as Record<
        AiModelTier,
        string | null
      >,
      monthlyBudgetUsd: row.monthly_budget_cents / 100,
      dailyBudgetUsd: row.daily_budget_cents / 100,
      premiumBudgetUsd: row.premium_budget_cents / 100,
      premiumAllowed: row.premium_allowed === 1,
      allowedCategories: parseJsonArray(
        row.allowed_categories,
      ) as AiPreferences["allowedCategories"],
      loggingMode: row.logging_mode as AiPreferences["loggingMode"],
      resultRetention: row.result_retention as AiPreferences["resultRetention"],
      providerFallbackAllowed: row.provider_fallback_allowed === 1,
    });
    return {
      ...preferences,
      workspaceId: parseWorkspaceId(row.workspace_id),
      ownerId: row.owner_id,
      version: row.version,
      createdAt: fromStorageTimestamp(row.created_at),
      updatedAt: fromStorageTimestamp(row.updated_at),
    };
  }
}

/** Structural comparison, so an update that changes nothing reports `false`. */
function sameAiPreferences(a: AiPreferences, b: AiPreferences): boolean {
  return (
    a.enabled === b.enabled &&
    a.defaultProvider === b.defaultProvider &&
    a.monthlyBudgetUsd === b.monthlyBudgetUsd &&
    a.dailyBudgetUsd === b.dailyBudgetUsd &&
    a.premiumBudgetUsd === b.premiumBudgetUsd &&
    a.premiumAllowed === b.premiumAllowed &&
    a.loggingMode === b.loggingMode &&
    a.resultRetention === b.resultRetention &&
    a.providerFallbackAllowed === b.providerFallbackAllowed &&
    JSON.stringify(a.allowedFeatures) === JSON.stringify(b.allowedFeatures) &&
    JSON.stringify(a.allowedCategories) ===
      JSON.stringify(b.allowedCategories) &&
    JSON.stringify(a.modelAliases) === JSON.stringify(b.modelAliases)
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Usage ledger                                                               */
/* ────────────────────────────────────────────────────────────────────────── */

interface UsageRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly owner_id: string;
  readonly feature_id: string;
  readonly prompt_version: string;
  readonly provider: string;
  readonly model_id: string;
  readonly tier: string;
  readonly state: string;
  readonly attempt: string;
  readonly idempotency_key: string;
  readonly period_day: string;
  readonly period_month: string;
  readonly requested_at: string;
  readonly completed_at: string | null;
  readonly input_tokens: number | null;
  readonly output_tokens: number | null;
  readonly reserved_micro_usd: number;
  readonly estimated_micro_usd: number;
  readonly pricing_version: string;
  readonly reused_from_id: string | null;
  readonly failure_code: string | null;
  readonly source_fingerprint: string | null;
  readonly source_entity_ids: string;
  readonly proposal_outcome: string | null;
}

/**
 * States that count as SPEND. A reservation counts: two requests fired at once
 * must not both fit into the last dollar, so an in-flight reservation is
 * committed spend until it is reconciled or released.
 */
const SPENDING_STATES = "('budget_reserved','running','succeeded','failed')";

/** States that count as IN FLIGHT for the concurrency ceiling. */
const IN_FLIGHT_STATES = "('budget_reserved','running')";

/** The D1 usage-ledger adapter. */
export class D1AiUsageRepository implements AiUsageRepository {
  readonly #db: D1Database;
  readonly #workspaceId: string;
  readonly #clock: Clock;

  constructor(
    db: D1Database,
    context: WorkspaceContext,
    options?: { readonly clock?: Clock },
  ) {
    this.#db = db;
    this.#workspaceId = context.workspaceId;
    this.#clock = options?.clock ?? systemClock;
  }

  async reserve(
    input: StartAiRequestInput,
  ): Promise<{ record: AiUsageRecord; created: boolean }> {
    const existing = await this.#byIdempotencyKey(
      input.ownerId,
      input.idempotencyKey,
    );
    if (existing) return { record: existing, created: false };

    const now = this.#clock();
    const iso = now.toISOString();
    const id = crypto.randomUUID();
    const ids = input.sourceEntityIds.slice(0, MAX_RECORDED_SOURCE_IDS);

    try {
      await this.#db
        .prepare(
          `INSERT INTO ai_usage_requests (
             id, workspace_id, owner_id, feature_id, prompt_version, provider,
             model_id, tier, state, attempt, idempotency_key, period_day,
             period_month, requested_at, reserved_micro_usd,
             estimated_micro_usd, pricing_version, source_fingerprint,
             source_entity_ids
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'budget_reserved', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          this.#workspaceId,
          input.ownerId,
          input.featureId,
          input.promptVersion,
          input.provider,
          input.modelId,
          input.tier,
          input.attempt,
          input.idempotencyKey,
          iso.slice(0, 10),
          iso.slice(0, 7),
          toStorageTimestamp(now),
          toMicroUsd(input.reservedUsd),
          toMicroUsd(input.reservedUsd),
          input.pricingVersion,
          input.sourceFingerprint,
          JSON.stringify(ids),
        )
        .run();
    } catch {
      // The UNIQUE index is the final backstop against a concurrent duplicate
      // submit: the loser reads the winner's row back rather than failing, so a
      // double-click is free rather than an error.
      const raced = await this.#byIdempotencyKey(
        input.ownerId,
        input.idempotencyKey,
      );
      if (raced) return { record: raced, created: false };
      throw new Error("Could not reserve an AI request.");
    }

    const record = await this.get(id);
    if (!record) throw new Error("Could not reserve an AI request.");
    return { record, created: true };
  }

  async markRunning(id: string): Promise<AiUsageRecord | null> {
    await this.#db
      .prepare(
        `UPDATE ai_usage_requests SET state = 'running'
         WHERE id = ? AND workspace_id = ? AND state = 'budget_reserved'`,
      )
      .bind(id, this.#workspaceId)
      .run();
    return this.get(id);
  }

  async complete(
    id: string,
    input: CompleteAiRequestInput,
  ): Promise<AiUsageRecord | null> {
    const now = this.#clock();
    await this.#db
      .prepare(
        `UPDATE ai_usage_requests SET
           state = ?,
           completed_at = ?,
           input_tokens = ?,
           output_tokens = ?,
           estimated_micro_usd = ?,
           failure_code = ?,
           reused_from_id = ?
         WHERE id = ? AND workspace_id = ?
           AND state IN ('budget_reserved','running')`,
      )
      .bind(
        input.state,
        toStorageTimestamp(now),
        input.inputTokens ?? null,
        input.outputTokens ?? null,
        // A request that produced nothing releases its whole reservation: the
        // owner's budget is not spent on work no provider performed.
        input.estimatedUsd === undefined || input.estimatedUsd === null
          ? 0
          : toMicroUsd(input.estimatedUsd),
        input.failureCode ?? null,
        input.reusedFromId ?? null,
        id,
        this.#workspaceId,
      )
      .run();
    return this.get(id);
  }

  async recordProposalOutcome(
    id: string,
    outcome: AiProposalOutcome,
  ): Promise<boolean> {
    const result = await this.#db
      .prepare(
        `UPDATE ai_usage_requests SET proposal_outcome = ?
         WHERE id = ? AND workspace_id = ?`,
      )
      .bind(outcome, id, this.#workspaceId)
      .run();
    return (result.meta?.changes ?? 0) > 0;
  }

  async get(id: string): Promise<AiUsageRecord | null> {
    const row = await this.#db
      .prepare(
        `SELECT * FROM ai_usage_requests WHERE id = ? AND workspace_id = ?`,
      )
      .bind(id, this.#workspaceId)
      .first<UsageRow>();
    return row ? this.#record(row) : null;
  }

  async totals(input: {
    readonly day: string;
    readonly month: string;
    readonly featureId: AiFeatureId;
  }): Promise<{
    readonly monthUsd: number;
    readonly dayUsd: number;
    readonly monthPremiumUsd: number;
    readonly inFlight: number;
    readonly featureRequestsToday: number;
  }> {
    const row = await this.#db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN period_month = ?1 AND state IN ${SPENDING_STATES}
                             THEN estimated_micro_usd ELSE 0 END), 0) AS month_micro,
           COALESCE(SUM(CASE WHEN period_day = ?2 AND state IN ${SPENDING_STATES}
                             THEN estimated_micro_usd ELSE 0 END), 0) AS day_micro,
           COALESCE(SUM(CASE WHEN period_month = ?1 AND tier = 'deep'
                                  AND state IN ${SPENDING_STATES}
                             THEN estimated_micro_usd ELSE 0 END), 0) AS premium_micro,
           COALESCE(SUM(CASE WHEN state IN ${IN_FLIGHT_STATES} THEN 1 ELSE 0 END), 0) AS in_flight,
           COALESCE(SUM(CASE WHEN period_day = ?2 AND feature_id = ?4
                                  AND state IN ${SPENDING_STATES}
                             THEN 1 ELSE 0 END), 0) AS feature_today
         FROM ai_usage_requests
         WHERE workspace_id = ?5 AND owner_id = ?3`,
      )
      .bind(
        input.month,
        input.day,
        // Owner scope: budgets are per owner within the workspace, matching how
        // preferences are stored.
        this.#ownerBinding,
        input.featureId,
        this.#workspaceId,
      )
      .first<{
        month_micro: number;
        day_micro: number;
        premium_micro: number;
        in_flight: number;
        feature_today: number;
      }>();

    return {
      monthUsd: fromMicroUsd(row?.month_micro ?? 0),
      dayUsd: fromMicroUsd(row?.day_micro ?? 0),
      monthPremiumUsd: fromMicroUsd(row?.premium_micro ?? 0),
      inFlight: row?.in_flight ?? 0,
      featureRequestsToday: row?.feature_today ?? 0,
    };
  }

  async featureTotals(month: string): Promise<readonly AiFeatureUsageTotal[]> {
    const result = await this.#db
      .prepare(
        `SELECT feature_id,
                COUNT(*) AS requests,
                COALESCE(SUM(estimated_micro_usd), 0) AS micro
         FROM ai_usage_requests
         WHERE workspace_id = ? AND owner_id = ? AND period_month = ?
           AND state IN ${SPENDING_STATES}
         GROUP BY feature_id
         ORDER BY feature_id`,
      )
      .bind(this.#workspaceId, this.#ownerBinding, month)
      .all<{ feature_id: string; requests: number; micro: number }>();

    return (result.results ?? []).map((row) => ({
      featureId: row.feature_id as AiFeatureId,
      requests: row.requests,
      estimatedUsd: fromMicroUsd(row.micro),
    }));
  }

  async findReusable(input: {
    readonly ownerId: string;
    readonly featureId: AiFeatureId;
    readonly sourceFingerprint: string;
    readonly notBefore: Date;
  }): Promise<AiUsageRecord | null> {
    const row = await this.#db
      .prepare(
        `SELECT * FROM ai_usage_requests
         WHERE workspace_id = ? AND owner_id = ? AND feature_id = ?
           AND source_fingerprint = ? AND state = 'succeeded'
           AND requested_at >= ?
         ORDER BY requested_at DESC
         LIMIT 1`,
      )
      .bind(
        this.#workspaceId,
        input.ownerId,
        input.featureId,
        input.sourceFingerprint,
        toStorageTimestamp(input.notBefore),
      )
      .first<UsageRow>();
    return row ? this.#record(row) : null;
  }

  async expireStale(olderThan: Date): Promise<number> {
    const result = await this.#db
      .prepare(
        `UPDATE ai_usage_requests
         SET state = 'failed', failure_code = 'internal',
             estimated_micro_usd = 0, completed_at = ?
         WHERE workspace_id = ? AND state IN ${IN_FLIGHT_STATES}
           AND requested_at < ?`,
      )
      .bind(
        toStorageTimestamp(this.#clock()),
        this.#workspaceId,
        toStorageTimestamp(olderThan),
      )
      .run();
    return result.meta?.changes ?? 0;
  }

  /**
   * The owner this repository instance is bound to. Set by `bindOwner` so the
   * totals queries do not need it threaded through every call site; the
   * composition boundary binds it from the authenticated session.
   */
  #owner = "";

  get #ownerBinding(): string {
    return this.#owner;
  }

  /** Bind the authenticated owner. Server-side only; never a request value. */
  bindOwner(ownerId: string): this {
    this.#owner = ownerId;
    return this;
  }

  async #byIdempotencyKey(
    ownerId: string,
    key: string,
  ): Promise<AiUsageRecord | null> {
    const row = await this.#db
      .prepare(
        `SELECT * FROM ai_usage_requests
         WHERE workspace_id = ? AND owner_id = ? AND idempotency_key = ?`,
      )
      .bind(this.#workspaceId, ownerId, key)
      .first<UsageRow>();
    return row ? this.#record(row) : null;
  }

  #record(row: UsageRow): AiUsageRecord {
    return {
      id: row.id,
      workspaceId: parseWorkspaceId(row.workspace_id),
      ownerId: row.owner_id,
      featureId: row.feature_id as AiFeatureId,
      promptVersion: row.prompt_version,
      provider: row.provider as AiProvider,
      modelId: row.model_id,
      tier: row.tier as AiModelTier,
      state: row.state as AiRequestState,
      attempt: row.attempt as AiUsageRecord["attempt"],
      idempotencyKey: row.idempotency_key,
      requestedAt: fromStorageTimestamp(row.requested_at),
      completedAt:
        row.completed_at === null
          ? null
          : fromStorageTimestamp(row.completed_at),
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      reservedUsd: fromMicroUsd(row.reserved_micro_usd),
      estimatedUsd: fromMicroUsd(row.estimated_micro_usd),
      pricingVersion: row.pricing_version,
      reusedFromId: row.reused_from_id,
      failureCode: (row.failure_code as AiErrorCode | null) ?? null,
      sourceFingerprint: row.source_fingerprint,
      sourceEntityIds: parseJsonArray(row.source_entity_ids).filter(
        (value): value is string => typeof value === "string",
      ),
      proposalOutcome:
        (row.proposal_outcome as AiProposalOutcome | null) ?? null,
    };
  }
}

/** Build the AI preferences repository for a workspace. */
export function createAiPreferencesRepository(
  db: D1Database,
  context: WorkspaceContext,
  options?: { readonly clock?: Clock },
): AiPreferencesRepository {
  return new D1AiPreferencesRepository(db, context, options);
}

/**
 * Build the usage ledger for a workspace, bound to the authenticated owner. The
 * owner comes from the server-side session at the composition boundary — a
 * request can never choose it.
 */
export function createAiUsageRepository(
  db: D1Database,
  context: WorkspaceContext,
  ownerId: string,
  options?: { readonly clock?: Clock },
): AiUsageRepository {
  return new D1AiUsageRepository(db, context, options).bindOwner(ownerId);
}
