/**
 * TASKS-04 — Review Inbox.
 *
 * Triage is a workflow, so it is asserted behaviourally: progress through the current
 * Inbox set is visible, the queue is walkable by keyboard as well as by button, the
 * empty state teaches the next action rather than dead-ending, and the surface reuses
 * the ONE shared quick-edit panel rather than a Review-only editor.
 */

import { createMemoryRouter, RouterProvider } from "react-router";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TasksReviewWorkspace } from "~/modules/tasks/TasksReviewWorkspace";
import type { TasksReviewData } from "~/modules/tasks/tasks-contract";
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

function renderReview(over: Partial<TasksReviewData> = {}) {
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
        action: async () => ({ kind: "update", status: "success" }),
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
