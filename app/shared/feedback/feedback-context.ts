/**
 * DS-10 Feedback platform — the shared Feedback API contract + context.
 *
 * This is the ENTIRE surface a module touches. Modules never render a toast,
 * never own a notification queue, never build an operation tray — they call these
 * methods and the one platform implementation (mounted once at the AppShell
 * boundary) does the rest. The implementation stays completely hidden.
 *
 *   notifySuccess / notifyInfo / notifyWarning / notifyError — calm feedback
 *   notifyUndo    — success + a time-boxed Undo (prefer undo over confirm dialogs)
 *   runOperation  — one execution model for long-running work (AI/import/export/
 *                   sync): pending → running → success | failure, with retry and
 *                   cancellation, surfaced consistently.
 */

import { createContext, useContext } from "react";

import type {
  NotificationAction,
  NotificationId,
  NotificationKind,
} from "./types";

/** Options common to the plain notification helpers. */
export type NotifyOptions = {
  /** Secondary line under the title. */
  readonly message?: string;
  /** Override the per-tone auto-dismiss (ms), or `null` to make it sticky. */
  readonly duration?: number | null;
  /** A single action affordance (rendered as a button). */
  readonly action?: NotificationAction;
  /** Coalesce repeats with the same key instead of stacking (calm by default). */
  readonly dedupeKey?: string;
};

/** Options for a time-boxed Undo notification. */
export type UndoOptions = {
  /** Secondary line under the title. */
  readonly message?: string;
  /** Undo window in ms (defaults to the platform undo window). */
  readonly duration?: number;
  /** Invoked when the user chooses Undo — reverse the action here. */
  readonly onUndo: () => void | Promise<void>;
  /** Invoked once the window elapses without an Undo (the change is committed). */
  readonly onExpire?: () => void;
  /** Label for the action (defaults to "Undo"). */
  readonly undoLabel?: string;
};

/** Options for a long-running background operation. */
export type RunOperationOptions<T> = {
  /** Short label shown in the operations tray (e.g. "Importing from Todoist"). */
  readonly label: string;
  /** Optional secondary description. */
  readonly description?: string;
  /** The work. Receives an `AbortSignal` that fires when the user cancels. */
  readonly run: (context: { readonly signal: AbortSignal }) => Promise<T>;
  /** Offer a Cancel affordance while pending/running (default false). */
  readonly cancellable?: boolean;
  /** Offer a Retry affordance on failure — re-runs `run` (default false). */
  readonly retryable?: boolean;
  /** Notify success with this message when the operation resolves. */
  readonly successMessage?: string;
  /** Human failure message; falls back to the thrown error's message. */
  readonly errorMessage?: string;
};

/** The hidden implementation surface. */
export type FeedbackApi = {
  /** Raise a notification of a given tone; returns its id. */
  notify(
    kind: NotificationKind,
    title: string,
    options?: NotifyOptions,
  ): NotificationId;
  notifySuccess(title: string, options?: NotifyOptions): NotificationId;
  notifyInfo(title: string, options?: NotifyOptions): NotificationId;
  notifyWarning(title: string, options?: NotifyOptions): NotificationId;
  notifyError(title: string, options?: NotifyOptions): NotificationId;
  /** Raise a success notification carrying a time-boxed Undo; returns its id. */
  notifyUndo(title: string, options: UndoOptions): NotificationId;
  /** Dismiss a notification by id. */
  dismiss(id: NotificationId): void;
  /**
   * Run a long-running operation through the shared lifecycle. Resolves with the
   * work's result, or rejects with its error (after surfacing failure/retry).
   */
  runOperation<T>(options: RunOperationOptions<T>): Promise<T>;
};

export const FeedbackContext = createContext<FeedbackApi | null>(null);

/**
 * Access the shared Feedback API. Throws if used outside `FeedbackProvider`, so a
 * missing platform mount is a loud developer error, not a silent no-op.
 */
export function useFeedback(): FeedbackApi {
  const api = useContext(FeedbackContext);
  if (api === null) {
    throw new Error(
      "useFeedback must be used within a <FeedbackProvider>. Mount it once at the AppShell boundary.",
    );
  }
  return api;
}
