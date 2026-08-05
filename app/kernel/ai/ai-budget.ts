/**
 * AI-01 kernel — application-enforced cost control.
 *
 * Cloudflare AI Gateway and a provider dashboard can both cap spend. Neither is
 * APPLICATION enforcement: they act after the fact, at a different boundary, on a
 * different clock, and they cannot answer "may this owner run this feature right
 * now?". DalyHub therefore enforces its own budget, and does so BEFORE any
 * provider is contacted.
 *
 * Because provider billing is eventually consistent, the model is
 * **reserve → run → reconcile**:
 *
 *   1. estimate the request's cost at the registry's verified prices;
 *   2. RESERVE that estimate against the period totals — a reservation is real
 *      spend as far as the next request is concerned, so two requests fired at
 *      once cannot both fit into the last dollar;
 *   3. run at most the allowed attempts;
 *   4. RECONCILE against the provider's own reported token usage, releasing what
 *      was over-reserved or correcting upward when the answer was longer than
 *      estimated.
 *
 * Everything here is PURE arithmetic over period totals. Persistence and
 * concurrency live in the D1 adapter; the rules live here so they are testable
 * without a database.
 */

import {
  MAX_CONCURRENT_AI_REQUESTS,
  type AiPreferences,
} from "./ai-preferences";
import type { AiModelTier } from "./ai-models";
import { AiError } from "./ai-errors";

/**
 * The period keys a usage row is aggregated under.
 *
 * **UTC, deliberately and documented.** The owner's timezone governs what
 * DalyHub calls "today" for tasks and reviews; a spend period is different — it
 * must be unambiguous across devices, must not shift twice a year with daylight
 * saving, and must line up with how a provider reports usage. Settings says so
 * in the owner's own words, and `AI_PLATFORM.md` records the decision.
 */
export interface BudgetPeriodKeys {
  /** `YYYY-MM-DD` in UTC. */
  readonly day: string;
  /** `YYYY-MM` in UTC. */
  readonly month: string;
}

/** Derive the UTC day and month keys for an instant. PURE. */
export function budgetPeriodKeys(now: Date): BudgetPeriodKeys {
  const iso = now.toISOString();
  return { day: iso.slice(0, 10), month: iso.slice(0, 7) };
}

/**
 * What has already been committed or reserved in the current periods. Every
 * figure is USD and includes live reservations, so the arithmetic below is safe
 * against concurrent requests.
 */
export interface BudgetUsageTotals {
  readonly monthUsd: number;
  readonly dayUsd: number;
  /** Deep-tier spend inside the current month. */
  readonly monthPremiumUsd: number;
  /** In-flight requests (reserved or running) for this workspace. */
  readonly inFlight: number;
  /** Requests of THIS feature already made today. */
  readonly featureRequestsToday: number;
}

/** An empty period. */
export const EMPTY_BUDGET_TOTALS: BudgetUsageTotals = {
  monthUsd: 0,
  dayUsd: 0,
  monthPremiumUsd: 0,
  inFlight: 0,
  featureRequestsToday: 0,
};

/** What remains before each ceiling. Never negative. */
export interface BudgetRemaining {
  readonly monthUsd: number;
  readonly dayUsd: number;
  readonly premiumUsd: number;
}

/** Remaining headroom under each ceiling. PURE. */
export function budgetRemaining(
  preferences: AiPreferences,
  totals: BudgetUsageTotals,
): BudgetRemaining {
  return {
    monthUsd: Math.max(
      0,
      round6(preferences.monthlyBudgetUsd - totals.monthUsd),
    ),
    dayUsd: Math.max(0, round6(preferences.dailyBudgetUsd - totals.dayUsd)),
    premiumUsd: Math.max(
      0,
      round6(preferences.premiumBudgetUsd - totals.monthPremiumUsd),
    ),
  };
}

/** The inputs a budget decision needs. */
export interface BudgetCheckInput {
  readonly preferences: AiPreferences;
  readonly totals: BudgetUsageTotals;
  /** The estimated USD cost of the request about to be made. */
  readonly estimateUsd: number;
  readonly tier: AiModelTier;
  /** The feature's own per-day request ceiling. */
  readonly featureDailyLimit: number;
  readonly maxConcurrent?: number;
}

/** A budget decision: either permitted, or refused with a typed reason. */
export type BudgetDecision =
  | { readonly ok: true; readonly reserveUsd: number }
  | { readonly ok: false; readonly error: AiError };

/**
 * Decide whether a request may proceed. The order is the contract, because the
 * owner should be told the MOST specific reason: concurrency, then the feature's
 * own limit, then premium, then daily, then monthly.
 *
 * A request whose estimate alone exceeds a ceiling is refused BEFORE any provider
 * call — it is never allowed to run and overshoot "just this once".
 */
export function checkBudget(input: BudgetCheckInput): BudgetDecision {
  const { preferences, totals, estimateUsd, tier, featureDailyLimit } = input;
  const maxConcurrent = input.maxConcurrent ?? MAX_CONCURRENT_AI_REQUESTS;

  if (totals.inFlight >= maxConcurrent) {
    return { ok: false, error: new AiError("concurrency_limited") };
  }
  if (totals.featureRequestsToday >= featureDailyLimit) {
    return { ok: false, error: new AiError("rate_limited") };
  }
  if (tier === "deep") {
    if (!preferences.premiumAllowed) {
      return { ok: false, error: new AiError("feature_not_allowed") };
    }
    if (totals.monthPremiumUsd + estimateUsd > preferences.premiumBudgetUsd) {
      return { ok: false, error: new AiError("premium_budget_reached") };
    }
  }
  if (totals.dayUsd + estimateUsd > preferences.dailyBudgetUsd) {
    return { ok: false, error: new AiError("daily_budget_reached") };
  }
  if (totals.monthUsd + estimateUsd > preferences.monthlyBudgetUsd) {
    return { ok: false, error: new AiError("monthly_budget_reached") };
  }
  return { ok: true, reserveUsd: round6(estimateUsd) };
}

/**
 * The reconciliation of one completed request: what was reserved, what the
 * provider says it actually used, and the corrected estimate.
 *
 * DalyHub deliberately does NOT claim to know the exact charge. Providers report
 * token counts; the money is DalyHub's own arithmetic at the registry price. The
 * UI therefore labels three separate things — estimated cost, provider-reported
 * tokens, reconciled estimated cost — and never calls any of them "what you were
 * billed".
 */
export interface Reconciliation {
  readonly reservedUsd: number;
  readonly actualUsd: number;
  /** Positive when the reservation was too large and headroom is returned. */
  readonly releasedUsd: number;
  /** Positive when the request cost more than reserved (recorded, not refused). */
  readonly overrunUsd: number;
}

/** Compute the reconciliation for a finished request. PURE. */
export function reconcile(
  reservedUsd: number,
  actualUsd: number | null,
): Reconciliation {
  const reserved = round6(Math.max(0, reservedUsd));
  if (actualUsd === null) {
    // No usable provider usage: the reservation stands. Under-reporting the
    // spend would be the dangerous direction, so DalyHub keeps the estimate.
    return {
      reservedUsd: reserved,
      actualUsd: reserved,
      releasedUsd: 0,
      overrunUsd: 0,
    };
  }
  const actual = round6(Math.max(0, actualUsd));
  return {
    reservedUsd: reserved,
    actualUsd: actual,
    releasedUsd: actual < reserved ? round6(reserved - actual) : 0,
    overrunUsd: actual > reserved ? round6(actual - reserved) : 0,
  };
}

/**
 * The reservation released when a request FAILS before the provider produced
 * anything (a policy refusal, a transport failure with no usage, a cancellation
 * the provider never started). The whole reservation goes back: DalyHub does not
 * charge the owner's budget for work no provider performed.
 */
export function releaseUnused(reservedUsd: number): number {
  return round6(Math.max(0, reservedUsd));
}

/**
 * A compact, owner-facing summary of where the budget stands. Rendered in
 * Settings and in the AI surfaces' secondary disclosure.
 */
export interface BudgetSnapshot {
  readonly monthlyBudgetUsd: number;
  readonly dailyBudgetUsd: number;
  readonly premiumBudgetUsd: number;
  readonly monthSpentUsd: number;
  readonly daySpentUsd: number;
  readonly premiumSpentUsd: number;
  readonly remaining: BudgetRemaining;
  /** True when ANY ceiling is exhausted, so AI actions are disabled. */
  readonly exhausted: boolean;
  readonly periodDay: string;
  readonly periodMonth: string;
}

/** Build the owner-facing snapshot. PURE. */
export function budgetSnapshot(
  preferences: AiPreferences,
  totals: BudgetUsageTotals,
  keys: BudgetPeriodKeys,
): BudgetSnapshot {
  const remaining = budgetRemaining(preferences, totals);
  return {
    monthlyBudgetUsd: preferences.monthlyBudgetUsd,
    dailyBudgetUsd: preferences.dailyBudgetUsd,
    premiumBudgetUsd: preferences.premiumBudgetUsd,
    monthSpentUsd: round6(totals.monthUsd),
    daySpentUsd: round6(totals.dayUsd),
    premiumSpentUsd: round6(totals.monthPremiumUsd),
    remaining,
    exhausted: remaining.monthUsd <= 0 || remaining.dayUsd <= 0,
    periodDay: keys.day,
    periodMonth: keys.month,
  };
}

/**
 * Format a USD figure for display. Amounts below a cent are shown to four
 * decimal places rather than rounded to `$0.00`, because "$0.00" reads as free
 * and an economy extraction genuinely costs a fraction of a cent.
 */
export function formatUsd(value: number): string {
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
  if (safe > 0 && safe < 0.01) return `$${safe.toFixed(4)}`;
  return `$${safe.toFixed(2)}`;
}

/** Round to six decimal places — the smallest unit DalyHub tracks. */
function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
