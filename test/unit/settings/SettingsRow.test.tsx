import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SettingsRow } from "~/shared/settings";

describe("DS-10b SettingsRow", () => {
  it("associates a bare control with the row label and description", () => {
    render(
      <SettingsRow
        label="Compact mode"
        description="Denser lists and cards."
        control={(ids) => (
          <input
            id={ids.controlId}
            type="checkbox"
            role="switch"
            aria-labelledby={ids.labelId}
            aria-describedby={ids.describedById}
          />
        )}
      />,
    );

    const control = screen.getByRole("switch", { name: "Compact mode" });
    expect(control).toBeInTheDocument();
    // The description id is part of aria-describedby.
    const describedBy = control.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    const descId = describedBy!.split(" ")[0];
    expect(document.getElementById(descId)).toHaveTextContent(
      "Denser lists and cards.",
    );
  });

  it("renders a status line and includes it in the description association", () => {
    render(
      <SettingsRow
        label="Compact mode"
        description="Denser lists."
        status="Saving…"
        statusLive
        control={(ids) => (
          <input
            id={ids.controlId}
            type="checkbox"
            role="switch"
            aria-labelledby={ids.labelId}
            aria-describedby={ids.describedById}
          />
        )}
      />,
    );
    const control = screen.getByRole("switch", { name: "Compact mode" });
    const ids = control.getAttribute("aria-describedby")!.split(" ");
    // Both description and status ids are associated.
    expect(ids.length).toBe(2);
    const statusEl = document.getElementById(ids[1])!;
    expect(statusEl).toHaveTextContent("Saving…");
    expect(statusEl).toHaveAttribute("aria-live", "polite");
  });

  it("supports a self-labelling control with no row label (control-only)", () => {
    render(
      <SettingsRow
        control={
          <button type="button" name="danger">
            Delete
          </button>
        }
      />,
    );
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    // No row label element is rendered.
    expect(screen.queryByText("Compact mode")).not.toBeInTheDocument();
  });

  it("omits the status region when no status is given", () => {
    render(
      <SettingsRow
        label="A"
        control={(ids) => (
          <input id={ids.controlId} aria-labelledby={ids.labelId} />
        )}
      />,
    );
    const control = screen.getByRole("textbox", { name: "A" });
    expect(control.getAttribute("aria-describedby")).toBeNull();
  });
});
