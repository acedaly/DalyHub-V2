/**
 * V2.4-GATE-02 — the two things a Task ROW was saying that were not true.
 *
 * Both blocks below FAIL against the implementation this item started from, and
 * each names the defect it reproduces:
 *
 *   - **DEBT-194 / DEBT-164.** A row in selection mode drew a selection control
 *     AND a completion control, 8px apart and unlabelled as a pair, which
 *     `task-signals.css` already forbade in its own words: *"A row shows one of
 *     them at rest."* On Weekly Planning's queue — permanently in selection mode
 *     — ticking the wrong one COMPLETED work the owner meant to schedule.
 *   - **DEBT-197.** `InlineTaskDate` derived urgency from calendar arithmetic
 *     that had never seen the Task, so a cancelled Task's passed due date took
 *     `dh-task-date--overdue` exactly like a live one.
 *
 * The semantic half of the matrix is asserted at the authority in
 * `task-commitment.test.ts`; what is asserted here is what the ROW does with it.
 */

import type { ReactElement } from "react";
import { RouterProvider, createMemoryRouter } from "react-router";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TaskRow, type TaskRowData } from "~/shared/task-record/TaskRow";
import { buildTaskRowActions } from "~/shared/task-record/task-row-actions";

const TODAY = "2026-08-22";
const PAST = "2026-07-06";
const FUTURE = "2026-09-06";

function renderInRouter(node: ReactElement) {
  const router = createMemoryRouter([{ path: "/", element: node }], {
    initialEntries: ["/"],
  });
  return render(<RouterProvider router={router} />);
}

const baseTask: TaskRowData = {
  id: "task-1",
  title: "Strip out the old kitchen",
  priority: null,
  stateKind: "inbox",
  stateLabel: "Unscheduled",
  stateTone: "neutral",
  dueDate: PAST,
  scheduledDate: null,
  parent: null,
  completed: false,
  waiting: false,
  stillOwed: true,
  recurrence: null,
};

/** The one placement day Weekly Planning's queue offers a row at rest. */
const PLAN_DAY = {
  dateIso: "2026-08-26",
  label: "Wednesday 26 August",
  onSelect: vi.fn(),
};

function row(
  task: Partial<TaskRowData> = {},
  options: {
    readonly selecting?: boolean;
    readonly onSelectedChange?: (
      selected: boolean,
      modifiers?: { readonly shift: boolean },
    ) => void;
    readonly onCompletedChange?: (complete: boolean) => void;
  } = {},
) {
  const merged = { ...baseTask, ...task };
  return renderInRouter(
    <ul className="dh-tasklist">
      <TaskRow
        task={merged}
        todayIso={TODAY}
        parents={[]}
        href="/tasks"
        onOpen={() => {}}
        headingLevel={3}
        onCompletedChange={options.onCompletedChange ?? (() => {})}
        onInlineSave={() => {}}
        overflowActions={buildTaskRowActions(merged, {
          onOpenRecord: () => {},
          planDays: [PLAN_DAY],
        })}
        {...(options.selecting
          ? {
              selection: {
                selected: false,
                onSelectedChange: options.onSelectedChange ?? (() => {}),
                label: `Select ${merged.title} to place on a day`,
              },
            }
          : {})}
      />
    </ul>,
  );
}

/* -------------------------------------------------------------------------- */
/* DEBT-194 / DEBT-164 — one checkbox-like signal                             */
/* -------------------------------------------------------------------------- */

describe("a Task row draws ONE checkbox-like control", () => {
  it("draws completion, and only completion, at rest", () => {
    row();
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toHaveAccessibleName("Complete Strip out the old kitchen");
    expect(screen.queryByTestId("task-select")).not.toBeInTheDocument();
  });

  it("REPLACES completion with selection in selection mode", () => {
    row({}, { selecting: true });
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toHaveAccessibleName(
      "Select Strip out the old kitchen to place on a day",
    );
    // Not hidden-but-interactive: the completion control is not in the DOM at
    // all, so a mis-click cannot reach the act the owner did not mean.
    expect(screen.queryByTestId("task-complete")).not.toBeInTheDocument();
  });

  it("gives the two acts DISTINCT accessible names, never 'checkbox' twice", () => {
    const { unmount } = row();
    const resting = screen.getByRole("checkbox").getAttribute("aria-label");
    unmount();
    row({}, { selecting: true });
    const selecting = screen.getByRole("checkbox").getAttribute("aria-label");
    expect(resting).toBe("Complete Strip out the old kitchen");
    expect(selecting).toBe(
      "Select Strip out the old kitchen to place on a day",
    );
    expect(resting).not.toBe(selecting);
  });

  it("keeps both controls in the SAME box, so the mode moves no geometry", () => {
    const { container: rest } = row();
    const restingBox = rest
      .querySelector(".dh-taskrow__lead")!
      .firstElementChild!.className.split(" ");
    const { container: selecting } = row({}, { selecting: true });
    const selectingBox = selecting
      .querySelector(".dh-taskrow__lead")!
      .firstElementChild!.className.split(" ");
    // The 44px target class is what owns the box (task-signals.css); both wear it.
    expect(restingBox).toContain("dh-check-circle-target");
    expect(selectingBox).toContain("dh-check-circle-target");
  });

  it("draws the design system's SQUARE for selection and the rounded square for completion", () => {
    const { container: rest } = row();
    expect(rest.querySelector(".dh-check-circle")).not.toBeNull();
    const { container: selecting } = row({}, { selecting: true });
    // D7 — "this is the square: selection". Not the unstyled `dh-checkbox__input`
    // the queue used to draw, which no stylesheet in the repository painted.
    expect(selecting.querySelector(".dh-checkbox__control")).not.toBeNull();
    expect(selecting.querySelector(".dh-checkbox__input")).toBeNull();
  });
});

describe("both acts stay reachable in both modes", () => {
  it("keeps COMPLETION reachable, by keyboard, while selection displaces it", () => {
    const onCompletedChange = vi.fn();
    row({}, { selecting: true, onCompletedChange });
    fireEvent.click(
      screen.getByRole("button", {
        name: "More actions for Strip out the old kitchen",
      }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: /^Complete/ }));
    expect(onCompletedChange).toHaveBeenCalledWith(true);
  });

  it("says REOPEN, not Complete, when the displaced Task is already done", () => {
    row({ completed: true }, { selecting: true });
    fireEvent.click(
      screen.getByRole("button", {
        name: "More actions for Strip out the old kitchen",
      }),
    );
    expect(
      screen.getByRole("menuitem", { name: /^Reopen/ }),
    ).toBeInTheDocument();
  });

  it("adds NO completion item to an at-rest row's menu", () => {
    row();
    fireEvent.click(
      screen.getByRole("button", {
        name: "More actions for Strip out the old kitchen",
      }),
    );
    expect(
      screen.queryByRole("menuitem", { name: /^Complete$/ }),
    ).not.toBeInTheDocument();
  });

  it("keeps PLACEMENT reachable at rest, in words, by keyboard", () => {
    row();
    fireEvent.click(
      screen.getByRole("button", {
        name: "More actions for Strip out the old kitchen",
      }),
    );
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Plan for Wednesday 26 August" }),
    );
    expect(PLAN_DAY.onSelect).toHaveBeenCalled();
  });

  it("toggles the SELECTION, not the completion, when the mode's control is used", () => {
    const onSelectedChange = vi.fn();
    const onCompletedChange = vi.fn();
    row({}, { selecting: true, onSelectedChange, onCompletedChange });
    fireEvent.click(screen.getByTestId("task-select"));
    expect(onSelectedChange).toHaveBeenCalledWith(true, expect.anything());
    expect(onCompletedChange).not.toHaveBeenCalled();
  });

  it("restores the ordinary row when the mode ends", () => {
    const { unmount } = row({}, { selecting: true });
    expect(screen.getByTestId("task-select")).toBeInTheDocument();
    expect(screen.queryByTestId("task-complete")).not.toBeInTheDocument();
    unmount();

    row();
    expect(screen.queryByTestId("task-select")).not.toBeInTheDocument();
    expect(screen.getByTestId("task-complete")).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */
/* DEBT-197 — a passed date is late only while the Task is still owed         */
/* -------------------------------------------------------------------------- */

describe("a row's date claims urgency only while the Task is still owed", () => {
  const CLOSED = [
    [
      "completed",
      { completed: true, stateKind: "completed", stateLabel: "Completed" },
    ],
    ["cancelled", { stateKind: "cancelled", stateLabel: "Cancelled" }],
    [
      "Someday / Maybe",
      { stateKind: "someday", stateLabel: "Someday / Maybe" },
    ],
  ] as const;

  it("paints a live overdue Task's date overdue, and flags the row", () => {
    const { container } = row({ stillOwed: true });
    expect(container.querySelector(".dh-task-date--overdue")).not.toBeNull();
    expect(container.querySelector('[data-overdue="true"]')).not.toBeNull();
  });

  for (const [name, over] of CLOSED) {
    it(`does NOT paint a ${name} Task's passed date overdue`, () => {
      const { container } = row({ ...over, stillOwed: false });
      expect(container.querySelector(".dh-task-date--overdue")).toBeNull();
      expect(container.querySelector('[data-overdue="true"]')).toBeNull();
    });

    it(`keeps the ${name} Task's date VISIBLE — history is not hidden`, () => {
      const { container } = row({ ...over, stillOwed: false });
      const date = container.querySelector('[data-testid="task-row-due-date"]');
      expect(date).not.toBeNull();
      // "20 days ago" / "Yesterday" — the words the row is scanned by, unchanged.
      // A closed Task's fields are read-only, so it is static text rather than a
      // trigger; what matters here is that the DATE is still printed.
      expect((date as HTMLElement).textContent).toMatch(/ago|Yesterday/);
      expect(date).toHaveClass("dh-task-date");
    });
  }

  it("keeps a WAITING or ON HOLD Task overdue — blocked is not abandoned", () => {
    for (const stateKind of ["waiting", "on_hold", "blocked"]) {
      const { container, unmount } = row({ stateKind, stillOwed: true });
      expect(container.querySelector(".dh-task-date--overdue")).not.toBeNull();
      unmount();
    }
  });

  it("claims nothing about a date that has not passed", () => {
    const { container } = row({ dueDate: FUTURE });
    expect(container.querySelector(".dh-task-date--overdue")).toBeNull();
    expect(container.querySelector('[data-overdue="true"]')).toBeNull();
  });

  it("never colours a PLANNED date, owed or not", () => {
    const { container } = row({ dueDate: null, scheduledDate: PAST });
    expect(container.querySelector(".dh-task-date--overdue")).toBeNull();
  });
});
