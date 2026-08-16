/**
 * NOTIFY-01 — the Pushover channel adapter.
 *
 * The ONLY code in DalyHub that knows Pushover exists as a network service. It
 * implements {@link NotificationChannelAdapter} and nothing else calls it
 * directly: the evaluator hands a rendered notification to a channel and reads
 * an outcome, so a second channel is a second file, not a change to when DalyHub
 * decides something is worth saying.
 *
 * ── Two endpoints, and nothing else ─────────────────────────────────────────
 *   POST /1/messages.json        send one notification
 *   POST /1/users/validate.json  prove the owner's keys work
 *
 * Both are fixed constants. There is no configurable base URL, so nothing the
 * owner types can redirect DalyHub at another host, and no SSRF guard is needed
 * because there is no attacker-supplied address to guard.
 *
 * ── Priority ────────────────────────────────────────────────────────────────
 * Everything is sent at priority 0. The contract permits 1; the TYPE forbids 2
 * (Pushover's "emergency", which re-alerts until acknowledged and overrides
 * quiet hours). Nothing in a personal planner justifies waking someone
 * repeatedly at 3am — see `~/kernel/notifications/notification-channel.ts`.
 *
 * ── What never leaves this file ─────────────────────────────────────────────
 * The credentials, and Pushover's own words. A failure is mapped onto DalyHub's
 * closed {@link DeliveryFailureReason} vocabulary before it is returned, and
 * nothing here logs a key, a token, a message body or a response.
 */

import {
  formatPushoverMessage,
  type DeliverableNotification,
  type DeliveryFailureReason,
  type DeliveryOutcome,
  type NotificationChannelAdapter,
} from "~/kernel/notifications";

const MESSAGES_ENDPOINT = "https://api.pushover.net/1/messages.json";
const VALIDATE_ENDPOINT = "https://api.pushover.net/1/users/validate.json";

/**
 * How long one send may take.
 *
 * A cron tick has a budget and a digest is not urgent to the second. Ten seconds
 * is generous for a single form POST and short enough that a hanging provider
 * costs one tick rather than the Worker's whole invocation.
 */
const PUSHOVER_TIMEOUT_MS = 10_000;

/**
 * The optional deployment origin, used only to turn the notification's
 * in-application path into a link Pushover can open.
 *
 * Read through an optional config shape rather than the generated `Env`, exactly
 * as the Access values and the capture addresses are: it is deploy-time
 * configuration, not a committed `var`. When it is absent the notification is
 * still sent — it simply arrives without a tappable link, which is a smaller
 * failure than not arriving.
 */
export interface PushoverEnv {
  readonly APP_PUBLIC_ORIGIN?: string;
}

export function publicOrigin(env: PushoverEnv): string | null {
  const value = env.APP_PUBLIC_ORIGIN?.trim();
  if (value === undefined || value === "") return null;
  try {
    const url = new URL(value);
    // https only. A notification link is opened on a phone, often on someone
    // else's network, and DalyHub will not hand out an http one.
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

export interface PushoverCredentials {
  readonly userKey: string;
  readonly appToken: string;
}

/** Injectable so tests drive the adapter without touching the network. */
export type PushoverFetcher = typeof fetch;

/** Map a transport failure or an HTTP status onto DalyHub's own vocabulary. */
function reasonForStatus(status: number): DeliveryFailureReason {
  // Pushover answers 4xx for a bad token, a bad user key or a malformed
  // message, and includes its reasons in the body. The body is deliberately not
  // read: the owner's recovery is the same either way (check the keys in
  // Settings and press Send test), and a provider's prose has no business on
  // their screen.
  if (status === 401 || status === 403) return "rejected";
  if (status >= 400 && status < 500) return "refused";
  return "unreachable";
}

async function postForm(
  fetcher: PushoverFetcher,
  endpoint: string,
  body: Record<string, string>,
): Promise<
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: DeliveryFailureReason }
> {
  try {
    const response = await fetcher(endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body).toString(),
      signal: AbortSignal.timeout(PUSHOVER_TIMEOUT_MS),
    });
    if (response.ok) return { ok: true };
    return { ok: false, reason: reasonForStatus(response.status) };
  } catch (cause) {
    // `AbortSignal.timeout` rejects with a `TimeoutError`; everything else is a
    // transport failure. Neither carries anything worth showing the owner.
    const timedOut =
      cause instanceof DOMException && cause.name === "TimeoutError";
    return { ok: false, reason: timedOut ? "timeout" : "unreachable" };
  }
}

/**
 * Prove a pair of credentials before the channel may be enabled.
 *
 * This is what makes "validate before enable" real: a channel that has never
 * been shown to work is a channel that fails silently the first time it matters,
 * at 7am, when nobody is watching.
 */
export async function validatePushoverCredentials(
  credentials: PushoverCredentials,
  options: { readonly fetcher?: PushoverFetcher } = {},
): Promise<
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: DeliveryFailureReason }
> {
  return postForm(options.fetcher ?? fetch, VALIDATE_ENDPOINT, {
    token: credentials.appToken,
    user: credentials.userKey,
  });
}

/** Build the adapter for one owner's credentials. */
export function createPushoverChannel(input: {
  readonly credentials: PushoverCredentials;
  /** The deployment origin, or null when none is configured. */
  readonly origin: string | null;
  readonly fetcher?: PushoverFetcher;
}): NotificationChannelAdapter {
  const fetcher = input.fetcher ?? fetch;
  return {
    channel: "pushover",
    async deliver(
      notification: DeliverableNotification,
    ): Promise<DeliveryOutcome> {
      const message = formatPushoverMessage({
        title: notification.title,
        body: notification.body,
        href: notification.href,
        origin: input.origin,
        priority: notification.priority,
      });
      const result = await postForm(fetcher, MESSAGES_ENDPOINT, {
        token: input.credentials.appToken,
        user: input.credentials.userKey,
        title: message.title,
        message: message.message,
        // The formatter's whole reason for existing: readable line breaks on a
        // phone, with every character of the body escaped first.
        html: "1",
        priority: String(message.priority),
        ...(message.url === undefined
          ? {}
          : { url: message.url, url_title: message.urlTitle ?? "" }),
      });
      return result.ok
        ? { status: "delivered" }
        : { status: "failed", reason: result.reason };
    },
  };
}
