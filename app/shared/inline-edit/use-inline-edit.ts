/**
 * DS-16 — the React binding for the shared inline-edit state machine.
 *
 * Owns the three things every inline field needs and none of them well when each
 * module writes its own: the transition into and out of editing, the async
 * submission (with its superseded-reply guard), and FOCUS.
 *
 * Focus is the part that is easy to get subtly wrong and impossible to notice
 * with a mouse. Activating the read affordance destroys the button the keyboard
 * user was standing on; saving or cancelling destroys the input. Both times, if
 * nothing puts focus somewhere deliberate, the browser drops it on `<body>` and
 * the next Tab starts from the top of the document. So: entering focuses the
 * control, leaving returns focus to the read affordance, every time, on both
 * paths (AGENTS.md §15).
 */

import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  type RefObject,
} from "react";

import {
  inlineEditReducer,
  initialInlineEditState,
  type InlineEditState,
  type InlineSaveOutcome,
} from "./inline-edit-model";

export interface UseInlineEditOptions<T> {
  /** The stored value, used to seed the draft when editing begins. */
  readonly value: T;
  /**
   * Persist the draft. MUST go through the module's own trusted server action —
   * authentication, workspace scoping, domain validation and activity all stay
   * server-side (AGENTS.md §17). This hook never touches storage.
   *
   * Resolve `{ ok: false, message }` for a refusal. A thrown error is caught and
   * treated the same way, with a generic message, so a network failure cannot
   * take the draft down with it.
   */
  readonly onSave: (draft: T) => Promise<InlineSaveOutcome>;
  /** Compare drafts, so an unchanged submission can skip the round trip. */
  readonly isEqual?: (a: T, b: T) => boolean;
  /** Called after a save that actually persisted (never after a no-op). */
  readonly onSaved?: (draft: T) => void;
}

export interface UseInlineEdit<T> {
  readonly state: InlineEditState<T>;
  /** True while the field is open for editing, in any sub-state. */
  readonly editing: boolean;
  /** The draft, or the stored value while not editing. */
  readonly draft: T;
  /** True while a submission is in flight. */
  readonly pending: boolean;
  /** The refusal message from the last failed save, if it still applies. */
  readonly error: string | null;
  readonly begin: () => void;
  readonly change: (draft: T) => void;
  readonly cancel: () => void;
  readonly submit: (override?: T) => void;
  /** Attach to the read affordance so focus can be returned to it. */
  readonly triggerRef: RefObject<HTMLElement | null>;
}

function defaultIsEqual<T>(a: T, b: T): boolean {
  return Object.is(a, b);
}

export function useInlineEdit<T>({
  value,
  onSave,
  isEqual = defaultIsEqual,
  onSaved,
}: UseInlineEditOptions<T>): UseInlineEdit<T> {
  const [state, dispatch] = useReducer(
    inlineEditReducer<T>,
    undefined,
    initialInlineEditState<T>,
  );
  const triggerRef = useRef<HTMLElement | null>(null);
  // Focus is restored on the render AFTER the field closes, because the read
  // affordance does not exist until then.
  const restoreFocusRef = useRef(false);

  const valueRef = useRef(value);
  valueRef.current = value;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const isEqualRef = useRef(isEqual);
  isEqualRef.current = isEqual;

  // The ONE attempt counter. It lives here rather than in the reducer because
  // the async continuation has to know which attempt it is reporting, and the
  // reducer's next state is not readable synchronously after a dispatch.
  const attemptRef = useRef(0);

  const editing = state.status !== "view";

  useEffect(() => {
    if (!editing && restoreFocusRef.current) {
      restoreFocusRef.current = false;
      triggerRef.current?.focus();
    }
  }, [editing]);

  const begin = useCallback(() => {
    dispatch({ type: "begin", draft: valueRef.current });
  }, []);

  const change = useCallback((draft: T) => {
    dispatch({ type: "change", draft });
  }, []);

  const cancel = useCallback(() => {
    restoreFocusRef.current = true;
    dispatch({ type: "cancel" });
  }, []);

  // The live draft, readable synchronously by `submit` (which is called from a
  // key handler that has no access to the reducer's next state).
  const draftRef = useRef<T>(value);
  draftRef.current = state.status === "view" ? value : state.draft;

  const submit = useCallback((override?: T) => {
    const draft = override !== undefined ? override : (draftRef.current as T);
    // An unchanged value is not worth a request — and, more importantly, not
    // worth an Activity entry claiming the record was edited.
    if (isEqualRef.current(draft, valueRef.current)) {
      restoreFocusRef.current = true;
      dispatch({ type: "cancel" });
      return;
    }
    if (override !== undefined) {
      dispatch({ type: "change", draft: override });
    }
    attemptRef.current += 1;
    const attempt = attemptRef.current;
    dispatch({ type: "submit", attempt });
    void (async () => {
      let outcome: InlineSaveOutcome;
      try {
        outcome = await onSaveRef.current(draft);
      } catch {
        outcome = {
          ok: false,
          message:
            "That couldn’t be saved. Your change is still here — try again.",
        };
      }
      if (outcome.ok) {
        restoreFocusRef.current = true;
        dispatch({ type: "resolved", attempt });
        onSavedRef.current?.(draft);
      } else {
        dispatch({ type: "rejected", attempt, message: outcome.message });
      }
    })();
  }, []);

  return {
    state,
    editing,
    draft: draftRef.current,
    pending: state.status === "saving",
    error: state.status === "failed" ? state.message : null,
    begin,
    change,
    cancel,
    submit,
    triggerRef,
  };
}
