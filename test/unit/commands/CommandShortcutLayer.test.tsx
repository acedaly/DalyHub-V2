import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { CommandShortcutLayer } from "~/shared/commands/CommandShortcutLayer";
import {
  CommandContextProvider,
  useRegisterContextualActions,
  type AppAction,
  type ShortcutBinding,
} from "~/shared/commands";
import type { CommandCatalogue } from "~/shared/commands/model";

/**
 * DS-09 — the global navigation-shortcut layer. NAVIGATION command/action
 * shortcuts (registered + contextual) actually navigate; EXECUTABLE shortcuts are
 * deferred (they need the DS-10 feedback surface) and disabled actions never fire.
 * Shift-based shortcuts keep the presses platform-independent.
 */

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="loc">{location.pathname}</div>;
}

function press(init: KeyboardEventInit & { key: string }) {
  document.dispatchEvent(
    new KeyboardEvent("keydown", { cancelable: true, bubbles: true, ...init }),
  );
}

function Register({ actions }: { readonly actions: readonly AppAction[] }) {
  useRegisterContextualActions(actions);
  return null;
}

function renderLayer(opts: {
  actions?: readonly AppAction[];
  catalogue?: CommandCatalogue;
  reserved?: readonly ShortcutBinding[];
}) {
  const catalogue = opts.catalogue ?? { commands: [] };
  render(
    <MemoryRouter initialEntries={["/"]}>
      <CommandContextProvider>
        {opts.actions ? <Register actions={opts.actions} /> : null}
        <CommandShortcutLayer
          reserved={opts.reserved ?? []}
          catalogue={async () => catalogue}
        />
        <LocationProbe />
      </CommandContextProvider>
    </MemoryRouter>,
  );
}

const loc = () => screen.getByTestId("loc").textContent;

describe("CommandShortcutLayer", () => {
  it("dispatches a registered navigation command's shortcut", async () => {
    renderLayer({
      catalogue: {
        commands: [
          {
            id: "today.open",
            moduleId: "today",
            moduleLabel: "Today",
            title: "Go to Today",
            keywords: [],
            kind: "navigate",
            target: { kind: "route", to: "/today" },
            shortcut: { key: "t", modifiers: ["shift"] },
          },
        ],
      },
    });
    // Let the catalogue effect resolve and the bindings rebuild.
    await act(async () => {
      await Promise.resolve();
    });
    press({ key: "t", shiftKey: true });
    await waitFor(() => expect(loc()).toBe("/today"));
  });

  it("dispatches a contextual navigation action's shortcut", async () => {
    renderLayer({
      actions: [
        {
          id: "ctx.go",
          title: "Go to Projects",
          kind: "navigate",
          target: { kind: "route", to: "/projects" },
          shortcut: { key: "g", modifiers: ["shift"] },
        },
      ],
    });
    press({ key: "g", shiftKey: true });
    await waitFor(() => expect(loc()).toBe("/projects"));
  });

  it("resolves a shortcut collision by precedence (contextual over registered)", async () => {
    renderLayer({
      actions: [
        {
          id: "ctx.go",
          title: "Contextual go",
          kind: "navigate",
          target: { kind: "route", to: "/projects" },
          shortcut: { key: "c", modifiers: ["shift"] },
        },
      ],
      catalogue: {
        commands: [
          {
            id: "reg.go",
            moduleId: "m",
            moduleLabel: "M",
            title: "Registered go",
            keywords: [],
            kind: "navigate",
            target: { kind: "route", to: "/today" },
            shortcut: { key: "c", modifiers: ["shift"] },
          },
        ],
      },
    });
    await act(async () => {
      await Promise.resolve();
    });
    press({ key: "c", shiftKey: true });
    // Contextual precedes registered, so exactly one action fires: the contextual
    // one (→ /projects), never the colliding registered one (→ /today).
    await waitFor(() => expect(loc()).toBe("/projects"));
  });

  it("does NOT dispatch an executable command's shortcut (deferred to DS-10)", async () => {
    renderLayer({
      catalogue: {
        commands: [
          {
            id: "demo.reindex",
            moduleId: "demo",
            moduleLabel: "Demo",
            title: "Reindex",
            keywords: [],
            kind: "execute",
            shortcut: { key: "r", modifiers: ["shift"] },
          },
        ],
      },
    });
    await act(async () => {
      await Promise.resolve();
    });
    press({ key: "r", shiftKey: true });
    await act(async () => {
      await Promise.resolve();
    });
    // No navigation occurred — executable shortcuts are not wired.
    expect(loc()).toBe("/");
  });

  it("does NOT dispatch a disabled contextual navigation action", async () => {
    renderLayer({
      actions: [
        {
          id: "ctx.off",
          title: "Disabled go",
          kind: "navigate",
          target: { kind: "route", to: "/projects" },
          shortcut: { key: "d", modifiers: ["shift"] },
          disabled: true,
        },
      ],
    });
    press({ key: "d", shiftKey: true });
    await act(async () => {
      await Promise.resolve();
    });
    expect(loc()).toBe("/");
  });

  it("fires reserved bindings passed by the shell", () => {
    const onTrigger = vi.fn();
    render(
      <MemoryRouter initialEntries={["/"]}>
        <CommandContextProvider>
          <CommandShortcutLayer
            reserved={[
              {
                shortcut: { key: "k", modifiers: ["shift"] },
                onTrigger,
                allowInInput: true,
              },
            ]}
            catalogue={async () => ({ commands: [] })}
          />
        </CommandContextProvider>
      </MemoryRouter>,
    );
    press({ key: "k", shiftKey: true });
    expect(onTrigger).toHaveBeenCalledTimes(1);
  });
});
