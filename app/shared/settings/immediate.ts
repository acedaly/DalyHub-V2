/**
 * DS-10b Settings layout — the immediate ("apply on change") coordinator model.
 *
 * Immediate settings apply the moment their control changes (a toggle, a select),
 * confirm success/failure through the shared DS-10 Feedback system, and — unlike
 * an editable text field — REVERT to the last committed value when the apply fails
 * (a switch that failed to save must not stay in the new position).
 *
 * This pure state machine owns the correctness-critical parts so they are testable
 * without React or a network:
 *   - OPTIMISTIC value: the control reflects the requested value immediately.
 *   - SINGLE-FLIGHT with coalesce-to-latest: rapid changes supersede one another;
 *     only the latest requested value is authoritative.
 *   - STALE-RESPONSE rejection: a superseded request's late resolve/reject is
 *     ignored (it can neither commit nor revert), preventing a flicker back to an
 *     old value — this is also what PREVENTS a duplicate/again apply from
 *     corrupting state.
 *   - REVERT on failure of the latest in-flight request.
 *
 * It deliberately reuses NOTHING product-specific and imports no React/DOM. It is a
 * sibling of DS-06's autosave coordinator (`~/shared/forms/model` `reduceAutosave`)
 * with the one semantic difference immediate settings need: revert-on-failure
 * rather than keep-the-draft.
 */

import type { ImmediateSettingStatus } from "./types";

export interface ImmediateState<TValue> {
  /** The last value the server confirmed (the value to revert to on failure). */
  readonly committed: TValue;
  /** The value currently shown to the user (optimistic while saving). */
  readonly optimistic: TValue;
  readonly status: ImmediateSettingStatus;
  /** The sequence number of the in-flight request, or null when idle. */
  readonly inFlightSeq: number | null;
  /** The value carried by the in-flight request (committed on resolve). */
  readonly inFlightValue: TValue | null;
  /** Monotonic sequence source; every apply takes the next number. */
  readonly nextSeq: number;
}

/** The side effect the coordinator asks the host to perform. */
export type ImmediateEffect<TValue> = {
  readonly type: "apply";
  readonly seq: number;
  readonly value: TValue;
} | null;

export interface ImmediateTransition<TValue> {
  readonly state: ImmediateState<TValue>;
  readonly effect: ImmediateEffect<TValue>;
}

export type ImmediateAction<TValue> =
  | { readonly type: "apply"; readonly value: TValue }
  | { readonly type: "resolved"; readonly seq: number }
  | { readonly type: "rejected"; readonly seq: number };

/** The pristine state for a setting whose committed value is `committed`. */
export function initImmediate<TValue>(
  committed: TValue,
): ImmediateState<TValue> {
  return {
    committed,
    optimistic: committed,
    status: "idle",
    inFlightSeq: null,
    inFlightValue: null,
    nextSeq: 1,
  };
}

/**
 * The pure immediate-setting reducer. Returns the next state AND the effect the
 * host must run (dispatch `resolved`/`rejected` with the SAME seq when it settles).
 *
 * `apply` always supersedes any in-flight request (coalesce-to-latest), so the
 * late settlement of a superseded request is ignored by the seq guard in
 * `resolved`/`rejected`.
 */
export function reduceImmediate<TValue>(
  state: ImmediateState<TValue>,
  action: ImmediateAction<TValue>,
): ImmediateTransition<TValue> {
  switch (action.type) {
    case "apply": {
      const seq = state.nextSeq;
      return {
        state: {
          ...state,
          optimistic: action.value,
          status: "saving",
          inFlightSeq: seq,
          inFlightValue: action.value,
          nextSeq: seq + 1,
        },
        effect: { type: "apply", seq, value: action.value },
      };
    }
    case "resolved": {
      // Ignore a stale/superseded response — it must not commit an old value.
      if (action.seq !== state.inFlightSeq) {
        return { state, effect: null };
      }
      const committed = state.inFlightValue as TValue;
      return {
        state: {
          ...state,
          committed,
          optimistic: committed,
          status: "idle",
          inFlightSeq: null,
          inFlightValue: null,
        },
        effect: null,
      };
    }
    case "rejected": {
      // Ignore a stale/superseded rejection — a newer request is authoritative.
      if (action.seq !== state.inFlightSeq) {
        return { state, effect: null };
      }
      return {
        state: {
          ...state,
          // Revert the control to the last committed value.
          optimistic: state.committed,
          status: "idle",
          inFlightSeq: null,
          inFlightValue: null,
        },
        effect: null,
      };
    }
    default:
      return { state, effect: null };
  }
}
