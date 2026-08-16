import { RouterProvider, createMemoryRouter } from "react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FeedbackProvider } from "~/shared/feedback";
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
    colourRank: 0,
    createdAt: "2026-07-18T09:00:00.000Z",
    updatedAt: "2026-07-20T10:00:00.000Z",
    completedAt: null,
    status: "active",
    archivedAt: null,
    healthVisible: true,
    iconKey: null,
    colourSlot: null,
    area: { kind: "area", id: "a1", title: "Career" },
    goal: { kind: "goal", id: "g1", title: "Ship v2" },
    ...over,
  };
}

function renderInRouter(node: ReactElement) {
  const router = createMemoryRouter([{ path: "/", element: node }], {
    initialEntries: ["/"],
  });
  return render(
    <FeedbackProvider>
      <RouterProvider router={router} />
    </FeedbackProvider>,
  );
}

describe("ProjectOverview", () => {
  it("renders identity, the Active state, derived summary and roll-up progress", () => {
    renderInRouter(
      <ProjectOverview
        overview={overview()}
        progress={projectProgress(1, 4)}
        health={stubHealth({ taskTotal: 4, taskCompleted: 1 })}
        completed={false}
        completionPending={false}
        onToggleComplete={() => {}}
        onRename={async () => ({ ok: true }) as const}
        tasksTab={<div>tasks-content</div>}
        knowledgeTab={<div>Knowledge content</div>}
        linksTab={<div>links-content</div>}
        activityTab={<div>activity-content</div>}
        settingsTab={<div>settings-content</div>}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "DalyHub V2" }),
    ).toBeInTheDocument();
    // The workflow-status state pill (the fixture's default status is "active")
    // and the Area/Goal context.
    expect(screen.getAllByText("Active").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Career").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Ship v2").length).toBeGreaterThan(0);
    // THEME-01 — the roll-up is the shared meter: the percentage reaches
    // assistive tech through the progressbar, and the exact counts stay visible as
    // text so nothing depends on seeing the bar. RECORD-01 renamed the meter's
    // label from "Roll-up progress" to "Tasks": inside the compact summary band
    // the label is context rather than a heading, and on a Project record the
    // thing progressing is not in question.
    const meter = screen.getByRole("progressbar", { name: "Tasks" });
    expect(meter).toHaveAttribute("aria-valuenow", "25");
    expect(meter).toHaveAttribute(
      "aria-valuetext",
      "25% — 1 of 4 tasks complete",
    );
    expect(screen.getByText("1 of 4 tasks complete")).toBeInTheDocument();
    // The reversible completion action.
    expect(
      screen.getByRole("button", { name: "Complete project" }),
    ).toBeInTheDocument();
  });

  it("states an empty project has nothing to measure, not that it is 0% done", () => {
    // A project with no tasks is not a project that is 0% complete. The meter is
    // replaced by the sentence that says so (THEME-01).
    renderInRouter(
      <ProjectOverview
        overview={overview()}
        progress={projectProgress(0, 0)}
        health={stubHealth({ taskTotal: 0, taskCompleted: 0 })}
        completed={false}
        completionPending={false}
        onToggleComplete={() => {}}
        onRename={async () => ({ ok: true }) as const}
        tasksTab={<div>tasks-content</div>}
        knowledgeTab={<div>Knowledge content</div>}
        linksTab={<div>links-content</div>}
        activityTab={<div>activity-content</div>}
        settingsTab={<div>settings-content</div>}
      />,
    );
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByText("No tasks yet.")).toBeInTheDocument();
  });

  it("explains the project’s health with all current reasons and supporting facts", () => {
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
        onRename={async () => ({ ok: true }) as const}
        tasksTab={<div>tasks-content</div>}
        knowledgeTab={<div>Knowledge content</div>}
        linksTab={<div>links-content</div>}
        activityTab={<div>activity-content</div>}
        settingsTab={<div>settings-content</div>}
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
        onRename={async () => ({ ok: true }) as const}
        tasksTab={<div>tasks-content</div>}
        knowledgeTab={<div>Knowledge content</div>}
        linksTab={<div>links-content</div>}
        activityTab={<div>activity-content</div>}
        settingsTab={<div>settings-content</div>}
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
        onRename={async () => ({ ok: true }) as const}
        tasksTab={<div>tasks-content</div>}
        knowledgeTab={<div>Knowledge content</div>}
        linksTab={<div>links-content</div>}
        activityTab={<div>activity-content</div>}
        settingsTab={<div>settings-content</div>}
      />,
    );
    expect(screen.getAllByText(/No tasks yet/).length).toBeGreaterThan(0);
  });

  it("exposes the Tasks and Key links tabs and triggers completion + rename", async () => {
    const onToggleComplete = vi.fn();
    const onRename = vi.fn(async () => ({ ok: true }) as const);
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
        knowledgeTab={<div>Knowledge content</div>}
        linksTab={<div>links-content</div>}
        activityTab={<div>activity-content</div>}
        settingsTab={<div>settings-content</div>}
      />,
    );
    // Tab order follows the shared vocabulary: Tasks, Key links, Activity, then
    // Settings LAST (PROJ-05 §1 — Settings always sits last — DESIGN_SYSTEM.md →
    // Tabs).
    const tabNames = screen
      .getAllByRole("tab")
      .map((tab) => tab.textContent?.trim());
    expect(tabNames).toEqual([
      "Tasks",
      "Knowledge",
      "Linked",
      "Activity",
      "Settings",
    ]);

    expect(screen.getByRole("tab", { name: "Tasks" })).toBeInTheDocument();
    const linksTab = screen.getByRole("tab", { name: "Linked" });
    fireEvent.click(linksTab);
    expect(screen.getByText("links-content")).toBeInTheDocument();

    // The Activity tab lazily renders its content (the shared Timeline) only when
    // selected, exactly like the other record tabs.
    fireEvent.click(screen.getByRole("tab", { name: "Activity" }));
    expect(screen.getByText("activity-content")).toBeInTheDocument();

    // The Settings tab lazily renders its content too.
    fireEvent.click(screen.getByRole("tab", { name: "Settings" }));
    expect(screen.getByText("settings-content")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Complete project" }));
    expect(onToggleComplete).toHaveBeenCalledWith(true);

    // DS-16 — the rename is the heading itself, not a "Rename" button opening a
    // Drawer form. Same module callback, one fewer surface.
    fireEvent.click(screen.getByRole("button", { name: /^Project name:/ }));
    const titleInput = screen.getByRole("textbox", { name: "Project name" });
    fireEvent.change(titleInput, { target: { value: "Renamed project" } });
    fireEvent.keyDown(titleInput, { key: "Enter" });
    await waitFor(() =>
      expect(onRename).toHaveBeenCalledWith("Renamed project"),
    );
  });

  describe("health visibility (PROJ-05 §8 / ADR-037)", () => {
    it("shows the Health metadata for genuinely active work", () => {
      renderInRouter(
        <ProjectOverview
          overview={overview({ status: "active", healthVisible: true })}
          progress={projectProgress(1, 4)}
          health={stubHealth({ taskTotal: 4, taskCompleted: 1 })}
          completed={false}
          completionPending={false}
          onToggleComplete={() => {}}
          onRename={async () => ({ ok: true }) as const}
          tasksTab={<div>tasks-content</div>}
          knowledgeTab={<div>Knowledge content</div>}
          linksTab={<div>links-content</div>}
          activityTab={<div>activity-content</div>}
          settingsTab={<div>settings-content</div>}
        />,
      );
      /*
       * RECORD-01 — health is stated ONCE, as the summary band's state chip
       * beside the progress it explains, and its reasons are the band's signal
       * line. It used to be a labelled "Health" chip in the header AND again
       * inside the roll-up card, which is the duplication this PR removed — so
       * the assertion is now that the state and its reason are present, not
       * that a "Health" label is.
       */
      expect(screen.getByText("On track")).toBeInTheDocument();
      const summary = screen.getByRole("region", { name: "Summary" });
      expect(summary).toBeInTheDocument();
    });

    it.each([
      ["Planned", { status: "planned" as const, healthVisible: false }, false],
      ["On-hold", { status: "on_hold" as const, healthVisible: false }, false],
      [
        "Completed",
        {
          completedAt: "2026-07-21T00:00:00.000Z" as string | null,
          healthVisible: false,
        },
        true,
      ],
      [
        "Archived",
        {
          archivedAt: "2026-07-21T00:00:00.000Z" as string | null,
          healthVisible: false,
        },
        false,
      ],
    ] satisfies [string, Partial<SerializedProjectOverview>, boolean][])(
      "hides BOTH the header Health metadata and the detailed health panel for a %s project",
      (_label, over, completed) => {
        // An overdue-triggering fixture: if either the summary band's state
        // chip OR its health signal line rendered despite `healthVisible:
        // false`, this state label and reason text would be visible.
        renderInRouter(
          <ProjectOverview
            overview={overview(over)}
            progress={projectProgress(1, 4)}
            health={stubHealth({
              taskTotal: 4,
              taskCompleted: 1,
              overdueOpen: 1,
            })}
            completed={completed}
            completionPending={false}
            onToggleComplete={() => {}}
            onRename={async () => ({ ok: true }) as const}
            tasksTab={<div>tasks-content</div>}
            knowledgeTab={<div>Knowledge content</div>}
            linksTab={<div>links-content</div>}
            activityTab={<div>activity-content</div>}
            settingsTab={<div>settings-content</div>}
          />,
        );
        expect(screen.queryByText("Health")).not.toBeInTheDocument();
        expect(screen.queryByText("At risk")).not.toBeInTheDocument();
        expect(
          screen.queryByText("1 task past its due date"),
        ).not.toBeInTheDocument();
      },
    );
  });

  describe("archived read-only rendering (PROJ-05 §5)", () => {
    it("hides Complete/Reopen and Rename, and shows a calm read-only banner", () => {
      renderInRouter(
        <ProjectOverview
          overview={overview({
            archivedAt: "2026-07-21T00:00:00.000Z",
            healthVisible: false,
          })}
          progress={projectProgress(1, 4)}
          health={stubHealth({ taskTotal: 4, taskCompleted: 1 })}
          completed={false}
          completionPending={false}
          onToggleComplete={() => {}}
          onRename={async () => ({ ok: true }) as const}
          tasksTab={<div>tasks-content</div>}
          knowledgeTab={<div>Knowledge content</div>}
          linksTab={<div>links-content</div>}
          activityTab={<div>activity-content</div>}
          settingsTab={<div>settings-content</div>}
        />,
      );
      // Hidden (not merely disabled) — an archived project's own mutation route
      // rejects both, and the repository never leaves this to a disabled control.
      expect(
        screen.queryByRole("button", { name: "Complete project" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Reopen project" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Rename" }),
      ).not.toBeInTheDocument();
      // The Archived state pill and a calm explanation — never colour-only.
      expect(screen.getAllByText("Archived").length).toBeGreaterThan(0);
      expect(screen.getByText(/archived and read-only/)).toBeInTheDocument();
      // Settings is still reachable and remains the final tab.
      const tabNames = screen
        .getAllByRole("tab")
        .map((tab) => tab.textContent?.trim());
      expect(tabNames).toEqual([
        "Tasks",
        "Knowledge",
        "Linked",
        "Activity",
        "Settings",
      ]);
    });

    it("hides Complete/Reopen and Rename for an archived project that was also completed", () => {
      // Archived AND completed can co-occur (archiving only checks unfinished
      // Tasks, never completion state) — the archived read-only rule wins
      // regardless (PROJ-05 §5), so neither mutation control renders.
      renderInRouter(
        <ProjectOverview
          overview={overview({
            completedAt: "2026-07-20T00:00:00.000Z",
            archivedAt: "2026-07-21T00:00:00.000Z",
            healthVisible: false,
          })}
          progress={projectProgress(4, 4)}
          health={stubHealth({ taskTotal: 4, taskCompleted: 4 })}
          completed
          completionPending={false}
          onToggleComplete={() => {}}
          onRename={async () => ({ ok: true }) as const}
          tasksTab={<div>tasks-content</div>}
          knowledgeTab={<div>Knowledge content</div>}
          linksTab={<div>links-content</div>}
          activityTab={<div>activity-content</div>}
          settingsTab={<div>settings-content</div>}
        />,
      );
      expect(
        screen.queryByRole("button", { name: "Complete project" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Reopen project" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Rename" }),
      ).not.toBeInTheDocument();
    });
  });
});
