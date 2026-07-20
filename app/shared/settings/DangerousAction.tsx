/**
 * DS-10b Settings layout — the reusable dangerous-action row.
 *
 * A destructive setting rendered as a `SettingsRow` (label + consequence text)
 * with a clearly destructive button that opens the shared `ConfirmationDialog`.
 * It composes the presentation + interaction contract only:
 *   - visual separation (inside a `SettingsGroup tone="danger"`) and a destructive
 *     button;
 *   - clear consequence text on the row AND in the confirmation;
 *   - a deliberate confirmation step, with optional TYPED confirmation;
 *   - disabled / loading / inline-error states and retry;
 *   - focus management + restoration (via the dialog's DS-03 machinery);
 *   - cancellation;
 *   - shared DS-10 Feedback for the success toast.
 *
 * It encodes NO product deletion/archive rule: the consumer supplies the async
 * `onConfirm` and the copy. Placing it inside a `SettingsGroup tone="danger"` is
 * how the region is visually separated from ordinary settings.
 */

import { useState, type ReactNode } from "react";

import { useFeedback } from "~/shared/feedback";

import {
  ConfirmationDialog,
  type TypedConfirmationConfig,
} from "./ConfirmationDialog";
import { SettingsRow } from "./SettingsRow";

export interface DangerousActionProps {
  /** The setting's name (e.g. "Delete this workspace"). */
  readonly label: ReactNode;
  /** The consequence, shown beside the action on the row. */
  readonly description?: ReactNode;
  /** The destructive button's text (e.g. "Delete workspace…"). */
  readonly actionLabel: string;
  /** Perform the destructive action. Reject to show an inline error + allow retry. */
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
          <button
            type="button"
            className="dh-settings-danger-button"
            disabled={disabled}
            onClick={(event) => {
              setOpener(event.currentTarget);
              setOpen(true);
            }}
          >
            {actionLabel}
          </button>
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
        tone="danger"
        typedConfirmation={typedConfirmation}
        opener={opener}
      >
        {confirmBody}
      </ConfirmationDialog>
    </>
  );
}
