/**
 * AI-01 — the AI platform against real Workers/D1.
 *
 * These are the claims that only a real database can prove: that the migration
 * applies, that preferences and usage are workspace- AND owner-isolated, that a
 * duplicate submit cannot buy a second paid request, that a reservation counts
 * as spend the moment it exists, that periods reset, and — the one that matters
 * most — that the ledger has nowhere to put a prompt, a response, a record body
 * or a secret.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";

import {
  DEFAULT_AI_PREFERENCES,
  budgetPeriodKeys,
  checkBudget,
  normaliseAiPreferences,
} from "~/kernel/ai";

import {
  makeAiPreferencesRepository,
  makeAiUsageRepository,
  makeContext,
  resetTables,
} from "./support";

const WS = "ai_ws";
const OTHER_WS = "ai_other_ws";
const OWNER = "owner-subject";
const OTHER_OWNER = "other-owner-subject";

const reserveInput = (patch: Record<string, unknown> = {}) => ({
  ownerId: OWNER,
  featureId: "meeting-action-extraction" as const,
  promptVersion: "meeting-action-extraction:v1",
  provider: "anthropic" as const,
  modelId: "anthropic-economy",
  tier: "economy" as const,
  attempt: "primary" as const,
  idempotencyKey: "meeting-action-extraction:m1:1",
  reservedUsd: 0.01,
  pricingVersion: "2026-08-05",
  sourceFingerprint: "fingerprint-a",
  sourceEntityIds: ["meeting-1", "note-2"],
  ...patch,
});

describe("AI preferences — D1", () => {
  beforeEach(async () => {
    await resetTables([WS, OTHER_WS]);
  });

  it("returns the documented defaults when no row exists, with AI OFF", async () => {
    const repo = makeAiPreferencesRepository(makeContext(WS));
    const preferences = await repo.get(OWNER);
    expect(preferences.version).toBe(0);
    expect(preferences.enabled).toBe(false);
    expect(preferences.monthlyBudgetUsd).toBe(
      DEFAULT_AI_PREFERENCES.monthlyBudgetUsd,
    );
    expect(preferences.allowedCategories).toEqual(["general"]);
    expect(preferences.loggingMode).toBe("metadata_only");
  });

  it("persists a change and reports whether anything actually changed", async () => {
    const repo = makeAiPreferencesRepository(makeContext(WS));
    const first = await repo.update(OWNER, {
      enabled: true,
      monthlyBudgetUsd: 5,
    });
    expect(first.changed).toBe(true);
    expect(first.preferences.enabled).toBe(true);
    expect(first.preferences.monthlyBudgetUsd).toBe(5);

    const again = await repo.update(OWNER, {
      enabled: true,
      monthlyBudgetUsd: 5,
    });
    expect(again.changed).toBe(false);
    expect(again.preferences.version).toBeGreaterThan(
      first.preferences.version,
    );
  });

  it("isolates one workspace's policy from another's", async () => {
    await makeAiPreferencesRepository(makeContext(WS)).update(OWNER, {
      enabled: true,
      monthlyBudgetUsd: 42,
    });
    const other = await makeAiPreferencesRepository(makeContext(OTHER_WS)).get(
      OWNER,
    );
    expect(other.enabled).toBe(false);
    expect(other.monthlyBudgetUsd).toBe(
      DEFAULT_AI_PREFERENCES.monthlyBudgetUsd,
    );
  });

  it("isolates one owner's policy from another's inside the same workspace", async () => {
    const repo = makeAiPreferencesRepository(makeContext(WS));
    await repo.update(OWNER, { enabled: true });
    expect((await repo.get(OTHER_OWNER)).enabled).toBe(false);
  });

  it("stores NO provider credential — the table has nowhere to put one", async () => {
    await makeAiPreferencesRepository(makeContext(WS)).update(OWNER, {
      enabled: true,
    });
    const row = await env.DB.prepare(
      "SELECT * FROM workspace_ai_preferences WHERE workspace_id = ?",
    )
      .bind(WS)
      .first<Record<string, unknown>>();
    const columns = Object.keys(row ?? {})
      .join(",")
      .toLowerCase();
    for (const forbidden of [
      "key",
      "secret",
      "token",
      "credential",
      "password",
    ]) {
      expect(columns).not.toContain(forbidden);
    }
  });

  it("degrades a hand-edited budget above the ceiling rather than honouring it", async () => {
    // The CHECK constraint is the database's half of the same rule the kernel
    // enforces; this proves the two agree.
    await expect(
      env.DB.prepare(
        `INSERT INTO workspace_ai_preferences
           (workspace_id, owner_id, monthly_budget_cents, created_at, updated_at)
         VALUES (?, ?, 9999999, '2026-08-05T00:00:00.000Z', '2026-08-05T00:00:00.000Z')`,
      )
        .bind(WS, "hand-edited")
        .run(),
    ).rejects.toThrow();
  });
});

describe("AI usage ledger — D1", () => {
  beforeEach(async () => {
    await resetTables([WS, OTHER_WS]);
  });

  it("opens a reservation and reads it back", async () => {
    const usage = makeAiUsageRepository(makeContext(WS), OWNER);
    const { record, created } = await usage.reserve(reserveInput());
    expect(created).toBe(true);
    expect(record.state).toBe("budget_reserved");
    expect(record.reservedUsd).toBeCloseTo(0.01, 6);
    expect(record.sourceEntityIds).toEqual(["meeting-1", "note-2"]);
  });

  it("returns the EXISTING row for a duplicate idempotency key — a refresh is free", async () => {
    const usage = makeAiUsageRepository(makeContext(WS), OWNER);
    const first = await usage.reserve(reserveInput());
    const second = await usage.reserve(reserveInput());
    expect(second.created).toBe(false);
    expect(second.record.id).toBe(first.record.id);

    const { count } = (await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM ai_usage_requests WHERE workspace_id = ?",
    )
      .bind(WS)
      .first<{ count: number }>()) ?? { count: -1 };
    expect(count).toBe(1);
  });

  it("counts a LIVE reservation as spend, so a second request cannot share it", async () => {
    const usage = makeAiUsageRepository(makeContext(WS), OWNER);
    await usage.reserve(reserveInput({ reservedUsd: 0.5 }));
    const keys = budgetPeriodKeys(new Date());
    const totals = await usage.totals({
      day: keys.day,
      month: keys.month,
      featureId: "meeting-action-extraction",
    });
    expect(totals.dayUsd).toBeCloseTo(0.5, 6);
    expect(totals.inFlight).toBe(1);

    const decision = checkBudget({
      preferences: normaliseAiPreferences({
        ...DEFAULT_AI_PREFERENCES,
        enabled: true,
        dailyBudgetUsd: 0.6,
      }),
      totals,
      estimateUsd: 0.2,
      tier: "economy",
      featureDailyLimit: 40,
    });
    expect(decision.ok).toBe(false);
  });

  it("reconciles a succeeded request down to the provider's reported usage", async () => {
    const usage = makeAiUsageRepository(makeContext(WS), OWNER);
    const { record } = await usage.reserve(reserveInput({ reservedUsd: 0.05 }));
    await usage.markRunning(record.id);
    const completed = await usage.complete(record.id, {
      state: "succeeded",
      inputTokens: 1200,
      outputTokens: 300,
      estimatedUsd: 0.0027,
    });
    expect(completed?.state).toBe("succeeded");
    expect(completed?.estimatedUsd).toBeCloseTo(0.0027, 6);

    const keys = budgetPeriodKeys(new Date());
    const totals = await usage.totals({
      day: keys.day,
      month: keys.month,
      featureId: "meeting-action-extraction",
    });
    // The over-reservation is released: the day now shows the reconciled figure.
    expect(totals.dayUsd).toBeCloseTo(0.0027, 6);
    expect(totals.inFlight).toBe(0);
  });

  it("returns the WHOLE reservation for a failed request", async () => {
    const usage = makeAiUsageRepository(makeContext(WS), OWNER);
    const { record } = await usage.reserve(reserveInput({ reservedUsd: 0.05 }));
    await usage.complete(record.id, {
      state: "failed",
      estimatedUsd: 0,
      failureCode: "provider_unavailable",
    });
    const keys = budgetPeriodKeys(new Date());
    const totals = await usage.totals({
      day: keys.day,
      month: keys.month,
      featureId: "meeting-action-extraction",
    });
    expect(totals.dayUsd).toBe(0);
    const stored = await usage.get(record.id);
    expect(stored?.failureCode).toBe("provider_unavailable");
  });

  it("accounts for a cancelled request honestly when the provider still used tokens", async () => {
    const usage = makeAiUsageRepository(makeContext(WS), OWNER);
    const { record } = await usage.reserve(reserveInput({ reservedUsd: 0.05 }));
    await usage.markRunning(record.id);
    await usage.complete(record.id, {
      state: "cancelled",
      inputTokens: 900,
      outputTokens: 10,
      estimatedUsd: 0.001,
      failureCode: "cancelled",
    });
    const stored = await usage.get(record.id);
    expect(stored?.state).toBe("cancelled");
    expect(stored?.inputTokens).toBe(900);
    // Cancelled rows do NOT count as spend — the ledger records what happened,
    // and the budget is not charged for an abandoned request.
    const keys = budgetPeriodKeys(new Date());
    const totals = await usage.totals({
      day: keys.day,
      month: keys.month,
      featureId: "meeting-action-extraction",
    });
    expect(totals.dayUsd).toBe(0);
  });

  it("keeps the per-feature daily count separate per feature", async () => {
    const usage = makeAiUsageRepository(makeContext(WS), OWNER);
    await usage.reserve(reserveInput({ idempotencyKey: "a" }));
    await usage.reserve(
      reserveInput({
        idempotencyKey: "b",
        featureId: "workspace-question-answer",
        promptVersion: "workspace-question-answer:v1",
        tier: "standard",
      }),
    );
    const keys = budgetPeriodKeys(new Date());
    expect(
      (
        await usage.totals({
          day: keys.day,
          month: keys.month,
          featureId: "meeting-action-extraction",
        })
      ).featureRequestsToday,
    ).toBe(1);
  });

  it("reports a per-feature monthly breakdown", async () => {
    const usage = makeAiUsageRepository(makeContext(WS), OWNER);
    const { record } = await usage.reserve(
      reserveInput({ idempotencyKey: "x" }),
    );
    await usage.complete(record.id, {
      state: "succeeded",
      estimatedUsd: 0.004,
    });
    const keys = budgetPeriodKeys(new Date());
    const totals = await usage.featureTotals(keys.month);
    expect(totals).toHaveLength(1);
    expect(totals[0]?.featureId).toBe("meeting-action-extraction");
    expect(totals[0]?.estimatedUsd).toBeCloseTo(0.004, 6);
  });

  it("keeps one workspace's spend invisible to another", async () => {
    await makeAiUsageRepository(makeContext(WS), OWNER).reserve(
      reserveInput({ reservedUsd: 1 }),
    );
    const keys = budgetPeriodKeys(new Date());
    const otherTotals = await makeAiUsageRepository(
      makeContext(OTHER_WS),
      OWNER,
    ).totals({
      day: keys.day,
      month: keys.month,
      featureId: "meeting-action-extraction",
    });
    expect(otherTotals.dayUsd).toBe(0);
    expect(otherTotals.inFlight).toBe(0);
  });

  it("keeps one owner's spend out of another owner's budget", async () => {
    await makeAiUsageRepository(makeContext(WS), OWNER).reserve(
      reserveInput({ reservedUsd: 1 }),
    );
    const keys = budgetPeriodKeys(new Date());
    const otherTotals = await makeAiUsageRepository(
      makeContext(WS),
      OTHER_OWNER,
    ).totals({
      day: keys.day,
      month: keys.month,
      featureId: "meeting-action-extraction",
    });
    expect(otherTotals.dayUsd).toBe(0);
  });

  it("refuses to read another workspace's row by id", async () => {
    const { record } = await makeAiUsageRepository(
      makeContext(WS),
      OWNER,
    ).reserve(reserveInput());
    expect(
      await makeAiUsageRepository(makeContext(OTHER_WS), OWNER).get(record.id),
    ).toBeNull();
  });

  it("finds a reusable succeeded row by fingerprint, and only inside the window", async () => {
    const usage = makeAiUsageRepository(makeContext(WS), OWNER);
    const { record } = await usage.reserve(reserveInput());
    await usage.complete(record.id, {
      state: "succeeded",
      estimatedUsd: 0.002,
    });

    const found = await usage.findReusable({
      ownerId: OWNER,
      featureId: "meeting-action-extraction",
      sourceFingerprint: "fingerprint-a",
      notBefore: new Date(Date.now() - 60_000),
    });
    expect(found?.id).toBe(record.id);

    expect(
      await usage.findReusable({
        ownerId: OWNER,
        featureId: "meeting-action-extraction",
        sourceFingerprint: "fingerprint-b",
        notBefore: new Date(Date.now() - 60_000),
      }),
    ).toBeNull();

    expect(
      await usage.findReusable({
        ownerId: OWNER,
        featureId: "meeting-action-extraction",
        sourceFingerprint: "fingerprint-a",
        notBefore: new Date(Date.now() + 60_000),
      }),
    ).toBeNull();
  });

  it("records a proposal outcome WITHOUT writing Activity", async () => {
    const usage = makeAiUsageRepository(makeContext(WS), OWNER);
    const { record } = await usage.reserve(reserveInput());
    await usage.complete(record.id, {
      state: "succeeded",
      estimatedUsd: 0.001,
    });
    expect(
      await usage.recordProposalOutcome(record.id, "partially_accepted"),
    ).toBe(true);
    expect((await usage.get(record.id))?.proposalOutcome).toBe(
      "partially_accepted",
    );

    const { count } = (await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM activities",
    ).first<{ count: number }>()) ?? { count: -1 };
    expect(count).toBe(0);
  });

  it("writes NO Activity for any part of an AI request's lifecycle", async () => {
    const usage = makeAiUsageRepository(makeContext(WS), OWNER);
    const { record } = await usage.reserve(reserveInput());
    await usage.markRunning(record.id);
    await usage.complete(record.id, {
      state: "succeeded",
      estimatedUsd: 0.001,
    });
    const { count } = (await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM activities",
    ).first<{ count: number }>()) ?? { count: -1 };
    expect(count).toBe(0);
  });

  it("stores NO prompt, response, record content or secret — by column list", async () => {
    const usage = makeAiUsageRepository(makeContext(WS), OWNER);
    const { record } = await usage.reserve(reserveInput());
    await usage.complete(record.id, {
      state: "succeeded",
      estimatedUsd: 0.001,
    });
    const row = await env.DB.prepare(
      "SELECT * FROM ai_usage_requests WHERE id = ?",
    )
      .bind(record.id)
      .first<Record<string, unknown>>();
    const columns = Object.keys(row ?? {}).map((name) => name.toLowerCase());
    for (const forbidden of [
      "prompt_body",
      "response_body",
      "content",
      "api_key",
      "secret",
      "token",
      "cookie",
      "jwt",
      "reasoning",
      "title",
    ]) {
      expect(columns).not.toContain(forbidden);
    }
    // `prompt_version` is a version string, not a prompt — assert that
    // distinction explicitly so a future rename cannot blur it.
    expect(row?.prompt_version).toBe("meeting-action-extraction:v1");
  });

  it("bounds the recorded source ids and records ids only, never titles", async () => {
    const usage = makeAiUsageRepository(makeContext(WS), OWNER);
    const many = Array.from({ length: 60 }, (_, index) => `entity-${index}`);
    const { record } = await usage.reserve(
      reserveInput({ sourceEntityIds: many }),
    );
    expect(record.sourceEntityIds.length).toBeLessThanOrEqual(24);
  });

  it("expires a stale in-flight row so a crash cannot block the workspace forever", async () => {
    const usage = makeAiUsageRepository(makeContext(WS), OWNER);
    await usage.reserve(reserveInput({ reservedUsd: 0.5 }));
    expect(await usage.expireStale(new Date(Date.now() + 60_000))).toBe(1);
    const keys = budgetPeriodKeys(new Date());
    const totals = await usage.totals({
      day: keys.day,
      month: keys.month,
      featureId: "meeting-action-extraction",
    });
    expect(totals.inFlight).toBe(0);
    expect(totals.dayUsd).toBe(0);
  });

  it("refuses an out-of-vocabulary state, feature, provider or tier at the database", async () => {
    for (const [column, value] of [
      ["state", "sneaky"],
      ["feature_id", "chat"],
      ["provider", "somebody-else"],
      ["tier", "unlimited"],
    ] as const) {
      await expect(
        env.DB.prepare(
          `INSERT INTO ai_usage_requests
             (id, workspace_id, owner_id, feature_id, prompt_version, provider,
              model_id, tier, state, attempt, idempotency_key, period_day,
              period_month, requested_at, pricing_version)
           VALUES (?, ?, ?, ?, 'v1', ?, 'm', ?, ?, 'primary', ?, '2026-08-05',
                   '2026-08', '2026-08-05T00:00:00.000Z', 'p')`,
        )
          .bind(
            crypto.randomUUID(),
            WS,
            OWNER,
            column === "feature_id" ? value : "meeting-action-extraction",
            column === "provider" ? value : "anthropic",
            column === "tier" ? value : "economy",
            column === "state" ? value : "budget_reserved",
            crypto.randomUUID(),
          )
          .run(),
      ).rejects.toThrow();
    }
  });

  it("refuses a duplicate idempotency key at the database, as the final backstop", async () => {
    const usage = makeAiUsageRepository(makeContext(WS), OWNER);
    await usage.reserve(reserveInput());
    await expect(
      env.DB.prepare(
        `INSERT INTO ai_usage_requests
           (id, workspace_id, owner_id, feature_id, prompt_version, provider,
            model_id, tier, state, attempt, idempotency_key, period_day,
            period_month, requested_at, pricing_version)
         VALUES (?, ?, ?, 'meeting-action-extraction', 'v1', 'anthropic', 'm',
                 'economy', 'budget_reserved', 'primary', ?, '2026-08-05',
                 '2026-08', '2026-08-05T00:00:00.000Z', 'p')`,
      )
        .bind(crypto.randomUUID(), WS, OWNER, "meeting-action-extraction:m1:1")
        .run(),
    ).rejects.toThrow();
  });
});

describe("budget periods reset", () => {
  beforeEach(async () => {
    await resetTables([WS]);
  });

  it("does not count a previous day or month against the current period", async () => {
    // Written directly so the row carries an older period key than "now".
    await env.DB.prepare(
      `INSERT INTO ai_usage_requests
         (id, workspace_id, owner_id, feature_id, prompt_version, provider,
          model_id, tier, state, attempt, idempotency_key, period_day,
          period_month, requested_at, estimated_micro_usd, pricing_version)
       VALUES (?, ?, ?, 'meeting-action-extraction', 'v1', 'anthropic',
               'anthropic-economy', 'economy', 'succeeded', 'primary', 'old',
               '2026-07-01', '2026-07', '2026-07-01T00:00:00.000Z', 5000000, 'p')`,
    )
      .bind(crypto.randomUUID(), WS, OWNER)
      .run();

    const usage = makeAiUsageRepository(makeContext(WS), OWNER);
    const current = await usage.totals({
      day: "2026-08-05",
      month: "2026-08",
      featureId: "meeting-action-extraction",
    });
    expect(current.dayUsd).toBe(0);
    expect(current.monthUsd).toBe(0);

    const july = await usage.totals({
      day: "2026-07-01",
      month: "2026-07",
      featureId: "meeting-action-extraction",
    });
    expect(july.monthUsd).toBeCloseTo(5, 6);
  });
});
