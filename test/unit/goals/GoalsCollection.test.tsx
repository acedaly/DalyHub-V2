import { RouterProvider, createMemoryRouter } from "react-router";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  GoalsCollectionView,
  type SerializedGoalWithAlignment,
} from "~/modules/goals/GoalsCollection";
import type { GoalAlignment } from "~/kernel/alignment";

/**
 * AREA-03 — the `/goals` Alignment collection component (ADR-040). Verifies
 * accessible headings/labels, direct navigation links, the honest empty
 * state, that alignment reasons render as visible text (never colour alone),
 * and that the collection sorts neglected Goals to the front.
 */

function alignment(overrides: Partial<GoalAlignment> = {}): GoalAlignment {
  return {
    state: "active",
    label: "Recently active",
    tone: "success",
    reasons: [
      {
        code: "last_contribution",
        tone: "success",
        summary: "Contributing Task activity was recorded today.",
      },
    ],
    evaluatedAtIso: "2026-07-24T00:00:00.000Z",
    ...overrides,
  };
}

function goal(
  over: Partial<SerializedGoalWithAlignment> = {},
): SerializedGoalWithAlignment {
  return {
    id: "g1",
    title: "Run a half-marathon",
    createdAt: "2026-07-01T09:00:00.000Z",
    updatedAt: "2026-07-20T10:00:00.000Z",
    completedAt: null,
    area: { id: "a1", title: "Health" },
    alignment: alignment(),
    ...over,
  };
}

function renderCollection(
  goals: readonly SerializedGoalWithAlignment[],
  opts: { nextCursor?: string | null; failed?: boolean } = {},
) {
  const router = createMemoryRouter(
    [
      {
        path: "/goals",
        element: (
          <GoalsCollectionView
            goals={goals}
            nextCursor={opts.nextCursor ?? null}
            failed={opts.failed ?? false}
          />
        ),
      },
    ],
    { initialEntries: ["/goals"] },
  );
  return render(<RouterProvider router={router} />);
}

describe("Goals collection (the Alignment view)", () => {
  it("renders a Goal card as a canonical link with its alignment state and Area context", () => {
    renderCollection([goal({ title: "Run a half-marathon" })]);

    const card = screen.getByRole("article", { name: /Run a half-marathon/ });
    expect(
      within(card).getByRole("link", {
        name: /Open Run a half-marathon/,
      }),
    ).toHaveAttribute("href", "/goals/g1");
    expect(within(card).getByRole("link", { name: "Health" })).toHaveAttribute(
      "href",
      "/areas/a1",
    );
    expect(within(card).getByText("Recently active")).toBeInTheDocument();
    // Meaning is never colour-alone: the reason text is visible too.
    expect(
      within(card).getByText("Contributing Task activity was recorded today."),
    ).toBeInTheDocument();
  });

  it("shows an honest empty state pointing to Areas (Goal creation is Area-owned)", () => {
    renderCollection([]);
    expect(screen.getByText("No Goals yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse Areas" })).toHaveAttribute(
      "href",
      "/areas",
    );
  });

  it("shows a retryable failure state without fabricated totals", () => {
    renderCollection([], { failed: true });
    expect(screen.getByText("We couldn't load your Goals")).toBeInTheDocument();
  });

  it("says loaded count, not total, when another page exists", () => {
    renderCollection([goal()], { nextCursor: "cursor-next" });
    expect(screen.getByText("1 Goals loaded")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Load more Goals" }),
    ).toBeInTheDocument();
  });

  it("shows a calm, honest recap sentence — plain counts, never a percentage", () => {
    renderCollection([
      goal({ id: "g1", alignment: alignment({ state: "active" }) }),
      goal({ id: "g2", alignment: alignment({ state: "neglected" }) }),
    ]);
    const status = screen.getByRole("status");
    expect(status.textContent).toMatch(/1 of 2 open Goals/);
    expect(status.textContent).not.toMatch(/%/);
  });

  it("shows a calm all-attended sentence when nothing is neglected", () => {
    renderCollection([
      goal({ id: "g1", alignment: alignment({ state: "active" }) }),
    ]);
    expect(
      screen.getByText("This Goal has had recent action."),
    ).toBeInTheDocument();
  });

  it("sorts neglected Goals before active Goals for at-a-glance scanning", () => {
    renderCollection([
      goal({
        id: "g-active",
        title: "Active goal",
        createdAt: "2026-07-01T00:00:00.000Z",
        alignment: alignment({ state: "active" }),
      }),
      goal({
        id: "g-neglected",
        title: "Neglected goal",
        createdAt: "2026-07-02T00:00:00.000Z",
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
      }),
    ]);
    const headings = screen.getAllByRole("heading", { level: 2 });
    const titles = headings.map((h) => h.textContent);
    expect(titles.indexOf("Neglected goal")).toBeLessThan(
      titles.indexOf("Active goal"),
    );
  });

  it("renders a completed Goal with a calm Completed status, no attention styling", () => {
    renderCollection([
      goal({
        alignment: alignment({
          state: "completed",
          label: "Completed",
          tone: "neutral",
          reasons: [
            {
              code: "completed",
              tone: "neutral",
              summary: "This Goal is already completed.",
            },
          ],
        }),
      }),
    ]);
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });
});
