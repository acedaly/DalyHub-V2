/**
 * DHDS-10 — the `meta` presentation, which is the phase's visual thesis in one
 * prop.
 *
 * *At rest a metadata run reads as INFORMATION; the manipulability is latent
 * until the owner engages with the row.* The whole of §6 and §40 rests on it,
 * and the failure mode it prevents is not subtle — four chevrons and a column
 * of italic "Not set" per row, fifty rows down a list.
 *
 * These are contract tests, not pixel tests. What is protected is that the
 * affordances join the ONE reveal grammar (`.dh-action-reveal`, DHDS-08) rather
 * than being hidden by a per-surface stylesheet rule, and that the VALUE never
 * joins them — a row that blanked its dates until hover would be unreadable.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  InlineDateField,
  InlinePickerField,
  InlineSelectField,
  InlineTextField,
} from "~/shared/inline-edit";

const STATUSES = [
  { value: "planned", label: "Planned" },
  { value: "active", label: "Active" },
];

function shell(container: HTMLElement): HTMLElement {
  const node = container.querySelector(".dh-inline-edit");
  if (node === null) throw new Error("no inline field rendered");
  return node as HTMLElement;
}

describe("DHDS-10 — the meta presentation", () => {
  it("is OFF by default, so a record's own summary stays as loud as it was", () => {
    const { container } = render(
      <InlineSelectField
        label="Status"
        value="active"
        options={STATUSES}
        onSave={async () => ({ ok: true })}
      />,
    );
    expect(shell(container)).not.toHaveAttribute("data-presentation");
    expect(container.querySelector(".dh-inline-select__caret")).not.toHaveClass(
      "dh-action-reveal",
    );
  });

  it("hands the SELECT field's caret to the shared reveal", () => {
    const { container } = render(
      <InlineSelectField
        label="Status"
        value="active"
        options={STATUSES}
        onSave={async () => ({ ok: true })}
        presentation="meta"
      />,
    );
    expect(shell(container)).toHaveAttribute("data-presentation", "meta");
    expect(container.querySelector(".dh-inline-select__caret")).toHaveClass(
      "dh-action-reveal",
    );
  });

  it("hands the PICKER field's caret to the same reveal", () => {
    const { container } = render(
      <InlinePickerField
        label="Area"
        value="a-home"
        options={[{ id: "a-home", label: "Home" }]}
        onSave={async () => ({ ok: true })}
        presentation="meta"
      />,
    );
    expect(container.querySelector(".dh-inline-select__caret")).toHaveClass(
      "dh-action-reveal",
    );
  });

  it("hands an EMPTY value's invitation to the reveal, on any field", () => {
    const { container } = render(
      <InlineDateField
        label="Due date"
        value={null}
        emptyLabel="No due date"
        onSave={async () => ({ ok: true })}
        presentation="meta"
      />,
    );
    // "No due date · Unassigned · No priority" repeated down a list is the
    // product announcing that a dimension was NOT used (§25).
    expect(container.querySelector(".dh-inline-edit__empty")).toHaveClass(
      "dh-action-reveal",
    );
  });

  it("never hides the VALUE itself", () => {
    render(
      <InlineTextField
        label="Location"
        value="Driveway"
        onSave={async () => ({ ok: true })}
        presentation="meta"
      />,
    );
    // The value is the information the row exists to carry. Only the
    // affordances wait to be looked for.
    expect(screen.getByText("Driveway")).toBeInTheDocument();
    expect(
      screen.getByText("Driveway").closest(".dh-action-reveal"),
    ).toBeNull();
  });

  it("changes nothing about the control's semantics", () => {
    const { rerender } = render(
      <InlineSelectField
        label="Status"
        value="active"
        options={STATUSES}
        onSave={async () => ({ ok: true })}
      />,
    );
    const before = screen.getByRole("button", { name: "Status: Active" });
    const loudAria = before.getAttribute("aria-haspopup");

    rerender(
      <InlineSelectField
        label="Status"
        value="active"
        options={STATUSES}
        onSave={async () => ({ ok: true })}
        presentation="meta"
      />,
    );
    // Quiet is a property of the PAINT. The accessible name, the role and the
    // menu-button relationship are identical either way.
    const after = screen.getByRole("button", { name: "Status: Active" });
    expect(after.getAttribute("aria-haspopup")).toBe(loudAria);
    expect(after.getAttribute("aria-expanded")).toBe("false");
  });
});
