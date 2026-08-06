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
