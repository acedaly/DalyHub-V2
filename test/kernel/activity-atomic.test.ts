import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import {
  ActivityPayloadError,
  buildActivityWriteModel,
} from "~/kernel/activity";
import {
  D1ActivityRecorder,
  recordAtomicMutation,
} from "~/platform/storage/d1";
import {
  countActivities,
  countActivitySubjects,
  countRows,
  ensureWorkspace,
  makeContext,
  makeLinkRepository,
  makeRepository,
  resetTables,
  seedEntity,
  sequentialIds,
} from "./support";

const WS = "ws_atomic";
const CTX = makeContext(WS);

/**
 * FND-05 atomic recording — proofs against REAL D1 that the mechanisms ADR-012
 * relies on behave as documented: `changes()` carries across statements within a
 * single `D1Database.batch()`, a RETURNING domain statement's `meta.changes` is
 * observable, and a failed statement rolls back the ENTIRE batch (so a failed
 * Activity append reverts the domain mutation).
 */
describe("FND-05 atomic recording mechanisms (real D1)", () => {
  beforeEach(async () => {
    await resetTables([WS]);
  });

  describe("changes() across a batched statement", () => {
    it("a guarded insert runs when the prior domain statement changed a row", async () => {
      await seedEntity(WS, "e1", { title: "before" });

      const update = env.DB.prepare(
        `UPDATE entities SET title = ?, updated_at = ?
         WHERE workspace_id = ? AND id = ? AND deleted_at IS NULL
         RETURNING id`,
      ).bind("after", "2026-07-18T00:00:01.000Z", WS, "e1");
      const guardedInsert = env.DB.prepare(
        `INSERT INTO activities
           (id, workspace_id, type, actor_type, actor_id, occurred_at, payload_json)
         SELECT ?, ?, ?, ?, ?, ?, ?
         WHERE changes() > 0`,
      ).bind(
        "act_1",
        WS,
        "entity.updated",
        "system",
        null,
        "2026-07-18T00:00:01.000Z",
        "{}",
      );

      const results = await env.DB.batch([update, guardedInsert]);
      expect(results[0]!.meta.changes).toBe(1);
      expect(await countActivities()).toBe(1);
    });

    it("a guarded insert is skipped when the prior domain statement changed nothing", async () => {
      await seedEntity(WS, "e1");

      // A domain UPDATE whose WHERE matches no row (wrong id) changes 0 rows.
      const noopUpdate = env.DB.prepare(
        `UPDATE entities SET title = ?, updated_at = ?
         WHERE workspace_id = ? AND id = ? AND deleted_at IS NULL
         RETURNING id`,
      ).bind("x", "2026-07-18T00:00:01.000Z", WS, "does-not-exist");
      const guardedInsert = env.DB.prepare(
        `INSERT INTO activities
           (id, workspace_id, type, actor_type, actor_id, occurred_at, payload_json)
         SELECT ?, ?, ?, ?, ?, ?, ?
         WHERE changes() > 0`,
      ).bind(
        "act_1",
        WS,
        "entity.updated",
        "system",
        null,
        "2026-07-18T00:00:01.000Z",
        "{}",
      );

      const results = await env.DB.batch([noopUpdate, guardedInsert]);
      expect(results[0]!.meta.changes).toBe(0);
      expect(await countActivities()).toBe(0);
    });

    it("a failing statement rolls back the entire batch (no partial writes)", async () => {
      await seedEntity(WS, "e1", { title: "before" });

      const update = env.DB.prepare(
        `UPDATE entities SET title = ?, updated_at = ?
         WHERE workspace_id = ? AND id = ?
         RETURNING id`,
      ).bind("after", "2026-07-18T00:00:01.000Z", WS, "e1");
      const insert = env.DB.prepare(
        `INSERT INTO activities
           (id, workspace_id, type, actor_type, actor_id, occurred_at, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        "act_1",
        WS,
        "entity.updated",
        "system",
        null,
        "2026-07-18T00:00:01.000Z",
        "{}",
      );
      const failing = env.DB.prepare("SELECT 1 FROM __missing_table__");

      await expect(
        env.DB.batch([update, insert, failing]),
      ).rejects.toBeTruthy();

      // The domain UPDATE was rolled back: the title is unchanged and no event
      // was written.
      const row = await env.DB.prepare(
        "SELECT title FROM entities WHERE workspace_id = ? AND id = ?",
      )
        .bind(WS, "e1")
        .first<{ title: string }>();
      expect(row?.title).toBe("before");
      expect(await countActivities()).toBe(0);
    });
  });

  describe("entity create records atomically", () => {
    it("appends exactly one entity.created event with a subject", async () => {
      const entities = makeRepository(CTX, {
        idGenerator: sequentialIds("e"),
        activityIdGenerator: sequentialIds("act"),
      });
      const created = await entities.create({ type: "task", title: "Do it" });

      expect(await countRows()).toBe(1);
      expect(await countActivities()).toBe(1);
      expect(await countActivitySubjects()).toBe(1);

      const activity = await env.DB.prepare(
        "SELECT * FROM activities LIMIT 1",
      ).first<Record<string, unknown>>();
      expect(activity?.type).toBe("entity.created");
      expect(activity?.actor_type).toBe("system");
      expect(activity?.actor_id).toBeNull();
      expect(activity?.occurred_at).toBe(created.createdAt.toISOString());

      const subject = await env.DB.prepare(
        "SELECT * FROM activity_subjects LIMIT 1",
      ).first<Record<string, unknown>>();
      expect(subject?.entity_id).toBe(created.id);
      expect(subject?.role).toBe("subject");
    });
  });

  describe("rollback: a forced Activity-append failure reverts the domain mutation", () => {
    it("entity create is rolled back when the append fails", async () => {
      const entities = makeRepository(CTX, {
        idGenerator: sequentialIds("e"),
        activityFault: "after-activity",
      });
      await expect(
        entities.create({ type: "task", title: "Nope" }),
      ).rejects.toBeTruthy();

      expect(await countRows()).toBe(0);
      expect(await countActivities()).toBe(0);
      expect(await countActivitySubjects()).toBe(0);
    });

    it("entity soft-delete is rolled back when the append fails", async () => {
      const entities = makeRepository(CTX, {
        idGenerator: sequentialIds("e"),
      });
      const created = await entities.create({ type: "task", title: "Keep" });

      const faulty = makeRepository(CTX, { activityFault: "after-activity" });
      await expect(faulty.softDelete(created.id)).rejects.toBeTruthy();

      // Still live; only the create event exists.
      const still = await entities.getById(created.id);
      expect(still?.deletedAt).toBeNull();
      expect(await countActivities()).toBe(1);
    });

    it("a duplicate Activity id makes the append fail and rolls back the create", async () => {
      // Force a constant Activity id so the second create's event insert violates
      // the activities primary key — proving the domain insert is rolled back.
      const entities = makeRepository(CTX, {
        idGenerator: sequentialIds("e"),
        activityIdGenerator: () => "dup_activity_id",
      });
      await entities.create({ type: "task", title: "First" });
      await expect(
        entities.create({ type: "task", title: "Second" }),
      ).rejects.toBeTruthy();

      expect(await countRows()).toBe(1);
      expect(await countActivities()).toBe(1);
    });

    it("entity update is rolled back when the append fails", async () => {
      const entities = makeRepository(CTX, { idGenerator: sequentialIds("e") });
      const created = await entities.create({
        type: "task",
        title: "Original",
      });

      const faulty = makeRepository(CTX, { activityFault: "after-activity" });
      await expect(
        faulty.update(created.id, { title: "Changed" }),
      ).rejects.toBeTruthy();

      const still = await entities.getById(created.id);
      expect(still?.title).toBe("Original"); // update rolled back
      expect(await countActivities()).toBe(1); // only the create event
    });

    it("an entity mutation is rolled back when the subject insert fails", async () => {
      const entities = makeRepository(CTX, { idGenerator: sequentialIds("e") });
      await expect(
        makeRepository(CTX, { activityFault: "after-first-subject" }).create({
          type: "task",
          title: "Nope",
        }),
      ).rejects.toBeTruthy();
      expect(await countRows()).toBe(0);
      expect(await countActivities()).toBe(0);
      expect(await countActivitySubjects()).toBe(0);
      expect(entities).toBeTruthy();
    });

    it("payload validation fails BEFORE the mutation runs, so nothing is written", async () => {
      await seedEntity(WS, "e1", { title: "before" });
      const recorder = new D1ActivityRecorder(env.DB);
      // Structurally valid, but its encoded size exceeds the byte limit — this is
      // caught while building the append statements, before the batch runs.
      const model = buildActivityWriteModel(
        {
          type: "entity.updated",
          subjects: [{ entityId: "e1", role: "subject" }],
          payload: { blob: "x".repeat(9000) },
        },
        { type: "system", id: null },
        "act_oversize",
        new Date("2026-07-18T00:00:01.000Z"),
      );
      const domainStatement = env.DB.prepare(
        `UPDATE entities SET title = ?, updated_at = ?
         WHERE workspace_id = ? AND id = ? AND deleted_at IS NULL
         RETURNING id`,
      ).bind("after", "2026-07-18T00:00:01.000Z", WS, "e1");

      await expect(
        recordAtomicMutation({
          db: env.DB,
          workspaceId: WS,
          domainStatement,
          recorder,
          model,
        }),
      ).rejects.toBeInstanceOf(ActivityPayloadError);

      const row = await env.DB.prepare(
        "SELECT title FROM entities WHERE workspace_id = ? AND id = ?",
      )
        .bind(WS, "e1")
        .first<{ title: string }>();
      expect(row?.title).toBe("before"); // domain statement never ran
      expect(await countActivities()).toBe(0);
    });

    it("a subject-stage failure rolls back an entity link creation and its event", async () => {
      const entities = makeRepository(CTX, { idGenerator: sequentialIds("e") });
      const a = await entities.create({ type: "meeting", title: "A" });
      const b = await entities.create({ type: "task", title: "B" });
      const activitiesBefore = await countActivities();

      const links = makeLinkRepository(CTX, {
        idGenerator: sequentialIds("lnk"),
        activityFault: "after-first-subject",
      });
      await expect(
        links.create({
          sourceEntityId: a.id,
          targetEntityId: b.id,
          type: "meeting.produced_task",
        }),
      ).rejects.toBeTruthy();

      // No link row, and no new activity/subjects survived the rollback.
      const linkRows = await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM entity_links",
      ).first<{ n: number }>();
      expect(linkRows?.n).toBe(0);
      expect(await countActivities()).toBe(activitiesBefore);
    });
  });

  describe("no-op lifecycle calls append nothing", () => {
    it("repeated soft-delete/restore adds no further events", async () => {
      const entities = makeRepository(CTX, {
        idGenerator: sequentialIds("e"),
        activityIdGenerator: sequentialIds("act"),
      });
      const created = await entities.create({ type: "task", title: "T" });
      await entities.softDelete(created.id); // one entity.deleted
      const afterDelete = await countActivities();

      const repeat = await entities.softDelete(created.id);
      expect(repeat.outcome).toBe("already_deleted");
      expect(repeat.changed).toBe(false);
      expect(await countActivities()).toBe(afterDelete);

      await entities.restore(created.id); // one entity.restored
      const afterRestore = await countActivities();
      const repeatRestore = await entities.restore(created.id);
      expect(repeatRestore.outcome).toBe("already_active");
      expect(await countActivities()).toBe(afterRestore);

      // create + deleted + restored = 3 total.
      expect(afterRestore).toBe(3);
    });
  });

  describe("cross-workspace mutations record nothing in another workspace", () => {
    it("a failed cross-workspace update appends no event", async () => {
      const other = "ws_other";
      await ensureWorkspace(other);
      await seedEntity(other, "foreign");

      const entities = makeRepository(CTX, {
        activityIdGenerator: sequentialIds("act"),
      });
      // The entity lives in `other`, not the bound workspace — update fails.
      await expect(
        entities.update("foreign", { title: "x" }),
      ).rejects.toThrow();
      expect(await countActivities()).toBe(0);
    });
  });
});
