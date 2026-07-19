/**
 * DS-06 Shared Forms — the unsaved-changes confirm surface.
 *
 * Renders nothing until an in-app navigation is held by
 * {@link useUnsavedChangesPrompt} while the form is dirty. When held, it shows a
 * small, accessible MODAL confirm so the departure is never silent: the user
 * explicitly chooses to leave (discarding the draft) or stay.
 *
 * It is a real modal dialog (WAI-ARIA `alertdialog`): the background is made
 * `inert` while it is open, Tab/Shift+Tab are trapped inside it, the safe choice
 * (Stay) receives initial focus, Escape chooses Stay, and choosing Stay restores
 * focus to whatever initiated the blocked navigation. Its ids are generated so
 * more than one guard can coexist. Choosing Leave lets the navigation proceed
 * without restoring focus to an element that is about to unmount.
 *
 * Page-unload (tab close / reload) is handled by the same hook via the browser's
 * native prompt; this component covers in-app navigation, including DS-03 Drawer
 * close/replace/Back when a `drawerKey` is supplied.
 */

import { useEffect, useId, useRef } from "react";

import {
  useUnsavedChangesPrompt,
  type UnsavedChangesOptions,
} from "./use-unsaved-changes";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export interface UnsavedChangesGuardProps extends UnsavedChangesOptions {
  /** Arm the guard while true (typically `form.isDirty && !form.isSubmitting`). */
  readonly when: boolean;
  /** The dialog heading. */
  readonly title?: string;
  /** The explanatory body. */
  readonly message?: string;
  /** Label for the confirm/leave action. */
  readonly leaveLabel?: string;
  /** Label for the cancel/stay action. */
  readonly stayLabel?: string;
}

export function UnsavedChangesGuard({
  when,
  title = "Leave with unsaved changes?",
  message = "You've made changes that haven't been saved. If you leave now, they'll be lost.",
  leaveLabel = "Leave",
  stayLabel = "Stay",
  drawerKey,
  drawerParam,
}: UnsavedChangesGuardProps) {
  const { blocked, proceed, stay } = useUnsavedChangesPrompt(when, {
    drawerKey,
    drawerParam,
  });

  const baseId = useId();
  const titleId = `${baseId}-title`;
  const bodyId = `${baseId}-body`;

  const dialogRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const stayRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const restoreRef = useRef(false);

  // Capture the element that initiated the blocked navigation and move focus to
  // the safe action (Stay).
  useEffect(() => {
    if (!blocked) return;
    openerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const frame = requestAnimationFrame(() => stayRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [blocked]);

  // On Stay (not Leave), restore focus to the initiating control AFTER the dialog
  // closes and the background inert is cleared — focusing an inert element is a
  // no-op, so this runs on the next frame once `blocked` is false. On Leave the
  // navigation proceeds and the opener may be unmounting, so we do not restore.
  useEffect(() => {
    if (blocked || !restoreRef.current) return;
    restoreRef.current = false;
    const opener = openerRef.current;
    const frame = requestAnimationFrame(() => {
      if (opener && opener.isConnected) opener.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [blocked]);

  // Make everything outside the dialog inert while it is open, by walking from the
  // guard root up to <body> and marking every sibling along the path. Restores
  // exactly what it set, so nothing it did not own is disturbed.
  useEffect(() => {
    if (!blocked) return;
    const root = rootRef.current;
    if (!root) return;
    const marked: HTMLElement[] = [];
    let node: HTMLElement = root;
    while (node !== document.body) {
      const parent: HTMLElement | null = node.parentElement;
      if (!parent) break;
      for (const sibling of Array.from(parent.children)) {
        if (
          sibling !== node &&
          sibling instanceof HTMLElement &&
          !sibling.hasAttribute("inert")
        ) {
          sibling.setAttribute("inert", "");
          marked.push(sibling);
        }
      }
      node = parent;
    }
    return () => {
      for (const el of marked) el.removeAttribute("inert");
    };
  }, [blocked]);

  if (!blocked) return null;

  const onStay = () => {
    restoreRef.current = true;
    stay();
  };

  const trapTab = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onStay();
      return;
    }
    if (event.key !== "Tab") return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    );
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="dh-unsaved-guard" role="presentation" ref={rootRef}>
      <div className="dh-unsaved-guard__scrim" />
      {/* A modal alertdialog legitimately handles Tab/Shift+Tab (focus trap) and
          Escape (cancel); the actions are real buttons, so this is not the only
          interactive path. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <div
        className="dh-unsaved-guard__dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        ref={dialogRef}
        onKeyDown={trapTab}
      >
        <h2 id={titleId} className="dh-unsaved-guard__title">
          {title}
        </h2>
        <p id={bodyId} className="dh-unsaved-guard__body">
          {message}
        </p>
        <div className="dh-unsaved-guard__actions">
          <button
            type="button"
            className="dh-btn dh-btn--secondary"
            ref={stayRef}
            onClick={onStay}
          >
            {stayLabel}
          </button>
          <button
            type="button"
            className="dh-btn dh-btn--danger"
            onClick={proceed}
          >
            {leaveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
