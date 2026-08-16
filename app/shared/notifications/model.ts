/**
 * NOTIFY-01 — the notification INBOX's view model. Pure, framework-free.
 *
 * The inbox is a LOG. It renders what fired and when, in one order (newest
 * first), with one action (mark read, which happens by opening it). It is not a
 * second attention model, and this file is where that restraint is enforced:
 * there is no priority field to sort by, no state to filter on and no grouping
 * key, because an event log has none of those.
 *
 * ── The naming, once more ───────────────────────────────────────────────────
 * `~/shared/feedback` owns the transient toast layer, and its component is
 * called `NotificationCenter`. This directory owns the ledger-backed events.
 * They share a word and nothing else — no type, no table, no surface. New code
 * says INBOX for this and FEEDBACK for that.
 */

/** One external delivery attempt, as the row badges it. */
export interface NotificationDeliveryView {
  readonly channel: string;
  readonly failed: boolean;
  /** The owner-facing sentence, from DalyHub's own closed vocabulary. */
  readonly message: string | null;
}

/** One row in the inbox. Everything already rendered by the server. */
export interface NotificationView {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly href: string;
  /** "2 hours ago" / "Yesterday" — resolved server-side, owner-calendar aware. */
  readonly whenLabel: string;
  readonly read: boolean;
  /** Only FAILED deliveries reach the browser. A success needs no badge. */
  readonly failures: readonly NotificationDeliveryView[];
}

/** The payload `GET /notifications` returns. */
export interface NotificationInboxData {
  readonly items: readonly NotificationView[];
  readonly unread: number;
}

export const EMPTY_INBOX: NotificationInboxData = { items: [], unread: 0 };

/**
 * "just now" / "14 minutes ago" / "Yesterday" / "12 August".
 *
 * A log needs relative time — "when did DalyHub tell me this?" — and the answer
 * is only interesting in proportion to how long ago it was. Resolved on the
 * SERVER against the owner's timezone, so the phrase does not depend on the
 * device's clock and does not change between the server render and hydration.
 */
export function notificationWhenLabel(
  createdAt: Date,
  now: Date,
  timeZone: string,
): string {
  const minutes = Math.floor((now.getTime() - createdAt.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60)
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const createdDay = day.format(createdAt);
  const today = day.format(now);
  const yesterday = day.format(new Date(now.getTime() - 86_400_000));
  if (createdDay === today) return "today";
  if (createdDay === yesterday) return "yesterday";
  return new Intl.DateTimeFormat("en-AU", {
    timeZone,
    day: "numeric",
    month: "long",
  }).format(createdAt);
}
