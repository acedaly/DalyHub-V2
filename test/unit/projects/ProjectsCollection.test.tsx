import { RouterProvider, createMemoryRouter } from "react-router";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProjectsCollectionView } from "~/modules/projects/ProjectsCollection";
import type { SerializedProjectListItem } from "~/modules/projects/project-view";

/**
 * PROJ-01 — the Projects collection as behaviour: cards render with Area/Goal and
 * roll-up progress, the state segment is present, and the empty vs filtered-empty
 * states are calm and distinct.
 */

type LoaderData = {
  projects: readonly SerializedProjectListItem[];
  parentOptions: readonly { value: string; label: string }[];
  state: "open" | "completed" | "all";
  failed: boolean;
};

function project(
  over: Partial<SerializedProjectListItem> = {},
): SerializedProjectListItem {
  return {
    id: "p1",
    title: "DalyHub V2",
    createdAt: "2026-07-18T09:00:00.000Z",
    updatedAt: "2026-07-20T10:00:00.000Z",
    completedAt: null,
    area: { kind: "area", id: "a1", title: "Career" },
    goal: null,
    taskTotal: 4,
    taskCompleted: 1,
    ...over,
  };
}

function renderCollection(data: LoaderData) {
  const router = createMemoryRouter(
    [
      {
        path: "/projects",
        element: (
          <ProjectsCollectionView
            projects={data.projects}
            parentOptions={data.parentOptions as never}
            state={data.state}
            failed={data.failed}
          />
        ),
      },
    ],
    { initialEntries: ["/projects"] },
  );
  return render(<RouterProvider router={router} />);
}

describe("Projects collection", () => {
  it("renders project cards with Area context and roll-up progress", () => {
    renderCollection({
      projects: [
        project(),
        project({
          id: "p2",
          title: "Half-marathon plan",
          goal: { kind: "goal", id: "g1", title: "Run a half" },
          taskTotal: 0,
          taskCompleted: 0,
        }),
      ],
      parentOptions: [],
      state: "all",
      failed: false,
    });

    expect(screen.getByText("DalyHub V2")).toBeInTheDocument();
    expect(screen.getAllByText("Career").length).toBeGreaterThan(0);
    // The empty project shows "No tasks yet" rather than a 0% bar.
    expect(screen.getByText("No tasks yet")).toBeInTheDocument();
    // The subtitle reflects the count.
    expect(screen.getByText("2 projects")).toBeInTheDocument();
    // The state segment and the New project affordance are present.
    expect(
      screen.getByRole("group", { name: "Filter projects by state" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("New project").length).toBeGreaterThan(0);
  });

  it("shows a genuinely-empty state when there are no projects at all", () => {
    renderCollection({
      projects: [],
      parentOptions: [],
      state: "all",
      failed: false,
    });
    expect(screen.getByText("No projects yet")).toBeInTheDocument();
  });

  it("distinguishes a filtered-empty state from genuinely empty", () => {
    renderCollection({
      projects: [],
      parentOptions: [],
      state: "open",
      failed: false,
    });
    expect(screen.getByText("No open projects")).toBeInTheDocument();
  });

  it("opens a project via a real link (accessible, not a div onClick)", () => {
    renderCollection({
      projects: [project()],
      parentOptions: [],
      state: "all",
      failed: false,
    });
    const link = screen.getByRole("link", { name: "Open DalyHub V2" });
    expect(link).toHaveAttribute("href", "/projects/p1");
  });
});
