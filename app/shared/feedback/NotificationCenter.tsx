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
 *     success/info, assertive for warning/error) unless a caller already announced
 *     the same outcome — separate from the visible toasts so screen readers
 *     announce once, not on every re-render;
 *   - the visible stack is a labelled list; each toast/operation is a group with
 *     an accessible name; actions and dismiss are real, keyboard-operable buttons
 *     with text names and ≥44px targets;
 *   - focusing anywhere in the stack, or hovering any of its controls, pauses
 *     auto-dismiss, so a toast is never yanked away mid-keyboard-operation or
 *     as the pointer travels to its Undo/Dismiss button;
 *   - tone is carried by icon + text, never colour alone;
 *   - motion is CSS and disabled under `prefers-reduced-motion`.
 *
 * Pointer contract (DEBT-38). The region is `position: fixed` over the
 * bottom-right of every page, exactly where a record's lifecycle controls sit.
 * Everything in it is therefore click-through except its real controls — the
 * dismiss-all button, each toast's action, each toast's close (see
 * `app/styles/feedback.css`). A notification can never absorb a click meant for
 * the page beneath it, and hover-pause is scoped to the controls accordingly: a
 * pointer crossing a click-through surface is interacting with the page, not
 * reading the toast. Errors stay sticky, so nothing that must be read expires.
 */

import { CloseGlyph, KindIcon, Spinner } from "./feedback-icons";
import { useLeavingRecords } from "./use-leaving-notifications";
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
  // DHDS-08 — the rendered list lags the queue by one exit animation, so a
  // dismissed toast fades instead of disappearing. See `useLeavingRecords`.
  const { rendered, isLeaving } = useLeavingRecords(notifications);
  const hasItems = rendered.length > 0 || operations.length > 0;

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
                className="dh-feedback__dismiss-all md-state-layer"
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
            {/*
             * DHDS-08 — `rendered` is the live queue plus anything still
             * fading out, so a dismissed toast leaves rather than vanishing.
             * The queue itself is untouched: a leaving toast is already gone
             * as far as the provider, the Undo window and the commit handler
             * are concerned, and it is `inert` so it cannot be acted on.
             */}
            {rendered.map((notification) => (
              <li key={notification.id} className="dh-feedback__item-wrap">
                <NotificationToast
                  notification={notification}
                  leaving={isLeaving(notification.id)}
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
  leaving,
  onDismiss,
  onAction,
}: {
  readonly notification: NotificationRecord;
  /** DHDS-08 — this toast has left the queue and is fading out. */
  readonly leaving: boolean;
  readonly onDismiss: (id: string) => void;
  readonly onAction: (record: NotificationRecord) => void;
}) {
  const { id, kind, title, message, action, count } = notification;
  return (
    <div
      className="dh-toast dh-motion-edge-block"
      data-kind={kind}
      data-dh-exit={leaving ? "true" : undefined}
      // A toast on its way out is not operable: the dismissal has already been
      // taken, so its Undo must not be clickable or tabbable while it fades.
      inert={leaving ? true : undefined}
      role="group"
      aria-label={title}
    >
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
            className="dh-toast__action md-state-layer"
            onClick={() => onAction(notification)}
          >
            {action.label}
          </button>
        ) : null}
        <button
          type="button"
          className="dh-toast__close md-state-layer"
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
            className="dh-toast__action md-state-layer"
            onClick={() => onRetry(id)}
          >
            Retry
          </button>
        ) : null}
        {active && cancellable ? (
          <button
            type="button"
            className="dh-toast__action md-state-layer"
            onClick={() => onCancel(id)}
          >
            Cancel
          </button>
        ) : null}
        {!active ? (
          <button
            type="button"
            className="dh-toast__close md-state-layer"
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
