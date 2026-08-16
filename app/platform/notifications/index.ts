/**
 * NOTIFY-01 — the notifications platform: the server-side pieces the kernel
 * domain is deliberately free of.
 *
 * Everything here is `.server.ts` or re-exports it. The kernel decides WHEN
 * something is worth saying and WHAT it says; these modules read the workspace,
 * talk to Pushover, and run on the cron.
 *
 *   - `digest-facts.server.ts`           the shared facts the digest is built from
 *   - `notification-run.server.ts`       one tick: evaluate → RECORD → deliver
 *   - `pushover-channel.server.ts`       the one external channel adapter
 *   - `scheduled-notifications.server.ts` the cron entry point
 */

export { readDigestFacts } from "./digest-facts.server";

export {
  runNotificationTick,
  runNotificationsForOwner,
  type NotificationRunOptions,
  type NotificationRunSummary,
} from "./notification-run.server";

export {
  createPushoverChannel,
  publicOrigin,
  validatePushoverCredentials,
  type PushoverCredentials,
  type PushoverEnv,
  type PushoverFetcher,
} from "./pushover-channel.server";

export {
  runScheduledNotifications,
  type ScheduledNotificationEnv,
  type ScheduledNotificationSummary,
} from "./scheduled-notifications.server";
