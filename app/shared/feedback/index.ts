/**
 * DS-10 Feedback platform — public barrel.
 *
 * Re-exports the React-free model, the Feedback API contract + `useFeedback`
 * hook, and the single `FeedbackProvider`. Modules import ONLY `useFeedback` and
 * the option types from here; the provider is mounted once by the AppShell.
 */

export * from "./model";

export {
  FeedbackContext,
  useFeedback,
  type FeedbackApi,
  type NotifyOptions,
  type UndoOptions,
  type RunOperationOptions,
} from "./feedback-context";

export { FeedbackProvider } from "./FeedbackProvider";
export { NotificationCenter } from "./NotificationCenter";
export type { NotificationCenterProps } from "./NotificationCenter";
