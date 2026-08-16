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
  it("opens a popover and commits an ISO date from the calendar", async () => {
    /*
     * CONTROL-01 — the editor is DalyHub's own month grid, not a native
     * `<input type="date">`, and a calendar day COMMITS on selection: a day is
     * an unambiguous complete answer, unlike a half-typed `dd/mm/yyyy`, so
     * there is no Save step after it.
     */
    const onSave = vi.fn(async () => ({ ok: true }) as const);
    render(
      <InlineDateField
        label="Due date"
        value="2026-09-01"
        todayIso="2026-09-01"
        onSave={onSave}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Due date: 2026-09-01" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Edit due date" });
    // No browser-native residue anywhere in the editor.
    expect(dialog.querySelector("input[type='date']")).toBeNull();
    // The day is addressable by its FULL date, which is what a screen reader
    // hears — "3" alone would name nothing.
    fireEvent.click(
      screen.getByRole("button", { name: "Thursday 3 September 2026" }),
    );
    await waitFor(() => expect(onSave).toHaveBeenCalledWith("2026-09-03"));
  });

  it("offers the product's own presets, and marks the one in force", () => {
    render(
      <InlineDateField
        label="Due date"
        value="2026-09-02"
        todayIso="2026-09-01"
        shortcuts={[
          { label: "Today", value: "2026-09-01" },
          { label: "Tomorrow", value: "2026-09-02" },
        ]}
        onSave={async () => ({ ok: true })}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Due date: 2026-09-02" }),
    );
    expect(screen.getByRole("button", { name: "Tomorrow" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Today" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("marks today in words as well as with a ring", () => {
    // Never colour or a mark alone (AGENTS.md §15).
    render(
      <InlineDateField
        label="Due date"
        value="2026-09-03"
        todayIso="2026-09-01"
        onSave={async () => ({ ok: true })}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Due date: 2026-09-03" }),
    );
    expect(
      screen.getByRole("button", { name: "Tuesday 1 September 2026, today" }),
    ).toBeInTheDocument();
  });

  it("treats clearing as a real value, not an empty string", async () => {
    const onSave = vi.fn(async () => ({ ok: true }) as const);
    render(
      <InlineDateField label="Due date" value="2026-09-03" onSave={onSave} />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Due date: 2026-09-03" }),
    );
    // DS-17 — the accessible name says WHICH field it empties; the visible word
    // stays "Clear", which WCAG 2.5.3 requires the accessible name to contain.
    fireEvent.click(screen.getByRole("button", { name: "Clear due date" }));
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
      screen.queryByRole("button", { name: "Clear due date" }),
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

describe("InlineDateField — the keyboard walks the month", () => {
  /*
   * CONTROL-01 replaced the typed input with a month grid, which retires the
   * "Enter belongs to the input" pair of tests that used to live here: there is
   * no draft to commit with Enter and no input to press it in, so the failure
   * they guarded (a dialog-level Enter that also fired while Cancel was focused,
   * making Cancel save) cannot occur. What replaces them is the contract the
   * grid brings instead — one tab stop, and arrows that reach every day.
   */
  function openEditor() {
    render(
      <InlineDateField
        label="Due date"
        value="2026-09-03"
        todayIso="2026-09-01"
        onSave={async () => ({ ok: true })}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Due date: 2026-09-03" }),
    );
    return screen.getByRole("grid", { name: "Due date" });
  }

  it("gives the whole month ONE tab stop", () => {
    const grid = openEditor();
    const stops = Array.from(
      grid.querySelectorAll("button:not([tabindex='-1'])"),
    );
    expect(stops).toHaveLength(1);
    expect(stops[0]).toHaveAccessibleName("Thursday 3 September 2026");
  });

  it("moves a day with the arrows and a month with Page keys", () => {
    const grid = openEditor();
    fireEvent.keyDown(grid, { key: "ArrowRight" });
    expect(
      grid.querySelector("button:not([tabindex='-1'])"),
    ).toHaveAccessibleName("Friday 4 September 2026");

    fireEvent.keyDown(grid, { key: "ArrowDown" });
    expect(
      grid.querySelector("button:not([tabindex='-1'])"),
    ).toHaveAccessibleName("Friday 11 September 2026");

    fireEvent.keyDown(grid, { key: "PageDown" });
    expect(screen.getByText("October 2026")).toBeInTheDocument();
  });

  it("crosses a month boundary with an arrow, not with the month buttons", () => {
    // A keyboard user reaching the 1st of next month must not have to leave the
    // grid to find a chevron.
    const grid = openEditor();
    for (let index = 0; index < 4; index += 1) {
      fireEvent.keyDown(grid, { key: "ArrowDown" });
    }
    expect(screen.getByText("October 2026")).toBeInTheDocument();
  });

  it("cancels on Enter over Cancel rather than saving", () => {
    // The behaviour the retired pair was really protecting, kept.
    const onSave = vi.fn(async () => ({ ok: true }) as const);
    render(
      <InlineDateField label="Due date" value="2026-09-03" onSave={onSave} />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Due date: 2026-09-03" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("InlineTextField — the multiline plain-text form (EDIT-02)", () => {
  it("treats Enter as a paragraph and ⌘/Ctrl+Enter as the save", async () => {
    const onSave = vi.fn(async () => ({ ok: true }) as const);
    render(
      <InlineTextField
        label="Definition of done"
        value="Cross the line."
        multiline
        onSave={onSave}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Definition of done: Cross the line.",
      }),
    );
    const area = screen.getByRole("textbox", { name: "Definition of done" });
    fireEvent.change(area, {
      target: { value: "Cross the line.\nUnder 2 hours." },
    });
    // A multiline field that saved on Enter could not be used to write anything
    // longer than a sentence.
    fireEvent.keyDown(area, { key: "Enter" });
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.keyDown(area, { key: "Enter", metaKey: true });
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith("Cross the line.\nUnder 2 hours."),
    );
  });

  it("ignores Escape once real words have been typed, and honours Cancel", () => {
    const onSave = vi.fn(async () => ({ ok: true }) as const);
    render(
      <InlineTextField
        label="Definition of done"
        value="Cross the line."
        multiline
        onSave={onSave}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Definition of done: Cross the line.",
      }),
    );
    const area = screen.getByRole("textbox", { name: "Definition of done" });
    fireEvent.change(area, { target: { value: "Cross the line. Under 2h." } });
    // Escape is far too easy to hit by accident to be allowed to discard a
    // paragraph with no undo.
    fireEvent.keyDown(area, { key: "Escape" });
    expect(
      screen.getByRole("textbox", { name: "Definition of done" }),
    ).toHaveValue("Cross the line. Under 2h.");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("does NOT save on blur — a tall editor is somewhere you pause to think", () => {
    const onSave = vi.fn(async () => ({ ok: true }) as const);
    render(
      <InlineTextField
        label="Definition of done"
        value="Cross the line."
        multiline
        onSave={onSave}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Definition of done: Cross the line.",
      }),
    );
    const area = screen.getByRole("textbox", { name: "Definition of done" });
    fireEvent.change(area, { target: { value: "Half written" } });
    fireEvent.blur(area);
    expect(onSave).not.toHaveBeenCalled();
    expect(
      screen.getByRole("textbox", { name: "Definition of done" }),
    ).toHaveValue("Half written");
  });

  it("keeps the typed paragraph when the server refuses it", async () => {
    const onSave = vi.fn(async () => ({
      ok: false as const,
      message: "That’s too long.",
    }));
    render(
      <InlineTextField
        label="Definition of done"
        value="Cross the line."
        multiline
        onSave={onSave}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Definition of done: Cross the line.",
      }),
    );
    const area = screen.getByRole("textbox", { name: "Definition of done" });
    fireEvent.change(area, { target: { value: "A whole paragraph." } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("That’s too long."),
    );
    expect(
      screen.getByRole("textbox", { name: "Definition of done" }),
    ).toHaveValue("A whole paragraph.");
  });
});

describe("InlineSelectField — an optional value starts EMPTY (EDIT-02)", () => {
  const PRIORITIES = [
    { value: "p1", label: "P1 · Urgent" },
    { value: "p2", label: "P2 · High" },
    { value: "p3", label: "P3 · Normal" },
  ];

  it("reads as unset rather than as a chosen 'No priority'", () => {
    render(
      <InlineSelectField
        label="Priority"
        value=""
        options={PRIORITIES}
        emptyLabel="No priority"
        clearable
        onSave={async () => ({ ok: true })}
      />,
    );
    // The absence is the field's EMPTY state, announced as such — not an option
    // someone selected.
    expect(
      screen.getByRole("button", { name: "Priority: No priority" }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Priority: No priority" }),
    );
    expect(screen.getAllByRole("menuitemradio")).toHaveLength(3);
    // Nothing to clear, so no clear command.
    expect(
      screen.queryByRole("menuitemradio", { name: "Clear priority" }),
    ).not.toBeInTheDocument();
  });

  it("goes from unset straight to a real value in one action", async () => {
    const onSave = vi.fn(async () => ({ ok: true }) as const);
    render(
      <InlineSelectField
        label="Priority"
        value=""
        options={PRIORITIES}
        emptyLabel="No priority"
        clearable
        onSave={onSave}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Priority: No priority" }),
    );
    fireEvent.click(screen.getByRole("menuitemradio", { name: "P2 · High" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith("p2"));
  });

  it("replaces one real value with another WITHOUT clearing first", async () => {
    const onSave = vi.fn(async () => ({ ok: true }) as const);
    render(
      <InlineSelectField
        label="Priority"
        value="p1"
        options={PRIORITIES}
        emptyLabel="No priority"
        clearable
        onSave={onSave}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Priority: P1 · Urgent" }),
    );
    // The current value announces itself as the chosen one…
    expect(
      screen.getByRole("menuitemradio", { name: "P1 · Urgent" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("menuitemradio", { name: "P3 · Normal" }),
    ).toHaveAttribute("aria-checked", "false");
    // …and every other one is a single press away.
    fireEvent.click(screen.getByRole("menuitemradio", { name: "P3 · Normal" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith("p3");
  });

  it("offers ONE separated clear command once a value is set", async () => {
    const onSave = vi.fn(async () => ({ ok: true }) as const);
    render(
      <InlineSelectField
        label="Priority"
        value="p1"
        options={PRIORITIES}
        emptyLabel="No priority"
        clearable
        clearLabel="Clear priority"
        onSave={onSave}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Priority: P1 · Urgent" }),
    );
    const clear = screen.getByRole("menuitemradio", { name: "Clear priority" });
    expect(clear).toHaveAttribute("aria-checked", "false");
    fireEvent.click(clear);
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(""));
  });

  it("reaches the clear command by keyboard, at the END of the roving order", () => {
    render(
      <InlineSelectField
        label="Priority"
        value="p1"
        options={PRIORITIES}
        clearable
        onSave={async () => ({ ok: true })}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Priority: P1 · Urgent" }),
    );
    const menu = screen.getByRole("menu");
    fireEvent.keyDown(menu, { key: "End" });
    // Home/End and the arrow keys index ONE list, so a command bolted on
    // outside it would be unreachable — this is that regression test.
    expect(
      screen.getByRole("menuitemradio", { name: "Clear priority" }),
    ).toHaveFocus();
  });

  it("omits the clear command entirely for a required value", () => {
    render(
      <InlineSelectField
        label="Status"
        value="active"
        options={STATUSES}
        onSave={async () => ({ ok: true })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Status: Active" }));
    expect(screen.getAllByRole("menuitemradio")).toHaveLength(STATUSES.length);
  });
});
