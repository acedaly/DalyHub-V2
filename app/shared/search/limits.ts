/**
 * DS-08 Shared Search — the bounded limits every layer enforces.
 *
 * Search is safe and fast because it is bounded at every edge: the query length,
 * the number of providers we will run, the results a single provider may return,
 * the total results we assemble, and the size of each display field. These
 * constants are the single source of truth for those bounds — the pure model, the
 * runtime orchestrator and the browser controller all import them, so no layer can
 * quietly exceed a limit another layer assumes (AGENTS.md §16, ADR-023).
 *
 * This file is pure data. It imports nothing and is safe in the React-free model,
 * the Worker and the browser alike.
 */

/** Maximum accepted query length, in Unicode code points, after normalisation. */
export const MAX_QUERY_LENGTH = 128;

/** Minimum meaningful query length; shorter queries never execute a provider. */
export const MIN_QUERY_LENGTH = 1;

/** Maximum number of registered providers global search will execute in one run. */
export const MAX_PROVIDERS = 24;

/** Maximum results a single provider may contribute (enforced on its output). */
export const MAX_RESULTS_PER_PROVIDER = 20;

/** Maximum total results the assembled, grouped output may contain. */
export const MAX_TOTAL_RESULTS = 50;

/** Maximum rendered length of a result title (longer titles are truncated). */
export const MAX_TITLE_LENGTH = 200;

/** Maximum rendered length of a result subtitle/preview. */
export const MAX_SUBTITLE_LENGTH = 300;

/** Maximum length of a provider-supplied result id. */
export const MAX_RESULT_ID_LENGTH = 128;

/** Maximum length of a Drawer key (an opaque, module-owned token). */
export const MAX_DRAWER_KEY_LENGTH = 256;

/** Maximum length of an in-app navigation path. */
export const MAX_PATH_LENGTH = 2048;

/** Maximum length of a well-formed entity-type slug (mirrors FND-02). */
export const MAX_ENTITY_TYPE_LENGTH = 64;

/**
 * Per-provider execution deadline (ms). A provider that has not resolved within
 * this window is aborted and treated as a failure, so one hung provider can never
 * block healthy providers or the overall outcome. Conservative for Workers but
 * fast enough that Search stays responsive; overridable in tests.
 */
export const DEFAULT_PROVIDER_TIMEOUT_MS = 2000;
