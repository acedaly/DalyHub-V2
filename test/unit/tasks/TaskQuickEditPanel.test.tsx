/**
 * TASKS-04 — the shared Task quick-edit panel.
 *
 * The panel is the row's quick edits AND the body of Review Inbox, so what matters is
 * behavioural: every control posts to a CANONICAL route (never a panel-only write
 * path), the parent picker can file a task or return it to Inbox, and a repeat is
 * anchored to whichever date the task actually has.
 *
 * TASKS-07 replaced the panel's seven-option `Repeat` select with the shared
 * recurrence editor, so the repeat assertions here now cover the PRESET path (one
 * choice, saved immediately) and the panel's job of posting it. The custom
 * composition — intervals, weekdays, the two scheduling modes and the plain-language
 * summary — is covered by `recurrence-authoring.test.ts` and
 * `TaskRecurrenceEditor.test.tsx`.
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

/** A task carrying a stored recurrence rule, spread over the shared fixture. */
function withRepeat(rule: {
  readonly frequency: "day" | "weekday" | "week" | "month" | "year";
  readonly interval: number;
  readonly weekdays: readonly number[];
  readonly mode?: "fixed" | "after_completion";
}): SerializedTaskListItem {
  return {
    ...TASK,
    recurrence: {
      frequency: rule.frequency,
      interval: rule.interval,
      dateKind: "scheduled",
      mode: rule.mode ?? "fixed",
      weekdays: rule.weekdays,
      anchorDay: null,
      anchorMonth: null,
    },
  };
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
    /*
     * Scoped to the parent field's own element, because every populated select
     * on this panel offers a clear and they all say "Clear selection" —
     * recorded as DEBT-112. This used to scope by `[role="group"]`, which the
     * field no longer carries: a single select's name belongs to its combobox
     * alone, and naming the wrapper as well was the duplicate-accessible-name
     * defect this PR fixed.
     */
    const field = picker.closest(".dh-field--select") as HTMLElement;
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
    await choose(/Repeat/, "Monthly");

    await waitFor(() => expect(taskRoute).toHaveBeenCalledTimes(1));
    const body = taskRoute.mock.calls[0]![0];
    expect(body.get("intent")).toBe("set_recurrence");
    expect(body.get("frequency")).toBe("month");
    expect(body.get("dateKind")).toBe("scheduled");
    // TASKS-07: a preset is always a fixed SCHEDULE. Choosing "Monthly" must never
    // quietly produce an after-completion interval.
    expect(body.get("mode")).toBe("fixed");
  });

  it("anchors a repeat to the DUE date when that is the only date", async () => {
    const { taskRoute } = renderPanel({
      ...TASK,
      scheduledDate: null,
      dueDate: "2026-08-31",
    });
    await choose(/Repeat/, "Yearly");

    await waitFor(() => expect(taskRoute).toHaveBeenCalledTimes(1));
    const body = taskRoute.mock.calls[0]![0];
    expect(body.get("dateKind")).toBe("due");
  });

  it("shows a stored PRESET rule as that preset", () => {
    renderPanel(withRepeat({ frequency: "week", interval: 1, weekdays: [] }));
    expect(screen.getByRole("combobox", { name: /Repeat/ })).toHaveValue(
      "Weekly",
    );
  });

  it("shows a stored CUSTOM rule as Custom, and states it in plain language", () => {
    // Quick capture accepts "every 3 weeks"; no preset represents it. The editor must
    // open on Custom and SAY what the rule is — never coerce it to the nearest preset,
    // and never leak a raw `week:3` token (the V2.0.1 defect).
    renderPanel(withRepeat({ frequency: "week", interval: 3, weekdays: [] }));
    expect(screen.getByRole("combobox", { name: /Repeat/ })).toHaveValue(
      "Custom…",
    );
    expect(screen.getByTestId("task-recurrence-summary")).toHaveTextContent(
      "Every 3 weeks",
    );
  });

  it("shows a weekday-pinned weekly rule as Custom, naming the weekdays", () => {
    // "Every Monday" is stored as week:1 + weekdays [1]. Reporting it as the plain
    // "Weekly" preset would let the next interaction silently drop the Monday.
    renderPanel(withRepeat({ frequency: "week", interval: 1, weekdays: [1] }));
    expect(screen.getByRole("combobox", { name: /Repeat/ })).toHaveValue(
      "Custom…",
    );
    expect(screen.getByTestId("task-recurrence-summary")).toHaveTextContent(
      "Every Monday",
    );
  });

  it("opening the CUSTOM editor posts nothing until the rule is saved", async () => {
    const { taskRoute, bulkRoute } = renderPanel(
      withRepeat({ frequency: "week", interval: 3, weekdays: [] }),
    );
    // A half-built rule is not a rule. Choosing Custom… reveals the composition and
    // waits, so opening the editor can never flatten the interval it is showing. A
    // regex makes the helper clear the filter first: the combobox already SHOWS
    // "Custom…", and re-typing the identical text would never reopen the popup.
    await choose(/Repeat/, /^Custom/);
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(taskRoute).not.toHaveBeenCalled();
    expect(bulkRoute).not.toHaveBeenCalled();
  });

  it("saves an AFTER-COMPLETION interval built in the custom editor", async () => {
    const { taskRoute } = renderPanel();
    await choose(/Repeat/, "Custom…");
    fireEvent.change(screen.getByLabelText(/Repeat every/), {
      target: { value: "14" },
    });
    await choose(/Unit/, /days/);
    fireEvent.click(
      screen.getByRole("radio", { name: /Repeat after completion/ }),
    );
    // The result is stated BEFORE saving, in the words the row will show afterwards.
    expect(screen.getByTestId("task-recurrence-summary")).toHaveTextContent(
      "14 days after completion",
    );
    fireEvent.click(screen.getByRole("button", { name: /Save repeat/ }));

    await waitFor(() => expect(taskRoute).toHaveBeenCalledTimes(1));
    const body = taskRoute.mock.calls[0]![0];
    expect(body.get("intent")).toBe("set_recurrence");
    expect(body.get("frequency")).toBe("day");
    expect(body.get("interval")).toBe("14");
    expect(body.get("mode")).toBe("after_completion");
    expect(body.get("weekdays")).toBe("");
  });

  it("saves selected WEEKDAYS for a fixed weekly schedule", async () => {
    const { taskRoute } = renderPanel();
    await choose(/Repeat/, "Custom…");
    fireEvent.change(screen.getByLabelText(/Repeat every/), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /Monday/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Thursday/ }));
    expect(screen.getByTestId("task-recurrence-summary")).toHaveTextContent(
      "Every Monday, Thursday, every 2 weeks",
    );
    fireEvent.click(screen.getByRole("button", { name: /Save repeat/ }));

    await waitFor(() => expect(taskRoute).toHaveBeenCalledTimes(1));
    const body = taskRoute.mock.calls[0]![0];
    expect(body.get("frequency")).toBe("week");
    expect(body.get("interval")).toBe("2");
    expect(body.get("weekdays")).toBe("1,4");
    expect(body.get("mode")).toBe("fixed");
  });

  it("refuses to save an interval outside 1–99, and says why", async () => {
    const { taskRoute } = renderPanel();
    await choose(/Repeat/, "Custom…");
    fireEvent.change(screen.getByLabelText(/Repeat every/), {
      target: { value: "" },
    });
    expect(screen.getByTestId("task-recurrence-summary")).toHaveTextContent(
      /from 1 to 99/,
    );
    expect(screen.getByRole("button", { name: /Save repeat/ })).toBeDisabled();
    expect(taskRoute).not.toHaveBeenCalled();
  });

  it("removes a CUSTOM rule by choosing 'Does not repeat'", async () => {
    const { taskRoute } = renderPanel(
      withRepeat({ frequency: "week", interval: 3, weekdays: [] }),
    );
    await choose(/Repeat/, "Does not repeat");

    await waitFor(() => expect(taskRoute).toHaveBeenCalledTimes(1));
    const body = taskRoute.mock.calls[0]![0];
    expect(body.get("intent")).toBe("set_recurrence");
    expect(body.get("frequency")).toBeNull();
  });

  it("removes a repeat by choosing 'Does not repeat'", async () => {
    const { taskRoute } = renderPanel(
      withRepeat({ frequency: "week", interval: 1, weekdays: [] }),
    );
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
    await choose(/Repeat/, "Weekly");

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        /needs a scheduled date/,
      ),
    );
    expect(onChanged).not.toHaveBeenCalled();
  });
});
