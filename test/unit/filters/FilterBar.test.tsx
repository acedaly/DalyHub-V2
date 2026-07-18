/**
 * DS-07 — the Filter Bar add/edit flow, chips and saved views.
 *
 * Proves: adding a filter; incompatible operators are unavailable; no-value
 * operators omit the value control; editing; removing; clear-all; chips show
 * human-readable values; selecting a saved view signals its id; and the modified
 * indicator appears when the expression diverges from the active view.
 */

import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { FilterBar } from "~/shared/filters";
import type {
  FilterExpression,
  FilterFieldRegistry,
  SavedViewAdapter,
} from "~/shared/filters";

const FIELDS: FilterFieldRegistry = [
  { id: "title", label: "Title", type: "text" },
  {
    id: "status",
    label: "Status",
    type: "enum",
    options: [
      { value: "open", label: "Open" },
      { value: "done", label: "Done" },
    ],
  },
  { id: "starred", label: "Starred", type: "boolean" },
  { id: "due", label: "Due", type: "date" },
];

function Harness({
  initial,
  savedViews,
}: {
  initial?: FilterExpression;
  savedViews?: SavedViewAdapter;
}) {
  const [expression, setExpression] = useState<FilterExpression>(
    initial ?? { mode: "and", clauses: [] },
  );
  return (
    <FilterBar
      fields={FIELDS}
      expression={expression}
      onChange={setExpression}
      savedViews={savedViews}
    />
  );
}

function openAddEditor() {
  fireEvent.click(screen.getByRole("button", { name: /Add filter/ }));
  return screen.getByRole("dialog", { name: "Add filter" });
}

describe("FilterBar — add flow", () => {
  it("adds a text filter and shows a readable chip", () => {
    render(<Harness />);
    const dialog = openAddEditor();
    // Default field is the first (Title) with a text value control.
    fireEvent.change(within(dialog).getByRole("textbox"), {
      target: { value: "launch" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add filter" }));

    const chips = screen.getByRole("list", { name: "Active filters" });
    expect(within(chips).getByText("Title")).toBeInTheDocument();
    expect(within(chips).getByText("contains")).toBeInTheDocument();
    expect(within(chips).getByText("launch")).toBeInTheDocument();
  });

  it("offers only type-appropriate operators (no 'between' for boolean)", () => {
    render(<Harness />);
    const dialog = openAddEditor();
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Field" }), {
      target: { value: "starred" },
    });
    const operator = within(dialog).getByRole("combobox", {
      name: "Condition",
    });
    const options = within(operator)
      .getAllByRole("option")
      .map((o) => (o as HTMLOptionElement).value);
    expect(options).toEqual(["is_true", "is_false"]);
  });

  it("omits the value control for a no-value operator", () => {
    render(<Harness />);
    const dialog = openAddEditor();
    fireEvent.change(
      within(dialog).getByRole("combobox", { name: "Condition" }),
      {
        target: { value: "is_empty" },
      },
    );
    expect(within(dialog).queryByRole("textbox")).toBeNull();
  });

  it("shows enum option labels in the chip, not raw values", () => {
    render(<Harness />);
    const dialog = openAddEditor();
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Field" }), {
      target: { value: "status" },
    });
    // operator defaults to 'is'; the value select (named "Value") shows options.
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Value" }), {
      target: { value: "done" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add filter" }));
    const chips = screen.getByRole("list", { name: "Active filters" });
    expect(within(chips).getByText("Done")).toBeInTheDocument();
  });
});

describe("FilterBar — edit, remove, clear", () => {
  const initial: FilterExpression = {
    mode: "and",
    clauses: [{ id: "c1", field: "title", operator: "contains", value: "run" }],
  };

  it("edits an existing clause, preserving its identity", () => {
    render(<Harness initial={initial} />);
    fireEvent.click(screen.getByRole("button", { name: /Edit filter/ }));
    const dialog = screen.getByRole("dialog", { name: "Edit filter" });
    fireEvent.change(within(dialog).getByRole("textbox"), {
      target: { value: "walk" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Update" }));
    const chips = screen.getByRole("list", { name: "Active filters" });
    expect(within(chips).getByText("walk")).toBeInTheDocument();
    expect(within(chips).queryByText("run")).toBeNull();
  });

  it("removes a clause", () => {
    render(<Harness initial={initial} />);
    fireEvent.click(screen.getByRole("button", { name: /Remove filter/ }));
    expect(screen.queryByRole("list", { name: "Active filters" })).toBeNull();
  });

  it("clears all clauses", () => {
    render(
      <Harness
        initial={{
          mode: "and",
          clauses: [
            { id: "c1", field: "title", operator: "contains", value: "a" },
            { id: "c2", field: "title", operator: "contains", value: "b" },
          ],
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(screen.queryByRole("list", { name: "Active filters" })).toBeNull();
  });
});

describe("FilterBar — saved views", () => {
  it("signals selection of a saved view by id", () => {
    const onSelect = vi.fn();
    const adapter: SavedViewAdapter = {
      views: [
        { id: "v1", name: "Open", expression: { mode: "and", clauses: [] } },
      ],
      onSelect,
    };
    render(<Harness savedViews={adapter} />);
    fireEvent.change(screen.getByLabelText("Saved view"), {
      target: { value: "v1" },
    });
    expect(onSelect).toHaveBeenCalledWith("v1");
  });

  it("shows a modified indicator when the expression diverges from the active view", () => {
    const adapter: SavedViewAdapter = {
      views: [
        {
          id: "v1",
          name: "Open",
          expression: {
            mode: "and",
            clauses: [
              { id: "0", field: "status", operator: "is", value: "open" },
            ],
          },
        },
      ],
      activeViewId: "v1",
    };
    render(
      <Harness
        initial={{
          mode: "and",
          clauses: [
            { id: "x", field: "status", operator: "is", value: "done" },
          ],
        }}
        savedViews={adapter}
      />,
    );
    expect(screen.getByText("Modified")).toBeInTheDocument();
  });
});
