/**
 * DS-08 Shared Search — the runtime orchestration boundary (React-free).
 *
 * The trusted seam that turns a raw query into a bounded, grouped outcome by
 * executing registered providers. It:
 *
 *   1. obtains providers ONLY from the caller (which sourced them from
 *      `ModuleRegistry.listSearchProviders()`); it never keeps a manual array;
 *   2. receives a trusted, server-derived `ModuleRuntimeContext` — it never accepts
 *      or reads a client-supplied workspace id;
 *   3. normalises and bounds the query (an empty/invalid query runs no provider);
 *   4. bounds the provider count and the per-provider result count;
 *   5. executes each provider under a bounded DEADLINE with a per-provider
 *      `AbortSignal` (also linked to an optional caller/client signal), so one
 *      broken OR hung provider can never crash or stall global search;
 *   6. isolates failures/timeouts to `ok: false` — no stack trace, SQL, binding,
 *      timeout or raw exception message ever leaves this boundary, and a late
 *      resolution/rejection of an abandoned provider is safely consumed;
 *   7. delegates validation, dedupe, ranking, limits and grouping to the pure
 *      model, returning a calm partial-results state (or a retryable total
 *      failure) as appropriate.
 *
 * It does not log the raw query. It imports only kernel *types* and the pure
 * model — no React, no D1, no bindings.
 */

import type {
  ModuleRuntimeContext,
  RegisteredSearchProvider,
  SearchResultItem,
  SearchRuntimeContext,
} from "~/kernel/modules";

import {
  DEFAULT_PROVIDER_TIMEOUT_MS,
  MAX_PROVIDERS,
  MAX_RESULTS_PER_PROVIDER,
  MAX_TOTAL_RESULTS,
  assembleOutcome,
  emptyOutcome,
  isExecutableQuery,
  normaliseQuery,
  type ProviderResultBatch,
  type SearchOutcome,
} from "./model";

export type ExecuteSearchOptions = {
  /** Providers to run — sourced from `ModuleRegistry.listSearchProviders()`. */
  readonly providers: readonly RegisteredSearchProvider[];
  /** The trusted, server-derived runtime context (workspace scope). */
  readonly context: ModuleRuntimeContext;
  /** The raw, unbounded query text from the request. */
  readonly rawQuery: string;
  readonly maxProviders?: number;
  readonly maxResultsPerProvider?: number;
  readonly maxTotalResults?: number;
  /** Per-provider deadline in ms (default {@link DEFAULT_PROVIDER_TIMEOUT_MS}). */
  readonly timeoutMs?: number;
  /** Optional caller/client cancellation — aborts every provider when fired. */
  readonly signal?: AbortSignal;
};

type ProviderRun = {
  readonly ok: boolean;
  readonly items: readonly SearchResultItem[];
};

/**
 * Run one provider under a deadline with a linked abort signal. NEVER rejects:
 * resolves to `{ ok, items }`. On timeout it aborts the provider's signal and
 * resolves `ok: false`; a late resolution/rejection is consumed and ignored (no
 * unhandled work). A synchronous throw becomes a rejection via the async wrapper.
 */
function runProviderWithDeadline(
  provider: RegisteredSearchProvider,
  query: { readonly text: string; readonly limit: number },
  baseContext: ModuleRuntimeContext,
  outerSignal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<ProviderRun> {
  const controller = new AbortController();
  const context: SearchRuntimeContext = {
    ...baseContext,
    signal: controller.signal,
  };

  // Link the caller/client signal to this provider's controller.
  const forwardAbort = () => controller.abort();
  if (outerSignal !== undefined) {
    if (outerSignal.aborted) {
      controller.abort();
    } else {
      outerSignal.addEventListener("abort", forwardAbort, { once: true });
    }
  }

  return new Promise<ProviderRun>((resolve) => {
    let settled = false;
    const finish = (result: ProviderRun) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (outerSignal !== undefined) {
        outerSignal.removeEventListener("abort", forwardAbort);
      }
      resolve(result);
    };

    const timer = setTimeout(() => {
      controller.abort(); // signal the (possibly hung) provider to stop
      finish({ ok: false, items: [] });
    }, timeoutMs);

    // The async wrapper turns a synchronous provider throw into a rejection, so
    // it is isolated like any other failure. Attaching both handlers consumes a
    // late resolution/rejection even after the deadline already resolved us.
    Promise.resolve()
      .then(() => provider.search(query, context))
      .then(
        (value) =>
          finish({
            ok: Array.isArray(value),
            items: Array.isArray(value) ? value : [],
          }),
        () => finish({ ok: false, items: [] }),
      );
  });
}

/**
 * Execute global search. Never throws for a provider failure/timeout; returns a
 * bounded, grouped {@link SearchOutcome}. An empty or sub-minimal query returns a
 * safe empty outcome without executing any provider.
 */
export async function executeSearch(
  options: ExecuteSearchOptions,
): Promise<SearchOutcome> {
  const query = normaliseQuery(options.rawQuery);
  if (!isExecutableQuery(query)) {
    return emptyOutcome(query);
  }

  const maxProviders = options.maxProviders ?? MAX_PROVIDERS;
  const perProvider = options.maxResultsPerProvider ?? MAX_RESULTS_PER_PROVIDER;
  const timeoutMs = options.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS;
  const providers = options.providers.slice(0, Math.max(0, maxProviders));

  const searchQuery = { text: query, limit: perProvider };

  // Each provider is deadline-bounded and never rejects, so a plain `Promise.all`
  // resolves within the deadline even if a provider hangs forever.
  const runs = await Promise.all(
    providers.map((provider) =>
      runProviderWithDeadline(
        provider,
        searchQuery,
        options.context,
        options.signal,
        timeoutMs,
      ),
    ),
  );

  const batches: ProviderResultBatch[] = providers.map((provider, index) => ({
    providerId: provider.id,
    moduleId: provider.moduleId,
    moduleLabel: provider.label,
    ok: runs[index].ok,
    items: runs[index].items,
  }));

  return assembleOutcome(query, batches, {
    maxResultsPerProvider: perProvider,
    maxTotalResults: options.maxTotalResults ?? MAX_TOTAL_RESULTS,
  });
}
