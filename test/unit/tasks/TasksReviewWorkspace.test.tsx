/**
 * TASKS-04 — Review Inbox.
 *
 * Triage is a workflow, so it is asserted behaviourally: progress through the current
 * Inbox set is visible, the queue is walkable by keyboard as well as by button, the
 * empty state teaches the next action rather than dead-ending, and the surface reuses
 * the ONE shared quick-edit panel rather than a Review-only editor.
 */

import { createMemoryRouter, RouterProvider } from "react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TasksReviewWorkspace } from "~/modules/tasks/TasksReviewWorkspace";
import type { TasksReviewData } from "~/modules/tasks/tasks-contract";
import { TASK_COMPLETION_FALLBACK_ERROR } from "~/shared/task-record/task-completion-outcome";
import type { SerializedTaskListItem } from "~/shared/task-record/task-view";

function task(id: string, title: string): SerializedTaskListItem {
  return {
    id,
    title,
    createdAt: "2026-07-30T00:00:00.000Z",
    updatedAt: "2026-07-30T00:00:00.000Z",
    completedAt: null,
    status: "todo",
    priority: null,
    dueDate: null,
    scheduledDate: null,
    timeSector: null,
    commitmentState: "active",
    delegation: null,
    parent: null,
    waiting: null,
  };
}

function renderReview(
  over: Partial<TasksReviewData> = {},
  /**
   * DEBT-89 — what the canonical Task route ANSWERS. The default is the
   * acceptance every existing assertion here was written against; a refusal is
   * the shape `/tasks/:taskId` genuinely returns for an archived Project, a
   * Task deleted in another tab, or a storage failure.
   */
  taskAction: () => unknown = () => ({ kind: "update", status: "success" }),
) {
  const data: TasksReviewData = {
    items: [task("t-1", "Book the dentist"), task("t-2", "Renew the rego")],
    nextCursor: null,
    todayIso: "2026-07-30",
    failed: false,
    ...over,
  };
  const router = createMemoryRouter(
    [
      {
        path: "/tasks/review",
        element: <TasksReviewWorkspace data={data} />,
      },
      { path: "/tasks/bulk", action: async () => ({ ok: true }) },
      {
        path: "/tasks/:taskId",
        action: async () => taskAction(),
      },
    ],
    { initialEntries: ["/tasks/review"] },
  );
  render(<RouterProvider router={router} />);
}

describe("Review Inbox", () => {
  it("reviews the first task and reports progress through the set", () => {
    renderReview();
    expect(
      screen.getByRole("heading", { level: 1, name: "Review Inbox" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Reviewing task 1 of 2" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Book the dentist" }),
    ).toBeInTheDocument();
  });

  it("reuses the ONE shared quick-edit panel rather than a Review-only editor", () => {
    renderReview();
    const panel = screen.getByTestId("task-quick-edit");
    expect(panel).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: /Project or Area/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: /Repeat/ }),
    ).toBeInTheDocument();
  });

  it("skips forward and back through the queue", () => {
    renderReview();
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(
      screen.getByRole("heading", { name: "Reviewing task 2 of 2" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Renew the rego" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(
      screen.getByRole("heading", { name: "Reviewing task 1 of 2" }),
    ).toBeInTheDocument();
  });

  it("walks the queue by keyboard", () => {
    renderReview();
    fireEvent.keyDown(window, { key: "j" });
    expect(
      screen.getByRole("heading", { name: "Reviewing task 2 of 2" }),
    ).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "k" });
    expect(
      screen.getByRole("heading", { name: "Reviewing task 1 of 2" }),
    ).toBeInTheDocument();
  });

  it("ignores the shortcuts while the user is typing into a control", () => {
    renderReview();
    const field = screen.getByRole("combobox", { name: /Project or Area/ });
    fireEvent.keyDown(field, { key: "j" });
    expect(
      screen.getByRole("heading", { name: "Reviewing task 1 of 2" }),
    ).toBeInTheDocument();
  });

  it("cannot skip past the end of a fully-loaded queue", () => {
    renderReview({ items: [task("t-1", "Only one")] });
    expect(screen.getByRole("button", { name: "Skip" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  });

  it("teaches the next action when the Inbox is clear", () => {
    renderReview({ items: [] });
    expect(
      screen.getByRole("heading", { name: "Inbox is clear" }),
    ).toBeInTheDocument();
    // The empty state teaches the next action; the pane header keeps its own way back.
    expect(
      screen.getAllByRole("link", { name: "Back to Tasks" }).length,
    ).toBeGreaterThan(0);
  });

  it("offers a calm recovery when the Inbox could not be loaded", () => {
    renderReview({ items: [], failed: true });
    expect(
      screen.getByRole("heading", { name: "We couldn’t load your Inbox" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });

  it("offers the next page rather than stopping silently", () => {
    renderReview({ items: [task("t-1", "Only one")], nextCursor: "c-1" });
    expect(
      screen.getByRole("link", { name: /Load the next/ }),
    ).toBeInTheDocument();
  });

  it("announces triage outcomes through a live region", () => {
    renderReview();
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    const status = screen
      .getAllByRole("status")
      .map((node) => node.textContent ?? "")
      .join(" ");
    expect(status).toContain("Skipped to the next task.");
  });
});

/* -------------------------------------------------------------------------- */
/* DEBT-89 — the Review Inbox reports the ROUTE's answer                       */
/* -------------------------------------------------------------------------- */

describe("DEBT-89 — a REFUSED completion is not announced as a success", () => {
  /*
   * The failure mode, stated exactly: this surface announced "Task completed."
   * as soon as the completion fetcher settled with any data at all, without
   * reading it. `/tasks/:taskId` genuinely refuses — an archived Project
   * (`TaskProjectArchivedError` / `SpineParentUnavailableError`), a Task deleted
   * in another tab, any storage failure — and the owner, and a screen reader
   * through the `role="status"` region, were told the work was done.
   *
   * Both assertions below FAIL against the previous implementation: the first
   * because the region said "Task completed.", the second because there was no
   * visible refusal anywhere on the page.
   */
  const REFUSAL = {
    kind: "completion",
    ok: false,
    message: "That task's project is archived, so it can't be completed.",
  } as const;

  it("announces the route's own refusal instead of a success", async () => {
    renderReview({}, () => REFUSAL);
    fireEvent.click(screen.getByRole("button", { name: "Complete" }));

    await waitFor(() => {
      const status = screen
        .getAllByRole("status")
        .map((node) => node.textContent ?? "")
        .join(" ");
      expect(status).toContain(REFUSAL.message);
      expect(status).not.toContain("Task completed.");
    });
  });

  it("SHOWS the refusal, so a sighted owner sees that nothing happened", async () => {
    renderReview({}, () => REFUSAL);
    fireEvent.click(screen.getByRole("button", { name: "Complete" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(REFUSAL.message);
  });

  it("leaves the Task in the queue after a refusal, so it can be retried", async () => {
    renderReview({}, () => REFUSAL);
    fireEvent.click(screen.getByRole("button", { name: "Complete" }));
    await screen.findByRole("alert");
    expect(
      screen.getByRole("heading", { name: "Reviewing task 1 of 2" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Book the dentist" }),
    ).toBeInTheDocument();
  });

  it("falls back to a real sentence when the route refuses without one", async () => {
    renderReview({}, () => ({ ok: false }));
    fireEvent.click(screen.getByRole("button", { name: "Complete" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      TASK_COMPLETION_FALLBACK_ERROR,
    );
  });

  it("still announces a real completion as one", async () => {
    renderReview({}, () => ({ kind: "completion", ok: true }));
    fireEvent.click(screen.getByRole("button", { name: "Complete" }));
    await waitFor(() => {
      const status = screen
        .getAllByRole("status")
        .map((node) => node.textContent ?? "")
        .join(" ");
      expect(status).toContain("Task completed.");
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
