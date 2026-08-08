/**
 * X-02 — real Workers/D1 integration tests for the ONE saved-view table now
 * holding two KINDS.
 *
 * What matters here is that generalising TASKS-03's table did not cost anything:
 * an existing Tasks saved view still loads and still edits, the two kinds cannot
 * see each other, and workspace/owner isolation is still enforced in the SQL
 * rather than by a caller's discipline.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";

import {
  DEFAULT_TASK_VIEW_CONFIG,
  parseTaskViewConfig,
} from "~/kernel/task-views";
import {
  DEFAULT_CROSS_VIEW_CONFIG,
  MAX_SAVED_VIEWS_PER_KIND,
  SavedViewNameTakenError,
  SavedViewNotFoundError,
  SavedViewValidationError,
  parseCrossViewConfig,
  serialiseCrossViewConfig,
} from "~/kernel/views";

import {
  FakeClock,
  makeContext,
  makeCrossViewRepository,
  makeTaskViewRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "ws_cross_views";
const OTHER = "ws_cross_views_other";
const OWNER = "owner-a";
const OTHER_OWNER = "owner-b";

const nextId = sequentialIds("cv");

function crossRepo(ws: string) {
  return makeCrossViewRepository(makeContext(ws), {
    clock: new FakeClock("2026-08-08T00:00:00.000Z").now,
    idGenerator: nextId,
  });
}

function taskRepo(ws: string) {
  return makeTaskViewRepository(makeContext(ws), {
    clock: new FakeClock("2026-08-08T00:00:00.000Z").now,
    idGenerator: nextId,
  });
}

const crossConfig = parseCrossViewConfig({
  scopes: ["task", "project", "meeting"],
  shared: { areaId: "area-1", attention: true },
  modules: { task: { waiting: true }, project: { health: "at_risk" } },
  sort: "due",
  direction: "asc",
});

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

describe("cross-module saved views", () => {
  it("round-trips a complete cross-module configuration", async () => {
    const store = crossRepo(WS);
    const saved = await store.create(OWNER, {
      name: "Health this week",
      config: crossConfig,
    });
    expect(saved.kind).toBe("cross");

    const read = await store.get(OWNER, saved.id);
    expect(read).not.toBeNull();
    expect(serialiseCrossViewConfig(read!.config)).toBe(
      serialiseCrossViewConfig(crossConfig),
    );
  });

  it("stores only the CANONICAL configuration, never the raw client value", async () => {
    const store = crossRepo(WS);
    const saved = await store.create(OWNER, {
      name: "Sanitised",
      config: parseCrossViewConfig({
        scopes: ["task"],
        shared: { areaId: "area-1" },
        // Neither of these is a dimension, and neither may reach the column.
        modules: { task: { rawSql: "1=1 OR 1=1" } },
      }),
    });
    const row = await env.DB.prepare(
      "SELECT config, kind FROM task_saved_views WHERE workspace_id = ? AND id = ?",
    )
      .bind(WS, saved.id)
      .first<{ readonly config: string; readonly kind: string }>();
    expect(row?.kind).toBe("cross");
    expect(row?.config).not.toContain("rawSql");
    expect(row?.config).not.toContain("OR 1=1");
  });

  it("rejects a configuration that is not an object", async () => {
    const store = crossRepo(WS);
    await expect(
      store.create(OWNER, {
        name: "Broken",
        config: "everything" as unknown as typeof crossConfig,
      }),
    ).rejects.toBeInstanceOf(SavedViewValidationError);
  });

  it("reads a nonsense stored blob as the standard configuration, not a crash", async () => {
    const store = crossRepo(WS);
    const saved = await store.create(OWNER, {
      name: "Corrupt",
      config: crossConfig,
    });
    // The column's own `json_valid` CHECK already refuses malformed text, so the
    // reachable hazard is well-formed JSON that means nothing to this build.
    await env.DB.prepare(
      "UPDATE task_saved_views SET config = ? WHERE workspace_id = ? AND id = ?",
    )
      .bind(JSON.stringify(["not", "a", "config"]), WS, saved.id)
      .run();

    const read = await store.get(OWNER, saved.id);
    expect(read?.name).toBe("Corrupt");
    expect(serialiseCrossViewConfig(read!.config)).toBe(
      serialiseCrossViewConfig(DEFAULT_CROSS_VIEW_CONFIG),
    );
  });

  it("renames, duplicates and deletes idempotently", async () => {
    const store = crossRepo(WS);
    const saved = await store.create(OWNER, {
      name: "First",
      config: crossConfig,
    });

    const renamed = await store.update(OWNER, saved.id, { name: "Second" });
    expect(renamed.changed).toBe(true);
    expect(renamed.view.name).toBe("Second");

    const unchanged = await store.update(OWNER, saved.id, { name: "Second" });
    expect(unchanged.changed).toBe(false);

    const copy = await store.duplicate(OWNER, saved.id, "Second copy");
    expect(serialiseCrossViewConfig(copy.config)).toBe(
      serialiseCrossViewConfig(crossConfig),
    );

    expect(await store.remove(OWNER, saved.id)).toBe(true);
    expect(await store.remove(OWNER, saved.id)).toBe(false);
    await expect(
      store.update(OWNER, saved.id, { name: "Ghost" }),
    ).rejects.toBeInstanceOf(SavedViewNotFoundError);
  });

  it("refuses a duplicate name within the same kind", async () => {
    const store = crossRepo(WS);
    await store.create(OWNER, { name: "Attention", config: crossConfig });
    await expect(
      store.create(OWNER, { name: "attention", config: crossConfig }),
    ).rejects.toBeInstanceOf(SavedViewNameTakenError);
  });

  it("bounds how many views one owner can hold", async () => {
    const store = crossRepo(WS);
    for (let index = 0; index < MAX_SAVED_VIEWS_PER_KIND; index += 1) {
      await store.create(OWNER, { name: `View ${index}`, config: crossConfig });
    }
    await expect(
      store.create(OWNER, { name: "One too many", config: crossConfig }),
    ).rejects.toThrow(/up to 50 views/i);
  });
});

describe("the two kinds share a table without seeing each other", () => {
  it("lists only its own kind", async () => {
    const cross = crossRepo(WS);
    const tasks = taskRepo(WS);
    await tasks.create(OWNER, {
      name: "Task view",
      config: DEFAULT_TASK_VIEW_CONFIG,
    });
    await cross.create(OWNER, { name: "Cross view", config: crossConfig });

    expect((await tasks.list(OWNER)).map((view) => view.name)).toEqual([
      "Task view",
    ]);
    expect((await cross.list(OWNER)).map((view) => view.name)).toEqual([
      "Cross view",
    ]);
  });

  it("cannot read, update or delete the other kind's row by id", async () => {
    const cross = crossRepo(WS);
    const tasks = taskRepo(WS);
    const taskView = await tasks.create(OWNER, {
      name: "Only Tasks",
      config: DEFAULT_TASK_VIEW_CONFIG,
    });

    expect(await cross.get(OWNER, taskView.id)).toBeNull();
    await expect(
      cross.update(OWNER, taskView.id, { name: "Hijacked" }),
    ).rejects.toBeInstanceOf(SavedViewNotFoundError);
    expect(await cross.remove(OWNER, taskView.id)).toBe(false);

    // The Tasks view is untouched by the attempt.
    expect((await tasks.get(OWNER, taskView.id))?.name).toBe("Only Tasks");
  });

  it("allows the same NAME in each kind", async () => {
    const cross = crossRepo(WS);
    const tasks = taskRepo(WS);
    await tasks.create(OWNER, {
      name: "Focus",
      config: DEFAULT_TASK_VIEW_CONFIG,
    });
    await expect(
      cross.create(OWNER, { name: "Focus", config: crossConfig }),
    ).resolves.toMatchObject({ name: "Focus", kind: "cross" });
  });
});

describe("existing Tasks saved views survive the generalisation", () => {
  it("loads a row written BEFORE the kind column existed", async () => {
    // Exactly what migration 0022 wrote: no `kind` value at all, so the column
    // default has to be what classifies it.
    await env.DB.prepare(
      `INSERT INTO task_saved_views
         (workspace_id, id, owner_id, name, config_version, config, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        WS,
        "legacy-1",
        OWNER,
        "Legacy P1 work",
        1,
        JSON.stringify({
          version: 1,
          presentation: "list",
          systemView: "active",
          sort: "due_date",
          direction: "asc",
          groupBy: "parent",
          density: "comfortable",
          filters: { priority: "p1", dueState: "overdue" },
        }),
        "2026-07-25T00:00:00.000Z",
        "2026-07-25T00:00:00.000Z",
      )
      .run();

    const row = await env.DB.prepare(
      "SELECT kind FROM task_saved_views WHERE workspace_id = ? AND id = ?",
    )
      .bind(WS, "legacy-1")
      .first<{ readonly kind: string }>();
    expect(row?.kind).toBe("tasks");

    const tasks = taskRepo(WS);
    const loaded = await tasks.get(OWNER, "legacy-1");
    expect(loaded).not.toBeNull();
    expect(loaded!.name).toBe("Legacy P1 work");
    // The stored filters still produce the same query after the change.
    expect(loaded!.config.filters).toEqual({
      priority: "p1",
      dueState: "overdue",
    });
    expect(loaded!.config.sort).toBe("due_date");
    expect(loaded!.config.groupBy).toBe("parent");

    // And it is still editable in place.
    const updated = await tasks.update(OWNER, "legacy-1", {
      config: parseTaskViewConfig({
        ...loaded!.config,
        filters: { priority: "p2" },
      }),
    });
    expect(updated.changed).toBe(true);
    expect(updated.view.config.filters).toEqual({ priority: "p2" });
    expect((await tasks.list(OWNER)).map((view) => view.id)).toContain(
      "legacy-1",
    );
  });
});

describe("workspace and owner isolation", () => {
  it("never exposes another workspace's view through its id", async () => {
    const mine = crossRepo(WS);
    const theirs = crossRepo(OTHER);
    const saved = await theirs.create(OWNER, {
      name: "Theirs",
      config: crossConfig,
    });

    expect(await mine.get(OWNER, saved.id)).toBeNull();
    expect(await mine.list(OWNER)).toEqual([]);
    expect(await mine.remove(OWNER, saved.id)).toBe(false);
    await expect(
      mine.update(OWNER, saved.id, { name: "Stolen" }),
    ).rejects.toBeInstanceOf(SavedViewNotFoundError);
    // Untouched in its own workspace.
    expect((await theirs.get(OWNER, saved.id))?.name).toBe("Theirs");
  });

  it("never exposes another owner's view in the same workspace", async () => {
    const store = crossRepo(WS);
    const saved = await store.create(OTHER_OWNER, {
      name: "Not mine",
      config: crossConfig,
    });
    expect(await store.get(OWNER, saved.id)).toBeNull();
    expect(await store.list(OWNER)).toEqual([]);
  });
});
