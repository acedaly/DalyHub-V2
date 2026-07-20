/**
 * DS-10b Settings layout — the immediate ("apply on change") setting hook.
 *
 * Wires the pure `reduceImmediate` coordinator (single-flight, coalesce-to-latest,
 * stale-response rejection, revert-on-failure — all in `immediate.ts`) to the
 * shared DS-10 Feedback platform for success/error, and to the caller's async
 * `onApply`. It is a thin COORDINATION layer: it introduces no new save engine,
 * no new notification system and no dirty-state model — immediate settings have no
 * dirty draft.
 *
 * Use it for a toggle or a select whose change should apply straight away and
 * confirm through a toast. For a setting that needs a dirty draft + explicit Save,
 * use DS-06's `useForm`; for a text field that autosaves quietly, use DS-06's
 * `useAutosaveField` with its inline `SaveStatusIndicator`.
 */

import { useCallback, useRef, useState } from "react";

import { useFeedback } from "~/shared/feedback";

import {
  initImmediate,
  reduceImmediate,
  type ImmediateState,
} from "./immediate";

export interface UseImmediateSettingOptions<TValue> {
  /** The committed value this setting starts at. */
  readonly initialValue: TValue;
  /**
   * Persist the requested value. Reject (throw) to fail — the control reverts to
   * the last committed value and an error toast is raised. Observe `signal` to
   * abort a superseded request.
   */
  readonly onApply: (value: TValue, signal: AbortSignal) => Promise<void>;
  /** A success toast title raised on a confirmed apply (omit for silent success). */
  readonly successMessage?: string | ((value: TValue) => string | undefined);
  /** The error toast title raised on failure. Defaults to a calm generic message. */
  readonly errorMessage?: string;
  /**
   * A stable key so repeated failures/successes coalesce into one toast (the
   * DS-10 dedupe behaviour) rather than stacking.
   */
  readonly feedbackKey?: string;
}

export interface UseImmediateSettingResult<TValue> {
  /** The value to render — optimistic while a save is in flight. */
  readonly value: TValue;
  /** Whether a save is currently in flight (drive a disabled/busy control). */
  readonly pending: boolean;
  /** Request applying a new value. Safe to call rapidly — the latest wins. */
  readonly apply: (next: TValue) => void;
}

const DEFAULT_ERROR_MESSAGE = "Couldn’t save that change.";

export function useImmediateSetting<TValue>({
  initialValue,
  onApply,
  successMessage,
  errorMessage = DEFAULT_ERROR_MESSAGE,
  feedbackKey,
}: UseImmediateSettingOptions<TValue>): UseImmediateSettingResult<TValue> {
  const feedback = useFeedback();

  const [state, setState] = useState<ImmediateState<TValue>>(() =>
    initImmediate(initialValue),
  );
  // A ref mirror so `apply` reads the latest state without a stale closure.
  const stateRef = useRef(state);
  stateRef.current = state;

  // The AbortController for the in-flight request, aborted when superseded.
  const controllerRef = useRef<AbortController | null>(null);

  const apply = useCallback(
    (next: TValue) => {
      const transition = reduceImmediate(stateRef.current, {
        type: "apply",
        value: next,
      });
      stateRef.current = transition.state;
      setState(transition.state);

      const effect = transition.effect;
      if (!effect) {
        return;
      }

      // Supersede any prior in-flight request.
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      const settle = (action: {
        type: "resolved" | "rejected";
        seq: number;
      }) => {
        const nextTransition = reduceImmediate(stateRef.current, action);
        stateRef.current = nextTransition.state;
        setState(nextTransition.state);
      };

      void onApply(effect.value, controller.signal).then(
        () => {
          if (controller.signal.aborted) {
            return;
          }
          settle({ type: "resolved", seq: effect.seq });
          const title =
            typeof successMessage === "function"
              ? successMessage(effect.value)
              : successMessage;
          if (title) {
            feedback.notifySuccess(title, { dedupeKey: feedbackKey });
          }
        },
        (error: unknown) => {
          if (controller.signal.aborted) {
            return;
          }
          settle({ type: "rejected", seq: effect.seq });
          const message =
            error instanceof Error && error.message ? error.message : undefined;
          feedback.notifyError(errorMessage, {
            message,
            dedupeKey: feedbackKey,
          });
        },
      );
    },
    [onApply, successMessage, errorMessage, feedbackKey, feedback],
  );

  return {
    value: state.optimistic,
    pending: state.status === "saving",
    apply,
  };
}
