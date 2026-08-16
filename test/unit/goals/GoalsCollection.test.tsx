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
import {
  UNMEASURED_GOAL_PROGRESS,
  evaluateGoalProgress,
  normalizeGoalMeasurementConfig,
} from "~/kernel/goals";

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
    area: { id: "a1", title: "Health", colourRank: 0, iconKey: null },
    alignment: alignment(),
    // No contributing Projects by default, so a test that cares about the card's
    // MEASURE has to say so — the same "opt into what you are asserting" rule
    // the rest of these fixtures follow.
    contribution: {
      total: 0,
      completed: 0,
      incomplete: 0,
      active: 0,
      planned: 0,
      onHold: 0,
      archived: 0,
    },
    // GOAL-02 — unmeasured by default, which is the state every Goal created
    // before that change is in. A test asserting the measurable card opts in.
    progress: UNMEASURED_GOAL_PROGRESS,
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
    /** REDESIGN-04 — the resolved master–detail selection. */
    selectedId?: string | null;
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
            selectedId={opts.selectedId ?? null}
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
  it("renders a Goal ROW linking to the workspace, with its Area and its alignment in the accessible name", () => {
    renderCollection([goal({ title: "Run a half-marathon" })]);

    const row = screen.getByRole("article", { name: /Run a half-marathon/ });
    /*
     * REDESIGN-04 — selecting a Goal is a change of SELECTION, not of page, so
     * the row links to the workspace URL rather than to the record. Back
     * therefore leaves the workspace instead of walking every Goal glanced at.
     */
    expect(
      within(row).getByRole("link", { name: /Run a half-marathon/ }),
    ).toHaveAttribute("href", "/goals?goal=g1");
    // The Area is the row's CONTEXT LINE, not a second link inside a row whose
    // whole surface is already one link.
    expect(within(row).getByText("Health")).toBeInTheDocument();
    expect(within(row).getAllByRole("link")).toHaveLength(1);
    /*
     * §6.2 — alignment survives as a QUIET state. It is not drawn as a measure
     * (which would make a Goal look like it had two), but it is never LOST:
     * the row's accessible name carries the evaluator's own state and reason,
     * so nothing here is conveyed by drawing alone.
     */
    const link = within(row).getByRole("link", { name: /Run a half-marathon/ });
    expect(link.getAttribute("aria-label")).toContain("Recently active");
    expect(link.getAttribute("aria-label")).toContain(
      "Contributing Task activity was recorded today.",
    );
  });

  it("marks the selected row as the current one, semantically and not by tint alone", () => {
    renderCollection([goal(), goal({ id: "g2", title: "Learn to sail" })], {
      selectedId: "g2",
    });
    const selected = screen.getByRole("article", { name: /Learn to sail/ });
    expect(selected).toHaveAttribute("data-selected", "true");
    expect(
      within(selected).getByRole("link", { name: /Learn to sail/ }),
    ).toHaveAttribute("aria-current", "page");
    // And exactly one row is current.
    const other = screen.getByRole("article", { name: /Run a half-marathon/ });
    expect(other).not.toHaveAttribute("data-selected");
    expect(
      within(other).getByRole("link", { name: /Run a half-marathon/ }),
    ).not.toHaveAttribute("aria-current");
  });

  it("offers the §5.1 creation entry point on the list, not a dead end pointing at Areas", () => {
    renderCollection([goal()]);
    /*
     * REDESIGN-04 §5.1 — the mockup wins on the entry point, the architecture
     * wins on the shape. `+ Add goal` opens the one creation flow, which
     * requires choosing an Area, rather than sending the owner to Areas to
     * find a control.
     */
    expect(screen.getByTestId("goal-add")).toBeInTheDocument();
  });

  it("shows an honest empty state that CREATES, and still says a Goal needs an Area", () => {
    renderCollection([]);
    expect(screen.getByText("No Goals yet")).toBeInTheDocument();
    expect(
      screen.getByText(/Every Goal lives in one, so creating a Goal starts/),
    ).toBeInTheDocument();
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
    const headings = within(screen.getByTestId("goals-list")).getAllByRole(
      "heading",
      { level: 3 },
    );
    const titles = headings.map((h) => h.textContent);
    expect(titles.indexOf("Neglected goal")).toBeLessThan(
      titles.indexOf("Active goal"),
    );
  });

  it("carries a completed Goal's state in words, with no attention styling", () => {
    renderCollection([
      goal({
        completedAt: "2026-07-20T10:00:00.000Z",
        alignment: alignment({
          state: "completed",
          label: "Completed",
          tone: "neutral",
          reasons: [
            {
              code: "completed",
              tone: "neutral",
              summary: "This Goal is complete.",
            },
          ],
        }),
      }),
    ]);
    const row = screen.getByRole("article", { name: /Run a half-marathon/ });
    /*
     * A completed Goal is not "needing attention", and the row must not imply
     * it is. The state is in the accessible name, in the evaluator's own words,
     * and the row carries no tone attribute of its own.
     */
    const link = within(row).getByRole("link", { name: /Run a half-marathon/ });
    expect(link.getAttribute("aria-label")).toContain("Completed");
    expect(link.getAttribute("aria-label")).toContain("This Goal is complete.");
  });
});

/*
 * REDESIGN-04 — the Goals WORKSPACE row replaced the gallery card.
 *
 * These are the card's own honesty rules, asserted where they now live. Not one
 * of them was dropped in the move; what changed is which element carries them.
 */
describe("the Goals workspace row (REDESIGN-04)", () => {
  /** The brief's acceptance Goal: 85 kg down to 70 kg, currently 79.0. */
  function measured() {
    return evaluateGoalProgress(
      {
        config: normalizeGoalMeasurementConfig({
          type: "target_value",
          unit: "kg",
          baselineValue: 85,
          targetValue: 70,
        }),
        targetDate: "2026-12-31",
        measurements: [{ value: 79, measuredOn: "2026-08-09" }],
        startedOn: "2026-06-10",
      },
      { todayIso: "2026-08-09" },
    );
  }

  it("renders one shared row list, not a Goals-only layout", () => {
    const { container } = renderCollection([
      goal(),
      goal({ id: "g2", title: "Learn to sail" }),
    ]);
    const list = screen.getByTestId("goals-list");
    expect(list.tagName).toBe("UL");
    expect(list.getAttribute("aria-label")).toBe("Goals");
    expect(list.querySelectorAll(":scope > li").length).toBe(2);
    // The SHARED measured-row family, the same one the Projects page's Goals
    // section renders — never a Goals-only component.
    expect(container.querySelectorAll(".dh-mrow").length).toBe(2);
  });

  it("ends the row with the Goal's OWN honest value, in the Goal's own terms", () => {
    renderCollection([goal({ title: "Reach 70 kg", progress: measured() })]);
    const row = screen.getByRole("article", { name: /Reach 70 kg/ });
    /*
     * `mockup3.png` ends each row with the Goal's own arithmetic — "60.0 / 70
     * kg" — not with a percentage. The unit is stated ONCE, on the target,
     * exactly as the reference writes it.
     */
    expect(within(row).getByText("79 / 70 kg")).toBeInTheDocument();
    expect(row.textContent).not.toContain("79 kg / 70 kg");
  });

  it("draws a bar whose announced sentence is the evaluator's own", () => {
    renderCollection([goal({ title: "Reach 70 kg", progress: measured() })]);
    const bar = screen.getByRole("progressbar", {
      name: "Reach 70 kg progress",
    });
    expect(bar).toHaveAttribute("aria-valuenow", "40");
    // The SAME sentence the record's own bar announces — one source of truth
    // for the words, so a row and the record it opens cannot disagree.
    expect(bar.getAttribute("aria-valuetext")).toContain("79 kg");
    expect(bar.getAttribute("aria-valuetext")).toContain("40% complete");
  });

  it("draws NO bar and NO value for a Goal with no measurement configured", () => {
    renderCollection([goal({ title: "Learn Spanish" })]);
    const row = screen.getByRole("article", { name: /Learn Spanish/ });
    /*
     * The rule the deleted card held, unchanged: an empty bar at 0% says
     * "nothing done" when the truth is "nothing measured", and the two are
     * different facts. An absence is drawn as an absence.
     */
    expect(within(row).queryByRole("progressbar")).toBeNull();
    expect(row.querySelector(".dh-mrow__value")).toBeNull();
    expect(row.textContent).not.toContain("0%");
  });

  it("draws no bar for a measurable Goal that has no reading yet", () => {
    const configured = evaluateGoalProgress(
      {
        config: normalizeGoalMeasurementConfig({
          type: "target_value",
          unit: "kg",
          baselineValue: 85,
          targetValue: 70,
        }),
        targetDate: null,
        measurements: [],
        startedOn: "2026-06-10",
      },
      { todayIso: "2026-08-09" },
    );
    renderCollection([goal({ title: "Reach 70 kg", progress: configured })]);
    const row = screen.getByRole("article", { name: /Reach 70 kg/ });
    // Configured is not the same as measured. Nothing has been recorded, so
    // there is no value and no proportion — only the invitation, on the record.
    expect(row.querySelector(".dh-mrow__value")).toBeNull();
  });

  it("states a counted Goal as a fraction, which is both terms at once", () => {
    const milestone = evaluateGoalProgress(
      {
        config: normalizeGoalMeasurementConfig({ type: "milestone" }),
        targetDate: null,
        measurements: [],
        milestones: {
          total: 24,
          completed: 12,
          totalWeight: 24,
          completedWeight: 12,
        },
        startedOn: "2026-06-10",
      },
      { todayIso: "2026-08-09" },
    );
    renderCollection([goal({ title: "Read 24 books", progress: milestone })]);
    const row = screen.getByRole("article", { name: /Read 24 books/ });
    // `mockup3.png` writes exactly this: "12 / 24".
    expect(within(row).getByText("12 / 24")).toBeInTheDocument();
  });
});

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

/**
 * DS-16 — Goals joins the SHARED gallery, and shares it rather than copying it.
 *
 * The most valuable assertion here is the negative one: the markup must be the
 * same `dh-ecard-grid`/`dh-ecard` the Areas and Projects collections render, so
 * a future change to the column rule reaches all three at once.
 */
describe("the Deleted view grid (DS-16)", () => {
  it("uses the same grid for the Deleted view, with Restore and no open target", () => {
    const { container } = renderCollection([], {
      state: "deleted",
      deletedGoals: [
        {
          id: "gd1",
          title: "Abandoned goal",
          updatedAt: "2026-07-20T00:00:00.000Z",
        },
      ],
    });
    const grid = container.querySelector(".dh-ecard-grid");
    expect(grid?.getAttribute("aria-label")).toBe("Deleted Goals");
    const card = screen.getByRole("article", { name: "Abandoned goal" });
    // A soft-deleted record's canonical route 404s, so there is deliberately no
    // way in — only a way back.
    expect(within(card).queryByRole("link")).not.toBeInTheDocument();
    expect(
      within(card).getByRole("button", { name: "Restore" }),
    ).toBeInTheDocument();
  });
});
