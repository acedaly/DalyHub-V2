/**
 * NOTIFY-01 — the notification domain.
 *
 * ── The one distinction everything here rests on ────────────────────────────
 * DalyHub has two attention surfaces and they are NOT the same kind of thing:
 *
 *   - Today's attention rail is **STATE**. It is recomputed from facts on every
 *     read, so it cannot go stale and it cannot be wrong about what needs the
 *     owner right now.
 *   - A notification is an **EVENT**. A fact crossed a threshold at a moment,
 *     and DalyHub said so. It is true forever that it was said.
 *
 * The inbox is therefore a LOG, never a second attention model. It shows what
 * fired and when. It has no "resolved" state, no priority, no re-ranking and no
 * link back into the rail's model, because none of those are properties an event
 * has. If the inbox and the rail ever disagree about what needs the owner, the
 * rail is right and the inbox is history.
 *
 * ── Naming, stated once ─────────────────────────────────────────────────────
 * `app/shared/feedback/NotificationCenter.tsx` predates this module and is the
 * transient TOAST layer. From NOTIFY-01 onwards, a "notification" in DalyHub is
 * the ledger-backed event defined here; the feedback layer's objects are
 * FEEDBACK. The two never share a type, a table or a surface, and the in-app
 * surface for these is deliberately called the notification INBOX.
 *
 * Everything in this file is pure: no clock, no storage, no React.
 */

/* -------------------------------------------------------------------------- */
/* Kinds                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The closed vocabulary of things DalyHub will say.
 *
 * Adding a kind is a migration AND a product decision, deliberately: a kind is a
 * promise about frequency, and about what the owner is agreeing to be
 * interrupted for.
 *
 *   - `digest` — the day, assembled once, at a time the owner chose.
 *   - `obligation` — an obligation crossing a fixed lead-time rung. Named for
 *     the obligation rather than the Asset since V2.10 LIFE-03, because an
 *     obligation need not be about an Asset and most are not.
 *
 * Overdue tasks and ageing waiting items are deliberately NOT kinds. They change
 * every day, so a per-event channel would deliver the same anxiety daily, which
 * is the nagging failure mode this design exists to prevent. They reach the owner
 * inside the digest instead.
 */
export const NOTIFICATION_KINDS = ["digest", "obligation"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/**
 * The record types DalyHub will NOT name in anything it sends outside itself.
 *
 * AGENTS.md §17: People and Diary are never sent to an external service without
 * an explicit per-action opt-in, and a notification has no such opt-in — the
 * owner enables a channel once, and every notice after that goes to Pushover's
 * servers and onto a lock screen.
 *
 * Until V2.10 LIFE-03 this was true by accident: the notification path read only
 * obligations whose subject was an Asset, so a Person's name could not reach it.
 * Widening the set made the boundary explicit rather than incidental.
 */
const UNNAMEABLE_SUBJECT_TYPES: ReadonlySet<string> = new Set([
  "person",
  "diary",
]);

/**
 * The subject's name, where naming it is allowed — otherwise null.
 *
 * Null does not mean the obligation is silenced. It means the notice announces
 * itself ("Renew the licence") rather than the record it is about, which is the
 * whole fact the owner needs at a glance and none of the one they did not agree
 * to publish.
 */
export function notificationSubjectName(
  subject: { readonly type: string; readonly title: string } | null,
): string | null {
  if (subject === null) return null;
  return UNNAMEABLE_SUBJECT_TYPES.has(subject.type) ? null : subject.title;
}

/**
 * Whether a stored string is a kind this application recognises.
 *
 * The storage adapter re-validates on the way OUT, so a hand-edited row — or a
 * row written by a Worker one deploy ahead of this one — cannot introduce a
 * kind nothing can render. It reads the vocabulary rather than restating it: a
 * second hand-written list is how a new kind comes to be silently discarded.
 */
export function isNotificationKind(value: string): value is NotificationKind {
  return (NOTIFICATION_KINDS as readonly string[]).includes(value);
}

/* -------------------------------------------------------------------------- */
/* Bounds                                                                      */
/* -------------------------------------------------------------------------- */

/** The database's own bounds, restated so the renderers can respect them. */
export const NOTIFICATION_TITLE_MAX = 250;
export const NOTIFICATION_BODY_MAX = 2000;
export const NOTIFICATION_HREF_MAX = 512;
/** How many rows the inbox reads. It is a log, not an archive browser. */
export const NOTIFICATION_INBOX_LIMIT = 50;
/**
 * How long a READ notification is kept. Unread rows are never purged: silently
 * deleting something the owner has not seen is the one thing a log must not do.
 */
export const NOTIFICATION_READ_RETENTION_DAYS = 90;

/* -------------------------------------------------------------------------- */
/* The event                                                                   */
/* -------------------------------------------------------------------------- */

/** One recorded event. */
export interface NotificationRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly kind: NotificationKind;
  /** The record the event was about, when there was one. Never joined on. */
  readonly subjectEntityId: string | null;
  readonly dedupeKey: string;
  /**
   * The event as it was rendered WHEN IT FIRED. Stored rather than re-derived:
   * re-rendering a past event from current facts would rewrite history, which is
   * exactly what the state/event distinction exists to prevent.
   */
  readonly title: string;
  readonly body: string;
  readonly href: string;
  readonly createdAt: Date;
  readonly readAt: Date | null;
}

/** What the evaluator hands the ledger. The ledger supplies id and timestamps. */
export interface NewNotification {
  readonly kind: NotificationKind;
  readonly subjectEntityId?: string | null;
  readonly dedupeKey: string;
  readonly title: string;
  readonly body: string;
  readonly href: string;
}

/* -------------------------------------------------------------------------- */
/* Delivery                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The external channels. In-app is deliberately absent: it IS the ledger insert
 * and cannot fail separately, so recording it would add a row that could only
 * ever agree with the table it describes — or disagree with it, which is worse.
 */
export const DELIVERY_CHANNELS = ["pushover"] as const;
export type DeliveryChannel = (typeof DELIVERY_CHANNELS)[number];

export type DeliveryStatus = "delivered" | "failed";

/**
 * Why a delivery failed, from DalyHub's OWN closed vocabulary.
 *
 * Never a provider response body and never a message a remote service wrote: a
 * failure detail is exactly where a leaked credential ends up in a screenshot,
 * and a hostile or merely verbose upstream must not be able to put text on the
 * owner's screen.
 */
export const DELIVERY_FAILURE_REASONS = [
  /** The channel is enabled but its credentials are missing or unusable. */
  "not_configured",
  /** The provider rejected the credentials. */
  "rejected",
  /** The provider refused the message itself (a limit, a quota, a bad field). */
  "refused",
  /** The provider could not be reached, or answered with a server error. */
  "unreachable",
  /** The attempt exceeded the time a background tick may spend on one send. */
  "timeout",
] as const;
export type DeliveryFailureReason = (typeof DELIVERY_FAILURE_REASONS)[number];

/** The owner-facing sentence for each failure. One authority, used everywhere. */
export const DELIVERY_FAILURE_MESSAGES: Record<DeliveryFailureReason, string> =
  {
    not_configured: "Not sent — this channel is not set up.",
    rejected: "Not sent — Pushover rejected the keys for this workspace.",
    refused: "Not sent — Pushover refused the message.",
    unreachable: "Not sent — Pushover could not be reached.",
    timeout: "Not sent — Pushover did not answer in time.",
  };

/** One recorded attempt against one channel. */
export interface NotificationDelivery {
  readonly notificationId: string;
  readonly channel: DeliveryChannel;
  readonly status: DeliveryStatus;
  readonly attemptedAt: Date;
  /** A {@link DeliveryFailureReason} on failure; null on success. */
  readonly detail: DeliveryFailureReason | null;
}

/** A ledger row with the external attempts made against it. */
export interface NotificationWithDeliveries {
  readonly notification: NotificationRecord;
  readonly deliveries: readonly NotificationDelivery[];
}

/* -------------------------------------------------------------------------- */
/* Dedupe keys                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The identity of an EVENT, not of a row.
 *
 * These strings are written into a UNIQUE index, which is what makes two
 * concurrent ticks produce one notification: the loser's insert conflicts and it
 * stops, silently, rather than arbitrating in application code. They are also
 * what makes "we already told them about this" a permanent fact rather than a
 * window — there is no expiry and no re-arming.
 *
 * They are therefore a STORAGE CONTRACT. Changing the shape of one re-fires every
 * event that used it, so a change is a migration decision, not a refactor.
 */

/** One digest per owner-calendar date. `digest:2026-08-16`. */
export function digestDedupeKey(localDate: string): string {
  return `digest:${localDate}`;
}

/**
 * One notification per obligation per rung. `obligation:<obligationId>:7`.
 *
 * Keyed on the OBLIGATION rather than on its subject: an Asset can carry a
 * registration renewal and a service due in the same week, and collapsing them
 * would silently drop one. Most obligations have no subject at all.
 *
 * V2.10 LIFE-03 renamed the prefix from `asset:`, and migration 0051 rewrites
 * every historical key in the same statement that rewrites the kind. Changing
 * the prefix WITHOUT carrying the rows across would make every historical rung
 * unseen, and re-fire years of renewals at the owner in one tick
 * ([ADR-118](../../../docs/decisions/ARCHITECTURE_DECISIONS.md) decision 4).
 */
export function obligationDedupeKey(
  obligationId: string,
  rungDays: number,
): string {
  return `obligation:${obligationId}:${rungDays}`;
}
