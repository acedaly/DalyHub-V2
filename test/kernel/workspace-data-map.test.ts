/**
 * V2.16 CONSOL-02 — every persistent store is classified, against the REAL schema.
 *
 * The archive was complete on 2026-09-08 by INSPECTION. Nothing in the
 * repository checked that it was complete by CONSTRUCTION: `EXPORT_EXCLUSIONS`
 * named the omissions in prose, for a human, and a migration adding a table
 * holding owner data would have passed every check in the product while being
 * unable to leave it.
 *
 * This closes that. It reads the table list out of `sqlite_master` AFTER the
 * real committed migrations have been applied — not out of a fixture, not out of
 * a second list, and not by parsing the `.sql` files, because the question is
 * what the DATABASE holds — and asserts the classification in
 * `app/platform/storage/d1/workspace-data-map.ts` agrees with it in BOTH
 * directions.
 *
 * The claim it makes possible:
 *
 * > **There is no persistent owner-data table outside an explicit export
 * > policy.**
 *
 * It also proves the derived purge plan is a real order over the real foreign
 * keys, which is what CONSOL-01's operator procedure rests on.
 */

import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import {
  SNAPSHOT_COLLECTION_ORDER,
  RETIRED_SNAPSHOT_COLLECTIONS,
} from "~/kernel/export";
import { EXPORT_EXCLUSIONS } from "~/platform/export";
import {
  WORKSPACE_TABLES,
  workspacePurgeOrder,
  workspacePurgeStatements,
  workspaceTable,
  workspaceTablesOfClass,
} from "~/platform/storage/d1";

/**
 * Every table the migrated database actually holds.
 *
 * `sqlite_master` also lists SQLite's own internal tables and D1's migration
 * bookkeeping. Neither is DalyHub's schema, and neither is something a release
 * decides anything about, so both are excluded by NAME rather than by a pattern
 * that could quietly swallow a product table.
 */
async function liveTables(): Promise<readonly string[]> {
  const result = await env.DB.prepare(
    `SELECT name FROM sqlite_master
      WHERE type = 'table'
        AND name NOT LIKE 'sqlite_%'
        AND name NOT LIKE '_cf_%'
        AND name NOT IN ('d1_migrations')
      ORDER BY name`,
  ).all<{ name: string }>();
  return result.results.map((row) => row.name);
}

describe("V2.16 CONSOL-02 — every persistent store is classified", () => {
  it("classifies every table the migrated database holds", async () => {
    const live = await liveTables();
    const unclassified = live.filter(
      (name) => workspaceTable(name) === undefined,
    );
    expect(
      unclassified,
      "a migration added a table nothing has decided the meaning of. Add it to " +
        "app/platform/storage/d1/workspace-data-map.ts with a class and a reason: " +
        "`exported` (and its snapshot collection), `operational` (and what it " +
        "holds that must not leave), or `ephemeral` (and what operation it stages).",
    ).toEqual([]);
    // A real schema, not an empty one — the assertion above is only meaningful
    // if the migrations ran.
    expect(live.length).toBeGreaterThan(50);
  });

  it("classifies no table the database does not hold", async () => {
    const live = new Set(await liveTables());
    const phantom = WORKSPACE_TABLES.map((entry) => entry.table).filter(
      (name) => !live.has(name),
    );
    expect(
      phantom,
      "the map names a table the schema no longer has — a migration dropped or " +
        "renamed it and the map was not updated",
    ).toEqual([]);
  });

  it("classifies each table exactly once", () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const entry of WORKSPACE_TABLES) {
      if (seen.has(entry.table)) duplicates.push(entry.table);
      seen.add(entry.table);
    }
    expect(duplicates).toEqual([]);
  });

  it("gives every entry a reason", () => {
    // An exclusion without a reason is a silence with a list around it.
    for (const entry of WORKSPACE_TABLES) {
      expect(entry.reason.trim().length, entry.table).toBeGreaterThan(20);
    }
  });
});

describe("V2.16 CONSOL-02 — the exported class round-trips", () => {
  /** The three archive locations that are not paginated collections. */
  const ARCHIVE_SLOTS = new Set([
    "workspace",
    "owner.preferences",
    "owner.taskSavedViews",
  ]);

  it("names a real archive destination for every exported table", () => {
    const collections = new Set<string>(SNAPSHOT_COLLECTION_ORDER);
    for (const entry of workspaceTablesOfClass("exported")) {
      expect(
        entry.collection,
        `${entry.table} must name where it lands`,
      ).toBeDefined();
      const collection = entry.collection as string;
      expect(
        collections.has(collection) || ARCHIVE_SLOTS.has(collection),
        `${entry.table} claims archive slot "${collection}", which is neither a ` +
          "snapshot collection nor one of the three non-paginated slots",
      ).toBe(true);
    }
  });

  it("gives every LIVE snapshot collection a table", () => {
    /*
     * The other direction, and the one that catches a collection whose store
     * was quietly dropped. A RETIRED collection is exempt by construction: it
     * is never written, is still READ so an archive an owner already holds
     * still restores, and by definition has no table any more.
     */
    const retired = new Set<string>(RETIRED_SNAPSHOT_COLLECTIONS);
    const covered = new Set(
      workspaceTablesOfClass("exported").map((entry) => entry.collection),
    );
    const missing = SNAPSHOT_COLLECTION_ORDER.filter(
      (collection) => !retired.has(collection) && !covered.has(collection),
    );
    expect(
      missing,
      "a snapshot collection has no table behind it — either its store was " +
        "dropped without retiring the collection, or the map is stale",
    ).toEqual([]);
  });

  it("maps no two exported tables onto one collection", () => {
    const seen = new Map<string, string>();
    for (const entry of workspaceTablesOfClass("exported")) {
      const previous = seen.get(entry.collection as string);
      expect(
        previous,
        `${entry.table} and ${previous ?? ""} both claim ${entry.collection}`,
      ).toBeUndefined();
      seen.set(entry.collection as string, entry.table);
    }
  });

  it("holds every retired collection to its promise: never written, still read", () => {
    // `RETIRED_SNAPSHOT_COLLECTIONS` is a permanent statement about archives
    // already on disk. A retired collection having a table again would mean an
    // export is writing rows into a key the reader upgrades away.
    for (const collection of RETIRED_SNAPSHOT_COLLECTIONS) {
      const owner = workspaceTablesOfClass("exported").find(
        (entry) => entry.collection === collection,
      );
      expect(
        owner?.table,
        `${collection} is retired and must own no table`,
      ).toBeUndefined();
      expect(SNAPSHOT_COLLECTION_ORDER).toContain(collection);
    }
  });
});

describe("V2.16 CONSOL-02 — the excluded classes say what they are", () => {
  it("reflects every operational exclusion in the archive's own manifest", () => {
    /*
     * `EXPORT_EXCLUSIONS` is what an OWNER reads in the archive they downloaded;
     * this map is what a DEVELOPER reads. They are two audiences for one fact,
     * and this asserts the developer's list cannot grow a member the owner is
     * never told about.
     *
     * Matching is by SUBJECT rather than by table name — the owner's sentence
     * says "Notification settings", not `notification_settings` — so each
     * excluded table names the subject its sentence must mention.
     */
    const SUBJECTS: Readonly<Record<string, RegExp>> = {
      notification_settings: /notification settings/i,
      notifications: /notification ledger/i,
      notification_deliveries: /notification ledger/i,
      calendar_sources: /calendar sources/i,
      external_calendar_events: /calendar sources and the events/i,
      external_calendar_meeting_links: /calendar sources and the events/i,
      workspace_ai_preferences: /ai preferences/i,
      ai_usage_requests: /usage ledger|ai usage/i,
      capture_tokens: /credentials of any kind/i,
      capture_rate_windows:
        /credentials of any kind|application configuration/i,
      attachment_object_purges: /database internals|raw sql/i,
      offline_capture_receipts: /database internals|raw sql/i,
      offline_mutation_receipts: /database internals|raw sql/i,
    };
    const prose = EXPORT_EXCLUSIONS.join("\n");
    for (const entry of workspaceTablesOfClass("operational")) {
      const subject = SUBJECTS[entry.table];
      expect(
        subject,
        `${entry.table} is excluded but names no sentence in EXPORT_EXCLUSIONS`,
      ).toBeDefined();
      expect(prose, `${entry.table}`).toMatch(subject!);
    }
  });

  it("keeps the ephemeral class to genuine in-flight staging", () => {
    // The restore's two tables and nothing else. This class is the one that
    // could most easily be used to smuggle a store past the export policy —
    // "it's only staging" — so it is enumerated rather than described.
    expect(
      workspaceTablesOfClass("ephemeral")
        .map((entry) => entry.table)
        .sort(),
    ).toEqual([
      "workspace_restore_operations",
      "workspace_restore_staged_rows",
    ]);
  });

  it("leaves the ephemeral tables EMPTY when no restore is in flight", async () => {
    /*
     * The rule the class states, asserted rather than asserted-in-prose — but
     * only half of it, and the half that costs nothing: a FRESH database has no
     * operation because it has nothing at all.
     *
     * The half that matters is AFTER a restore, and it lives in the rehearsal,
     * which measures both tables once a real cutover has run through them:
     * `workspace_restore_staged_rows` must be back to zero (a cutover that
     * stopped clearing it would leave a complete second copy of the owner's
     * data in D1 — invisible to the archive, invisible to the manifest, and
     * growing by one whole workspace per restore), and
     * `workspace_restore_operations` must hold exactly one row in a terminal
     * status, because that row is the RECORD that a restore happened and its
     * apply token is spent.
     */
    for (const entry of workspaceTablesOfClass("ephemeral")) {
      const row = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM ${entry.table}`,
      ).first<{ n: number }>();
      expect(row?.n, entry.table).toBe(0);
    }
  });
});

describe("V2.16 CONSOL-02 — the purge plan is a real order over the real keys", () => {
  it("covers every table exactly once", () => {
    const order = workspacePurgeOrder();
    expect(order).toHaveLength(WORKSPACE_TABLES.length);
    expect(new Set(order.map((entry) => entry.table)).size).toBe(order.length);
  });

  it("puts every child strictly before its parent", () => {
    const order = workspacePurgeOrder();
    const position = new Map(order.map((entry, index) => [entry.table, index]));
    for (const entry of WORKSPACE_TABLES) {
      for (const parent of entry.references) {
        expect(
          position.get(entry.table)!,
          `${entry.table} must be deleted before ${parent}`,
        ).toBeLessThan(position.get(parent)!);
      }
    }
  });

  it("ends with the workspace row", () => {
    const order = workspacePurgeOrder();
    expect(order[order.length - 1]?.table).toBe("workspaces");
  });

  it("declares the foreign keys the database actually has", async () => {
    /*
     * The edges are what make the order correct, so they are checked against
     * `PRAGMA foreign_key_list` rather than trusted. A missing edge is the
     * dangerous direction — it would let the plan delete a parent first — so the
     * assertion is that every REAL key is declared. A declared edge the schema
     * does not have is merely conservative and is allowed.
     */
    for (const entry of WORKSPACE_TABLES) {
      const keys = await env.DB.prepare(
        `SELECT DISTINCT "table" AS parent FROM pragma_foreign_key_list(?)`,
      )
        .bind(entry.table)
        .all<{ parent: string }>();
      for (const key of keys.results) {
        expect(
          entry.references,
          `${entry.table} has a foreign key to ${key.parent} that the map does not declare`,
        ).toContain(key.parent);
      }
    }
  });

  it("names every foreign key that is NOT `ON DELETE RESTRICT`", async () => {
    /*
     * V2.16's independent review found three documents — this repository's
     * operator procedure, ADR-124 and the generator's own header — stating that
     * "every foreign key in DalyHub is ON DELETE RESTRICT" as the REASON the
     * purge order has to be generated. Ten are not, and nothing checked it,
     * because the query above reads a key's parent NAME and never its rule.
     *
     * The direction of the error is what makes it worth a test. A RESTRICT key
     * makes a wrong order FAIL, loudly, halfway through. A CASCADE key makes it
     * delete MORE than the statement names, quietly — so the cascading keys are
     * exactly the ones an operator running Procedure B by hand most needs the
     * order to be right about, and they were the ones nobody had enumerated.
     *
     * Every one of them today is a child row hanging off its own parent, so the
     * cascade only ever reaches rows the plan deletes in the same pass anyway.
     * A NEW one is not necessarily wrong — but it is a decision, and it lands
     * here, in a list, with somebody having looked at it.
     */
    const NOT_RESTRICT = new Map([
      // A tag assignment dies with the record it tagged. Deliberate at V2.6
      // FIND-02: an assignment has no meaning without its endpoint.
      ["entity_tags:entities", "CASCADE"],
      // A subscribed feed's events belong to the feed, not to the workspace's
      // own record set — dropping the source drops what it published.
      ["external_calendar_events:calendar_sources", "CASCADE"],
      // A Meeting's agenda lives inside the Meeting.
      ["meeting_items:meeting_details", "CASCADE"],
      ["meeting_item_tasks:meeting_details", "CASCADE"],
      // A Review's own machinery: sections, workflow position, step
      // acknowledgements and the persisted insight snapshot.
      ["review_sections:review_details", "CASCADE"],
      ["review_workflow_state:review_details", "CASCADE"],
      ["review_step_acknowledgements:review_details", "CASCADE"],
      ["review_insight_snapshots:review_details", "CASCADE"],
      // A delivery attempt is part of the notification it delivered.
      ["notification_deliveries:notifications", "CASCADE"],
      /*
       * The odd one, and the reason this assertion enumerates rules rather than
       * just cascades. `NO ACTION` is SQLite's default, not an opt-out: the
       * constraint is still enforced, merely at the end of the statement rather
       * than immediately. It behaves as RESTRICT does for this plan. It is
       * named here so a reader who greps for it finds an answer instead of a
       * gap, and so a future change of it to CASCADE is a visible edit.
       */
      ["obligation_details:entities", "NO ACTION"],
    ]);

    const found = new Map<string, string>();
    for (const entry of WORKSPACE_TABLES) {
      const keys = await env.DB.prepare(
        `SELECT "table" AS parent, "on_delete" AS rule FROM pragma_foreign_key_list(?)`,
      )
        .bind(entry.table)
        .all<{ parent: string; rule: string }>();
      for (const key of keys.results) {
        if (key.rule === "RESTRICT") continue;
        const edge = `${entry.table}:${key.parent}`;
        expect(
          NOT_RESTRICT.has(edge),
          `${edge} is ON DELETE ${key.rule} and is not one this repository has looked at`,
        ).toBe(true);
        expect(key.rule, edge).toBe(NOT_RESTRICT.get(edge));
        found.set(edge, key.rule);
      }
    }

    // Both directions: an edge that goes back to RESTRICT should leave the list
    // too, or the list becomes a record of what used to be true.
    expect([...found.keys()].sort()).toEqual([...NOT_RESTRICT.keys()].sort());
  });

  it("addresses every table by workspace, because every table is scoped", async () => {
    /*
     * The property the whole plan rests on, and it is a genuine one rather than
     * an aspiration: EVERY persistent table in DalyHub carries `workspace_id`
     * except `workspaces` itself, which carries `id`. That is what makes a
     * complete purge expressible as one statement per table.
     */
    for (const entry of WORKSPACE_TABLES) {
      const columns = await env.DB.prepare(
        `SELECT name FROM pragma_table_info(?)`,
      )
        .bind(entry.table)
        .all<{ name: string }>();
      const names = new Set(columns.results.map((row) => row.name));
      if (entry.scope === "root") {
        expect(names.has("id"), entry.table).toBe(true);
      } else {
        expect(names.has("workspace_id"), entry.table).toBe(true);
      }
      if (entry.scope === "workspace-and-owner") {
        expect(names.has("owner_id"), entry.table).toBe(true);
      }
    }
  });

  it("emits one reviewable, parameterised statement per table", () => {
    const statements = workspacePurgeStatements();
    expect(statements).toHaveLength(WORKSPACE_TABLES.length);
    for (const statement of statements) {
      // Parameterised, never interpolated: this plan is generated for a human to
      // run, and a generator that pastes an id into a string is one typo away
      // from a statement that means something else.
      expect(statement).toContain(":workspace_id");
      expect(statement.startsWith("DELETE FROM ")).toBe(true);
    }
    expect(statements[statements.length - 1]).toBe(
      "DELETE FROM workspaces WHERE id = :workspace_id;",
    );
  });
});
