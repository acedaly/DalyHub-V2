/**
 * DS-10b Settings layout — the reusable confirmed-action row.
 *
 * A consequential setting rendered as a `SettingsRow` (label + consequence text)
 * with a button that opens the shared `ConfirmationDialog`. It composes the
 * presentation + interaction contract only:
 *   - a clearly-weighted button, and visual separation when the action is
 *     genuinely destructive (inside a `SettingsGroup tone="danger"`);
 *   - clear consequence text on the row AND in the confirmation;
 *   - a deliberate confirmation step, with optional TYPED confirmation;
 *   - disabled / loading / inline-error states and retry;
 *   - focus management + restoration (via the dialog's DS-03 machinery);
 *   - cancellation;
 *   - shared DS-10 Feedback for the success toast.
 *
 * It encodes NO product deletion/archive rule: the consumer supplies the async
 * `onConfirm` and the copy.
 *
 * ── UNTITLED-18 — `severity`, and why a reversible action is not red ────────
 *
 * Every consumer of this component drew a red-bordered button inside a red,
 * warning-badged region, because there was one weight and it was "destructive".
 * So an Area's **Archive** — whose own copy reads "Everything inside it is kept,
 * and you can restore it at any time" — was painted identically to **Delete
 * permanently**, which cannot be undone. UNTITLED-16 named this and carried it
 * forward twice.
 *
 * That is not a cosmetic mismatch. A danger treatment is a budget: an owner who
 * meets it on the action they take every week learns that red means "this one
 * needs a click" rather than "this one is final", and spends the warning that
 * was supposed to stop them at the delete. DalyHub's own rule is that a
 * destructive action always carries the WORD as well as the colour (AGENTS.md
 * §15); the corollary is that an action with no such word must not carry the
 * colour.
 *
 *   `severity="destructive"` (default)  Untitled's `primary-destructive` button,
 *                                       a `danger`-toned dialog. For actions
 *                                       that CANNOT be undone. Belongs inside a
 *                                       `SettingsGroup tone="danger"`.
 *
 *   `severity="reversible"`             Untitled's `secondary` button, a neutral
 *                                       dialog. For archive, disconnect, revoke,
 *                                       clear-local-cache — actions that are
 *                                       deliberate, confirmed, and undoable.
 *                                       Belongs in an ORDINARY group.
 *
 * Both keep the confirmation. The distinction is what the confirmation is FOR:
 * one asks "are you sure you meant this?", the other says "this is the last
 * chance".
 */

import { useState, type ReactNode } from "react";

import { useFeedback } from "~/shared/feedback";

import {
  Button,
  ConfirmationDialog,
  type TypedConfirmationConfig,
} from "~/shared/ui";
import { SettingsRow } from "./SettingsRow";

/** How final the action is. See the file header — this is a semantic choice. */
export type DangerousActionSeverity = "destructive" | "reversible";

export interface DangerousActionProps {
  /** The setting's name (e.g. "Delete this workspace"). */
  readonly label: ReactNode;
  /** The consequence, shown beside the action on the row. */
  readonly description?: ReactNode;
  /** The button's text (e.g. "Delete workspace…"). */
  readonly actionLabel: string;
  /**
   * How final the action is. Defaults to `"destructive"` — the existing
   * behaviour, so an unconsidered caller keeps the stronger treatment rather
   * than quietly losing it.
   */
  readonly severity?: DangerousActionSeverity;
  /** Perform the action. Reject to show an inline error + allow retry. */
  readonly onConfirm: () => Promise<void>;
  /** The confirmation dialog title. */
  readonly confirmTitle: ReactNode;
  /** The consequence text shown inside the confirmation. */
  readonly confirmBody?: ReactNode;
  /** The dialog's Confirm button text. Defaults to `actionLabel`. */
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  /** The Confirm button label while the action runs. */
  readonly busyLabel?: string;
  /** Require the user to type an exact phrase before confirming. */
  readonly typedConfirmation?: TypedConfirmationConfig;
  /** A success toast raised through the shared Feedback platform on completion. */
  readonly successMessage?: string;
  /** Disable the action entirely (e.g. lacking permission). */
  readonly disabled?: boolean;
  readonly className?: string;
}

export function DangerousAction({
  label,
  description,
  actionLabel,
  severity = "destructive",
  onConfirm,
  confirmTitle,
  confirmBody,
  confirmLabel,
  cancelLabel,
  busyLabel,
  typedConfirmation,
  successMessage,
  disabled = false,
  className,
}: DangerousActionProps) {
  const feedback = useFeedback();
  const [open, setOpen] = useState(false);
  const [opener, setOpener] = useState<HTMLElement | null>(null);
  const destructive = severity === "destructive";

  const runConfirm = async () => {
    await onConfirm();
    if (successMessage) {
      feedback.notifySuccess(successMessage);
    }
  };

  return (
    <>
      <SettingsRow
        label={label}
        description={description}
        className={className}
        control={
          <Button
            // The shared Button is Untitled's `base/buttons/button`; `danger` is
            // its `primary-destructive` family and `secondary` its bordered
            // neutral one. Neither is painted here.
            variant={destructive ? "danger" : "secondary"}
            disabled={disabled}
            onClick={(event) => {
              setOpener(event.currentTarget);
              setOpen(true);
            }}
          >
            {actionLabel}
          </Button>
        }
      />
      <ConfirmationDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={runConfirm}
        title={confirmTitle}
        confirmLabel={confirmLabel ?? actionLabel}
        cancelLabel={cancelLabel}
        busyLabel={busyLabel}
        tone={destructive ? "danger" : "default"}
        typedConfirmation={typedConfirmation}
        opener={opener}
      >
        {confirmBody}
      </ConfirmationDialog>
    </>
  );
}
