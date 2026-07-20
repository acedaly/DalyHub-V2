/**
 * DS-10b Settings layout — the dangerous-action confirmation model (React-free).
 *
 * A deliberate, reversible confirmation for a destructive setting (delete,
 * archive, reset, disconnect …). The model owns ONLY the interaction rules:
 *   - optional TYPED confirmation (the user must retype an exact phrase — e.g. the
 *     record's name or the word "DELETE" — before Confirm is enabled);
 *   - a single-flight phase machine (idle → pending → idle | error) that PREVENTS
 *     accidental duplicate submissions while a confirmation is in flight;
 *   - retry after a failure (the phase returns to a state where Confirm is enabled
 *     again, the typed phrase preserved);
 *   - reset/cancel back to the pristine state.
 *
 * It encodes NO product rule about WHAT gets deleted — the consumer supplies the
 * async `onConfirm`. This file imports no React/DOM so it is unit-testable in
 * isolation and safe to import from non-UI code.
 */

import type { ConfirmationPhase } from "./types";

/** The pure state of one confirmation. `open` is intentionally NOT here — the */
/** dialog's mounted/unmounted state is owned by React (so focus in/out fires). */
export interface ConfirmationState {
  readonly phase: ConfirmationPhase;
  /** The current value typed into the confirmation input (empty when unused). */
  readonly typed: string;
  /** The failure message from the last rejected confirmation, else null. */
  readonly error: string | null;
}

export type ConfirmationAction =
  | { readonly type: "type"; readonly value: string }
  | { readonly type: "submit" }
  | { readonly type: "resolved" }
  | { readonly type: "rejected"; readonly message: string }
  | { readonly type: "reset" };

/** The pristine confirmation state. */
export function initConfirmation(): ConfirmationState {
  return { phase: "idle", typed: "", error: null };
}

/**
 * Whether the typed value satisfies the required phrase.
 *
 * - When no phrase is required (undefined/empty), typed confirmation is not in use
 *   and this is always satisfied.
 * - Otherwise the match is EXACT — surrounding whitespace is not trimmed and case
 *   is significant — so "delete" never passes for a required "DELETE". This mirrors
 *   the deliberate, unambiguous confirmation GitHub/Stripe use for destructive
 *   actions.
 */
export function matchesConfirmationPhrase(
  requiredPhrase: string | undefined,
  typed: string,
): boolean {
  if (requiredPhrase === undefined || requiredPhrase.length === 0) {
    return true;
  }
  return typed === requiredPhrase;
}

/**
 * Whether the Confirm action may fire right now. It is blocked while a
 * confirmation is already pending (duplicate-submission prevention) and until any
 * required phrase is matched.
 */
export function canConfirm(
  state: ConfirmationState,
  requiredPhrase: string | undefined,
): boolean {
  if (state.phase === "pending") {
    return false;
  }
  return matchesConfirmationPhrase(requiredPhrase, state.typed);
}

/**
 * The pure confirmation reducer.
 *
 * - `type` updates the typed value and clears a stale error (the user is acting
 *   again); it is ignored while pending so an in-flight confirmation cannot be
 *   mutated.
 * - `submit` enters `pending` (the single-flight gate) and clears any error.
 * - `resolved` returns to `idle` (the dialog then closes).
 * - `rejected` records the failure and re-enables Confirm for a retry, preserving
 *   the typed phrase.
 * - `reset` restores the pristine state (Cancel / dialog close).
 */
export function reduceConfirmation(
  state: ConfirmationState,
  action: ConfirmationAction,
): ConfirmationState {
  switch (action.type) {
    case "type":
      if (state.phase === "pending") {
        return state;
      }
      return { ...state, typed: action.value, error: null };
    case "submit":
      if (state.phase === "pending") {
        return state;
      }
      return { ...state, phase: "pending", error: null };
    case "resolved":
      return { ...state, phase: "idle", error: null };
    case "rejected":
      return { ...state, phase: "error", error: action.message };
    case "reset":
      return initConfirmation();
    default:
      return state;
  }
}
