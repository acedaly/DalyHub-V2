import { RouterProvider, createMemoryRouter } from "react-router";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FeedbackProvider } from "~/shared/feedback";

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
    colourRank: 0,
    iconKey: null,
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
  return render(
    <FeedbackProvider>
      <RouterProvider router={router} />
    </FeedbackProvider>,
  );
}

describe("Areas collection", () => {
  it("renders real Area cards as canonical links with exact work-state context", () => {
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
    // ONE work-state line built from exact aggregates, not three separate
    // absence messages.
    expect(
      within(card).getByText("1 active Project · 1 open Goal"),
    ).toBeInTheDocument();
    // 4 total tasks, 1 completed -> 3 open. The metric names the count and the
    // noun, so it is never a bare number.
    expect(within(card).getByText("3")).toBeInTheDocument();
    expect(within(card).getByText("open tasks")).toBeInTheDocument();
    expect(screen.getByText("1 Area")).toBeInTheDocument();
  });

  it("drops the Permanent chip that said nothing about any particular Area", () => {
    renderCollection([area()]);
    expect(screen.queryByText("Permanent")).not.toBeInTheDocument();
  });

  it("collapses an Area with nothing in flight to ONE state and a next step", () => {
    renderCollection([
      area({
        activeProjectCount: 0,
        rollup: {
          kind: "area",
          goals: { total: 0, completed: 0, ratio: null },
          projects: { total: 0, completed: 0, ratio: null },
          tasks: { total: 0, completed: 0, ratio: null },
        },
      }),
    ]);
    const card = screen.getByRole("article", { name: "Career" });
    expect(within(card).getByText("No active work")).toBeInTheDocument();
    // The three absence messages the audit found are gone.
    expect(within(card).queryByText(/No goals yet/)).not.toBeInTheDocument();
    expect(within(card).queryByText(/No Projects yet/)).not.toBeInTheDocument();
    expect(within(card).queryByText(/No tasks yet/)).not.toBeInTheDocument();
    expect(
      within(card).getByText("Ready for its first Project"),
    ).toBeInTheDocument();
  });

  it("does not repeat the task count as both summary and metric", () => {
    // An Area holding loose tasks and NO Projects or Goals. The first Gate D
    // capture caught this rendering "1 open task" twice, one line above the
    // other.
    renderCollection([
      area({
        activeProjectCount: 0,
        rollup: {
          kind: "area",
          goals: { total: 0, completed: 0, ratio: null },
          projects: { total: 0, completed: 0, ratio: null },
          tasks: { total: 1, completed: 0, ratio: 0 },
        },
      }),
    ]);
    const card = screen.getByRole("article", { name: "Career" });
    expect(within(card).getAllByText(/open task/)).toHaveLength(1);
    // …and it is NOT described as idle, because it is not.
    expect(within(card).queryByText("No active work")).not.toBeInTheDocument();
  });

  it("renders a chosen icon, and the Area default when there is none", () => {
    const { container } = renderCollection([
      area({ id: "a-icon", title: "Health", iconKey: "shield" }),
      area({ id: "a-plain", title: "Career", iconKey: null }),
    ]);
    // The chosen key reaches the resolver; the Area without one falls back to
    // its entity glyph rather than rendering nothing.
    expect(container.querySelector('[data-icon-key="shield"]')).not.toBeNull();
    expect(
      container.querySelectorAll('.dh-accent-icon [data-entity="area"]').length,
    ).toBeGreaterThan(0);
  });

  it("gives every Area card its Area's own accent, not a shared one", () => {
    const { container } = renderCollection([
      area({ id: "a1", title: "Health", colourRank: 0 }),
      area({ id: "a2", title: "Career", colourRank: 1 }),
    ]);
    const accents = Array.from(
      container.querySelectorAll(".dh-accent-icon"),
    ).map((node) => node.getAttribute("data-accent"));
    expect(accents).toEqual(["1", "2"]);
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
    expect(screen.getByText("We couldn’t load your Areas")).toBeInTheDocument();
    expect(
      screen.getByText("We couldn’t load your Areas."),
    ).toBeInTheDocument();
  });

  it("says loaded count, not total, when another page exists", () => {
    renderCollection([area()], { nextCursor: "cursor-next" });
    expect(screen.getByText("1 Area loaded")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Load more Areas" }),
    ).toBeInTheDocument();
  });
});
