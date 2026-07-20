/**
 * DS-10 Feedback platform — the notification centre (presentational).
 *
 * Renders the toast stack and the background-operations tray in ONE calm,
 * unobtrusive surface anchored so it never covers primary UI. It is a pure
 * presentational component: every piece of state and every handler is supplied by
 * `FeedbackProvider`.
 *
 * Accessibility (WCAG 2.2 AA):
 *   - two visually-hidden ARIA live regions announce feedback (polite for
 *     success/info, assertive for warning/error) — separate from the visible
 *     toasts so screen readers announce once, not on every re-render;
 *   - the visible stack is a labelled list; each toast/operation is a group with
 *     an accessible name; actions and dismiss are real, keyboard-operable buttons
 *     with text names and ≥44px targets;
 *   - hovering OR focusing anywhere in the stack pauses auto-dismiss, so a toast
 *     is never yanked away mid-read or mid-keyboard-operation;
 *   - tone is carried by icon + text, never colour alone;
 *   - motion is CSS and disabled under `prefers-reduced-motion`.
 */

import { CloseGlyph, KindIcon, Spinner } from "./feedback-icons";
import type { NotificationRecord, OperationRecord } from "./types";

type Announcement = {
  readonly text: string;
  readonly assertive: boolean;
} | null;

export type NotificationCenterProps = {
  readonly notifications: readonly NotificationRecord[];
  readonly operations: readonly OperationRecord[];
  readonly announcement: Announcement;
  readonly onDismiss: (id: string) => void;
  readonly onDismissAll: () => void;
  readonly onAction: (record: NotificationRecord) => void;
  readonly onOperationRetry: (id: string) => void;
  readonly onOperationCancel: (id: string) => void;
  readonly onOperationDismiss: (id: string) => void;
  readonly onPauseChange: (paused: boolean) => void;
};

const OPERATION_STATUS_LABEL: Record<OperationRecord["status"], string> = {
  pending: "Waiting…",
  running: "Working…",
  success: "Done",
  failure: "Failed",
};

export function NotificationCenter({
  notifications,
  operations,
  announcement,
  onDismiss,
  onDismissAll,
  onAction,
  onOperationRetry,
  onOperationCancel,
  onOperationDismiss,
  onPauseChange,
}: NotificationCenterProps) {
  const hasItems = notifications.length > 0 || operations.length > 0;

  return (
    <>
      {/*
        Two always-mounted, visually-hidden live regions. They use bare
        `aria-live` (NOT role="status"/"alert") deliberately: an implicit
        status/alert role would make every other loading/error region in the app
        ambiguous to `getByRole`. `aria-live` alone announces just as reliably.
      */}
      <div className="dh-feedback-live" aria-live="polite" aria-atomic="true">
        {announcement && !announcement.assertive ? announcement.text : ""}
      </div>
      <div
        className="dh-feedback-live"
        aria-live="assertive"
        aria-atomic="true"
      >
        {announcement && announcement.assertive ? announcement.text : ""}
      </div>

      {hasItems ? (
        <section
          className="dh-feedback"
          aria-label="Notifications"
          onMouseEnter={() => onPauseChange(true)}
          onMouseLeave={() => onPauseChange(false)}
          onFocusCapture={() => onPauseChange(true)}
          onBlurCapture={(event) => {
            if (
              !event.currentTarget.contains(event.relatedTarget as Node | null)
            ) {
              onPauseChange(false);
            }
          }}
        >
          {notifications.length > 1 ? (
            <div className="dh-feedback__toolbar">
              <button
                type="button"
                className="dh-feedback__dismiss-all"
                onClick={onDismissAll}
              >
                Dismiss all
              </button>
            </div>
          ) : null}

          <ol className="dh-feedback__list">
            {operations.map((operation) => (
              <li key={operation.id} className="dh-feedback__item-wrap">
                <OperationToast
                  operation={operation}
                  onRetry={onOperationRetry}
                  onCancel={onOperationCancel}
                  onDismiss={onOperationDismiss}
                />
              </li>
            ))}
            {notifications.map((notification) => (
              <li key={notification.id} className="dh-feedback__item-wrap">
                <NotificationToast
                  notification={notification}
                  onDismiss={onDismiss}
                  onAction={onAction}
                />
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </>
  );
}

function NotificationToast({
  notification,
  onDismiss,
  onAction,
}: {
  readonly notification: NotificationRecord;
  readonly onDismiss: (id: string) => void;
  readonly onAction: (record: NotificationRecord) => void;
}) {
  const { id, kind, title, message, action, count } = notification;
  return (
    <div className="dh-toast" data-kind={kind} role="group" aria-label={title}>
      <span className="dh-toast__icon" data-kind={kind}>
        <KindIcon kind={kind} />
      </span>
      <div className="dh-toast__body">
        <p className="dh-toast__title">
          {title}
          {count > 1 ? (
            <span
              className="dh-toast__count"
              aria-label={`repeated ${count} times`}
            >
              ×{count}
            </span>
          ) : null}
        </p>
        {message ? <p className="dh-toast__message">{message}</p> : null}
      </div>
      <div className="dh-toast__actions">
        {action ? (
          <button
            type="button"
            className="dh-toast__action"
            onClick={() => onAction(notification)}
          >
            {action.label}
          </button>
        ) : null}
        <button
          type="button"
          className="dh-toast__close"
          onClick={() => onDismiss(id)}
          aria-label={`Dismiss: ${title}`}
        >
          <CloseGlyph />
        </button>
      </div>
    </div>
  );
}

function OperationToast({
  operation,
  onRetry,
  onCancel,
  onDismiss,
}: {
  readonly operation: OperationRecord;
  readonly onRetry: (id: string) => void;
  readonly onCancel: (id: string) => void;
  readonly onDismiss: (id: string) => void;
}) {
  const { id, label, description, status, error, cancellable, attempt } =
    operation;
  const active = status === "pending" || status === "running";
  const statusLabel = OPERATION_STATUS_LABEL[status];

  return (
    <div
      className="dh-toast dh-toast--operation"
      data-status={status}
      role="group"
      aria-label={label}
    >
      <span className="dh-toast__icon" data-status={status}>
        {active ? (
          <Spinner className="dh-toast__spinner" />
        ) : (
          <KindIcon kind={status === "success" ? "success" : "error"} />
        )}
      </span>
      <div className="dh-toast__body">
        <p className="dh-toast__title">{label}</p>
        <p className="dh-toast__message">
          <span className="dh-toast__status">{statusLabel}</span>
          {status === "failure" && error ? ` — ${error}` : null}
          {description && active ? ` — ${description}` : null}
          {attempt > 1 ? ` (attempt ${attempt})` : null}
        </p>
      </div>
      <div className="dh-toast__actions">
        {status === "failure" && operation.retryable ? (
          <button
            type="button"
            className="dh-toast__action"
            onClick={() => onRetry(id)}
          >
            Retry
          </button>
        ) : null}
        {active && cancellable ? (
          <button
            type="button"
            className="dh-toast__action"
            onClick={() => onCancel(id)}
          >
            Cancel
          </button>
        ) : null}
        {!active ? (
          <button
            type="button"
            className="dh-toast__close"
            onClick={() => onDismiss(id)}
            aria-label={`Dismiss: ${label}`}
          >
            <CloseGlyph />
          </button>
        ) : null}
      </div>
    </div>
  );
}
