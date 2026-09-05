import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * V2.10 LIFE-01 — migration `0050_create_obligations.sql`.
 *
 * **This file is the acceptance criterion, not a description of it.** LIFE-01
 * asks that every former Asset obligation read identically before and after, and
 * ADR-112 decision 8 states why an ordinary test cannot discharge that:
 *
 * > A claim that data survived a change of representation is proven by moving
 * > real data through the migration and reading it back — never by a test that
 * > writes and reads the new shape only.
 *
 * So this file applies migrations `0001…0049` — the schema as it exists in
 * production today, with `asset_obligations` still present and `asset_id NOT
 * NULL` — writes owner-shaped obligations into it, and only THEN applies `0050`.
 * Every assertion reads the result. A test that seeded `obligation_details`
 * directly would pass with the whole data-carrying half of the migration
 * deleted, which is the failure V2.6 FIND-02 recorded.
 *
 * The fixture holds, deliberately and by name:
 *
 *   - every STATUS: open, completed, dismissed, on_hold;
 *   - every date RECURRENCE kind plus `none` and `meter`;
 *   - a SERIES mid-chain — sequence 0 completed and pointing at sequence 1 —
 *     because `next_obligation_id` and `series_id` have no foreign key and this
 *     migration's whole safety property is that the ids do not change;
 *   - a completed obligation pointing at its `asset_events` PROOF row, and that
 *     event pointing back — the other id chain with no foreign key;
 *   - a LINKED TASK, so the pointer is proven to survive;
 *   - a SOFT-DELETED obligation and an ARCHIVED one, because a migration that
 *     silently drops the ones the owner put away is still losing data;
 *   - a WHITESPACE-ONLY title, the one value the migration cannot carry verbatim
 *     (`entities` requires `length(trim(title)) > 0` where `asset_obligations`
 *     required only `length(title) > 0`);
 *   - a second WORKSPACE, so isolation is proven rather than assumed.
 *
 * `MIGRATION_TEST_DB` is the database the pool leaves EMPTY for exactly this.
 */

const DB = env.MIGRATION_TEST_DB;
const AT = "2026-01-01T00:00:00.000Z";
const WS = "ws_life01";
const OTHER = "ws_life01_other";

/** Everything before `0050`, which is the migration under test. */
function migrationsBefore0050() {
  const all = env.TEST_MIGRATIONS;
  const index = all.findIndex((migration) =>
    migration.name.startsWith("0050_"),
  );
  // A guard rather than a slice(0, -1): if a later migration is added, this test
  // must keep applying everything BEFORE 0050 rather than silently dropping the
  // new one and testing a schema nobody ships.
  expect(index, "0050 must be present in the migration list").toBeGreaterThan(
    0,
  );
  return all.slice(0, index);
}

async function workspace(id: string): Promise<void> {
  await DB.prepare(
    `INSERT OR IGNORE INTO workspaces (id, created_at, updated_at) VALUES (?, ?, ?)`,
  )
    .bind(id, AT, AT)
    .run();
}

async function entity(
  ws: string,
  id: string,
  type: string,
  title: string,
): Promise<void> {
  await DB.prepare(
    `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, ws, type, title, AT, AT)
    .run();
}

async function asset(ws: string, id: string, title: string): Promise<void> {
  await entity(ws, id, "asset", title);
  await DB.prepare(
    `INSERT INTO asset_details (workspace_id, entity_id, asset_type, updated_at)
     VALUES (?, ?, 'vehicle', ?)`,
  )
    .bind(ws, id, AT)
    .run();
}

type Seed = {
  readonly id: string;
  readonly ws?: string;
  readonly assetId?: string;
  readonly category?: string;
  readonly title?: string;
  readonly description?: string | null;
  readonly dueDate?: string | null;
  readonly leadDays?: number;
  readonly recurrenceKind?: string;
  readonly recurrenceInterval?: number | null;
  readonly meterThreshold?: number | null;
  readonly meterInterval?: number | null;
  readonly meterUnit?: string | null;
  readonly status?: string;
  readonly taskId?: string | null;
  readonly completedEventId?: string | null;
  readonly completedAt?: string | null;
  readonly nextObligationId?: string | null;
  readonly seriesId?: string;
  readonly sequence?: number;
  readonly archivedAt?: string | null;
  readonly deletedAt?: string | null;
};

async function obligation(seed: Seed): Promise<void> {
  await DB.prepare(
    `INSERT INTO asset_obligations (
       id, workspace_id, asset_id, category, title, description, due_date,
       lead_days, recurrence_kind, recurrence_interval, meter_threshold,
       meter_interval, meter_unit, status, task_id, completed_event_id,
       completed_at, next_obligation_id, series_id, sequence,
       created_at, updated_at, archived_at, deleted_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      seed.id,
      seed.ws ?? WS,
      seed.assetId ?? "asset-car",
      seed.category ?? "registration",
      seed.title ?? `Obligation ${seed.id}`,
      seed.description ?? null,
      seed.dueDate === undefined ? "2026-09-30" : seed.dueDate,
      seed.leadDays ?? 14,
      seed.recurrenceKind ?? "none",
      seed.recurrenceInterval ?? null,
      seed.meterThreshold ?? null,
      seed.meterInterval ?? null,
      seed.meterUnit ?? null,
      seed.status ?? "open",
      seed.taskId ?? null,
      seed.completedEventId ?? null,
      seed.completedAt ?? null,
      seed.nextObligationId ?? null,
      seed.seriesId ?? seed.id,
      seed.sequence ?? 0,
      AT,
      AT,
      seed.archivedAt ?? null,
      seed.deletedAt ?? null,
    )
    .run();
}

/** Every obligation as the OLD table held it, read before the migration runs. */
let before: Record<string, unknown>[] = [];

beforeAll(async () => {
  await applyD1Migrations(DB, migrationsBefore0050());

  await workspace(WS);
  await workspace(OTHER);
  await asset(WS, "asset-car", "The car");
  await asset(WS, "asset-house", "The house");
  await asset(OTHER, "asset-foreign", "Somebody else's car");
  await entity(WS, "task-rego", "task", "Renew the rego");

  // The proof event a completed obligation points at, and which points back.
  await DB.prepare(
    `INSERT INTO asset_events (
       id, workspace_id, asset_id, category, title, event_date, obligation_id,
       created_at, updated_at
     ) VALUES ('event-rego-2025', ?, 'asset-car', 'registration',
               'Renewed the rego', '2025-09-28', 'ob-rego-2025', ?, ?)`,
  )
    .bind(WS, AT, AT)
    .run();

  await obligation({
    id: "ob-rego-2025",
    category: "registration",
    title: "Registration renewal",
    dueDate: "2025-09-30",
    recurrenceKind: "years",
    recurrenceInterval: 1,
    status: "completed",
    completedAt: "2025-09-28T04:00:00.000Z",
    completedEventId: "event-rego-2025",
    nextObligationId: "ob-rego-2026",
    seriesId: "series-rego",
    sequence: 0,
  });
  await obligation({
    id: "ob-rego-2026",
    category: "registration",
    title: "Registration renewal",
    dueDate: "2026-09-30",
    recurrenceKind: "years",
    recurrenceInterval: 1,
    taskId: "task-rego",
    seriesId: "series-rego",
    sequence: 1,
  });
  await obligation({
    id: "ob-service",
    category: "service",
    title: "Major service",
    description: "Book it with the usual place.",
    dueDate: "2026-11-01",
    leadDays: 30,
    recurrenceKind: "meter",
    meterThreshold: 60_000,
    meterInterval: 10_000,
    meterUnit: "km",
  });
  await obligation({
    id: "ob-warranty",
    category: "warranty",
    dueDate: "2027-03-14",
    recurrenceKind: "none",
    status: "on_hold",
  });
  await obligation({
    id: "ob-weekly",
    category: "maintenance",
    assetId: "asset-house",
    dueDate: "2026-09-08",
    recurrenceKind: "weeks",
    recurrenceInterval: 2,
    status: "dismissed",
  });
  await obligation({
    id: "ob-monthly",
    category: "inspection",
    assetId: "asset-house",
    dueDate: "2026-10-01",
    recurrenceKind: "months",
    recurrenceInterval: 6,
    archivedAt: "2026-08-01T00:00:00.000Z",
  });
  await obligation({
    id: "ob-daily",
    category: "reminder",
    assetId: "asset-house",
    dueDate: "2026-09-06",
    recurrenceKind: "days",
    recurrenceInterval: 10,
    deletedAt: "2026-08-20T00:00:00.000Z",
  });
  // The one value the migration cannot carry verbatim.
  await obligation({
    id: "ob-blank-title",
    category: "reminder",
    title: "   ",
    dueDate: "2026-12-01",
  });
  // Another workspace's obligation, to prove isolation rather than assume it.
  await obligation({
    id: "ob-foreign",
    ws: OTHER,
    assetId: "asset-foreign",
    category: "insurance",
    dueDate: "2026-09-15",
  });

  before = (
    await DB.prepare(
      `SELECT * FROM asset_obligations ORDER BY workspace_id, id`,
    ).all<Record<string, unknown>>()
  ).results;

  await applyD1Migrations(DB, env.TEST_MIGRATIONS);
});

describe("migration 0050 — nothing is lost", () => {
  it("moved every obligation, in every workspace, with no duplicates", async () => {
    expect(before).toHaveLength(9);

    const after = await DB.prepare(
      `SELECT count(*) AS n FROM obligation_details`,
    ).first<{ n: number }>();
    expect(after?.n).toBe(before.length);

    const entities = await DB.prepare(
      `SELECT count(*) AS n FROM entities WHERE type = 'obligation'`,
    ).first<{ n: number }>();
    expect(entities?.n).toBe(before.length);

    const links = await DB.prepare(
      `SELECT count(*) AS n FROM entity_links WHERE type = 'obligation.subject'`,
    ).first<{ n: number }>();
    expect(links?.n).toBe(before.length);
  });

  it("kept every id, so every chain with no foreign key still resolves", async () => {
    const ids = (
      await DB.prepare(
        `SELECT entity_id FROM obligation_details ORDER BY workspace_id, entity_id`,
      ).all<{ entity_id: string }>()
    ).results.map((r) => r.entity_id);
    expect(ids).toEqual(before.map((row) => row.id));

    // The recurrence chain, by id.
    const chained = await DB.prepare(
      `SELECT next_obligation_id, series_id, sequence FROM obligation_details
        WHERE workspace_id = ? AND entity_id = 'ob-rego-2025'`,
    )
      .bind(WS)
      .first<{
        next_obligation_id: string;
        series_id: string;
        sequence: number;
      }>();
    expect(chained).toEqual({
      next_obligation_id: "ob-rego-2026",
      series_id: "series-rego",
      sequence: 0,
    });

    // …and the successor it names is really there, at the next sequence.
    const successor = await DB.prepare(
      `SELECT sequence FROM obligation_details
        WHERE workspace_id = ? AND entity_id = ?`,
    )
      .bind(WS, chained!.next_obligation_id)
      .first<{ sequence: number }>();
    expect(successor?.sequence).toBe(1);

    // The proof event still points at the obligation, and it back at the event.
    const proof = await DB.prepare(
      `SELECT o.completed_event_id AS oe, e.obligation_id AS eo
         FROM obligation_details o
         JOIN asset_events e ON e.workspace_id = o.workspace_id
                            AND e.id = o.completed_event_id
        WHERE o.workspace_id = ? AND o.entity_id = 'ob-rego-2025'`,
    )
      .bind(WS)
      .first<{ oe: string; eo: string }>();
    expect(proof).toEqual({ oe: "event-rego-2025", eo: "ob-rego-2025" });
  });

  it("carried every column value across, field by field", async () => {
    const after = (
      await DB.prepare(
        `SELECT * FROM obligation_details ORDER BY workspace_id, entity_id`,
      ).all<Record<string, unknown>>()
    ).results;
    const titles = new Map(
      (
        await DB.prepare(
          `SELECT id, title FROM entities WHERE type = 'obligation'`,
        ).all<{ id: string; title: string }>()
      ).results.map((r) => [r.id, r.title]),
    );

    expect(after).toHaveLength(before.length);

    for (const [index, old] of before.entries()) {
      const row = after[index]!;
      const where = `obligation ${old.id as string}`;

      expect(row.entity_id, where).toBe(old.id);
      expect(row.workspace_id, where).toBe(old.workspace_id);
      expect(row.subject_entity_id, where).toBe(old.asset_id);
      expect(row.subject_entity_type, where).toBe("asset");
      expect(row.entity_type, where).toBe("obligation");

      for (const column of [
        "category",
        "description",
        "due_date",
        "lead_days",
        "recurrence_kind",
        "recurrence_interval",
        "meter_threshold",
        "meter_interval",
        "meter_unit",
        "status",
        "task_id",
        "completed_event_id",
        "completed_at",
        "next_obligation_id",
        "series_id",
        "sequence",
        "created_at",
        "updated_at",
        "archived_at",
        "deleted_at",
      ]) {
        expect(row[column], `${where}: ${column}`).toEqual(old[column]);
      }

      // The title moved to the entity, which is where a title belongs.
      const expected =
        String(old.title).trim() === ""
          ? "Untitled obligation"
          : (old.title as string);
      expect(titles.get(old.id as string), `${where}: title`).toBe(expected);

      // Money is new, and a migrated obligation has none — an amount invented
      // here would be a figure the owner never entered.
      expect(row.expected_amount_minor, where).toBeNull();
      expect(row.completed_amount_minor, where).toBeNull();
      expect(row.currency_code, where).toBeNull();
    }
  });

  it("substituted a placeholder for the one title it could not carry, and counted it", async () => {
    const blanks = before.filter((row) => String(row.title).trim() === "");
    expect(blanks).toHaveLength(1);

    const title = await DB.prepare(
      `SELECT title FROM entities WHERE id = 'ob-blank-title'`,
    ).first<{ title: string }>();
    expect(title?.title).toBe("Untitled obligation");
  });

  it("gave the entity the obligation's own lifecycle, not today's", async () => {
    const row = await DB.prepare(
      `SELECT created_at, updated_at, deleted_at FROM entities WHERE id = 'ob-daily'`,
    ).first<{
      created_at: string;
      updated_at: string;
      deleted_at: string | null;
    }>();
    expect(row).toEqual({
      created_at: AT,
      updated_at: AT,
      deleted_at: "2026-08-20T00:00:00.000Z",
    });
  });

  it("linked each obligation to its subject, deterministically, and no further", async () => {
    const link = await DB.prepare(
      `SELECT id, source_entity_id, target_entity_id, type, deleted_at
         FROM entity_links
        WHERE workspace_id = ? AND source_entity_id = 'ob-rego-2026'`,
    )
      .bind(WS)
      .first<Record<string, unknown>>();
    expect(link).toEqual({
      id: "obl-subject-ob-rego-2026",
      source_entity_id: "ob-rego-2026",
      target_entity_id: "asset-car",
      type: "obligation.subject",
      deleted_at: null,
    });

    // A soft-deleted obligation's link is soft-deleted too: the relationship is
    // as gone as the record, and restoring one restores both.
    const deleted = await DB.prepare(
      `SELECT deleted_at FROM entity_links WHERE id = 'obl-subject-ob-daily'`,
    ).first<{ deleted_at: string | null }>();
    expect(deleted?.deleted_at).toBe("2026-08-20T00:00:00.000Z");

    // Exactly one link per obligation — never two, and never a link between an
    // obligation and something that is not its subject.
    const stray = await DB.prepare(
      `SELECT count(*) AS n FROM entity_links l
        WHERE l.type = 'obligation.subject'
          AND NOT EXISTS (
                SELECT 1 FROM obligation_details o
                 WHERE o.workspace_id = l.workspace_id
                   AND o.entity_id = l.source_entity_id
                   AND o.subject_entity_id = l.target_entity_id)`,
    ).first<{ n: number }>();
    expect(stray?.n).toBe(0);
  });

  it("kept the workspaces apart", async () => {
    const here = await DB.prepare(
      `SELECT count(*) AS n FROM obligation_details WHERE workspace_id = ?`,
    )
      .bind(WS)
      .first<{ n: number }>();
    const there = await DB.prepare(
      `SELECT count(*) AS n FROM obligation_details WHERE workspace_id = ?`,
    )
      .bind(OTHER)
      .first<{ n: number }>();
    expect(here?.n).toBe(8);
    expect(there?.n).toBe(1);

    // No link crosses a workspace — the composite foreign key makes it
    // impossible, and this asserts the migration did not find a way anyway.
    const crossing = await DB.prepare(
      `SELECT count(*) AS n FROM entity_links l
         JOIN entities s ON s.id = l.source_entity_id
         JOIN entities t ON t.id = l.target_entity_id
        WHERE l.type = 'obligation.subject'
          AND (s.workspace_id <> l.workspace_id OR t.workspace_id <> l.workspace_id)`,
    ).first<{ n: number }>();
    expect(crossing?.n).toBe(0);
  });

  it("left no orphan on either side, and the database agrees", async () => {
    const orphanDetails = await DB.prepare(
      `SELECT count(*) AS n FROM obligation_details o
        WHERE NOT EXISTS (
          SELECT 1 FROM entities e
           WHERE e.workspace_id = o.workspace_id AND e.id = o.entity_id
             AND e.type = 'obligation')`,
    ).first<{ n: number }>();
    const orphanEntities = await DB.prepare(
      `SELECT count(*) AS n FROM entities e
        WHERE e.type = 'obligation'
          AND NOT EXISTS (
            SELECT 1 FROM obligation_details o
             WHERE o.workspace_id = e.workspace_id AND o.entity_id = e.id)`,
    ).first<{ n: number }>();
    expect(orphanDetails?.n).toBe(0);
    expect(orphanEntities?.n).toBe(0);

    const violations = await DB.prepare("PRAGMA foreign_key_check").all();
    expect(violations.results).toEqual([]);
  });

  it("retired the old table, so there is one authority and not two", async () => {
    const table = await DB.prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'asset_obligations'`,
    ).first<{ name: string }>();
    expect(table).toBeNull();

    await expect(
      DB.prepare(`SELECT count(*) FROM asset_obligations`).first(),
    ).rejects.toThrow();
  });
});

describe("migration 0050 — the new store refuses what it should", () => {
  it("accepts an obligation with NO subject at all", async () => {
    await entity(WS, "ob-tax", "obligation", "Tax return");
    await DB.prepare(
      `INSERT INTO obligation_details
         (workspace_id, entity_id, category, due_date, recurrence_kind,
          recurrence_interval, series_id, sequence, created_at, updated_at)
       VALUES (?, 'ob-tax', 'tax', '2026-10-31', 'years', 1, 'series-tax', 0, ?, ?)`,
    )
      .bind(WS, AT, AT)
      .run();

    const row = await DB.prepare(
      `SELECT subject_entity_id, subject_entity_type, category
         FROM obligation_details WHERE entity_id = 'ob-tax'`,
    ).first<Record<string, unknown>>();
    expect(row).toEqual({
      subject_entity_id: null,
      subject_entity_type: null,
      category: "tax",
    });
  });

  it("accepts the four life categories the nine did not cover", async () => {
    for (const [index, category] of ["bill", "subscription", "fee"].entries()) {
      const id = `ob-life-${index}`;
      await entity(WS, id, "obligation", `A ${category}`);
      await DB.prepare(
        `INSERT INTO obligation_details
           (workspace_id, entity_id, category, due_date, series_id, sequence,
            created_at, updated_at)
         VALUES (?, ?, ?, '2026-12-01', ?, 0, ?, ?)`,
      )
        .bind(WS, id, category, id, AT, AT)
        .run();
    }
    const n = await DB.prepare(
      `SELECT count(*) AS n FROM obligation_details
        WHERE category IN ('bill', 'subscription', 'fee', 'tax')`,
    ).first<{ n: number }>();
    expect(n?.n).toBe(4);
  });

  it("refuses a category outside the closed set", async () => {
    await entity(WS, "ob-bad-category", "obligation", "Nope");
    await expect(
      DB.prepare(
        `INSERT INTO obligation_details
           (workspace_id, entity_id, category, due_date, series_id, sequence,
            created_at, updated_at)
         VALUES (?, 'ob-bad-category', 'appointment', '2026-12-01', 's', 0, ?, ?)`,
      )
        .bind(WS, AT, AT)
        .run(),
    ).rejects.toThrow();
  });

  it("refuses a meter on an obligation about nothing", async () => {
    await entity(WS, "ob-meterless", "obligation", "Kilometres of what?");
    await expect(
      DB.prepare(
        `INSERT INTO obligation_details
           (workspace_id, entity_id, category, due_date, meter_threshold,
            meter_unit, series_id, sequence, created_at, updated_at)
         VALUES (?, 'ob-meterless', 'service', '2026-12-01', 1000, 'km', 's2', 0, ?, ?)`,
      )
        .bind(WS, AT, AT)
        .run(),
    ).rejects.toThrow();
  });

  it("refuses a subject in another workspace, at the database level", async () => {
    await entity(WS, "ob-hostile-subject", "obligation", "Not yours");
    await expect(
      DB.prepare(
        `INSERT INTO obligation_details
           (workspace_id, entity_id, subject_entity_id, subject_entity_type,
            category, due_date, series_id, sequence, created_at, updated_at)
         VALUES (?, 'ob-hostile-subject', 'asset-foreign', 'asset', 'insurance',
                 '2026-12-01', 's3', 0, ?, ?)`,
      )
        .bind(WS, AT, AT)
        .run(),
    ).rejects.toThrow();
  });

  it("refuses an amount with no currency, and a paid amount with no completion", async () => {
    await entity(WS, "ob-money-1", "obligation", "School fee");
    await expect(
      DB.prepare(
        `INSERT INTO obligation_details
           (workspace_id, entity_id, category, due_date, expected_amount_minor,
            series_id, sequence, created_at, updated_at)
         VALUES (?, 'ob-money-1', 'fee', '2026-12-01', 89000, 's4', 0, ?, ?)`,
      )
        .bind(WS, AT, AT)
        .run(),
    ).rejects.toThrow();

    await entity(WS, "ob-money-2", "obligation", "School fee");
    await expect(
      DB.prepare(
        `INSERT INTO obligation_details
           (workspace_id, entity_id, category, due_date, completed_amount_minor,
            currency_code, status, series_id, sequence, created_at, updated_at)
         VALUES (?, 'ob-money-2', 'fee', '2026-12-01', 89000, 'AUD', 'open',
                 's5', 0, ?, ?)`,
      )
        .bind(WS, AT, AT)
        .run(),
    ).rejects.toThrow();
  });

  it("accepts an expected amount with its currency, and no payment implied", async () => {
    await entity(WS, "ob-school-fee", "obligation", "Term 4 school fee");
    await DB.prepare(
      `INSERT INTO obligation_details
         (workspace_id, entity_id, category, due_date, expected_amount_minor,
          currency_code, series_id, sequence, created_at, updated_at)
       VALUES (?, 'ob-school-fee', 'fee', '2026-10-10', 89000, 'AUD', 's6', 0, ?, ?)`,
    )
      .bind(WS, AT, AT)
      .run();

    const row = await DB.prepare(
      `SELECT expected_amount_minor, completed_amount_minor, currency_code, status
         FROM obligation_details WHERE entity_id = 'ob-school-fee'`,
    ).first<Record<string, unknown>>();
    expect(row).toEqual({
      expected_amount_minor: 89000,
      completed_amount_minor: null,
      currency_code: "AUD",
      status: "open",
    });
  });

  it("still refuses a second successor at the same point in a series", async () => {
    await entity(WS, "ob-dup-a", "obligation", "First");
    await entity(WS, "ob-dup-b", "obligation", "Second");
    await DB.prepare(
      `INSERT INTO obligation_details
         (workspace_id, entity_id, category, due_date, series_id, sequence,
          created_at, updated_at)
       VALUES (?, 'ob-dup-a', 'reminder', '2026-12-01', 'series-dup', 1, ?, ?)`,
    )
      .bind(WS, AT, AT)
      .run();

    await expect(
      DB.prepare(
        `INSERT INTO obligation_details
           (workspace_id, entity_id, category, due_date, series_id, sequence,
            created_at, updated_at)
         VALUES (?, 'ob-dup-b', 'reminder', '2026-12-01', 'series-dup', 1, ?, ?)`,
      )
        .bind(WS, AT, AT)
        .run(),
    ).rejects.toThrow();
  });
});
