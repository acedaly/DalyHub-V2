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

/** A contribution with `completed` of `total` Projects done. */
function contribution(
  completed: number,
  total: number,
): SerializedGoalWithAlignment["contribution"] {
  return {
    total,
    completed,
    incomplete: total - completed,
    active: total - completed,
    planned: 0,
    onHold: 0,
    archived: 0,
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
    // DS-16 — the Area is the card's CONTEXT LINE, as it is on a Project card,
    // not a second link inside a card whose whole surface is already one link.
    // A nested anchor beneath the whole-card overlay is unclickable anyway; the
    // Area is one hop away through the Goal it names.
    expect(within(card).getByText("Health")).toBeInTheDocument();
    expect(within(card).getAllByRole("link")).toHaveLength(1);
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

/**
 * DS-16 — Goals joins the SHARED gallery, and shares it rather than copying it.
 *
 * The most valuable assertion here is the negative one: the markup must be the
 * same `dh-ecard-grid`/`dh-ecard` the Areas and Projects collections render, so
 * a future change to the column rule reaches all three at once.
 */
describe("Goals gallery grid (DS-16)", () => {
  it("renders the shared gallery grid, not a Goals-only layout", () => {
    const { container } = renderCollection([
      goal(),
      goal({ id: "g2", title: "Learn to sail" }),
    ]);
    const grid = container.querySelector(".dh-ecard-grid");
    expect(grid?.tagName).toBe("UL");
    expect(grid?.getAttribute("aria-label")).toBe("Goals");
    expect(grid?.querySelectorAll(":scope > li").length).toBe(2);
    /*
     * UIX-03 — the shared GRID, and the Goal card FAMILY inside it.
     *
     * Goals used to render the generic `.dh-ecard`, which is why the gallery
     * read as a second Projects gallery. They now render `.dh-gcard`, the same
     * kind of move UIX-02 made for Projects (`.dh-pcard`): a family of its own
     * in the one shared grid, not a Goals-only layout and not a lookalike of
     * the generic card.
     */
    expect(container.querySelectorAll(".dh-gcard").length).toBe(2);
    expect(container.querySelectorAll(".dh-ecard").length).toBe(0);
  });

  it("keeps the derived alignment signal on the card, with its reason in words", () => {
    renderCollection([goal({ title: "Run a half-marathon" })]);
    const card = screen.getByRole("article", { name: /Run a half-marathon/ });
    expect(within(card).getByText("Recently active")).toBeInTheDocument();
    expect(
      within(card).getByText("Contributing Task activity was recorded today."),
    ).toBeInTheDocument();
  });

  /*
   * M3X-02 — a Goal card's MEASURE.
   *
   * DalyHub's Goal model carries no numeric target and no unit, so the one thing
   * a Goal genuinely measures is how far the Projects advancing it have got.
   * These tests hold the honest boundary: the measure is drawn when the Goal has
   * contributing Projects, and NOTHING is drawn — no bar, no implied zero — when
   * it has none.
   */
  describe("the Goal's measure", () => {
    it("draws Project contribution as the card's progress", () => {
      renderCollection([
        goal({
          title: "Run a half-marathon",
          contribution: contribution(3, 8),
        }),
      ]);
      const card = screen.getByRole("article", { name: /Run a half-marathon/ });
      const bar = within(card).getByRole("progressbar");
      expect(bar).toHaveAttribute("aria-valuenow", "38");
      expect(bar).toHaveAttribute(
        "aria-valuetext",
        "38% — 3 of 8 Projects complete",
      );
      /*
       * UIX-03 — no bare percentage beside a CONTRIBUTION bar.
       *
       * This bar measures the WORK, and the card has already said "Not
       * measured" where the reading would be. A bare "38%" next to those two
       * words reads as "this Goal is 38% done", which is exactly the claim the
       * note is there to refuse — and at 0% it read as "nothing achieved" about
       * a Goal nobody has told DalyHub how to measure. The fact line names
       * whose percentage it is, and the bar still announces it in full.
       */
      expect(within(card).queryByText("38%")).toBeNull();
      expect(
        within(card).getByText("3 of 8 Projects complete"),
      ).toBeInTheDocument();
    });

    it("draws no bar, and no zero, for a Goal nothing advances", () => {
      renderCollection([goal({ title: "Learn to sail" })]);
      const card = screen.getByRole("article", { name: /Learn to sail/ });
      expect(within(card).queryByRole("progressbar")).not.toBeInTheDocument();
      expect(within(card).queryByText("0%")).not.toBeInTheDocument();
    });

    it("states the alignment REASON only when there is no measure to read", () => {
      renderCollection([
        goal({ title: "Measured", contribution: contribution(1, 2) }),
      ]);
      const measured = screen.getByRole("article", { name: /Measured/ });
      expect(within(measured).getByText("Recently active")).toBeInTheDocument();
      expect(
        within(measured).queryByText(
          "Contributing Task activity was recorded today.",
        ),
      ).not.toBeInTheDocument();
    });

    it("chips only COMPLETION — an open Goal wears no pill saying it is open", () => {
      renderCollection([
        goal({ id: "open", title: "Still going" }),
        goal({
          id: "done",
          title: "Finished",
          completedAt: "2026-07-01T00:00:00.000Z",
        }),
      ]);
      expect(
        within(
          screen.getByRole("article", { name: /Still going/ }),
        ).queryByText("Open"),
      ).toBeNull();
      expect(
        within(screen.getByRole("article", { name: /Finished/ })).getByText(
          "Completed",
        ),
      ).toBeInTheDocument();
    });
  });

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

describe("a measurable Goal's card (GOAL-02)", () => {
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

  it("leads with the Goal's OWN reading rather than its Project contribution", () => {
    renderCollection([
      goal({
        title: "Reach 70 kg",
        progress: measured(),
        contribution: contribution(1, 4),
      }),
    ]);
    const card = screen.getByTestId("goal-card");
    expect(within(card).getByText("79 kg")).toBeInTheDocument();
    /*
     * UIX-03 — the line under the reading is the whole JOURNEY, not the target
     * alone.
     *
     * VIS-01 cut it back to "Target 70 kg" because the pair it replaced
     * ("79 kg → 70 kg") repeated the figure printed directly above it. The
     * journey states the START instead, which is the one fact neither the
     * reading nor the target carries — and the fact that makes "38%" checkable
     * by eye rather than a number to be trusted.
     */
    expect(within(card).getByText("from 85 kg → 70 kg")).toBeInTheDocument();
    expect(card.textContent).not.toContain("79 kg → 70 kg");
    // The contribution bar is REPLACED, not joined: two bars would be two
    // answers to "how far along?".
    expect(within(card).queryByText("1 of 4 Projects complete")).toBeNull();
  });

  it("prints the percentage beside a MEASURED Goal's own bar", () => {
    /*
     * The contrast that makes the contribution rule above a rule rather than an
     * omission: an OUTCOME's percentage is about the outcome the card is
     * showing, so it is stated beside the bar. A contribution percentage is
     * about the work, on a card that has already said "Not measured", so it is
     * not.
     */
    renderCollection([goal({ title: "Reach 70 kg", progress: measured() })]);
    const card = screen.getByRole("article", { name: /Reach 70 kg/ });
    expect(within(card).getByText("40%")).toBeInTheDocument();
  });

  it("announces the same sentence the record's own bar announces", () => {
    renderCollection([goal({ title: "Reach 70 kg", progress: measured() })]);
    const bar = within(screen.getByTestId("goal-card")).getByRole(
      "progressbar",
    );
    expect(bar.getAttribute("aria-valuetext")).toContain(
      "79 kg · 40% complete · 9 kg remaining",
    );
  });

  /*
   * VIS-01 — ONE state signal and ONE fact.
   *
   * A measured Goal's card carried four things in its fact run at once: a
   * status pill, an alignment pill, "9 kg remaining" and "↓ 6 kg overall". The
   * remainder is the value against the target two lines above it, and the
   * alignment is a state of the WORK on a card that is now leading with a state
   * of the OUTCOME. Both went; the status and the total change stayed, because
   * they are the two things the number itself cannot say.
   */
  it("states its measurement status in words, then what remains and by when", () => {
    renderCollection([goal({ title: "Reach 70 kg", progress: measured() })]);
    const card = screen.getByTestId("goal-card");
    const state = within(card).getByTestId("goal-card-state");
    expect(state.textContent).toMatch(/On track|Ahead|In progress/);
    /*
     * UIX-03 — the trailing facts are what a CHOOSER needs: the distance still
     * to cover and the date it is wanted by.
     *
     * They replace "↓ 6 kg overall", which described the past. A gallery card is
     * read to decide which Goal to open, and "how far is left, and by when" is
     * the pair that decides it; how far the owner has already come is the
     * record's story, and the journey line above already implies it.
     */
    expect(state.textContent).toContain("9 kg to go");
    expect(card.textContent).not.toContain("overall");
  });

  it("keeps Project contribution as an UNMEASURED Goal's bar and fact", () => {
    renderCollection([
      goal({ title: "Learn Spanish", contribution: contribution(1, 4) }),
    ]);
    const card = screen.getByTestId("goal-card");
    expect(
      within(card).getByText("1 of 4 Projects complete"),
    ).toBeInTheDocument();
    expect(within(card).getByRole("progressbar")).toBeInTheDocument();
  });

  it("draws no bar at all for a Goal with neither a measurement nor Projects", () => {
    renderCollection([goal({ title: "Learn Spanish" })]);
    const card = screen.getByTestId("goal-card");
    expect(within(card).queryByRole("progressbar")).toBeNull();
  });
});
