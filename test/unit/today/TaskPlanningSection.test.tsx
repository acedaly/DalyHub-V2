/**
 * TODAY-04 — the Task Drawer's Planning section, exercised as behaviour. It shows
 * the Scheduled + Due dates clearly distinct, offers the quick-plan actions and the
 * inline custom date (no modal-in-modal), and calls the supplied callbacks. A
 * completed task shows its plan read-only. `now` is injected so the target dates are
 * deterministic.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TaskPlanningSection } from "~/shared/task-record/TaskPlanningSection";

// 02:00 UTC on 19 Jul 2026 is midday in Australia/Sydney → owner day 2026-07-19.
const NOW = new Date("2026-07-19T02:00:00.000Z");

function setup(
  props: Partial<React.ComponentProps<typeof TaskPlanningSection>> = {},
) {
  const onPlan = vi.fn().mockResolvedValue({ ok: true });
  const onClear = vi.fn().mockResolvedValue({ ok: true });
  render(
    <TaskPlanningSection
      scheduledDate={props.scheduledDate ?? null}
      dueDate={props.dueDate ?? null}
      completed={props.completed ?? false}
      onPlan={onPlan}
      onClear={onClear}
      now={NOW}
    />,
  );
  return { onPlan, onClear };
}

describe("TaskPlanningSection", () => {
  it("shows the scheduled and due dates distinctly", () => {
    setup({ scheduledDate: "2026-07-21", dueDate: "2026-08-01" });
    expect(screen.getByText("21 Jul 2026")).toBeInTheDocument();
    expect(screen.getByText("1 Aug 2026")).toBeInTheDocument();
  });

  it("reads 'Not planned' / 'No due date' when absent", () => {
    setup();
    expect(screen.getByText("Not planned")).toBeInTheDocument();
    expect(screen.getByText("No due date")).toBeInTheDocument();
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

  it("clears the plan when scheduled", async () => {
    const { onClear } = setup({ scheduledDate: "2026-07-21" });
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    await waitFor(() => expect(onClear).toHaveBeenCalledTimes(1));
  });

  it("has no Clear action when the task is unplanned", () => {
    setup();
    expect(
      screen.queryByRole("button", { name: "Clear" }),
    ).not.toBeInTheDocument();
  });

  it("plans a custom date through the inline picker", async () => {
    const { onPlan } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Custom date…" }));
    const input = screen.getByLabelText(/Choose a date/);
    fireEvent.change(input, { target: { value: "2026-09-15" } });
    await waitFor(() => expect(onPlan).toHaveBeenCalledWith("2026-09-15"));
  });

  it("shows a completed task's plan read-only (no plan actions)", () => {
    setup({ scheduledDate: "2026-07-21", completed: true });
    expect(screen.getByText("21 Jul 2026")).toBeInTheDocument();
    expect(
      screen.getByText(/Planning applies to open tasks/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Today" }),
    ).not.toBeInTheDocument();
  });
});
