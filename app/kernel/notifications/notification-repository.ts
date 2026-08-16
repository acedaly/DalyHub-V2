/**
 * NOTIFY-01 — the notification storage contracts.
 *
 * Storage-independent and WORKSPACE-BOUND at construction, exactly like every
 * other repository in the kernel (ADR-010): the workspace is decided by the
 * composition boundary from trusted configuration, so no method here takes one
 * and no request can name one. A notification in another workspace is not
 * "forbidden" — it is simply not found.
 *
 * Neither repository records Activity (ADR-012, and the AI usage ledger's
 * precedent in ADR-073). A notification is operational metadata about the
 * SYSTEM: the owner did nothing, so nothing belongs in any record's history.
 *
 * Note what the settings contract does NOT expose. {@link
 * NotificationSettingsRepository.get} returns no credential at all, and the one
 * method that does — {@link NotificationSettingsRepository.listEnabledSenders} —
 * is called by the scheduled sender and by the validation action, and by nothing
 * that renders. A loader therefore cannot leak a Pushover key even by accident.
 */

import type {
  NewNotification,
  NotificationDelivery,
  NotificationRecord,
  NotificationWithDeliveries,
} from "./notification";
import type {
  NotificationSettings,
  NotificationSettingsPatch,
  NotificationSettingsWithSecrets,
} from "./notification-settings";

export interface NotificationRepository {
  /**
   * Record an event, or report that it has already happened.
   *
   * THE contract of this item. The insert is attempted FIRST — before any
   * external send, before any rendering side effect — and a dedupe-key conflict
   * resolves to `null` rather than throwing. Two concurrent ticks therefore
   * produce exactly one row and exactly one send, arbitrated by the UNIQUE index
   * rather than by application code that could race.
   *
   * A caller that receives `null` must stop, silently. It is not an error: it
   * means another tick owns this event.
   */
  record(input: NewNotification): Promise<NotificationRecord | null>;

  /**
   * Record one external channel attempt against a notification.
   *
   * Idempotent per (notification, channel): there is no retry, so a second write
   * for the same pair replaces the first rather than accumulating attempts.
   */
  recordDelivery(delivery: NotificationDelivery): Promise<void>;

  /** Which of these dedupe keys already exist. One statement, never N. */
  existingDedupeKeys(keys: readonly string[]): Promise<ReadonlySet<string>>;

  /**
   * The inbox: the most recent notifications, newest first, each with its
   * external delivery attempts already joined (never one query per row).
   */
  listRecent(limit: number): Promise<readonly NotificationWithDeliveries[]>;

  /** How many notifications the owner has not read. The bell's whole model. */
  unreadCount(): Promise<number>;

  /** Mark one read. Returns false when it is unknown or already read. */
  markRead(id: string, at: Date): Promise<boolean>;

  /** Mark every unread notification read. Returns how many changed. */
  markAllRead(at: Date): Promise<number>;

  /**
   * Delete READ notifications created before `before`, and their deliveries.
   *
   * Unread rows are never purged: silently deleting something the owner has not
   * seen is the one thing an event log must not do.
   */
  purgeReadBefore(before: Date): Promise<number>;
}

export interface NotificationSettingsRepository {
  /** The owner's configuration, WITHOUT credentials. Safe for a loader. */
  get(ownerId: string): Promise<NotificationSettings>;

  /** Apply a validated patch and return the stored state, still without keys. */
  update(
    ownerId: string,
    patch: NotificationSettingsPatch,
  ): Promise<NotificationSettings>;

  /**
   * Stamp the Pushover credentials as validated, so the channel may be enabled.
   *
   * A separate method rather than a patch field, because "these keys worked"
   * is an observation the application makes after talking to Pushover — never
   * something a form may assert.
   */
  recordPushoverValidation(ownerId: string, at: Date): Promise<void>;

  /**
   * The configurations a background tick should act on, WITH credentials.
   *
   * The one read that returns channel secrets. Ordered by owner id so a tick is
   * deterministic. Called by the scheduled sender and by the Settings validation
   * action; never by anything that renders.
   */
  listEnabledSenders(): Promise<readonly NotificationSettingsWithSecrets[]>;

  /** One owner's configuration WITH credentials, for the validate/test action. */
  getWithSecrets(ownerId: string): Promise<NotificationSettingsWithSecrets>;
}
