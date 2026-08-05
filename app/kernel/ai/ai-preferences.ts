/**
 * AI-01 / AI-04 kernel — the owner's AI policy, and its validation.
 *
 * These are the NON-SECRET policy choices stored in D1. A provider API key is not
 * here, is not in D1, is not in this type and cannot be set from a browser: keys
 * are Worker secrets only (`app/platform/ai/ai-configuration.ts`). Settings shows
 * whether a provider is configured; it never shows, accepts or stores a key.
 *
 * Every value is validated on READ as well as on write, so a row written by an
 * older version — or hand-edited — degrades to a safe default rather than
 * widening a limit.
 */

import {
  AI_MODEL_TIERS,
  isAiModelTier,
  isAiProvider,
  type AiModelTier,
  type AiProvider,
} from "./ai-models";
import { AI_FEATURE_IDS, isAiFeatureId, type AiFeatureId } from "./ai-features";
import {
  PRIVACY_CATEGORIES,
  isPrivacyCategory,
  type PrivacyCategory,
} from "./ai-evidence";
import type { WorkspaceId } from "~/kernel/workspaces";

/** Thrown when an AI preference value is not acceptable. Owner-facing message. */
export class AiPreferencesValidationError extends Error {
  readonly field: string;
  constructor(field: string, message: string) {
    super(message);
    this.name = "AiPreferencesValidationError";
    this.field = field;
  }
}

/** The conservative first monthly budget, in USD. Deliberately small. */
export const DEFAULT_MONTHLY_BUDGET_USD = 10;
/** The conservative first daily budget, in USD. */
export const DEFAULT_DAILY_BUDGET_USD = 1;
/** The conservative first deep-analysis allowance, in USD per month. */
export const DEFAULT_PREMIUM_BUDGET_USD = 2;

/** Hard ceilings on what an owner may set, so a typo cannot mean $100,000. */
export const MAX_MONTHLY_BUDGET_USD = 500;
export const MAX_DAILY_BUDGET_USD = 100;
export const MAX_PREMIUM_BUDGET_USD = 250;

/** Maximum concurrent in-flight AI requests per workspace. */
export const MAX_CONCURRENT_AI_REQUESTS = 2;

/** What DalyHub itself may write to its own server logs about a request. */
export const AI_LOGGING_MODES = [
  /** Token, duration, feature, model, cost and a bounded error category only. */
  "metadata_only",
  /** Additionally record prompt and response bodies. NEVER the default. */
  "bodies",
] as const;
export type AiLoggingMode = (typeof AI_LOGGING_MODES)[number];

/** How long a reusable generated result may be reused for. */
export const AI_RESULT_RETENTION_CHOICES = [
  "none",
  "session",
  "7d",
  "30d",
] as const;
export type AiResultRetention = (typeof AI_RESULT_RETENTION_CHOICES)[number];

/**
 * The stored AI policy for a workspace + owner. Non-secret, exportable and safe
 * to render.
 */
export interface AiPreferences {
  readonly enabled: boolean;
  /** Which provider is preferred when both are configured. */
  readonly defaultProvider: AiProvider;
  /** Features the owner has allowed. An absent feature is refused. */
  readonly allowedFeatures: readonly AiFeatureId[];
  /** Approved internal model id per tier, or `null` to use the registry default. */
  readonly modelAliases: Readonly<Record<AiModelTier, string | null>>;
  readonly monthlyBudgetUsd: number;
  readonly dailyBudgetUsd: number;
  /** Monthly sub-budget for `deep`-tier work, inside the monthly budget. */
  readonly premiumBudgetUsd: number;
  /** True when the owner has permitted deep-tier requests at all. */
  readonly premiumAllowed: boolean;
  /** Sensitive categories the owner has explicitly allowed AI to see. */
  readonly allowedCategories: readonly PrivacyCategory[];
  /** Whether DalyHub logs prompt/response bodies. Defaults to metadata only. */
  readonly loggingMode: AiLoggingMode;
  readonly resultRetention: AiResultRetention;
  /** Whether a fallback to the other configured provider is permitted. */
  readonly providerFallbackAllowed: boolean;
}

/** The stored record: preferences plus their scope and optimistic version. */
export interface AiPreferenceRecord extends AiPreferences {
  readonly workspaceId: WorkspaceId;
  readonly ownerId: string;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * The defaults a workspace with no stored row behaves as. AI is OFF: DalyHub must
 * work normally, and identically, with AI disabled or unconfigured.
 */
export const DEFAULT_AI_PREFERENCES: AiPreferences = {
  enabled: false,
  defaultProvider: "anthropic",
  allowedFeatures: [...AI_FEATURE_IDS],
  modelAliases: { economy: null, standard: null, deep: null },
  monthlyBudgetUsd: DEFAULT_MONTHLY_BUDGET_USD,
  dailyBudgetUsd: DEFAULT_DAILY_BUDGET_USD,
  premiumBudgetUsd: DEFAULT_PREMIUM_BUDGET_USD,
  premiumAllowed: false,
  allowedCategories: ["general"],
  loggingMode: "metadata_only",
  resultRetention: "session",
  providerFallbackAllowed: true,
};

/** A partial update. Every field goes through the validators below. */
export type AiPreferencePatch = Partial<AiPreferences>;

/** The result of an update: the stored record and whether anything changed. */
export interface AiPreferencesChangeResult {
  readonly preferences: AiPreferenceRecord;
  readonly changed: boolean;
}

/** The persistence port. Workspace- and owner-scoped; stores no secret. */
export interface AiPreferencesRepository {
  readonly get: (ownerId: string) => Promise<AiPreferenceRecord>;
  readonly update: (
    ownerId: string,
    patch: AiPreferencePatch,
  ) => Promise<AiPreferencesChangeResult>;
}

/** Parse a boolean from an untrusted form value. */
export function parseAiBoolean(value: unknown, field: string): boolean {
  if (typeof value === "boolean") return value;
  if (value === "1" || value === "true") return true;
  if (value === "0" || value === "false") return false;
  throw new AiPreferencesValidationError(field, "Choose on or off.");
}

/** Parse and bound a USD budget value. */
export function parseBudgetUsd(
  value: unknown,
  field: string,
  max: number,
): number {
  const raw =
    typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isFinite(raw) || raw < 0) {
    throw new AiPreferencesValidationError(
      field,
      "Enter a budget of $0 or more.",
    );
  }
  // Whole cents: a budget is money, and a fractional cent is not.
  const cents = Math.round(raw * 100);
  if (cents > max * 100) {
    throw new AiPreferencesValidationError(
      field,
      `That’s above the maximum DalyHub will accept ($${max}).`,
    );
  }
  return cents / 100;
}

/** Parse a provider name. */
export function parseAiProvider(value: unknown): AiProvider {
  if (isAiProvider(value)) return value;
  throw new AiPreferencesValidationError(
    "defaultProvider",
    "Choose a supported provider.",
  );
}

/** Parse a logging mode. */
export function parseAiLoggingMode(value: unknown): AiLoggingMode {
  if (
    typeof value === "string" &&
    (AI_LOGGING_MODES as readonly string[]).includes(value)
  ) {
    return value as AiLoggingMode;
  }
  throw new AiPreferencesValidationError(
    "loggingMode",
    "Choose a logging mode.",
  );
}

/** Parse a retention choice. */
export function parseAiResultRetention(value: unknown): AiResultRetention {
  if (
    typeof value === "string" &&
    (AI_RESULT_RETENTION_CHOICES as readonly string[]).includes(value)
  ) {
    return value as AiResultRetention;
  }
  throw new AiPreferencesValidationError(
    "resultRetention",
    "Choose how long generated results may be reused.",
  );
}

/**
 * Normalise a stored or supplied preferences shape. Unknown features, unknown
 * categories and out-of-range budgets are DROPPED or clamped rather than
 * rejected, because a read must always succeed: a bad row degrades to safe, it
 * never locks the owner out of Settings.
 */
export function normaliseAiPreferences(
  input: Partial<AiPreferences> | null | undefined,
): AiPreferences {
  const source = input ?? {};
  const features = Array.isArray(source.allowedFeatures)
    ? AI_FEATURE_IDS.filter((id) =>
        (source.allowedFeatures as readonly unknown[]).some(
          (value) => isAiFeatureId(value) && value === id,
        ),
      )
    : DEFAULT_AI_PREFERENCES.allowedFeatures;

  const categories = Array.isArray(source.allowedCategories)
    ? PRIVACY_CATEGORIES.filter((category) =>
        (source.allowedCategories as readonly unknown[]).some(
          (value) => isPrivacyCategory(value) && value === category,
        ),
      )
    : DEFAULT_AI_PREFERENCES.allowedCategories;

  // `general` is always allowed: excluding it would make every feature refuse
  // every ordinary Task, which is an unusable consent model.
  const withGeneral = categories.includes("general")
    ? categories
    : (["general", ...categories] as readonly PrivacyCategory[]);

  const aliases: Record<AiModelTier, string | null> = {
    economy: null,
    standard: null,
    deep: null,
  };
  const suppliedAliases = source.modelAliases;
  if (suppliedAliases !== undefined && suppliedAliases !== null) {
    for (const tier of AI_MODEL_TIERS) {
      const value = (suppliedAliases as Record<string, unknown>)[tier];
      aliases[tier] =
        typeof value === "string" && value.length > 0 ? value : null;
    }
  }

  return {
    enabled: source.enabled === true,
    defaultProvider: isAiProvider(source.defaultProvider)
      ? source.defaultProvider
      : DEFAULT_AI_PREFERENCES.defaultProvider,
    allowedFeatures: features,
    modelAliases: aliases,
    monthlyBudgetUsd: clampBudget(
      source.monthlyBudgetUsd,
      DEFAULT_MONTHLY_BUDGET_USD,
      MAX_MONTHLY_BUDGET_USD,
    ),
    dailyBudgetUsd: clampBudget(
      source.dailyBudgetUsd,
      DEFAULT_DAILY_BUDGET_USD,
      MAX_DAILY_BUDGET_USD,
    ),
    premiumBudgetUsd: clampBudget(
      source.premiumBudgetUsd,
      DEFAULT_PREMIUM_BUDGET_USD,
      MAX_PREMIUM_BUDGET_USD,
    ),
    premiumAllowed: source.premiumAllowed === true,
    allowedCategories: withGeneral,
    loggingMode:
      typeof source.loggingMode === "string" &&
      (AI_LOGGING_MODES as readonly string[]).includes(source.loggingMode)
        ? (source.loggingMode as AiLoggingMode)
        : DEFAULT_AI_PREFERENCES.loggingMode,
    resultRetention:
      typeof source.resultRetention === "string" &&
      (AI_RESULT_RETENTION_CHOICES as readonly string[]).includes(
        source.resultRetention,
      )
        ? (source.resultRetention as AiResultRetention)
        : DEFAULT_AI_PREFERENCES.resultRetention,
    providerFallbackAllowed: source.providerFallbackAllowed !== false,
  };
}

function clampBudget(value: unknown, fallback: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return fallback;
  }
  return Math.min(Math.round(value * 100) / 100, max);
}

/**
 * The categories a request may include: the feature's own defaults, plus every
 * sensitive category the owner has explicitly allowed. A category that is neither
 * is excluded, and the caller discloses that it was.
 */
export function permittedCategories(
  preferences: AiPreferences,
  featureDefaults: readonly PrivacyCategory[],
): ReadonlySet<PrivacyCategory> {
  const allowed = new Set<PrivacyCategory>(featureDefaults);
  // `allowedCategories` IS the owner's explicit allowance — a sensitive category
  // is in that list only because the owner deliberately put it there.
  for (const category of preferences.allowedCategories) {
    allowed.add(category);
  }
  return allowed;
}

/** True when the owner has allowed a specific feature. */
export function featureAllowed(
  preferences: AiPreferences,
  feature: AiFeatureId,
): boolean {
  return preferences.allowedFeatures.includes(feature);
}

/**
 * The model id to use for a tier: the owner's approved alias when it names a real
 * registry entry, otherwise `null` so the caller falls back to the registry
 * default. An alias that no longer resolves degrades rather than failing.
 */
export function aliasForTier(
  preferences: AiPreferences,
  tier: AiModelTier,
): string | null {
  const value = preferences.modelAliases[tier];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Validate a tier name from an untrusted source. */
export function parseAiModelTier(value: unknown): AiModelTier {
  if (isAiModelTier(value)) return value;
  throw new AiPreferencesValidationError("tier", "Choose a model tier.");
}
