/**
 * AI-01 kernel — the source fingerprint, and the reuse rule built on it.
 *
 * DalyHub reuses a previously validated result rather than paying for the same
 * answer twice — but only when NOTHING that could change the answer has changed.
 * Application-level reuse is preferred to hoping a provider's own request cache
 * matches: these prompts are personalised, so a provider cache would rarely hit,
 * and a hit DalyHub cannot see is a hit DalyHub cannot invalidate.
 *
 * The fingerprint deliberately covers everything that could alter the output:
 * feature, prompt version, provider, model, the exact evidence (ids AND their
 * `updatedAt`), the owner's own input, and the privacy settings that decided what
 * was included. Change any of them and the fingerprint changes, so the prior
 * result is not reused.
 */

import type { AiFeatureId } from "./ai-features";
import type { EvidenceSet } from "./ai-evidence";
import type { PrivacyCategory } from "./ai-evidence";

/** Everything the fingerprint is computed over. */
export interface FingerprintInput {
  readonly featureId: AiFeatureId;
  readonly promptVersion: string;
  readonly provider: string;
  readonly modelId: string;
  /** The owner's typed request, or the empty string when a feature takes none. */
  readonly ownerInput: string;
  /** Deterministic facts DalyHub calculated itself and put in the prompt. */
  readonly derivedFacts: string;
  readonly evidence: EvidenceSet;
  /** The categories that were permitted when the evidence was assembled. */
  readonly allowedCategories: readonly PrivacyCategory[];
}

/**
 * Build the canonical string a fingerprint is taken over. Separated from hashing
 * so tests can assert exactly what is (and is not) covered, and so the value is
 * reproducible without WebCrypto.
 *
 * PURE and order-stable: evidence is already deterministically ordered by
 * `selectEvidence`, and categories are sorted here.
 */
export function fingerprintSource(input: FingerprintInput): string {
  const evidence = input.evidence.items
    .map(
      (item) => `${item.id}:${item.entityId ?? "-"}:${item.updatedAt ?? "-"}`,
    )
    .join("|");
  const categories = [...input.allowedCategories].sort().join(",");
  return [
    `feature=${input.featureId}`,
    `prompt=${input.promptVersion}`,
    `provider=${input.provider}`,
    `model=${input.modelId}`,
    `categories=${categories}`,
    `owner=${input.ownerInput.trim()}`,
    `facts=${input.derivedFacts}`,
    `evidence=${evidence}`,
    `truncated=${input.evidence.truncated ? "1" : "0"}`,
  ].join("\n");
}

/**
 * A hex SHA-256 of the canonical source. Uses WebCrypto, which the Workers
 * runtime and every test environment here provide.
 */
export async function computeFingerprint(
  input: FingerprintInput,
): Promise<string> {
  return sha256Hex(fingerprintSource(input));
}

/** Hex SHA-256 of an arbitrary string. */
export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** How long a reused result stays reusable, by retention choice, in ms. */
export function reuseWindowMs(
  retention: "none" | "session" | "7d" | "30d",
): number {
  switch (retention) {
    case "none":
      return 0;
    // "session" still allows a short server-side window: it means DalyHub does
    // not KEEP the result, not that an accidental double-submit two seconds
    // apart should be charged twice.
    case "session":
      return 15 * 60 * 1000;
    case "7d":
      return 7 * 24 * 60 * 60 * 1000;
    case "30d":
      return 30 * 24 * 60 * 60 * 1000;
  }
}

/**
 * True when a stored result may be reused. Reuse requires an EXACT fingerprint
 * match inside the retention window — there is no partial or fuzzy reuse, and a
 * fingerprint is workspace- and owner-scoped by the repository query, never here.
 */
export function isReusable(input: {
  readonly storedFingerprint: string | null;
  readonly currentFingerprint: string;
  readonly generatedAt: Date;
  readonly now: Date;
  readonly retention: "none" | "session" | "7d" | "30d";
}): boolean {
  if (input.storedFingerprint === null) return false;
  if (input.storedFingerprint !== input.currentFingerprint) return false;
  const window = reuseWindowMs(input.retention);
  if (window <= 0) return false;
  const age = input.now.getTime() - input.generatedAt.getTime();
  return age >= 0 && age <= window;
}
