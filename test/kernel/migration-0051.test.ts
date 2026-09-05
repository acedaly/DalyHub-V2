import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * V2.10 LIFE-03 — migration `0051_obligation_notifications.sql`.
 *
 * **This file is the acceptance criterion, not a description of it.** LIFE-03
 * asks that every historical notification survive the kind rename without
 * re-firing, and ADR-112 decision 8 states why an ordinary test cannot
 * discharge that:
 *
 * > A claim that data survived a change of representation is proven by moving
 * > real data through the migration and reading it back — never by a test that
 * > writes and reads the new shape only.
 *
 * So this file applies `0001…0050` — the schema production runs today, with
 * `kind IN ('digest', 'asset_obligation')` still in force — writes owner-shaped
 * notifications, delivery records and settings into it, and only THEN applies
 * `0051`. A test that seeded the new vocabulary directly would pass with the
 * whole data-carrying half of the migration deleted.
 *
 * What the fixture holds, deliberately and by name:
 *
 *   - a READ obligation notice and an UNREAD one, because the read flag is the
 *     one mutable column and a rebuild is exactly where it gets lost;
 *   - a DIGEST notice, which must come through completely untouched;
 *   - a DELIVERY record against a notice, because `notification_deliveries`
 *     cascades on the parent's delete and a naive rebuild takes it with it;
 *   - an obligation notice whose dedupe key does NOT carry the old prefix, so
 *     the rewrite is proven to be scoped rather than a blanket concatenation;
 *   - a second WORKSPACE, so isolation is proven rather than assumed;
 *   - a settings row with the obligation toggle turned OFF, because a rename
 *     that resets a preference to its default is a setting silently discarded.
 *
 * `MIGRATION_TEST_DB` is the database the pool leaves EMPTY for exactly this.
 */

const DB = env.MIGRATION_TEST_DB;
const AT = "2026-01-01T00:00:00.000Z";
const WS = "ws_life03";
const OTHER = "ws_life03_other";

/** Everything before `0051`, which is the migration under test. */
function migrationsBefore0051() {
  const all = env.TEST_MIGRATIONS;
  const index = all.findIndex((migration) =>
    migration.name.startsWith("0051_"),
  );
  // A guard rather than a slice(0, -1): if a later migration is added, this test
  // must keep applying everything BEFORE 0051 rather than silently dropping the
  // new one and testing a schema nobody ships.
  expect(index, "0051 must be present in the migration list").toBeGreaterThan(
    0,
  );
  return all.slice(0, index);
}

function only0051() {
  const all = env.TEST_MIGRATIONS;
  const index = all.findIndex((migration) =>
    migration.name.startsWith("0051_"),
  );
  return all.slice(index, index + 1);
}

async function workspace(id: string): Promise<void> {
  await DB.prepare(
    `INSERT OR IGNORE INTO workspaces (id, created_at, updated_at) VALUES (?, ?, ?)`,
  )
    .bind(id, AT, AT)
    .run();
}

type Seed = {
  readonly id: string;
  readonly ws?: string;
  readonly kind: string;
  readonly subjectEntityId?: string | null;
  readonly dedupeKey: string;
  readonly title?: string;
  readonly body?: string;
  readonly href?: string;
  readonly createdAt?: string;
  readonly readAt?: string | null;
};

async function notification(seed: Seed): Promise<void> {
  await DB.prepare(
    `INSERT INTO notifications (
       id, workspace_id, kind, subject_entity_id, dedupe_key,
       title, body, href, created_at, read_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      seed.id,
      seed.ws ?? WS,
      seed.kind,
      seed.subjectEntityId ?? null,
      seed.dedupeKey,
      seed.title ?? `Notice ${seed.id}`,
      seed.body ?? `Body of ${seed.id}`,
      seed.href ?? "/today",
      seed.createdAt ?? AT,
      seed.readAt ?? null,
    )
    .run();
}

type Row = Record<string, unknown>;

/** Every notification as the OLD table held it, read before the migration. */
let before: Row[] = [];

beforeAll(async () => {
  await applyD1Migrations(DB, migrationsBefore0051());

  await workspace(WS);
  await workspace(OTHER);

  await notification({
    id: "n-rego-30",
    kind: "asset_obligation",
    subjectEntityId: "asset-car",
    dedupeKey: "asset:ob-rego-2026:30",
    title: "The car — Registration renewal",
    body: "Due in 30 days",
    href: "/asset/asset-car?tab=obligations",
    readAt: "2026-01-02T00:00:00.000Z",
  });
  await notification({
    id: "n-rego-7",
    kind: "asset_obligation",
    subjectEntityId: "asset-car",
    dedupeKey: "asset:ob-rego-2026:7",
    title: "The car — Registration renewal",
    body: "Due in 7 days",
    href: "/asset/asset-car?tab=obligations",
  });
  await notification({
    id: "n-digest",
    kind: "digest",
    dedupeKey: "digest:2026-01-01",
    title: "Wednesday",
    body: "3 due today",
    href: "/today",
  });
  /*
   * An obligation notice whose key was never written by
   * `assetObligationDedupeKey` — a hand-inserted row, or one from a shape the
   * application no longer writes. The rewrite must leave it exactly alone
   * rather than producing `obligation:…` out of something that is not a rung.
   */
  await notification({
    id: "n-odd",
    kind: "asset_obligation",
    dedupeKey: "legacy-key-with-no-prefix",
  });
  await notification({
    id: "n-other-ws",
    ws: OTHER,
    kind: "asset_obligation",
    subjectEntityId: "asset-foreign",
    dedupeKey: "asset:ob-foreign:1",
  });

  await DB.prepare(
    `INSERT INTO notification_deliveries
       (workspace_id, notification_id, channel, status, attempted_at, detail)
     VALUES (?, 'n-rego-30', 'pushover', 'delivered', ?, NULL)`,
  )
    .bind(WS, AT)
    .run();
  await DB.prepare(
    `INSERT INTO notification_deliveries
       (workspace_id, notification_id, channel, status, attempted_at, detail)
     VALUES (?, 'n-rego-7', 'pushover', 'failed', ?, 'unauthorised')`,
  )
    .bind(WS, AT)
    .run();

  await DB.prepare(
    `INSERT INTO notification_settings
       (workspace_id, owner_id, enabled, digest_enabled, asset_obligations_enabled,
        digest_send_time, timezone, created_at, updated_at)
     VALUES (?, 'owner@example.test', 1, 1, 0, '06:30', 'Australia/Sydney', ?, ?)`,
  )
    .bind(WS, AT, AT)
    .run();

  before = (
    await DB.prepare(
      `SELECT * FROM notifications ORDER BY workspace_id, id`,
    ).all<Row>()
  ).results;

  await applyD1Migrations(DB, only0051());
});

async function all(sql: string, ...params: unknown[]): Promise<Row[]> {
  return (
    await DB.prepare(sql)
      .bind(...params)
      .all<Row>()
  ).results;
}

describe("0051 — the notification kind is renamed with its data", () => {
  it("carries every row across, in both workspaces", async () => {
    const after = await all(
      `SELECT * FROM notifications ORDER BY workspace_id, id`,
    );
    expect(after).toHaveLength(before.length);
    expect(after.map((row) => row.id)).toEqual(before.map((row) => row.id));
  });

  it("changes the kind and the dedupe key, and NOTHING else", async () => {
    const after = await all(
      `SELECT * FROM notifications ORDER BY workspace_id, id`,
    );
    for (const [index, row] of after.entries()) {
      const original = before[index] as Row;
      for (const column of [
        "id",
        "workspace_id",
        "subject_entity_id",
        "title",
        "body",
        // The href is history: it says where the notice pointed WHEN IT FIRED.
        "href",
        "created_at",
        "read_at",
      ]) {
        expect(row[column], `${String(row.id)}.${column}`).toEqual(
          original[column],
        );
      }
    }
  });

  it("rewrites the obligation keys, preserving the id and the rung", async () => {
    const rows = await all(
      `SELECT id, kind, dedupe_key FROM notifications
        WHERE workspace_id = ? ORDER BY id`,
      WS,
    );
    expect(rows).toEqual([
      {
        id: "n-digest",
        kind: "digest",
        dedupe_key: "digest:2026-01-01",
      },
      {
        id: "n-odd",
        kind: "obligation",
        // Scoped: an obligation row whose key never carried the prefix is left
        // exactly as it was rather than concatenated into nonsense.
        dedupe_key: "legacy-key-with-no-prefix",
      },
      {
        id: "n-rego-30",
        kind: "obligation",
        dedupe_key: "obligation:ob-rego-2026:30",
      },
      {
        id: "n-rego-7",
        kind: "obligation",
        dedupe_key: "obligation:ob-rego-2026:7",
      },
    ]);
  });

  it("leaves the other workspace's rows to the other workspace", async () => {
    const rows = await all(
      `SELECT id, kind, dedupe_key FROM notifications WHERE workspace_id = ?`,
      OTHER,
    );
    expect(rows).toEqual([
      {
        id: "n-other-ws",
        kind: "obligation",
        dedupe_key: "obligation:ob-foreign:1",
      },
    ]);
  });

  it("keeps every delivery record, against the rebuilt parent", async () => {
    const rows = await all(
      `SELECT notification_id, channel, status, detail
         FROM notification_deliveries ORDER BY notification_id`,
    );
    expect(rows).toEqual([
      {
        notification_id: "n-rego-30",
        channel: "pushover",
        status: "delivered",
        detail: null,
      },
      {
        notification_id: "n-rego-7",
        channel: "pushover",
        status: "failed",
        detail: "unauthorised",
      },
    ]);
  });

  it("keeps the cascade from a notification to its deliveries", async () => {
    await DB.prepare(`DELETE FROM notifications WHERE id = 'n-rego-7'`).run();
    const rows = await all(
      `SELECT notification_id FROM notification_deliveries`,
    );
    expect(rows.map((row) => row.notification_id)).toEqual(["n-rego-30"]);
  });

  it("keeps the dedupe ledger UNIQUE — the once-ever rule is the index", async () => {
    await expect(
      notification({
        id: "n-duplicate",
        kind: "obligation",
        dedupeKey: "obligation:ob-rego-2026:30",
      }),
    ).rejects.toThrow();
  });

  it("refuses the retired kind, so nothing can write it again", async () => {
    await expect(
      notification({
        id: "n-retired",
        kind: "asset_obligation",
        dedupeKey: "asset:ob-new:30",
      }),
    ).rejects.toThrow();
  });

  it("carries the owner's obligation toggle across the column rename", async () => {
    const rows = await all(
      `SELECT enabled, digest_enabled, obligations_enabled, digest_send_time, timezone
         FROM notification_settings WHERE workspace_id = ?`,
      WS,
    );
    expect(rows).toEqual([
      {
        enabled: 1,
        digest_enabled: 1,
        // OFF before the migration, and still off: a rename that reset this to
        // its default would silently start sending what the owner declined.
        obligations_enabled: 0,
        digest_send_time: "06:30",
        timezone: "Australia/Sydney",
      },
    ]);
  });

  it("leaves the database referentially clean", async () => {
    const rows = await all(`PRAGMA foreign_key_check`);
    expect(rows).toEqual([]);
  });
});
