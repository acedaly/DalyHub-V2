/**
 * NOTIFY-01 — the scheduled notification tick.
 *
 * The Worker's `scheduled` handler's second job, given its own module so
 * `workers/app.ts` stays a composition rather than a place logic accumulates —
 * the same shape CAL-01's refresh takes, for the same reason.
 *
 * ── It reuses CAL-01's cron; it does not add one ────────────────────────────
 * The Worker already runs every fifteen minutes. Notifications need a frequent
 * tick rather than a scheduled send time (see the evaluator: a cron expression
 * is timezone-ignorant and the owner's zone is a preference), and fifteen
 * minutes is a fine granularity for a digest and a generous one for a
 * lead-time rung. So there is no second trigger, no second Worker and nothing
 * new to provision — one more line in a handler that already exists.
 *
 * ── It is inert unless the owner asked for it ───────────────────────────────
 * `listEnabledSenders` returns nothing until someone turns notifications on in
 * Settings, and the run stops there. A deployment that never uses the feature
 * pays one indexed lookup every fifteen minutes and does no other work.
 *
 * ── It never throws ─────────────────────────────────────────────────────────
 * A `scheduled` handler that throws is only ever a log line nobody reads. A
 * failed tick costs one tick, and the next is fifteen minutes away — which for
 * a digest gated on "at or past the send time" means it simply lands late.
 *
 * Nothing here logs a credential, a record title or a notification body.
 */

import { resolveWorkspaceScope } from "~/platform/workspaces";

import {
  runNotificationTick,
  type NotificationRunSummary,
} from "./notification-run.server";
import type { PushoverEnv } from "./pushover-channel.server";

/**
 * What the scheduled notification tick needs. Deliberately structural rather
 * than the generated `Env`: `APP_PUBLIC_ORIGIN` is deploy-time configuration
 * rather than a committed `var`, so it is absent from that type, and the handler
 * is exercised by the Workers-pool tests with a hand-built environment.
 */
export type ScheduledNotificationEnv = PushoverEnv & {
  readonly DB: D1Database;
  readonly DEFAULT_WORKSPACE_ID?: string;
};

/** The result, returned rather than logged, so tests can assert on it. */
export interface ScheduledNotificationSummary extends NotificationRunSummary {
  readonly ran: boolean;
  /** Why the tick did nothing, when it did nothing. Never an exception. */
  readonly skippedReason?: "no_workspace";
}

export async function runScheduledNotifications(
  env: ScheduledNotificationEnv,
): Promise<ScheduledNotificationSummary> {
  try {
    const scope = await resolveWorkspaceScope(env);
    const summary = await runNotificationTick(scope, env);
    return { ran: true, ...summary };
  } catch {
    // A workspace that cannot be resolved (an unprovisioned deployment, a
    // database blip) costs this tick and nothing else.
    return {
      ran: false,
      owners: 0,
      recorded: 0,
      delivered: 0,
      failed: 0,
      purged: 0,
      skippedReason: "no_workspace",
    };
  }
}
