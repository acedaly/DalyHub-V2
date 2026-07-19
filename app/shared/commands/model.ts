/**
 * DS-09 Command Palette — the React-free model entry point
 * (`~/shared/commands/model`).
 *
 * The pure heart of the palette: catalogue validation/decoding, query-driven
 * command ranking, deterministic grouping, the merge with DS-08 Search results,
 * the keyboard-shortcut model, the presentation context, the execution state
 * machine and the bounded limits. It imports NO React, React Router, Cloudflare
 * types, D1 adapters, Worker bindings or product modules — an import-guard test
 * enforces this — so the server (catalogue builder, execution boundary) and the
 * browser both reuse it. It reuses DS-08's React-free model (`~/shared/search/
 * model`) for query normalisation, fuzzy matching and keyboard-selection maths
 * rather than shipping a second copy (ADR-024 §24.2/§24.10).
 *
 * The React UI, the controller, the transports and the providers live in sibling
 * files and are deliberately NOT re-exported here.
 */

export * from "./types";
export * from "./limits";
export {
  EMPTY_PALETTE_CONTEXT,
  contextBoost,
  type PaletteContext,
} from "./context";
export {
  decodeCatalogueEntry,
  decodeCommandCatalogue,
  catalogueEntryToPaletteCommand,
} from "./catalogue";
export {
  scoreCommand,
  rankCommands,
  TIER_EXACT_TITLE,
  TIER_TITLE_PREFIX,
  TIER_TOKEN_PREFIX,
  TIER_KEYWORD,
  TIER_FUZZY_TITLE,
  TIER_SUBTITLE,
  TIER_NONE,
} from "./ranking";
export {
  groupCommands,
  flattenCommandGroups,
  type GroupCommandsOptions,
} from "./grouping";
export {
  buildPaletteView,
  optionAtIndex,
  type PaletteOption,
  type PaletteSection,
  type PaletteView,
} from "./merge";
export {
  normaliseShortcut,
  shortcutSignature,
  formatShortcut,
  matchesShortcut,
  isReservedShortcut,
  resolveShortcutCollisions,
  RESERVED_SHORTCUTS,
  type ShortcutPlatform,
  type ShortcutModifier,
  type NormalisedShortcut,
  type ShortcutKeyEvent,
  type ShortcutClaim,
  type ShortcutResolution,
} from "./shortcut";
export {
  INITIAL_EXECUTION_STATE,
  boundMessage,
  sanitiseOutcome,
  beginExecution,
  settleExecution,
  resetExecution,
  isExecutionPending,
} from "./execution";

// Keyboard-selection maths are already solved by DS-08 — reuse them over the
// merged palette index space rather than duplicating (ADR-024 §24.10).
export {
  clampIndex,
  nextIndex,
  previousIndex,
  firstIndex,
  lastIndex,
} from "~/shared/search/model";

// Enabled-aware (skip-disabled) selection layered on top of the flat index space,
// so keyboard movement never lands on a disabled contextual action.
export {
  isOptionEnabled,
  optionEnabledMask,
  firstEnabledIndex,
  lastEnabledIndex,
  nextEnabledIndex,
  previousEnabledIndex,
  clampActiveIndex,
} from "./selection";
