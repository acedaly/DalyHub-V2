/**
 * DHDS-10 — `InlinePickerField`, tested through what an owner does.
 *
 * This is the field the phase added, and what it is FOR is the thing to
 * protect: choosing one record out of many, where the record is shown, without
 * a Drawer. So the assertions are the interaction contract — how you get in,
 * what the surface is, what the save posts, what a refusal leaves behind, and
 * where the keyboard ends up — rather than the markup that happens to express
 * it today.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { InlinePickerField } from "~/shared/inline-edit";

const AREAS = [
  { id: "a-home", label: "Home & Property", support: "Area" },
  { id: "a-work", label: "Work & Career", support: "Area" },
  { id: "g-launch", label: "Launch the site", support: "Goal" },
];

function open(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
}

describe("InlinePickerField", () => {
  it("reads as a VALUE until it is activated, and names its field", () => {
    render(
      <InlinePickerField
        label="Area or Goal"
        value="a-home"
        options={AREAS}
        onSave={async () => ({ ok: true })}
      />,
    );
    // "<field>: <value>" — a bare "Home & Property" tells a screen-reader user
    // nothing about what pressing it would change.
    expect(
      screen.getByRole("button", { name: "Area or Goal: Home & Property" }),
    ).toBeInTheDocument();
    // Nothing floats until it is asked for.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("declares a DIALOG rather than a menu, and says when it is open", async () => {
    render(
      <InlinePickerField
        label="Area or Goal"
        value="a-home"
        options={AREAS}
        onSave={async () => ({ ok: true })}
      />,
    );
    const trigger = screen.getByRole("button", {
      name: "Area or Goal: Home & Property",
    });
    // A picker is a `role="dialog"` containing a combobox and a listbox
    // (DHDS-09) — not a menu, and not flattened into one.
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);
    await waitFor(() =>
      expect(trigger).toHaveAttribute("aria-expanded", "true"),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("saves the chosen record's id and closes", async () => {
    const onSave = vi.fn(async () => ({ ok: true }) as const);
    render(
      <InlinePickerField
        label="Area or Goal"
        value="a-home"
        options={AREAS}
        onSave={onSave}
      />,
    );
    open("Area or Goal: Home & Property");
    fireEvent.click(screen.getByRole("option", { name: /Work & Career/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith("a-work"));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("keeps the previous value and states the reason when the server says no", async () => {
    const onSave = vi.fn(async () => ({
      ok: false as const,
      message: "That Area is archived.",
    }));
    render(
      <InlinePickerField
        label="Area or Goal"
        value="a-home"
        options={AREAS}
        onSave={onSave}
      />,
    );
    open("Area or Goal: Home & Property");
    fireEvent.click(screen.getByRole("option", { name: /Work & Career/ }));

    // The refusal is the server's own words, and the field still holds the
    // value the record actually has. Nothing was optimistically painted.
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That Area is archived.",
    );
    expect(
      screen.getByRole("button", { name: "Area or Goal: Home & Property" }),
    ).toBeInTheDocument();
  });

  it("returns focus to the value when the picker is dismissed", async () => {
    render(
      <InlinePickerField
        label="Area or Goal"
        value="a-home"
        options={AREAS}
        onSave={async () => ({ ok: true })}
      />,
    );
    const trigger = screen.getByRole("button", {
      name: "Area or Goal: Home & Property",
    });
    fireEvent.click(trigger);
    await screen.findByRole("dialog");
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
    // Focus never lands on `<body>`: the next Tab continues from the field the
    // owner was standing on.
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("offers the clear command only when there is something to clear", async () => {
    const onSave = vi.fn(async () => ({ ok: true }) as const);
    const { rerender } = render(
      <InlinePickerField
        label="Project or Area"
        value=""
        options={AREAS}
        onSave={onSave}
        emptyLabel="Inbox"
        clearable
        clearLabel="Move to Inbox"
      />,
    );
    open("Project or Area: Inbox");
    expect(
      screen.queryByRole("option", { name: /Move to Inbox/ }),
    ).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });

    rerender(
      <InlinePickerField
        label="Project or Area"
        value="a-home"
        options={AREAS}
        onSave={onSave}
        emptyLabel="Inbox"
        clearable
        clearLabel="Move to Inbox"
      />,
    );
    open("Project or Area: Home & Property");
    fireEvent.click(screen.getByRole("option", { name: /Move to Inbox/ }));
    // Clearing posts the empty sentinel, never a magic id.
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(""));
  });

  it("asks its caller for a first page when it OPENS, not when it renders", async () => {
    const onOpen = vi.fn();
    render(
      <InlinePickerField
        label="Area or Goal"
        value="a-home"
        options={AREAS}
        onSave={async () => ({ ok: true })}
        onSearch={() => {}}
        onOpen={onOpen}
      />,
    );
    // The whole performance contract: a collection of rows costs no requests
    // until an owner opens one of them (DHDS-10 §43).
    expect(onOpen).not.toHaveBeenCalled();
    open("Area or Goal: Home & Property");
    await waitFor(() => expect(onOpen).toHaveBeenCalledTimes(1));
  });

  it("renders a read-only value as text, with no control and no tab stop", () => {
    render(
      <InlinePickerField
        label="Area or Goal"
        value="a-home"
        options={AREAS}
        onSave={async () => ({ ok: true })}
        readOnly
      />,
    );
    // A value that cannot be changed must not look like one that can — the
    // archived-record rule every field in this package follows.
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Home & Property")).toBeInTheDocument();
  });
});
