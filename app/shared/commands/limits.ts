/**
 * DS-09 Command Palette — the bounded limits (single source of truth).
 *
 * Every catalogue, contextual-action set, result list, message and deadline is
 * bounded, so a malformed manifest, a hostile catalogue response, a runaway
 * surface or a hung handler can never exhaust memory, the CPU or the palette
 * (ADR-024 §24.10). These are pure constants — no React, no storage.
 */

/** Maximum number of registered commands the browser catalogue may carry. */
export const MAX_CATALOGUE_SIZE = 200;

/** Maximum number of contextual actions a surface may register at once. */
export const MAX_CONTEXTUAL_ACTIONS = 24;

/** Maximum length of a command title, in characters. */
export const MAX_COMMAND_TITLE_LENGTH = 200;

/** Maximum length of a command subtitle, in characters. */
export const MAX_COMMAND_SUBTITLE_LENGTH = 300;

/** Maximum number of keywords a command may match against. */
export const MAX_COMMAND_KEYWORDS = 32;

/** Maximum length of a single keyword, in characters. */
export const MAX_COMMAND_KEYWORD_LENGTH = 64;

/** Maximum length of a namespaced command id, in characters. */
export const MAX_COMMAND_ID_LENGTH = 128;

/** Maximum length of a module id, in characters. */
export const MAX_MODULE_ID_LENGTH = 64;

/** Maximum length of a module display label, in characters. */
export const MAX_MODULE_LABEL_LENGTH = 200;

/** Maximum number of ranked command results the palette renders for a query. */
export const MAX_COMMAND_RESULTS = 50;

/** Maximum number of suggested commands shown for an empty query. */
export const MAX_SUGGESTED_COMMANDS = 7;

/** Maximum number of recent commands remembered for the current session. */
export const MAX_RECENT_COMMANDS = 5;

/** Maximum length of a display-ready execution-outcome message, in characters. */
export const MAX_OUTCOME_MESSAGE_LENGTH = 200;

/**
 * The bounded server-side execution deadline, in milliseconds. A handler that
 * runs longer is abandoned (its `AbortSignal` is aborted) and the boundary
 * reports a calm timeout outcome — the palette never hangs pending forever.
 */
export const COMMAND_EXECUTION_DEADLINE_MS = 8000;
