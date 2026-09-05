/**
 * NOTIFY-01 — one notification tick.
 *
 * The composition the cron trigger runs, and the only place the evaluator, the
 * ledger and the channels meet. It is deliberately a straight line:
 *
 *     for each owner with notifications ON
 *       ├─ digest?      evaluate → render → RECORD → deliver
 *       └─ obligations? evaluate → render → RECORD → deliver
 *
 * ── RECORD, then deliver. Always that way round ─────────────────────────────
 * The ledger insert commits before any channel is called. That single ordering
 * is what makes the whole design safe:
 *
 *   - two ticks racing produce ONE row (the UNIQUE dedupe key arbitrates) and
 *     therefore one send;
 *   - a provider outage cannot make an event not-have-happened — the row is
 *     already there, the in-app inbox already shows it, and the failure is
 *     recorded against it rather than swallowed;
 *   - nothing retries. A failed send is a visible fact, not a queue. Retrying
 *     would reintroduce exactly the duplicate the ledger exists to prevent, in
 *     exchange for a message the owner can already read in the app.
 *
 * ── A tick that finds nothing writes nothing ────────────────────────────────
 * No row, no request, no log line. Ninety-six times a day, the common case must
 * cost almost nothing: the digest gate is decided from settings and one bounded
 * key lookup, and the workspace reads behind the digest only happen on the tick
 * that is actually going to send one.
 */

import {
  NOTIFICATION_READ_RETENTION_DAYS,
  assetObligationDedupeKey,
  digestDedupeKey,
  evaluateDigestDue,
  renderDigest,
  renderObligationNotice,
  resolveNotificationTimeZone,
  rungForDaysUntilDue,
  type DeliverableNotification,
  type NotificationChannelAdapter,
  type NotificationRecord,
  type NotificationSettingsWithSecrets,
} from "~/kernel/notifications";
import { evaluateAssetObligation, isAssetMeterUnit } from "~/kernel/assets";
import { DEFAULT_OWNER_TIME_ZONE } from "~/kernel/preferences";
import type { WorkspaceScope } from "~/platform/workspaces";
import { wallClockInTimeZone } from "~/shared/datetime";

import { readDigestFacts } from "./digest-facts.server";
import {
  createPushoverChannel,
  publicOrigin,
  type PushoverEnv,
  type PushoverFetcher,
} from "./pushover-channel.server";

/** What one tick did. Returned rather than logged, so tests can assert on it. */
export interface NotificationRunSummary {
  /** How many owners with notifications enabled were evaluated. */
  readonly owners: number;
  /** How many ledger rows this tick created. */
  readonly recorded: number;
  /** How many external deliveries were attempted. */
  readonly delivered: number;
  /** How many of those failed. */
  readonly failed: number;
  /** How many read notifications aged out. */
  readonly purged: number;
}

const EMPTY_SUMMARY: NotificationRunSummary = {
  owners: 0,
  recorded: 0,
  delivered: 0,
  failed: 0,
  purged: 0,
};

export interface NotificationRunOptions {
  /** The instant the tick is evaluating. Injected so tests own the clock. */
  readonly now?: Date;
  /** Injected so tests drive the channel without touching the network. */
  readonly fetcher?: PushoverFetcher;
}

/**
 * Build the external channels this owner has enabled and proven.
 *
 * A channel that is enabled but missing a credential is simply absent, rather
 * than present-and-always-failing: the database already refuses to enable one
 * without validated keys, and belt-and-braces here means a hand-edited row
 * cannot produce ninety-six failed deliveries a day.
 */
function channelsFor(
  settings: NotificationSettingsWithSecrets,
  env: PushoverEnv,
  fetcher?: PushoverFetcher,
): readonly NotificationChannelAdapter[] {
  if (
    !settings.pushoverEnabled ||
    settings.pushoverUserKey === null ||
    settings.pushoverAppToken === null
  ) {
    return [];
  }
  return [
    createPushoverChannel({
      credentials: {
        userKey: settings.pushoverUserKey,
        appToken: settings.pushoverAppToken,
      },
      origin: publicOrigin(env),
      fetcher,
    }),
  ];
}

/** Send one recorded notification down every enabled channel, recording each. */
async function deliver(
  scope: WorkspaceScope,
  notification: NotificationRecord,
  channels: readonly NotificationChannelAdapter[],
  now: Date,
): Promise<{ readonly attempted: number; readonly failed: number }> {
  if (channels.length === 0) return { attempted: 0, failed: 0 };
  const deliverable: DeliverableNotification = {
    id: notification.id,
    title: notification.title,
    body: notification.body,
    href: notification.href,
    // Everything NOTIFY-01 sends is priority 0. See the channel contract for
    // why there is no path to Pushover's emergency priority at all.
    priority: 0,
  };
  let attempted = 0;
  let failed = 0;
  for (const channel of channels) {
    attempted += 1;
    const outcome = await channel.deliver(deliverable);
    if (outcome.status === "failed") failed += 1;
    // The attempt is recorded whatever happened, so the inbox can badge a row
    // the owner never received elsewhere. A storage failure HERE must not lose
    // the notification, which is already committed — so it is swallowed.
    await scope.notifications
      .recordDelivery({
        notificationId: notification.id,
        channel: channel.channel,
        status: outcome.status,
        attemptedAt: now,
        detail: outcome.status === "failed" ? outcome.reason : null,
      })
      .catch(() => undefined);
  }
  return { attempted, failed };
}

/**
 * Evaluate and send for ONE owner.
 *
 * Exported so the Settings "Send test notification" action and the kernel tests
 * can drive exactly what the cron drives, rather than an approximation of it.
 */
export async function runNotificationsForOwner(
  scope: WorkspaceScope,
  settings: NotificationSettingsWithSecrets,
  env: PushoverEnv,
  options: NotificationRunOptions = {},
): Promise<NotificationRunSummary> {
  const now = options.now ?? new Date();
  const profileTimeZone = await scope.appPreferences
    .get(settings.ownerId)
    .then((preferences) => preferences.timezone)
    .catch(() => DEFAULT_OWNER_TIME_ZONE);
  const timeZone = resolveNotificationTimeZone(settings, profileTimeZone);
  const localNow = wallClockInTimeZone(now, timeZone);
  const channels = channelsFor(settings, env, options.fetcher);

  let recorded = 0;
  let delivered = 0;
  let failed = 0;

  /* ---------------------------------------------------------------------- */
  /* The digest                                                             */
  /* ---------------------------------------------------------------------- */

  const digestGate = evaluateDigestDue({
    enabled: settings.enabled,
    digestEnabled: settings.digestEnabled,
    sendTime: settings.digestSendTime,
    localNow,
    // A cheap existence check, so the expensive workspace reads below happen
    // once a day rather than ninety-six times. It is an OPTIMISATION: the
    // guarantee is the insert's UNIQUE conflict, which two racing ticks both
    // reach whatever this said.
    alreadyRecorded: settings.digestEnabled
      ? (
          await scope.notifications
            .existingDedupeKeys([digestDedupeKey(localNow.date)])
            .catch(() => new Set<string>())
        ).size > 0
      : false,
  });

  if (digestGate.send) {
    const facts = await readDigestFacts(scope, {
      now,
      timeZone,
      localDate: digestGate.localDate,
    });
    // THE SUPPRESSION RULE: an empty digest is not sent, and is not recorded
    // either. A day with nothing to report leaves no trace, which is what makes
    // a notification from DalyHub mean something.
    const digest = renderDigest(facts);
    if (digest !== null) {
      const row = await scope.notifications.record(digest);
      if (row !== null) {
        recorded += 1;
        const outcome = await deliver(scope, row, channels, now);
        delivered += outcome.attempted;
        failed += outcome.failed;
      }
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Asset obligations                                                      */
  /* ---------------------------------------------------------------------- */

  if (settings.enabled && settings.assetObligationsEnabled) {
    // The EXISTING bounded Assets seam — no Assets-side scheduling, no second
    // obligation query and no new evaluator. Its default horizon is 30 days,
    // which is exactly the widest rung, so the read and the ladder agree by
    // construction.
    const items = await scope.obligations
      .listAttention({ today: localNow.date })
      .catch(() => []);

    /*
     * Note what is NOT filtered below: an obligation whose linked Task is still
     * open. Today's rail suppresses those, and correctly — the Task is already a
     * row in the timeline beside it, so showing both would be the same job twice
     * on one page. Outside the application there is no timeline to have seen:
     * suppressing it there would mean an owner who dutifully made a Task for
     * their registration renewal gets LESS warning than one who did not. That
     * rule is Today's, and it does not transfer.
     */
    const candidates = items.flatMap((item) => {
      // V2.10 LIFE-01 — the same LIFE-03 seam as Today's: the notice text names
      // an Asset, so an obligation with another subject or none is not yet a
      // candidate. Widening the notice is LIFE-03's item, and doing it here
      // would change what the owner receives in the change whose criterion is
      // that they receive exactly what they received before.
      if (item.subject?.type !== "asset") return [];
      const subject = item.subject;
      const evaluation = evaluateAssetObligation(
        item.obligation,
        localNow.date,
        item.meterValue !== null && isAssetMeterUnit(item.meterUnit)
          ? { value: item.meterValue, unit: item.meterUnit }
          : null,
      );
      // A meter-only obligation has no date to count down from, so it has no
      // rung. It still reaches the owner through Today and through the digest's
      // obligation line; what it cannot do is claim a number of days it does
      // not have.
      const rung = rungForDaysUntilDue(evaluation.daysUntilDue);
      if (rung === null) return [];
      return [
        {
          key: assetObligationDedupeKey(item.obligation.id, rung),
          notice: {
            obligationId: item.obligation.id,
            assetId: subject.id,
            assetTitle: subject.title,
            title: item.obligation.title,
            // The words the Asset record and Today's rail already use, from the
            // ONE Assets evaluator. The notification never writes its own.
            text: evaluation.text,
            rung,
          },
        },
      ];
    });

    if (candidates.length > 0) {
      const seen = await scope.notifications
        .existingDedupeKeys(candidates.map((candidate) => candidate.key))
        .catch(() => new Set<string>());
      for (const candidate of candidates) {
        if (seen.has(candidate.key)) continue;
        const row = await scope.notifications.record(
          renderObligationNotice(candidate.notice),
        );
        if (row === null) continue;
        recorded += 1;
        const outcome = await deliver(scope, row, channels, now);
        delivered += outcome.attempted;
        failed += outcome.failed;
      }
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Retention                                                              */
  /* ---------------------------------------------------------------------- */

  // Purged only on a tick that actually recorded something, which in practice
  // means about once a day. There is nothing to purge on a tick that wrote
  // nothing — rows exist only because something fired — and a DELETE ninety-six
  // times a day to find nothing is work the product should not do.
  let purged = 0;
  if (recorded > 0) {
    const cutoff = new Date(
      now.getTime() - NOTIFICATION_READ_RETENTION_DAYS * 86_400_000,
    );
    purged = await scope.notifications.purgeReadBefore(cutoff).catch(() => 0);
  }

  return { owners: 1, recorded, delivered, failed, purged };
}

/**
 * Evaluate and send for every owner in the workspace who has turned
 * notifications on.
 *
 * DalyHub is single-owner per workspace, so this is a loop over one row in
 * practice. It is a loop rather than a `first()` because the settings table is
 * keyed by owner and quietly acting for whichever owner sorted first would be a
 * silent, surprising choice. Where two owners DID share a workspace, the digest's
 * workspace-scoped dedupe key means the second one's digest conflicts and is
 * skipped — the ledger arbitrates, exactly as it does for two racing ticks.
 */
export async function runNotificationTick(
  scope: WorkspaceScope,
  env: PushoverEnv,
  options: NotificationRunOptions = {},
): Promise<NotificationRunSummary> {
  const senders = await scope.notificationSettings
    .listEnabledSenders()
    .catch(() => []);
  if (senders.length === 0) return EMPTY_SUMMARY;

  let summary: NotificationRunSummary = { ...EMPTY_SUMMARY };
  for (const settings of senders) {
    // One owner failing costs that owner alone. A tick is not a transaction.
    const result = await runNotificationsForOwner(
      scope,
      settings,
      env,
      options,
    ).catch(() => ({ ...EMPTY_SUMMARY, owners: 1 }));
    summary = {
      owners: summary.owners + result.owners,
      recorded: summary.recorded + result.recorded,
      delivered: summary.delivered + result.delivered,
      failed: summary.failed + result.failed,
      purged: summary.purged + result.purged,
    };
  }
  return summary;
}
