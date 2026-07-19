/**
 * DS-06 Shared Forms — the explicit-save form host hook.
 *
 * `useForm` owns the state of an explicit-save form: the typed values, the
 * committed baseline, per-field validation (sync and async), the submission
 * lifecycle and the focus of the first invalid field. It is entity-agnostic — it
 * knows nothing of the domain being edited; the consumer supplies typed initial
 * values, per-field validators and one `onSubmit` persistence callback.
 *
 * Guarantees it upholds (the DEBT-03 "predictable save" contract):
 *   - Validation runs on blur and on submit; the first failing sync rule wins.
 *   - A submit is blocked while any value is invalid (no save while invalid).
 *   - On a failed submit, focus moves to the first invalid field.
 *   - EVERY entered value is preserved when validation or persistence fails.
 *   - Server validation is authoritative: server field/form errors are shown even
 *     when client validation passed.
 *   - A successful save commits exactly the SUBMITTED snapshot as the new
 *     baseline — never a newer draft typed while the save was in flight — so an
 *     edit made mid-submission stays dirty and cannot be silently discarded.
 *   - Cancel restores the baseline; dirty comparison honours per-field `isEqual`.
 *   - Duplicate submits are prevented while one is in flight.
 *   - Stale async validation responses are ignored, and a pending async validator
 *     is invalidated (and aborted) the moment its field changes.
 *   - A reset or unmount abandons any in-flight submission/validation cleanly.
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { valuesEqual, type IsEqual } from "./dirty";
import {
  INITIAL_SUBMIT_STATE,
  beginSubmit,
  firstInvalidField,
  submitFailed,
  submitSucceeded,
  type SubmitState,
} from "./save-state";
import type { AsyncValidator, Validator } from "./types";
import { runValidator } from "./validation";

/** Per-field configuration a form declares. All parts are optional. */
export interface FormFieldConfig<TValue> {
  /** Synchronous validation, run on blur, on change-after-error and on submit. */
  readonly validate?: Validator<TValue>;
  /** Asynchronous validation (e.g. a server check), run on blur and on submit. */
  readonly validateAsync?: AsyncValidator<TValue>;
  /** Custom equality for dirty comparison (defaults to structural equality). */
  readonly isEqual?: IsEqual<TValue>;
}

/** The result a consumer's `onSubmit` returns, making success/failure explicit. */
export type SubmitOutcome<TValues> =
  | { readonly status: "success" }
  | {
      readonly status: "error";
      readonly formError?: string;
      readonly fieldErrors?: Partial<Record<keyof TValues & string, string>>;
    };

export interface UseFormOptions<TValues extends Record<string, unknown>> {
  /** The initial (committed) values; also the baseline for dirty/reset. */
  readonly initialValues: TValues;
  /** Per-field validation/equality configuration. */
  readonly fields?: {
    readonly [K in keyof TValues]?: FormFieldConfig<TValues[K]>;
  };
  /**
   * Persist the values. Return `{status:"success"}` on success or
   * `{status:"error", …}` with server errors on failure. An unexpected throw is
   * caught and shown as a generic, safe form-level error — never a raw exception.
   */
  readonly onSubmit: (
    values: TValues,
  ) => Promise<SubmitOutcome<TValues> | void>;
  /** Field order for first-invalid focus and the error summary. */
  readonly fieldOrder?: ReadonlyArray<keyof TValues & string>;
  /** Message shown when persistence throws unexpectedly. */
  readonly unexpectedErrorMessage?: string;
}

/** Anything the form can call `.focus()` on to move to an invalid field. */
export interface FocusableControl {
  focus(): void;
}

/** The props a control spreads to bind to a form field. */
export interface FieldBinding<TValue> {
  readonly id: string;
  readonly value: TValue;
  readonly error: string | null;
  readonly onChange: (value: TValue) => void;
  /**
   * Blur handler. A composite control that commits a value ON blur (e.g. the
   * tags control) may pass the exact committed value so validation runs against
   * it rather than the pre-render state.
   */
  readonly onBlur: (committedValue?: TValue) => void;
  readonly controlRef: (node: FocusableControl | null) => void;
}

export interface UseFormResult<TValues extends Record<string, unknown>> {
  readonly values: TValues;
  readonly submit: SubmitState;
  readonly isDirty: boolean;
  readonly isSubmitting: boolean;
  /** Bind a control to a field: `<TextField {...form.field("title")} />`. */
  readonly field: <K extends keyof TValues & string>(
    name: K,
  ) => FieldBinding<TValues[K]>;
  /** Imperatively set a field value (e.g. from a composite control). */
  readonly setValue: <K extends keyof TValues & string>(
    name: K,
    value: TValues[K],
  ) => void;
  /** The current field errors, keyed by name, for the error summary. */
  readonly fieldErrors: Readonly<Record<string, string>>;
  /** The form-level error, or null. */
  readonly formError: string | null;
  /** The declared/derived field order. */
  readonly fieldOrder: ReadonlyArray<keyof TValues & string>;
  /** Submit handler for the `<form onSubmit>`. */
  readonly handleSubmit: (event?: { preventDefault(): void }) => void;
  /** Restore the committed baseline (Cancel), clearing errors and touched state. */
  readonly reset: () => void;
  /** Focus a field by name (used by the error summary links). */
  readonly focusField: (name: string) => void;
  /** The stable base id for a field name (matches the control's `id`). */
  readonly fieldId: (name: string) => string;
}

const DEFAULT_UNEXPECTED_ERROR =
  "Something went wrong saving your changes. Your work is safe — please try again.";

export function useForm<TValues extends Record<string, unknown>>(
  options: UseFormOptions<TValues>,
): UseFormResult<TValues> {
  const formId = useId();
  const [values, setValues] = useState<TValues>(options.initialValues);
  const [baseline, setBaseline] = useState<TValues>(options.initialValues);
  const [submit, setSubmit] = useState<SubmitState>(INITIAL_SUBMIT_STATE);

  const controlRefs = useRef(new Map<string, FocusableControl | null>());
  const refCallbacks = useRef(
    new Map<string, (node: FocusableControl | null) => void>(),
  );
  // Per-field async validation sequence + abort controller, so a stale response
  // is both ignored (seq) and cancelled (abort) the moment its field changes.
  const asyncSeq = useRef(new Map<string, number>());
  const asyncControllers = useRef(new Map<string, AbortController>());

  // A ref mirror of the latest values so blur/async callbacks read the current
  // draft without being re-created on every keystroke.
  const valuesRef = useRef(values);
  valuesRef.current = values;

  const onSubmitRef = useRef(options.onSubmit);
  onSubmitRef.current = options.onSubmit;
  const unexpectedMessage =
    options.unexpectedErrorMessage ?? DEFAULT_UNEXPECTED_ERROR;

  // A submission "generation": bumped on every submit and every reset. An
  // in-flight submission only applies its result if its generation is still
  // current AND the hook is still mounted, so a reset/unmount mid-submit is safe.
  const submitGen = useRef(0);
  const submittingRef = useRef(false);
  const mountedRef = useRef(true);

  const fieldsConfig = options.fields;
  const getConfig = useCallback(
    <K extends keyof TValues & string>(
      name: K,
    ): FormFieldConfig<TValues[K]> | undefined =>
      fieldsConfig?.[name] as FormFieldConfig<TValues[K]> | undefined,
    [fieldsConfig],
  );

  const equalityFor = useCallback(
    (name: string): ((a: unknown, b: unknown) => boolean) =>
      (fieldsConfig?.[name as keyof TValues]?.isEqual as
        ((a: unknown, b: unknown) => boolean) | undefined) ?? valuesEqual,
    [fieldsConfig],
  );

  const abortAllAsync = useCallback(() => {
    for (const controller of asyncControllers.current.values()) {
      controller.abort();
    }
    asyncControllers.current.clear();
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortAllAsync();
    };
  }, [abortAllAsync]);

  const fieldOrder: ReadonlyArray<keyof TValues & string> = useMemo(
    () =>
      options.fieldOrder ??
      (Object.keys(options.initialValues) as Array<keyof TValues & string>),
    [options.fieldOrder, options.initialValues],
  );

  // Dirty when ANY field differs from the baseline, honouring each field's
  // declared `isEqual` comparator (structural equality otherwise).
  const isDirty = useMemo(() => {
    const keys = new Set([...Object.keys(values), ...Object.keys(baseline)]);
    for (const key of keys) {
      if (!equalityFor(key)(values[key], baseline[key])) return true;
    }
    return false;
  }, [values, baseline, equalityFor]);
  const isSubmitting = submit.status === "submitting";

  const setFieldError = useCallback((name: string, message: string | null) => {
    setSubmit((prev) => {
      const next = { ...prev.fieldErrors };
      if (message) next[name] = message;
      else delete next[name];
      return { ...prev, fieldErrors: next };
    });
  }, []);

  const runAsyncValidation = useCallback(
    <K extends keyof TValues & string>(
      name: K,
      value: TValues[K],
      validator: AsyncValidator<TValues[K]>,
    ) => {
      // Cancel any prior in-flight validator for this field and take a fresh seq.
      asyncControllers.current.get(name)?.abort();
      const seq = (asyncSeq.current.get(name) ?? 0) + 1;
      asyncSeq.current.set(name, seq);
      const controller = new AbortController();
      asyncControllers.current.set(name, controller);
      const eq = equalityFor(name);
      validator(value, controller.signal)
        .then((outcome) => {
          // Apply only if this is still the current request, it wasn't aborted,
          // the hook is mounted, and the field value still matches what we
          // validated (guards against any late resolution overwriting a newer
          // value).
          if (
            controller.signal.aborted ||
            !mountedRef.current ||
            asyncSeq.current.get(name) !== seq ||
            !eq(valuesRef.current[name], value)
          ) {
            return;
          }
          if (!outcome.ok) setFieldError(name, outcome.message);
        })
        .catch(() => {
          // A rejected/aborted async validation is not surfaced as a field
          // error; server validation on submit stays authoritative.
        });
    },
    [equalityFor, setFieldError],
  );

  const setValue = useCallback(
    <K extends keyof TValues & string>(name: K, value: TValues[K]) => {
      setValues((prev) => ({ ...prev, [name]: value }));
      // A value change invalidates and cancels any pending async validation for
      // this field, so an old response cannot attach an error to a newer value.
      asyncControllers.current.get(name)?.abort();
      asyncControllers.current.delete(name);
      asyncSeq.current.set(name, (asyncSeq.current.get(name) ?? 0) + 1);
      // Live-clear/refresh an existing error as the user fixes the field; we do
      // NOT introduce a new error on change (validation is on blur/submit).
      setSubmit((prev) => {
        if (!prev.fieldErrors[name]) return prev;
        const outcome = runValidator(getConfig(name)?.validate, value);
        const next = { ...prev.fieldErrors };
        if (outcome.ok) delete next[name];
        else next[name] = outcome.message;
        return { ...prev, fieldErrors: next };
      });
    },
    [getConfig],
  );

  const validateFieldOnBlur = useCallback(
    <K extends keyof TValues & string>(
      name: K,
      committedValue?: TValues[K],
    ) => {
      const config = getConfig(name);
      // A composite control that commits on blur passes the exact committed
      // value; otherwise read the current draft.
      const value =
        committedValue !== undefined ? committedValue : valuesRef.current[name];
      const outcome = runValidator(config?.validate, value);
      if (!outcome.ok) {
        setFieldError(name, outcome.message);
        return;
      }
      setFieldError(name, null);
      if (config?.validateAsync) {
        runAsyncValidation(name, value, config.validateAsync);
      }
    },
    [getConfig, setFieldError, runAsyncValidation],
  );

  const focusField = useCallback((name: string) => {
    controlRefs.current.get(name)?.focus();
  }, []);

  const getRefCallback = useCallback((name: string) => {
    let cb = refCallbacks.current.get(name);
    if (!cb) {
      cb = (node: FocusableControl | null) => {
        controlRefs.current.set(name, node);
      };
      refCallbacks.current.set(name, cb);
    }
    return cb;
  }, []);

  const fieldId = useCallback((name: string) => `${formId}-${name}`, [formId]);

  const field = useCallback(
    <K extends keyof TValues & string>(name: K): FieldBinding<TValues[K]> => ({
      id: fieldId(name),
      value: values[name],
      error: submit.fieldErrors[name] ?? null,
      onChange: (value: TValues[K]) => setValue(name, value),
      onBlur: (committedValue?: TValues[K]) =>
        validateFieldOnBlur(name, committedValue),
      controlRef: getRefCallback(name),
    }),
    [
      fieldId,
      values,
      submit.fieldErrors,
      setValue,
      validateFieldOnBlur,
      getRefCallback,
    ],
  );

  const focusFirstInvalid = useCallback(
    (errors: Record<string, string>) => {
      const first = firstInvalidField(fieldOrder as readonly string[], errors);
      if (first) queueMicrotask(() => focusField(first));
    },
    [fieldOrder, focusField],
  );

  const handleSubmit = useCallback(
    (event?: { preventDefault(): void }) => {
      event?.preventDefault();
      if (submittingRef.current) return; // duplicate-submit guard (synchronous)

      // Capture ONE immutable submission snapshot. Everything below — sync and
      // async validation, the onSubmit callback, and the success baseline — uses
      // this snapshot, never `valuesRef.current`. So an edit made while the
      // submission is in flight cannot become the committed baseline: the form
      // stays dirty and the newer draft is preserved.
      const snapshot = valuesRef.current;
      const gen = ++submitGen.current;
      const isCurrent = () => submitGen.current === gen && mountedRef.current;

      // 1) Synchronous validation of every field against the snapshot.
      const syncErrors: Record<string, string> = {};
      for (const name of fieldOrder) {
        const outcome = runValidator(getConfig(name)?.validate, snapshot[name]);
        if (!outcome.ok) syncErrors[name] = outcome.message;
      }
      if (Object.keys(syncErrors).length > 0) {
        setSubmit(submitFailed({ fieldErrors: syncErrors }));
        focusFirstInvalid(syncErrors);
        return;
      }

      // 2) Enter submitting; run async validation then persistence.
      submittingRef.current = true;
      setSubmit(beginSubmit());
      void (async () => {
        try {
          const asyncErrors: Record<string, string> = {};
          for (const name of fieldOrder) {
            const validator = getConfig(name)?.validateAsync;
            if (!validator) continue;
            const controller = new AbortController();
            const outcome = await validator(snapshot[name], controller.signal);
            if (!outcome.ok) asyncErrors[name] = outcome.message;
          }
          if (!isCurrent()) return; // reset/unmount abandoned this submission
          if (Object.keys(asyncErrors).length > 0) {
            setSubmit(submitFailed({ fieldErrors: asyncErrors }));
            focusFirstInvalid(asyncErrors);
            return;
          }

          const outcome = await onSubmitRef.current(snapshot);
          if (!isCurrent()) return;
          if (!outcome || outcome.status === "success") {
            // Commit exactly what was submitted as the new baseline.
            setBaseline(snapshot);
            setSubmit(submitSucceeded());
            return;
          }
          const fieldErrors = (outcome.fieldErrors ?? {}) as Record<
            string,
            string
          >;
          setSubmit(
            submitFailed({
              formError: outcome.formError ?? null,
              fieldErrors,
            }),
          );
          focusFirstInvalid(fieldErrors);
        } catch {
          if (isCurrent()) {
            setSubmit(submitFailed({ formError: unexpectedMessage }));
          }
        } finally {
          if (submitGen.current === gen) submittingRef.current = false;
        }
      })();
    },
    [fieldOrder, getConfig, focusFirstInvalid, unexpectedMessage],
  );

  const reset = useCallback(() => {
    // Abandon any in-flight submission/validation and restore the baseline.
    submitGen.current += 1;
    submittingRef.current = false;
    abortAllAsync();
    asyncSeq.current.clear();
    setValues(baseline);
    setSubmit(INITIAL_SUBMIT_STATE);
  }, [baseline, abortAllAsync]);

  return {
    values,
    submit,
    isDirty,
    isSubmitting,
    field,
    setValue,
    fieldErrors: submit.fieldErrors,
    formError: submit.formError,
    fieldOrder,
    handleSubmit,
    reset,
    focusField,
    fieldId,
  };
}

/** Structural-equality re-export so consumers can build custom `isEqual`. */
export { valuesEqual };
