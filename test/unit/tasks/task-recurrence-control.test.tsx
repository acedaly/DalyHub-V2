/**
 * DHDS-10 §14 — *common choice inline, complex configuration deeper*, applied
 * to a Task's repeat.
 *
 * The rule has two halves and both are testable. The ordinary answers are one
 * press away and write the rule the AUTHORING module already defines; anything
 * that is not one of those answers keeps its own words and hands off to the
 * full editor rather than being flattened into a preset. The second half is the
 * one that protects the recurrence system: reporting "the last Friday of every
 * month" as plain "Monthly" would let the next interaction silently drop the
 * ordinal.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TaskRecurrenceControl } from "~/shared/task-record/TaskRecurrenceControl";
import type { TaskRecurrenceInput, TaskRecurrenceRule } from "~/kernel/tasks";

const WEEKLY: TaskRecurrenceRule = {
  frequency: "week",
  interval: 1,
  dateKind: "scheduled",
  mode: "fixed",
  weekdays: [],
  anchorDay: null,
  anchorMonth: null,
  ordinal: null,
  weekendRule: "allow",
  endsAfterCount: null,
  endsOnDate: null,
};

/** An ADVANCED rule: an ordinal, which no preset can express. */
const LAST_FRIDAY: TaskRecurrenceRule = {
  ...WEEKLY,
  frequency: "month",
  ordinal: "last",
  weekdays: [5],
};

describe("TaskRecurrenceControl", () => {
  it("reads a preset rule in the product's own words", () => {
    render(
      <TaskRecurrenceControl
        value={WEEKLY}
        onSave={async () => ({ ok: true })}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Repeats: Weekly" }),
    ).toBeInTheDocument();
  });

  it("offers the ordinary answers and writes the authoring module's rule", async () => {
    // Typed with its argument, so the assertions below can read what was
    // WRITTEN rather than only that something was.
    const onSave = vi.fn(
      async (_rule: TaskRecurrenceInput | null) => ({ ok: true }) as const,
    );
    render(<TaskRecurrenceControl value={WEEKLY} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "Repeats: Weekly" }));

    for (const label of [
      "Does not repeat",
      "Daily",
      "Every weekday",
      "Weekly",
      "Monthly",
      "Yearly",
    ]) {
      expect(
        screen.getByRole("menuitemradio", { name: label }),
      ).toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole("menuitemradio", { name: "Monthly" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [first] = onSave.mock.calls;
    expect(first?.[0]).toMatchObject({
      frequency: "month",
      interval: 1,
      mode: "fixed",
      // A preset is the SIMPLE rule by definition, so every advanced field is
      // stated at its absent value — choosing one CLEARS the advanced part
      // rather than silently keeping half of it.
      ordinal: null,
      weekendRule: "allow",
      endsAfterCount: null,
      endsOnDate: null,
    });
  });

  it("writes null for 'Does not repeat' rather than a rule that never fires", async () => {
    const onSave = vi.fn(async () => ({ ok: true }) as const);
    render(<TaskRecurrenceControl value={WEEKLY} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "Repeats: Weekly" }));
    fireEvent.click(
      screen.getByRole("menuitemradio", { name: "Does not repeat" }),
    );
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(null));
  });

  it("keeps an ADVANCED rule's own words and never flattens it to a preset", () => {
    render(
      <TaskRecurrenceControl
        value={LAST_FRIDAY}
        onSave={async () => ({ ok: true })}
      />,
    );
    // "Monthly" would be a lie the next interaction could act on.
    expect(
      screen.queryByRole("button", { name: "Repeats: Monthly" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Repeats: .*Friday/ }),
    ).toBeInTheDocument();
  });

  it("hands off to the deeper editor as a COMMAND, not a value", async () => {
    const onOpenEditor = vi.fn();
    const onSave = vi.fn(async () => ({ ok: true }) as const);
    render(
      <TaskRecurrenceControl
        value={WEEKLY}
        onSave={onSave}
        onOpenEditor={onOpenEditor}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Repeats: Weekly" }));

    // A `menuitem` among `menuitemradio`s: a screen reader is never told the
    // field is "set to Custom…", because it never can be.
    const custom = screen.getByRole("menuitem", { name: "Custom…" });
    expect(custom).toBeInTheDocument();
    fireEvent.click(custom);

    await waitFor(() => expect(onOpenEditor).toHaveBeenCalledTimes(1));
    // Nothing is written by the hand-off, so cancelling in the editor leaves
    // the rule exactly as it was.
    expect(onSave).not.toHaveBeenCalled();
  });

  it("does not offer Custom… when there is no deeper editor to open", () => {
    render(
      <TaskRecurrenceControl
        value={WEEKLY}
        onSave={async () => ({ ok: true })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Repeats: Weekly" }));
    // A command that cannot do anything is worse than no command.
    expect(
      screen.queryByRole("menuitem", { name: "Custom…" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the previous rule and states the reason when the server refuses", async () => {
    render(
      <TaskRecurrenceControl
        value={WEEKLY}
        onSave={async () => ({
          ok: false,
          message: "This task has no date for a repeat to advance.",
        })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Repeats: Weekly" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Daily" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This task has no date for a repeat to advance.",
    );
    expect(
      screen.getByRole("button", { name: "Repeats: Weekly" }),
    ).toBeInTheDocument();
  });

  it("keeps an existing rule's anchor date rather than silently re-anchoring it", async () => {
    const onSave = vi.fn(
      async (_rule: TaskRecurrenceInput | null) => ({ ok: true }) as const,
    );
    render(
      <TaskRecurrenceControl
        value={{ ...WEEKLY, dateKind: "due" }}
        dateKind="scheduled"
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Repeats: Weekly" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Daily" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    // Choosing a simpler frequency must not move a repeat from the due date to
    // the planned date behind the owner's back.
    const [first] = onSave.mock.calls;
    expect(first?.[0]).toMatchObject({ dateKind: "due" });
  });
});
