/**
 * DS-08 Shared Search — the UI/runtime public surface.
 *
 * The React surface, the browser controller, the transport and the runtime
 * orchestrator. The React-FREE model has its own entry (`~/shared/search/model`)
 * and is intentionally not re-exported here, so a server or a search provider can
 * depend on the model without pulling React into its bundle.
 *
 * Note: the shell lazy-loads `SearchSurface` by its module path so the full Search
 * UI stays out of the initial application bundle — import the default export from
 * `~/shared/search/SearchSurface` directly for that, not this barrel.
 */

export { default as SearchSurface } from "./SearchSurface";
export type { SearchSurfaceProps } from "./SearchSurface";
export { Highlight } from "./Highlight";
export {
  useSearchController,
  SEARCH_DEBOUNCE_MS,
  type SearchController,
  type SearchPhase,
  type UseSearchControllerOptions,
} from "./useSearchController";
export {
  fetchSearch,
  SEARCH_ENDPOINT,
  SEARCH_QUERY_PARAM,
  type SearchFn,
} from "./client";
export {
  buildResultDestination,
  destinationHref,
  type ResultDestination,
  type CurrentLocation,
} from "./navigation";
export { executeSearch, type ExecuteSearchOptions } from "./orchestrator";
