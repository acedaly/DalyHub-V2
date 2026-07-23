import { RouterProvider, createMemoryRouter } from "react-router";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AreasCollectionView } from "~/modules/areas/AreasCollection";
import type { SerializedAreaListItem } from "~/modules/areas/area-view";

function area(
  over: Partial<SerializedAreaListItem> = {},
): SerializedAreaListItem {
  return {
    id: "a1",
    title: "Career",
    createdAt: "2026-07-18T09:00:00.000Z",
    updatedAt: "2026-07-20T10:00:00.000Z",
    activeProjectCount: 1,
    completedProjectCount: 0,
    rollup: {
      kind: "area",
      goals: { total: 1, completed: 0, ratio: 0 },
      projects: { total: 2, completed: 1, ratio: 0.5 },
      tasks: { total: 4, completed: 1, ratio: 0.25 },
    },
    ...over,
  };
}

function renderCollection(
  areas: readonly SerializedAreaListItem[],
  opts: { nextCursor?: string | null; failed?: boolean } = {},
) {
  const router = createMemoryRouter(
    [
      {
        path: "/areas",
        element: (
          <AreasCollectionView
            areas={areas}
            nextCursor={opts.nextCursor ?? null}
            failed={opts.failed ?? false}
          />
        ),
      },
    ],
    { initialEntries: ["/areas"] },
  );
  return render(<RouterProvider router={router} />);
}

describe("Areas collection", () => {
  it("renders real Area cards as canonical links with roll-up context", () => {
    renderCollection([
      area({
        title:
          "A very long Area title that should wrap safely without resizing the layout",
      }),
    ]);

    const card = screen.getByRole("article", {
      name: /A very long Area title/,
    });
    expect(
      within(card).getByRole("link", { name: /Open A very long Area title/ }),
    ).toHaveAttribute("href", "/areas/a1");
    expect(within(card).getAllByText("Permanent").length).toBeGreaterThan(0);
    expect(
      within(card).getByText("Task roll-up: 1 of 4 tasks"),
    ).toBeInTheDocument();
    expect(screen.getByText("1 Area")).toBeInTheDocument();
  });

  it("shows an empty state with a real New Area action", () => {
    renderCollection([]);
    expect(screen.getByText("No Areas yet")).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "New Area" }).length,
    ).toBeGreaterThan(0);
  });

  it("shows retryable failure state without fabricated totals", () => {
    renderCollection([], { failed: true });
    expect(screen.getByText("We couldn't load your Areas")).toBeInTheDocument();
    expect(
      screen.getByText("We couldn't load your Areas."),
    ).toBeInTheDocument();
  });

  it("says loaded count, not total, when another page exists", () => {
    renderCollection([area()], { nextCursor: "cursor-next" });
    expect(screen.getByText("1 Areas loaded")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Load more Areas" }),
    ).toBeInTheDocument();
  });
});
