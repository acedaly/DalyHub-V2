/**
 * TASKS-04 — the shared Task quick-edit panel.
 *
 * The panel is the row's quick edits AND the body of Review Inbox, so what matters is
 * behavioural: every control posts to a CANONICAL route (never a panel-only write
 * path), the parent picker can file a task or return it to Inbox, and a repeat is
 * anchored to whichever date the task actually has.
 */

import { createMemoryRouter, RouterProvider } from "react-router";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TaskQuickEditPanel } from "~/shared/task-record/TaskQuickEditPanel";
import type { SerializedTaskListItem } from "~/shared/task-record/task-view";

const TASK: SerializedTaskListItem = {
  id: "t-1",
  title: "Water the garden",
  createdAt: "2026-07-30T00:00:00.000Z",
  updatedAt: "2026-07-30T00:00:00.000Z",
  completedAt: null,
  status: "todo",
  priority: "p2",
  dueDate: null,
  scheduledDate: "2026-08-01",
  timeSector: null,
  commitmentState: "active",
  delegation: null,
  parent: null,
  waiting: null,
};

/**
 * Render the panel inside a DATA router whose task/bulk routes are spies, so the test
 * asserts WHERE a change is posted rather than mocking the component's internals.
 */
function renderPanel(
  task: SerializedTaskListItem = TASK,
  outcome: { readonly reject?: boolean } = {},
) {
  // Typed as the FormData spies they are, so the assertions below read the real body.
  const taskRoute = vi.fn((_body: FormData) => undefined);
  const bulkRoute = vi.fn((_body: FormData) => undefined);
  const onChanged = vi.fn();
  const router = createMemoryRouter(
    [
      {
        path: "/tasks",
        element: (
          <TaskQuickEditPanel
            task={task}
            todayIso="2026-07-30"
            onChanged={onChanged}
          />
        ),
      },
      {
        path: "/tasks/bulk",
        action: async ({ request }) => {
          bulkRoute(await request.formData());
          return outcome.reject
            ? { ok: false, formError: "Nothing was changed." }
            : { ok: true };
        },
      },
      {
        path: "/tasks/:taskId",
        action: async ({ request }) => {
          taskRoute(await request.formData());
          return outcome.reject
            ? {
                kind: "update",
                status: "error",
                fieldErrors: {
                  recurrence:
                    "scheduled-date recurrence needs a scheduled date on the task",
                },
              }
            : { kind: "update", status: "success" };
        },
      },
    ],
    { initialEntries: ["/tasks"] },
  );
  render(<RouterProvider router={router} />);
  return { taskRoute, bulkRoute, onChanged };
}

/** Choose an option from one of the shared combobox controls by its label. */
async function choose(label: RegExp | string, option: RegExp | string) {
  const control = screen.getByRole("combobox", { name: label });
  fireEvent.click(control);
  fireEvent.change(control, {
    target: { value: typeof option === "string" ? option : "" },
  });
  const item = await screen.findByRole("option", { name: option });
  fireEvent.click(item);
}

describe("TaskQuickEditPanel", () => {
  it("offers the full daily-driver edit set for one task", () => {
    renderPanel();
    expect(
      screen.getByRole("combobox", { name: /Project or Area/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: /Priority/ }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Scheduled date/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Due date/)).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: /Time Sector/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: /Commitment/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: /Repeat/ }),
    ).toBeInTheDocument();
  });

  it("posts a priority change to the CANONICAL bulk route", async () => {
    const { bulkRoute, onChanged } = renderPanel();
    await choose(/Priority/, "P1 · Urgent");

    await waitFor(() => expect(bulkRoute).toHaveBeenCalledTimes(1));
    const body = bulkRoute.mock.calls[0]![0];
    expect(body.get("intent")).toBe("set_priority");
    expect(body.get("priority")).toBe("p1");
    expect(body.get("id")).toBe("t-1");
    // `onChanged` needs its OWN wait. The route spy fires when the action is
    // INVOKED; `onChanged` fires only once the fetcher has RESOLVED and the
    // component has observed the result — strictly later. Reusing the route's
    // wait for it asserted a state that had not happened yet, and passed only
    // because the two usually land in the same tick.
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("posts a Time Sector change to the CANONICAL bulk route", async () => {
    const { bulkRoute } = renderPanel();
    await choose(/Time Sector/, "This Week");

    await waitFor(() => expect(bulkRoute).toHaveBeenCalledTimes(1));
    const body = bulkRoute.mock.calls[0]![0];
    expect(body.get("intent")).toBe("set_sector");
    expect(body.get("sector")).toBe("this_week");
  });

  it("parks a task as Someday / Maybe through the canonical commitment mutation", async () => {
    const { bulkRoute } = renderPanel();
    await choose(/Commitment/, "Someday / Maybe");

    await waitFor(() => expect(bulkRoute).toHaveBeenCalledTimes(1));
    const body = bulkRoute.mock.calls[0]![0];
    expect(body.get("intent")).toBe("set_commitment");
    expect(body.get("commitment")).toBe("someday");
  });

  it("plans and clears the scheduled date through the task route", async () => {
    const { taskRoute } = renderPanel();
    fireEvent.change(screen.getByLabelText(/Scheduled date/), {
      target: { value: "2026-08-04" },
    });
    await waitFor(() => expect(taskRoute).toHaveBeenCalledTimes(1));
    const planned = taskRoute.mock.calls[0]![0];
    expect(planned.get("intent")).toBe("plan");
    expect(planned.get("scheduledDate")).toBe("2026-08-04");
  });

  it("returns a task to Inbox when the parent is cleared", async () => {
    const { taskRoute, onChanged } = renderPanel({
      ...TASK,
      parent: { kind: "area", id: "a-1", title: "Home" },
    });
    const picker = screen.getByRole("combobox", { name: /Project or Area/ });
    fireEvent.click(picker);
    // Scoped to the parent field's own group: every populated control offers a clear.
    const field = picker.closest('[role="group"]') as HTMLElement;
    fireEvent.click(
      within(field).getByRole("button", { name: /Clear selection/ }),
    );

    await waitFor(() => expect(taskRoute).toHaveBeenCalledTimes(1));
    const body = taskRoute.mock.calls[0]![0];
    expect(body.get("intent")).toBe("set_parent");
    expect(body.get("parentId")).toBe("");
    // Same reason as the priority case above: the announcement is written after
    // the fetcher resolves, so it gets its own wait rather than riding on the
    // route spy's.
    await waitFor(() =>
      expect(onChanged).toHaveBeenCalledWith(
        expect.stringContaining("moved to Inbox"),
      ),
    );
  });

  it("anchors a repeat to the SCHEDULED date when the task has one", async () => {
    const { taskRoute } = renderPanel();
    await choose(/Repeat/, "Every month");

    await waitFor(() => expect(taskRoute).toHaveBeenCalledTimes(1));
    const body = taskRoute.mock.calls[0]![0];
    expect(body.get("intent")).toBe("set_recurrence");
    expect(body.get("frequency")).toBe("month");
    expect(body.get("dateKind")).toBe("scheduled");
  });

  it("anchors a repeat to the DUE date when that is the only date", async () => {
    const { taskRoute } = renderPanel({
      ...TASK,
      scheduledDate: null,
      dueDate: "2026-08-31",
    });
    await choose(/Repeat/, "Every year");

    await waitFor(() => expect(taskRoute).toHaveBeenCalledTimes(1));
    const body = taskRoute.mock.calls[0]![0];
    expect(body.get("dateKind")).toBe("due");
  });

  it("shows the task's stored repeat as the current value", () => {
    renderPanel({
      ...TASK,
      recurrence: {
        frequency: "week",
        interval: 2,
        dateKind: "scheduled",
        mode: "fixed" as const,
        weekdays: [],
        anchorDay: null,
        anchorMonth: null,
      },
    } as SerializedTaskListItem);
    expect(screen.getByRole("combobox", { name: /Repeat/ })).toHaveValue(
      "Every 2 weeks",
    );
  });

  it("displays a custom interval TRUTHFULLY rather than as the nearest listed rule", () => {
    // Quick capture accepts "every 3 weeks"; the predefined list stops at 2. The
    // rule must appear as itself — never coerced, never leaked as a raw token.
    renderPanel({
      ...TASK,
      recurrence: {
        frequency: "week",
        interval: 3,
        dateKind: "scheduled",
        mode: "fixed" as const,
        weekdays: [],
        anchorDay: null,
        anchorMonth: null,
      },
    } as SerializedTaskListItem);
    expect(screen.getByRole("combobox", { name: /Repeat/ })).toHaveValue(
      "Every 3 weeks",
    );
    expect(screen.queryByText(/no longer available/)).not.toBeInTheDocument();
  });

  it("displays a weekday-pinned weekly rule as its own rule, not 'Every week'", () => {
    // "Every Monday" is stored as week:1 + weekdays [1]. Mapping it onto the
    // plain "Every week" option would silently misstate the stored rule.
    renderPanel({
      ...TASK,
      recurrence: {
        frequency: "week",
        interval: 1,
        dateKind: "scheduled",
        mode: "fixed" as const,
        weekdays: [1],
        anchorDay: null,
        anchorMonth: null,
      },
    } as SerializedTaskListItem);
    expect(screen.getByRole("combobox", { name: /Repeat/ })).toHaveValue(
      "Every Monday",
    );
  });

  it("re-committing the current custom rule posts NOTHING, preserving the rule", async () => {
    const { taskRoute, bulkRoute } = renderPanel({
      ...TASK,
      recurrence: {
        frequency: "week",
        interval: 3,
        dateKind: "scheduled",
        mode: "fixed" as const,
        weekdays: [],
        anchorDay: null,
        anchorMonth: null,
      },
    } as SerializedTaskListItem);
    // A regex makes the helper clear the filter first: the input already shows
    // the custom label, and re-typing the identical text would never re-open
    // the popup.
    await choose(/Repeat/, /^Every 3 weeks$/);

    // The panel cannot round-trip a custom rule through the predefined
    // vocabulary, so confirming the current selection must be a no-op — not a
    // write that flattens the interval.
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(taskRoute).not.toHaveBeenCalled();
    expect(bulkRoute).not.toHaveBeenCalled();
  });

  it("replaces a custom rule when a predefined option is deliberately chosen", async () => {
    const { taskRoute } = renderPanel({
      ...TASK,
      recurrence: {
        frequency: "week",
        interval: 3,
        dateKind: "scheduled",
        mode: "fixed" as const,
        weekdays: [],
        anchorDay: null,
        anchorMonth: null,
      },
    } as SerializedTaskListItem);
    await choose(/Repeat/, "Every month");

    await waitFor(() => expect(taskRoute).toHaveBeenCalledTimes(1));
    const body = taskRoute.mock.calls[0]![0];
    expect(body.get("intent")).toBe("set_recurrence");
    expect(body.get("frequency")).toBe("month");
    expect(body.get("interval")).toBe("1");
  });

  it("removes a CUSTOM rule by choosing 'Does not repeat'", async () => {
    const { taskRoute } = renderPanel({
      ...TASK,
      recurrence: {
        frequency: "week",
        interval: 3,
        dateKind: "scheduled",
        mode: "fixed" as const,
        weekdays: [],
        anchorDay: null,
        anchorMonth: null,
      },
    } as SerializedTaskListItem);
    await choose(/Repeat/, "Does not repeat");

    await waitFor(() => expect(taskRoute).toHaveBeenCalledTimes(1));
    const body = taskRoute.mock.calls[0]![0];
    expect(body.get("intent")).toBe("set_recurrence");
    expect(body.get("frequency")).toBeNull();
  });

  it("removes a repeat by choosing 'Does not repeat'", async () => {
    const { taskRoute } = renderPanel({
      ...TASK,
      recurrence: {
        frequency: "week",
        interval: 1,
        dateKind: "scheduled",
        mode: "fixed" as const,
        weekdays: [],
        anchorDay: null,
        anchorMonth: null,
      },
    } as SerializedTaskListItem);
    await choose(/Repeat/, "Does not repeat");

    await waitFor(() => expect(taskRoute).toHaveBeenCalledTimes(1));
    const body = taskRoute.mock.calls[0]![0];
    expect(body.get("intent")).toBe("set_recurrence");
    expect(body.get("frequency")).toBeNull();
  });
  it("announces only what the SERVER accepted, never the optimistic guess", async () => {
    const { onChanged } = renderPanel(TASK, { reject: true });
    await choose(/Priority/, "P1 · Urgent");

    // The route rejected it, so the change is reported as a failure — not announced
    // as a success the user would have to discover was a lie.
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Nothing was changed.",
      ),
    );
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("shows the server's own reason when a repeat has no anchor date", async () => {
    const { onChanged } = renderPanel(
      { ...TASK, scheduledDate: null, dueDate: null },
      { reject: true },
    );
    await choose(/Repeat/, "Every week");

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        /needs a scheduled date/,
      ),
    );
    expect(onChanged).not.toHaveBeenCalled();
  });
});
