import { describe, expect, it } from "vitest";

import { createModuleRegistry, defineModule } from "~/kernel/modules";
import { workspaceContextFromId } from "~/kernel/workspaces";

/**
 * Static declaration must be kept separate from runtime execution (ADR-013 §4.5,
 * §12, §13): constructing the registry must NOT load any route module, run any
 * command handler, or execute any search provider. These use plain counters to
 * prove it, and then prove the handlers DO run when explicitly invoked through
 * the runtime seam.
 */
describe("lazy behaviour", () => {
  it("stores routes as declarative data and never runs commands or searches during construction", () => {
    let commandRuns = 0;
    let searchRuns = 0;

    const registry = createModuleRegistry([
      defineModule({
        id: "notes",
        name: "Notes",
        routes: [
          {
            id: "notes.home",
            index: true,
            file: "routes/index.tsx",
          },
        ],
        commands: [
          {
            id: "notes.capture",
            title: "Capture",
            kind: "execute",
            run: () => {
              commandRuns += 1;
              return { ok: true };
            },
          },
        ],
        searchProviders: [
          {
            id: "notes.search",
            label: "Notes",
            search: async () => {
              searchRuns += 1;
              return [];
            },
          },
        ],
      }),
    ]);

    // Merely reading the registry never triggers runtime behaviour. Route
    // modules are referenced by a plain `file` string (ADR-016 §5.10), so there
    // is nothing to load — the reference is carried through as data and React
    // Router code-splits and loads it only when the route is matched.
    expect(registry.getRoute("notes.home")?.file).toBe("routes/index.tsx");
    registry.listRoutes();
    registry.listCommands();
    registry.getCommand("notes.capture");
    registry.listSearchProviders();
    registry.getSearchProvider("notes.search");
    registry.listModules();

    expect(commandRuns).toBe(0);
    expect(searchRuns).toBe(0);
  });

  it("runs a command handler only when explicitly invoked with a runtime context", async () => {
    let commandRuns = 0;
    let receivedWorkspace: string | null = null;

    const registry = createModuleRegistry([
      defineModule({
        id: "notes",
        name: "Notes",
        commands: [
          {
            id: "notes.capture",
            title: "Capture",
            kind: "execute",
            run: (context) => {
              commandRuns += 1;
              receivedWorkspace = context.workspace.workspaceId;
              return { ok: true };
            },
          },
        ],
      }),
    ]);

    const command = registry.getCommand("notes.capture");
    expect(command).not.toBeNull();
    expect(commandRuns).toBe(0);

    if (command?.kind === "execute") {
      await command.run({
        workspace: workspaceContextFromId("test-workspace"),
        signal: new AbortController().signal,
      });
    }
    expect(commandRuns).toBe(1);
    expect(receivedWorkspace).toBe("test-workspace");
  });

  it("executes a search provider only when explicitly invoked", async () => {
    let searchRuns = 0;
    const registry = createModuleRegistry([
      defineModule({
        id: "notes",
        name: "Notes",
        searchProviders: [
          {
            id: "notes.search",
            label: "Notes",
            search: async (query) => {
              searchRuns += 1;
              return [
                {
                  id: "n1",
                  title: `match for ${query.text}`,
                  target: { kind: "route", to: "/notes/n1" },
                },
              ];
            },
          },
        ],
      }),
    ]);

    const provider = registry.getSearchProvider("notes.search");
    expect(searchRuns).toBe(0);

    const results = await provider?.search(
      { text: "hello", limit: 10 },
      {
        workspace: workspaceContextFromId("test-workspace"),
        signal: new AbortController().signal,
      },
    );
    expect(searchRuns).toBe(1);
    expect(results?.[0]?.title).toBe("match for hello");
  });
});
