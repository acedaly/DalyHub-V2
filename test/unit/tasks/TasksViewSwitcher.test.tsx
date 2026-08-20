/**
 * TASKS-03 — the compact Tasks view switcher.
 *
 * The properties asserted here are the ones a saved-view system lives or dies by:
 * a built-in view is distinguishable from a user's own WITHOUT colour, a built-in
 * view offers no destructive or mutating action, deleting asks first, selecting a
 * view is an ordinary URL, and every management action posts to the canonical
 * saved-view route rather than writing anything itself.
 */

import { createMemoryRouter, RouterProvider } from "react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TasksViewSwitcher } from "~/modules/tasks/TasksViewSwitcher";
import type { TasksViewOption } from "~/modules/tasks/tasks-contract";

const VIEWS: readonly TasksViewOption[] = [
  {
    id: "default",
    name: "All active",
    description: "Everything actionable right now.",
    kind: "system",
    query: "",
    isDefault: false,
  },
  {
    id: "overdue",
    name: "Overdue",
    description: "Past its date and still open.",
    kind: "system",
    query: "system=overdue&sort=due_date",
    isDefault: false,
  },
  {
    id: "v-mine",
    name: "Deep work",
    description: null,
    kind: "user",
    query: "priority=p1&group=parent",
    isDefault: true,
  },
];

function renderSwitcher(
  over: Partial<React.ComponentProps<typeof TasksViewSwitcher>> = {},
) {
  const router = createMemoryRouter(
    [
      {
        path: "/tasks",
        element: (
          <TasksViewSwitcher
            views={VIEWS}
            activeViewId="v-mine"
            modified={false}
            currentQuery="priority=p1"
            shareUrl="https://example.test/tasks?priority=p1"
            {...over}
          />
        ),
        action: () => ({ kind: "view", ok: true, viewId: "x", message: "ok" }),
      },
      {
        path: "/tasks/views",
        action: () => ({ kind: "view", ok: true, viewId: "x", message: "ok" }),
      },
    ],
    { initialEntries: ["/tasks"] },
  );
  render(<RouterProvider router={router} />);
}

const openPanel = () =>
  fireEvent.click(screen.getByTestId("tasks-view-trigger"));
const openMenu = () =>
  fireEvent.click(screen.getByRole("button", { name: "Manage Tasks views" }));

describe("the switcher trigger", () => {
  it("names the ACTIVE view, so what is applied is visible without opening it", () => {
    renderSwitcher();
    expect(screen.getByTestId("tasks-view-trigger").textContent).toContain(
      "Deep work",
    );
  });

  it("says Custom for an ad-hoc configuration", () => {
    renderSwitcher({ activeViewId: null });
    expect(screen.getByTestId("tasks-view-trigger").textContent).toContain(
      "Custom",
    );
  });

  it("marks an unsaved change with a WORD, not a colour", () => {
    renderSwitcher({ modified: true });
    expect(screen.getByTestId("tasks-view-trigger").textContent).toContain(
      "Modified",
    );
  });
});

describe("built-in vs user views", () => {
  it("separates them into headed groups and says built-ins cannot be changed", () => {
    renderSwitcher();
    openPanel();
    expect(
      screen.getByRole("heading", { name: "Built-in views" }),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Your views" })).toBeTruthy();
    expect(screen.getByText(/can’t be changed or deleted/i)).toBeTruthy();
  });

  it("selects a view by ordinary LINK navigation, so it is shareable", () => {
    renderSwitcher();
    openPanel();
    const link = screen.getByRole("link", { name: /Overdue/ });
    expect(link.getAttribute("href")).toBe(
      "/tasks?system=overdue&sort=due_date",
    );
  });

  it("marks the owner's default in text", () => {
    renderSwitcher();
    openPanel();
    expect(screen.getByText("Default")).toBeTruthy();
  });

  it("teaches the next action when the owner has saved nothing", () => {
    renderSwitcher({ views: VIEWS.filter((v) => v.kind === "system") });
    openPanel();
    expect(screen.getByText(/haven’t saved any views yet/i)).toBeTruthy();
  });
});

describe("management actions", () => {
  it("offers rename, duplicate, update and delete for a USER view", () => {
    renderSwitcher();
    openMenu();
    expect(screen.getByRole("menuitem", { name: /Rename/ })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /Duplicate/ })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /Update/ })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /Delete/ })).toBeTruthy();
  });

  it("offers NONE of them for a BUILT-IN view", () => {
    renderSwitcher({ activeViewId: "overdue" });
    openMenu();
    expect(screen.queryByRole("menuitem", { name: /Rename/ })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: /^Delete/ })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: /^Update/ })).toBeNull();
    // …but saving the current configuration as a NEW view is always available, so a
    // built-in view is still a usable starting point.
    expect(
      screen.getByRole("menuitem", { name: /Save as new view/ }),
    ).toBeTruthy();
  });

  it("always offers a shareable link without saving anything", () => {
    renderSwitcher({ activeViewId: null });
    openMenu();
    expect(
      screen.getByRole("menuitem", { name: /Copy link to this configuration/ }),
    ).toBeTruthy();
  });

  it("asks for a NAME inline, keyboard-operable, before saving", async () => {
    renderSwitcher();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /Save as new view/ }));
    await waitFor(() =>
      expect(screen.getByTestId("tasks-view-name-input")).toBeTruthy(),
    );
    // The field is labelled and focused, so it is usable without a pointer.
    expect(screen.getByLabelText("Name this view")).toBeTruthy();
    expect(document.activeElement).toBe(
      screen.getByTestId("tasks-view-name-input"),
    );
  });

  it("CONFIRMS before deleting, and says what is and is not affected", async () => {
    renderSwitcher();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /Delete/ }));
    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: /Delete/ })).toBeTruthy(),
    );
    expect(screen.getByText(/Your tasks are not affected/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete view" })).toBeTruthy();
  });
});

/**
 * HARDEN-06D (F-04) — a management action is awaited, and its refusal is shown.
 *
 * Every mutation used to leave through a bare, un-awaited `fetcher.submit`, and
 * both callers closed their own UI on the next line. The confirmation dialog's
 * single-flight phase, its `busyLabel` and its inline error could therefore
 * never engage, and an owner who confirmed "Delete view" and navigated
 * immediately took the in-flight request with them — the view was still there,
 * and nothing said so. It was CI p08's intermittent failure.
 */
describe("HARDEN-06D — a management action is awaited", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** A POST that does not answer until the test lets it. */
  function heldFetch() {
    let release!: (result: unknown) => void;
    const held = new Promise<unknown>((resolve) => {
      release = resolve;
    });
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      calls.push(String(input));
      const body = await held;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    return { release, calls };
  }

  it("keeps the delete dialog open, and busy, until the server answers", async () => {
    const { release, calls } = heldFetch();
    renderSwitcher();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /Delete/ }));
    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: /Delete/ })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete view" }));

    // The request is out, the dialog is still up, and it says what it is doing.
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toBe("/tasks/views");
    expect(screen.getByRole("dialog", { name: /Delete/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Deleting…" })).toBeTruthy();

    release({ kind: "view", ok: true, viewId: "v-mine", message: "Deleted." });
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: /Delete/ })).toBeNull(),
    );
  });

  it("keeps the dialog open, with the reason, when the server refuses", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          JSON.stringify({
            kind: "view",
            ok: false,
            formError: "That view no longer exists.",
          }),
          { status: 400, headers: { "content-type": "application/json" } },
        ),
    );
    renderSwitcher();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /Delete/ }));
    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: /Delete/ })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete view" }));

    // Twice, and both are right: the dialog's own inline alert (so it is
    // beside the retry) and the switcher's polite live region (so a screen
    // reader hears it without hunting).
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "That view no longer exists.",
      ),
    );
    expect(screen.getByRole("dialog", { name: /Delete/ })).toBeTruthy();
  });

  it("keeps the naming form open when the save is refused", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          JSON.stringify({
            kind: "view",
            ok: false,
            formError: "A view with that name already exists.",
          }),
          { status: 400, headers: { "content-type": "application/json" } },
        ),
    );
    renderSwitcher();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /Save as new view/ }));
    await waitFor(() =>
      expect(screen.getByTestId("tasks-view-name-input")).toBeTruthy(),
    );
    fireEvent.change(screen.getByTestId("tasks-view-name-input"), {
      target: { value: "Deep work" },
    });
    fireEvent.submit(
      screen.getByTestId("tasks-view-name-input").closest("form")!,
    );

    await waitFor(() =>
      expect(
        screen.getByText("A view with that name already exists."),
      ).toBeTruthy(),
    );
    // The owner's typing is still there to correct, not thrown away.
    expect(screen.getByTestId("tasks-view-name-input")).toBeTruthy();
  });
});
