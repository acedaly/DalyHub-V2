import { describe, expect, it } from "vitest";

import {
  createModuleRegistry,
  defineModule,
  ModuleDefinitionError,
  isSafeInAppPath,
  validateNavigationTarget,
} from "~/kernel/modules";
import { buildCommandCatalogue } from "~/platform/commands";

/**
 * DS-09 — the refined FND-06 command contract (ADR-024). A command is a
 * discriminated union: a navigation command carries a validated target and no
 * handler; an executable command carries a handler and no target. Both/neither is
 * rejected, reserved global shortcuts are refused, and the serialised catalogue
 * never carries a handler.
 */

describe("DS-09 command contract validation", () => {
  it("accepts a navigation command with a validated target", () => {
    const registry = createModuleRegistry([
      defineModule({
        id: "today",
        name: "Today",
        commands: [
          {
            id: "today.open",
            title: "Go to Today",
            kind: "navigate",
            target: { kind: "route", to: "/today" },
          },
        ],
      }),
    ]);
    const command = registry.getCommand("today.open");
    expect(command?.kind).toBe("navigate");
    expect(command?.kind === "navigate" && command.target).toEqual({
      kind: "route",
      to: "/today",
    });
  });

  it("accepts an executable command with a handler", () => {
    const registry = createModuleRegistry([
      defineModule({
        id: "demo",
        name: "Demo",
        commands: [
          {
            id: "demo.run",
            title: "Run",
            kind: "execute",
            run: () => ({ ok: true }),
          },
        ],
      }),
    ]);
    expect(registry.getCommand("demo.run")?.kind).toBe("execute");
  });

  it("rejects a command that is BOTH navigation and executable", () => {
    expect(() =>
      createModuleRegistry([
        defineModule({
          id: "demo",
          name: "Demo",
          commands: [
            {
              id: "demo.x",
              title: "X",
              kind: "navigate",
              target: { kind: "route", to: "/x" },
              // @ts-expect-error a navigation command must not declare `run`
              run: () => ({ ok: true }),
            },
          ],
        }),
      ]),
    ).toThrow(ModuleDefinitionError);
  });

  it("rejects a command that is NEITHER navigation nor executable", () => {
    expect(() =>
      createModuleRegistry([
        defineModule({
          id: "demo",
          name: "Demo",
          // @ts-expect-error a command must declare a kind
          commands: [{ id: "demo.x", title: "X" }],
        }),
      ]),
    ).toThrow(ModuleDefinitionError);
  });

  it("rejects a navigation command with an unsafe target", () => {
    expect(() =>
      createModuleRegistry([
        defineModule({
          id: "demo",
          name: "Demo",
          commands: [
            {
              id: "demo.x",
              title: "X",
              kind: "navigate",
              target: { kind: "route", to: "https://evil.example" },
            },
          ],
        }),
      ]),
    ).toThrow(ModuleDefinitionError);
  });

  it("refuses a command that reassigns a reserved global shortcut (Mod+K, /) or a platform alias", () => {
    for (const shortcut of [
      { key: "k", modifiers: ["mod"] as const },
      { key: "/" },
      // Platform aliases of Mod+K: Meta+K (macOS) and Ctrl+K (elsewhere) resolve to
      // the same key event as the reserved binding and must also be refused.
      { key: "k", modifiers: ["meta"] as const },
      { key: "k", modifiers: ["ctrl"] as const },
      // Case-insensitive on the key.
      { key: "K", modifiers: ["meta"] as const },
    ]) {
      expect(() =>
        createModuleRegistry([
          defineModule({
            id: "demo",
            name: "Demo",
            commands: [
              {
                id: "demo.x",
                title: "X",
                shortcut,
                kind: "execute",
                run: () => ({ ok: true }),
              },
            ],
          }),
        ]),
      ).toThrow(ModuleDefinitionError);
    }
  });

  it("still allows a distinct combination that is not a reserved alias (Mod+Shift+K)", () => {
    expect(() =>
      createModuleRegistry([
        defineModule({
          id: "demo",
          name: "Demo",
          commands: [
            {
              id: "demo.x",
              title: "X",
              // Shift added → not an alias of the reserved Mod+K.
              shortcut: { key: "k", modifiers: ["mod", "shift"] },
              kind: "execute",
              run: () => ({ ok: true }),
            },
          ],
        }),
      ]),
    ).not.toThrow();
  });

  it("omits the handler from the serialised catalogue", () => {
    const registry = createModuleRegistry([
      defineModule({
        id: "demo",
        name: "Demo",
        commands: [
          {
            id: "demo.run",
            title: "Run",
            kind: "execute",
            run: () => ({ ok: true }),
          },
          {
            id: "demo.go",
            title: "Go",
            kind: "navigate",
            target: { kind: "route", to: "/demo" },
          },
        ],
      }),
    ]);
    const catalogue = buildCommandCatalogue(registry);
    expect(JSON.stringify(catalogue)).not.toMatch(/"run"/);
    for (const entry of catalogue.commands) {
      expect("run" in entry).toBe(false);
    }
    expect(catalogue.commands.find((c) => c.id === "demo.run")?.kind).toBe(
      "execute",
    );
    // Module ownership + label are retained from the registry.
    expect(catalogue.commands[0]?.moduleLabel).toBe("Demo");
  });

  it("does not invoke a handler during registry construction or catalogue build", () => {
    let calls = 0;
    const registry = createModuleRegistry([
      defineModule({
        id: "demo",
        name: "Demo",
        commands: [
          {
            id: "demo.run",
            title: "Run",
            kind: "execute",
            run: () => {
              calls += 1;
              return { ok: true };
            },
          },
        ],
      }),
    ]);
    buildCommandCatalogue(registry);
    registry.listCommands();
    expect(calls).toBe(0);
  });
});

describe("navigation-target validation", () => {
  it("accepts app-relative routes and drawer keys", () => {
    expect(validateNavigationTarget({ kind: "route", to: "/today" })).toEqual({
      kind: "route",
      to: "/today",
    });
    expect(
      validateNavigationTarget({ kind: "drawer", drawerKey: "task:1" }),
    ).toEqual({ kind: "drawer", drawerKey: "task:1" });
  });

  it("rejects external, scheme, protocol-relative and control-char targets", () => {
    expect(
      validateNavigationTarget({ kind: "route", to: "https://x" }),
    ).toBeNull();
    expect(
      validateNavigationTarget({ kind: "route", to: "javascript:alert(1)" }),
    ).toBeNull();
    expect(
      validateNavigationTarget({ kind: "route", to: "//evil" }),
    ).toBeNull();
    expect(isSafeInAppPath("/ok")).toBe(true);
    expect(isSafeInAppPath("//bad")).toBe(false);
    expect(isSafeInAppPath("relative")).toBe(false);
  });
});
