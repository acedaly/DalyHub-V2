import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { EntityNotFoundError } from "~/kernel/entities";
import { WorkspaceNotFoundError, parseWorkspaceId } from "~/kernel/workspaces";
import {
  createWorkspaceContextResolver,
  resolveWorkspaceScope,
} from "~/platform/workspaces";
import { makeWorkspaceRepository, resetTables } from "./support";

// FND-03: the composition boundary wires environment → resolver → context →
// workspace-scoped entity repository. These tests drive that real flow end to
// end against D1.

describe("resolveWorkspaceScope (composition boundary)", () => {
  beforeEach(async () => {
    await resetTables();
  });

  it("resolves a scope and returns a working, correctly-bound entity repository", async () => {
    // Provision the configured workspace (as a real deployment would).
    const id = "test-default-workspace";
    await makeWorkspaceRepository().create({ id: parseWorkspaceId(id) });

    const { context, entities } = await resolveWorkspaceScope({
      DB: env.DB,
      DEFAULT_WORKSPACE_ID: id,
    });

    expect(context.workspaceId).toBe(id);

    // The entity repository is bound to the resolved workspace.
    const created = await entities.create({ type: "task", title: "scoped" });
    expect(created.workspaceId).toBe(id);
    expect((await entities.getById(created.id))?.title).toBe("scoped");
  });

  it("resolves and uses legacy FND-02 workspace id shapes end to end", async () => {
    // Ids valid under FND-02 (any non-empty string ≤128 chars) must migrate,
    // resolve through DEFAULT_WORKSPACE_ID, and drive the scoped repository.
    const repo = makeWorkspaceRepository();
    for (const legacy of [
      "personal.v1",
      "personal workspace",
      "personal/work",
    ]) {
      await repo.create({ id: parseWorkspaceId(legacy) });

      const { context, entities } = await resolveWorkspaceScope({
        DB: env.DB,
        DEFAULT_WORKSPACE_ID: legacy,
      });
      expect(context.workspaceId).toBe(legacy);

      const created = await entities.create({ type: "task", title: legacy });
      expect(created.workspaceId).toBe(legacy);
      const listed = await entities.list();
      expect(listed.items.map((e) => e.workspaceId)).toEqual([legacy]);
    }
  });

  it("fails closed when the configured workspace has not been provisioned", async () => {
    await expect(
      resolveWorkspaceScope({
        DB: env.DB,
        DEFAULT_WORKSPACE_ID: "never-provisioned",
      }),
    ).rejects.toThrow(WorkspaceNotFoundError);
  });

  it("two composed scopes cannot see each other's entities", async () => {
    const wsA = "compose-a";
    const wsB = "compose-b";
    const repo = makeWorkspaceRepository();
    await repo.create({ id: parseWorkspaceId(wsA) });
    await repo.create({ id: parseWorkspaceId(wsB) });

    const a = await resolveWorkspaceScope({
      DB: env.DB,
      DEFAULT_WORKSPACE_ID: wsA,
    });
    const b = await resolveWorkspaceScope({
      DB: env.DB,
      DEFAULT_WORKSPACE_ID: wsB,
    });

    const created = await a.entities.create({ type: "task", title: "a-only" });
    expect(await b.entities.getById(created.id)).toBeNull();
    await expect(b.entities.update(created.id, { title: "x" })).rejects.toThrow(
      EntityNotFoundError,
    );
  });

  it("exposes a resolver whose resolve() takes no request argument", async () => {
    const resolver = createWorkspaceContextResolver({
      DB: env.DB,
      DEFAULT_WORKSPACE_ID: "x",
    });
    expect(resolver.resolve.length).toBe(0);
  });
});
