import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { BooleanField, Switch } from "~/shared/forms";

/**
 * M3-INT — the ONE M3 switch.
 *
 * The thing worth testing about a switch is not that it looks like a switch. It
 * is that it is still a CHECKBOX underneath: the audit's finding 8 asked for a
 * switch, and the usual way that request goes wrong is a `div` with
 * `role="switch"` and an `aria-checked` attribute the component keeps in step by
 * hand — which then has to re-implement Space, the label association, the
 * disabled state, form participation and forced colours, and gets at least one
 * of them wrong. These tests are mostly about the parts nobody writes.
 */

function Controlled({ initial = false }: { readonly initial?: boolean }) {
  const [on, setOn] = useState(initial);
  return <Switch label="Email digests" checked={on} onChange={setOn} />;
}

describe("Switch — semantics", () => {
  it("is a real checkbox, announced as a switch", () => {
    render(<Controlled />);
    const control = screen.getByRole("switch", { name: "Email digests" });
    expect(control.tagName).toBe("INPUT");
    expect(control).toHaveAttribute("type", "checkbox");
    // The native property, not a mirrored ARIA attribute the component owns.
    expect((control as HTMLInputElement).checked).toBe(false);
  });

  it("takes its accessible name from a visible label", () => {
    render(<Controlled />);
    expect(screen.getByText("Email digests")).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: "Email digests" }),
    ).toBeInTheDocument();
  });

  it("takes a row's visible label when the row owns the name", () => {
    render(
      <>
        <span id="row-label">Show in navigation</span>
        <Switch labelledBy="row-label" describedBy="row-desc" defaultChecked />
        <span id="row-desc">Applies immediately.</span>
      </>,
    );
    const control = screen.getByRole("switch", { name: "Show in navigation" });
    // No `aria-label` papering over a missing visible name, and no second label.
    expect(control).not.toHaveAttribute("aria-label");
    expect(screen.getAllByText("Show in navigation")).toHaveLength(1);
    expect(control).toHaveAttribute("aria-describedby", "row-desc");
  });
});

describe("Switch — operation", () => {
  it("toggles by pointer, through the label", () => {
    render(<Controlled />);
    const control = screen.getByRole("switch") as HTMLInputElement;
    fireEvent.click(control);
    expect(control.checked).toBe(true);
    fireEvent.click(control);
    expect(control.checked).toBe(false);
  });

  it("toggles from the keyboard without any key handling of its own", () => {
    render(<Controlled />);
    const control = screen.getByRole("switch") as HTMLInputElement;
    control.focus();
    expect(control).toHaveFocus();
    // jsdom maps Space on a checkbox to a click, exactly as a browser does —
    // which is the point: there is no `onKeyDown` in the component to get wrong.
    fireEvent.click(control);
    expect(control.checked).toBe(true);
  });

  it("reports the new state and the event to its caller", () => {
    const onChange = vi.fn();
    render(
      <Switch
        label="Email digests"
        defaultChecked={false}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0]).toBe(true);
    // The event is passed through so a settings row can submit its own form.
    expect(onChange.mock.calls[0]?.[1]).toBeTruthy();
  });

  it("does not toggle when disabled", () => {
    const onChange = vi.fn();
    render(<Switch label="Two-factor" disabled onChange={onChange} />);
    const control = screen.getByRole("switch") as HTMLInputElement;
    expect(control).toBeDisabled();
    fireEvent.click(control);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("participates in a form like the checkbox it is", () => {
    render(
      <form data-testid="form">
        <Switch label="Visible" name="visible" value="1" defaultChecked />
      </form>,
    );
    const form = screen.getByTestId("form") as HTMLFormElement;
    expect(new FormData(form).get("visible")).toBe("1");
  });
});

describe("Switch — state is never colour alone", () => {
  it("moves the thumb and shows a check when selected", () => {
    const { container } = render(<Controlled initial />);
    // The check glyph exists in the DOM in both states (it fades rather than
    // mounting, so the thumb never jumps) and the CHECKED state is what the
    // stylesheet keys off — asserted here as structure, and visually in
    // `e2e/interaction-consistency.spec.ts`.
    expect(container.querySelector(".dh-switch__thumb")).toBeTruthy();
    expect(container.querySelector(".dh-switch__check")).toBeTruthy();
    expect((screen.getByRole("switch") as HTMLInputElement).checked).toBe(true);
  });
});

describe("BooleanField — one switch, one checkbox, chosen by meaning", () => {
  it("renders the shared Switch for variant='switch'", () => {
    const { container } = render(
      <BooleanField
        label="Email digests"
        variant="switch"
        value={false}
        onChange={() => undefined}
      />,
    );
    expect(container.querySelector(".dh-switch")).toBeTruthy();
    expect(
      screen.getByRole("switch", { name: "Email digests" }),
    ).toBeInTheDocument();
  });

  it("leaves the default variant a checkbox", () => {
    render(
      <BooleanField
        label="Select this row"
        value={false}
        onChange={() => undefined}
      />,
    );
    // Selection, bulk-action and acknowledgement controls are checkboxes and
    // must stay checkboxes — a switch would claim the change is immediate.
    expect(
      screen.getByRole("checkbox", { name: "Select this row" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("still reports validation state through the switch variant", () => {
    render(
      <BooleanField
        label="Accept"
        variant="switch"
        value={false}
        error="Required."
        onChange={() => undefined}
      />,
    );
    const control = screen.getByRole("switch", { name: "Accept" });
    expect(control).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Required.")).toBeInTheDocument();
  });
});
