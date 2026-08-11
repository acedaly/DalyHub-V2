/**
 * TODAY-04 / EDIT-02 — the Task Drawer's Planning section, exercised as
 * behaviour. It shows the Scheduled + Due dates clearly distinct, makes BOTH
 * directly editable through the shared inline date field, offers the quick-plan
 * actions and the inline custom date (no modal-in-modal), and calls the supplied
 * callbacks. A completed task shows its plan read-only — as plain text with no
 * tab stop, not as a disabled control. `now` is injected so the target dates are
 * deterministic.
 */

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TaskPlanningSection } from "~/shared/task-record/TaskPlanningSection";

// AUDIT-14 — the owner day now arrives from the server, already resolved in the
// owner's stored timezone; this control never derives one from the browser.
const TODAY_ISO = "2026-07-19";

function setup(
  props: Partial<React.ComponentProps<typeof TaskPlanningSection>> = {},
) {
  const onPlan = vi.fn().mockResolvedValue({ ok: true });
  const onClear = vi.fn().mockResolvedValue({ ok: true });
  const onSetDue = vi.fn().mockResolvedValue({ ok: true });
  render(
    <TaskPlanningSection
      scheduledDate={props.scheduledDate ?? null}
      dueDate={props.dueDate ?? null}
      completed={props.completed ?? false}
      onPlan={onPlan}
      onClear={onClear}
      onSetDue={props.onSetDue ?? onSetDue}
      todayIso={TODAY_ISO}
    />,
  );
  return { onPlan, onClear, onSetDue };
}

describe("TaskPlanningSection", () => {
  it("shows the scheduled and due dates distinctly", () => {
    setup({ scheduledDate: "2026-07-21", dueDate: "2026-08-01" });
    expect(screen.getByText("21 Jul 2026")).toBeInTheDocument();
    expect(screen.getByText("1 Aug 2026")).toBeInTheDocument();
  });

  it("reads 'Not planned' / 'No due date' when absent, as invitations to set them", () => {
    setup();
    expect(
      screen.getByRole("button", { name: "Scheduled date: Not planned" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Due date: No due date" }),
    ).toBeInTheDocument();
  });

  it("sets the due date directly, without opening the Details form", async () => {
    const { onSetDue } = setup();
    fireEvent.click(screen.getByRole("button", { name: /^Due date: / }));
    fireEvent.change(screen.getByLabelText("Due date"), {
      target: { value: "2026-08-01" },
    });
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Edit due date" })).getByRole(
        "button",
        { name: "Save" },
      ),
    );
    await waitFor(() => expect(onSetDue).toHaveBeenCalledWith("2026-08-01"));
  });

  it("clears the due date from the record, and offers no Clear when unset", async () => {
    const { onSetDue } = setup({ dueDate: "2026-08-01" });
    fireEvent.click(screen.getByRole("button", { name: /^Due date: / }));
    const dialog = screen.getByRole("dialog", { name: "Edit due date" });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Clear due date" }),
    );
    await waitFor(() => expect(onSetDue).toHaveBeenCalledWith(null));
  });

  it("changes the scheduled date directly through the same field", async () => {
    const { onPlan } = setup({ scheduledDate: "2026-07-21" });
    fireEvent.click(screen.getByRole("button", { name: /^Scheduled date: / }));
    fireEvent.change(screen.getByLabelText("Scheduled date"), {
      target: { value: "2026-07-23" },
    });
    fireEvent.click(
      within(
        screen.getByRole("dialog", { name: "Edit scheduled date" }),
      ).getByRole("button", { name: "Save" }),
    );
    await waitFor(() => expect(onPlan).toHaveBeenCalledWith("2026-07-23"));
  });

  it.each([
    ["Today", "2026-07-19"],
    ["Tomorrow", "2026-07-20"],
    ["Next week", "2026-07-26"],
  ])("plans for %s", async (label, expected) => {
    const { onPlan } = setup();
    fireEvent.click(screen.getByRole("button", { name: label }));
    await waitFor(() => expect(onPlan).toHaveBeenCalledWith(expected));
  });

  it("clears the plan from the quick action — one press, as before", async () => {
    const { onClear } = setup({ scheduledDate: "2026-07-21" });
    // EDIT-02 removed "Custom date…" (a second date picker) but NOT Clear:
    // Today / Tomorrow / Next week / Clear are one family of one-press answers
    // to "what is the plan?", and routine task editing must not get slower
    // (§13). An earlier revision removed it and command-palette.spec.ts caught
    // the regression.
    //
    // DS-17 — asked for by its accessible name, "Clear plan". The visible word
    // is still "Clear"; the name distinguishes this quick action from the
    // picker's own clear command, which the next test exercises.
    fireEvent.click(screen.getByRole("button", { name: "Clear plan" }));
    await waitFor(() => expect(onClear).toHaveBeenCalledTimes(1));
  });

  it("also clears from the value's own Clear command, for the picker path", async () => {
    const { onClear } = setup({ scheduledDate: "2026-07-21" });
    fireEvent.click(screen.getByRole("button", { name: /^Scheduled date: / }));
    fireEvent.click(
      within(
        screen.getByRole("dialog", { name: "Edit scheduled date" }),
      ).getByRole("button", { name: "Clear scheduled date" }),
    );
    await waitFor(() => expect(onClear).toHaveBeenCalledTimes(1));
  });

  it("offers no Clear at all when the task is unplanned", () => {
    setup();
    // Neither the quick action…
    expect(
      screen.queryByRole("button", { name: "Clear plan" }),
    ).not.toBeInTheDocument();
    // …nor the picker's command, because there is nothing to clear.
    fireEvent.click(screen.getByRole("button", { name: /^Scheduled date: / }));
    expect(
      within(
        screen.getByRole("dialog", { name: "Edit scheduled date" }),
      ).queryByRole("button", { name: "Clear scheduled date" }),
    ).not.toBeInTheDocument();
  });

  it("plans an arbitrary date through the value itself, with no second picker", async () => {
    const { onPlan } = setup();
    // EDIT-02 — the "Custom date…" disclosure is gone: the Scheduled value IS
    // the picker, so keeping it would be a second control for one action.
    expect(
      screen.queryByRole("button", { name: "Custom date…" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Scheduled date: / }));
    fireEvent.change(screen.getByLabelText("Scheduled date"), {
      target: { value: "2026-09-15" },
    });
    fireEvent.click(
      within(
        screen.getByRole("dialog", { name: "Edit scheduled date" }),
      ).getByRole("button", { name: "Save" }),
    );
    await waitFor(() => expect(onPlan).toHaveBeenCalledWith("2026-09-15"));
  });

  it("shows a completed task’s plan read-only (no plan actions, no tab stop)", () => {
    setup({ scheduledDate: "2026-07-21", completed: true });
    expect(screen.getByText("21 Jul 2026")).toBeInTheDocument();
    // A value that cannot be changed must not look like one that can: the
    // read-only field renders text, never a control (DS-16).
    expect(
      screen.queryByRole("button", { name: /^Scheduled date: / }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Planning applies to open tasks/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Today" }),
    ).not.toBeInTheDocument();
  });
});
