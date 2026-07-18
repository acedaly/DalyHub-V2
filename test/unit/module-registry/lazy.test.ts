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
  it("does not load route modules, run commands or execute searches during construction", () => {
    let routeLoads = 0;
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
            lazy: () => {
              routeLoads += 1;
              return Promise.resolve({ default: () => null });
            },
          },
        ],
        commands: [
          {
            id: "notes.capture",
            title: "Capture",
            run: () => {
              commandRuns += 1;
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

    // Merely reading the registry never triggers runtime behaviour.
    registry.listRoutes();
    registry.getRoute("notes.home");
    registry.listCommands();
    registry.getCommand("notes.capture");
    registry.listSearchProviders();
    registry.getSearchProvider("notes.search");
    registry.listModules();

    expect(routeLoads).toBe(0);
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
            run: (context) => {
              commandRuns += 1;
              receivedWorkspace = context.workspace.workspaceId;
            },
          },
        ],
      }),
    ]);

    const command = registry.getCommand("notes.capture");
    expect(command).not.toBeNull();
    expect(commandRuns).toBe(0);

    await command?.run({ workspace: workspaceContextFromId("test-workspace") });
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
                  navigateTo: "/notes/n1",
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
      { workspace: workspaceContextFromId("test-workspace") },
    );
    expect(searchRuns).toBe(1);
    expect(results?.[0]?.title).toBe("match for hello");
  });
});
