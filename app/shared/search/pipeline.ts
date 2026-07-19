/**
 * DS-08 Shared Search — the pure assembly pipeline (React-free).
 *
 * Given the raw output of each executed provider (already isolated, so a failed
 * provider is just `ok: false`), this assembles the final bounded, grouped,
 * display-ready {@link SearchOutcome}: per-provider limit → validate → dedupe →
 * rank → total limit → group → status. It performs NO provider execution, no I/O
 * and no workspace resolution — the runtime orchestrator supplies the batches.
 * Keeping this pure lets the model be tested exhaustively without a runtime.
 */

import { MAX_RESULTS_PER_PROVIDER, MAX_TOTAL_RESULTS } from "./limits";
import { groupRankedResults } from "./grouping";
import { rankResults } from "./ranking";
import { dedupeTagged, validateResultItem } from "./result";
import type {
  SearchOutcome,
  SearchOutcomeStatus,
  SearchProviderStatus,
  SearchResultItem,
  TaggedResult,
} from "./types";

/** One executed provider's contribution to a search run. */
export type ProviderResultBatch = {
  readonly providerId: string;
  readonly moduleId: string;
  /** Human label for the module-fallback group. */
  readonly moduleLabel: string;
  /** False when the provider failed or timed out (its items are ignored). */
  readonly ok: boolean;
  /** The provider's raw output (used only when `ok`). */
  readonly items: readonly SearchResultItem[];
};

export type AssembleOptions = {
  readonly maxResultsPerProvider?: number;
  readonly maxTotalResults?: number;
};

function deriveStatus(executed: number, failed: number): SearchOutcomeStatus {
  if (executed > 0 && failed === executed) {
    return "error";
  }
  if (failed > 0) {
    return "partial";
  }
  return "ok";
}

/**
 * Assemble the final outcome from executed provider batches. Deterministic and
 * fully bounded.
 */
export function assembleOutcome(
  query: string,
  batches: readonly ProviderResultBatch[],
  options: AssembleOptions = {},
): SearchOutcome {
  const perProvider = options.maxResultsPerProvider ?? MAX_RESULTS_PER_PROVIDER;
  const totalLimit = options.maxTotalResults ?? MAX_TOTAL_RESULTS;

  const providers: SearchProviderStatus[] = batches.map((batch) => ({
    providerId: batch.providerId,
    moduleId: batch.moduleId,
    ok: batch.ok,
  }));

  const moduleLabels = new Map<string, string>();
  const tagged: TaggedResult[] = [];
  for (const batch of batches) {
    if (!moduleLabels.has(batch.moduleId)) {
      moduleLabels.set(batch.moduleId, batch.moduleLabel);
    }
    if (!batch.ok) {
      continue;
    }
    const bounded = batch.items.slice(0, Math.max(0, perProvider));
    for (const item of bounded) {
      const validated = validateResultItem(
        item,
        batch.moduleId,
        batch.providerId,
      );
      if (validated !== null) {
        tagged.push(validated);
      }
    }
  }

  const unique = dedupeTagged(tagged);
  const ranked = rankResults(query, unique);
  const limited = ranked.slice(0, Math.max(0, totalLimit));
  const truncated = ranked.length > limited.length;
  const groups = groupRankedResults(limited, moduleLabels);

  const failed = batches.reduce((n, batch) => (batch.ok ? n : n + 1), 0);

  return {
    query,
    status: deriveStatus(batches.length, failed),
    groups,
    totalCount: limited.length,
    truncated,
    providers,
  };
}

/** A safe, empty outcome for an unexecuted (empty/invalid) query. */
export function emptyOutcome(query: string): SearchOutcome {
  return {
    query,
    status: "ok",
    groups: [],
    totalCount: 0,
    truncated: false,
    providers: [],
  };
}

/** A safe, total-failure outcome the UI can retry (no provider detail leaks). */
export function failureOutcome(
  query: string,
  providers: readonly SearchProviderStatus[],
): SearchOutcome {
  return {
    query,
    status: "error",
    groups: [],
    totalCount: 0,
    truncated: false,
    providers,
  };
}
