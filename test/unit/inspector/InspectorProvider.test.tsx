import { MemoryRouter } from "react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  InspectorProvider,
  useInspector,
  type InspectorEntry,
  type InspectorRenderResult,
} from "~/shared/inspector";

function renderInspector(entry: InspectorEntry): InspectorRenderResult | null {
  if (entry.key === "missing") {
    return null;
  }
  if (entry.key === "locked") {
    return {
      title: "Locked record",
      preventClose: true,
      children: <p>Unsaved changes</p>,
    };
  }
  return {
    title: `Editing ${entry.key}`,
    description: "Changes save as you type",
    children: <input aria-label="Title" defaultValue={entry.key} />,
  };
}

function Controls() {
  const inspector = useInspector();
  return (
    <div>
      <button type="button" onClick={() => inspector.openInspector("task:1")}>
        open-1
      </button>
      <button type="button" onClick={() => inspector.openInspector("task:2")}>
        open-2
      </button>
      <button type="button" onClick={() => inspector.openInspector("missing")}>
        open-missing
      </button>
      <button type="button" onClick={() => inspector.openInspector("locked")}>
        open-locked
      </button>
      <span data-testid="openkey">{inspector.openKey ?? "none"}</span>
    </div>
  );
}

function renderProvider(initialEntry = "/") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <InspectorProvider renderInspector={renderInspector}>
        <Controls />
      </InspectorProvider>
    </MemoryRouter>,
  );
}

describe("DS-10 InspectorProvider", () => {
  it("is closed with no inspector param", () => {
    renderProvider("/");
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(screen.getByTestId("openkey")).toHaveTextContent("none");
  });

  it("opens from a deep-linked URL", () => {
    renderProvider("/?inspector=task:7");
    expect(
      screen.getByRole("complementary", { name: "Editing task:7" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Changes save as you type")).toBeInTheDocument();
    expect(screen.getByTestId("openkey")).toHaveTextContent("task:7");
  });

  it("opens and closes via the controller and reflects the URL", () => {
    renderProvider("/");
    fireEvent.click(screen.getByText("open-1"));
    expect(
      screen.getByRole("complementary", { name: "Editing task:1" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close inspector" }));
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(screen.getByTestId("openkey")).toHaveTextContent("none");
  });

  it("switches records in place while open", () => {
    renderProvider("/");
    fireEvent.click(screen.getByText("open-1"));
    fireEvent.click(screen.getByText("open-2"));
    expect(
      screen.getByRole("complementary", { name: "Editing task:2" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("complementary", { name: "Editing task:1" }),
    ).toBeNull();
  });

  it("moves focus into the panel on open", async () => {
    renderProvider("/?inspector=task:1");
    await waitFor(() => {
      const close = screen.getByRole("button", { name: "Close inspector" });
      expect(document.activeElement).toBe(close);
    });
  });

  it("renders an accessible not-found panel for an unknown key", () => {
    renderProvider("/?inspector=missing");
    expect(
      screen.getByRole("heading", { name: "Not found" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("note")).toBeInTheDocument();
  });

  it("exposes a keyboard-resizable separator (docked)", () => {
    renderProvider("/?inspector=task:1");
    const separator = screen.getByRole("separator", {
      name: "Resize inspector",
    });
    const before = Number(separator.getAttribute("aria-valuenow"));
    // Left arrow widens the right-anchored panel.
    fireEvent.keyDown(separator, { key: "ArrowLeft" });
    const after = Number(separator.getAttribute("aria-valuenow"));
    expect(after).toBeGreaterThan(before);
    expect(after).toBeLessThanOrEqual(
      Number(separator.getAttribute("aria-valuemax")),
    );
  });

  it("respects preventClose (unsaved work) on the close button", () => {
    renderProvider("/?inspector=locked");
    fireEvent.click(screen.getByRole("button", { name: "Close inspector" }));
    // Still open — preventClose blocked the close.
    expect(
      screen.getByRole("complementary", { name: "Locked record" }),
    ).toBeInTheDocument();
  });
});
