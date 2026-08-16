/**
 * NOTIFY-01 — the notification inbox endpoint (`/notifications`).
 *
 * A shell-owned resource route: it renders no UI, so it sits OUTSIDE the
 * app-shell layout, like Search and the Command Palette's catalogue. The bell in
 * the top bar carries the unread count from the shell's own loader; this
 * endpoint serves the SHEET's contents and the two writes it can make.
 *
 *   GET  /notifications        the recent log, newest first
 *   POST /notifications        `intent=read` (one row) or `intent=read-all`
 *
 * ── Everything is rendered on the server ────────────────────────────────────
 * The stored `title`/`body`/`href` are what fired; the relative time is resolved
 * here against the OWNER's timezone. Nothing in the payload is re-derived from
 * current facts — a notification says what was true when it was sent, and a
 * browser clock must not be able to change how the log reads.
 *
 * Only FAILED deliveries cross the boundary. A delivery that worked needs no
 * badge, and a row per successful send would turn a log into a transcript.
 */

import { env } from "cloudflare:workers";

import {
  DELIVERY_FAILURE_MESSAGES,
  NOTIFICATION_INBOX_LIMIT,
  type DeliveryFailureReason,
} from "~/kernel/notifications";
import { DEFAULT_OWNER_TIME_ZONE } from "~/kernel/preferences";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import {
  EMPTY_INBOX,
  notificationWhenLabel,
  type NotificationInboxData,
  type NotificationView,
} from "~/shared/notifications/model";

import type { Route } from "./+types/notifications";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function loader({ context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const now = new Date();
  try {
    const scope = await resolveAuthenticatedWorkspaceScope(env, session);
    const [rows, timeZone] = await Promise.all([
      scope.notifications.listRecent(NOTIFICATION_INBOX_LIMIT),
      scope.ownerTimeZone().catch(() => DEFAULT_OWNER_TIME_ZONE),
    ]);
    const items: NotificationView[] = rows.map((row) => ({
      id: row.notification.id,
      title: row.notification.title,
      body: row.notification.body,
      href: row.notification.href,
      whenLabel: notificationWhenLabel(
        row.notification.createdAt,
        now,
        timeZone,
      ),
      read: row.notification.readAt !== null,
      failures: row.deliveries
        .filter((delivery) => delivery.status === "failed")
        .map((delivery) => ({
          channel: delivery.channel,
          failed: true,
          message:
            delivery.detail === null
              ? null
              : (DELIVERY_FAILURE_MESSAGES[
                  delivery.detail as DeliveryFailureReason
                ] ?? null),
        })),
    }));
    const payload: NotificationInboxData = {
      items,
      unread: items.filter((item) => !item.read).length,
    };
    return json(payload);
  } catch {
    // The bell is chrome. A storage failure empties the sheet and says nothing
    // alarming; it must never take a page down or become an error dialog over
    // whatever the owner was doing.
    return json(EMPTY_INBOX);
  }
}

export async function action({ request, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw new Response("Method Not Allowed", { status: 405 });
  }
  const session = requireAuthenticatedSession(context);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const now = new Date();

  try {
    const scope = await resolveAuthenticatedWorkspaceScope(env, session);
    if (intent === "read-all") {
      const changed = await scope.notifications.markAllRead(now);
      return json({ ok: true, changed });
    }
    if (intent === "read") {
      const id = String(form.get("id") ?? "");
      if (id === "") return json({ ok: false }, 400);
      // Marking an already-read notification read is not an error — a double tap
      // is not a failure — so `false` is reported plainly rather than as one.
      const changed = await scope.notifications.markRead(id, now);
      return json({ ok: true, changed: changed ? 1 : 0 });
    }
    return json({ ok: false }, 400);
  } catch {
    return json({ ok: false }, 500);
  }
}
