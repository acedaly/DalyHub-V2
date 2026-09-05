/**
 * NOTIFY-01 — the notification settings endpoints
 * (`POST /settings/notifications/:action`, where `action` is `update` or
 * `test`).
 *
 * A resource route: it renders no UI, and it has no `GET` on purpose. `update`
 * accepts a Pushover credential and `test` acts on one, and nothing about either
 * should be reachable by following a link or replayable from history.
 *
 * ── The credentials never come back ─────────────────────────────────────────
 * `update` is the only place a Pushover key or token is ever accepted, and no
 * response below contains one. The repository's ordinary read does not select
 * those columns at all, so — as with a calendar feed URL — there is no code path
 * from storage to the browser, not merely no code that currently takes one. They
 * are likewise absent from every error message.
 *
 * ── Validate BEFORE enable, in three places ─────────────────────────────────
 * A channel that has never been proven to work is a channel that fails silently
 * at 7am, when nobody is watching. So:
 *
 *   1. `test` calls Pushover's own `users/validate.json` and only stamps the
 *      settings row when it answers yes;
 *   2. the REPOSITORY clears that stamp whenever a credential changes;
 *   3. the DATABASE refuses `pushover_enabled = 1` without stored, stamped
 *      credentials (a CHECK on `notification_settings`).
 *
 * Three, because this is the rule the whole channel rests on and a rule enforced
 * in one place is a rule one future code path can forget.
 */

import { env } from "cloudflare:workers";

import {
  DELIVERY_FAILURE_MESSAGES,
  NotificationSettingsValidationError,
  NotificationStorageError,
  parseNotificationSettingsPatch,
  resolveNotificationTimeZone,
  type NotificationSettings,
} from "~/kernel/notifications";
import { DEFAULT_OWNER_TIME_ZONE } from "~/kernel/preferences";
import {
  createPushoverChannel,
  publicOrigin,
  validatePushoverCredentials,
  type PushoverEnv,
} from "~/platform/notifications";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import type { Route } from "./+types/notifications";

/*
 * A GET on this mutation endpoint renders DalyHub's error boundary rather
 * than React Router's internal error object and stack trace.
 */
import { actionOnlyLoader } from "~/platform/request";

export const loader = actionOnlyLoader;

const ACTIONS = new Set(["update", "test"]);

/**
 * `APP_PUBLIC_ORIGIN` is deploy-time configuration supplied through the
 * environment rather than a committed `var`, so it is absent from the generated
 * `Env` type. It is read through the optional config shape, exactly as the
 * Access values and the capture addresses are.
 */
const pushoverEnv = env as unknown as PushoverEnv;

export type NotificationActionResult =
  | {
      readonly ok: true;
      readonly message?: string;
      /** The stored state, so the surface reflects what was actually saved. */
      readonly settings?: NotificationSettingsView;
    }
  | { readonly ok: false; readonly message: string; readonly field?: string };

/**
 * The settings as the Settings surface sees them.
 *
 * Note what is not here: no user key, no application token. This type IS the
 * leak boundary — if a field cannot be added to it, it cannot reach the browser.
 */
export type NotificationSettingsView = {
  readonly enabled: boolean;
  readonly digestEnabled: boolean;
  readonly obligationsEnabled: boolean;
  readonly digestSendTime: string;
  /** The owner's explicit override, or null for "follow my profile". */
  readonly timeZone: string | null;
  /** The zone the digest is ACTUALLY read in. Stated, never left implicit. */
  readonly effectiveTimeZone: string;
  readonly pushoverEnabled: boolean;
  readonly pushoverConfigured: boolean;
  /** ISO-8601, or null. Rendered as a date by the surface. */
  readonly pushoverValidatedAt: string | null;
};

export function toNotificationSettingsView(
  settings: NotificationSettings,
  profileTimeZone: string,
): NotificationSettingsView {
  return {
    enabled: settings.enabled,
    digestEnabled: settings.digestEnabled,
    obligationsEnabled: settings.obligationsEnabled,
    digestSendTime: settings.digestSendTime,
    timeZone: settings.timeZone,
    effectiveTimeZone: resolveNotificationTimeZone(settings, profileTimeZone),
    pushoverEnabled: settings.pushoverEnabled,
    pushoverConfigured: settings.pushoverConfigured,
    pushoverValidatedAt: settings.pushoverValidatedAt?.toISOString() ?? null,
  };
}

function json(data: NotificationActionResult, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

/**
 * The fields `update` accepts, and how a form value becomes a patch value.
 *
 * A closed list, so a hand-crafted POST cannot reach a column the surface does
 * not offer. `pushoverValidatedAt` is deliberately absent: "these keys worked"
 * is an observation the server makes after talking to Pushover, never something
 * a form may assert.
 */
const FIELDS = new Set([
  "enabled",
  "digestEnabled",
  "obligationsEnabled",
  "digestSendTime",
  "timeZone",
  "pushoverEnabled",
  "pushoverUserKey",
  "pushoverAppToken",
]);

export async function action({ request, params, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw new Response("Method Not Allowed", { status: 405 });
  }
  const step = String(params.action ?? "");
  if (!ACTIONS.has(step)) {
    throw new Response("Not Found", { status: 404 });
  }

  const session = requireAuthenticatedSession(context);
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);
  const ownerId = session.user.subject;
  const form = await request.formData();
  const profileTimeZone = await scope
    .ownerTimeZone()
    .catch(() => DEFAULT_OWNER_TIME_ZONE);

  try {
    if (step === "update") {
      const raw: Record<string, unknown> = {};
      for (const [key, value] of form.entries()) {
        if (!FIELDS.has(key)) continue;
        // An empty string clears a nullable field — the timezone override and
        // either credential. It is how "follow my profile" and "forget this key"
        // are expressed by a form that can only send strings.
        raw[key] = value === "" ? null : value;
      }
      if (Object.keys(raw).length === 0) {
        return json({ ok: false, message: "Nothing to save." }, 400);
      }
      const patch = parseNotificationSettingsPatch(raw);
      const settings = await scope.notificationSettings.update(ownerId, patch);
      // The STORED state is returned, not the requested one. Asking to enable
      // Pushover without validated keys succeeds as a save and leaves the
      // channel off, and the owner must be shown that rather than told it worked.
      return json({
        ok: true,
        settings: toNotificationSettingsView(settings, profileTimeZone),
      });
    }

    /* ------------------------------------------------------------------ */
    /* `test` — validate the stored credentials, then send a real message  */
    /* ------------------------------------------------------------------ */

    const stored = await scope.notificationSettings.getWithSecrets(ownerId);
    if (stored.pushoverUserKey === null || stored.pushoverAppToken === null) {
      return json(
        {
          ok: false,
          message: "Save your Pushover user key and application token first.",
        },
        400,
      );
    }
    const credentials = {
      userKey: stored.pushoverUserKey,
      appToken: stored.pushoverAppToken,
    };

    const validation = await validatePushoverCredentials(credentials);
    if (!validation.ok) {
      return json(
        { ok: false, message: DELIVERY_FAILURE_MESSAGES[validation.reason] },
        502,
      );
    }

    // A validation that passed but a message that never arrives is the failure
    // this action exists to rule out, so the test SENDS one. It is deliberately
    // not written to the ledger: it is not an event about the owner's records,
    // it is a wire check, and putting it in the log would put a row in the inbox
    // that means nothing a week later.
    const channel = createPushoverChannel({
      credentials,
      origin: publicOrigin(pushoverEnv),
    });
    const outcome = await channel.deliver({
      id: "test",
      title: "DalyHub",
      body: "Notifications are working. This is the only test message DalyHub will send.",
      href: "/settings?section=notifications",
      priority: 0,
    });
    if (outcome.status === "failed") {
      return json(
        { ok: false, message: DELIVERY_FAILURE_MESSAGES[outcome.reason] },
        502,
      );
    }

    await scope.notificationSettings.recordPushoverValidation(
      ownerId,
      new Date(),
    );
    const settings = await scope.notificationSettings.get(ownerId);
    return json({
      ok: true,
      message: "Sent. Check your phone — you can turn the channel on now.",
      settings: toNotificationSettingsView(settings, profileTimeZone),
    });
  } catch (cause) {
    if (cause instanceof NotificationSettingsValidationError) {
      return json(
        { ok: false, message: cause.message, field: cause.field },
        400,
      );
    }
    if (cause instanceof NotificationStorageError) {
      return json(
        { ok: false, message: "That couldn’t be saved. Please try again." },
        500,
      );
    }
    // One sentence, no internals — the same restraint the Capture, Calendar and
    // Account endpoints exercise. There is nothing actionable in the detail for
    // the owner and plenty in it for anyone else.
    return json(
      { ok: false, message: "That couldn’t be saved. Please try again." },
      500,
    );
  }
}
