/**
 * DS-16 — the shared inline fields, tested through what a user does.
 *
 * Every assertion here is an interaction contract the modules now inherit rather
 * than reimplement: how you get in, how you get out, what happens to your words
 * when the server says no, and where the keyboard focus lands afterwards.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  InlineDateField,
  InlineSelectField,
  InlineTextField,
} from "~/shared/inline-edit";

const STATUSES = [
  { value: "planned", label: "Planned" },
  { value: "active", label: "Active" },
  { value: "on_hold", label: "On hold" },
];

describe("InlineTextField", () => {
  it("reads as a value until it is activated", () => {
    render(
      <InlineTextField
        label="Area name"
        value="Health"
        onSave={async () => ({ ok: true })}
      />,
    );
    // The affordance names its FIELD as well as its value, so a screen-reader
    // user knows what pressing it would change.
    expect(
      screen.getByRole("button", { name: "Area name: Health" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("saves on Enter", async () => {
    const onSave = vi.fn(async () => ({ ok: true }) as const);
    render(
      <InlineTextField label="Area name" value="Health" onSave={onSave} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Area name: Health" }));
    const input = screen.getByRole("textbox", { name: "Area name" });
    fireEvent.change(input, { target: { value: "Health & fitness" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith("Health & fitness"),
    );
  });

  it("cancels on Escape and returns focus to the value", async () => {
    const onSave = vi.fn(async () => ({ ok: true }) as const);
    render(
      <InlineTextField label="Area name" value="Health" onSave={onSave} />,
    );
    const trigger = screen.getByRole("button", { name: "Area name: Health" });
    fireEvent.click(trigger);
    const input = screen.getByRole("textbox", { name: "Area name" });
    fireEvent.change(input, { target: { value: "Discarded" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onSave).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Area name: Health" }),
      ).toHaveFocus(),
    );
  });

  it("does not spend a request on an unchanged value", async () => {
    const onSave = vi.fn(async () => ({ ok: true }) as const);
    render(
      <InlineTextField label="Area name" value="Health" onSave={onSave} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Area name: Health" }));
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Area name" }), {
      key: "Enter",
    });
    await waitFor(() =>
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument(),
    );
    expect(onSave).not.toHaveBeenCalled();
  });

  it("KEEPS the attempted text when the server refuses it", async () => {
    render(
      <InlineTextField
        label="Area name"
        value="Health"
        onSave={async () => ({ ok: false, message: "Give this Area a name." })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Area name: Health" }));
    const input = screen.getByRole("textbox", { name: "Area name" });
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });

    await screen.findByRole("alert");
    expect(screen.getByText("Give this Area a name.")).toBeInTheDocument();
    // Still open, still holding exactly what was typed.
    expect(screen.getByRole("textbox", { name: "Area name" })).toHaveValue(
      "   ",
    );
  });

  it("keeps the draft when the request itself throws", async () => {
    render(
      <InlineTextField
        label="Area name"
        value="Health"
        onSave={async () => {
          throw new Error("offline");
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Area name: Health" }));
    const input = screen.getByRole("textbox", { name: "Area name" });
    fireEvent.change(input, { target: { value: "Typed while offline" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await screen.findByRole("alert");
    expect(screen.getByRole("textbox", { name: "Area name" })).toHaveValue(
      "Typed while offline",
    );
  });

  it("renders a read-only value as plain text with no control", () => {
    render(
      <InlineTextField
        label="Area name"
        value="Archived area"
        readOnly
        onSave={async () => ({ ok: true })}
      />,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Archived area")).toBeInTheDocument();
  });

  it("invites completion when the value is empty", () => {
    render(
      <InlineTextField
        label="Nickname"
        value=""
        emptyLabel="Add a nickname"
        onSave={async () => ({ ok: true })}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Nickname: Add a nickname" }),
    ).toBeInTheDocument();
  });
});

describe("InlineSelectField", () => {
  it("opens an anchored menu naming the current choice", () => {
    render(
      <InlineSelectField
        label="Status"
        value="planned"
        options={STATUSES}
        onSave={async () => ({ ok: true })}
      />,
    );
    const trigger = screen.getByRole("button", { name: "Status: Planned" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    // `menuitemradio`, so the chosen option is announced as chosen rather than
    // merely looking different.
    expect(
      screen.getByRole("menuitemradio", { name: "Planned" }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("saves the chosen option immediately", async () => {
    const onSave = vi.fn(async () => ({ ok: true }) as const);
    render(
      <InlineSelectField
        label="Status"
        value="planned"
        options={STATUSES}
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Status: Planned" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Active" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith("active"));
  });

  it("closes on Escape and restores focus to the trigger", async () => {
    render(
      <InlineSelectField
        label="Status"
        value="planned"
        options={STATUSES}
        onSave={async () => ({ ok: true })}
      />,
    );
    const trigger = screen.getByRole("button", { name: "Status: Planned" });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("keeps the previous value visible and explains a refusal", async () => {
    render(
      <InlineSelectField
        label="Status"
        value="planned"
        options={STATUSES}
        onSave={async () => ({ ok: false, message: "Restore it first." })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Status: Planned" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Active" }));
    await screen.findByRole("alert");
    expect(screen.getByText("Restore it first.")).toBeInTheDocument();
    // Nothing was applied optimistically, so the field still reads Planned.
    expect(
      screen.getByRole("button", { name: "Status: Planned" }),
    ).toBeInTheDocument();
  });
});

describe("InlineDateField", () => {
  it("opens a popover and commits an ISO date", async () => {
    const onSave = vi.fn(async () => ({ ok: true }) as const);
    render(<InlineDateField label="Due date" value={null} onSave={onSave} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Due date: Add a date" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Due date" });
    const input = dialog.querySelector("input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2026-09-03" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith("2026-09-03"));
  });

  it("treats clearing as a real value, not an empty string", async () => {
    const onSave = vi.fn(async () => ({ ok: true }) as const);
    render(
      <InlineDateField label="Due date" value="2026-09-03" onSave={onSave} />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Due date: 2026-09-03" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(null));
  });

  it("hides Clear where a date cannot be removed", () => {
    render(
      <InlineDateField
        label="Due date"
        value="2026-09-03"
        clearable={false}
        onSave={async () => ({ ok: true })}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Due date: 2026-09-03" }),
    );
    expect(
      screen.queryByRole("button", { name: "Clear" }),
    ).not.toBeInTheDocument();
  });

  it("closes on Escape and restores focus", async () => {
    render(
      <InlineDateField
        label="Due date"
        value="2026-09-03"
        onSave={async () => ({ ok: true })}
      />,
    );
    const trigger = screen.getByRole("button", {
      name: "Due date: 2026-09-03",
    });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});

/**
 * DS-16 — focus after a save, and Enter inside the date popover.
 *
 * Both of these are cases where "restore focus" and "Enter commits", applied
 * without qualification, do the opposite of what the user asked for.
 */
describe("InlineTextField — a blur-triggered save does not steal focus back", () => {
  it("leaves focus where the user put it when they Tab away", async () => {
    let resolveSave: (outcome: { ok: true }) => void = () => {};
    const onSave = vi.fn(
      () =>
        new Promise<{ ok: true }>((resolve) => {
          resolveSave = resolve;
        }),
    );
    render(
      <>
        <InlineTextField label="Area name" value="Health" onSave={onSave} />
        <button type="button">Somewhere else</button>
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Area name: Health" }));
    const input = screen.getByRole("textbox", { name: "Area name" });
    fireEvent.change(input, { target: { value: "Health & fitness" } });

    // The user Tabs onward: blur saves, and they land on the next control.
    const destination = screen.getByRole("button", { name: "Somewhere else" });
    fireEvent.blur(input);
    destination.focus();
    expect(onSave).toHaveBeenCalled();

    // The save lands LATER. It must not drag focus back to the field they left,
    // which would also send their next Tab backwards.
    resolveSave({ ok: true });
    await waitFor(() =>
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument(),
    );
    expect(destination).toHaveFocus();
  });

  it("still returns focus to the value when Enter saves it", async () => {
    render(
      <InlineTextField
        label="Area name"
        value="Health"
        onSave={async () => ({ ok: true })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Area name: Health" }));
    const input = screen.getByRole("textbox", { name: "Area name" });
    fireEvent.change(input, { target: { value: "Health & fitness" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Area name:/ })).toHaveFocus(),
    );
  });
});

describe("InlineDateField — Enter belongs to the input, not to the buttons", () => {
  it("does not submit the draft when Enter activates Cancel", () => {
    const onSave = vi.fn(async () => ({ ok: true }) as const);
    render(
      <InlineDateField label="Due date" value="2026-09-03" onSave={onSave} />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Due date: 2026-09-03" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Due date" });
    const input = dialog.querySelector("input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2026-12-25" } });

    // Enter on Cancel must cancel. The dialog-level shortcut previously
    // intercepted it and persisted the draft — the opposite of the label.
    const cancel = screen.getByRole("button", { name: "Cancel" });
    cancel.focus();
    fireEvent.keyDown(cancel, { key: "Enter" });
    expect(onSave).not.toHaveBeenCalled();
  });

  it("still commits when Enter is pressed in the date input itself", async () => {
    const onSave = vi.fn(async () => ({ ok: true }) as const);
    render(
      <InlineDateField label="Due date" value="2026-09-03" onSave={onSave} />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Due date: 2026-09-03" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Due date" });
    const input = dialog.querySelector("input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2026-12-25" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(onSave).toHaveBeenCalledWith("2026-12-25"));
  });
});
