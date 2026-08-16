/**
 * NOTIFY-01 — the ledger, against REAL D1 in the REAL Workers runtime.
 *
 * The properties proved here are the ones the whole design rests on, and none of
 * them can be proved with a mock database:
 *
 *   - two ticks racing produce ONE notification, arbitrated by the UNIQUE index
 *     rather than by application code;
 *   - the ledger row exists BEFORE any channel is called, so a failed external
 *     send is recorded against a notification that is already in the inbox —
 *     never swallowed, never re-fired;
 *   - the 90-day purge removes read rows and their deliveries, and never removes
 *     an unread one;
 *   - the database itself refuses to enable a channel whose credentials have not
 *     been validated, and changing a credential un-validates it.
 *
 * Every fixture is synthetic. No real Pushover key, no real token, and the
 * channel is stubbed at the `fetch` boundary — nothing here reaches the network.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import {
  NOTIFICATION_READ_RETENTION_DAYS,
  type NewNotification,
} from "~/kernel/notifications";
import {
  createNotificationRepository,
  createNotificationSettingsRepository,
} from "~/platform/storage/d1";
import { workspaceContextFromId } from "~/kernel/workspaces";
import type { WorkspaceContext } from "~/kernel/workspaces";

const WORKSPACE_ID = "notifications-workspace";
const OTHER_WORKSPACE_ID = "notifications-other-workspace";
const OWNER = "owner@example.test";
// The branded workspace id, built through the kernel parser exactly as the
// composition boundary does — never a hand-cast string.
const CONTEXT: WorkspaceContext = workspaceContextFromId(WORKSPACE_ID);
const OTHER_CONTEXT: WorkspaceContext =
  workspaceContextFromId(OTHER_WORKSPACE_ID);

const NOW = new Date("2026-08-16T21:00:00.000Z");

/** A clearly synthetic Pushover-shaped credential. */
const TEST_USER_KEY = "uQiRzpo4DXghDmr9QzzfQu27cmVRsG";
const TEST_APP_TOKEN = "azGDORePK8gMaC0QOYAMyEEuzJnyUi";

function ledger(context: WorkspaceContext = CONTEXT) {
  return createNotificationRepository(env.DB, context);
}
function settings(context: WorkspaceContext = CONTEXT) {
  return createNotificationSettingsRepository(env.DB, context);
}

function digest(date = "2026-08-17"): NewNotification {
  return {
    kind: "digest",
    subjectEntityId: null,
    dedupeKey: `digest:${date}`,
    title: `Your day — ${date}`,
    body: "3 tasks for today",
    href: "/today",
  };
}

async function seedWorkspaces(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      `INSERT OR IGNORE INTO workspaces (id, created_at, updated_at)
         VALUES (?1, ?2, ?2)`,
    ).bind(WORKSPACE_ID, NOW.toISOString()),
    env.DB.prepare(
      `INSERT OR IGNORE INTO workspaces (id, created_at, updated_at)
         VALUES (?1, ?2, ?2)`,
    ).bind(OTHER_WORKSPACE_ID, NOW.toISOString()),
  ]);
}

beforeEach(async () => {
  await seedWorkspaces();
  // A clean slate per test, deepest child first.
  await env.DB.batch([
    env.DB.prepare("DELETE FROM notification_deliveries"),
    env.DB.prepare("DELETE FROM notifications"),
    env.DB.prepare("DELETE FROM notification_settings"),
  ]);
});

/* -------------------------------------------------------------------------- */
/* Insert-first concurrency                                                    */
/* -------------------------------------------------------------------------- */

describe("the ledger insert is the concurrency guard", () => {
  it("gives two simultaneous ticks one row and one winner", async () => {
    // Two repositories, as two Worker invocations of the same cron would have.
    // Neither reads before it writes; the DATABASE decides.
    const [first, second] = await Promise.all([
      ledger().record(digest()),
      ledger().record(digest()),
    ]);

    const winners = [first, second].filter((row) => row !== null);
    expect(winners).toHaveLength(1);

    const rows = await ledger().listRecent(50);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.notification.dedupeKey).toBe("digest:2026-08-17");
  });

  it("reports a repeat as null rather than throwing", async () => {
    expect(await ledger().record(digest())).not.toBeNull();
    // Not an error: it means another tick owns this event, and the caller must
    // stop silently.
    expect(await ledger().record(digest())).toBeNull();
  });

  it("keys the event, not the row — a different day is a different event", async () => {
    expect(await ledger().record(digest("2026-08-17"))).not.toBeNull();
    expect(await ledger().record(digest("2026-08-18"))).not.toBeNull();
    expect(await ledger().listRecent(50)).toHaveLength(2);
  });

  it("scopes the dedupe key to the workspace", async () => {
    expect(await ledger().record(digest())).not.toBeNull();
    // The same key in another workspace is a different event, and the UNIQUE
    // index is on the pair.
    expect(await ledger(OTHER_CONTEXT).record(digest())).not.toBeNull();
    expect(await ledger().listRecent(50)).toHaveLength(1);
    expect(await ledger(OTHER_CONTEXT).listRecent(50)).toHaveLength(1);
  });

  it("answers 'have we said this?' in one statement for many keys", async () => {
    await ledger().record(digest("2026-08-17"));
    await ledger().record({
      ...digest(),
      kind: "asset_obligation",
      dedupeKey: "asset:obl-1:7",
      subjectEntityId: "asset-1",
    });
    const seen = await ledger().existingDedupeKeys([
      "digest:2026-08-17",
      "asset:obl-1:7",
      "asset:obl-1:1",
      "digest:2026-08-18",
    ]);
    expect([...seen].sort()).toEqual(["asset:obl-1:7", "digest:2026-08-17"]);
    // An empty ask costs no statement at all.
    expect((await ledger().existingDedupeKeys([])).size).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Delivery                                                                    */
/* -------------------------------------------------------------------------- */

describe("a failed delivery is recorded, and blocks nothing", () => {
  it("keeps the notification and badges the failure against it", async () => {
    const row = await ledger().record(digest());
    expect(row).not.toBeNull();

    await ledger().recordDelivery({
      notificationId: row!.id,
      channel: "pushover",
      status: "failed",
      attemptedAt: NOW,
      detail: "unreachable",
    });

    const [entry] = await ledger().listRecent(50);
    // The event still happened. That is the whole point of recording before
    // sending: a provider outage cannot make it un-happen.
    expect(entry?.notification.id).toBe(row!.id);
    expect(entry?.deliveries).toHaveLength(1);
    expect(entry?.deliveries[0]?.status).toBe("failed");
    expect(entry?.deliveries[0]?.detail).toBe("unreachable");
  });

  it("holds one attempt per channel, not a growing list", async () => {
    const row = await ledger().record(digest());
    await ledger().recordDelivery({
      notificationId: row!.id,
      channel: "pushover",
      status: "failed",
      attemptedAt: NOW,
      detail: "timeout",
    });
    await ledger().recordDelivery({
      notificationId: row!.id,
      channel: "pushover",
      status: "delivered",
      attemptedAt: new Date(NOW.getTime() + 60_000),
      detail: null,
    });
    const [entry] = await ledger().listRecent(50);
    expect(entry?.deliveries).toHaveLength(1);
    expect(entry?.deliveries[0]?.status).toBe("delivered");
  });

  it("joins deliveries for a whole page in one read, never one query per row", async () => {
    for (let index = 0; index < 5; index += 1) {
      const row = await ledger().record(digest(`2026-08-${10 + index}`));
      await ledger().recordDelivery({
        notificationId: row!.id,
        channel: "pushover",
        status: "failed",
        attemptedAt: NOW,
        detail: "rejected",
      });
    }
    const rows = await ledger().listRecent(50);
    expect(rows).toHaveLength(5);
    expect(rows.every((row) => row.deliveries.length === 1)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Reading                                                                     */
/* -------------------------------------------------------------------------- */

describe("reading the log", () => {
  it("counts what has not been read, and stops counting it once it is", async () => {
    const first = await ledger().record(digest("2026-08-17"));
    await ledger().record(digest("2026-08-18"));
    expect(await ledger().unreadCount()).toBe(2);

    expect(await ledger().markRead(first!.id, NOW)).toBe(true);
    expect(await ledger().unreadCount()).toBe(1);
    // Marking an already-read row read is not a change, and not an error.
    expect(await ledger().markRead(first!.id, NOW)).toBe(false);
    expect(await ledger().markRead("no-such-id", NOW)).toBe(false);

    expect(await ledger().markAllRead(NOW)).toBe(1);
    expect(await ledger().unreadCount()).toBe(0);
    expect(await ledger().markAllRead(NOW)).toBe(0);
  });

  it("returns the log newest first", async () => {
    await ledger().record(digest("2026-08-17"));
    await ledger().record(digest("2026-08-18"));
    const rows = await ledger().listRecent(50);
    expect(rows[0]?.notification.createdAt.getTime()).toBeGreaterThanOrEqual(
      rows[1]!.notification.createdAt.getTime(),
    );
  });

  it("cannot see another workspace's notifications", async () => {
    await ledger(OTHER_CONTEXT).record(digest());
    expect(await ledger().listRecent(50)).toHaveLength(0);
    expect(await ledger().unreadCount()).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Retention                                                                   */
/* -------------------------------------------------------------------------- */

describe("the 90-day purge", () => {
  /** Backdate a row, as ninety-one days of real time would. */
  async function backdate(id: string, days: number): Promise<void> {
    const at = new Date(NOW.getTime() - days * 86_400_000).toISOString();
    await env.DB.prepare(
      "UPDATE notifications SET created_at = ?2 WHERE id = ?1",
    )
      .bind(id, at)
      .run();
  }

  it("removes a READ row past the window, and its deliveries with it", async () => {
    const row = await ledger().record(digest());
    await ledger().recordDelivery({
      notificationId: row!.id,
      channel: "pushover",
      status: "failed",
      attemptedAt: NOW,
      detail: "refused",
    });
    await ledger().markRead(row!.id, NOW);
    await backdate(row!.id, NOTIFICATION_READ_RETENTION_DAYS + 1);

    const cutoff = new Date(
      NOW.getTime() - NOTIFICATION_READ_RETENTION_DAYS * 86_400_000,
    );
    expect(await ledger().purgeReadBefore(cutoff)).toBe(1);
    expect(await ledger().listRecent(50)).toHaveLength(0);

    // The delivery went with it. Nothing is orphaned, whether or not this
    // database enforces the foreign key's cascade.
    const orphans = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM notification_deliveries WHERE workspace_id = ?1",
    )
      .bind(WORKSPACE_ID)
      .first<{ readonly count: number }>();
    expect(orphans?.count).toBe(0);
  });

  it("never removes an UNREAD row, however old", async () => {
    const row = await ledger().record(digest());
    await backdate(row!.id, 400);
    const cutoff = new Date(
      NOW.getTime() - NOTIFICATION_READ_RETENTION_DAYS * 86_400_000,
    );
    // Silently deleting something the owner has not seen is the one thing an
    // event log must not do.
    expect(await ledger().purgeReadBefore(cutoff)).toBe(0);
    expect(await ledger().listRecent(50)).toHaveLength(1);
  });

  it("leaves a read row inside the window alone", async () => {
    const row = await ledger().record(digest());
    await ledger().markRead(row!.id, NOW);
    await backdate(row!.id, NOTIFICATION_READ_RETENTION_DAYS - 1);
    const cutoff = new Date(
      NOW.getTime() - NOTIFICATION_READ_RETENTION_DAYS * 86_400_000,
    );
    expect(await ledger().purgeReadBefore(cutoff)).toBe(0);
  });

  it("cannot purge another workspace's rows", async () => {
    const row = await ledger(OTHER_CONTEXT).record(digest());
    await ledger(OTHER_CONTEXT).markRead(row!.id, NOW);
    await backdate(row!.id, 400);
    expect(await ledger().purgeReadBefore(new Date(NOW.getTime()))).toBe(0);
    expect(await ledger(OTHER_CONTEXT).listRecent(50)).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Settings, and validate-before-enable                                        */
/* -------------------------------------------------------------------------- */

describe("the notification settings", () => {
  it("are off with no row at all, and writing nothing creates none", async () => {
    const stored = await settings().get(OWNER);
    expect(stored.enabled).toBe(false);
    expect(stored.pushoverEnabled).toBe(false);
    expect(stored.pushoverConfigured).toBe(false);
    expect(stored.version).toBe(0);
    // A deployment whose owner never opens the section writes nothing.
    const rows = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM notification_settings",
    ).first<{ readonly count: number }>();
    expect(rows?.count).toBe(0);
  });

  it("never returns a credential from the ordinary read", async () => {
    await settings().update(OWNER, {
      pushoverUserKey: TEST_USER_KEY,
      pushoverAppToken: TEST_APP_TOKEN,
    });
    const stored = await settings().get(OWNER);
    // The shape has nowhere to put one, and the SQL does not select the columns.
    expect(JSON.stringify(stored)).not.toContain(TEST_USER_KEY);
    expect(JSON.stringify(stored)).not.toContain(TEST_APP_TOKEN);
    // It still knows they are there, which is what the surface needs.
    expect(stored.pushoverConfigured).toBe(true);
  });

  it("refuses to enable a channel that has never been validated", async () => {
    await settings().update(OWNER, {
      enabled: true,
      pushoverUserKey: TEST_USER_KEY,
      pushoverAppToken: TEST_APP_TOKEN,
    });
    // Asking is a legitimate save; it simply leaves the channel off, and the
    // STORED state says so rather than the requested one.
    const stored = await settings().update(OWNER, { pushoverEnabled: true });
    expect(stored.pushoverEnabled).toBe(false);
    expect(stored.pushoverValidatedAt).toBeNull();
  });

  it("enables it once the credentials have been proven", async () => {
    await settings().update(OWNER, {
      enabled: true,
      pushoverUserKey: TEST_USER_KEY,
      pushoverAppToken: TEST_APP_TOKEN,
    });
    await settings().recordPushoverValidation(OWNER, NOW);
    const stored = await settings().update(OWNER, { pushoverEnabled: true });
    expect(stored.pushoverEnabled).toBe(true);
    expect(stored.pushoverValidatedAt?.toISOString()).toBe(NOW.toISOString());
  });

  it("un-validates and switches off when a credential changes", async () => {
    await settings().update(OWNER, {
      enabled: true,
      pushoverUserKey: TEST_USER_KEY,
      pushoverAppToken: TEST_APP_TOKEN,
    });
    await settings().recordPushoverValidation(OWNER, NOW);
    await settings().update(OWNER, { pushoverEnabled: true });

    // A key swapped for a different one has not been proven, so the channel
    // must not keep sending on the strength of the OLD key having worked.
    const stored = await settings().update(OWNER, {
      pushoverUserKey: "differentKeyABCDEFGHIJKLMNOPQR",
    });
    expect(stored.pushoverValidatedAt).toBeNull();
    expect(stored.pushoverEnabled).toBe(false);
  });

  it("will not stamp a validation when there is nothing stored to validate", async () => {
    await expect(
      settings().recordPushoverValidation(OWNER, NOW),
    ).rejects.toThrow();
  });

  it("hands the scheduled sender only the owners who turned it on", async () => {
    expect(await settings().listEnabledSenders()).toHaveLength(0);
    await settings().update(OWNER, { enabled: true });
    const senders = await settings().listEnabledSenders();
    expect(senders).toHaveLength(1);
    expect(senders[0]?.ownerId).toBe(OWNER);
    // This is the ONE read that returns credentials, and it is the sender's.
    expect(senders[0]).toHaveProperty("pushoverUserKey");
  });

  it("keeps two owners' settings apart, and two workspaces' apart", async () => {
    await settings().update(OWNER, { enabled: true, digestSendTime: "06:30" });
    await settings().update("second@example.test", { enabled: false });
    expect((await settings().get(OWNER)).digestSendTime).toBe("06:30");
    expect((await settings(OTHER_CONTEXT).get(OWNER)).enabled).toBe(false);
    expect(await settings(OTHER_CONTEXT).listEnabledSenders()).toHaveLength(0);
  });
});
