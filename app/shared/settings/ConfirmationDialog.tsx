/**
 * DS-10b Settings layout — the reusable confirmation dialog.
 *
 * A deliberate, accessible confirmation step for a consequential action. It is the
 * presentation + interaction contract ONLY — it runs whatever async `onConfirm`
 * the consumer supplies and encodes no product rule about what is confirmed.
 *
 * It REUSES the DS-03 modal machinery (`useDrawerFocus` / `useBodyScrollLock` /
 * `useInertBackground`) exactly as the DS-10 Inspector's mobile sheet does — there
 * is no second focus-trap or overlay framework. It meets the WAI-ARIA modal-dialog
 * contract: focus moves in on open (to the typed-confirmation input when present,
 * otherwise the safe Cancel button — never the destructive button), Tab is
 * trapped, the background is inert and scroll-locked, Escape and the scrim cancel,
 * and focus is restored to the trigger on close.
 *
 * Correctness guarantees from the pure `confirmation.ts` model: an optional TYPED
 * confirmation gates the Confirm button, a single-flight phase PREVENTS duplicate
 * submissions while a confirmation is in flight, and a failure surfaces an inline
 * alert while keeping the dialog open so the user can retry.
 */

import { useEffect, useId, useReducer, useRef, type ReactNode } from "react";

import { useBodyScrollLock } from "~/shared/drawer/use-body-scroll-lock";
import { useDrawerFocus } from "~/shared/drawer/use-drawer-focus";
import { useInertBackground } from "~/shared/drawer/use-inert-background";

import {
  canConfirm,
  initConfirmation,
  reduceConfirmation,
} from "./confirmation";

export interface TypedConfirmationConfig {
  /** The exact phrase the user must type (case- and whitespace-significant). */
  readonly phrase: string;
  /** The input's label. Defaults to a prompt naming the phrase. */
  readonly label?: ReactNode;
  readonly placeholder?: string;
}

export interface ConfirmationDialogProps {
  /** Whether the dialog is shown. Mount is gated on this so focus in/out fires. */
  readonly open: boolean;
  /** Close the dialog (cancel / Escape / scrim, or after a successful confirm). */
  readonly onClose: () => void;
  /** Perform the action. Reject (throw) to show an inline error and allow retry. */
  readonly onConfirm: () => Promise<void>;
  readonly title: ReactNode;
  /** The consequence/explanation shown to the user before they confirm. */
  readonly children?: ReactNode;
  readonly confirmLabel: string;
  readonly cancelLabel?: string;
  /** The Confirm button's label while the action is in flight. */
  readonly busyLabel?: string;
  /** `"danger"` (default) styles Confirm as destructive. */
  readonly tone?: "danger" | "default";
  /** Require the user to type an exact phrase before Confirm is enabled. */
  readonly typedConfirmation?: TypedConfirmationConfig;
  /** The element focus returns to on close (the trigger). */
  readonly opener?: HTMLElement | null;
}

export function ConfirmationDialog(props: ConfirmationDialogProps) {
  const { open, opener = null } = props;

  // Post-close focus restoration, mirroring DrawerProvider/InspectorProvider
  // (ADR-020 §20.9). `useDrawerFocus` restores focus to the opener synchronously
  // on unmount, but a browser can reset focus to <body> when the focused node is
  // removed. Since a modal traps focus, on close it must deterministically return
  // to the opener (else the page's main region). This wrapper persists across
  // open/close, so it can run the restoration the unmounted panel cannot.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = open;
    if (!wasOpen || open || typeof document === "undefined") {
      return;
    }
    // A modal traps focus, so on close it must return to the opener
    // deterministically. We restore on the next frame (after the panel has
    // unmounted and the browser has settled focus, which can otherwise land on
    // <body>), rather than gating on the current active element — which is racy.
    const raf = requestAnimationFrame(() => {
      if (opener && opener.isConnected) {
        opener.focus();
      } else {
        document.getElementById("main-content")?.focus?.();
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [open, opener]);

  if (!open) {
    return null;
  }
  // A distinct child so the DS-03 focus hooks' mount/unmount effects fire on open
  // and close (they are deliberately mount-only for focus-in and unmount-only for
  // restore).
  return <ConfirmationDialogPanel {...props} />;
}

function ConfirmationDialogPanel({
  onClose,
  onConfirm,
  title,
  children,
  confirmLabel,
  cancelLabel = "Cancel",
  busyLabel,
  tone = "danger",
  typedConfirmation,
  opener = null,
}: ConfirmationDialogProps) {
  const [state, dispatch] = useReducer(
    reduceConfirmation,
    undefined,
    initConfirmation,
  );

  const rootRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const baseId = useId();

  const requiredPhrase = typedConfirmation?.phrase;
  const pending = state.phase === "pending";
  const confirmEnabled = canConfirm(state, requiredPhrase);

  // Reuse the DS-03 modal machinery — no second focus-trap. Focus is trapped
  // within the PANEL; initial focus goes to the typed-confirmation input when
  // present, otherwise the safe Cancel button.
  useDrawerFocus({
    containerRef,
    active: true,
    initialFocusRef: typedConfirmation ? inputRef : undefined,
    closeButtonRef: cancelRef,
    opener,
  });
  useBodyScrollLock(true);
  // Inert the background from the dialog ROOT, not the panel: the walk marks the
  // root's siblings (the underlying page + app shell) inert while leaving the
  // scrim — a child of the root — interactive, so outside-click cancellation
  // keeps working. Passing the panel here would inert its sibling scrim.
  useInertBackground(rootRef, true);

  const requestClose = () => {
    if (pending) {
      return;
    }
    onClose();
  };

  // Escape closes (cancels) while not pending.
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.stopPropagation();
      if (!pending) {
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [pending, onClose]);

  const handleConfirm = () => {
    if (!confirmEnabled) {
      return;
    }
    dispatch({ type: "submit" });
    void onConfirm().then(
      () => {
        dispatch({ type: "resolved" });
        onClose();
      },
      (error: unknown) => {
        const message =
          error instanceof Error && error.message
            ? error.message
            : "Something went wrong. Please try again.";
        dispatch({ type: "rejected", message });
      },
    );
  };

  const titleId = `${baseId}-title`;
  const inputId = `${baseId}-input`;
  const descriptionId = children ? `${baseId}-desc` : undefined;
  const errorId = state.error ? `${baseId}-error` : undefined;

  return (
    <div className="dh-confirm-root" ref={rootRef}>
      <button
        type="button"
        className="dh-confirm-scrim"
        aria-label="Dismiss dialog"
        tabIndex={-1}
        onClick={requestClose}
      />
      <div
        ref={containerRef}
        className={`dh-confirm${tone === "danger" ? " dh-confirm--danger" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <h2 id={titleId} className="dh-confirm__title">
          {title}
        </h2>
        {children ? (
          <div id={descriptionId} className="dh-confirm__body">
            {children}
          </div>
        ) : null}

        {typedConfirmation ? (
          <div className="dh-confirm__typed">
            <label htmlFor={inputId} className="dh-confirm__typed-label">
              {typedConfirmation.label ?? (
                <>
                  Type{" "}
                  <code className="dh-confirm__phrase">
                    {typedConfirmation.phrase}
                  </code>{" "}
                  to confirm.
                </>
              )}
            </label>
            <input
              ref={inputRef}
              id={inputId}
              className="dh-confirm__input"
              type="text"
              value={state.typed}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              disabled={pending}
              onChange={(event) =>
                dispatch({ type: "type", value: event.target.value })
              }
            />
          </div>
        ) : null}

        {state.error ? (
          <p id={errorId} className="dh-confirm__error" role="alert">
            {state.error}
          </p>
        ) : null}

        <div className="dh-confirm__actions">
          <button
            ref={cancelRef}
            type="button"
            className="dh-confirm__button dh-confirm__button--cancel"
            onClick={requestClose}
            disabled={pending}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`dh-confirm__button dh-confirm__button--confirm${
              tone === "danger" ? " dh-confirm__button--danger" : ""
            }`}
            onClick={handleConfirm}
            disabled={!confirmEnabled}
            aria-describedby={errorId}
          >
            {pending ? (busyLabel ?? confirmLabel) : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
