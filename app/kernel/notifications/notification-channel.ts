/**
 * NOTIFY-01 — the external channel contract.
 *
 * One method, one answer:
 *
 *     deliver(notification) → delivered | failed(reason)
 *
 * The evaluator knows no channel and no channel knows the evaluator. That is the
 * whole point of the seam: adding ntfy, email-out or Web Push later is an
 * adapter plus a Settings block, not a change to when DalyHub decides something
 * is worth saying.
 *
 * ── A failure is data, not an exception ─────────────────────────────────────
 * `deliver` resolves; it does not reject. A background tick that throws is a log
 * line nobody reads, and the ledger row already exists by the time any channel is
 * called — so the only useful thing a failed send can do is record WHY, in the
 * product's own words, where the owner will see it. Every adapter maps whatever
 * went wrong onto {@link DeliveryFailureReason}; nothing a remote service wrote
 * is ever carried out of an adapter.
 *
 * ── Priority 2 is refused structurally ──────────────────────────────────────
 * Pushover's priority 2 is "emergency": it re-alerts until a human acknowledges
 * it, and it overrides quiet hours. Nothing in a personal planner justifies
 * waking someone repeatedly at 3am — not an overdue task, not a registration
 * renewal, not a digest. The refusal is in the TYPE rather than in a comment or a
 * validation branch, so there is no code path that could be extended into one.
 * Priority 1 (bypass quiet hours) is permitted by the contract but unused by this
 * item; NOTIFY-01 sends everything at 0.
 */

import type { DeliveryChannel, DeliveryFailureReason } from "./notification";

/**
 * The urgency a channel may be asked for.
 *
 * `0` — normal. Everything NOTIFY-01 sends.
 * `1` — high: bypasses the owner's quiet hours. Permitted by the contract so a
 *       future final-rung decision has somewhere to go; nothing uses it yet.
 *
 * There is no `2`, and adding one is a product decision recorded in an ADR, not
 * a widening of a union.
 */
export type NotificationPriority = 0 | 1;

/** What a channel is handed. Already rendered; a channel never re-derives text. */
export interface DeliverableNotification {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  /** The in-application path the notification points at. */
  readonly href: string;
  readonly priority: NotificationPriority;
}

export type DeliveryOutcome =
  | { readonly status: "delivered" }
  | { readonly status: "failed"; readonly reason: DeliveryFailureReason };

export interface NotificationChannelAdapter {
  readonly channel: DeliveryChannel;
  /** Never rejects. A failure is an outcome, not an exception. */
  deliver(notification: DeliverableNotification): Promise<DeliveryOutcome>;
}
