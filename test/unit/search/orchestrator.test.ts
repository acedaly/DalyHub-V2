import { describe, expect, it, vi } from "vitest";

import {
  createModuleRegistry,
  defineModule,
  parseModuleId,
  type ModuleRuntimeContext,
  type RegisteredSearchProvider,
  type SearchExecutor,
  type SearchResultItem,
} from "~/kernel/modules";
import { workspaceContextFromId } from "~/kernel/workspaces";
import { discoverModuleRegistry } from "~/modules/discover-modules";
import { executeSearch } from "~/shared/search/orchestrator";

const context: ModuleRuntimeContext = {
  workspace: workspaceContextFromId("orchestrator-test"),
};

function provider(
  moduleId: string,
  search: SearchExecutor,
  label = moduleId,
): RegisteredSearchProvider {
  return {
    id: `${moduleId}.search`,
    moduleId: parseModuleId(moduleId),
    label,
    search,
  };
}

function drawerItem(id: string, title: string): SearchResultItem {
  return {
    id,
    title,
    target: { kind: "drawer", drawerKey: `k:${id}`, canonicalPath: "/x" },
    entityType: "task",
  };
}

describe("executeSearch", () => {
  it("does not execute any provider for an empty/invalid query", async () => {
    const search = vi.fn<SearchExecutor>(async () => []);
    const outcome = await executeSearch({
      providers: [provider("a", search)],
      context,
      rawQuery: "   ",
    });
    expect(search).not.toHaveBeenCalled();
    expect(outcome.status).toBe("ok");
    expect(outcome.groups).toEqual([]);
  });

  it("executes multiple providers and groups their results", async () => {
    const outcome = await executeSearch({
      providers: [
        provider("tasks", async () => [drawerItem("t1", "Alpha task")]),
        provider("projects", async () => [
          {
            id: "p1",
            title: "Alpha project",
            entityType: "project",
            target: { kind: "route", to: "/projects/p1" },
          },
        ]),
      ],
      context,
      rawQuery: "alpha",
    });
    expect(outcome.status).toBe("ok");
    expect(outcome.totalCount).toBe(2);
    expect(outcome.groups.map((g) => g.id).sort()).toEqual([
      "entity:project",
      "entity:task",
    ]);
  });

  it("delivers the trusted workspace context to each provider and sends no workspace via the query", async () => {
    let seenWorkspace: string | undefined;
    let seenQueryKeys: string[] = [];
    const outcome = await executeSearch({
      providers: [
        provider("tasks", async (query, ctx) => {
          seenWorkspace = ctx.workspace.workspaceId;
          seenQueryKeys = Object.keys(query);
          return [drawerItem("t1", "Alpha")];
        }),
      ],
      context,
      // Even a hostile query string cannot smuggle a workspace id.
      rawQuery: "alpha workspace=evil",
    });
    expect(seenWorkspace).toBe("orchestrator-test");
    expect(seenQueryKeys.sort()).toEqual(["limit", "text"]);
    expect(outcome.totalCount).toBe(1);
  });

  it("isolates a failing provider (partial) and still shows healthy results", async () => {
    const outcome = await executeSearch({
      providers: [
        provider("tasks", async () => [drawerItem("t1", "Alpha")]),
        provider("broken", async () => {
          throw new Error("boom with secrets: SELECT * FROM tasks");
        }),
      ],
      context,
      rawQuery: "alpha",
    });
    expect(outcome.status).toBe("partial");
    expect(outcome.totalCount).toBe(1);
    // No raw error detail leaks — only ok flags.
    expect(outcome.providers).toEqual([
      { providerId: "tasks.search", moduleId: "tasks", ok: true },
      { providerId: "broken.search", moduleId: "broken", ok: false },
    ]);
    expect(JSON.stringify(outcome)).not.toContain("SELECT");
  });

  it("returns a safe error state when every provider fails", async () => {
    const outcome = await executeSearch({
      providers: [
        provider("a", async () => {
          throw new Error("down");
        }),
        provider("b", async () => {
          throw new Error("down");
        }),
      ],
      context,
      rawQuery: "alpha",
    });
    expect(outcome.status).toBe("error");
    expect(outcome.totalCount).toBe(0);
  });

  it("rejects invalid output, unsafe targets and deduplicates", async () => {
    const outcome = await executeSearch({
      providers: [
        provider("tasks", async () => [
          drawerItem("t1", "Alpha"),
          drawerItem("t1", "Alpha duplicate"), // duplicate id → dropped
          { id: "bad", title: "", target: { kind: "route", to: "/x" } }, // empty title
          {
            id: "unsafe",
            title: "Unsafe",
            target: { kind: "route", to: "javascript:alert(1)" },
          } as SearchResultItem, // unsafe target → dropped
        ]),
      ],
      context,
      rawQuery: "alpha",
    });
    expect(outcome.totalCount).toBe(1);
  });

  it("enforces the maximum providers and per-provider result limit", async () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      provider(`m${i}`, async () => [drawerItem(`i${i}`, `Alpha ${i}`)]),
    );
    const executed = new Set<string>();
    const withTracking = many.map((p) =>
      provider(p.moduleId, async (q, c) => {
        executed.add(p.moduleId);
        return (await p.search(q, c)) as SearchResultItem[];
      }),
    );
    const outcome = await executeSearch({
      providers: withTracking,
      context,
      rawQuery: "alpha",
      maxProviders: 5,
    });
    expect(executed.size).toBe(5);
    expect(outcome.providers).toHaveLength(5);
  });
});

describe("registry-driven provider discovery", () => {
  it("discovers providers from module manifests (no manual array)", () => {
    const registry = discoverModuleRegistry();
    const providers = registry.listSearchProviders();
    const today = providers.find((p) => p.id === "today.search");
    expect(today).toBeDefined();
    expect(today?.moduleId).toBe("today"); // ownership retained
  });

  it("returns providers in a deterministic order across repeated discovery", () => {
    const first = discoverModuleRegistry()
      .listSearchProviders()
      .map((p) => p.id);
    const second = discoverModuleRegistry()
      .listSearchProviders()
      .map((p) => p.id);
    expect(second).toEqual(first);
  });

  it("orders providers by module order/id (createModuleRegistry contract)", () => {
    const registry = createModuleRegistry([
      defineModule({
        id: "zebra",
        name: "Zebra",
        order: 10,
        searchProviders: [
          { id: "zebra.search", label: "Zebra", search: async () => [] },
        ],
      }),
      defineModule({
        id: "alpha",
        name: "Alpha",
        order: 1,
        searchProviders: [
          { id: "alpha.search", label: "Alpha", search: async () => [] },
        ],
      }),
    ]);
    expect(registry.listSearchProviders().map((p) => p.id)).toEqual([
      "alpha.search",
      "zebra.search",
    ]);
  });

  it("runs the discovered Today provider and opens results via Drawer targets", async () => {
    const registry = discoverModuleRegistry();
    const outcome = await executeSearch({
      providers: registry.listSearchProviders(),
      context,
      rawQuery: "PX-02",
    });
    const allResults = outcome.groups.flatMap((g) => g.results);
    expect(allResults.length).toBeGreaterThan(0);
    const finish = allResults.find((r) => r.title.includes("PX-02"));
    expect(finish?.target).toEqual({
      kind: "drawer",
      drawerKey: "task:t-px02",
      canonicalPath: "/today",
    });
    expect(finish?.moduleId).toBe("today");
  });
});

describe("executeSearch — provider deadlines and cancellation", () => {
  function drawer(id: string, title: string): SearchResultItem {
    return {
      id,
      title,
      target: { kind: "drawer", drawerKey: `k:${id}`, canonicalPath: "/x" },
      entityType: "task",
    };
  }

  it("bounds a hung provider by the deadline; healthy results still return (partial)", async () => {
    vi.useFakeTimers();
    try {
      const hung = provider("hung", () => new Promise<never>(() => {}));
      const healthy = provider("ok", async () => [drawer("t1", "Alpha")]);
      const promise = executeSearch({
        providers: [hung, healthy],
        context,
        rawQuery: "alpha",
        timeoutMs: 1000,
      });
      await vi.advanceTimersByTimeAsync(1000);
      const outcome = await promise;
      expect(outcome.status).toBe("partial");
      expect(outcome.totalCount).toBe(1);
      expect(outcome.providers.find((p) => p.moduleId === "hung")?.ok).toBe(
        false,
      );
      expect(outcome.providers.find((p) => p.moduleId === "ok")?.ok).toBe(true);
      // No internal detail leaks for the timed-out provider.
      expect(JSON.stringify(outcome)).not.toMatch(/timeout|abort/i);
    } finally {
      vi.useRealTimers();
    }
  });

  it("aborts the timed-out provider's signal", async () => {
    vi.useFakeTimers();
    try {
      let seen: AbortSignal | undefined;
      const hung = provider("hung", (_q, ctx) => {
        seen = ctx.signal;
        return new Promise<never>(() => {});
      });
      const promise = executeSearch({
        providers: [hung],
        context,
        rawQuery: "alpha",
        timeoutMs: 500,
      });
      await vi.advanceTimersByTimeAsync(500);
      await promise;
      expect(seen?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns a retryable error when every provider hangs", async () => {
    vi.useFakeTimers();
    try {
      const promise = executeSearch({
        providers: [
          provider("a", () => new Promise<never>(() => {})),
          provider("b", () => new Promise<never>(() => {})),
        ],
        context,
        rawQuery: "alpha",
        timeoutMs: 300,
      });
      await vi.advanceTimersByTimeAsync(300);
      const outcome = await promise;
      expect(outcome.status).toBe("error");
      expect(outcome.totalCount).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a provider resolving just before the deadline succeeds", async () => {
    vi.useFakeTimers();
    try {
      const slow = provider(
        "slow",
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve([drawer("s1", "Alpha")]), 400),
          ),
      );
      const promise = executeSearch({
        providers: [slow],
        context,
        rawQuery: "alpha",
        timeoutMs: 1000,
      });
      await vi.advanceTimersByTimeAsync(400);
      const outcome = await promise;
      expect(outcome.status).toBe("ok");
      expect(outcome.totalCount).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a provider resolving AFTER the deadline cannot mutate the completed outcome", async () => {
    vi.useFakeTimers();
    try {
      let release: (v: readonly SearchResultItem[]) => void = () => {};
      const late = provider(
        "late",
        () => new Promise<readonly SearchResultItem[]>((r) => (release = r)),
      );
      const healthy = provider("ok", async () => [drawer("t1", "Alpha")]);
      const promise = executeSearch({
        providers: [late, healthy],
        context,
        rawQuery: "alpha",
        timeoutMs: 200,
      });
      await vi.advanceTimersByTimeAsync(200);
      const outcome = await promise;
      expect(outcome.status).toBe("partial");
      expect(outcome.totalCount).toBe(1);
      // The abandoned provider resolves late — must be consumed with no effect.
      expect(() => release([drawer("late1", "Alpha late")])).not.toThrow();
      await vi.advanceTimersByTimeAsync(0);
      expect(outcome.totalCount).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a synchronous throw and a normal rejection isolated under the deadline", async () => {
    const outcome = await executeSearch({
      providers: [
        provider("sync", () => {
          throw new Error("sync boom");
        }),
        provider("reject", async () => {
          throw new Error("async boom");
        }),
        provider("ok", async () => [drawer("t1", "Alpha")]),
      ],
      context,
      rawQuery: "alpha",
      timeoutMs: 1000,
    });
    expect(outcome.status).toBe("partial");
    expect(outcome.totalCount).toBe(1);
  });

  it("delivers a cancellation signal to every provider and forwards outer abort", async () => {
    const outer = new AbortController();
    const signals: AbortSignal[] = [];
    const outcome = await executeSearch({
      providers: [
        provider("a", async (_q, ctx) => {
          signals.push(ctx.signal);
          return [drawer("a1", "Alpha")];
        }),
      ],
      context,
      rawQuery: "alpha",
      signal: outer.signal,
    });
    expect(signals[0]).toBeInstanceOf(AbortSignal);
    expect(outcome.status).toBe("ok");
  });
});
