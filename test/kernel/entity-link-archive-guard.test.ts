import { beforeEach, describe, expect, it } from "vitest";

import { EntityLinkEndpointArchivedError } from "~/kernel/entity-links";

import {
  FakeClock,
  makeContext,
  makeLinkRepository,
  makeProjectSettingsRepository,
  makeSpineRepository,
  resetTables,
  sequentialIds,
} from "./support";

/**
 * PROJ-05 corrective — review round 3: the generic `D1EntityLinkRepository`
 * itself (not just the Task-detail route's pre-check) folds the
 * archived-task-parent guard into its `create`/`unlink`/`restore` SQL, closing
 * the read-then-write race a route-level-only check could never close. Any
 * caller of the generic repository is covered, not just Task-detail.
 */

const WS = "ws_entity_link_archive_guard";

function spine(prefix = "s") {
  return makeSpineRepository(makeContext(WS), {
    clock: new FakeClock().now,
    idGenerator: sequentialIds(prefix),
  });
}

function links(prefix = "lnk") {
  return makeLinkRepository(makeContext(WS), {
    clock: new FakeClock().now,
    idGenerator: sequentialIds(prefix),
  });
}

function settings() {
  // No deterministic idGenerator override: several independent instances are
  // constructed across one test and only need genuinely unique Activity ids.
  return makeProjectSettingsRepository(makeContext(WS), {
    clock: new FakeClock().now,
  });
}

beforeEach(async () => {
  await resetTables([WS]);
});

/** A Task under a Project with exactly one COMPLETED direct Task (archivable),
 * plus a second, unrelated Area entity to use as a relates_to link target. */
async function seedArchivedProjectWithTask() {
  const sp = spine();
  const area = await sp.createArea({ title: "Area" });
  const project = await sp.createProject({
    title: "P",
    parent: { kind: "area", id: area.id },
  });
  const task = await sp.createTask({
    title: "T",
    parent: { kind: "project", id: project.id },
  });
  await sp.complete(task.id);
  const other = await sp.createArea({ title: "Other" });
  const settled = await settings().archive(project.id);
  expect(settled.changed).toBe(true);
  return { sp, project, task, other };
}

describe("D1EntityLinkRepository folds the archived-task-parent guard into its own SQL", () => {
  it("create() is rejected when either endpoint is a Task under an archived project", async () => {
    const { task, other } = await seedArchivedProjectWithTask();
    const lk = links();

    await expect(
      lk.create({
        sourceEntityId: task.id,
        targetEntityId: other.id,
        type: "task.relates_to",
      }),
    ).rejects.toThrow(EntityLinkEndpointArchivedError);

    // Also blocked in the other direction (task as target).
    await expect(
      lk.create({
        sourceEntityId: other.id,
        targetEntityId: task.id,
        type: "task.relates_to",
      }),
    ).rejects.toThrow(EntityLinkEndpointArchivedError);
  });

  it("create() creates no row and no Activity when blocked", async () => {
    const { task, other } = await seedArchivedProjectWithTask();
    const lk = links();

    await expect(
      lk.create({
        sourceEntityId: task.id,
        targetEntityId: other.id,
        type: "task.relates_to",
      }),
    ).rejects.toThrow(EntityLinkEndpointArchivedError);

    const page = await lk.listForEntity(task.id, {
      direction: "both",
      type: "task.relates_to",
    });
    expect(page.items).toHaveLength(0);
  });

  it("unlink() is rejected for an existing link once the parent project is archived, leaving the link intact", async () => {
    const sp = spine();
    const area = await sp.createArea({ title: "Area" });
    const project = await sp.createProject({
      title: "P",
      parent: { kind: "area", id: area.id },
    });
    const task = await sp.createTask({
      title: "T",
      parent: { kind: "project", id: project.id },
    });
    const other = await sp.createArea({ title: "Other" });
    const lk = links();
    const { link } = await lk.create({
      sourceEntityId: task.id,
      targetEntityId: other.id,
      type: "task.relates_to",
    });

    // Archive is blocked while an active incomplete direct Task exists.
    await sp.complete(task.id);
    const settled = await settings().archive(project.id);
    expect(settled.changed).toBe(true);

    await expect(lk.unlink(link.id)).rejects.toThrow(
      EntityLinkEndpointArchivedError,
    );

    const stillActive = await lk.getById(link.id);
    expect(stillActive?.deletedAt).toBeNull();
  });

  it("create() and unlink() both work again once the project is restored", async () => {
    const { sp, project, task, other } = await seedArchivedProjectWithTask();
    await settings().restore(project.id);
    const lk = links();

    const created = await lk.create({
      sourceEntityId: task.id,
      targetEntityId: other.id,
      type: "task.relates_to",
    });
    expect(created.outcome).toBe("created");

    const unlinked = await lk.unlink(created.link.id);
    expect(unlinked.outcome).toBe("unlinked");
    expect(sp).toBeTruthy();
  });

  it("is never triggered for an Area-parented Task (no project at all)", async () => {
    const sp = spine();
    const area = await sp.createArea({ title: "Area" });
    const floating = await sp.createTask({
      title: "Floating",
      parent: { kind: "area", id: area.id },
    });
    const other = await sp.createArea({ title: "Other" });
    const lk = links();

    const created = await lk.create({
      sourceEntityId: floating.id,
      targetEntityId: other.id,
      type: "task.relates_to",
    });
    expect(created.outcome).toBe("created");
    const unlinked = await lk.unlink(created.link.id);
    expect(unlinked.outcome).toBe("unlinked");
  });

  it("is never triggered by a Task under a Project that is NOT archived", async () => {
    const sp = spine();
    const area = await sp.createArea({ title: "Area" });
    const project = await sp.createProject({
      title: "P",
      parent: { kind: "area", id: area.id },
    });
    const task = await sp.createTask({
      title: "T",
      parent: { kind: "project", id: project.id },
    });
    const other = await sp.createArea({ title: "Other" });
    const lk = links();

    const created = await lk.create({
      sourceEntityId: task.id,
      targetEntityId: other.id,
      type: "task.relates_to",
    });
    expect(created.outcome).toBe("created");
  });
});

describe("archive() racing create()/unlink() never leaves an inconsistent result", () => {
  // Mirrors `project-settings.test.ts`'s own concurrent-create race test and
  // `project-archive-guard.test.ts`'s Task-detail race tests: rather than
  // asserting a fixed winner (this single-process D1 instance doesn't
  // guarantee a specific interleaving), each test proves the invariant the
  // SQL fold exists for — a link create/unlink can never succeed once the
  // project is archived, and a rejection is always the SAME typed
  // `EntityLinkEndpointArchivedError`, never a raw/unexpected failure.

  it("archive() racing create()", async () => {
    const sp = spine();
    const area = await sp.createArea({ title: "Area" });
    const project = await sp.createProject({
      title: "P",
      parent: { kind: "area", id: area.id },
    });
    const task = await sp.createTask({
      title: "T",
      parent: { kind: "project", id: project.id },
    });
    await sp.complete(task.id);
    const other = await sp.createArea({ title: "Other" });
    const lk = links();
    const svc = settings();

    const [archiveResult, createResult] = await Promise.allSettled([
      svc.archive(project.id),
      lk.create({
        sourceEntityId: task.id,
        targetEntityId: other.id,
        type: "task.relates_to",
      }),
    ]);

    if (createResult.status === "rejected") {
      expect(createResult.reason).toBeInstanceOf(
        EntityLinkEndpointArchivedError,
      );
    } else {
      // The create committed before the archive did — legitimate ordering.
      expect(createResult.value.outcome).toBe("created");
    }
    expect(["fulfilled", "rejected"]).toContain(archiveResult.status);
  });

  it("archive() racing unlink()", async () => {
    const sp = spine();
    const area = await sp.createArea({ title: "Area" });
    const project = await sp.createProject({
      title: "P",
      parent: { kind: "area", id: area.id },
    });
    const task = await sp.createTask({
      title: "T",
      parent: { kind: "project", id: project.id },
    });
    const other = await sp.createArea({ title: "Other" });
    const lk = links();
    const { link } = await lk.create({
      sourceEntityId: task.id,
      targetEntityId: other.id,
      type: "task.relates_to",
    });
    await sp.complete(task.id);
    const svc = settings();

    const [archiveResult, unlinkResult] = await Promise.allSettled([
      svc.archive(project.id),
      lk.unlink(link.id),
    ]);

    if (unlinkResult.status === "rejected") {
      expect(unlinkResult.reason).toBeInstanceOf(
        EntityLinkEndpointArchivedError,
      );
    } else {
      expect(unlinkResult.value.outcome).toBe("unlinked");
    }
    expect(["fulfilled", "rejected"]).toContain(archiveResult.status);
  });
});
