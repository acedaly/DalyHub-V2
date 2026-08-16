/**
 * NOTIFY-01 — the notification INBOX surface: public entry.
 *
 * Not to be confused with `~/shared/feedback`, whose `NotificationCenter` is the
 * transient toast layer. In DalyHub, from NOTIFY-01 onwards, a "notification" is
 * a ledger-backed EVENT and this is where it is read; the feedback layer's
 * objects are FEEDBACK and live over there.
 *
 * `NotificationInbox` is deliberately NOT re-exported here. The shell
 * lazy-loads it by module path so the sheet, its fetchers and its markup stay
 * out of the initial application bundle until the bell is actually pressed —
 * the same treatment Search, the Command Palette and the shortcut reference get.
 */

export {
  NotificationBell,
  type NotificationBellProps,
} from "./NotificationBell";
export {
  EMPTY_INBOX,
  notificationWhenLabel,
  type NotificationDeliveryView,
  type NotificationInboxData,
  type NotificationView,
} from "./model";
