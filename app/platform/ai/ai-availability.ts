/**
 * AI-01 platform — the shared server helper every AI surface uses.
 *
 * It lives in the PLATFORM, not in the AI module, because Meetings, Notes and
 * Reviews all need to know whether an AI action can run — and a module must
 * never import another module (ADR-013 §4.2). Modules depend on the platform;
 * they never depend on each other.
 *
 * One place resolves preferences, configuration and limits, so a route is a thin,
 * auditable shell: authenticate, name a feature, hand over. Routes never
 * construct an adapter, never see a credential and never build a prompt.
 */

import {
  aiFeaturePolicy,
  budgetPeriodKeys,
  budgetSnapshot,
  permittedCategories,
  type AiFeatureId,
  type AiPreferences,
  type EvidenceLimits,
  type EvidenceSet,
  type PrivacyCategory,
} from "~/kernel/ai";
import type { WorkspaceScope } from "~/platform/workspaces";

import {
  resolveAiConfiguration,
  type AiConfigEnv,
  type ResolvedAiConfiguration,
} from "./ai-configuration";

/** Everything a route needs, resolved once. */
export interface AiRequestContext {
  readonly preferences: AiPreferences;
  readonly configuration: ResolvedAiConfiguration;
  readonly allowedCategories: ReadonlySet<PrivacyCategory>;
  readonly limits: EvidenceLimits;
}

/** Resolve the AI context for one feature. Reads secrets; returns none. */
export async function resolveAiContext(
  scope: WorkspaceScope,
  ownerId: string,
  featureId: AiFeatureId,
  env: AiConfigEnv,
): Promise<AiRequestContext> {
  const preferences = await scope.aiPreferences.get(ownerId);
  const policy = aiFeaturePolicy(featureId);
  return {
    preferences,
    configuration: resolveAiConfiguration(env),
    allowedCategories: permittedCategories(
      preferences,
      policy.defaultAllowedCategories,
    ),
    limits: {
      maxRecords: policy.maxEvidenceRecords,
      maxExcerptCharacters: policy.maxExcerptCharacters,
      maxTotalCharacters: policy.maxTotalEvidenceCharacters,
      maxExcerptsPerRecord: policy.maxExcerptsPerRecord,
    },
  };
}

/** The owner-facing AI availability + budget state a surface renders from. */
export interface AiAvailability {
  readonly enabled: boolean;
  readonly providerConfigured: boolean;
  readonly featureAllowed: boolean;
  readonly budgetExhausted: boolean;
  readonly monthRemainingUsd: number;
  readonly dayRemainingUsd: number;
  readonly monthlyBudgetUsd: number;
  readonly monthSpentUsd: number;
  /** Whether DalyHub itself records prompt/response bodies. */
  readonly bodyLoggingEnabled: boolean;
  /** Sensitive categories the owner has allowed. */
  readonly allowedCategories: readonly PrivacyCategory[];
}

/** Read AI availability for a feature, without running anything. */
export async function readAiAvailability(
  scope: WorkspaceScope,
  ownerId: string,
  featureId: AiFeatureId,
  env: AiConfigEnv,
  now = new Date(),
): Promise<AiAvailability> {
  const context = await resolveAiContext(scope, ownerId, featureId, env);
  const keys = budgetPeriodKeys(now);
  const totals = await scope.aiUsage.totals({
    day: keys.day,
    month: keys.month,
    featureId,
  });
  const snapshot = budgetSnapshot(context.preferences, totals, keys);
  return {
    enabled: context.preferences.enabled,
    providerConfigured: context.configuration.anyProviderConfigured,
    featureAllowed: context.preferences.allowedFeatures.includes(featureId),
    budgetExhausted: snapshot.exhausted,
    monthRemainingUsd: snapshot.remaining.monthUsd,
    dayRemainingUsd: snapshot.remaining.dayUsd,
    monthlyBudgetUsd: snapshot.monthlyBudgetUsd,
    monthSpentUsd: snapshot.monthSpentUsd,
    bodyLoggingEnabled: context.preferences.loggingMode === "bodies",
    allowedCategories: context.preferences.allowedCategories,
  };
}

/** A citation card, resolved from evidence DalyHub itself supplied. */
export interface SerializedCitation {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly date: string | null;
  readonly href: string | null;
  readonly excerpt: string;
}

/**
 * Resolve the citation cards for a result. Only ids DalyHub supplied resolve;
 * anything else is simply absent, because the schema validator already refused an
 * unknown id — this is the second, structural guarantee that an unknown citation
 * can never render.
 */
export function serializeCitations(
  evidence: EvidenceSet,
): readonly SerializedCitation[] {
  return evidence.items.map((item) => ({
    id: item.id,
    kind: item.kind,
    title: item.title,
    date: item.date,
    href: item.href,
    excerpt: item.excerpt,
  }));
}
