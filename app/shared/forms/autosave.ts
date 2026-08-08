/**
 * DS-06 Shared Forms — the pure autosave coordinator.
 *
 * Autosave is where correctness is easiest to get wrong: overlapping saves,
 * responses arriving out of order, a slow save clobbering a newer edit, a failure
 * silently losing the user's latest input. DS-06 answers all of these in ONE
 * framework-free state machine so the behaviour is deterministic and testable.
 * Timing (debounce, blur) lives in the React hook; WHAT to do on each event lives
 * here.
 *
 * Invariants this machine guarantees:
 *   - Only ONE save is ever in flight; concurrent triggers coalesce to the LATEST
 *     value (saves are sequenced, never parallel).
 *   - A response is honoured only if it matches the in-flight sequence number; a
 *     stale/late response is ignored and can never move the status or overwrite a
 *     newer edit.
 *   - A successful save commits exactly the value that was sent (captured at
 *     dispatch), never the possibly-newer current value.
 *   - A failed save keeps the user's latest input intact and offers retry; it
 *     never auto-discards or auto-retries.
 *   - No save is dispatched while the current value is invalid.
 *   - **An external (server-side) change is never allowed to destroy a draft.**
 *     See the reconciliation contract below.
 *
 * ## The reconciliation contract (NOTES-05 §18, closing DEBT-47)
 *
 * A field can change on the SERVER while an editor is mounted — another tab,
 * another device, or another surface writing the same field. Before this, the
 * hook seeded its draft from `initialValue` once and then owned it, so such a
 * change was invisible until the next load, and whoever saved last silently won.
 *
 * The unsafe-looking fix — adopt a new external value whenever one arrives —
 * would overwrite a draft out from under someone who is typing, which is exactly
 * the data loss this machine exists to prevent. So adoption is CONDITIONAL:
 *
 *   - **Clean field** (nothing pending, nothing in flight, no failed save, and
 *     the current value equals the committed one) → adopt silently. There is no
 *     draft to lose and nothing to ask about, so asking would be noise.
 *   - **Dirty field** (a pending edit, an in-flight save, or a failed save) →
 *     change NOTHING. The draft stays exactly as the user left it, and the newer
 *     server value is parked in `remote` for the UI to offer explicitly.
 *
 * The user then chooses: `adoptRemote` takes the server's version (discarding the
 * draft, but only ever on an explicit act), or `dismissRemote` keeps the draft
 * and stops asking. A "keep mine" that later saves IS last-write-wins — but a
 * deliberate one the user asked for, which is a different thing from a silent one.
 *
 * ## Server-detected conflicts (AUDIT-08)
 *
 * The contract above depends on the caller NOTICING the server-side change and
 * feeding it in. When the caller cannot (nothing revalidated between load and
 * save), the server itself refuses the write, and the `conflicted` action lands
 * that outcome here: the draft stays exactly as it is, the status returns to
 * `unsaved` rather than `error`, and the newer value is then offered through the
 * same parked-`remote` path — one reconciliation UI, not two.
 *
 * Deliberately NOT built: automatic Markdown merging. There is no deterministic
 * safe merge for prose, and a wrong merge corrupts content in a way neither
 * version does. An honest banner beats a clever guess.
 *
 * The reducer is pure: it returns the next state and, optionally, an EFFECT — a
 * request to the hook to run the persistence callback with a specific value and
 * sequence number. The hook runs the effect and dispatches the result back.
 */

import { valuesEqual, type IsEqual } from "./dirty";
import type { AutosaveStatus } from "./types";

/** The immutable state of one autosaving field. */
export interface AutosaveState<TValue> {
  readonly status: AutosaveStatus;
  /** The last value known to be persisted. */
  readonly committed: TValue;
  /** The latest edited value (what the input currently shows). */
  readonly current: TValue;
  /** Whether the current value passes validation (no save while invalid). */
  readonly valid: boolean;
  /** The sequence number of the in-flight save, or null when none is running. */
  readonly inFlightSeq: number | null;
  /** The value captured for the in-flight save, or null when none is running. */
  readonly inFlightValue: TValue | null;
  /** Monotonic allocator for the next save's sequence number. */
  readonly nextSeq: number;
  /** The message of the latest failed save, or null. */
  readonly error: string | null;
  /**
   * A server-side value newer than `committed` that could NOT be adopted because
   * the field was dirty — parked for the UI to offer, never applied silently.
   * `null` whenever there is nothing outstanding to reconcile.
   */
  readonly remote: TValue | null;
}

/**
 * What a persistence callback may report beyond "it worked" (resolve) and "it
 * failed" (reject).
 *
 * `{ outcome: "conflict" }` says the SERVER refused the write because the value
 * had changed since this editor loaded it (AUDIT-08). It is neither of the other
 * two: nothing was persisted, so reporting success would lie about where the
 * user's text is, and nothing malfunctioned, so reporting an error would send
 * them to retry a save that will be refused again for the same good reason.
 * Returning nothing keeps the original two-outcome contract, so every existing
 * caller is unchanged.
 */
export type AutosaveSaveResult = void | { readonly outcome: "conflict" };

/** A request from the reducer to the hook to run the persistence callback. */
export type AutosaveEffect<TValue> = {
  readonly type: "save";
  readonly seq: number;
  readonly value: TValue;
} | null;

/** The reducer's output: the next state and an optional effect to run. */
export interface AutosaveTransition<TValue> {
  readonly state: AutosaveState<TValue>;
  readonly effect: AutosaveEffect<TValue>;
}

/** Actions the hook dispatches into the coordinator. */
export type AutosaveAction<TValue> =
  /** The user edited the value; `valid` reflects the new value's validity. */
  | { readonly type: "edit"; readonly value: TValue; readonly valid: boolean }
  /** A trigger fired (valid blur or debounce elapsed) — attempt a save. */
  | { readonly type: "requestSave" }
  /** The in-flight save with `seq` succeeded. */
  | { readonly type: "resolved"; readonly seq: number }
  /** The in-flight save with `seq` failed with a display message. */
  | {
      readonly type: "rejected";
      readonly seq: number;
      readonly message: string;
    }
  /**
   * The in-flight save with `seq` was REFUSED by the server because the value
   * changed elsewhere (AUDIT-08). Not a failure and not a success: nothing was
   * written, the draft is intact, and the newer server value should be offered
   * through the same reconciliation banner an out-of-band change uses.
   */
  | { readonly type: "conflicted"; readonly seq: number }
  /** The user asked to retry after a failure. */
  | { readonly type: "retry" }
  /** The server's value for this field is now `value` (see the contract above). */
  | { readonly type: "external"; readonly value: TValue }
  /** The user chose the parked server version over their draft. */
  | { readonly type: "adoptRemote" }
  /** The user chose to keep their draft; stop offering the server version. */
  | { readonly type: "dismissRemote" };

/** Build the initial coordinator state around a committed value. */
export function initAutosave<TValue>(committed: TValue): AutosaveState<TValue> {
  return {
    status: "idle",
    committed,
    current: committed,
    valid: true,
    inFlightSeq: null,
    inFlightValue: null,
    nextSeq: 1,
    error: null,
    remote: null,
  };
}

function noEffect<TValue>(
  state: AutosaveState<TValue>,
): AutosaveTransition<TValue> {
  return { state, effect: null };
}

/** Dispatch a save of the current value, allocating a fresh sequence number. */
function dispatchSave<TValue>(
  state: AutosaveState<TValue>,
): AutosaveTransition<TValue> {
  const seq = state.nextSeq;
  return {
    state: {
      ...state,
      status: "saving",
      inFlightSeq: seq,
      inFlightValue: state.current,
      nextSeq: seq + 1,
      error: null,
    },
    effect: { type: "save", seq, value: state.current },
  };
}

/**
 * The pure autosave reducer. `isEqual` compares values for "nothing to save" and
 * "edited during flight" decisions; it defaults to the shared structural
 * equality.
 */
export function reduceAutosave<TValue>(
  state: AutosaveState<TValue>,
  action: AutosaveAction<TValue>,
  isEqual: IsEqual<TValue> = valuesEqual,
): AutosaveTransition<TValue> {
  switch (action.type) {
    case "edit": {
      const matchesCommitted = isEqual(action.value, state.committed);
      // A fresh edit supersedes a prior error; the input is always preserved.
      const status: AutosaveStatus = matchesCommitted
        ? state.inFlightSeq !== null
          ? "saving"
          : "idle"
        : "unsaved";
      return noEffect({
        ...state,
        current: action.value,
        valid: action.valid,
        status,
        error: null,
      });
    }

    case "requestSave": {
      if (!state.valid) return noEffect(state);
      if (isEqual(state.current, state.committed)) {
        // Nothing to persist; keep any in-flight save's status.
        return noEffect({
          ...state,
          status: state.inFlightSeq !== null ? "saving" : "idle",
        });
      }
      // A save already runs — do not start a parallel one. The in-flight
      // completion will coalesce to whatever `current` is by then.
      if (state.inFlightSeq !== null) {
        return noEffect({ ...state, status: "saving" });
      }
      return dispatchSave(state);
    }

    case "resolved": {
      // Ignore a stale/duplicate response that is not the current in-flight save.
      if (action.seq !== state.inFlightSeq) return noEffect(state);
      const committed = state.inFlightValue as TValue;
      const settled: AutosaveState<TValue> = {
        ...state,
        committed,
        inFlightSeq: null,
        inFlightValue: null,
        error: null,
        // Our save just became the server's value, so any parked remote version
        // is superseded — continuing to offer it would offer content that no
        // longer exists anywhere.
        remote: null,
      };
      // Edited during the save? Coalesce to the latest value if it is valid.
      if (!isEqual(settled.current, committed)) {
        if (settled.valid) return dispatchSave(settled);
        return noEffect({ ...settled, status: "unsaved" });
      }
      return noEffect({ ...settled, status: "saved" });
    }

    case "rejected": {
      if (action.seq !== state.inFlightSeq) return noEffect(state);
      // Keep `committed` unchanged and `current` intact; surface the error and
      // offer retry. Never auto-retry, never discard the draft.
      return noEffect({
        ...state,
        status: "error",
        inFlightSeq: null,
        inFlightValue: null,
        error: action.message,
      });
    }

    case "conflicted": {
      if (action.seq !== state.inFlightSeq) return noEffect(state);
      // The server refused the write, so `committed` is still what it was and
      // `current` is still the user's draft — the two now genuinely disagree,
      // which is exactly what `unsaved` means. Reporting `error` instead would
      // say "something went wrong"; nothing did, and the caller has a specific
      // thing to show. The newer server value arrives separately as `external`
      // and is parked for the user to decide on.
      return noEffect({
        ...state,
        status: "unsaved",
        inFlightSeq: null,
        inFlightValue: null,
        error: null,
      });
    }

    case "retry": {
      if (!state.valid) return noEffect({ ...state, error: null });
      if (isEqual(state.current, state.committed)) {
        return noEffect({ ...state, status: "saved", error: null });
      }
      if (state.inFlightSeq !== null) {
        return noEffect({ ...state, status: "saving", error: null });
      }
      return dispatchSave({ ...state, error: null });
    }

    case "external": {
      // The server already agrees with what we hold — nothing to reconcile, and
      // any previously-parked version is stale.
      if (isEqual(action.value, state.committed)) {
        return noEffect(
          state.remote === null ? state : { ...state, remote: null },
        );
      }
      // Clean field: adopt silently. There is no draft to lose, so asking would
      // be noise, and the editor simply shows the current truth.
      if (isClean(state, isEqual)) {
        return noEffect({
          ...state,
          committed: action.value,
          current: action.value,
          // A value the server accepted is valid by construction.
          valid: true,
          status: "idle",
          error: null,
          remote: null,
        });
      }
      // Dirty field: change NOTHING the user can see. Park the newer version.
      return noEffect({ ...state, remote: action.value });
    }

    case "adoptRemote": {
      if (state.remote === null) return noEffect(state);
      // Defensive: adopting mid-save would be resolved over by the in-flight
      // save's own completion, so the UI does not offer it and the reducer
      // refuses it. (The banner's action is disabled while `saving`.)
      if (state.inFlightSeq !== null) return noEffect(state);
      const adopted = state.remote;
      return noEffect({
        ...state,
        committed: adopted,
        current: adopted,
        valid: true,
        status: "idle",
        error: null,
        remote: null,
      });
    }

    case "dismissRemote": {
      // Keep the draft exactly as it is and stop offering the server version.
      // The next save WILL overwrite it — deliberately, because the user said so.
      return noEffect(
        state.remote === null ? state : { ...state, remote: null },
      );
    }

    default:
      return noEffect(state);
  }
}

/**
 * True when the field holds nothing the user could lose: no pending edit, no
 * save in flight, and no failed save waiting to be retried. This is the exact
 * precondition for adopting an external value silently.
 */
function isClean<TValue>(
  state: AutosaveState<TValue>,
  isEqual: IsEqual<TValue>,
): boolean {
  return (
    state.inFlightSeq === null &&
    state.status !== "error" &&
    isEqual(state.current, state.committed)
  );
}

/** True when the current value is persisted (idle or saved with no pending edit). */
export function isPersisted<TValue>(
  state: AutosaveState<TValue>,
  isEqual: IsEqual<TValue> = valuesEqual,
): boolean {
  return isClean(state, isEqual);
}
