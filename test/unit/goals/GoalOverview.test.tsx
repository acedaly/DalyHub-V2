import { RouterProvider, createMemoryRouter } from "react-router";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import { GoalOverview } from "~/modules/goals/GoalOverview";
import type {
  SerializedGoalDetails,
  SerializedGoalOverview,
  SerializedGoalProjectContribution,
  SerializedGoalProjectItem,
} from "~/modules/goals/goal-view";
import type {
  GoalAlignment,
  SerializedGoalAlignmentEvidence,
} from "~/shared/alignment";

/**
 * AREA-02 — the canonical Goal record: identity + explicit Open/Completed
 * state kept separate from derived Project-contribution progress, the
 * definition-of-done empty/set states, the target-date states, the Projects
 * tab's exact badge independent of the supplied page, and the Rename/Edit
 * details/Complete actions.
 */

const TODAY = "2026-07-22";

function overview(
  over: Partial<SerializedGoalOverview> = {},
): SerializedGoalOverview {
  return {
    id: "g1",
    title: "Run a half-marathon",
    createdAt: "2026-07-01T09:00:00.000Z",
    updatedAt: "2026-07-20T10:00:00.000Z",
    completedAt: null,
    area: { id: "a1", title: "Health" },
    ...over,
  };
}

function details(
  over: Partial<SerializedGoalDetails> = {},
): SerializedGoalDetails {
  return { targetDate: null, definitionOfDone: null, ...over };
}

function contribution(
  over: Partial<SerializedGoalProjectContribution> = {},
): SerializedGoalProjectContribution {
  return {
    total: 0,
    completed: 0,
    incomplete: 0,
    active: 0,
    planned: 0,
    onHold: 0,
    archived: 0,
    ...over,
  };
}

function project(
  over: Partial<SerializedGoalProjectItem> = {},
): SerializedGoalProjectItem {
  return {
    id: "p1",
    title: "12-week training plan",
    createdAt: "2026-07-01T09:00:00.000Z",
    updatedAt: "2026-07-01T09:00:00.000Z",
    completedAt: null,
    status: "active",
    archivedAt: null,
    taskTotal: 4,
    taskCompleted: 1,
    ...over,
  };
}

function alignment(over: Partial<GoalAlignment> = {}): GoalAlignment {
  return {
    state: "no_structure",
    label: "No contribution path",
    tone: "neutral",
    reasons: [
      {
        code: "no_structure",
        tone: "neutral",
        summary: "No Projects currently advance this Goal.",
      },
    ],
    evaluatedAtIso: "2026-07-22T00:00:00.000Z",
    ...over,
  };
}

function renderInRouter(node: ReactElement) {
  const router = createMemoryRouter([{ path: "/", element: node }], {
    initialEntries: ["/"],
  });
  return render(<RouterProvider router={router} />);
}

function renderGoal(
  over: Partial<{
    overview: SerializedGoalOverview;
    details: SerializedGoalDetails;
    contribution: SerializedGoalProjectContribution;
    projects: readonly SerializedGoalProjectItem[];
    projectsNextCursor: string | null;
    alignment: GoalAlignment;
    alignmentEvidence: readonly SerializedGoalAlignmentEvidence[];
    alignmentEvidenceHasMore: boolean;
    completionPending: boolean;
    onToggleComplete: (complete: boolean) => void;
    onRename: () => void;
    onEditDetails: () => void;
    onOpenProject: (id: string) => void;
    onOpenTask: (id: string) => void;
  }> = {},
) {
  return renderInRouter(
    <GoalOverview
      overview={over.overview ?? overview()}
      details={over.details ?? details()}
      contribution={over.contribution ?? contribution()}
      projects={over.projects ?? []}
      projectsNextCursor={over.projectsNextCursor ?? null}
      todayIso={TODAY}
      alignment={over.alignment ?? alignment()}
      alignmentEvidence={over.alignmentEvidence ?? []}
      alignmentEvidenceHasMore={over.alignmentEvidenceHasMore ?? false}
      completionPending={over.completionPending ?? false}
      onToggleComplete={over.onToggleComplete ?? (() => {})}
      onRename={over.onRename ?? (() => {})}
      onEditDetails={over.onEditDetails ?? (() => {})}
      onOpenProject={over.onOpenProject ?? (() => {})}
      onOpenTask={over.onOpenTask ?? (() => {})}
      activityTab={<div>activity-content</div>}
    />,
  );
}

describe("GoalOverview", () => {
  it("renders identity, the Area breadcrumb and the Open state", () => {
    renderGoal();
    expect(
      screen.getByRole("heading", { name: "Run a half-marathon" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Areas" })).toHaveAttribute(
      "href",
      "/areas",
    );
    // The current record is the LAST breadcrumb item: shown as the calm
    // current-location text, not a redundant self-link.
    expect(screen.getByText("Health")).toHaveAttribute("aria-current", "page");
    expect(screen.getAllByText("Open").length).toBeGreaterThan(0);
  });

  it("shows the Completed state explicitly, separate from derived progress", () => {
    renderGoal({
      overview: overview({ completedAt: "2026-07-20T00:00:00.000Z" }),
    });
    expect(screen.getAllByText("Completed").length).toBeGreaterThan(0);
    // Explicit completion and derived progress are never conflated: an
    // empty-contribution Goal can still show "No Projects contributing yet"
    // while explicitly Completed.
    expect(
      screen.getByText("No Projects contributing yet"),
    ).toBeInTheDocument();
  });

  it("shows the honest 'no Projects contributing yet' state for a zero denominator", () => {
    renderGoal();
    expect(
      screen.getByText("No Projects contributing yet"),
    ).toBeInTheDocument();
  });

  it("shows exact partial contribution progress with an accessible percentage", () => {
    renderGoal({
      contribution: contribution({ total: 4, completed: 1, incomplete: 3 }),
    });
    expect(
      screen.getByText(/25% — 1 of 4 Projects complete/),
    ).toBeInTheDocument();
  });

  it("shows complete (100%) contribution progress without declaring the Goal complete", () => {
    renderGoal({
      contribution: contribution({ total: 2, completed: 2 }),
    });
    expect(
      screen.getByText(/100% — 2 of 2 Projects complete/),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Open").length).toBeGreaterThan(0);
  });

  it("shows the empty definition-of-done state", () => {
    renderGoal();
    expect(
      screen.getByText("No definition of done recorded yet."),
    ).toBeInTheDocument();
  });

  it("shows a set definition of done, preserving line breaks", () => {
    renderGoal({
      details: details({ definitionOfDone: "Cross the line.\nUnder 2 hours." }),
    });
    const node = screen.getByText(
      (_content, element) =>
        element?.textContent === "Cross the line.\nUnder 2 hours.",
    );
    expect(node).toHaveClass("dh-goal-overview__definition-text");
    // Preserved via CSS (`white-space: pre-wrap`), not a Markdown pipeline.
    expect(node.textContent).toContain("\n");
  });

  it("shows the unset target-date state", () => {
    renderGoal();
    expect(screen.getByText("No target date set")).toBeInTheDocument();
  });

  it("shows a set, upcoming target date (in both the header and the summary)", () => {
    renderGoal({ details: details({ targetDate: "2026-08-01" }) });
    expect(screen.getAllByText(/1 Aug 2026/).length).toBeGreaterThan(0);
  });

  it("shows an overdue target date with text, not colour alone", () => {
    renderGoal({ details: details({ targetDate: "2026-07-01" }) });
    const overdueMentions = screen.getAllByText(/1 Jul 2026.*overdue/);
    expect(overdueMentions.length).toBeGreaterThan(0);
  });

  it("shows the honest 'no Projects' empty state on the Projects tab", () => {
    renderGoal();
    fireEvent.click(screen.getByRole("tab", { name: /Projects/ }));
    expect(
      screen.getByText("No Projects advancing this Goal"),
    ).toBeInTheDocument();
  });

  it("shows Projects, opens the canonical Project record and reports its task roll-up", () => {
    const onOpenProject = vi.fn();
    renderGoal({ projects: [project()], onOpenProject });
    fireEvent.click(screen.getByRole("tab", { name: /Projects/ }));
    expect(screen.getByText("Task roll-up: 1 of 4 tasks")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("link", { name: "Open 12-week training plan" }),
    );
    expect(onOpenProject).toHaveBeenCalledWith("p1");
  });

  it("uses the exact contribution total for the Projects tab badge, independent of a smaller supplied first page", () => {
    // Contribution says 60 Projects total; only ONE is supplied as the
    // displayed first page — the badge must still read the exact total.
    renderGoal({
      contribution: contribution({ total: 60, completed: 10, incomplete: 50 }),
      projects: [project()],
    });
    expect(screen.getByRole("tab", { name: "Projects" }).textContent).toBe(
      "Projects60",
    );
  });

  it("shows the bounded-page note only when more Projects exist than the displayed page", () => {
    renderGoal({ projects: [project()], projectsNextCursor: null });
    fireEvent.click(screen.getByRole("tab", { name: /Projects/ }));
    expect(
      screen.queryByText(/shows the first bounded page/),
    ).not.toBeInTheDocument();

    renderGoal({ projects: [project()], projectsNextCursor: "next" });
    fireEvent.click(screen.getAllByRole("tab", { name: /Projects/ })[1]!);
    expect(
      screen.getByText(/shows the first bounded page/),
    ).toBeInTheDocument();
  });

  it("triggers Rename and Edit details actions", () => {
    const onRename = vi.fn();
    const onEditDetails = vi.fn();
    renderGoal({ onRename, onEditDetails });
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    expect(onRename).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Edit details" }));
    expect(onEditDetails).toHaveBeenCalled();
  });

  it("triggers Complete then Reopen through the primary action", () => {
    const onToggleComplete = vi.fn();
    const { rerender } = renderGoal({ onToggleComplete });
    fireEvent.click(screen.getByRole("button", { name: "Complete" }));
    expect(onToggleComplete).toHaveBeenCalledWith(true);
    void rerender;
  });

  it("offers Reopen when explicitly completed", () => {
    renderGoal({
      overview: overview({ completedAt: "2026-07-20T00:00:00.000Z" }),
    });
    expect(screen.getByRole("button", { name: "Reopen" })).toBeInTheDocument();
  });

  it("wraps a long title and long definition of done without horizontal overflow markup", () => {
    const longTitle = "A ".repeat(80) + "very long Goal title";
    const longDefinition = "Word ".repeat(400).trim();
    renderGoal({
      overview: overview({ title: longTitle }),
      details: details({ definitionOfDone: longDefinition }),
    });
    expect(
      screen.getByRole("heading", { name: longTitle }),
    ).toBeInTheDocument();
    expect(screen.getByText(longDefinition)).toHaveClass(
      "dh-goal-overview__definition-text",
    );
  });

  it("exposes Activity tab content", () => {
    renderGoal();
    fireEvent.click(screen.getByRole("tab", { name: "Activity" }));
    expect(screen.getByText("activity-content")).toBeInTheDocument();
  });

  it("AREA-03: shows the Alignment panel in the Summary tab with its state and reasons", () => {
    renderGoal({
      alignment: alignment({
        state: "neglected",
        label: "No recent action",
        tone: "info",
        reasons: [
          {
            code: "structure_without_recent_activity",
            tone: "info",
            summary: "Projects exist, but no recent Task activity was found.",
          },
        ],
      }),
    });
    expect(
      screen.getByRole("heading", { name: "Alignment" }),
    ).toBeInTheDocument();
    expect(screen.getByText("No recent action")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Projects exist, but no recent Task activity was found.",
      ),
    ).toBeInTheDocument();
  });

  it("AREA-03: shows real contributing-Task evidence and opens the Task record on click", () => {
    const onOpenTask = vi.fn();
    renderGoal({
      alignment: alignment({ state: "active", tone: "success" }),
      alignmentEvidence: [
        {
          taskId: "t1",
          taskTitle: "Run 5k",
          projectId: "p1",
          projectTitle: "12-week training plan",
          occurredAt: "2026-07-20T00:00:00.000Z",
        },
      ],
      onOpenTask,
    });
    const taskButton = screen.getByRole("button", { name: "Run 5k" });
    fireEvent.click(taskButton);
    expect(onOpenTask).toHaveBeenCalledWith("t1");
  });
});
