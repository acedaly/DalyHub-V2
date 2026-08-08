/**
 * DS-06 — the select control: keyboard combobox operation, single + multi.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { SelectField } from "~/shared/forms";

const OPTIONS = [
  { value: "todo", label: "To do" },
  { value: "doing", label: "In progress" },
  { value: "done", label: "Done" },
];

describe("SelectField (single)", () => {
  it("opens, moves and selects with the keyboard", () => {
    function H() {
      const [value, setValue] = useState("");
      return (
        <SelectField
          label="Status"
          options={OPTIONS}
          value={value}
          onChange={setValue}
        />
      );
    }
    render(<H />);
    const input = screen.getByRole("combobox", { name: "Status" });
    fireEvent.focus(input);
    expect(input).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBeTruthy();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input).toHaveValue("To do");
  });

  it("puts the field's name on the CONTROL only, never on a wrapper too", () => {
    /*
     * Regression: the field root was a `role="group"` labelled by the same
     * element as the combobox, so "Status" named two nested elements. A screen
     * reader announced "Status group, Status combobox", and every by-name query
     * for the control — including `getByLabelText` and Playwright's
     * `getByLabel` — matched both and failed as ambiguous. A single select
     * contains one control; the name belongs to the thing you operate.
     */
    const { container } = render(
      <SelectField
        label="Status"
        options={OPTIONS}
        value=""
        onChange={() => {}}
      />,
    );
    expect(screen.getAllByLabelText("Status")).toHaveLength(1);
    expect(container.querySelector('[role="group"]')).toBeNull();
  });

  it("closes on Escape without changing the value", () => {
    render(
      <SelectField
        label="Status"
        options={OPTIONS}
        value=""
        onChange={() => {}}
      />,
    );
    const input = screen.getByRole("combobox", { name: "Status" });
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("shows an unavailable note for a stale value with no option", () => {
    render(
      <SelectField
        label="Status"
        options={OPTIONS}
        value="ghost"
        onChange={() => {}}
      />,
    );
    expect(screen.getByText(/no longer\s+available/)).toBeInTheDocument();
  });
});

describe("SelectField (multi)", () => {
  it("KEEPS a labelled group, which genuinely holds chips AND a control", () => {
    // The counterpart to the single-select assertion above. Here the wrapper
    // contains more than one named thing, so naming it is correct rather than
    // duplicative.
    function H() {
      const [value, setValue] = useState<readonly string[]>(["todo"]);
      return (
        <SelectField
          label="Labels"
          multiple
          options={OPTIONS}
          value={value}
          onChange={setValue}
        />
      );
    }
    const { container } = render(<H />);
    expect(container.querySelector('[role="group"]')).not.toBeNull();
  });

  it("adds and removes selections", () => {
    function H() {
      const [value, setValue] = useState<readonly string[]>([]);
      return (
        <SelectField
          label="Labels"
          multiple
          options={OPTIONS}
          value={value}
          onChange={setValue}
        />
      );
    }
    render(<H />);
    const input = screen.getByRole("combobox", { name: "Labels" });
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    // A chip for the chosen option appears with a remove button.
    const remove = screen.getByRole("button", { name: /Remove To do/ });
    expect(remove).toBeInTheDocument();
    fireEvent.click(remove);
    expect(
      screen.queryByRole("button", { name: /Remove To do/ }),
    ).not.toBeInTheDocument();
  });
});

/**
 * DS-16 — replacing an existing selection.
 *
 * The audit found that a single-select could not be re-picked directly: the
 * chosen option's label was reflected into the input AND treated as a search
 * query, so reopening a field that already had a value offered exactly one
 * option — the one already chosen. Every one of these asserts a user action, not
 * an internal flag.
 */
describe("SelectField — replacing a selection without clearing it first", () => {
  function Host({ initial = "" }: { initial?: string }) {
    const [value, setValue] = useState(initial);
    return (
      <SelectField
        label="Status"
        options={OPTIONS}
        value={value}
        onChange={setValue}
      />
    );
  }

  it("offers EVERY option when reopening a field that already has a value", () => {
    render(<Host initial="todo" />);
    const input = screen.getByRole("combobox", { name: "Status" });
    fireEvent.focus(input);
    expect(screen.getAllByRole("option")).toHaveLength(OPTIONS.length);
  });

  it("lets the user pick a different option directly", () => {
    render(<Host initial="todo" />);
    const input = screen.getByRole("combobox", { name: "Status" });
    fireEvent.focus(input);
    fireEvent.click(screen.getByRole("option", { name: /Done/ }));
    expect(input).toHaveValue("Done");
  });

  it("offers every option again after that second choice", () => {
    // The regression this guards: committing re-reflects a label into the input,
    // so if the commit path forgot to mark the text as a reflection the field
    // would narrow itself all over again on the very next open.
    render(<Host initial="todo" />);
    const input = screen.getByRole("combobox", { name: "Status" });
    fireEvent.focus(input);
    fireEvent.click(screen.getByRole("option", { name: /In progress/ }));
    fireEvent.focus(input);
    expect(screen.getAllByRole("option")).toHaveLength(OPTIONS.length);
  });

  it("still filters once the user actually types", () => {
    render(<Host initial="todo" />);
    const input = screen.getByRole("combobox", { name: "Status" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "prog" } });
    const shown = screen.getAllByRole("option").map((o) => o.textContent);
    expect(shown).toHaveLength(1);
    expect(shown[0]).toContain("In progress");
  });

  it("does not treat an ABANDONED query as a filter next time", () => {
    render(<Host initial="todo" />);
    const input = screen.getByRole("combobox", { name: "Status" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "zzz" } });
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.focus(input);
    expect(screen.getAllByRole("option")).toHaveLength(OPTIONS.length);
  });

  it("asks an async consumer for its unfiltered list when reopened", () => {
    // An async select's `options` are whatever the caller last searched for, so
    // reopening has to reset the caller's query too — otherwise the narrowing
    // simply moves from the client to the server.
    const onSearch = vi.fn();
    function AsyncHost() {
      const [value, setValue] = useState("todo");
      return (
        <SelectField
          label="Status"
          options={OPTIONS}
          value={value}
          onChange={setValue}
          onSearch={onSearch}
        />
      );
    }
    render(<AsyncHost />);
    fireEvent.focus(screen.getByRole("combobox", { name: "Status" }));
    expect(onSearch).toHaveBeenCalledWith("");
  });

  it("keeps an EMPTY optional field genuinely empty — no placeholder value", () => {
    render(<Host />);
    const input = screen.getByRole("combobox", { name: "Status" });
    // The prompt lives in the placeholder attribute, where it cannot be chosen
    // and cannot be submitted; the field's value is the empty string.
    expect(input).toHaveValue("");
    expect(input).toHaveAttribute("placeholder");
    fireEvent.focus(input);
    for (const option of screen.getAllByRole("option")) {
      expect(OPTIONS.map((o) => o.label)).toContain(
        option.textContent?.replace("✓", "").trim(),
      );
    }
  });
});

/**
 * SETTINGS-LABEL — one setting, one control, one label.
 *
 * A `SettingsRow` already renders the setting's name beside its control, so a
 * field that ALSO renders its own label prints the same words twice in one row
 * — which is exactly what "Default task destination" did, and what the August
 * 2026 interaction audit recorded as finding 7. `labelledBy` lets the row own
 * the visible name without the control losing a real, visible, associated one.
 */
describe("SelectField — a label owned from outside the field", () => {
  function renderRowOwned() {
    return render(
      <>
        <span id="row-label">Default task destination</span>
        <span id="row-description">Inbox is the fast default.</span>
        <SelectField
          label="Default task destination"
          labelledBy="row-label"
          describedBy="row-description"
          options={OPTIONS}
          value=""
          onChange={() => {}}
        />
      </>,
    );
  }

  it("renders no second label of its own", () => {
    const { container } = renderRowOwned();
    expect(container.querySelectorAll(".dh-field__label-text")).toHaveLength(0);
    // The name is still on screen — once, in the row that owns it.
    expect(screen.getAllByText("Default task destination")).toHaveLength(1);
  });

  it("keeps exactly one accessible name, taken from the visible row label", () => {
    renderRowOwned();
    const input = screen.getByRole("combobox", {
      name: "Default task destination",
    });
    expect(input).toHaveAccessibleName("Default task destination");
  });

  it("carries the row's supporting text as the control's description", () => {
    renderRowOwned();
    expect(
      screen.getByRole("combobox", { name: "Default task destination" }),
    ).toHaveAccessibleDescription("Inbox is the fast default.");
  });

  it("still composes its own help text with the row's description", () => {
    render(
      <>
        <span id="row-label">Default task destination</span>
        <span id="row-description">Inbox is the fast default.</span>
        <SelectField
          label="Default task destination"
          labelledBy="row-label"
          describedBy="row-description"
          help="Search Projects and Areas."
          options={OPTIONS}
          value=""
          onChange={() => {}}
        />
      </>,
    );
    const description = screen
      .getByRole("combobox", { name: "Default task destination" })
      .getAttribute("aria-describedby");
    expect(description).toContain("row-description");
    expect(description?.split(" ").length).toBe(2);
  });

  it("still renders its own label when nothing outside names it", () => {
    const { container } = render(
      <SelectField
        label="Status"
        options={OPTIONS}
        value=""
        onChange={() => {}}
      />,
    );
    expect(container.querySelectorAll(".dh-field__label-text")).toHaveLength(1);
    expect(
      screen.getByRole("combobox", { name: "Status" }),
    ).toHaveAccessibleName("Status");
  });
});
