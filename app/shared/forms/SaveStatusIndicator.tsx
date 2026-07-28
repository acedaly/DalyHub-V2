/**
 * DS-06 Shared Forms — the autosave status indicator.
 *
 * A calm, honest signal of whether an autosaving field's value is committed. It
 * never uses colour alone (each state pairs an icon glyph with words) and it lives
 * in a polite live region so a status CHANGE (Saving → Saved, or → Couldn't save)
 * is announced to assistive technology without stealing focus. There is no success
 * toast per keystroke — this quiet inline indicator is the whole feedback.
 *
 * The `error` state offers an explicit Retry; the user's latest input is always
 * intact behind it.
 */

import type { AutosaveStatus } from "./types";

export interface SaveStatusIndicatorProps {
  readonly status: AutosaveStatus;
  /** The failure message (shown in the `error` state). */
  readonly error?: string | null;
  /** Retry handler (shown in the `error` state). */
  readonly onRetry?: () => void;
  /** Hide the `idle` state entirely (default true — idle shows nothing). */
  readonly hideWhenIdle?: boolean;
  readonly className?: string;
}

const LABELS: Record<AutosaveStatus, string> = {
  idle: "",
  unsaved: "Unsaved",
  saving: "Saving…",
  saved: "Saved",
  error: "Couldn’t save",
};

const ICONS: Record<AutosaveStatus, string> = {
  idle: "",
  unsaved: "•",
  saving: "…",
  saved: "✓",
  error: "!",
};

export function SaveStatusIndicator({
  status,
  error,
  onRetry,
  hideWhenIdle = true,
  className,
}: SaveStatusIndicatorProps) {
  const rootClassName = ["dh-save-status", className].filter(Boolean).join(" ");
  const showText = !(status === "idle" && hideWhenIdle);

  return (
    <div className={rootClassName} data-status={status}>
      {/* Polite live region: announces the transition, never grabs focus. */}
      <span className="dh-save-status__live" role="status" aria-live="polite">
        {showText ? (
          <span className="dh-save-status__text">
            <span className="dh-save-status__icon" aria-hidden="true">
              {ICONS[status]}
            </span>
            {LABELS[status]}
          </span>
        ) : null}
      </span>
      {status === "error" ? (
        <span className="dh-save-status__error-detail">
          {error ? (
            <span className="dh-save-status__error-text">{error}</span>
          ) : null}
          {onRetry ? (
            <button
              type="button"
              className="dh-save-status__retry"
              onClick={onRetry}
            >
              Retry
            </button>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}
