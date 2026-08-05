/**
 * AI-01 kernel — the feature policy table.
 *
 * DalyHub's AI is not a chat box with a system prompt. Every request names ONE
 * of the features declared here, and that declaration — not the request, and not
 * the browser — decides the tier, the limits, the evidence types, whether a
 * proposal may be produced and whether provider fallback is allowed.
 *
 * Adding a capability means adding a row here, a prompt version in
 * `ai-prompts.ts` and a response schema in `ai-schemas.ts`. There is no generic
 * "ask the model anything" path.
 */

import type { AiModelTier } from "./ai-models";
import type { PrivacyCategory } from "./ai-evidence";

/** The three capabilities this release ships. A CLOSED set. */
export const AI_FEATURE_IDS = [
  "meeting-action-extraction",
  "note-action-extraction",
  "weekly-review-assistant",
  "workspace-question-answer",
] as const;

export type AiFeatureId = (typeof AI_FEATURE_IDS)[number];

/** True when `value` names a shipped feature. */
export function isAiFeatureId(value: unknown): value is AiFeatureId {
  return (
    typeof value === "string" &&
    (AI_FEATURE_IDS as readonly string[]).includes(value)
  );
}

/** Parse an untrusted request value into a feature id, or `null`. */
export function parseAiFeatureId(value: unknown): AiFeatureId | null {
  return isAiFeatureId(value) ? value : null;
}

/**
 * What a feature is allowed to do. Every field is a CEILING enforced server-side;
 * a request may ask for less, never more.
 */
export interface AiFeaturePolicy {
  readonly id: AiFeatureId;
  /** Owner-facing name, used in Settings and in the usage breakdown. */
  readonly label: string;
  /** The tier this feature normally runs at. */
  readonly tier: AiModelTier;
  /** True when the feature may emit proposals that can become DalyHub records. */
  readonly producesProposals: boolean;
  /**
   * True when running this feature requires a second, deliberate owner action
   * because it may cost materially more (the `deep` tier gate).
   */
  readonly requiresDeliberateConfirmation: boolean;
  /** Maximum evidence records assembled for one request. */
  readonly maxEvidenceRecords: number;
  /** Maximum characters in ONE evidence excerpt. */
  readonly maxExcerptCharacters: number;
  /** Maximum characters across the WHOLE assembled evidence set. */
  readonly maxTotalEvidenceCharacters: number;
  /** Maximum excerpts contributed by a single record. */
  readonly maxExcerptsPerRecord: number;
  /** Maximum output tokens requested from the provider for this feature. */
  readonly maxOutputTokens: number;
  /** Provider deadline in milliseconds. */
  readonly timeoutMs: number;
  /** Maximum characters of owner-supplied free text (0 = none accepted). */
  readonly maxOwnerInputCharacters: number;
  /** Whether a same-or-cheaper-tier provider fallback is permitted. */
  readonly allowsProviderFallback: boolean;
  /** Maximum period length in days a feature may span (0 = not period-scoped). */
  readonly maxPeriodDays: number;
  /**
   * Privacy categories this feature may include WITHOUT the owner having ticked
   * the per-category allowance. Everything else needs explicit consent.
   */
  readonly defaultAllowedCategories: readonly PrivacyCategory[];
  /** Maximum requests of this feature per UTC day, per workspace. */
  readonly dailyRequestLimit: number;
}

/**
 * The shared conservative default for what may be sent without a deliberate
 * per-category decision: ordinary productivity content only.
 */
const GENERAL_ONLY: readonly PrivacyCategory[] = ["general"];

const POLICIES: Readonly<Record<AiFeatureId, AiFeaturePolicy>> = {
  "meeting-action-extraction": {
    id: "meeting-action-extraction",
    label: "Meeting actions and decisions",
    tier: "economy",
    producesProposals: true,
    requiresDeliberateConfirmation: false,
    maxEvidenceRecords: 12,
    maxExcerptCharacters: 2_000,
    maxTotalEvidenceCharacters: 16_000,
    maxExcerptsPerRecord: 6,
    maxOutputTokens: 2_500,
    timeoutMs: 45_000,
    maxOwnerInputCharacters: 0,
    allowsProviderFallback: true,
    maxPeriodDays: 0,
    defaultAllowedCategories: GENERAL_ONLY,
    dailyRequestLimit: 40,
  },
  "note-action-extraction": {
    id: "note-action-extraction",
    label: "Note actions and decisions",
    tier: "economy",
    producesProposals: true,
    requiresDeliberateConfirmation: false,
    maxEvidenceRecords: 10,
    maxExcerptCharacters: 2_000,
    maxTotalEvidenceCharacters: 14_000,
    maxExcerptsPerRecord: 6,
    maxOutputTokens: 2_500,
    timeoutMs: 45_000,
    maxOwnerInputCharacters: 0,
    allowsProviderFallback: true,
    maxPeriodDays: 0,
    defaultAllowedCategories: GENERAL_ONLY,
    dailyRequestLimit: 40,
  },
  "weekly-review-assistant": {
    id: "weekly-review-assistant",
    label: "Weekly Review assistant",
    tier: "standard",
    // The assistant proposes next-period priorities the owner accepts into the
    // Review's own focus section — text, never records. No Task is ever created.
    producesProposals: true,
    requiresDeliberateConfirmation: false,
    maxEvidenceRecords: 24,
    maxExcerptCharacters: 600,
    maxTotalEvidenceCharacters: 18_000,
    maxExcerptsPerRecord: 2,
    maxOutputTokens: 3_000,
    timeoutMs: 60_000,
    maxOwnerInputCharacters: 0,
    allowsProviderFallback: true,
    maxPeriodDays: 31,
    defaultAllowedCategories: GENERAL_ONLY,
    dailyRequestLimit: 12,
  },
  "workspace-question-answer": {
    id: "workspace-question-answer",
    label: "Ask DalyHub",
    tier: "standard",
    producesProposals: false,
    requiresDeliberateConfirmation: false,
    maxEvidenceRecords: 20,
    maxExcerptCharacters: 900,
    maxTotalEvidenceCharacters: 16_000,
    maxExcerptsPerRecord: 3,
    maxOutputTokens: 2_000,
    timeoutMs: 60_000,
    maxOwnerInputCharacters: 400,
    allowsProviderFallback: true,
    maxPeriodDays: 400,
    defaultAllowedCategories: GENERAL_ONLY,
    dailyRequestLimit: 30,
  },
};

/** The policy for a feature. Total: every declared feature has a row. */
export function aiFeaturePolicy(id: AiFeatureId): AiFeaturePolicy {
  return POLICIES[id];
}

/** Every feature policy, in declaration order. */
export function allAiFeaturePolicies(): readonly AiFeaturePolicy[] {
  return AI_FEATURE_IDS.map((id) => POLICIES[id]);
}

/**
 * Resolve the tier a request should run at. A feature's declared tier is the
 * ceiling: an owner may deliberately ask for `deep`, which is honoured ONLY when
 * the feature's own tier already permits it — nothing escalates itself, and no
 * request is ever silently promoted from economy to deep.
 */
export function resolveRequestedTier(
  policy: AiFeaturePolicy,
  requestedDeep: boolean,
): AiModelTier {
  if (!requestedDeep) return policy.tier;
  return policy.tier === "deep" ? "deep" : policy.tier;
}
