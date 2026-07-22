import { beforeEach, describe, expect, it } from "vitest";

import { EntityLinkEndpointArchivedError } from "~/kernel/entity-links";

import {
  FakeClock,
  countActivitiesOfType,
  makeContext,
  makeLinkRepository,
  makeProjectSettingsRepository,
  makeSpineRepository,
  resetTables,
  sequentialIds,
} from "./support";

/** A promise a test can resolve on demand, to deterministically pause a
 * repository call at an injected race barrier. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

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
    const baseline = await countActivitiesOfType("entity_link.created");

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
    expect(await countActivitiesOfType("entity_link.created")).toBe(baseline);
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

describe("a concurrent archive() committing mid-mutation deterministically rejects create()/unlink()/restore", () => {
  // A test-only `raceBarrier` (awaited by the repository immediately AFTER its
  // own precondition reads but BEFORE the domain write) reproduces the EXACT
  // old vulnerable interleaving deterministically, rather than relying on
  // `Promise.allSettled` scheduling order: start the mutation, let it pause at
  // the barrier, commit a concurrent `archive()` and CONFIRM it committed,
  // THEN release the barrier so the paused write executes against the now-
  // archived state and observes the guard.

  it("archive() committing between the read and the write deterministically rejects create()", async () => {
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
    const svc = settings();
    const baseline = await countActivitiesOfType("entity_link.created");

    const gate = deferred();
    const barriered = makeLinkRepository(makeContext(WS), {
      clock: new FakeClock().now,
      idGenerator: sequentialIds("racelnk"),
      raceBarrier: () => gate.promise,
    });

    const createPromise = barriered.create({
      sourceEntityId: task.id,
      targetEntityId: other.id,
      type: "task.relates_to",
    });

    // The archive commits WHILE create() is paused at the barrier.
    const settled = await svc.archive(project.id);
    expect(settled.changed).toBe(true);

    // Release the paused write: it now executes against the archived state.
    gate.resolve();

    await expect(createPromise).rejects.toThrow(
      EntityLinkEndpointArchivedError,
    );

    const page = await barriered.listForEntity(task.id, {
      direction: "both",
      type: "task.relates_to",
    });
    expect(page.items).toHaveLength(0);
    expect(await countActivitiesOfType("entity_link.created")).toBe(baseline);
  });

  it("archive() committing between the read and the write deterministically rejects unlink()", async () => {
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
    // Set up the link with a plain (unbarriered) repository — only the
    // unlink() attempt under test should pause at the barrier.
    const setupLk = links("setuplnk");
    const { link } = await setupLk.create({
      sourceEntityId: task.id,
      targetEntityId: other.id,
      type: "task.relates_to",
    });
    await sp.complete(task.id);
    const svc = settings();
    const baseline = await countActivitiesOfType("entity_link.unlinked");

    const gate = deferred();
    const barriered = makeLinkRepository(makeContext(WS), {
      clock: new FakeClock().now,
      idGenerator: sequentialIds("raceunlnk"),
      raceBarrier: () => gate.promise,
    });

    const unlinkPromise = barriered.unlink(link.id);

    const settled = await svc.archive(project.id);
    expect(settled.changed).toBe(true);

    gate.resolve();

    await expect(unlinkPromise).rejects.toThrow(
      EntityLinkEndpointArchivedError,
    );

    const stillActive = await setupLk.getById(link.id);
    expect(stillActive?.deletedAt).toBeNull();
    expect(await countActivitiesOfType("entity_link.unlinked")).toBe(baseline);
  });

  it("archive() committing between the read and the write deterministically rejects a create()-triggered restore of a soft-deleted link", async () => {
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
    // Create then unlink (soft-delete) the exact relationship BEFORE archiving
    // is even possible, using a plain (unbarriered) repository.
    const setupLk = links("setuplnk2");
    const { link } = await setupLk.create({
      sourceEntityId: task.id,
      targetEntityId: other.id,
      type: "task.relates_to",
    });
    await setupLk.unlink(link.id);
    await sp.complete(task.id);
    const svc = settings();
    const baseline = await countActivitiesOfType("entity_link.restored");

    const gate = deferred();
    const barriered = makeLinkRepository(makeContext(WS), {
      clock: new FakeClock().now,
      idGenerator: sequentialIds("racerestore"),
      raceBarrier: () => gate.promise,
    });

    // `create()` on the SAME (source, target, type) reconciles by restoring
    // the existing soft-deleted row in place — exercising `#restoreWithActivity`.
    const recreatePromise = barriered.create({
      sourceEntityId: task.id,
      targetEntityId: other.id,
      type: "task.relates_to",
    });

    const settled = await svc.archive(project.id);
    expect(settled.changed).toBe(true);

    gate.resolve();

    await expect(recreatePromise).rejects.toThrow(
      EntityLinkEndpointArchivedError,
    );

    const stillDeleted = await setupLk.getById(link.id);
    expect(stillDeleted?.deletedAt).not.toBeNull();
    expect(await countActivitiesOfType("entity_link.restored")).toBe(baseline);
  });
});
