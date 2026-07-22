import { RouterProvider, createMemoryRouter } from "react-router";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import { ProjectOverview } from "~/modules/projects/ProjectOverview";

import { stubHealth } from "../../support/project-health";
import {
  projectProgress,
  type SerializedProjectOverview,
} from "~/modules/projects/project-view";

/**
 * PROJ-01 — the project overview Record Layout: identity + state, the derived
 * summary (Area/Goal/state/progress), the reversible Complete/Reopen action, and the
 * Tasks + Key links tabs.
 */

function overview(
  over: Partial<SerializedProjectOverview> = {},
): SerializedProjectOverview {
  return {
    id: "p1",
    title: "DalyHub V2",
    createdAt: "2026-07-18T09:00:00.000Z",
    updatedAt: "2026-07-20T10:00:00.000Z",
    completedAt: null,
    area: { kind: "area", id: "a1", title: "Career" },
    goal: { kind: "goal", id: "g1", title: "Ship v2" },
    ...over,
  };
}

function renderInRouter(node: ReactElement) {
  const router = createMemoryRouter([{ path: "/", element: node }], {
    initialEntries: ["/"],
  });
  return render(<RouterProvider router={router} />);
}

describe("ProjectOverview", () => {
  it("renders identity, Open state, derived summary and roll-up progress", () => {
    renderInRouter(
      <ProjectOverview
        overview={overview()}
        progress={projectProgress(1, 4)}
        health={stubHealth({ taskTotal: 4, taskCompleted: 1 })}
        completed={false}
        completionPending={false}
        onToggleComplete={() => {}}
        onRename={() => {}}
        tasksTab={<div>tasks-content</div>}
        linksTab={<div>links-content</div>}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "DalyHub V2" }),
    ).toBeInTheDocument();
    // Open state pill and the Area/Goal context.
    expect(screen.getAllByText("Open").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Career").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Ship v2").length).toBeGreaterThan(0);
    // The roll-up progress presentation.
    expect(screen.getByText(/25% — 1 of 4 tasks complete/)).toBeInTheDocument();
    // The reversible completion action.
    expect(
      screen.getByRole("button", { name: "Complete project" }),
    ).toBeInTheDocument();
  });

  it("explains the project's health with all current reasons and supporting facts", () => {
    renderInRouter(
      <ProjectOverview
        overview={overview()}
        progress={projectProgress(0, 4)}
        health={stubHealth({
          taskTotal: 4,
          taskCompleted: 0,
          overdueOpen: 1,
          waitingOpen: 1,
          upcomingDueOpen: 1,
        })}
        completed={false}
        completionPending={false}
        onToggleComplete={() => {}}
        onRename={() => {}}
        tasksTab={<div>tasks-content</div>}
        linksTab={<div>links-content</div>}
      />,
    );
    // The at-risk state pill (appears in header + panel).
    expect(screen.getAllByText("At risk").length).toBeGreaterThan(0);
    // Multiple reasons are preserved, not just the winner.
    expect(screen.getByText("1 task past its due date")).toBeInTheDocument();
    expect(screen.getByText("1 of 4 open tasks waiting")).toBeInTheDocument();
    expect(screen.getByText("1 task due soon")).toBeInTheDocument();
  });

  it("offers Reopen when the project is completed", () => {
    renderInRouter(
      <ProjectOverview
        overview={overview({ completedAt: "2026-07-21T00:00:00.000Z" })}
        progress={projectProgress(4, 4)}
        health={stubHealth({ taskTotal: 4, taskCompleted: 4 })}
        completed
        completionPending={false}
        onToggleComplete={() => {}}
        onRename={() => {}}
        tasksTab={<div>tasks-content</div>}
        linksTab={<div>links-content</div>}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Reopen project" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Completed").length).toBeGreaterThan(0);
  });

  it("presents an empty project as 'No tasks yet' (never 100%)", () => {
    renderInRouter(
      <ProjectOverview
        overview={overview({ goal: null })}
        progress={projectProgress(0, 0)}
        health={stubHealth({ taskTotal: 0, taskCompleted: 0 })}
        completed={false}
        completionPending={false}
        onToggleComplete={() => {}}
        onRename={() => {}}
        tasksTab={<div>tasks-content</div>}
        linksTab={<div>links-content</div>}
      />,
    );
    expect(screen.getAllByText(/No tasks yet/).length).toBeGreaterThan(0);
  });

  it("exposes the Tasks and Key links tabs and triggers completion + rename", () => {
    const onToggleComplete = vi.fn();
    const onRename = vi.fn();
    renderInRouter(
      <ProjectOverview
        overview={overview()}
        progress={projectProgress(1, 4)}
        health={stubHealth({ taskTotal: 4, taskCompleted: 1 })}
        completed={false}
        completionPending={false}
        onToggleComplete={onToggleComplete}
        onRename={onRename}
        tasksTab={<div>tasks-content</div>}
        linksTab={<div>links-content</div>}
      />,
    );
    expect(screen.getByRole("tab", { name: "Tasks" })).toBeInTheDocument();
    const linksTab = screen.getByRole("tab", { name: "Key links" });
    fireEvent.click(linksTab);
    expect(screen.getByText("links-content")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Complete project" }));
    expect(onToggleComplete).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    expect(onRename).toHaveBeenCalled();
  });
});
