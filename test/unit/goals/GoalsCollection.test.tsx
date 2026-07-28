import { RouterProvider, createMemoryRouter } from "react-router";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FeedbackProvider } from "~/shared/feedback";

import {
  GoalsCollectionView,
  type SerializedDeletedGoalItem,
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
  opts: {
    nextCursor?: string | null;
    failed?: boolean;
    deletedGoals?: readonly SerializedDeletedGoalItem[];
    state?: "active" | "deleted";
  } = {},
) {
  const state = opts.state ?? "active";
  const router = createMemoryRouter(
    [
      {
        path: "/goals",
        element: (
          <GoalsCollectionView
            goals={goals}
            deletedGoals={opts.deletedGoals ?? []}
            nextCursor={opts.nextCursor ?? null}
            state={state}
            failed={opts.failed ?? false}
          />
        ),
      },
    ],
    {
      initialEntries: [state === "deleted" ? "/goals?state=deleted" : "/goals"],
    },
  );
  return render(
    <FeedbackProvider>
      <RouterProvider router={router} />
    </FeedbackProvider>,
  );
}

function deletedGoal(id: string, title: string): SerializedDeletedGoalItem {
  return { id, title, updatedAt: "2026-07-20T10:00:00.000Z" };
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
    expect(screen.getByText("We couldn’t load your Goals")).toBeInTheDocument();
  });

  it("says loaded count, not total, when another page exists (correctly pluralised)", () => {
    renderCollection([goal()], { nextCursor: "cursor-next" });
    expect(screen.getByText("1 Goal loaded")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Load more Goals" }),
    ).toBeInTheDocument();
  });

  it("pluralises the loaded count for more than one Goal", () => {
    renderCollection([goal({ id: "g1" }), goal({ id: "g2" })], {
      nextCursor: "cursor-next",
    });
    expect(screen.getByText("2 Goals loaded")).toBeInTheDocument();
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

  it("never claims recent action for a no_structure-only collection (regression: absence of `neglected` is not `active`)", () => {
    renderCollection([
      goal({
        id: "g1",
        alignment: alignment({
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
        }),
      }),
    ]);
    expect(
      screen.getByText("This Goal has not had recent action yet."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("This Goal has had recent action."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/every open goal has had recent action/i),
    ).not.toBeInTheDocument();
  });

  it("never claims recent action for an unreachable-only collection", () => {
    renderCollection([
      goal({
        id: "g1",
        alignment: alignment({
          state: "unreachable",
          label: "Structure archived",
          tone: "neutral",
          reasons: [
            {
              code: "unreachable_archived",
              tone: "neutral",
              summary: "The one Project linked to this Goal is archived.",
              count: 1,
            },
          ],
        }),
      }),
    ]);
    expect(
      screen.getByText("This Goal has not had recent action yet."),
    ).toBeInTheDocument();
  });

  it("reports the true active fraction for a mixed active + no_structure collection", () => {
    renderCollection([
      goal({
        id: "g1",
        alignment: alignment({ state: "active" }),
      }),
      goal({
        id: "g2",
        alignment: alignment({
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
        }),
      }),
    ]);
    const status = screen.getByRole("status");
    expect(status.textContent).toMatch(/1 of 2 open Goals/);
    expect(status.textContent).not.toMatch(/every open goal/i);
  });

  it("renders the authoritative server (workspace-wide alignment) order without re-sorting (DEBT-23)", () => {
    // The repository now establishes the alignment order workspace-wide BEFORE
    // pagination (neglected → active → …), so the collection must render the
    // server-provided order verbatim — it must NOT re-impose a merely per-page
    // client sort. Here the loader already supplies neglected-before-active; the
    // collection preserves it.
    renderCollection([
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
      goal({
        id: "g-active",
        title: "Active goal",
        createdAt: "2026-07-01T00:00:00.000Z",
        alignment: alignment({ state: "active" }),
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

/**
 * PX-04 — the Deleted Goals view is the DURABLE path back from a reversible
 * removal, so it must not become a dead end of its own.
 */
describe("Goals collection — the Deleted view", () => {
  it("lists deleted Goals with a one-click Restore and no open target", () => {
    renderCollection([], {
      state: "deleted",
      deletedGoals: [deletedGoal("g-old", "Old goal")],
    });
    expect(screen.getByText("Old goal")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument();
    // A deleted record's canonical route 404s, so it is never a link.
    expect(
      screen.queryByRole("link", { name: /Old goal/ }),
    ).not.toBeInTheDocument();
  });

  it("offers Load more when more deleted Goals exist beyond the first page", () => {
    // Regression: the Deleted branch returned before the pagination control, so
    // in a workspace with more deleted Goals than one page, everything past the
    // first was unreachable — and therefore unrestorable.
    renderCollection([], {
      state: "deleted",
      deletedGoals: [deletedGoal("g-old", "Old goal")],
      nextCursor: "cursor-next",
    });
    expect(
      screen.getByRole("button", { name: "Load more deleted Goals" }),
    ).toBeInTheDocument();
    expect(screen.getByText("1 deleted Goals loaded")).toBeInTheDocument();
  });

  it("starts a new scope from its own first page, carrying nothing over", () => {
    // Half of the stale-page guard, at the level this test can reach: changing
    // the pagination scope resets the accumulated list. The other half — refusing
    // a page the fetcher REVALIDATED after a navigation, which arrives with a new
    // identity just as the reset clears the de-dupe ref — is guarded by
    // construction in `useDeletedGoalPagination` (only data requested since the
    // last reset is consumed) and is not reachable from a component test without
    // simulating React Router's fetcher revalidation.
    const first = renderCollection([], {
      state: "deleted",
      deletedGoals: [deletedGoal("g-1", "Page one goal")],
      nextCursor: "cursor-2",
    });
    expect(screen.getByText("Page one goal")).toBeInTheDocument();
    first.unmount();

    renderCollection([], {
      state: "deleted",
      deletedGoals: [deletedGoal("g-9", "A different page one")],
      nextCursor: null,
    });
    expect(screen.getByText("A different page one")).toBeInTheDocument();
    expect(screen.queryByText("Page one goal")).not.toBeInTheDocument();
  });

  it("shows the filtered-empty state only when there is genuinely nothing more", () => {
    renderCollection([], { state: "deleted", deletedGoals: [] });
    expect(screen.getByText("No deleted Goals")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Load more deleted Goals" }),
    ).not.toBeInTheDocument();
  });
});
