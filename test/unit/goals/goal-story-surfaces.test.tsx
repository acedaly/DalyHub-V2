/**
 * STEER-03 / STEER-04 — the SHARED Goal story and the next-action row, as the
 * surfaces that consume them actually render them.
 *
 * The kernel tests prove the VALUES three loaders produce are equal. These
 * prove the shared components turn those values into the right thing on screen
 * — including the absences, which are the half a screenshot never checks:
 *
 *   - an unmeasured Goal draws NO bar and gets NO percentage;
 *   - a set-aside Goal states the owner's judgement and keeps every derived
 *     fact untouched;
 *   - movement and alignment stay two separate signals, allowed to disagree;
 *   - a next action opens the CANONICAL Task and mutates nothing;
 *   - no eligible next action renders less, or says so, per the surface.
 */

import { RouterProvider, createMemoryRouter } from "react-router";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ReactElement } from "react";

import { UNMEASURED_GOAL_PROGRESS } from "~/kernel/goals";
import { goalContributionAcrossReviewsLine } from "~/kernel/review-insights";
import { NO_NEXT_ACTION_TEXT } from "~/kernel/tasks";
import { DrawerProvider } from "~/shared/drawer";
import {
  GoalStoryRow,
  goalStoryFacts,
  type GoalStory,
} from "~/shared/goal-progress";
import { NextActionLine } from "~/shared/task-record/NextActionLine";
import { AlignmentStep } from "~/modules/reviews/guided/ReviewGuideSteps";
import type { ReviewAlignmentContext } from "~/modules/reviews/guided/review-guide-context";

function renderIn(node: ReactElement) {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: (
          <DrawerProvider renderDrawer={() => null}>{node}</DrawerProvider>
        ),
      },
    ],
    { initialEntries: ["/"] },
  );
  return render(<RouterProvider router={router} />);
}

const measuredProgress = {
  ...UNMEASURED_GOAL_PROGRESS,
  measured: true,
  type: "target_value" as const,
  unit: "kg",
  direction: "decrease" as const,
  baseline: 85,
  current: 79,
  target: 70,
  targetDate: "2026-12-31",
  progressFraction: 0.4,
  progressPercent: 40,
  remaining: 9,
  totalChange: -6,
  status: "on_track" as const,
  measurementCount: 2,
};

const alignment = {
  state: "aligned",
  label: "Recent action",
  tone: "success",
  reasons: [
    {
      code: "recent_task_activity",
      tone: "success",
      summary: "Contributing Task activity was recorded today.",
    },
  ],
} as unknown as GoalStory["alignment"];

const movement = {
  goalId: "g1",
  window: {
    periodStart: "2026-07-27",
    periodEnd: "2026-08-02",
    startInstantIso: "2026-07-26T14:00:00.000Z",
    endInstantIso: "2026-08-02T13:59:59.999Z",
  },
  phase: "current",
  available: true,
  key: "moved",
  moved: true,
  contributingProjectCount: 1,
  movedProjectCount: 1,
  eventCount: 2,
  directMeasurementMovement: false,
  latestMovementDay: "2026-08-01",
  evidence: [{ kind: "task_completed", count: 2 }],
  completedInWindow: false,
} as unknown as GoalStory["movement"];

function story(over: Partial<GoalStory> = {}): GoalStory {
  return {
    id: "g1",
    title: "Reach 70 kg",
    progress: measuredProgress,
    alignment,
    movement,
    condition: null,
    targetDate: "2026-12-31",
    contribution: { total: 2, completed: 1, active: 1 },
    contributionAcrossReviews: null,
    ...over,
  };
}

const identity = {
  colourSlot: null,
  iconKey: null,
  colourRank: null,
  inherited: { colourSlot: null, colourRank: 2, iconKey: null },
};

describe("the shared Goal-story row", () => {
  it("draws the Goal's own measurement, and stamps the facts a parity test reads", () => {
    renderIn(
      <GoalStoryRow
        story={story()}
        identity={identity}
        href="/goals/g1"
        data-testid="row"
        showAlignment
        notes={["1 of 2 Projects complete"]}
      />,
    );
    const meter = screen.getByRole("progressbar", {
      name: "Reach 70 kg progress",
    });
    expect(meter).toHaveAttribute("aria-valuenow", "40");
    expect(screen.getByText("79 / 70 kg")).toBeInTheDocument();
    expect(screen.getByText(/1 of 2 Projects complete/)).toBeInTheDocument();

    // The machine facts, from the ONE projection, on the row itself.
    const wrapper = document.querySelector('[data-goal-story="g1"]')!;
    const facts = goalStoryFacts(story());
    expect(wrapper.getAttribute("data-goal-measurement-status")).toBe(
      facts.measurementStatus,
    );
    expect(wrapper.getAttribute("data-goal-progress-percent")).toBe("40");
    expect(wrapper.getAttribute("data-goal-condition")).toBe("pursuing");
    expect(wrapper.getAttribute("data-goal-movement-moved")).toBe("true");
  });

  it("projects the across-Reviews contribution as its state AND its window", () => {
    // V2.9 INS-02 — a surface can never show the classification without the
    // number of Reviews it was read over, because both are facts of the story.
    const withSeries = story({
      contributionAcrossReviews: {
        goalId: "g1",
        title: "Reach 70 kg",
        state: "moving",
        count: 5,
        of: 6,
        everyReview: false,
        reviews: 6,
        sinceIso: "2026-08-03",
        states: ["moving", "moving", "limited", "moving", "moving", "moving"],
      },
    });
    const facts = goalStoryFacts(withSeries);
    expect(facts.contributionAcrossReviews).toBe("moving");
    expect(facts.contributionAcrossReviewsOf).toBe(6);
    expect(facts.contributionAcrossReviewsWindow).toBe(6);

    // A surface that did not ask projects null for both — the same meaning
    // `alignment` and `movement` already carry, never "there is none".
    const notAsked = goalStoryFacts(story());
    expect(notAsked.contributionAcrossReviews).toBeNull();
    expect(notAsked.contributionAcrossReviewsOf).toBeNull();
    expect(notAsked.contributionAcrossReviewsWindow).toBeNull();
  });

  it("says the classification and the window in ONE set of words, from the kernel", () => {
    expect(
      goalContributionAcrossReviewsLine({
        goalId: "g1",
        title: "Reach 70 kg",
        state: "moving",
        count: 5,
        of: 6,
        everyReview: false,
        reviews: 6,
        sinceIso: "2026-08-03",
        states: [],
      }),
    ).toBe("Moving at 5 of your last 6 Reviews");
    // A Goal some Reviews in the series did not record (created mid-series,
    // or past the snapshot's Goal bound) names the Reviews that recorded it
    // AND the series they sit in — never "your last 3" for a series of 6.
    expect(
      goalContributionAcrossReviewsLine({
        goalId: "g1",
        title: "Reach 70 kg",
        state: "limited",
        count: 2,
        of: 3,
        reviews: 6,
        sinceIso: "2026-08-24",
        everyReview: false,
        states: [],
      }),
    ).toBe(
      "Limited movement at 2 of the 3 Reviews that recorded it, of your last 6",
    );
    expect(
      goalContributionAcrossReviewsLine({
        goalId: "g1",
        title: "Reach 70 kg",
        state: "no_structure",
        count: 4,
        of: 4,
        everyReview: true,
        reviews: 4,
        sinceIso: "2026-08-03",
        states: [],
      }),
    ).toBe("No contribution path at every one of your last 4 Reviews");
  });

  it("gives an unmeasured Goal no bar and no percentage", () => {
    renderIn(
      <GoalStoryRow
        story={story({ progress: UNMEASURED_GOAL_PROGRESS })}
        identity={identity}
        href="/goals/g1"
      />,
    );
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.getByText(/No measurement/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("0%");
  });

  it("states the owner's condition without changing a derived word", () => {
    const { unmount } = renderIn(
      <GoalStoryRow story={story()} identity={identity} href="/goals/g1" />,
    );
    const pursuingText = document.querySelector(
      '[data-goal-story="g1"]',
    )!.textContent;
    unmount();

    renderIn(
      <GoalStoryRow
        story={story({ condition: "set_aside" })}
        identity={identity}
        href="/goals/g1"
      />,
    );
    const setAside = document.querySelector('[data-goal-story="g1"]')!;
    expect(
      within(setAside as HTMLElement).getByText("Set aside"),
    ).toBeInTheDocument();
    // Everything the machine said is still said, verbatim.
    expect(setAside.textContent).toContain(pursuingText!);
  });

  it("keeps movement and alignment as two signals, in the accessible name too", () => {
    renderIn(
      <GoalStoryRow
        story={story()}
        identity={identity}
        href="/goals/g1"
        showAlignment
      />,
    );
    const link = screen.getByRole("link", { name: /Reach 70 kg/ });
    const name = link.getAttribute("aria-label") ?? "";
    expect(name).toContain("Recent action");
    expect(name.toLowerCase()).toContain("moved");
  });
});

describe("the next-action row", () => {
  it("opens the canonical Task and offers no mutation", () => {
    renderIn(<NextActionLine task={{ id: "t1", title: "Book the physio" }} />);
    const link = screen.getByRole("link", { name: "Open Book the physio" });
    expect(link.getAttribute("href")).toContain("drawer=task%3At1");
    // A pointer, never a control: no checkbox, no button, nothing to press.
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("names the Project when the surface shows several", () => {
    renderIn(
      <NextActionLine
        task={{
          id: "t1",
          title: "Book the physio",
          projectId: "p1",
          projectTitle: "Speed work",
        }}
      />,
    );
    expect(
      screen.getByRole("link", { name: "Open Book the physio in Speed work" }),
    ).toBeInTheDocument();
  });

  it("renders LESS on a dense list, and SAYS so on a record", () => {
    const { unmount } = renderIn(<NextActionLine task={null} />);
    expect(document.body.textContent).not.toContain(NO_NEXT_ACTION_TEXT);
    unmount();

    renderIn(<NextActionLine task={null} absence="state" />);
    expect(screen.getByText(NO_NEXT_ACTION_TEXT)).toBeInTheDocument();
  });
});

describe("the guided Review's Goals step (DEBT-209)", () => {
  function alignmentContext(
    over: Partial<ReviewAlignmentContext> = {},
  ): ReviewAlignmentContext {
    return {
      goals: [
        {
          id: "g1",
          title: "Reach 70 kg",
          alignment: alignment!,
          contributingProjects: 2,
          activeContributingProjects: 1,
          story: { ...story(), iconKey: null, colourSlot: null },
        },
      ],
      goalsHasMore: false,
      areas: [],
      areasHasMore: false,
      projectsWithoutGoal: 0,
      activeProjectsConsidered: 0,
      unavailable: false,
      ...over,
    };
  }

  it("states measurement, movement, target and condition beside alignment", () => {
    renderIn(<AlignmentStep alignment={alignmentContext()} />);
    // The measurement, in the shared words and the shared value.
    expect(screen.getByText("On track")).toBeInTheDocument();
    expect(screen.getByText("79 / 70 kg")).toBeInTheDocument();
    // The target date, FORMATTED — not a raw ISO string.
    expect(screen.getByText("Target 31 Dec 2026")).toBeInTheDocument();
    // FOLLOW-02's movement sentence, from the shared component.
    expect(document.body.textContent).toMatch(/moved/i);
    // ADR-040's alignment, still there.
    expect(screen.getByText("Recent action")).toBeInTheDocument();
    // The contribution count the step has always shown.
    expect(
      screen.getByText("1 of 2 contributing Projects are active"),
    ).toBeInTheDocument();
  });

  it("makes a set-aside Goal distinguishable from a neglected one in the ritual", () => {
    const neglected = alignmentContext();
    renderIn(<AlignmentStep alignment={neglected} />);
    expect(screen.queryByText("Set aside")).not.toBeInTheDocument();

    const rested = alignmentContext({
      goals: [
        {
          ...neglected.goals[0]!,
          story: {
            ...neglected.goals[0]!.story,
            condition: "set_aside",
          },
        },
      ],
    });
    renderIn(<AlignmentStep alignment={rested} />);
    expect(screen.getAllByText("Set aside").length).toBeGreaterThan(0);
  });
});
