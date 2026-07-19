/**
 * DS-09 Command Palette — execution state machine + outcome bounds (pure).
 *
 * The palette drives an execution through a tiny state machine guarded by a
 * monotonic token, so a slow response can never settle a state a newer activation
 * already replaced (ADR-024 §24.9), and a command is never double-invoked while
 * one is pending. It also SANITISES the outcome an (untrusted) server boundary
 * returns into a bounded, display-ready shape: no raw error, no stack trace, no
 * SQL, no infra code, message length-capped, and any post-success navigation
 * target re-validated with the shared navigation-target validator.
 */

import { validateNavigationTarget } from "~/kernel/modules";

import { MAX_OUTCOME_MESSAGE_LENGTH } from "./limits";
import type {
  CommandExecutionOutcome,
  CommandExecutionState,
  CommandFailureReason,
} from "./types";

/** The neutral starting state. */
export const INITIAL_EXECUTION_STATE: CommandExecutionState = {
  phase: "idle",
  commandId: null,
  token: 0,
  message: null,
  reason: null,
  retryable: false,
};

const FAILURE_REASONS: ReadonlySet<CommandFailureReason> = new Set([
  "unavailable",
  "conflict",
  "failed",
]);

/** Strip control characters and clamp a message to the display bound. */
export function boundMessage(message: unknown): string {
  if (typeof message !== "string") {
    return "";
  }
  let cleaned = "";
  for (const cp of message) {
    const code = cp.codePointAt(0) ?? 0;
    // Drop C0/C1 control characters and DEL; keep everything else.
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) {
      cleaned += " ";
    } else {
      cleaned += cp;
    }
  }
  cleaned = cleaned.replace(/\s+/gu, " ").trim();
  return [...cleaned].slice(0, MAX_OUTCOME_MESSAGE_LENGTH).join("");
}

/**
 * Coerce an UNTRUSTED value (e.g. decoded from the execution route's JSON) into a
 * safe {@link CommandExecutionOutcome}. Anything structurally wrong becomes a calm
 * generic failure. A success target is re-validated and dropped if unsafe.
 */
export function sanitiseOutcome(value: unknown): CommandExecutionOutcome {
  if (value === null || typeof value !== "object") {
    return genericFailure();
  }
  const candidate = value as { readonly ok?: unknown };

  if (candidate.ok === true) {
    const { message, target } = value as {
      readonly message?: unknown;
      readonly target?: unknown;
    };
    const boundedMessage = boundMessage(message);
    const validatedTarget =
      target === undefined ? null : validateNavigationTarget(target);
    return {
      ok: true,
      ...(boundedMessage.length > 0 ? { message: boundedMessage } : {}),
      ...(validatedTarget !== null ? { target: validatedTarget } : {}),
    };
  }

  if (candidate.ok === false) {
    const { reason, message } = value as {
      readonly reason?: unknown;
      readonly message?: unknown;
    };
    const safeReason: CommandFailureReason =
      typeof reason === "string" &&
      FAILURE_REASONS.has(reason as CommandFailureReason)
        ? (reason as CommandFailureReason)
        : "failed";
    const safeMessage = boundMessage(message);
    return {
      ok: false,
      reason: safeReason,
      message:
        safeMessage.length > 0
          ? safeMessage
          : defaultFailureMessage(safeReason),
    };
  }

  return genericFailure();
}

function genericFailure(): CommandExecutionOutcome {
  return {
    ok: false,
    reason: "failed",
    message: defaultFailureMessage("failed"),
  };
}

function defaultFailureMessage(reason: CommandFailureReason): string {
  switch (reason) {
    case "unavailable":
      return "That command isn’t available right now.";
    case "conflict":
      return "Something changed — try again.";
    case "failed":
    default:
      return "That command didn’t complete.";
  }
}

/**
 * Begin executing `commandId`: advance to `pending` and mint a fresh token. The
 * caller passes the returned `token` to {@link settleExecution} so a stale
 * response is ignored.
 */
export function beginExecution(
  state: CommandExecutionState,
  commandId: string,
): CommandExecutionState {
  return {
    phase: "pending",
    commandId,
    token: state.token + 1,
    message: null,
    reason: null,
    retryable: false,
  };
}

/**
 * Settle a pending execution with an outcome. If `token` is stale (a newer
 * activation has begun) the state is returned UNCHANGED — the late outcome is
 * dropped. A failure is always retryable via a deliberate new invocation.
 */
export function settleExecution(
  state: CommandExecutionState,
  token: number,
  outcome: CommandExecutionOutcome,
): CommandExecutionState {
  if (token !== state.token || state.phase !== "pending") {
    return state;
  }
  if (outcome.ok) {
    return {
      phase: "success",
      commandId: state.commandId,
      token: state.token,
      message: outcome.message ? boundMessage(outcome.message) : null,
      reason: null,
      retryable: false,
    };
  }
  return {
    phase: "error",
    commandId: state.commandId,
    token: state.token,
    message: boundMessage(outcome.message),
    reason: outcome.reason,
    retryable: true,
  };
}

/** Reset to idle (e.g. when the query changes or the palette reopens). */
export function resetExecution(
  state: CommandExecutionState,
): CommandExecutionState {
  return { ...INITIAL_EXECUTION_STATE, token: state.token };
}

/** True while an execution is in flight (blocks a duplicate activation). */
export function isExecutionPending(state: CommandExecutionState): boolean {
  return state.phase === "pending";
}
