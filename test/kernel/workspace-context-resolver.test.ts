import { beforeEach, describe, expect, it } from "vitest";

import {
  WorkspaceConfigurationError,
  WorkspaceNotFoundError,
  WorkspaceStorageError,
  WorkspaceValidationError,
  parseWorkspaceId,
  type WorkspaceRepository,
} from "~/kernel/workspaces";
import { createConfiguredWorkspaceContextResolver } from "~/platform/workspaces";
import { makeWorkspaceRepository, resetTables } from "./support";

describe("createConfiguredWorkspaceContextResolver", () => {
  let repository: WorkspaceRepository;

  beforeEach(async () => {
    await resetTables();
    repository = makeWorkspaceRepository();
  });

  it("resolves the configured workspace when it exists", async () => {
    const id = parseWorkspaceId("configured-scope");
    await repository.create({ id });

    const resolver = createConfiguredWorkspaceContextResolver({
      configuredWorkspaceId: "configured-scope",
      repository,
    });

    const context = await resolver.resolve();
    expect(context).toEqual({ workspaceId: "configured-scope" });
  });

  it("fails closed when configuration is missing (undefined)", async () => {
    const resolver = createConfiguredWorkspaceContextResolver({
      configuredWorkspaceId: undefined,
      repository,
    });
    await expect(resolver.resolve()).rejects.toThrow(
      WorkspaceConfigurationError,
    );
  });

  it("fails closed when configuration is blank/whitespace", async () => {
    const resolver = createConfiguredWorkspaceContextResolver({
      configuredWorkspaceId: "   ",
      repository,
    });
    await expect(resolver.resolve()).rejects.toThrow(
      WorkspaceConfigurationError,
    );
  });

  it("fails closed when configuration is structurally malformed (over-long)", async () => {
    // Workspace ids follow FND-02's rules (non-empty string ≤128 chars, no
    // charset restriction), so the structurally-invalid string case is an
    // over-long value.
    const resolver = createConfiguredWorkspaceContextResolver({
      configuredWorkspaceId: "a".repeat(129),
      repository,
    });
    await expect(resolver.resolve()).rejects.toThrow(WorkspaceValidationError);
  });

  it("fails closed when the configured workspace does not exist (no fallback)", async () => {
    // Another workspace exists, but NOT the configured one — must not fall back.
    await repository.create({ id: parseWorkspaceId("some-other-scope") });
    const resolver = createConfiguredWorkspaceContextResolver({
      configuredWorkspaceId: "ghost-scope",
      repository,
    });
    await expect(resolver.resolve()).rejects.toThrow(WorkspaceNotFoundError);
  });

  it("structurally cannot accept a request-derived value (resolve takes no args)", async () => {
    const id = parseWorkspaceId("only-configured");
    await repository.create({ id });
    const resolver = createConfiguredWorkspaceContextResolver({
      configuredWorkspaceId: "only-configured",
      repository,
    });

    // The resolver interface has no parameter for a request/header/etc. A caller
    // literally cannot pass one — resolve() has arity 0.
    expect(resolver.resolve.length).toBe(0);
    // Even attempting to force one in has no effect: the configured scope wins.
    const context = await (
      resolver.resolve as (x?: unknown) => Promise<{ workspaceId: string }>
    )({ workspaceId: "attacker-supplied" });
    expect(context.workspaceId).toBe("only-configured");
  });

  it("does not expose environment or database internals on failure", async () => {
    // A repository whose existence check fails with an internals-laden message.
    const leaky: WorkspaceRepository = {
      create() {
        throw new Error("should not be called");
      },
      getById() {
        throw new Error("should not be called");
      },
      exists() {
        throw new WorkspaceStorageError(undefined, {
          cause: new Error("/var/lib/d1/prod.sqlite: SQLITE_CANTOPEN"),
        });
      },
    };
    const resolver = createConfiguredWorkspaceContextResolver({
      configuredWorkspaceId: "valid-scope",
      repository: leaky,
    });

    let caught: unknown;
    try {
      await resolver.resolve();
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(WorkspaceStorageError);
    expect((caught as Error).message).not.toContain("prod.sqlite");
    expect((caught as Error).message).not.toContain("SQLITE");
  });
});
