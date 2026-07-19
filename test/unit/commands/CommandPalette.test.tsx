import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

import CommandPalette from "~/shared/commands/CommandPalette";
import {
  CommandContextProvider,
  useRegisterContextualActions,
  type AppAction,
} from "~/shared/commands";
import { assembleOutcome } from "~/shared/search/model";
import type { CommandCatalogue } from "~/shared/commands/model";
import type { SearchFn } from "~/shared/search";

const CATALOGUE: CommandCatalogue = {
  commands: [
    {
      id: "today.open",
      moduleId: "today",
      moduleLabel: "Today",
      title: "Go to Today",
      keywords: ["home"],
      kind: "navigate",
      target: { kind: "route", to: "/today" },
    },
    {
      id: "demo.reindex",
      moduleId: "demo",
      moduleLabel: "Demo",
      title: "Reindex the workspace",
      keywords: ["rebuild"],
      kind: "execute",
    },
  ],
};

const healthySearch: SearchFn = async (query) =>
  assembleOutcome(query, [
    {
      providerId: "tasks.search",
      moduleId: "tasks",
      moduleLabel: "Tasks",
      ok: true,
      items: [
        {
          id: "t1",
          title: "Finish PX-02",
          entityType: "task",
          target: {
            kind: "drawer",
            drawerKey: "task:t1",
            canonicalPath: "/today",
          },
        },
      ],
    },
  ]);

const partialSearch: SearchFn = async (query) =>
  assembleOutcome(query, [
    {
      providerId: "tasks.search",
      moduleId: "tasks",
      moduleLabel: "Tasks",
      ok: true,
      items: [
        {
          id: "t1",
          title: "Finish PX-02",
          entityType: "task",
          target: { kind: "route", to: "/today" },
        },
      ],
    },
    {
      providerId: "x.search",
      moduleId: "x",
      moduleLabel: "X",
      ok: false,
      items: [],
    },
  ]);

function Ctx({ actions }: { readonly actions: readonly AppAction[] }) {
  useRegisterContextualActions(actions);
  return null;
}

// An empty record-search by default, so command-only tests never hit the network.
const emptySearch: SearchFn = async (query) => assembleOutcome(query, []);

function renderPalette(options: {
  onClose?: () => void;
  catalogue?: () => Promise<CommandCatalogue>;
  search?: SearchFn;
  execute?: (id: string, signal: AbortSignal) => Promise<{ ok: boolean }>;
  contextual?: readonly AppAction[];
}) {
  const onClose = options.onClose ?? vi.fn();
  const catalogue = options.catalogue ?? (async () => CATALOGUE);
  render(
    <MemoryRouter initialEntries={["/projects"]}>
      <CommandContextProvider>
        {options.contextual ? <Ctx actions={options.contextual} /> : null}
        <CommandPalette
          onClose={onClose}
          opener={null}
          catalogue={catalogue}
          debounceMs={0}
          search={options.search ?? emptySearch}
          {...(options.execute
            ? {
                execute: options.execute as (
                  id: string,
                  s: AbortSignal,
                ) => Promise<never>,
              }
            : {})}
        />
      </CommandContextProvider>
    </MemoryRouter>,
  );
  return { onClose };
}

/** Find a palette option by its title (robust to `<mark>` highlight splitting). */
function optionByTitle(title: string) {
  return screen.findByRole("option", {
    name: new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  });
}

describe("CommandPalette", () => {
  it("opens, focuses the input and lists registered commands on typing", async () => {
    renderPalette({});
    const input = screen.getByRole("combobox", {
      name: "Search commands and records",
    });
    await waitFor(() => expect(input).toHaveFocus());
    fireEvent.change(input, { target: { value: "reindex" } });
    await optionByTitle("Reindex the workspace");
    expect(screen.getByText("Actions")).toBeInTheDocument();
  });

  it("closes on Escape", () => {
    const { onClose } = renderPalette({});
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("shows contextual actions in a Current context group", async () => {
    renderPalette({
      contextual: [
        {
          id: "ctx.a",
          title: "Tidy view",
          kind: "run",
          run: () => ({ ok: true }),
        },
      ],
    });
    const input = screen.getByRole("combobox", {
      name: "Search commands and records",
    });
    fireEvent.change(input, { target: { value: "tidy" } });
    await optionByTitle("Tidy view");
    expect(screen.getByText("Current context")).toBeInTheDocument();
  });

  it("navigates and closes when a navigation command is activated", async () => {
    const { onClose } = renderPalette({});
    const input = screen.getByRole("combobox", {
      name: "Search commands and records",
    });
    fireEvent.change(input, { target: { value: "Go to Today" } });
    await optionByTitle("Go to Today");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onClose).toHaveBeenCalled();
  });

  it("runs an executable command and shows an inline success message", async () => {
    const execute = vi.fn(async () => ({ ok: true, message: "Reindexed." }));
    renderPalette({ execute });
    const input = screen.getByRole("combobox", {
      name: "Search commands and records",
    });
    fireEvent.change(input, { target: { value: "reindex" } });
    await optionByTitle("Reindex the workspace");
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() =>
      expect(screen.getAllByText("Reindexed.").length).toBeGreaterThan(0),
    );
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("blocks a duplicate activation while pending", async () => {
    const execute = vi.fn(() => new Promise<{ ok: boolean }>(() => {}));
    renderPalette({ execute });
    const input = screen.getByRole("combobox", {
      name: "Search commands and records",
    });
    fireEvent.change(input, { target: { value: "reindex" } });
    await optionByTitle("Reindex the workspace");
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() =>
      expect(screen.getByText("Running…")).toBeInTheDocument(),
    );
    fireEvent.keyDown(input, { key: "Enter" });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("shows a retryable failure and re-invokes on retry", async () => {
    const execute = vi
      .fn()
      .mockResolvedValue({ ok: false, reason: "failed", message: "Nope." });
    renderPalette({ execute });
    const input = screen.getByRole("combobox", {
      name: "Search commands and records",
    });
    fireEvent.change(input, { target: { value: "reindex" } });
    await optionByTitle("Reindex the workspace");
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(screen.getByText("Nope.")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(2));
  });

  it("merges DS-08 record results and keeps commands usable on partial failure", async () => {
    renderPalette({ search: partialSearch });
    const input = screen.getByRole("combobox", {
      name: "Search commands and records",
    });
    fireEvent.change(input, { target: { value: "Finish" } });
    await optionByTitle("Finish PX-02");
    expect(screen.getByText(/didn.t respond/i)).toBeInTheDocument();
  });

  it("still lists commands when the catalogue fails to load", async () => {
    renderPalette({
      catalogue: async () => {
        throw new Error("boom");
      },
      contextual: [
        {
          id: "ctx.a",
          title: "Tidy view",
          kind: "run",
          run: () => ({ ok: true }),
        },
      ],
    });
    const input = screen.getByRole("combobox", {
      name: "Search commands and records",
    });
    fireEvent.change(input, { target: { value: "tidy" } });
    // Contextual command still works even though the registered catalogue failed.
    await optionByTitle("Tidy view");
  });

  it("navigates ArrowDown/Enter to open a record result in the Drawer target", async () => {
    const { onClose } = renderPalette({ search: healthySearch });
    const input = screen.getByRole("combobox", {
      name: "Search commands and records",
    });
    fireEvent.change(input, { target: { value: "Finish" } });
    const listbox = await screen.findByRole("listbox");
    await waitFor(() =>
      expect(within(listbox).getAllByRole("option").length).toBeGreaterThan(0),
    );
    fireEvent.keyDown(input, { key: "End" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onClose).toHaveBeenCalled();
  });
});
