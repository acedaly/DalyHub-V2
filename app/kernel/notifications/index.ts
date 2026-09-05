/**
 * NOTIFY-01 — the notifications kernel: public surface.
 *
 * Everything here is pure domain or a storage contract. There is no clock, no
 * network, no React and no channel implementation — the Pushover adapter lives
 * in `~/platform/notifications`, behind {@link NotificationChannelAdapter}.
 *
 * The governing rule, restated so it is visible from the barrel: the inbox is a
 * LOG OF EVENTS THAT FIRED, never a second copy of what currently needs the
 * owner. Today's attention rail is that, it is state, and it is authoritative.
 */

export {
  NOTIFICATION_KINDS,
  NOTIFICATION_TITLE_MAX,
  NOTIFICATION_BODY_MAX,
  NOTIFICATION_HREF_MAX,
  NOTIFICATION_INBOX_LIMIT,
  NOTIFICATION_READ_RETENTION_DAYS,
  DELIVERY_CHANNELS,
  DELIVERY_FAILURE_REASONS,
  DELIVERY_FAILURE_MESSAGES,
  isNotificationKind,
  obligationDedupeKey,
  digestDedupeKey,
  type DeliveryChannel,
  type DeliveryFailureReason,
  type DeliveryStatus,
  type NewNotification,
  type NotificationDelivery,
  type NotificationKind,
  type NotificationRecord,
  type NotificationWithDeliveries,
} from "./notification";

export {
  OBLIGATION_RUNG_DAYS,
  evaluateDigestDue,
  rungForDaysUntilDue,
  sendTimeMinutes,
  type DigestDecision,
  type DigestDecisionReason,
  type LocalWallClock,
  type ObligationRung,
} from "./notification-evaluator";

export {
  digestDateLabel,
  renderDigest,
  renderObligationNotice,
  type DigestFacts,
  type ObligationNoticeFacts,
} from "./digest";

export type {
  DeliverableNotification,
  DeliveryOutcome,
  NotificationChannelAdapter,
  NotificationPriority,
} from "./notification-channel";

export {
  PUSHOVER_MESSAGE_MAX,
  PUSHOVER_TITLE_MAX,
  PUSHOVER_URL_MAX,
  PUSHOVER_URL_TITLE_MAX,
  formatPushoverMessage,
  type PushoverMessage,
} from "./pushover-format";

export {
  DEFAULT_NOTIFICATION_SETTINGS,
  NotificationSettingsValidationError,
  NotificationStorageError,
  parseDigestSendTime,
  parseNotificationBoolean,
  parseNotificationOwnerId,
  parseNotificationSettingsPatch,
  parseNotificationTimeZone,
  parsePushoverAppToken,
  parsePushoverUserKey,
  resolveNotificationTimeZone,
  type NotificationSettings,
  type NotificationSettingsPatch,
  type NotificationSettingsWithSecrets,
} from "./notification-settings";

export type {
  NotificationRepository,
  NotificationSettingsRepository,
} from "./notification-repository";
