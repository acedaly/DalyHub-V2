/**
 * MOBILE-01 / ASSET-03 — the shared phone Sheet's Escape contract.
 *
 * Regression: two sheets can legitimately be open at once — ASSET-03's Asset
 * type picker opens from INSIDE the Quick Capture sheet — and Escape must close
 * exactly one of them, the top one. It did not: both sheets listen on
 * `document` in the capture phase, and `stopPropagation` does not stop other
 * listeners on the same node, so one Escape closed the picker AND threw away the
 * half-written capture underneath it.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Sheet } from "~/shared/sheet";

function Nested({ onOuterClose }: { readonly onOuterClose: () => void }) {
  const [innerOpen, setInnerOpen] = useState(false);
  return (
    <Sheet title="Capture" opener={null} onClose={onOuterClose}>
      <button type="button" onClick={() => setInnerOpen(true)}>
        Choose a type
      </button>
      {innerOpen ? (
        <Sheet
          title="What kind of asset?"
          opener={null}
          onClose={() => setInnerOpen(false)}
        >
          <button type="button">Vehicle</button>
        </Sheet>
      ) : null}
    </Sheet>
  );
}

describe("Sheet — Escape", () => {
  it("closes the sheet", () => {
    const onClose = vi.fn();
    render(
      <Sheet title="Capture" opener={null} onClose={onClose}>
        <p>Body</p>
      </Sheet>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes ONLY the topmost sheet when two are open", () => {
    const onOuterClose = vi.fn();
    render(<Nested onOuterClose={onOuterClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Choose a type" }));
    expect(
      screen.getByRole("dialog", { name: "What kind of asset?" }),
    ).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(
      screen.queryByRole("dialog", { name: "What kind of asset?" }),
    ).toBeNull();
    // The capture underneath survives — one Escape, one surface.
    expect(onOuterClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Capture" })).toBeInTheDocument();

    // A second Escape now closes the one that became topmost.
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onOuterClose).toHaveBeenCalledTimes(1);
  });

  it("stops the Escape it handled from reaching a surface beneath it", () => {
    const onClose = vi.fn();
    // A Drawer beneath the sheet, listening further along the propagation path.
    const beneath = vi.fn();
    window.addEventListener("keydown", beneath);
    render(
      <Sheet title="Capture" opener={null} onClose={onClose}>
        <p>Body</p>
      </Sheet>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(beneath).not.toHaveBeenCalled();
    window.removeEventListener("keydown", beneath);
  });
});
