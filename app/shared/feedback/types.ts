/**
 * DS-10 Feedback platform — shared types (React-free).
 *
 * The one vocabulary for product-wide feedback: notifications (success / info /
 * warning / error, plus the undo-carrying variant) and long-running background
 * operations (pending → running → success → failure, with retry and
 * cancellation). Modules never construct these records or render a toast
 * themselves — they call the hidden Feedback API (`useFeedback`) and this
 * vocabulary is the contract the implementation is built on.
 *
 * This module is part of the React-FREE model surface (see
 * `test/unit/feedback/react-free.test.ts`): it imports no React, DOM, Router,
 * D1 or Cloudflare types. Callbacks carried on records (an undo handler, a
 * notification action) are plain functions the PROVIDER invokes — the pure
 * reducers here never call them.
 */

/** The four semantic notification tones. State is never conveyed by tone alone. */
export type NotificationKind = "success" | "info" | "warning" | "error";

/** Opaque, stable identity for a notification within the queue. */
export type NotificationId = string;

/**
 * A single actionable affordance on a notification — most importantly Undo. The
 * handler is a client callback; the reducers never invoke it (the provider does).
 */
export type NotificationAction = {
  readonly label: string;
  readonly onSelect: () => void | Promise<void>;
  /** Dismiss the notification once the action is chosen (default true). */
  readonly dismissOnSelect?: boolean;
};

/**
 * A notification record as it lives in the queue. Timers/pause are owned by the
 * provider (mirroring DS-06's pure-reducer + timing-hook split) — this record
 * carries only the durable queue facts so the reducer stays pure and testable.
 */
export type NotificationRecord = {
  readonly id: NotificationId;
  readonly kind: NotificationKind;
  readonly title: string;
  readonly message?: string;
  /** An optional action (e.g. Undo). */
  readonly action?: NotificationAction;
  /**
   * Auto-dismiss delay in ms, or `null` for a sticky notification that only
   * closes on explicit dismissal (errors are sticky by default).
   */
  readonly duration: number | null;
  /**
   * When set, a new notification with the same key COALESCES onto the existing
   * one (count bumps, fields refresh, timer restarts) instead of stacking — this
   * is how noisy repeats are kept calm.
   */
  readonly dedupeKey?: string;
  /** How many times this (coalesced) notification has been raised. */
  readonly count: number;
  /** Injected clock time (ms) when it was raised or last refreshed. */
  readonly createdAt: number;
  /**
   * Politeness for the ARIA live region. Errors/warnings announce assertively;
   * success/info announce politely. Derived from `kind` by default.
   */
  readonly assertive: boolean;
};

/** The immutable notification-queue state. Newest-first. */
export type NotificationQueueState = {
  readonly notifications: readonly NotificationRecord[];
};

/** The lifecycle of a background operation. */
export type OperationStatus = "pending" | "running" | "success" | "failure";

/** A background operation record as it lives in the operations tray. */
export type OperationRecord = {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly status: OperationStatus;
  /** A human, recoverable message when `status === "failure"`. */
  readonly error?: string;
  /** Whether a Cancel affordance is offered while pending/running. */
  readonly cancellable: boolean;
  /** Whether a Retry affordance is offered on failure. */
  readonly retryable: boolean;
  /** 1-based attempt counter (increments on retry). */
  readonly attempt: number;
  readonly createdAt: number;
  readonly updatedAt: number;
};

/** The immutable operations state. Newest-first. */
export type OperationsState = {
  readonly operations: readonly OperationRecord[];
};

/** Default kind → tone mapping for the live region. */
export function isAssertiveKind(kind: NotificationKind): boolean {
  return kind === "error" || kind === "warning";
}
