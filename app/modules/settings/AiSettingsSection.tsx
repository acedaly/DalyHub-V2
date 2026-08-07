/**
 * AI-01 / AI-04 — the owner-facing AI settings section.
 *
 * What this surface deliberately does NOT contain: a field for an API key.
 *
 * Provider credentials are Worker secrets. There is no text input that stores a
 * key in D1 or in browser storage, because there is no code path that could read
 * one back — and offering a fake credential manager would be a lie about where
 * the secret lives. Where changing credentials requires Cloudflare configuration,
 * this says so plainly.
 */

import { useFetcher } from "react-router";

import {
  MAX_DAILY_BUDGET_USD,
  MAX_MONTHLY_BUDGET_USD,
  MAX_PREMIUM_BUDGET_USD,
  PRICING_VERIFIED_AT,
  SENSITIVE_CATEGORIES,
  aiFeaturePolicy,
  allAiFeaturePolicies,
  formatUsd,
  privacyCategoryLabel,
  type AiFeatureId,
  type AiModelTier,
  type PrivacyCategory,
} from "~/kernel/ai";
import { SelectField } from "~/shared/forms";
import { SettingsGroup, SettingsLayout, SettingsRow } from "~/shared/settings";

/** Everything the section renders. Assembled server-side; carries no secret. */
export interface AiSettingsData {
  readonly enabled: boolean;
  readonly defaultProvider: string;
  readonly configuredProviders: readonly string[];
  readonly gatewayConfigured: boolean;
  readonly routingMode: string;
  readonly inconsistency: string | null;
  readonly allowedFeatures: readonly AiFeatureId[];
  readonly monthlyBudgetUsd: number;
  readonly dailyBudgetUsd: number;
  readonly premiumBudgetUsd: number;
  readonly premiumAllowed: boolean;
  readonly monthSpentUsd: number;
  readonly daySpentUsd: number;
  readonly premiumSpentUsd: number;
  readonly allowedCategories: readonly PrivacyCategory[];
  readonly loggingMode: string;
  readonly resultRetention: string;
  readonly providerFallbackAllowed: boolean;
  readonly featureUsage: readonly {
    readonly featureId: AiFeatureId;
    readonly requests: number;
    readonly estimatedUsd: number;
  }[];
  readonly models: readonly {
    readonly tier: AiModelTier;
    readonly label: string;
    readonly provider: string;
    readonly costUnavailable: boolean;
  }[];
}

export function AiSettingsSection({ data }: { readonly data: AiSettingsData }) {
  const fetcher = useFetcher();

  const set = (field: string, value: string) => {
    const body = new FormData();
    body.set("intent", "ai-update");
    body.set("field", field);
    body.set("value", value);
    void fetcher.submit(body, { method: "post" });
  };

  return (
    <SettingsLayout
      title="AI"
      description="Bounded, evidence-backed assistance over your own records. DalyHub selects the evidence, AI returns a proposal, and you decide what becomes part of DalyHub."
    >
      <SettingsGroup title="Status">
        <SettingsRow
          label="AI assistance"
          description="When this is off, DalyHub works exactly as it does now — nothing else changes."
          control={(ids) => (
            <button
              id={ids.controlId}
              type="button"
              className="dh-btn dh-btn--ghost"
              aria-describedby={ids.describedById}
              onClick={() => set("enabled", data.enabled ? "0" : "1")}
            >
              {data.enabled ? "Turn AI off" : "Turn AI on"}
            </button>
          )}
        />
        <SettingsRow
          label="Configured providers"
          description="Provider API keys are server secrets. DalyHub cannot read one back, and there is no field here that would store one — changing a key means changing the Worker secret in Cloudflare."
          control={
            <span className="dh-settings-page__text-value">
              {data.configuredProviders.length === 0
                ? "None"
                : data.configuredProviders.join(", ")}
            </span>
          }
          align="start"
        />
        <SettingsRow
          label="Request routing"
          description="Direct means DalyHub calls the provider itself. Gateway means requests go through your Cloudflare AI Gateway first, using your own provider keys."
          control={
            <span className="dh-settings-page__text-value">
              {data.routingMode === "gateway"
                ? "Cloudflare AI Gateway"
                : "Direct to provider"}
            </span>
          }
          align="start"
        />
        {data.inconsistency !== null ? (
          <SettingsRow
            label="Configuration problem"
            description={data.inconsistency}
            control={
              <span className="dh-settings-page__text-value">
                Needs attention
              </span>
            }
            align="start"
          />
        ) : null}
        <SettingsRow
          label="Default provider"
          description="Used when more than one provider is configured."
          /* M3-INT — the shared select, like every other application-style
           * select in Settings (audit finding 6). */
          control={(ids) => (
            <SelectField
              id={ids.controlId}
              label="Default provider"
              labelledBy={ids.labelId}
              describedBy={ids.describedById}
              showOptionalCue={false}
              value={data.defaultProvider}
              options={[
                { value: "anthropic", label: "Anthropic" },
                { value: "openai", label: "OpenAI" },
              ]}
              onChange={(next) => set("defaultProvider", next)}
            />
          )}
        />
      </SettingsGroup>

      <SettingsGroup
        title="Models"
        description={`The models DalyHub is allowed to use, by tier. Prices were last verified on ${PRICING_VERIFIED_AT}; a model with no verified price cannot be used, because it could not be budgeted honestly.`}
      >
        {data.models.map((model) => (
          <SettingsRow
            key={`${model.provider}-${model.tier}`}
            label={`${model.tier} — ${model.provider}`}
            description={
              model.costUnavailable
                ? "Cost unavailable, so this model is not used."
                : "Approved and priced."
            }
            control={
              <span className="dh-settings-page__text-value">
                {model.label}
              </span>
            }
            align="start"
          />
        ))}
      </SettingsGroup>

      <SettingsGroup
        title="Budget"
        description="DalyHub enforces these itself, before any provider is contacted. They are separate from any limit you set in Cloudflare or with your provider — those act after the fact and cannot stop a request."
      >
        <SettingsRow
          label="Monthly budget (USD)"
          description={`${formatUsd(data.monthSpentUsd)} used this month. Maximum ${formatUsd(MAX_MONTHLY_BUDGET_USD)}.`}
          control={(ids) => (
            <input
              id={ids.controlId}
              type="number"
              className="dh-input"
              min={0}
              max={MAX_MONTHLY_BUDGET_USD}
              step="0.01"
              aria-labelledby={ids.labelId}
              aria-describedby={ids.describedById}
              defaultValue={data.monthlyBudgetUsd}
              onBlur={(event) => set("monthlyBudgetUsd", event.target.value)}
            />
          )}
          align="start"
        />
        <SettingsRow
          label="Daily budget (USD)"
          description={`${formatUsd(data.daySpentUsd)} used today. Maximum ${formatUsd(MAX_DAILY_BUDGET_USD)}. Periods are UTC days and months so they never shift with daylight saving.`}
          control={(ids) => (
            <input
              id={ids.controlId}
              type="number"
              className="dh-input"
              min={0}
              max={MAX_DAILY_BUDGET_USD}
              step="0.01"
              aria-labelledby={ids.labelId}
              aria-describedby={ids.describedById}
              defaultValue={data.dailyBudgetUsd}
              onBlur={(event) => set("dailyBudgetUsd", event.target.value)}
            />
          )}
          align="start"
        />
        <SettingsRow
          label="Deep analysis allowance (USD per month)"
          description={`${formatUsd(data.premiumSpentUsd)} used. Maximum ${formatUsd(MAX_PREMIUM_BUDGET_USD)}. Deep analysis costs more and always needs a separate, deliberate action.`}
          control={(ids) => (
            <input
              id={ids.controlId}
              type="number"
              className="dh-input"
              min={0}
              max={MAX_PREMIUM_BUDGET_USD}
              step="0.01"
              aria-labelledby={ids.labelId}
              aria-describedby={ids.describedById}
              defaultValue={data.premiumBudgetUsd}
              onBlur={(event) => set("premiumBudgetUsd", event.target.value)}
            />
          )}
          align="start"
        />
        <SettingsRow
          label="Allow deep analysis"
          description="Off by default. Nothing escalates to it automatically."
          control={(ids) => (
            <button
              id={ids.controlId}
              type="button"
              className="dh-btn dh-btn--ghost"
              aria-labelledby={`${ids.labelId} ${ids.controlId}`}
              aria-describedby={ids.describedById}
              onClick={() =>
                set("premiumAllowed", data.premiumAllowed ? "0" : "1")
              }
            >
              {data.premiumAllowed ? "Turn off" : "Turn on"}
            </button>
          )}
        />
      </SettingsGroup>

      <SettingsGroup
        title="Usage this month"
        description="Operational metadata only. DalyHub records what a request cost, not what was in it."
      >
        {data.featureUsage.length === 0 ? (
          <SettingsRow
            label="No AI requests yet"
            description="Nothing has been sent to a provider this month."
            control={<span className="dh-settings-page__text-value">—</span>}
          />
        ) : (
          data.featureUsage.map((entry) => (
            <SettingsRow
              key={entry.featureId}
              label={aiFeaturePolicy(entry.featureId).label}
              description={`${entry.requests} ${entry.requests === 1 ? "request" : "requests"}`}
              control={
                <span className="dh-settings-page__text-value">
                  {formatUsd(entry.estimatedUsd)}
                </span>
              }
            />
          ))
        )}
      </SettingsGroup>

      <SettingsGroup
        title="Features"
        description="Turn individual capabilities off. A feature that is off is refused server-side, not just hidden."
      >
        {allAiFeaturePolicies().map((policy) => (
          <SettingsRow
            key={policy.id}
            label={policy.label}
            description={`Runs at the ${policy.tier} tier.`}
            control={(ids) => (
              <button
                id={ids.controlId}
                type="button"
                className="dh-btn dh-btn--ghost"
                aria-labelledby={`${ids.labelId} ${ids.controlId}`}
                aria-describedby={ids.describedById}
                onClick={() =>
                  set(
                    "feature",
                    `${policy.id}:${data.allowedFeatures.includes(policy.id) ? "0" : "1"}`,
                  )
                }
              >
                {data.allowedFeatures.includes(policy.id) ? "On" : "Off"}
              </button>
            )}
          />
        ))}
      </SettingsGroup>

      <SettingsGroup
        title="Privacy"
        description="Sensitive categories are excluded from AI evidence unless you allow them here. Ordinary productivity content is always allowed."
      >
        {SENSITIVE_CATEGORIES.map((category) => (
          <SettingsRow
            key={category}
            label={privacyCategoryLabel(category)}
            description="Off by default."
            control={(ids) => (
              <button
                id={ids.controlId}
                type="button"
                className="dh-btn dh-btn--ghost"
                aria-labelledby={`${ids.labelId} ${ids.controlId}`}
                aria-describedby={ids.describedById}
                onClick={() =>
                  set(
                    "category",
                    `${category}:${data.allowedCategories.includes(category) ? "0" : "1"}`,
                  )
                }
              >
                {data.allowedCategories.includes(category)
                  ? "Allowed"
                  : "Excluded"}
              </button>
            )}
          />
        ))}
        <SettingsRow
          label="Provider fallback"
          description="When both providers are configured, allow DalyHub to retry a failed request on the other one at the same or a cheaper tier."
          control={(ids) => (
            <button
              id={ids.controlId}
              type="button"
              className="dh-btn dh-btn--ghost"
              aria-labelledby={`${ids.labelId} ${ids.controlId}`}
              aria-describedby={ids.describedById}
              onClick={() =>
                set(
                  "providerFallbackAllowed",
                  data.providerFallbackAllowed ? "0" : "1",
                )
              }
            >
              {data.providerFallbackAllowed ? "Allowed" : "Not allowed"}
            </button>
          )}
        />
      </SettingsGroup>

      <SettingsGroup
        title="Logging and retention"
        description="This controls what DALYHUB records. Your provider — and Cloudflare AI Gateway, if you have enabled its request logging — keep their own records under their own policies, which DalyHub cannot see or change."
      >
        <SettingsRow
          label="Record prompt and response bodies"
          description="Off by default. DalyHub keeps tokens, duration, feature, model and cost, plus a bounded failure category — never record content."
          control={(ids) => (
            <button
              id={ids.controlId}
              type="button"
              className="dh-btn dh-btn--ghost"
              aria-labelledby={`${ids.labelId} ${ids.controlId}`}
              aria-describedby={ids.describedById}
              onClick={() =>
                set(
                  "loggingMode",
                  data.loggingMode === "bodies" ? "metadata_only" : "bodies",
                )
              }
            >
              {data.loggingMode === "bodies" ? "Recording" : "Not recording"}
            </button>
          )}
          align="start"
        />
        <SettingsRow
          label="Reuse generated results"
          description="How long DalyHub may return an earlier answer for an identical request whose source records have not changed."
          control={(ids) => (
            <SelectField
              id={ids.controlId}
              label="Reuse generated results"
              labelledBy={ids.labelId}
              describedBy={ids.describedById}
              showOptionalCue={false}
              value={data.resultRetention}
              options={[
                { value: "none", label: "Never reuse" },
                { value: "session", label: "Only briefly" },
                { value: "7d", label: "Up to 7 days" },
                { value: "30d", label: "Up to 30 days" },
              ]}
              onChange={(next) => set("resultRetention", next)}
            />
          )}
          align="start"
        />
        <SettingsRow
          label="What is sent"
          description="The records DalyHub selects for a request are sent to your configured provider. You remain responsible for your provider account and its data settings — see your provider's developer-platform data policy. DalyHub does not claim your data is never stored by them."
          control={
            <span className="dh-settings-page__text-value">
              The selected records
            </span>
          }
          align="start"
        />
      </SettingsGroup>
    </SettingsLayout>
  );
}
