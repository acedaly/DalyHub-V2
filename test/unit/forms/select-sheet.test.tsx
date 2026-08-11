/**
 * ASSET-03 — the COMPACT presentation of the shared select.
 *
 * The rules under test are the DS-16 selection rules, restated for the phone
 * presentation, because the presentation is where they are easiest to lose:
 * the field starts genuinely empty, the prompt is never a pickable row, an
 * existing choice is replaced directly (no clear-first step), grouping changes
 * nothing but the headings, and the control keeps its name, its required state,
 * its error association and its `controlRef` — the last of which is what makes
 * "jump to the first invalid field" reach a select at all.
 */

import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { SelectField, groupSelectOptions } from "~/shared/forms";
import { SelectSheetControl } from "~/shared/forms/SelectSheetControl";
import type { FocusableControl } from "~/shared/forms";

const OPTIONS = [
  { value: "vehicle", label: "Vehicle", group: "Physical" },
  { value: "trailer", label: "Trailer or camper", group: "Physical" },
  { value: "insurance", label: "Insurance", group: "Documents and cover" },
  { value: "other", label: "Other", group: "Anything else" },
];

function Host({
  initial = "",
  required = true,
}: {
  readonly initial?: string;
  readonly required?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <SelectSheetControl
      label="Type"
      required={required}
      placeholder="Choose a type…"
      sheetTitle="What kind of asset?"
      options={OPTIONS}
      value={value}
      onChange={setValue}
    />
  );
}

const trigger = () => screen.getByRole("button", { name: /^Type/ });

describe("the compact select trigger", () => {
  it("starts genuinely empty, showing the prompt as a prompt", () => {
    render(<Host />);
    expect(trigger()).toHaveTextContent("Choose a type…");
    expect(trigger()).toHaveAttribute("data-placeholder", "true");
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
  });

  it("names itself with the field label and its own value", () => {
    render(<Host initial="vehicle" />);
    // "Type Vehicle" — never a bare value with no idea what it belongs to.
    expect(
      screen.getByRole("button", { name: "Type Vehicle" }),
    ).toBeInTheDocument();
  });

  it("exposes the required state and associates the error", () => {
    render(
      <SelectSheetControl
        label="Type"
        required
        options={OPTIONS}
        value=""
        onChange={() => {}}
        error="Choose a type"
      />,
    );
    const control = trigger();
    // A `button` supports neither aria-invalid nor aria-errormessage, so the
    // problem travels as the control's description — announced on focus.
    const described = control.getAttribute("aria-describedby");
    expect(described).toBeTruthy();
    const ids = (described as string).split(" ");
    const text = ids
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" ");
    expect(text).toContain("Choose a type");
    // The required cue is real, visible text in the label row.
    expect(screen.getByText("(required)")).toBeInTheDocument();
  });

  it("hands the form host a focusable control to jump to", () => {
    let control: FocusableControl | null = null;
    render(
      <SelectSheetControl
        label="Type"
        options={OPTIONS}
        value=""
        onChange={() => {}}
        controlRef={(node) => {
          control = node;
        }}
      />,
    );
    expect(control).not.toBeNull();
    (control as unknown as HTMLElement).focus();
    expect(trigger()).toHaveFocus();
  });
});

describe("the compact select sheet", () => {
  it("opens a labelled dialog of real, worded option rows", () => {
    render(<Host />);
    fireEvent.click(trigger());
    const sheet = screen.getByRole("dialog", { name: "What kind of asset?" });
    expect(
      within(sheet).getByRole("button", { name: /Trailer or camper/ }),
    ).toBeInTheDocument();
    expect(trigger()).toHaveAttribute("aria-expanded", "true");
  });

  it("offers no placeholder row — the prompt cannot be picked", () => {
    render(<Host />);
    fireEvent.click(trigger());
    const sheet = screen.getByRole("dialog");
    expect(
      within(sheet).queryByRole("button", { name: /Choose a type/ }),
    ).toBeNull();
  });

  it("renders one group per heading, in presentation order only", () => {
    render(<Host />);
    fireEvent.click(trigger());
    const headings = screen
      .getAllByRole("heading", { level: 3 })
      .map((node) => node.textContent);
    expect(headings).toEqual([
      "Physical",
      "Documents and cover",
      "Anything else",
    ]);
  });

  it("commits the option's VALUE and closes", () => {
    const onChange = vi.fn();
    render(
      <SelectSheetControl
        label="Type"
        options={OPTIONS}
        value=""
        onChange={onChange}
      />,
    );
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole("button", { name: /Trailer or camper/ }));
    expect(onChange).toHaveBeenCalledWith("trailer");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("replaces an existing selection directly, with the WHOLE list offered", () => {
    render(<Host initial="vehicle" />);
    fireEvent.click(trigger());
    const sheet = screen.getByRole("dialog");
    // Every option is present — no clear-first step, and no list narrowed to
    // the one already chosen (the DS-16 defect, restated for the sheet).
    for (const option of OPTIONS) {
      expect(
        within(sheet).getByRole("button", { name: new RegExp(option.label) }),
      ).toBeInTheDocument();
    }
    // Selection is announced, not merely coloured.
    expect(
      within(sheet).getByRole("button", { name: /Vehicle/ }),
    ).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(within(sheet).getByRole("button", { name: /^Insurance/ }));
    expect(trigger()).toHaveTextContent("Insurance");
  });

  it("lets an OPTIONAL field return to empty, and a required one never can", () => {
    const { unmount } = render(<Host initial="vehicle" required={false} />);
    fireEvent.click(trigger());
    // DS-17 — the command names the FIELD, so two selects on one surface are two
    // distinguishable commands rather than two rows reading "Clear selection".
    fireEvent.click(screen.getByRole("button", { name: "Clear type" }));
    expect(trigger()).toHaveTextContent("Choose a type…");
    unmount();

    render(<Host initial="vehicle" />);
    fireEvent.click(trigger());
    expect(screen.queryByRole("button", { name: "Clear type" })).toBeNull();
  });

  it("closes on Escape without changing the value", () => {
    render(<Host initial="vehicle" />);
    fireEvent.click(trigger());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger()).toHaveTextContent("Vehicle");
  });
});

describe("groupSelectOptions", () => {
  it("keeps presentation order and collects each heading once", () => {
    expect(groupSelectOptions(OPTIONS).map((g) => g.group)).toEqual([
      "Physical",
      "Documents and cover",
      "Anything else",
    ]);
  });

  it("treats ungrouped options as one unheaded group", () => {
    const grouped = groupSelectOptions([
      { value: "a", label: "A" },
      { value: "b", label: "B" },
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].group).toBeNull();
    expect(grouped[0].options).toHaveLength(2);
  });
});

describe("SelectField's responsive dispatch", () => {
  it("stays the combobox on a wide viewport, even when it opted in", () => {
    // jsdom's matchMedia reports no match, i.e. a desktop width: the compact
    // presentation must be an ADDITION for phones, never a replacement.
    render(
      <SelectField
        label="Type"
        options={OPTIONS}
        value=""
        onChange={() => {}}
        sheetOnCompact
      />,
    );
    expect(screen.getByRole("combobox", { name: "Type" })).toBeInTheDocument();
  });
});
