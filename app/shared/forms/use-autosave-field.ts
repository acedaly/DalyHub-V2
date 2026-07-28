/**
 * DS-06 Shared Forms — the autosave field hook.
 *
 * Wraps the pure {@link reduceAutosave} coordinator with the timing and effect
 * execution a React field needs: a deterministic trigger (a restrained debounce
 * and/or a valid blur), running the persistence callback for a dispatched save,
 * and feeding the result back into the coordinator. All the hard correctness —
 * one save in flight, coalesce to latest, ignore stale responses, preserve input
 * on failure, no save while invalid — lives in the pure reducer; this hook only
 * schedules and executes.
 *
 * The autosave TRIGGER is explicit and documented (never magical): a field saves
 * `debounceMs` after the last valid edit, and immediately on a valid blur. The
 * status it exposes (`unsaved`/`saving`/`saved`/`error`) is the calm, visible
 * signal the user reads to know whether their value is committed.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  initAutosave,
  isPersisted,
  reduceAutosave,
  type AutosaveAction,
  type AutosaveState,
} from "./autosave";
import { valuesEqual, type IsEqual } from "./dirty";
import type { AutosaveStatus, Validator } from "./types";
import { runValidator } from "./validation";

/** The default debounce: calm, not chatty. A valid blur saves immediately. */
export const DEFAULT_AUTOSAVE_DEBOUNCE_MS = 800;

const DEFAULT_SAVE_ERROR =
  "Couldn’t save. Your changes are still here — try again.";

export interface UseAutosaveFieldOptions<TValue> {
  /** The committed initial value. */
  readonly initialValue: TValue;
  /**
   * Persist the value. Reject (throw) to signal failure — the message shown is
   * `errorMessage`, never the raw exception. The signal is aborted if the hook
   * unmounts or the save is superseded.
   */
  readonly onSave: (value: TValue, signal: AbortSignal) => Promise<void>;
  /** Synchronous validation; an invalid value is never saved. */
  readonly validate?: Validator<TValue>;
  /** Debounce after the last valid edit. `0` disables debounce (blur-only). */
  readonly debounceMs?: number;
  /** Custom equality for "nothing changed" decisions. */
  readonly isEqual?: IsEqual<TValue>;
  /** The calm message shown when a save fails. */
  readonly errorMessage?: string;
}

export interface UseAutosaveFieldResult<TValue> {
  readonly value: TValue;
  readonly status: AutosaveStatus;
  /** The save-failure message, or null. */
  readonly error: string | null;
  /** The current validation message, or null. */
  readonly validationError: string | null;
  readonly onChange: (value: TValue) => void;
  readonly onBlur: () => void;
  readonly retry: () => void;
  /**
   * Force the current value to be safely persisted before proceeding with
   * something that will unmount this field (e.g. a record-level Delete) —
   * unmounting otherwise ABORTS an in-flight save's fetch and, for an
   * unsaved/failed edit, discards it outright, since the draft lives only in
   * this hook's React state. Cancels any pending debounce and saves
   * immediately if needed; awaits an already in-flight save rather than
   * starting a second one. Resolves `true` once `value` is confirmed
   * persisted, `false` if the value is invalid or the save failed — callers
   * MUST treat `false` as "do not proceed", never as "proceed anyway".
   */
  readonly flush: () => Promise<boolean>;
}

export function useAutosaveField<TValue>(
  options: UseAutosaveFieldOptions<TValue>,
): UseAutosaveFieldResult<TValue> {
  const {
    initialValue,
    validate,
    debounceMs = DEFAULT_AUTOSAVE_DEBOUNCE_MS,
    isEqual = valuesEqual,
    errorMessage = DEFAULT_SAVE_ERROR,
  } = options;

  const [state, setState] = useState<AutosaveState<TValue>>(() =>
    initAutosave(initialValue),
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  const stateRef = useRef(state);
  stateRef.current = state;
  const onSaveRef = useRef(options.onSave);
  onSaveRef.current = options.onSave;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const flushWaitersRef = useRef<Array<(persisted: boolean) => void>>([]);

  const settleFlushWaiters = useCallback((persisted: boolean) => {
    if (flushWaitersRef.current.length === 0) return;
    const waiters = flushWaitersRef.current;
    flushWaitersRef.current = [];
    waiters.forEach((resolve) => resolve(persisted));
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Apply an action to the coordinator and execute any resulting save effect.
  const dispatch = useCallback(
    (action: AutosaveAction<TValue>) => {
      const { state: next, effect } = reduceAutosave(
        stateRef.current,
        action,
        isEqual,
      );
      stateRef.current = next;
      setState(next);

      // A `flush()` caller is waiting for the value to become durably safe (or
      // to definitively fail) — settle it the moment this dispatch lands on
      // either outcome, regardless of what triggered the dispatch.
      if (isPersisted(next, isEqual)) {
        settleFlushWaiters(true);
      } else if (next.status === "error") {
        settleFlushWaiters(false);
      }

      if (effect && effect.type === "save") {
        const { seq, value } = effect;
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        onSaveRef.current(value, controller.signal).then(
          () => {
            if (!mountedRef.current) return;
            dispatch({ type: "resolved", seq });
          },
          () => {
            if (!mountedRef.current) return;
            dispatch({ type: "rejected", seq, message: errorMessage });
          },
        );
      }
    },
    [isEqual, errorMessage, settleFlushWaiters],
  );

  const onChange = useCallback(
    (value: TValue) => {
      const outcome = runValidator(validate, value);
      setValidationError(outcome.ok ? null : outcome.message);
      dispatch({ type: "edit", value, valid: outcome.ok });

      clearTimer();
      if (outcome.ok && debounceMs > 0) {
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          dispatch({ type: "requestSave" });
        }, debounceMs);
      }
    },
    [validate, dispatch, clearTimer, debounceMs],
  );

  const onBlur = useCallback(() => {
    clearTimer();
    dispatch({ type: "requestSave" });
  }, [clearTimer, dispatch]);

  const retry = useCallback(() => {
    clearTimer();
    dispatch({ type: "retry" });
  }, [clearTimer, dispatch]);

  const flush = useCallback((): Promise<boolean> => {
    clearTimer();
    if (isPersisted(stateRef.current, isEqual)) {
      return Promise.resolve(true);
    }
    if (!stateRef.current.valid) {
      return Promise.resolve(false);
    }
    return new Promise<boolean>((resolve) => {
      flushWaitersRef.current.push(resolve);
      // An in-flight save already has a resolver watching for it; only a
      // genuinely idle unsaved/error state needs a fresh dispatch.
      if (stateRef.current.inFlightSeq === null) {
        dispatch({ type: "requestSave" });
      }
    });
  }, [clearTimer, dispatch, isEqual]);

  return {
    value: state.current,
    status: state.status,
    error: state.error,
    validationError,
    onChange,
    onBlur,
    retry,
    flush,
  };
}
