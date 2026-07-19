/**
 * DS-08 Shared Search — the React-free model entry point (`~/shared/search/model`).
 *
 * This is the pure heart of Shared Search: query normalisation and bounds, result
 * and target validation, deterministic fuzzy ranking, grouping, deduplication,
 * the assembly pipeline, keyboard-selection maths and the bounded limits. It
 * imports NO React, React Router, Cloudflare types, D1 adapters, Worker bindings
 * or product modules — an import-guard test enforces this — so a server orchestrator
 * or a module's search provider can reuse it without resolving any UI.
 *
 * The React UI, the browser controller and the runtime orchestrator live in
 * sibling files and are deliberately NOT re-exported here.
 */

export * from "./types";
export * from "./limits";
export { normaliseQuery, isExecutableQuery, foldCase } from "./query";
export {
  foldText,
  fuzzyMatch,
  mergeRanges,
  type FoldedText,
  type FuzzyMatch,
} from "./fuzzy";
export { isSafeInAppPath, validateTarget } from "./target";
export { validateResultItem, resultIdentity, dedupeTagged } from "./result";
export { rankResults } from "./ranking";
export { groupRankedResults, flattenGroups } from "./grouping";
export {
  assembleOutcome,
  emptyOutcome,
  failureOutcome,
  type ProviderResultBatch,
  type AssembleOptions,
} from "./pipeline";
export {
  clampIndex,
  nextIndex,
  previousIndex,
  firstIndex,
  lastIndex,
} from "./selection";
export { decodeSearchOutcome } from "./decode";
