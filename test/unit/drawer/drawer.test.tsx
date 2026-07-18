/**
 * DS-03 — Shared Drawer behaviour & accessibility (component tests).
 *
 * Proves the acceptance criteria against the real components in a test DOM: the
 * closed/open dialog contract, the accessible close control, deterministic focus
 * entry and restoration, the focus trap, Escape-closes-top-only, prevented close,
 * background inertness, body-scroll locking and cleanup, nested-drawer isolation
 * and state preservation, idempotent opens, and clean unmount. Real browser
 * behaviour (native `inert` hit-testing, animation, Back/Forward) is covered by
 * Playwright.
 */

import { useEffect, useState } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DrawerProvider, DrawerTrigger, useDrawer } from "~/shared/drawer";
import type { DrawerEntry, DrawerRenderResult } from "~/shared/drawer";
import { RecordContent, RecordLayout } from "~/shared/record-layout";
import type { RecordTab } from "~/shared/record-layout";

/** A drawer body with its own state, so we can prove lower drawers stay mounted. */
function CountingBody({ label }: { label: string }) {
  const [count, setCount] = useState(0);
  return (
    <div>
      <p>Body for {label}</p>
      <button type="button" onClick={() => setCount((value) => value + 1)}>
        {label} count {count}
      </button>
      <DrawerTrigger drawerKey="rec:b">Open B from {label}</DrawerTrigger>
    </div>
  );
}

const renderContent = (entry: DrawerEntry): DrawerRenderResult | null => {
  if (entry.key === "rec:missing") {
    return null;
  }
  if (entry.key === "rec:layout") {
    return {
      title: "Website relaunch",
      description: "A project record.",
      children: (
        <RecordLayout typeLabel="Project" title="Website relaunch">
          <RecordContent label="Overview">Record body</RecordContent>
        </RecordLayout>
      ),
    };
  }
  return {
    title: `Record ${entry.key}`,
    description: `Description ${entry.key}`,
    children: <CountingBody label={entry.key} />,
  };
};

function Probe() {
  const location = useLocation();
  return (
    <div data-testid="loc">{`${location.pathname}${location.search}`}</div>
  );
}

function Host({
  render: contentRenderer = renderContent,
}: {
  render?: (entry: DrawerEntry) => DrawerRenderResult | null;
}) {
  return (
    <DrawerProvider renderDrawer={contentRenderer}>
      <div>
        <button type="button" data-testid="bg-button">
          Background button
        </button>
        <DrawerTrigger drawerKey="rec:a" data-testid="open-a">
          Open A
        </DrawerTrigger>
        <Probe />
      </div>
    </DrawerProvider>
  );
}

function renderHost(
  options: {
    initialEntries?: string[];
    render?: (entry: DrawerEntry) => DrawerRenderResult | null;
  } = {},
) {
  return render(
    <MemoryRouter initialEntries={options.initialEntries ?? ["/host"]}>
      <Routes>
        <Route path="/host" element={<Host render={options.render} />} />
        <Route path="/elsewhere" element={<div>Elsewhere page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  // Guard against a leaked scroll lock between tests.
  document.documentElement.style.overflow = "";
  document.body.style.paddingRight = "";
});

describe("Drawer — open/closed dialog contract", () => {
  it("renders no dialog when closed", () => {
    renderHost();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.documentElement.style.overflow).toBe("");
  });

  it("opening renders a labelled modal dialog", () => {
    renderHost();
    fireEvent.click(screen.getByTestId("open-a"));
    const dialog = screen.getByRole("dialog", { name: "Record rec:a" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    // The description is associated for assistive tech.
    expect(dialog).toHaveAttribute("aria-describedby");
  });

  it("hosts an arbitrary Record Layout as its children", () => {
    renderHost({ initialEntries: ["/host?drawer=rec:layout"] });
    const dialog = screen.getByRole("dialog", { name: "Website relaunch" });
    // The RecordLayout renders its own heading (level 1); the drawer title is a
    // level-2 heading, so the record heading is disambiguated by level.
    expect(
      within(dialog).getByRole("heading", {
        level: 1,
        name: "Website relaunch",
      }),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("Record body")).toBeInTheDocument();
  });

  it("provides an accessible close control", () => {
    renderHost({ initialEntries: ["/host?drawer=rec:a"] });
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("button", { name: "Close" }),
    ).toBeInTheDocument();
  });

  it("renders a coherent not-found panel for an unknown deep link", () => {
    renderHost({ initialEntries: ["/host?drawer=rec:missing"] });
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText(/couldn’t find that record/),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Close" }),
    ).toBeInTheDocument();
  });
});

describe("Drawer — focus management", () => {
  it("moves focus into the drawer (to the close button) on open", async () => {
    renderHost();
    fireEvent.click(screen.getByTestId("open-a"));
    const closeButton = screen.getByRole("button", { name: "Close" });
    await waitFor(() => expect(closeButton).toHaveFocus());
  });

  it("restores focus to the opener on close", async () => {
    renderHost();
    const trigger = screen.getByTestId("open-a");
    trigger.focus();
    fireEvent.click(trigger);
    const closeButton = screen.getByRole("button", { name: "Close" });
    await waitFor(() => expect(closeButton).toHaveFocus());

    fireEvent.click(closeButton);
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("closes gracefully with no opener (direct deep link) and does not throw", () => {
    renderHost({ initialEntries: ["/host?drawer=rec:a"] });
    const closeButton = screen.getByRole("button", { name: "Close" });
    expect(() => fireEvent.click(closeButton)).not.toThrow();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("moves focus into the revealed drawer when a deep-linked top closes with no opener", async () => {
    // A directly deep-linked stack captured no opener for the top level.
    renderHost({ initialEntries: ["/host?drawer=rec:a&drawer=rec:c"] });
    const top = screen.getByRole("dialog", { name: "Record rec:c" });
    fireEvent.click(within(top).getByRole("button", { name: "Close" }));

    // rec:c closes; focus must land inside the revealed rec:a, never on <body>.
    await waitFor(() => {
      const lower = screen.getByRole("dialog", { name: "Record rec:a" });
      expect(
        within(lower).getByRole("button", { name: "Close" }),
      ).toHaveFocus();
    });
  });

  it("traps Tab and Shift+Tab within the top drawer", () => {
    renderHost({ initialEntries: ["/host?drawer=rec:a"] });
    const dialog = screen.getByRole("dialog");
    const focusable = within(dialog).getAllByRole("button");
    const links = within(dialog).getAllByRole("link");
    const first = screen.getByRole("button", { name: "Close" });
    const last = links[links.length - 1] ?? focusable[focusable.length - 1];

    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(first).toHaveFocus();

    first.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
  });
});

describe("Drawer — Escape & prevented close", () => {
  it("Escape closes the top drawer", async () => {
    renderHost({ initialEntries: ["/host?drawer=rec:a"] });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("Escape closes only the top of a stack", async () => {
    renderHost({ initialEntries: ["/host?drawer=rec:a&drawer=rec:c"] });
    expect(screen.getAllByRole("dialog", { hidden: true })).toHaveLength(2);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(
        screen.getByRole("dialog", { name: "Record rec:a" }),
      ).toBeVisible(),
    );
    expect(screen.queryByRole("dialog", { name: "Record rec:c" })).toBeNull();
  });

  it("honours preventClose for Escape and the close button", () => {
    const guarded = (entry: DrawerEntry): DrawerRenderResult => ({
      title: `Guarded ${entry.key}`,
      children: <p>Unsaved work</p>,
      preventClose: true,
    });
    renderHost({ initialEntries: ["/host?drawer=rec:a"], render: guarded });

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("Drawer — background isolation & scroll lock", () => {
  it("marks the background inert while open and clears it on close", async () => {
    const { container } = renderHost();
    const background = container.querySelector(".drawer-background");
    expect(background).not.toBeNull();
    expect(background?.hasAttribute("inert")).toBe(false);

    fireEvent.click(screen.getByTestId("open-a"));
    await waitFor(() => expect(background?.hasAttribute("inert")).toBe(true));

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(background?.hasAttribute("inert")).toBe(false));
  });

  it("locks page scroll while open and restores it on close", async () => {
    renderHost();
    fireEvent.click(screen.getByTestId("open-a"));
    await waitFor(() =>
      expect(document.documentElement.style.overflow).toBe("hidden"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() =>
      expect(document.documentElement.style.overflow).toBe(""),
    );
  });

  it("restores page scroll when the provider unmounts while open", () => {
    const { unmount } = renderHost({ initialEntries: ["/host?drawer=rec:a"] });
    expect(document.documentElement.style.overflow).toBe("hidden");
    unmount();
    expect(document.documentElement.style.overflow).toBe("");
  });
});

describe("Drawer — stacking", () => {
  it("leaves only the top drawer interactive; lower drawers are inert", () => {
    renderHost({ initialEntries: ["/host?drawer=rec:a&drawer=rec:c"] });
    const dialogs = screen.getAllByRole("dialog", { hidden: true });
    const lower = dialogs.find(
      (dialog) => dialog.getAttribute("data-depth") === "0",
    );
    const top = dialogs.find(
      (dialog) => dialog.getAttribute("data-depth") === "1",
    );
    expect(lower?.hasAttribute("inert")).toBe(true);
    expect(lower).not.toHaveAttribute("aria-modal");
    expect(top?.hasAttribute("inert")).toBe(false);
    expect(top).toHaveAttribute("aria-modal", "true");
  });

  it("keeps lower drawers mounted with their state when a higher one opens", async () => {
    renderHost({ initialEntries: ["/host?drawer=rec:a"] });
    // Increment the counter in drawer A.
    const counter = screen.getByRole("button", { name: /rec:a count 0/ });
    fireEvent.click(counter);
    expect(
      screen.getByRole("button", { name: /rec:a count 1/ }),
    ).toBeInTheDocument();

    // Open B on top from within A.
    fireEvent.click(screen.getByRole("link", { name: /Open B from rec:a/ }));
    expect(
      screen.getByRole("dialog", { name: "Record rec:b" }),
    ).toBeInTheDocument();

    // Close B; A's counter still reads 1 (A never unmounted).
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Record rec:b" })).toBeNull(),
    );
    expect(
      screen.getByRole("button", { name: /rec:a count 1/ }),
    ).toBeInTheDocument();
  });

  it("does not duplicate a stack level when the same drawer is opened again", () => {
    renderHost();
    const trigger = screen.getByTestId("open-a");
    fireEvent.click(trigger);
    fireEvent.click(trigger);
    expect(screen.getAllByRole("dialog", { hidden: true })).toHaveLength(1);
  });
});

describe("Drawer — guardrails", () => {
  it("caps the stack depth instead of growing without bound", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // A URL already at the cap; opening more replaces the top.
    const deep = Array.from({ length: 12 }, (_, i) => `drawer=rec:${i}`).join(
      "&",
    );
    renderHost({
      initialEntries: [`/host?${deep}`],
      render: (e) => ({
        title: e.key,
        children: <DrawerTrigger drawerKey="rec:overflow">More</DrawerTrigger>,
      }),
    });
    const dialogs = screen.getAllByRole("dialog", { hidden: true });
    const top = dialogs.find((d) => d.getAttribute("data-depth") === "11");
    fireEvent.click(
      within(top as HTMLElement).getByRole("link", { name: "More" }),
    );
    // Still capped at 12 levels.
    expect(screen.getAllByRole("dialog", { hidden: true })).toHaveLength(12);
    warn.mockRestore();
  });
});

/**
 * Panel identity: each drawer level is keyed by BOTH stack depth and record key.
 * Depth keeps a lower level mounted when a higher one is pushed above it; the key
 * forces a remount when the record at a depth is REPLACED, so record-local state
 * (uncontrolled tabs, local/scroll state, mount-only initial focus) never leaks
 * from a replaced record into its replacement.
 */
describe("Drawer — identity & remount on replace", () => {
  const mounts = new Map<string, number>();

  beforeEach(() => mounts.clear());

  /** A record body with its own local state and an UNCONTROLLED tab strip. */
  function IdentityBody({ label }: { label: string }) {
    const [count, setCount] = useState(0);
    useEffect(() => {
      mounts.set(label, (mounts.get(label) ?? 0) + 1);
    }, [label]);
    const tabs: RecordTab[] = [
      {
        id: "overview",
        label: "Overview",
        content: (
          <button type="button" onClick={() => setCount((value) => value + 1)}>
            {label} count {count}
          </button>
        ),
      },
      { id: "details", label: "Details", content: <p>Details of {label}</p> },
    ];
    return (
      <RecordLayout title={`Record ${label}`} headingLevel={3} tabs={tabs} />
    );
  }

  const identityRender = (entry: DrawerEntry): DrawerRenderResult => ({
    title: `Record ${entry.key}`,
    children: <IdentityBody label={entry.key} />,
  });

  function IdentityControls() {
    const { openDrawer, replaceDrawer } = useDrawer();
    return (
      <div>
        <button type="button" onClick={() => openDrawer("rec:a")}>
          open-a
        </button>
        <button type="button" onClick={() => openDrawer("rec:nested")}>
          open-nested
        </button>
        <button type="button" onClick={() => openDrawer("rec:c")}>
          open-c
        </button>
        <button type="button" onClick={() => replaceDrawer("rec:b")}>
          replace-b
        </button>
      </div>
    );
  }

  function renderIdentity(
    options: { initialEntries?: string[]; maxDepth?: number } = {},
  ) {
    return render(
      <MemoryRouter initialEntries={options.initialEntries ?? ["/host"]}>
        <Routes>
          <Route
            path="/host"
            element={
              <DrawerProvider
                renderDrawer={identityRender}
                maxDepth={options.maxDepth}
              >
                <IdentityControls />
              </DrawerProvider>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("keeps a lower drawer mounted (not remounted or reset) when a higher one opens", async () => {
    renderIdentity();
    fireEvent.click(screen.getByText("open-a"));
    // Increment the lower drawer's local state.
    fireEvent.click(screen.getByRole("button", { name: /rec:a count 0/ }));
    expect(
      screen.getByRole("button", { name: /rec:a count 1/ }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText("open-nested"));
    await waitFor(() =>
      expect(
        screen.getByRole("dialog", { name: "Record rec:nested" }),
      ).toBeInTheDocument(),
    );

    // The lower drawer never remounted and kept its state.
    expect(mounts.get("rec:a")).toBe(1);
    expect(screen.getByText(/rec:a count 1/)).toBeInTheDocument();
  });

  it("remounts and resets record-local state when the top is replaced", async () => {
    renderIdentity();
    fireEvent.click(screen.getByText("open-a"));
    fireEvent.click(screen.getByRole("button", { name: /rec:a count 0/ }));
    expect(
      screen.getByRole("button", { name: /rec:a count 1/ }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText("replace-b"));
    await waitFor(() =>
      expect(
        screen.getByRole("dialog", { name: "Record rec:b" }),
      ).toBeInTheDocument(),
    );

    // The replacement is a fresh instance: its counter starts at 0, and no state
    // from the replaced record survives.
    expect(
      screen.getByRole("button", { name: /rec:b count 0/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/rec:a count/)).toBeNull();
    expect(mounts.get("rec:b")).toBe(1);
  });

  it("does not leak an uncontrolled tab selection from the replaced record", async () => {
    renderIdentity();
    fireEvent.click(screen.getByText("open-a"));

    const dialogA = screen.getByRole("dialog", { name: "Record rec:a" });
    fireEvent.click(within(dialogA).getByRole("tab", { name: "Details" }));
    expect(
      within(dialogA).getByRole("tab", { name: "Details" }),
    ).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByText("replace-b"));
    const dialogB = await screen.findByRole("dialog", { name: "Record rec:b" });

    // The replacement starts on its own default tab, not the replaced record's.
    expect(
      within(dialogB).getByRole("tab", { name: "Overview" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      within(dialogB).getByRole("tab", { name: "Details" }),
    ).toHaveAttribute("aria-selected", "false");
  });

  it("reruns deterministic initial focus on the replacement", async () => {
    renderIdentity();
    fireEvent.click(screen.getByText("open-a"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Close" })).toHaveFocus(),
    );

    fireEvent.click(screen.getByText("replace-b"));
    // The remounted replacement runs initial focus → its own close button.
    await waitFor(() => {
      const dialogB = screen.getByRole("dialog", { name: "Record rec:b" });
      expect(
        within(dialogB).getByRole("button", { name: "Close" }),
      ).toHaveFocus();
    });
  });

  it("applies the same remount rule on the max-depth replacement path", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    renderIdentity({ maxDepth: 2 });
    fireEvent.click(screen.getByText("open-a"));
    fireEvent.click(screen.getByText("open-nested"));
    await waitFor(() =>
      expect(
        screen.getByRole("dialog", { name: "Record rec:nested" }),
      ).toBeInTheDocument(),
    );
    // Give the top (at the cap) some local state.
    fireEvent.click(screen.getByRole("button", { name: /rec:nested count 0/ }));
    expect(
      screen.getByRole("button", { name: /rec:nested count 1/ }),
    ).toBeInTheDocument();

    // Opening another key at the cap replaces the top in place — and must remount.
    fireEvent.click(screen.getByText("open-c"));
    await waitFor(() =>
      expect(
        screen.getByRole("dialog", { name: "Record rec:c" }),
      ).toBeInTheDocument(),
    );
    // Still capped at two levels, and the replacement is fresh (count 0).
    expect(screen.getAllByRole("dialog", { hidden: true })).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: /rec:c count 0/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/rec:nested count/)).toBeNull();
    warn.mockRestore();
  });

  it("keeps duplicate record keys at different depths uniquely mounted", async () => {
    // The same key legitimately appears at two depths.
    renderIdentity({ initialEntries: ["/host?drawer=rec:a&drawer=rec:a"] });
    const dialogs = screen.getAllByRole("dialog", { hidden: true });
    expect(dialogs).toHaveLength(2);
    expect(dialogs[0].getAttribute("data-depth")).toBe("0");
    expect(dialogs[1].getAttribute("data-depth")).toBe("1");
    // Both mounted as independent instances (React did not collapse them).
    expect(mounts.get("rec:a")).toBe(2);
  });
});
